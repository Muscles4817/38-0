// How far apart the simulation puts strong and weak clubs, and at which stage
// of a match the gap is made or lost.
//
//   npm run sim:spread -- [--season 2003/04] [--passes 10] [--seed 1] [--json file]
//
// --json also writes the per-club rows, for pooling seasons.
//
// It plays the real league of a season, every club on its stored XI and its
// recorded or inferred style, exactly as `simulateSeason` sets clubs up
// (`leagueSetups`), `--passes` times over. Nothing here re-implements the model.
//
// A club's goals are split into stages that multiply:
//
//   goals for     = shots × xG per shot × goals per xG (finishing)
//   goals against = shots faced × xG per shot faced × goals per xG faced (keeping)
//
// and the spread of goals across the league into the share each stage makes:
// the covariance of the stage's log with the log of goals, over the variance
// of that log. The shares add up to 100%. A stage with a small share is one
// that barely separates good sides from bad.
//
// The real season comes from data/raw/tables/premier-league.json (final
// tables for 1995/96, 1999/00, 2003/04, 2004/05, 2006/07, 2008/09, 2009/10 and
// 2025/26): points, goals for and against per club. For other seasons with a
// complete FBref export, goals for are summed from the players instead (own
// goals missing). Neither source has shots or xG, so the stages themselves are
// not compared with the season.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gameData, getClub, getOpponentSquads, getRoleConfig, listCompetitions } from '../src/lib/gameData.ts';
import { simulateMatch } from '../src/lib/matchEngine.ts';
import { engineRoles, leagueSetups } from '../src/lib/simulation.ts';
import { parseFbrefCsv } from './lib/fbref-csv.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1] ?? 'true']);
  return acc;
}, []));
const SEASON = args.season ?? '2003/04';
const PASSES = Number(args.passes ?? 10);
const SEED   = Number(args.seed ?? 1);

const league = listCompetitions().find(c => c.league === 'PL' && c.seasonLabel === SEASON);
if (!league) {
  console.error(`${SEASON} has no full field. Playable: ${listCompetitions().filter(c => c.league === 'PL').map(c => c.seasonLabel).join(', ')}`);
  process.exit(1);
}

// mulberry32, as the game uses.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The real season ───────────────────────────────────

const norm = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z ]/g, '').trim();
const slug = name => norm(name).replace(/ +/g, '-');

const TABLES = JSON.parse(fs.readFileSync('data/raw/tables/premier-league.json', 'utf8')).seasons;
const realTable = TABLES[SEASON]?.table ?? null;
function realRow(clubName) {
  if (!realTable) return null;
  const n = norm(clubName);
  return realTable.find(r => norm(r.club) === n)
    ?? realTable.find(r => norm(r.club).includes(n) || n.includes(norm(r.club)))
    ?? null;
}

function fbrefGoals(clubName) {
  const file = path.join('data/raw/fbref/premier-league', SEASON.replace('/', '-'), `${slug(clubName)}.csv`);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return null;
  try {
    return parseFbrefCsv(fs.readFileSync(file, 'utf8')).players.reduce((s, r) => s + (r.goals ?? 0), 0);
  } catch { return null; }
}

// ── The season, played ────────────────────────────────

const squads = getOpponentSquads(league.seasonId, 'PL');
const roleConfig = getRoleConfig();
const teams = leagueSetups(squads, roleConfig);
const roles = engineRoles(roleConfig);
const rand = rng(SEED);

const blank = () => ({ pts: 0, gf: 0, ga: 0, sf: 0, sa: 0, xf: 0, xa: 0, poss: 0, games: 0 });
const acc = new Map(teams.map(t => [t.name, blank()]));
const seasonPoints = new Map(teams.map(t => [t.name, []]));
const champions = [];
const lasts = [];
// Scorers, per season: the Golden Boot, each club's top scorer's share of its
// goals and of its shots, and penalty goals.
const goldenBoots = [];
const topShares = [];
const topShotShares = [];
let penaltyGoals = 0, allGoals = 0;
const sds = [];

for (let pass = 0; pass < PASSES; pass++) {
  const pts = new Map(teams.map(t => [t.name, 0]));
  const seasonScorers = new Map(teams.map(t => [t.name, new Map()]));
  for (const home of teams) for (const away of teams) {
    if (home === away) continue;
    const m = simulateMatch(home, away, rand, roles);
    for (const side of [m.home, m.away]) {
      const ps = seasonScorers.get(side.name);
      for (const p of side.players) {
        const r = ps.get(p.name) ?? { g: 0, s: 0 };
        r.g += p.goals; r.s += p.shots;
        ps.set(p.name, r);
      }
    }
    for (const e of m.events) {
      if (e.type !== 'goal') continue;
      allGoals++;
      if (e.chanceType === 'penalty') penaltyGoals++;
    }
    for (const [us, them] of [[m.home, m.away], [m.away, m.home]]) {
      const a = acc.get(us.name);
      a.gf += us.goals; a.ga += them.goals;
      a.sf += us.shots; a.sa += them.shots;
      a.xf += us.expectedGoals; a.xa += them.expectedGoals;
      a.poss += us.possession; a.games++;
      const p = us.goals > them.goals ? 3 : us.goals === them.goals ? 1 : 0;
      a.pts += p; pts.set(us.name, pts.get(us.name) + p);
    }
  }
  for (const [club, ps] of seasonScorers) {
    const goals = [...ps.values()].reduce((s, p) => s + p.g, 0);
    const shots = [...ps.values()].reduce((s, p) => s + p.s, 0);
    const top = [...ps.values()].sort((x, y) => y.g - x.g)[0];
    if (goals > 0) topShares.push(top.g / goals);
    if (shots > 0) topShotShares.push(top.s / shots);
  }
  goldenBoots.push(Math.max(...[...seasonScorers.values()].flatMap(ps => [...ps.values()].map(p => p.g))));
  const table = [...pts.values()].sort((x, y) => y - x);
  champions.push(table[0]);
  lasts.push(table[table.length - 1]);
  sds.push(sd(table));
  for (const [name, p] of pts) seasonPoints.get(name).push(p);
}

