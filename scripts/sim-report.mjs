// Plays one club-season's XI through many seasons and reports what the
// simulation did with it, next to what really happened where the data has it.
//
//   npm run sim:report -- [--club Liverpool] [--season 2019/20] [--league 2025/26]
//                         [--runs 40] [--seed 1] [--tactic balanced|all]
//
// It runs `runSeasonSimulation`, the function the results page calls, on the
// club-season's stored XI; nothing here re-implements the model. Use it before
// and after a change to the simulation and compare the two reports.
//
// --league is the season whose field the XI plays in. It defaults to the XI's
// own season when that season has a full field, and to 2025/26 otherwise.
//
// Real numbers come from the FBref exports in data/raw/fbref: the XI's own
// club-season when it has one, and every club of the league season for the
// league-wide comparisons. Where a file is missing the column says so rather
// than guessing.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  gameData, getClub, getLineup, getOpponentSquads, getSquad, listCompetitions, runSeasonSimulation,
} from '../src/lib/gameData.ts';
import { getFormation } from '../src/lib/formations.ts';
import { PLAYSTYLES } from '../src/lib/matchEngine.ts';
import { getTacticEffect } from '../src/lib/gameData.ts';
import { parseFbrefCsv } from './lib/fbref-csv.mjs';

// Premier League records for a 38-game season, for "how often is it broken".
const RECORD_GOALS   = 36; // Haaland, 2022/23
const RECORD_ASSISTS = 20; // Henry 2002/03, De Bruyne 2019/20

// ── Arguments ─────────────────────────────────────────

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1] ?? 'true']);
  return acc;
}, []));
const CLUB   = args.club   ?? 'Liverpool';
const SEASON = args.season ?? '2019/20';
const RUNS   = Number(args.runs ?? 40);
const SEED   = Number(args.seed ?? 1);
const TACTIC = args.tactic ?? 'balanced';

const club   = gameData.clubs.find(c => c.name.toLowerCase() === CLUB.toLowerCase());
const season = gameData.seasons.find(s => s.label === SEASON);
if (!club || !season) fail(`No club-season "${CLUB} ${SEASON}" in the snapshot.`);
const squad  = getSquad(club.id, season.id);
const lineup = getLineup(club.id, season.id);
if (!squad || !lineup) fail(`${CLUB} ${SEASON} has no stored XI (squad of ${squad?.players.length ?? 0}).`);

const playable = listCompetitions().filter(c => c.league === 'PL');
const leagueLabel = args.league ?? (playable.some(c => c.seasonId === season.id) ? SEASON : '2025/26');
const league = playable.find(c => c.seasonLabel === leagueLabel);
if (!league) fail(`${leagueLabel} has no full field. Playable: ${playable.map(c => c.seasonLabel).join(', ')}`);

// ── The XI, exactly as Classic mode would field it ────

const formation = getFormation(lineup.formation);
const picks = lineup.slots.map(({ slotIndex, playerId }) => {
  const p = squad.players.find(x => x.playerId === playerId);
  const slot = formation.slots[slotIndex];
  return {
    slotIndex, position: slot.position, playerId, playerName: p.name, nationality: p.nationality,
    rating: p.rating, clubName: club.name, seasonLabel: season.label, positions: p.positions,
    clubId: club.id, seasonId: season.id, roles: p.roles,
  };
}).sort((a, b) => order(a.position) - order(b.position));

// ── Real numbers ──────────────────────────────────────

const norm = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
const slug = name => norm(name).replace(/ +/g, '-');
const seasonDir = label => label.replace('/', '-');

function readCsv(seasonLabel, clubName) {
  const file = path.join('data/raw/fbref/premier-league', seasonDir(seasonLabel), `${slug(clubName)}.csv`);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return null;
  try { return parseFbrefCsv(fs.readFileSync(file, 'utf8')).players; } catch { return null; }
}

const realXI = readCsv(season.label, club.name);
const realOf = name => realXI?.find(r => norm(r.name) === norm(name))
  ?? realXI?.find(r => norm(r.name).split(' ').pop() === norm(name).split(' ').pop());

// Every club in the league season, for the league-wide comparison.
const realLeague = gameData.squads
  .filter(s => s.seasonId === league.seasonId)
  .flatMap(s => (readCsv(league.seasonLabel, getClub(s.clubId)?.name ?? '') ?? [])
    .map(r => ({ ...r, club: getClub(s.clubId)?.name })));

// ── Playing ───────────────────────────────────────────

function play(style) {
  const out = [];
  for (let i = 0; i < RUNS; i++) {
    out.push(runSeasonSimulation(picks, SEED + i, { seasonId: league.seasonId, league: 'PL', style }));
  }
  return out;
}

// ── Report ────────────────────────────────────────────

