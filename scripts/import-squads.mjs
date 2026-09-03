// Imports the squad staging files in data/squads/ into the local SQLite
// database, then leaves you to run `npm run export:data`.
//
//   node scripts/import-squads.mjs [--dry-run] [glob-ish path filter]
//
// Idempotent: re-running with unchanged files leaves the database unchanged.
// A club-season present in a staging file is replaced wholesale, so deleting a
// player from the file removes them from the squad.
//
// Agents write staging files. Only this script writes to the database.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { validateSquadFile, validateAcrossFiles, playerKey } from './lib/squad-file.mjs';

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, 'data', '38-0.db');
const SQUADS_DIR = path.join(ROOT, 'data', 'squads');
const CLUBS_PATH = path.join(ROOT, 'data', 'clubs.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const filter = args.find(a => !a.startsWith('--'));

// ── Load staging files ───────────────────────────────────────────────────────

function readSquadFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readSquadFiles(full));
    else if (entry.name.endsWith('.json')) {
      // Compare with forward slashes on every platform, so a filter like
      // "data/squads/1996-97" matches the backslashes path.relative gives
      // on Windows.
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      if (filter && !rel.includes(filter.split(path.sep).join('/'))) continue;
      try {
        out.push({ path: rel, data: JSON.parse(fs.readFileSync(full, 'utf8')) });
      } catch (e) {
        out.push({ path: rel, data: null, parseError: e.message });
      }
    }
  }
  return out;
}

const files = readSquadFiles(SQUADS_DIR);
if (files.length === 0) {
  console.error(`No squad files found under ${path.relative(ROOT, SQUADS_DIR)}.`);
  process.exit(1);
}

// ── Validate ─────────────────────────────────────────────────────────────────

const allErrors = [];
const allWarnings = [];
for (const f of files) {
  if (f.parseError) { allErrors.push(`${f.path}: invalid JSON — ${f.parseError}`); continue; }
  const { errors, warnings } = validateSquadFile(f.data, { label: f.path });
  allErrors.push(...errors);
  allWarnings.push(...warnings);
}
allErrors.push(...validateAcrossFiles(files.filter(f => f.data)));