// ── Report ────────────────────────────────────────────

function mean(xs) { return xs.reduce((s, x) => s + x, 0) / xs.length; }
function sd(xs) { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); }
function cov(xs, ys) { const mx = mean(xs), my = mean(ys); return mean(xs.map((x, i) => (x - mx) * (ys[i] - my))); }
function corr(xs, ys) { return cov(xs, ys) / (sd(xs) * sd(ys)); }
const f1 = x => x.toFixed(1);
const f2 = x => x.toFixed(2);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

const rows = squads.map(sq => {
  const a = acc.get(sq.clubName);
  const per = PASSES; // per season
  return {
    club: sq.clubName,
    strength: sq.strength,
    pts: a.pts / per, gf: a.gf / per, ga: a.ga / per,
    shotsFor: a.sf / a.games, shotsAgainst: a.sa / a.games,
    poss: a.poss / a.games,
    xgPerShot: a.xf / a.sf, xgPerShotAgainst: a.xa / a.sa,
    finishing: a.gf / a.xf, keeping: a.ga / a.xa,
    real: realRow(sq.clubName),
    fbrefGf: fbrefGoals(sq.clubName),
  };
}).sort((x, y) => y.pts - x.pts);

console.log(`\n${SEASON}, ${teams.length} clubs on their stored XIs, ${PASSES} seasons\n`);
console.log(`${pad('club', 24)} ${lpad('str', 4)} │ ${lpad('pts', 5)} ${lpad('GF', 5)} ${lpad('GA', 5)} │ ${lpad('poss', 5)} ${lpad('sh', 5)} ${lpad('shA', 5)} │ ${lpad('xG/sh', 6)} ${lpad('xGA/sh', 6)} ${lpad('G/xG', 5)} ${lpad('GA/xGA', 6)} │ ${lpad('real pts GF GA', 14)}`);
console.log('─'.repeat(119));
for (const r of rows) {
  console.log(`${pad(r.club, 24)} ${lpad(r.strength, 4)} │ ${lpad(f1(r.pts), 5)} ${lpad(f1(r.gf), 5)} ${lpad(f1(r.ga), 5)} │ ${lpad(r.poss.toFixed(0) + '%', 5)} ${lpad(f1(r.shotsFor), 5)} ${lpad(f1(r.shotsAgainst), 5)} │ ${lpad(f2(r.xgPerShot * 10) , 6)} ${lpad(f2(r.xgPerShotAgainst * 10), 6)} ${lpad(f2(r.finishing), 5)} ${lpad(f2(r.keeping), 6)} │ ${lpad(r.real ? `${r.real.points} ${r.real.goalsFor} ${r.real.goalsAgainst}` : r.fbrefGf != null ? `— ${r.fbrefGf} —` : '—', 14)}`);
}
console.log('(xG per shot ×10. shots per match.)');

// Where the spread of goals comes from.
const log = xs => xs.map(Math.log);
function shares(total, parts) {
  const lt = log(total), v = sd(lt) ** 2;
  return parts.map(([name, xs]) => `${name} ${(100 * cov(log(xs), lt) / v).toFixed(0)}%`).join('  ');
}
const col = k => rows.map(r => r[k]);
console.log(`\nWhere the spread of goals for comes from:      ${shares(col('gf'), [['shots', col('shotsFor')], ['xG/shot', col('xgPerShot')], ['finishing', col('finishing')]])}`);
console.log(`Where the spread of goals against comes from:  ${shares(col('ga'), [['shots faced', col('shotsAgainst')], ['xG/shot faced', col('xgPerShotAgainst')], ['keeping', col('keeping')]])}`);

const range = k => { const xs = col(k); return `${f1(Math.min(...xs))}–${f1(Math.max(...xs))}`; };
console.log(`\nShots per match ${range('shotsFor')}, faced ${range('shotsAgainst')}; possession ${Math.min(...col('poss')).toFixed(0)}–${Math.max(...col('poss')).toFixed(0)}%`);
console.log(`Champion ${f1(mean(champions))} pts (best ${Math.max(...champions)}), bottom ${f1(mean(lasts))}, spread of a table (sd) ${f1(mean(sds))}`);