const header = `${club.name} ${season.label} (${lineup.formation}) in the ${league.seasonLabel} Premier League · ${RUNS} seasons from seed ${SEED}`;
console.log(`\n${header}\n${'═'.repeat(header.length)}`);

if (TACTIC === 'all') {
  reportTactics();
} else {
  if (!PLAYSTYLES[TACTIC]) fail(`Unknown tactic "${TACTIC}". One of: all, ${Object.keys(PLAYSTYLES).join(', ')}`);
  reportSeason(play(TACTIC), TACTIC);
}

function reportSeason(results, style) {
  const effect = getTacticEffect(picks, style);
  console.log(`\nTactic: ${effect.label} (fit ${Math.round(effect.fit * 100)}%, line ${effect.line}, build-up ${effect.buildUp}, tempo ×${effect.tempo.toFixed(2)})`);

  // Team
  const pts = results.map(r => r.points);
  console.log(`\nTEAM   ${f1(mean(pts))} pts (sd ${f1(sd(pts))}) · finish ${f1(mean(results.map(r => r.finalPosition)))}` +
    ` · GF ${f1(mean(results.map(r => r.goalsFor)))} · GA ${f1(mean(results.map(r => r.goalsAgainst)))}` +
    ` · titles ${pct(results.filter(r => r.finalPosition === 1).length / RUNS)}`);

  // The XI
  const potsCount = count(results.map(r => r.awards.playerOfSeason.name));
  const leaguePots = count(results.map(r => r.awards.leaguePlayerOfSeason.isUser ? r.awards.leaguePlayerOfSeason.name : null));
  const teamGoals = mean(results.map(r => r.goalsFor));
  console.log(`\nYOUR XI            slot  ovr │  goals  share  assists  def acts beaten  match rtg │ PotS  league PotS │ real g / a`);
  console.log('─'.repeat(113));
  for (const p of picks) {
    const stats = results.map(r => r.playerStats.find(s => s.playerId === p.playerId));
    const g = mean(stats.map(s => s.goals));
    const a = mean(stats.map(s => s.assists));
    const rtg = mean(stats.map(s => s.avgMatchRating));
    // Tackles, interceptions, clearances, blocks and defensive headers won.
    const def = mean(stats.map(s => s.tackles + s.interceptions + s.clearances + s.blocks + s.aerialsWon));
    const beaten = mean(stats.map(s => s.beaten));
    const real = realOf(p.playerName);
    const realText = !realXI ? 'no export' : real ? `${real.goals ?? '?'} / ${real.assists ?? '?'}` : 'not found';
    console.log(`${pad(p.playerName, 18)} ${pad(p.position, 4)} ${p.rating}  │ ${f1(g).padStart(6)} ${pct(g / teamGoals).padStart(6)} ${f1(a).padStart(8)} ${f1(def).padStart(9)} ${f1(beaten).padStart(6)} ${f2(rtg).padStart(10)} │` +
      ` ${pct((potsCount.get(p.playerName) ?? 0) / RUNS).padStart(4)} ${pct((leaguePots.get(p.playerName) ?? 0) / RUNS).padStart(12)} │ ${realText}`);
  }
  const assisted = mean(results.map(r => r.playerStats.reduce((s, x) => s + x.assists, 0))) / teamGoals;
  console.log(`\nGoals with an assist: ${pct(assisted)} (real PL ~74%)`);

  // League-wide
  const topG = results.map(r => r.topScorers[0]);
  const topA = results.map(r => r.topAssisters[0]);
  const realTopG = [...realLeague].sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))[0];
  const realTopA = [...realLeague].sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0))[0];
  console.log(`\nLEAGUE (per season)`);
  console.log(`  Golden Boot: ${f1(mean(topG.map(e => e.value)))} goals on average, most ${Math.max(...topG.map(e => e.value))};` +
    ` record (${RECORD_GOALS}) equalled or broken in ${pct(topG.filter(e => e.value >= RECORD_GOALS).length / RUNS)}` +
    (realTopG ? ` · real ${league.seasonLabel}: ${realTopG.name} ${realTopG.goals}` : ''));
  console.log(`  Top assists: ${f1(mean(topA.map(e => e.value)))} on average, most ${Math.max(...topA.map(e => e.value))};` +
    ` record (${RECORD_ASSISTS}) equalled or broken in ${pct(topA.filter(e => e.value >= RECORD_ASSISTS).length / RUNS)}` +
    (realTopA?.assists != null ? ` · real ${league.seasonLabel}: ${realTopA.name} ${realTopA.assists}` : ''));
  console.log(`  Most frequent Golden Boot winners: ${top(count(topG.map(e => `${e.playerName} (${e.clubName})`)), 4)}`);
  console.log(`  Most frequent top assisters:       ${top(count(topA.map(e => `${e.playerName} (${e.clubName})`)), 4)}`);

  // Who gets the goals, by position, among the league's top 20 each season.
  const positionOf = opponentPositions();
  const group = (e) => bucket(e.isUser ? picks.find(p => p.playerName === e.playerName)?.position : positionOf.get(`${e.clubName}|${e.playerName}`));
  const share = (entries) => {
    const totals = new Map();
    let all = 0;
    for (const e of entries) { totals.set(group(e), (totals.get(group(e)) ?? 0) + e.value); all += e.value; }
    return ['FW', 'MF', 'DF'].map(g => `${g} ${pct((totals.get(g) ?? 0) / all)}`).join('  ');
  };
  const realShare = (key) => {
    const rows = [...realLeague].filter(r => r[key] != null).sort((a, b) => b[key] - a[key]).slice(0, 20);
    if (rows.length === 0) return 'no export';
    const all = rows.reduce((s, r) => s + r[key], 0);
    return ['FW', 'MF', 'DF'].map(g => `${g} ${pct(rows.filter(r => (r.positionLabel ?? '').startsWith(g)).reduce((s, r) => s + r[key], 0) / all)}`).join('  ');
  };
  console.log(`\n  Top-20 scorers' goals by position:   sim ${share(results.flatMap(r => r.topScorers))}   │ real ${realShare('goals')}`);
  console.log(`  Top-20 assisters' assists by position: sim ${share(results.flatMap(r => r.topAssisters))}   │ real ${realShare('assists')}`);
  console.log(`  (FW = ST/CF/LW/RW, MF = CAM/CM/CDM/LM/RM, DF = defenders. Real positions are FBref's coarse labels.)`);

  const lpots = count(results.map(r => bucket(r.awards.leaguePlayerOfSeason.isUser
    ? picks.find(p => p.playerName === r.awards.leaguePlayerOfSeason.name)?.position
    : positionOf.get(`${r.awards.leaguePlayerOfSeason.club}|${r.awards.leaguePlayerOfSeason.name}`))));
  console.log(`  League Player of the Season by position: ${['FW', 'MF', 'DF'].map(g => `${g} ${pct((lpots.get(g) ?? 0) / RUNS)}`).join('  ')}`);
}