for (const w of allWarnings) console.warn(`warning  ${w}`);
if (allErrors.length) {
  console.error(`\n${allErrors.length} error(s); nothing was imported:\n`);
  for (const e of allErrors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${files.length} file(s) valid${allWarnings.length ? `, ${allWarnings.length} warning(s)` : ''}.`);

if (dryRun) {
  const total = files.reduce((n, f) => n + f.data.players.length, 0);
  console.log(`Dry run: would import ${total} player-seasons across ${files.length} club-seasons.`);
  process.exit(0);
}

// ── Import ───────────────────────────────────────────────────────────────────

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}. Run "npm run dev" and open /editor once to create it.`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// A players row is one human. Matching them by name was always a compromise:
// it merges two different David Smiths into one person, and the three-level
// model then hangs both men's versions off a single player. The FBref id is
// the real identity where a file carries one, so store it.
const hasFbrefId = db.prepare('PRAGMA table_info(players)').all()
  .some(c => c.name === 'fbref_id');
if (!hasFbrefId) {
  db.exec('ALTER TABLE players ADD COLUMN fbref_id TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS players_fbref_id ON players(fbref_id) ' +
    'WHERE fbref_id IS NOT NULL');
  console.log('  + players.fbref_id');
}

const clubMeta = fs.existsSync(CLUBS_PATH)
  ? JSON.parse(fs.readFileSync(CLUBS_PATH, 'utf8'))
  : {};

const findClub = db.prepare('SELECT id FROM clubs WHERE name = ?');
const insertClub = db.prepare('INSERT INTO clubs (name, short_name, color, league) VALUES (?, ?, ?, ?)');
const findSeason = db.prepare('SELECT id FROM seasons WHERE label = ?');
const insertSeason = db.prepare('INSERT INTO seasons (label, year_start) VALUES (?, ?)');
const allPlayers = db.prepare('SELECT id, name, nationality, fbref_id FROM players');
const insertPlayer = db.prepare(
  'INSERT INTO players (name, nationality, fbref_id) VALUES (?, ?, ?)'
);
const setFbrefId = db.prepare('UPDATE players SET fbref_id = ? WHERE id = ?');
const setNationality = db.prepare('UPDATE players SET nationality = ? WHERE id = ?');
const insertVersion = db.prepare(
  'INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)'
);
const insertEntry = db.prepare(
  'INSERT INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)'
);
const entriesFor = db.prepare(
  'SELECT se.id, se.player_version_id FROM squad_entries se WHERE se.club_id = ? AND se.season_id = ?'
);
const deleteEntry = db.prepare('DELETE FROM squad_entries WHERE id = ?');
const deleteVersion = db.prepare('DELETE FROM player_versions WHERE id = ?');

function clubId(name) {
  const row = findClub.get(name);
  if (row) return row.id;
  const meta = clubMeta[name] ?? {};
  const short = meta.shortName ?? name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  const info = insertClub.run(name, short, meta.color ?? '#888888', meta.league ?? 'PL');
  console.log(`  + club ${name}${meta.color ? '' : ' (no colour in data/clubs.json, using grey)'}`);
  return Number(info.lastInsertRowid);
}

function seasonId(label) {
  const row = findSeason.get(label);
  if (row) return row.id;
  const info = insertSeason.run(label, Number(label.slice(0, 4)));
  return Number(info.lastInsertRowid);
}

// One players row per human, across every season and club. Lookup is by
// accent-insensitive key so "Srnicek" and "Srnicek" do not become two people.
const playersByKey = new Map();
const playersById = new Map();
for (const row of allPlayers.all()) {
  const key = playerKey(row.name);
  if (!playersByKey.has(key)) playersByKey.set(key, row);
  if (row.fbref_id) playersById.set(row.fbref_id, row);
}

// The seed rows predate the pipeline and many carry no nationality at all. A
// file that knows one fills the gap. A file that disagrees with a value already
// there does not overwrite it — that is a conflict, and it warns instead.
function fillNationality(row, nationality) {
  if (row.nationality || !nationality) return;
  setNationality.run(nationality, row.id);
  row.nationality = nationality;
}

function playerId(name, nationality, fbrefId) {
  // The id wins outright when we have it.
  if (fbrefId && playersById.has(fbrefId)) {
    const hit = playersById.get(fbrefId);
    fillNationality(hit, nationality);
    return hit.id;
  }

  const key = playerKey(name);
  const row = playersByKey.get(key);

  // A name match against a row that already holds a *different* id is two
  // people with the same name, not one person. Make a new row.
  if (row && fbrefId && row.fbref_id && row.fbref_id !== fbrefId) {
    const id = Number(insertPlayer.run(name, nationality, fbrefId).lastInsertRowid);
    console.log(`  + "${name}" is a second player of that name (${fbrefId})`);
    playersById.set(fbrefId, { id, name, nationality, fbref_id: fbrefId });
    return id;
  }

  // A name match against a row with no id yet is the hand-written seasons
  // meeting the pipeline for the first time. Same person; record the id.
  if (row && fbrefId && !row.fbref_id) {
    setFbrefId.run(fbrefId, row.id);
    row.fbref_id = fbrefId;
    playersById.set(fbrefId, row);
  }

  if (row) {
    fillNationality(row, nationality);
    if (row.name !== name) {
      console.warn(`warning  "${name}" matched existing player "${row.name}"`);
    }
    if (row.nationality && nationality && row.nationality !== nationality) {
      console.warn(
        `warning  "${name}" is recorded as ${row.nationality} but this file says ` +
        `${nationality}. Treating them as the same person.`
      );
    }
    return row.id;
  }
  const id = Number(insertPlayer.run(name, nationality, fbrefId ?? null).lastInsertRowid);
  const made = { id, name, nationality, fbref_id: fbrefId ?? null };
  playersByKey.set(key, made);
  if (fbrefId) playersById.set(fbrefId, made);
  return id;
}

let clubSeasons = 0, playerSeasons = 0, newPlayers = 0;
const before = db.prepare('SELECT COUNT(*) AS c FROM players').get().c;

const run = db.transaction(() => {
  for (const { data } of files) {
    const cid = clubId(data.club);
    const sid = seasonId(data.season);

    // Replace the club-season wholesale so removals in the file take effect.
    for (const existing of entriesFor.all(cid, sid)) {
      deleteEntry.run(existing.id);
      deleteVersion.run(existing.player_version_id);
    }

    for (const p of data.players) {
      const pid = playerId(p.name.trim(), p.nationality.trim(), p.fbrefId ?? null);
      const vid = insertVersion.run(
        pid,
        data.season,
        p.rating,
        JSON.stringify(p.positions),
        JSON.stringify(p.roles ?? []),
      ).lastInsertRowid;
      insertEntry.run(cid, sid, Number(vid));
      playerSeasons++;
    }
    clubSeasons++;
  }
});

run();
newPlayers = db.prepare('SELECT COUNT(*) AS c FROM players').get().c - before;

console.log(
  `\nImported ${playerSeasons} player-seasons across ${clubSeasons} club-seasons ` +
  `(${newPlayers} new player${newPlayers === 1 ? '' : 's'}).`
);
console.log('Run "npm run export:data" to refresh the snapshot the game ships with.');
