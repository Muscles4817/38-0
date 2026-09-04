import { describe, it, expect } from 'vitest';
import { gameData, getTraits } from './gameData';
import {
  simulateMatch, inferStyle, DEFAULT_COHESION,
  type TeamSetup, type MatchPlayer, type PlaystyleName,
} from './matchEngine';
import { bestFormation, type FittablePlayer } from './lineupFit';
import type { Position } from './formations';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// What actually happened. Points only; the order is the real final table.
const REAL: Record<string, [string, number][]> = {
  '1992/93': [['Manchester United',84],['Aston Villa',74],['Norwich City',72],['Blackburn Rovers',71],
    ['Queens Park Rangers',63],['Liverpool',59],['Sheffield Wednesday',59],['Tottenham Hotspur',59],
    ['Manchester City',57],['Arsenal',56],['Chelsea',56],['Wimbledon',54],['Everton',53],
    ['Sheffield United',52],['Coventry City',52],['Ipswich Town',52],['Leeds United',51],
    ['Southampton',50],['Oldham Athletic',49],['Crystal Palace',49],['Middlesbrough',44],
    ['Nottingham Forest',40]],
  '1993/94': [['Manchester United',92],['Blackburn Rovers',84],['Newcastle United',77],['Arsenal',71],
    ['Leeds United',70],['Wimbledon',65],['Sheffield Wednesday',64],['Liverpool',60],
    ['Queens Park Rangers',60],['Aston Villa',57],['Coventry City',56],['Norwich City',53],
    ['West Ham United',52],['Chelsea',51],['Tottenham Hotspur',45],['Manchester City',45],
    ['Everton',44],['Southampton',43],['Ipswich Town',43],['Sheffield United',42],
    ['Oldham Athletic',40],['Swindon Town',30]],
  '1994/95': [['Blackburn Rovers',89],['Manchester United',88],['Nottingham Forest',77],['Liverpool',74],
    ['Leeds United',73],['Newcastle United',72],['Tottenham Hotspur',62],['Queens Park Rangers',60],
    ['Wimbledon',56],['Southampton',54],['Chelsea',54],['Arsenal',51],['Sheffield Wednesday',51],
    ['West Ham United',50],['Everton',50],['Coventry City',50],['Manchester City',49],
    ['Aston Villa',48],['Crystal Palace',45],['Norwich City',43],['Leicester City',29],
    ['Ipswich Town',27]],
  '1995/96': [['Manchester United',82],['Newcastle United',78],['Liverpool',71],['Aston Villa',63],
    ['Arsenal',63],['Everton',61],['Blackburn Rovers',61],['Tottenham Hotspur',61],
    ['Nottingham Forest',58],['West Ham United',51],['Chelsea',50],['Middlesbrough',43],
    ['Leeds United',43],['Wimbledon',41],['Sheffield Wednesday',40],['Coventry City',38],
    ['Southampton',38],['Manchester City',38],['Queens Park Rangers',33],['Bolton Wanderers',29]],
  '1996/97': [['Manchester United',75],['Newcastle United',68],['Arsenal',68],['Liverpool',68],
    ['Aston Villa',61],['Chelsea',59],['Sheffield Wednesday',57],['Wimbledon',56],
    ['Leicester City',47],['Tottenham Hotspur',46],['Leeds United',46],['Derby County',46],
    ['Blackburn Rovers',42],['West Ham United',42],['Everton',42],['Southampton',41],
    ['Coventry City',41],['Sunderland',40],['Middlesbrough',39],['Nottingham Forest',34]],
  '1997/98': [['Arsenal',78],['Manchester United',77],['Liverpool',65],['Chelsea',63],['Leeds United',59],
    ['Blackburn Rovers',58],['Aston Villa',57],['West Ham United',56],['Derby County',55],
    ['Leicester City',53],['Coventry City',52],['Southampton',48],['Newcastle United',44],
    ['Tottenham Hotspur',44],['Wimbledon',44],['Sheffield Wednesday',44],['Everton',40],
    ['Bolton Wanderers',40],['Barnsley',35],['Crystal Palace',33]],
  '1998/99': [['Manchester United',79],['Arsenal',78],['Chelsea',75],['Leeds United',67],
    ['West Ham United',57],['Aston Villa',55],['Liverpool',54],['Derby County',52],
    ['Middlesbrough',51],['Leicester City',49],['Tottenham Hotspur',47],['Sheffield Wednesday',46],
    ['Newcastle United',46],['Everton',43],['Coventry City',42],['Wimbledon',42],
    ['Southampton',41],['Charlton Athletic',36],['Blackburn Rovers',35],['Nottingham Forest',30]],
  '1999/00': [['Manchester United',91],['Arsenal',73],['Leeds United',69],['Liverpool',67],
    ['Chelsea',65],['Aston Villa',58],['Sunderland',58],['Leicester City',55],['West Ham United',55],
    ['Tottenham Hotspur',53],['Newcastle United',52],['Middlesbrough',52],['Everton',50],
    ['Coventry City',44],['Southampton',44],['Derby County',38],['Bradford City',36],
    ['Wimbledon',33],['Sheffield Wednesday',31],['Watford',24]],
  '2000/01': [['Manchester United',80],['Arsenal',70],['Liverpool',69],['Leeds United',68],
    ['Ipswich Town',66],['Chelsea',61],['Sunderland',57],['Aston Villa',54],['Charlton Athletic',52],
    ['Southampton',52],['Newcastle United',51],['Tottenham Hotspur',49],['Leicester City',48],
    ['Middlesbrough',42],['West Ham United',42],['Everton',42],['Derby County',42],
    ['Manchester City',34],['Coventry City',34],['Bradford City',26]],
  '2001/02': [['Arsenal',87],['Liverpool',80],['Manchester United',77],['Newcastle United',71],
    ['Leeds United',66],['Chelsea',64],['West Ham United',53],['Aston Villa',50],
    ['Tottenham Hotspur',50],['Blackburn Rovers',46],['Southampton',45],['Middlesbrough',45],
    ['Fulham',44],['Charlton Athletic',44],['Everton',43],['Bolton Wanderers',40],['Sunderland',40],
    ['Ipswich Town',36],['Derby County',30],['Leicester City',28]],
  '2002/03': [['Manchester United',83],['Arsenal',78],['Newcastle United',69],['Chelsea',67],
    ['Liverpool',64],['Blackburn Rovers',60],['Everton',59],['Southampton',52],['Manchester City',51],
    ['Tottenham Hotspur',50],['Middlesbrough',49],['Charlton Athletic',49],['Birmingham City',48],
    ['Fulham',48],['Leeds United',47],['Aston Villa',45],['Bolton Wanderers',44],
    ['West Ham United',42],['West Bromwich Albion',26],['Sunderland',19]],
  '2003/04': [['Arsenal',90],['Chelsea',79],['Manchester United',75],['Liverpool',60],
    ['Newcastle United',56],['Aston Villa',56],['Charlton Athletic',53],['Bolton Wanderers',53],
    ['Fulham',52],['Birmingham City',50],['Middlesbrough',48],['Southampton',47],['Portsmouth',45],
    ['Tottenham Hotspur',45],['Blackburn Rovers',44],['Manchester City',41],['Everton',39],
    ['Leicester City',33],['Leeds United',33],['Wolverhampton Wanderers',33]],
  '2004/05': [['Chelsea',95],['Arsenal',83],['Manchester United',77],['Everton',61],['Liverpool',58],
    ['Bolton Wanderers',58],['Middlesbrough',55],['Manchester City',52],['Tottenham Hotspur',52],
    ['Aston Villa',47],['Charlton Athletic',46],['Birmingham City',45],['Fulham',44],
    ['Newcastle United',44],['Blackburn Rovers',42],['Portsmouth',39],['West Bromwich Albion',34],
    ['Crystal Palace',33],['Norwich City',33],['Southampton',32]],
};

