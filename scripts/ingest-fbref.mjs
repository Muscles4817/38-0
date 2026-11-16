// Turns the pasted FBref exports into the normalised roster files every later
// phase reads.
//
//   node scripts/ingest-fbref.mjs                    # all filled-in exports
//   node scripts/ingest-fbref.mjs --min-minutes 180  # looser squad inclusion
//   node scripts/ingest-fbref.mjs --dry-run
//
// Reads  data/raw/fbref/<competition>/<season>/<club>.csv
// Writes data/raw/rosters/<season>/<club>.json
//
// Inclusion is by minutes played, not appearance count: three substitute
// cameos of four minutes each is not a squad member, while a rotation player
// who started six games is. 270 minutes is three full matches.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFbrefCsv, positionBuckets } from './lib/fbref-csv.mjs';

const ROOT = process.cwd();
const IN_DIR = path.join(ROOT, 'data', 'raw', 'fbref');
const OUT_DIR = path.join(ROOT, 'data', 'raw', 'rosters');
const CLUBS = path.join(ROOT, 'data', 'clubs.json');

const args = process.argv.slice(2);
const flagValue = name => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const MIN_MINUTES = Number(flagValue('min-minutes') ?? 270);
const dryRun = args.includes('--dry-run');

const clubsMeta = fs.existsSync(CLUBS) ? JSON.parse(fs.readFileSync(CLUBS, 'utf8')) : {};
const aliases = clubsMeta._aliases ?? {};
const canonicalClub = name => aliases[name] ?? name;

/** "manchester-united" -> "Manchester United", corrected via the alias map. */
function clubNameFromSlug(slug, manifest, season) {
  const fromManifest = manifest?.seasons?.[season]?.find(c => c.slug === slug);
  if (fromManifest) return canonicalClub(fromManifest.name);
  return canonicalClub(slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '));
}

function findCsvs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findCsvs(full));
    else if (entry.name.endsWith('.csv') && fs.statSync(full).size > 0) out.push(full);
  }
  return out;
}

const files = findCsvs(IN_DIR);
if (files.length === 0) {
  console.error('No filled-in exports found. Paste into the files under data/raw/fbref/.');
  process.exit(1);
}

// ── Two club-seasons holding the same export ─────────────────────────────────
//
// These files are pasted in by hand, one club at a time, and the obvious slip
// is to paste an export into the wrong file — or into the right file and then
// the next one as well. Nothing downstream can tell: both club-seasons parse,
// both validate, and the squads look reasonable because they ARE a real squad,
// just the wrong club's.
//
// It is also quietly destructive. The two clubs then share every player at
// identical minutes, and build-squad-files assigns a player to whichever club
// played him more — so a tie hands all of them to whichever file sorts first
// and leaves the other club with nobody.
//
// 1991/92 Juventus arrived as a byte-for-byte copy of that season's AC Milan.
// Two reviewers noticed by chance; this notices every time.
const byContent = new Map();
for (const file of files) {
  const digest = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  if (!byContent.has(digest)) byContent.set(digest, []);
  byContent.get(digest).push(path.relative(IN_DIR, file).split(path.sep).join('/'));
}
const duplicated = [...byContent.values()].filter(group => group.length > 1);

// Every file in a duplicated group is skipped, not just the later one: only one
// of them can be right and nothing here can tell which, so writing either would
// be a guess. The rest of the collection still ingests, because one mispaste
// should not hold up the other four hundred club-seasons.
const skip = new Set(duplicated.flat());

let written = 0, players = 0, dropped = 0;
const problems = [];
const summary = [];

for (const group of duplicated) {
  problems.push(
    `${group.join(' == ')}: the same export is in all of these, so only one can be ` +
    `right and none was ingested. Paste the correct export over the others, or ` +
    `empty them.`
  );
}