function reportTactics() {
  console.log(`\nSame ${RUNS} seeds for every style, so differences are the tactic and not luck.\n`);
  console.log(`${pad('style', 16)} fit  line build tempo │   pts   (sd)  finish   GF    GA   titles`);
  console.log('─'.repeat(92));
  for (const style of Object.keys(PLAYSTYLES)) {
    const e = getTacticEffect(picks, style);
    const r = play(style);
    const pts = r.map(x => x.points);
    console.log(`${pad(e.label, 16)} ${pct(e.fit).padStart(4)} ${e.line.toFixed(2).padStart(5)} ${e.buildUp.toFixed(2).padStart(5)} ${('×' + e.tempo.toFixed(2)).padStart(5)} │` +
      ` ${f1(mean(pts)).padStart(5)} ${('(' + f1(sd(pts)) + ')').padStart(6)} ${f1(mean(r.map(x => x.finalPosition))).padStart(6)}` +
      ` ${f1(mean(r.map(x => x.goalsFor))).padStart(5)} ${f1(mean(r.map(x => x.goalsAgainst))).padStart(5)} ${pct(r.filter(x => x.finalPosition === 1).length / RUNS).padStart(7)}`);
  }
}

// ── Helpers ───────────────────────────────────────────

function opponentPositions() {
  const map = new Map();
  for (const sq of getOpponentSquads(league.seasonId, 'PL')) {
    for (const p of sq.players) map.set(`${sq.clubName}|${p.name}`, p.position);
  }
  return map;
}
function bucket(pos) {
  if (!pos) return '?';
  if (['ST', 'CF', 'LW', 'RW'].includes(pos)) return 'FW';
  if (['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB'].includes(pos)) return 'DF';
  return 'MF';
}
function order(pos) {
  return ['GK', 'RB', 'RWB', 'CB', 'LB', 'LWB', 'CDM', 'CM', 'RM', 'LM', 'CAM', 'RW', 'LW', 'CF', 'ST'].indexOf(pos);
}
function count(xs) { const m = new Map(); for (const x of xs) if (x != null) m.set(x, (m.get(x) ?? 0) + 1); return m; }
function top(m, n) { return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ×${v}`).join(', '); }
function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sd(xs) { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); }
function f1(x) { return x.toFixed(1); }
function f2(x) { return x.toFixed(2); }
function pct(x) { return `${Math.round(x * 100)}%`; }
function pad(s, n) { return String(s).slice(0, n).padEnd(n); }
function fail(message) { console.error(message); process.exit(1); }