// Compared with the real season, club by club. The simulated numbers are
// averages over many seasons, so their spread is narrower than one season's by
// the season-to-season noise; `noise` is that, to read the real spread against.
function compare(label, simCol, realCol, noiseSd) {
  const pairs = rows.map(r => [r[simCol], realCol(r)]).filter(([, x]) => x != null);
  if (pairs.length < 10) return;
  const sim = pairs.map(p => p[0]), real = pairs.map(p => p[1]);
  const expected = Math.sqrt(sd(sim) ** 2 + noiseSd ** 2);
  console.log(`  ${pad(label, 14)} spread sim ${lpad(f1(sd(sim)), 4)} (one season ~${lpad(f1(expected), 4)})  real ${lpad(f1(sd(real)), 4)}   range sim ${f1(Math.min(...sim))}–${f1(Math.max(...sim))}  real ${Math.min(...real)}–${Math.max(...real)}   r ${f2(corr(sim, real))}`);
}
// The noise of one season around a club's long-run average, measured.
const ptsNoise = Math.sqrt(mean(teams.map(t => { const xs = seasonPoints.get(t.name); return sd(xs) ** 2; })));
if (realTable) {
  console.log(`\nAgainst the real ${SEASON} (data/raw/tables), club by club:`);
  compare('points', 'pts', r => r.real?.points, ptsNoise);
  compare('goals for', 'gf', r => r.real?.goalsFor, Math.sqrt(mean(rows.map(r => r.gf))));
  compare('goals against', 'ga', r => r.real?.goalsAgainst, Math.sqrt(mean(rows.map(r => r.ga))));
  // How many points a goal of difference is worth: the slope of points on
  // goal difference across the table. If the simulation's matches turn goals
  // into results as real ones do, this matches whatever the spread.
  const slope = (xs, ys) => cov(xs, ys) / sd(xs) ** 2;
  const realGd = realTable.map(r => r.goalsFor - r.goalsAgainst), realPts = realTable.map(r => r.points);
  console.log(`  points per goal of difference   sim ${f2(slope(rows.map(r => r.gf - r.ga), col('pts')))}  real ${f2(slope(realGd, realPts))}`);
  const champ = realTable[0], last = realTable[realTable.length - 1];
  console.log(`  champion       sim ${f1(mean(champions))}  real ${champ.points} (${champ.club})   bottom sim ${f1(mean(lasts))}  real ${last.points}   table sd sim ${f1(mean(sds))}  real ${f1(sd(realTable.map(r => r.points)))}`);
} else if (rows.filter(r => r.fbrefGf != null).length >= 10) {
  console.log(`\nAgainst the real ${SEASON} (FBref goals, own goals missing):`);
  compare('goals for', 'gf', r => r.fbrefGf, Math.sqrt(mean(rows.map(r => r.gf))));
} else {
  console.log(`\nNo real data for ${SEASON}.`);
}
console.log(`(Season-to-season noise in one club's points, measured: sd ${f1(ptsNoise)}.)`);
// Scorers against the FBref exports: the same season, every club's players.
const realScorers = squads.map(sq => {
  const file = path.join('data/raw/fbref/premier-league', SEASON.replace('/', '-'), `${slug(sq.clubName)}.csv`);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return null;
  try { return parseFbrefCsv(fs.readFileSync(file, 'utf8')).players; } catch { return null; }
}).filter(Boolean);
console.log(`\nScorers (${PASSES} seasons; real from FBref where the season has exports):`);
const realLine = (sim, real) => `sim ${sim}${real == null ? '' : `  real ${real}`}`;
const realTops = realScorers.map(ps => {
  const goals = ps.reduce((s, p) => s + (p.goals ?? 0), 0);
  return goals > 0 ? Math.max(...ps.map(p => p.goals ?? 0)) / goals : null;
}).filter(x => x != null);
const realBoot = realScorers.length >= 10 ? Math.max(...realScorers.flatMap(ps => ps.map(p => p.goals ?? 0))) : null;
const realPens = realScorers.length >= 10 ? realScorers.flat().reduce((s, p) => s + (p.penaltyGoals ?? 0), 0) / realScorers.flat().reduce((s, p) => s + (p.goals ?? 0), 0) : null;
console.log(`  Golden Boot                ${realLine(`${f1(mean(goldenBoots))} (most ${Math.max(...goldenBoots)})`, realBoot)}`);
console.log(`  top scorer's share of a club's goals  ${realLine(`${(100 * mean(topShares)).toFixed(0)}%`, realTops.length >= 10 ? `${(100 * mean(realTops)).toFixed(0)}%` : null)}`);
console.log(`  top scorer's share of a club's shots  sim ${(100 * mean(topShotShares)).toFixed(0)}%`);
console.log(`  penalty goals              ${realLine(`${(100 * penaltyGoals / allGoals).toFixed(1)}%`, realPens == null ? null : `${(100 * realPens).toFixed(1)}%`)}`);
if (args.json) fs.writeFileSync(args.json, JSON.stringify({ season: SEASON, rows }, null, 1));
console.log();