function build(label: string): TeamSetup[] {
  const season = gameData.seasons.find(s => s.label === label)!;
  const out: TeamSetup[] = [];
  for (const sq of gameData.squads.filter(s => s.seasonId === season.id)) {
    const club = gameData.clubs.find(c => c.id === sq.clubId);
    if (!club || club.league !== 'PL') continue;
    const fittable: FittablePlayer[] = sq.players.map(p => ({
      name: p.name, positions: p.positions as Position[], minutes: p.rating,
    }));
    const fit = bestFormation(fittable);
    if (fit.slots.length < 11) continue;
    const players: MatchPlayer[] = fit.slots.map(slot => {
      const p = sq.players.find(x => x.name === slot.player.name)!;
      return { playerId: p.playerId, name: p.name, position: slot.position as Position,
        rating: p.rating, roles: p.roles };
    });
    // Recorded tactics win; otherwise infer a shape from the squad and use the
    // default cohesion. That is the same fallback the game will use, so the
    // hindcast measures what a player would actually get.
    const inferred = inferStyle(players);
    const traits = getTraits(sq.clubId, season.id);
    out.push({
      name: club.name, players, formation: fit.formation,
      style: (traits?.playstyle as PlaystyleName) ?? inferred.style,
      focus: traits?.focus ?? inferred.focus,
      cohesion: traits?.cohesion ?? DEFAULT_COHESION,
    });
  }
  return out;
}

