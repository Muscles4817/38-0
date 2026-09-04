// Splits players into batches for rating, carrying their assigned positions.
//
//   node scripts/plan-rating-batches.mjs --season "1992/93" [--size 45]
//   node scripts/plan-rating-batches.mjs --check              # validate what is filled in
//
// Writes data/raw/ratings/batch-NNN.json. A rating is per player-SEASON, so a
// player with four seasons gets four numbers in one pass — that is how the arc
// stays coherent rather than jittering between independent judgements.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { checkRatingEntry, ratingSpread } from './lib/rating-file.mjs';

const ROOT = process.cwd();
const PLAYERS = path.join(ROOT, 'data', 'raw', 'players.json');
const POSITIONS = path.join(ROOT, 'data', 'raw', 'positions');
const GAME_DATA = path.join(ROOT, 'src', 'data', 'game-data.json');
const OUT_DIR = path.join(ROOT, 'data', 'raw', 'ratings');

const args = process.argv.slice(2);
const value = name => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const BATCH_SIZE = Number(value('size') ?? 45);
const ONLY_SEASON = value('season');
const checkOnly = args.includes('--check');

const validRoles = fs.existsSync(GAME_DATA)
  ? JSON.parse(fs.readFileSync(GAME_DATA, 'utf8')).roles.map(r => r.name)
  : null;

function batchFiles() {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs.readdirSync(OUT_DIR).filter(f => /^batch-\d+\.json$/.test(f)).sort();
}

// ── Check ────────────────────────────────────────────────────────────────────

if (checkOnly) {
  const all = [];
  const problems = [];
  const warnings = [];
  let rated = 0, unrated = 0;

  for (const f of batchFiles()) {
    const batch = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
    for (const p of batch.players) {
      const done = (p.seasons ?? []).every(s => typeof s.rating === 'number');
      if (!done) { unrated++; continue; }
      rated++;
      all.push(p);
      const r = checkRatingEntry(p, { validRoles });
      problems.push(...r.problems.map(m => `${f}: ${m}`));
      warnings.push(...r.warnings.map(m => `${f}: ${m}`));
    }
  }

  console.log(`${rated} players rated, ${unrated} not yet, across ${batchFiles().length} batch(es).`);
  const spread = ratingSpread(all);
  if (spread) {
    console.log(`\n${spread.count} player-seasons  min ${spread.min}  median ${spread.median}` +
      `  mean ${spread.mean}  max ${spread.max}`);
    console.log('  ' + Object.entries(spread.bands)
      .map(([k, v]) => `${k}: ${v}`).join('   '));
  }
  if (warnings.length) {
    console.log(`\n${warnings.length} explained swing(s):`);
    for (const w of warnings.slice(0, 15)) console.log(`  ${w}`);
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems.slice(0, 30)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log('\nNo problems.');
  process.exit(0);
}

// ── Plan ─────────────────────────────────────────────────────────────────────

const { players } = JSON.parse(fs.readFileSync(PLAYERS, 'utf8'));

// Positions were resolved in the previous phase; carry them through so ratings
// are judged with the player's actual role in view.
const positionOf = new Map();
if (fs.existsSync(POSITIONS)) {
  for (const f of fs.readdirSync(POSITIONS).filter(x => /^batch-\d+\.json$/.test(x))) {
    for (const p of JSON.parse(fs.readFileSync(path.join(POSITIONS, f), 'utf8')).players) {
      if (Array.isArray(p.positions) && p.positions.length) {
        positionOf.set(p.fbrefId ?? p.name, p.positions);
      }
    }
  }
}

// Carry forward every rating that exists, not only those of players who are
// finished.
//
// This once required a player to be COMPLETELY rated before his numbers were
// kept. That is fine the first time and destroys work the second: adding a new
// season gives everybody an unrated row, so nobody qualifies, and the next
// re-plan silently discards the lot. It cost 1,574 hand-made ratings, which
// were only noticed because the preserved count was compared with the previous
// run's. A rating is finished work whether or not the player is.
const existing = new Map();
for (const f of batchFiles()) {
  for (const p of JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8')).players) {
    if ((p.seasons ?? []).some(s => typeof s.rating === 'number')) {
      existing.set(p.fbrefId ?? p.name, p);
    }
  }
}

const wanted = players.filter(p =>
  !ONLY_SEASON || p.seasons.some(s => s.season === ONLY_SEASON));

fs.mkdirSync(OUT_DIR, { recursive: true });

const batches = [];
for (let i = 0; i < wanted.length; i += BATCH_SIZE) batches.push(wanted.slice(i, i + BATCH_SIZE));

let missingPositions = 0;
batches.forEach((group, index) => {
  const rows = group.map(p => {
    const key = p.fbrefId ?? p.name;
    const prior = existing.get(key);
    const positions = positionOf.get(key) ?? [];
    if (positions.length === 0) missingPositions++;
    return {
      fbrefId: p.fbrefId,
      name: p.name,
      nation: p.nation,
      positions,
      confidence: prior?.confidence ?? null,
      seasons: p.seasons.map(s => {
        const before = prior?.seasons?.find(x => x.season === s.season && x.club === s.club);
        return {
          season: s.season,
          club: s.club,
          age: s.age,
          minutes: s.minutes,
          starts: s.starts,
          goals: s.goals,
          assists: s.assists,
          // Filled in by the rating pass.
          rating: before?.rating ?? null,
          roles: before?.roles ?? [],
          note: before?.note ?? null,
        };
      }),
    };
  });

  fs.writeFileSync(path.join(OUT_DIR, `batch-${String(index + 1).padStart(3, '0')}.json`),
    JSON.stringify({
      batch: index + 1,
      of: batches.length,
      instructions: 'See docs/ratings.md. Give every season a rating on the ' +
        'absolute scale. Rate the player that season, never their career.',
      players: rows,
    }, null, 2) + '\n', 'utf8');
});

const seasonCount = wanted.reduce((n, p) => n + p.seasons.length, 0);
console.log(`${batches.length} batch(es) of up to ${BATCH_SIZE}: ` +
  `${wanted.length} players, ${seasonCount} player-seasons to rate.`);
if (missingPositions) {
  console.log(`${missingPositions} player(s) have no assigned position yet.`);
}
console.log(`Wrote stubs to ${path.relative(ROOT, OUT_DIR)}`);
