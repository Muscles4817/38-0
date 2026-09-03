// Builds the canonical player list: one entry per human, with every
// club-season they need a rating for.
//
//   node scripts/build-player-list.mjs
//   node scripts/build-player-list.mjs --report      # sizing, no write
//
// Reads  data/raw/rosters/<season>/<club>.json
// Writes data/raw/players.json
//
// Identity comes from the FBref player id, which is stable across clubs and
// seasons. That is the whole reason this phase exists as a script rather than a
// reconciliation problem: names are spelled differently by different sources
// and different people, ids are not.
//
// The output is what the ratings phase is batched from — one agent takes a
// player and rates their whole career in a single pass, so the arc is coherent
// rather than twenty independent guesses.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildPlayerList } from './lib/player-list.mjs';

const ROOT = process.cwd();
const ROSTERS = path.join(ROOT, 'data', 'raw', 'rosters');
const OUT = path.join(ROOT, 'data', 'raw', 'players.json');

const reportOnly = process.argv.includes('--report');

function rosterFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return rosterFiles(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });
}

const files = rosterFiles(ROSTERS);
if (files.length === 0) {
  console.error('No roster files. Run scripts/ingest-fbref.mjs first.');
  process.exit(1);
}

const rosters = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const seasonsSeen = new Set(rosters.map(r => r.season));
const { players: list, playerSeasons, idless } = buildPlayerList(rosters);

// ── Report ───────────────────────────────────────────────────────────────────

const bySeasonCount = {};
for (const p of list) {
  const bucket = p.seasonCount >= 10 ? '10+' : p.seasonCount >= 5 ? '5-9' : String(p.seasonCount);
  bySeasonCount[bucket] = (bySeasonCount[bucket] ?? 0) + 1;
}

console.log(`rosters read      ${files.length} club-season(s) across ${seasonsSeen.size} season(s)`);
console.log(`player-seasons    ${playerSeasons}`);
console.log(`distinct players  ${list.length}`);
console.log(`seasons/player    ${(playerSeasons / list.length).toFixed(2)} average`);
console.log(`\nplayers by number of seasons:`);
for (const k of ['1', '2', '3', '4', '5-9', '10+']) {
  if (bySeasonCount[k]) console.log(`  ${k.padEnd(4)} ${bySeasonCount[k]}`);
}
console.log(`\nplayers appearing at two clubs in one season: ` +
  `${list.filter(p => p.transferSeasons.length).length}`);
if (idless.length) {
  console.log(`\nrows without an FBref id (${idless.length}), matched by name instead:`);
  for (const x of idless.slice(0, 10)) console.log(`  ${x}`);
}

console.log(`\nmost minutes so far:`);
for (const p of list.slice(0, 8)) {
  console.log(`  ${p.name.padEnd(24)} ${String(p.totalMinutes).padStart(6)} min  ` +
    `${p.seasonCount} season(s)  ${p.firstSeason}${p.seasonCount > 1 ? `-${p.lastSeason}` : ''}`);
}

// Extrapolation is only meaningful once a few full seasons are in.
if (seasonsSeen.size >= 2) {
  const perClubSeason = list.length / files.length;
  console.log(
    `\nAt ${perClubSeason.toFixed(1)} new players per club-season this sample implies ` +
    `roughly ${Math.round(perClubSeason * 686).toLocaleString()} player rows for all 686 ` +
    `— an overestimate, since players recur across clubs and seasons far more once ` +
    `whole seasons are present.`
  );
}

if (reportOnly) process.exit(0);

fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  rosterFiles: files.length,
  seasons: [...seasonsSeen].sort(),
  playerSeasons,
  distinctPlayers: list.length,
  players: list,
}, null, 2) + '\n', 'utf8');

console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