for (const file of files) {
  const rel = path.relative(IN_DIR, file).split(path.sep);
  if (rel.length !== 3) { problems.push(`${file}: expected <competition>/<season>/<club>.csv`); continue; }
  if (skip.has(rel.join('/'))) continue;
  const [competition, seasonDir, clubFile] = rel;
  const season = seasonDir.replace('-', '/');
  const slug = clubFile.replace(/\.csv$/, '');

  const manifestPath = path.join(IN_DIR, competition, 'seasons.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : null;
  const club = clubNameFromSlug(slug, manifest, season);

  let parsed;
  try {
    parsed = parseFbrefCsv(fs.readFileSync(file, 'utf8'), { competition, season, club });
  } catch (e) {
    problems.push(`${rel.join('/')}: ${e.message}`);
    continue;
  }
  for (const w of parsed.warnings) problems.push(`${rel.join('/')}: ${w}`);

  const squad = [];
  const excluded = [];
  for (const p of parsed.players) {
    const row = {
      name: p.name,
      fbrefId: p.fbrefId,
      nation: p.nation,
      age: p.age,
      fbrefPosition: p.positionLabel,
      positionBuckets: positionBuckets(p.positionLabel),
      matchesPlayed: p.matchesPlayed,
      starts: p.starts,
      minutes: p.minutes,
      goals: p.goals,
      assists: p.assists,
    };
    if (p.minutes >= MIN_MINUTES) squad.push(row);
    else excluded.push({ ...row, reason: `${p.minutes} minutes, below ${MIN_MINUTES}` });
  }

  if (squad.length < 11) {
    problems.push(`${rel.join('/')}: only ${squad.length} players clear ${MIN_MINUTES} minutes`);
  }
  if (!squad.some(p => p.positionBuckets.includes('GK'))) {
    problems.push(`${rel.join('/')}: no goalkeeper clears the threshold`);
  }

  players += squad.length;
  dropped += excluded.length;
  summary.push({ season, club, squad: squad.length, excluded: excluded.length });

  if (!dryRun) {
    const outDir = path.join(OUT_DIR, seasonDir);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify({
      club, clubSlug: slug, competition, season,
      source: path.relative(ROOT, file).split(path.sep).join('/'),
      sourceName: 'FBref standard stats export',
      threshold: { minMinutes: MIN_MINUTES },
      ingestedAt: new Date().toISOString(),
      squad, excluded,
    }, null, 2) + '\n', 'utf8');
    written++;
  }
}

// ── Rosters whose source is gone ─────────────────────────────────────────────
//
// A roster file is derived, so this directory should say exactly what the CSVs
// say and nothing more. It did not: emptying a source file, or having it
// skipped as a duplicate, left the roster written by an earlier run sitting
// there, and `build-player-list.mjs` kept reading it. The 1991/92 Juventus
// squad went on existing — as a copy of Milan's — after the export behind it
// had been withdrawn.
//
// Each roster records the file it came from, so the check is exact rather than
// a guess at which club-seasons ought to exist.
const stale = [];
if (fs.existsSync(OUT_DIR)) {
  for (const seasonDir of fs.readdirSync(OUT_DIR)) {
    const dir = path.join(OUT_DIR, seasonDir);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
      const file = path.join(dir, f);
      let source = null;
      try { source = JSON.parse(fs.readFileSync(file, 'utf8')).source; } catch { /* unreadable */ }
      const abs = source ? path.join(ROOT, source) : null;
      const alive = abs && fs.existsSync(abs) && fs.statSync(abs).size > 0 &&
        !skip.has(path.relative(IN_DIR, abs).split(path.sep).join('/'));
      if (!alive) {
        stale.push(path.relative(ROOT, file).split(path.sep).join('/'));
        if (!dryRun) fs.rmSync(file);
      }
    }
  }
}

console.table(summary);
console.log(
  `${dryRun ? 'Would write' : 'Wrote'} ${dryRun ? summary.length : written} roster file(s): ` +
  `${players} players in, ${dropped} below ${MIN_MINUTES} minutes.`
);
if (stale.length) {
  console.log(
    `
Removed ${stale.length} roster file(s) whose export is empty or skipped:`);
  for (const f of stale) console.log(`  ${f}`);
}
if (problems.length) {
  console.log('\nproblems:');
  for (const p of problems) console.log(`  ${p}`);
}
