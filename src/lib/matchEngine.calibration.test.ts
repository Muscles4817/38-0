// Does the engine produce football?
//
// This is the check the old engine never had, and the one that decides whether
// the rest of the model is honest. Every assertion here is a RATE — how often a
// possession becomes a shot, how often a shot is scored, how often a foul is
// booked. They are facts about the sport and can be looked up.
//
// Deliberately absent: anything about a league table. No target for the
// champion's points, no floor under the bottom club. If the table comes out
// wrong, one of these rates is wrong, and this is where to look.
//
// Reference, Premier League, per team per match:
//
//   goals 1.40   shots 13.0   on target 4.4   conversion 10.8%
//   fouls 10.4   yellows 1.9  reds 0.05       assisted goals 74%
//   home 1.55 / away 1.25     clean sheets ~26%
//   goals from a dead ball ~25%

import { describe, it, expect } from 'vitest';
import { gameData } from './gameData';
import { simulateMatch, inferStyle, type TeamSetup, type MatchPlayer } from './matchEngine';
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

function currentLeague(): TeamSetup[] {
  const season = gameData.seasons.find(s => s.label === '2025/26');
  if (!season) throw new Error('2025/26 is not in the snapshot');
  const lineupOf = new Map(gameData.lineups.map(l => [`${l.clubId}/${l.seasonId}`, l]));
  const teams: TeamSetup[] = [];
  for (const sq of gameData.squads.filter(s => s.seasonId === season.id)) {
    const club = gameData.clubs.find(c => c.id === sq.clubId);
    if (!club || club.league !== 'PL') continue;
    const byId = new Map(sq.players.map(p => [p.playerId, p]));
    const stored = lineupOf.get(`${sq.clubId}/${sq.seasonId}`);
    let xi: typeof sq.players | null = null;
    if (stored && stored.slots.length === 11) {
      const found = stored.slots
        .map(s => byId.get(s.playerId))
        .filter((p): p is (typeof sq.players)[number] => p != null);
      if (found.length === 11) xi = found;
    }
    if (!xi) {
      const keepers = sq.players.filter(p => p.positions[0] === 'GK')
        .sort((a, b) => b.rating - a.rating);
      const outfield = sq.players.filter(p => p.positions[0] !== 'GK')
        .sort((a, b) => b.rating - a.rating);
      xi = [...keepers.slice(0, 1), ...outfield.slice(0, 10)];
    }
    const players: MatchPlayer[] = xi.map(p => ({
      playerId: p.playerId, name: p.name, position: p.positions[0] as Position,
      rating: p.rating, roles: p.roles,
    }));
    const { style, focus } = inferStyle(players);
    teams.push({ name: club.name, players, formation: '4-3-3', style, focus });
  }
  return teams;
}

const teams = currentLeague();
const roles = {
  goalMult: Object.fromEntries(gameData.roles.map(r => [r.name, r.goalMult])),
  assistMult: Object.fromEntries(gameData.roles.map(r => [r.name, r.assistMult])),
};

// One deterministic pass of the league, home and away.
const rand = rng(20260903);
const t = {
  n: 0, matches: 0, goals: 0, shots: 0, onTarget: 0, fouls: 0, yellows: 0, reds: 0,
  homeGoals: 0, awayGoals: 0, cleanSheets: 0, assistedGoals: 0, allGoals: 0,
  setPieceGoals: 0,
};
const scorelines = new Map<string, number>();
for (let repeat = 0; repeat < 3; repeat++) {
  for (const home of teams) {
    for (const away of teams) {
      if (home === away) continue;
      const m = simulateMatch(home, away, rand, roles);
      t.matches++;
      t.n += 2;
      for (const side of [m.home, m.away]) {
        t.goals += side.goals; t.shots += side.shots; t.onTarget += side.shotsOnTarget;
        t.fouls += side.fouls; t.yellows += side.yellows; t.reds += side.reds;
      }
      t.homeGoals += m.home.goals;
      t.awayGoals += m.away.goals;
      if (m.home.goals === 0) t.cleanSheets++;
      if (m.away.goals === 0) t.cleanSheets++;
      for (const e of m.events) {
        if (e.type !== 'goal') continue;
        t.allGoals++;
        if (e.assistId !== undefined) t.assistedGoals++;
        if (e.chanceType === 'setPiece') t.setPieceGoals++;
      }
      scorelines.set(`${m.home.goals}-${m.away.goals}`,
        (scorelines.get(`${m.home.goals}-${m.away.goals}`) ?? 0) + 1);
    }
  }
}