const roles = {
  goalMult: Object.fromEntries(gameData.roles.map(r => [r.name, r.goalMult])),
  assistMult: Object.fromEntries(gameData.roles.map(r => [r.name, r.assistMult])),
};

describe('the eight seasons we know the answer to', () => {
  // The only external check this project has. Those squads really played each
  // other and the tables are known, so simulating them says whether the
  // ratings and the engine together describe football or merely agree with
  // themselves.
  //
  // The bounds are deliberately loose. A single season's table is substantially
  // luck, form, injuries and mid-season upheaval that this model does not
  // represent at all, so a perfect match would mean something was rigged. What
  // it must not do is fail to track reality at all.
  const rhos: number[] = [];
  const all: { sim: number; real: number }[] = [];

  for (const label of Object.keys(REAL)) {
    const teams = build(label);
    const real = REAL[label];
    const realPts = new Map(real);
    const N = 6;
    const pts = new Map<string, number[]>();
    for (const t of teams) pts.set(t.name, []);
    const rand = rng(4242);
    for (let s = 0; s < N; s++) {
      const p: Record<string, number> = {};
      for (const t of teams) p[t.name] = 0;
      for (const h of teams) for (const a of teams) {
        if (h === a) continue;
        const m = simulateMatch(h, a, rand, roles);
        if (m.home.goals > m.away.goals) p[h.name] += 3;
        else if (m.away.goals > m.home.goals) p[a.name] += 3;
        else { p[h.name]++; p[a.name]++; }
      }
      for (const t of teams) pts.get(t.name)!.push(p[t.name]);
    }
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const rows = teams.map(t => ({ n: t.name, p: mean(pts.get(t.name)!) })).sort((a, b) => b.p - a.p);
    const realRank = new Map(real.map(([n], i) => [n, i + 1]));
    let d2 = 0, counted = 0;
    rows.forEach((r, i) => {
      const rr = realRank.get(r.n);
      if (rr === undefined) return;
      counted++; d2 += Math.pow(i + 1 - rr, 2);
      all.push({ sim: r.p, real: realPts.get(r.n) ?? 0 });
    });
    rhos.push(1 - (6 * d2) / (counted * (counted * counted - 1)));

    it(`${label} has every club, and orders them something like reality`, () => {
      expect(teams.length).toBeGreaterThanOrEqual(20);
      expect(counted).toBe(teams.length);
      expect(rhos[rhos.length - 1]).toBeGreaterThan(0.3);
    });
  }

  it('tracks the real tables across all eight', () => {
    const meanRho = rhos.reduce((a, b) => a + b, 0) / rhos.length;
    expect(meanRho, `mean Spearman ${meanRho.toFixed(3)}`).toBeGreaterThan(0.45);

    const sim = all.map(r => r.sim), rl = all.map(r => r.real);
    const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const ms = m(sim), mr = m(rl);
    const num = sim.reduce((s, _, i) => s + (sim[i] - ms) * (rl[i] - mr), 0);
    const den = Math.sqrt(sim.reduce((s, v) => s + (v - ms) ** 2, 0)
      * rl.reduce((s, v) => s + (v - mr) ** 2, 0));
    expect(num / den, 'points correlation').toBeGreaterThan(0.5);

    // The average club should take about the points an average club took.
    // Nothing here says who wins.
    expect(Math.abs(ms - mr), `sim mean ${ms.toFixed(1)} vs real ${mr.toFixed(1)}`).toBeLessThan(6);
  });
});
