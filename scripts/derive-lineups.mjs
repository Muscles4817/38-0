// Derives a starting XI and a formation for every club-season in the database.
//
//   npm run derive:lineups -- [--dry-run] [--overwrite] [--season 2007/08]
//
// Formation is derived, not researched. Once players have positions the shape
// falls out of who actually played: take the squad, and find the formation
// whose eleven slots they fill best. That is reproducible and auditable, which
// a shape recalled by an agent is neither.
//
// This runs the game's own `bestFormation` rather than a copy of it. A second
// implementation would drift from the one the game and CI use, and a derived
// formation is only worth having if it is the same derivation — see
// scripts/lib/ts-hooks.mjs for how a plain node script imports the TypeScript.
//
// Minutes come from the roster files: the database records appearances but not
// minutes, and minutes are the better answer to "who actually played". A player
// with no roster row falls back to his rating, which is what the in-game
// fallback in `bestXI` uses when it has nothing better.
//
// Existing lineups are LEFT ALONE unless --overwrite is passed. Nineteen of
// them were verified by hand after the 2025/26 lineup problems recorded in
// docs/known-issues.md, and a fresh derivation is not a reason to discard that.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { bestFormation, equallyGoodFormations } from '../src/lib/lineupFit.ts';
import { FORMATIONS } from '../src/lib/formations.ts';

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, 'data', '38-0.db');
const ROSTERS = path.join(ROOT, 'data', 'raw', 'rosters');

const args = process.argv.slice(2);
const value = n => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };
const dryRun = args.includes('--dry-run');
const overwrite = args.includes('--overwrite');
const ONLY_SEASON = value('season');

// ── Minutes, from the roster files ───────────────────────────────────────────

const squadKey = (season, club) => `${season}|${club}`;
const minutesBySquad = new Map();

if (fs.existsSync(ROSTERS)) {
  for (const seasonDir of fs.readdirSync(ROSTERS)) {
    const dir = path.join(ROSTERS, seasonDir);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
      const roster = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const minutes = new Map();
      for (const p of roster.squad) if (p.fbrefId) minutes.set(p.fbrefId, p.minutes ?? 0);
      minutesBySquad.set(squadKey(roster.season, roster.club), minutes);
    }
  }
}

// ── Squads, from the database ────────────────────────────────────────────────

const db = new Database(DB_PATH);

const squadRows = db.prepare(`
  SELECT c.id AS clubId, c.name AS club, s.id AS seasonId, s.label AS season,
         p.id AS playerId, p.name AS name, p.fbref_id AS fbrefId,
         pv.rating AS rating, pv.positions AS positions
  FROM squad_entries se
  JOIN clubs c            ON c.id  = se.club_id
  JOIN seasons s          ON s.id  = se.season_id
  JOIN player_versions pv ON pv.id = se.player_version_id
  JOIN players p          ON p.id  = pv.player_id
`).all();

const squads = new Map();
for (const r of squadRows) {
  if (ONLY_SEASON && r.season !== ONLY_SEASON) continue;
  const k = `${r.clubId}|${r.seasonId}`;
  if (!squads.has(k)) {
    squads.set(k, {
      clubId: r.clubId, club: r.club,
      seasonId: r.seasonId, season: r.season,
      players: [],
    });
  }
  let positions = [];
  try { positions = JSON.parse(r.positions); } catch { positions = []; }
  squads.get(k).players.push({
    playerId: r.playerId, name: r.name, fbrefId: r.fbrefId,
    rating: r.rating, positions,
  });
}

const existing = new Map();
for (const l of db.prepare('SELECT id, club_id, season_id FROM team_lineups').all()) {
  existing.set(`${l.club_id}|${l.season_id}`, l.id);
}

// ── Derive ───────────────────────────────────────────────────────────────────

const insertLineup = db.prepare(
  'INSERT INTO team_lineups (club_id, season_id, formation) VALUES (?, ?, ?)');
const deleteLineup = db.prepare('DELETE FROM team_lineups WHERE id = ?');
const insertSlot = db.prepare(
  'INSERT INTO lineup_slots (lineup_id, slot_index, player_id) VALUES (?, ?, ?)');

let keptExisting = 0, tooFew = 0, unfillable = 0;
const shapes = {};
const ties = [];
const problems = [];
const work = [];

for (const squad of squads.values()) {
  const k = `${squad.clubId}|${squad.seasonId}`;
  if (existing.has(k) && !overwrite) { keptExisting++; continue; }

  if (squad.players.length < 11) {
    tooFew++;
    problems.push(`${squad.season} ${squad.club}: only ${squad.players.length} in the squad`);
    continue;
  }

  const minutes = minutesBySquad.get(squadKey(squad.season, squad.club)) ?? new Map();
  const fittable = squad.players.map(p => ({
    name: p.name,
    positions: p.positions,
    minutes: minutes.get(p.fbrefId) ?? p.rating,
  }));

  const fit = bestFormation(fittable);
  if (fit.filled < 11) {
    unfillable++;
    problems.push(
      `${squad.season} ${squad.club}: best fit ${fit.formation} fills only ${fit.filled}/11`);
    continue;
  }

  // Names are unique within a club-season — the importer enforces it — so this
  // is a safe way back from the fit to the database row.
  const byName = new Map(squad.players.map(p => [p.name, p]));
  const slots = fit.slots.map(s => ({
    slotIndex: s.slotIndex,
    playerId: byName.get(s.player.name).playerId,
  }));

  const tied = equallyGoodFormations(fittable);
  if (tied.length > 1) ties.push(`${squad.season} ${squad.club}: ${tied.join(' / ')}`);

  shapes[fit.formation] = (shapes[fit.formation] ?? 0) + 1;
  work.push({ ...squad, formation: fit.formation, slots, existingId: existing.get(k) ?? null });
}

const apply = db.transaction(items => {
  for (const item of items) {
    if (item.existingId) deleteLineup.run(item.existingId);   // cascades to its slots
    const { lastInsertRowid } = insertLineup.run(item.clubId, item.seasonId, item.formation);
    for (const s of item.slots) insertSlot.run(lastInsertRowid, s.slotIndex, s.playerId);
  }
});

if (!dryRun) apply(work);

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`${work.length} lineup(s) ${dryRun ? 'would be ' : ''}written.`);
console.log(`${keptExisting} left alone (already stored; pass --overwrite to replace).`);
if (tooFew) console.log(`${tooFew} club-season(s) have fewer than eleven players.`);
if (unfillable) console.log(`${unfillable} club-season(s) could not fill any shape.`);

if (Object.keys(shapes).length) {
  console.log('\nShapes derived:');
  for (const [name, n] of Object.entries(shapes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(16)} ${String(n).padStart(4)}` +
      (FORMATIONS[name] ? '' : '   (unknown formation!)'));
  }
}

if (ties.length) {
  console.log(`\n${ties.length} club-season(s) where two shapes fit equally well:`);
  for (const t of ties.slice(0, 15)) console.log(`  ${t}`);
  if (ties.length > 15) console.log(`  … +${ties.length - 15}`);
}
if (problems.length) {
  console.log(`\n${problems.length} club-season(s) left without a derived lineup:`);
  for (const p of problems.slice(0, 25)) console.log(`  ${p}`);
  if (problems.length > 25) console.log(`  … +${problems.length - 25}`);
}
if (dryRun) console.log('\nDry run; the database was not touched.');
