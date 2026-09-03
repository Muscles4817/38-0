// Splits the canonical player list into batches for position lookup.
//
//   node scripts/plan-position-batches.mjs [--size 25] [--min-minutes 0]
//   node scripts/plan-position-batches.mjs --status
//
// Writes data/raw/positions/batch-NNN.json — a stub per batch, each holding the
// players to look up and everything already known about them. An agent fills in
// `positions` and nothing else.
//
// Batching by player rather than by club-season is deliberate. Recurrence
// between seasons is about 70%, so one lookup for a twenty-season career serves
// all twenty; doing it per club-season would repeat the same work three times
// over. Separate files mean agents can work in parallel without colliding.
//
// Batches are ordered by minutes played, so the players who matter most to the
// game are resolved first and the work can stop early with the best coverage.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { allowedPositions, primaryPositions, ambiguity } from './lib/positions.mjs';

const ROOT = process.cwd();
const PLAYERS = path.join(ROOT, 'data', 'raw', 'players.json');
const OUT_DIR = path.join(ROOT, 'data', 'raw', 'positions');

const args = process.argv.slice(2);
const value = name => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const BATCH_SIZE = Number(value('size') ?? 25);
const MIN_MINUTES = Number(value('min-minutes') ?? 0);
// Restrict to players who appeared in one season, so a season can be completed
// and costed on its own rather than the whole database at once.
const ONLY_SEASON = value('season');
const statusOnly = args.includes('--status');

if (!fs.existsSync(PLAYERS)) {
  console.error('No player list. Run scripts/build-player-list.mjs first.');
  process.exit(1);
}
const { players } = JSON.parse(fs.readFileSync(PLAYERS, 'utf8'));

// ── Status ───────────────────────────────────────────────────────────────────

function batchFiles() {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs.readdirSync(OUT_DIR).filter(f => /^batch-\d+\.json$/.test(f)).sort();
}

if (statusOnly) {
  const files = batchFiles();
  let done = 0, total = 0;
  for (const f of files) {
    const b = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
    for (const p of b.players) {
      total++;
      if (Array.isArray(p.positions) && p.positions.length > 0) done++;
    }
  }
  const pct = total ? ((done / total) * 100).toFixed(1) : '0.0';
  console.log(`${done} of ${total} players have positions (${pct}%), across ${files.length} batches.`);
  const next = files.find(f => {
    const b = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
    return b.players.some(p => !Array.isArray(p.positions) || p.positions.length === 0);
  });
  console.log(next ? `Next batch: ${next}` : 'All batches complete.');
  process.exit(0);
}

// ── Plan ─────────────────────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

// Anything already assigned is preserved, so re-planning after more seasons
// arrive does not throw away completed work.
const existing = new Map();
for (const f of batchFiles()) {
  const b = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
  for (const p of b.players) {
    if (Array.isArray(p.positions) && p.positions.length) {
      existing.set(p.fbrefId ?? p.name, p);
    }
  }
}

const wanted = players.filter(p =>
  p.totalMinutes >= MIN_MINUTES &&
  (!ONLY_SEASON || p.seasons.some(x => x.season === ONLY_SEASON)));
const batches = [];
for (let i = 0; i < wanted.length; i += BATCH_SIZE) {
  batches.push(wanted.slice(i, i + BATCH_SIZE));
}

let carried = 0;
batches.forEach((group, index) => {
  const file = path.join(OUT_DIR, `batch-${String(index + 1).padStart(3, '0')}.json`);
  const rows = group.map(p => {
    const label = p.seasons[0]?.fbrefPosition ?? null;
    const prior = existing.get(p.fbrefId ?? p.name);
    if (prior) carried++;
    return {
      fbrefId: p.fbrefId,
      name: p.name,
      nation: p.nation,
      // Everything the source already established, so the lookup is only ever
      // choosing within what FBref recorded.
      fbrefPosition: label,
      allowed: allowedPositions(label),
      primaryMustBeOneOf: primaryPositions(label),
      choices: ambiguity(label),
      totalMinutes: p.totalMinutes,
      seasons: p.seasons.map(s => ({
        season: s.season, club: s.club, minutes: s.minutes,
        starts: s.starts, goals: s.goals, assists: s.assists,
        fbrefPosition: s.fbrefPosition,
      })),
      // Filled in by the lookup. Most natural position first.
      positions: prior?.positions ?? [],
      confidence: prior?.confidence ?? null,
      note: prior?.note ?? null,
      // Only for a player who genuinely changed role between seasons.
      perSeason: prior?.perSeason ?? undefined,
    };
  });

  fs.writeFileSync(file, JSON.stringify({
    batch: index + 1,
    of: batches.length,
    instructions: 'See docs/positions-lookup.md. Fill in "positions" for each ' +
      'player, most natural first, using only values from "allowed". The first ' +
      'must come from "primaryMustBeOneOf". Set confidence to high, medium or low.',
    players: rows,
  }, null, 2) + '\n', 'utf8');
});

const unresolved = wanted.length - carried;
console.log(`${batches.length} batch(es) of up to ${BATCH_SIZE}, covering ${wanted.length} players.`);
console.log(`${carried} already assigned, ${unresolved} still to look up.`);
console.log(`\nBy how much choice the FBref label leaves:`);
const spread = {};
for (const p of wanted) {
  const n = ambiguity(p.seasons[0]?.fbrefPosition);
  spread[n] = (spread[n] ?? 0) + 1;
}
for (const [n, count] of Object.entries(spread).sort((a, b) => a[0] - b[0])) {
  console.log(`  ${String(n).padStart(2)} option(s)  ${String(count).padStart(4)} players` +
    (n === '1' ? '  (goalkeepers — nothing to decide)' : ''));
}
console.log(`\nWrote stubs to ${path.relative(ROOT, OUT_DIR)}`);
