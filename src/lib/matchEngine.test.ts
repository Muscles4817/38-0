import { describe, it, expect } from 'vitest';
import {
  simulateMatch, inferStyle, PLAYSTYLES,
  type TeamSetup, type MatchPlayer, type PlaystyleName,
} from './matchEngine';
import type { Position } from './formations';

/**
 * mulberry32.
 *
 * Not the LCG the old engine used. That one has a modulus of 233,280 and the
 * obvious 32-bit variant overflows JavaScript's safe integer range on the
 * multiply, which returns correlated draws. The first calibration run of this
 * engine reported a home/away goal ratio of 2.19 on identical squads purely
 * because of that, so the generator matters here: a match makes several hundred
 * draws where the old engine made two.
 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHAPE: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];

function team(
  name: string, rating: number, style: PlaystyleName = 'balanced', idBase = 0,
  roles: Record<number, string[]> = {},
): TeamSetup {
  const players: MatchPlayer[] = SHAPE.map((position, i) => ({
    playerId: idBase + i, name: `${name} ${i}`, position, rating, roles: roles[i] ?? [],
  }));
  return { name, players, formation: '4-4-2', style, focus: { L: 1, C: 1, R: 1 } };
}

describe('a match', () => {
  it('is reproducible for a seed, and different for another', () => {
    const h = team('H', 80, 'balanced', 0);
    const a = team('A', 80, 'balanced', 100);
    const one = simulateMatch(h, a, rng(7));
    const two = simulateMatch(h, a, rng(7));
    expect(two.home.goals).toBe(one.home.goals);
    expect(two.away.goals).toBe(one.away.goals);
    expect(two.events).toEqual(one.events);

    // Not an assertion that two seeds differ in score — they can agree — but
    // the whole event list agreeing would mean the seed is ignored.
    const other = simulateMatch(h, a, rng(8));
    expect(JSON.stringify(other.events)).not.toBe(JSON.stringify(one.events));
  });

  it('books goals to the players who scored them', () => {
    const rand = rng(11);
    const h = team('H', 84, 'balanced', 0);
    const a = team('A', 72, 'balanced', 100);
    for (let i = 0; i < 60; i++) {
      const m = simulateMatch(h, a, rand);
      for (const side of [m.home, m.away]) {
        const scored = side.players.reduce((n, p) => n + p.goals, 0);
        expect(scored).toBe(side.goals);
        // A goal cannot be assisted by its own scorer.
        for (const e of m.events.filter(e => e.type === 'goal')) {
          if (e.assistId !== undefined) expect(e.assistId).not.toBe(e.playerId);
        }
        // Nobody is on target more often than they shot.
        for (const p of side.players) expect(p.shotsOnTarget).toBeLessThanOrEqual(p.shots);
      }
    }
  });

  it('reaches wide scorelines without being told to', () => {
    // The point of the rewrite: no floor, no cap, no target. Given enough
    // matches between mismatched sides, football's whole range shows up.
    const rand = rng(2024);
    const strong = team('Strong', 88, 'balanced', 0);
    const weak = team('Weak', 68, 'balanced', 100);
    const seen = new Set<string>();
    let biggest = 0;
    for (let i = 0; i < 4000; i++) {
      const m = simulateMatch(strong, weak, rand);
      seen.add(`${m.home.goals}-${m.away.goals}`);
      biggest = Math.max(biggest, m.home.goals + m.away.goals);
    }
    expect(seen.has('0-0')).toBe(true);
    expect(seen.has('1-0')).toBe(true);
    expect(biggest).toBeGreaterThanOrEqual(7);
    expect(seen.size).toBeGreaterThan(25);
  });

  it('lets the better side win more often than not', () => {
    const rand = rng(99);
    const strong = team('Strong', 87, 'balanced', 0);
    const weak = team('Weak', 71, 'balanced', 100);
    let strongWins = 0, weakWins = 0;
    for (let i = 0; i < 600; i++) {
      const m = simulateMatch(strong, weak, rand);
      if (m.home.goals > m.away.goals) strongWins++;
      else if (m.away.goals > m.home.goals) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2);
    // But not every time. Football is not deterministic and neither is this.
    expect(weakWins).toBeGreaterThan(0);
  });
});

describe('playstyles are trade-offs', () => {
  const run = (styleA: PlaystyleName, styleB: PlaystyleName, n = 400) => {
    const rand = rng(555);
    let aGoals = 0, bGoals = 0, aShots = 0, bShots = 0, aPoss = 0;
    for (let i = 0; i < n; i++) {
      const m = simulateMatch(team('A', 80, styleA, 0), team('B', 80, styleB, 100), rand);
      aGoals += m.home.goals; bGoals += m.away.goals;
      aShots += m.home.shots; bShots += m.away.shots;
      aPoss += m.home.possession;
    }
    return { aGoals: aGoals / n, bGoals: bGoals / n, aShots: aShots / n, bShots: bShots / n, aPoss: aPoss / n };
  };

  it('gives a possession side the ball and a counter side fewer, better chances', () => {
    const poss = run('possession', 'counter');
    expect(poss.aPoss).toBeGreaterThan(60);
    expect(poss.aShots).toBeGreaterThan(poss.bShots);
    // Counter-attacking is paid in quality: fewer shots, more goals per shot.
    expect(poss.bGoals / poss.bShots).toBeGreaterThan(poss.aGoals / poss.aShots);
  });

  it('makes a low block hard to score against', () => {
    const vsLow = run('balanced', 'lowBlock');
    const vsPress = run('balanced', 'highPress');
    expect(vsLow.aGoals).toBeLessThan(vsPress.aGoals);
  });

  it('sends route one to the players who win headers', () => {
    const rand = rng(31);
    // Only the second striker is an aerial threat.
    const withTarget = team('Route', 80, 'routeOne', 0, { 10: ['AerialThreat'] });
    const plain = team('Plain', 80, 'routeOne', 0);
    const opp = team('Opp', 80, 'balanced', 100);
    const share = (t: TeamSetup) => {
      let target = 0, total = 0;
      for (let i = 0; i < 300; i++) {
        const m = simulateMatch(t, opp, rand);
        for (const p of m.home.players) { total += p.goals; if (p.playerId === 10) target += p.goals; }
      }
      return total === 0 ? 0 : target / total;
    };
    expect(share(withTarget)).toBeGreaterThan(share(plain));
  });

  it('describes every style it offers', () => {
    for (const [name, style] of Object.entries(PLAYSTYLES)) {
      expect(style.name).toBe(name);
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.possessionBias).toBeGreaterThan(0);
    }
  });
});

describe('discipline', () => {
  it('never books or sends off a player twice, and a red ends his match', () => {
    const rand = rng(404);
    for (let i = 0; i < 300; i++) {
      const m = simulateMatch(
        team('H', 80, 'highPress', 0), team('A', 80, 'highPress', 100), rand);
      for (const side of [m.home, m.away]) {
        // A player is booked at most once: a second offence is a red, and is
        // counted as one rather than as another yellow.
        expect(side.reds).toBe(side.players.filter(p => p.red).length);
        expect(side.yellows).toBe(side.players.filter(p => p.yellow).length);
        expect(side.fouls).toBe(side.players.reduce((n, p) => n + p.fouls, 0));
      }
      const reds = m.events.filter(e => e.type === 'red');
      const ids = reds.map(e => e.playerId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('inferStyle', () => {
  it('reads route one from two strikers and a target man with nobody creating', () => {
    const players = team('X', 78, 'balanced', 0, { 9: ['TargetMan'] }).players;
    expect(inferStyle(players).style).toBe('routeOne');
  });

  it('reads possession from a side full of creators', () => {
    const players = team('X', 82, 'balanced', 0, {
      6: ['DeepLyingPlaymaker'], 7: ['Regista'],
    }).players;
    expect(inferStyle(players).style).toBe('possession');
  });

  it('always returns usable focus weights', () => {
    const { focus } = inferStyle(team('X', 75).players);
    for (const z of ['L', 'C', 'R'] as const) expect(focus[z]).toBeGreaterThan(0);
  });
});