const per = (v: number) => v / t.n;

describe('the engine reproduces football, per team per match', () => {
  it('scores about 1.40 goals', () => {
    expect(per(t.goals)).toBeGreaterThan(1.28);
    expect(per(t.goals)).toBeLessThan(1.55);
  });

  it('takes about 13 shots, of which about a third are on target', () => {
    expect(per(t.shots)).toBeGreaterThan(11.8);
    expect(per(t.shots)).toBeLessThan(14.2);
    const onTargetShare = t.onTarget / t.shots;
    expect(onTargetShare).toBeGreaterThan(0.30);
    expect(onTargetShare).toBeLessThan(0.38);
  });

  it('converts about 10.8% of shots', () => {
    const conversion = t.goals / t.shots;
    expect(conversion).toBeGreaterThan(0.095);
    expect(conversion).toBeLessThan(0.125);
  });

  it('commits about 10.4 fouls, taking about 1.9 yellows and rarely a red', () => {
    expect(per(t.fouls)).toBeGreaterThan(9.4);
    expect(per(t.fouls)).toBeLessThan(11.4);
    expect(per(t.yellows)).toBeGreaterThan(1.6);
    expect(per(t.yellows)).toBeLessThan(2.3);
    expect(per(t.reds)).toBeGreaterThan(0.01);
    expect(per(t.reds)).toBeLessThan(0.12);
  });
});

describe('and football-shaped matches', () => {
  it('runs about 2.8 goals a game, with the home side a little ahead', () => {
    const perMatch = t.goals / t.matches;
    expect(perMatch).toBeGreaterThan(2.6);
    expect(perMatch).toBeLessThan(3.1);
    const homeEdge = t.homeGoals / t.awayGoals;
    expect(homeEdge).toBeGreaterThan(1.12);
    expect(homeEdge).toBeLessThan(1.38);
  });

  it('keeps a clean sheet about a quarter of the time', () => {
    const rate = t.cleanSheets / t.n;
    expect(rate).toBeGreaterThan(0.21);
    expect(rate).toBeLessThan(0.33);
  });

  it('takes about a quarter of its goals from a dead ball', () => {
    // Set pieces are not decoration. They are the one route to a goal that does
    // not scale with the quality gap — a poor side with a big centre-half
    // scores from a corner against anyone — and without them a strong squad
    // beats a weak league by more than any real team has managed.
    const share = t.setPieceGoals / t.allGoals;
    expect(share).toBeGreaterThan(0.19);
    expect(share).toBeLessThan(0.33);
  });

  it('sets up about three quarters of its goals', () => {
    const assisted = t.assistedGoals / t.allGoals;
    expect(assisted).toBeGreaterThan(0.66);
    expect(assisted).toBeLessThan(0.82);
  });

  it('produces the ordinary scorelines most often, and the rare ones rarely', () => {
    const share = (s: string) => (scorelines.get(s) ?? 0) / t.matches;
    // 1-1, 1-0 and 2-1 are the three most common results in real football.
    expect(share('1-1')).toBeGreaterThan(0.07);
    expect(share('1-0')).toBeGreaterThan(0.06);
    expect(share('0-0')).toBeGreaterThan(0.03);
    expect(share('0-0')).toBeLessThan(0.12);
    // Nothing forbids a rout, but it must stay rare.
    const routs = [...scorelines.entries()]
      .filter(([s]) => {
        const [h, a] = s.split('-').map(Number);
        return Math.abs(h - a) >= 5;
      })
      .reduce((n, [, v]) => n + v, 0) / t.matches;
    expect(routs).toBeGreaterThan(0);
    expect(routs).toBeLessThan(0.05);
  });
});
