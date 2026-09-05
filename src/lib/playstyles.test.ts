// A style must be a decision, not a label.
//
// The six styles this replaced were worth 9.1 points per 10 games with the
// players held constant — a ladder, where picking the right one mattered more
// than having good footballers, and where possession beat everything because
// having the ball more meant more chances for free.
//
// These assert the three properties that make it a decision instead: no style
// wins on its own, styles counter each other, and a style you cannot execute
// does not work. See docs/playstyles.md.

import { describe, it, expect } from 'vitest';
import { gameData } from './gameData';
import {
  simulateMatch, PLAYSTYLES, pressFactor, congestionFactor, spaceFactor,
  type TeamSetup, type MatchPlayer, type PlaystyleName,
} from './matchEngine';
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

const roles = {
  goalMult: Object.fromEntries(gameData.roles.map(r => [r.name, r.goalMult])),
  assistMult: Object.fromEntries(gameData.roles.map(r => [r.name, r.assistMult])),
  qualities: Object.fromEntries(gameData.roles.map(r => [r.name, r.qualities ?? {}])),
};

const SHAPE: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];

/** A squad with a bit of everything, so no style is starved and none spoiled. */
const MIXED = [
  ['ShotStopper'], ['AttackingFullback'], ['Stopper'], ['BallPlayingDefender'], ['Pacey'],
  ['Winger'], ['Workhorse'], ['DeepLyingPlaymaker'], ['Dribbler'], ['TargetMan'], ['Pacey'],
];

function team(
  name: string, style: PlaystyleName, idBase: number,
  tags: string[][] = MIXED, rating = 78,
): TeamSetup {
  return {
    name, formation: '4-4-2', style, focus: { L: 1, C: 1, R: 1 }, cohesion: 72,
    players: SHAPE.map((position, i): MatchPlayer => ({
      playerId: idBase + i, name: `${name} ${i}`, position, rating, roles: tags[i] ?? [],
    })),
  };
}

/** Points per game for `a`, with home advantage alternated so it cancels. */
function duel(a: TeamSetup, b: TeamSetup, seed: number, matches = 900): number {
  const rand = rng(seed);
  let points = 0;
  for (let i = 0; i < matches; i++) {
    const m = i % 2 === 0 ? simulateMatch(a, b, rand, roles) : simulateMatch(b, a, rand, roles);
    const ag = i % 2 === 0 ? m.home.goals : m.away.goals;
    const bg = i % 2 === 0 ? m.away.goals : m.home.goals;
    if (ag > bg) points += 3;
    else if (ag === bg) points += 1;
  }
  return points / matches;
}

// An even matchup lands here, so it is the line every claim below is measured
// against rather than against 1.5.
const EVEN = duel(team('A', 'balanced', 0), team('B', 'balanced', 500), 11);

describe('no style wins on its own', () => {
  // Enough round-robins to be stable, few enough to finish inside the default
  // timeout under load — it was 60 seasons and 21,840 matches, which passed
  // alone and timed out in the full suite, looking exactly like flakiness.
  it('spreads identical squads by little more than a couple of points', { timeout: 20000 }, () => {
    const names = Object.keys(PLAYSTYLES) as PlaystyleName[];
    const teams = names.map((s, i) => team(s, s, i * 100));
    const pts: Record<string, number> = {};
    for (const t of teams) pts[t.name] = 0;
    const rand = rng(4242);
    const seasons = 30;
    for (let s = 0; s < seasons; s++) {
      for (const h of teams) for (const a of teams) {
        if (h === a) continue;
        const m = simulateMatch(h, a, rand, roles);
        if (m.home.goals > m.away.goals) pts[h.name] += 3;
        else if (m.away.goals > m.home.goals) pts[a.name] += 3;
        else { pts[h.name]++; pts[a.name]++; }
      }
    }
    const games = (teams.length - 1) * 2;
    const table = names.map(n => pts[n] / seasons).sort((x, y) => y - x);
    const perTenGames = ((table[0] - table[table.length - 1]) / games) * 10;
    expect(perTenGames, `style alone is worth ${perTenGames.toFixed(1)} points per 10 games`)
      .toBeLessThan(4);
  });

  it('has a control that behaves like an even match', () => {
    expect(EVEN).toBeGreaterThan(1.2);
    expect(EVEN).toBeLessThan(1.5);
  });
});

/**
 * A squad picked to play the style it is given.
 *
 * Testing a matchup with a generic squad tests the wrong thing: a gegenpress
 * side made of players who cannot press applies no press, so there is nothing
 * for a long ball to bypass. Real sides are built for their style, and the
 * question is whether one plan beats another when both are played properly.
 */
const SQUAD_FOR: Partial<Record<PlaystyleName, string[][]>> = {
  gegenpress: ['ShotStopper', 'Workhorse', 'Stopper', 'Stopper', 'Workhorse', 'PressingForward',
    'Workhorse', 'Workhorse', 'PressingForward', 'PressingForward', 'Pacey'].map(x => [x]),
  highPress: ['ShotStopper', 'Workhorse', 'Stopper', 'Stopper', 'Workhorse', 'PressingForward',
    'Workhorse', 'Workhorse', 'PressingForward', 'PressingForward', 'Pacey'].map(x => [x]),
  tikiTaka: ['SweeperKeeper', 'InvertedWingback', 'BallPlayingDefender', 'BallPlayingDefender',
    'InvertedWingback', 'Carrier', 'Regista', 'DeepLyingPlaymaker', 'ChanceCreator',
    'FalseNine', 'Trequartista'].map(x => [x]),
  positionalPlay: ['SweeperKeeper', 'InvertedWingback', 'BallPlayingDefender', 'BallPlayingDefender',
    'AttackingFullback', 'Carrier', 'Regista', 'Workhorse', 'ChanceCreator',
    'PressingForward', 'Trequartista'].map(x => [x]),
  routeOne: ['CommandingKeeper', 'NoNonsenseDefender', 'NoNonsenseDefender', 'Stopper',
    'CrossingSpecialist', 'CrossingSpecialist', 'Enforcer', 'Workhorse', 'CrossingSpecialist',
    'TargetMan', 'AerialThreat'].map(x => [x]),
  counter: ['ShotStopper', 'Pacey', 'Sweeper', 'Stopper', 'Pacey', 'Pacey',
    'Anchor', 'Workhorse', 'Pacey', 'Pacey', 'Poacher'].map(x => [x]),
  direct: ['ShotStopper', 'Pacey', 'Stopper', 'Sweeper', 'Pacey', 'Pacey',
    'Carrier', 'Workhorse', 'Pacey', 'Pacey', 'Poacher'].map(x => [x]),
  lowBlock: ['CommandingKeeper', 'NoNonsenseDefender', 'NoNonsenseDefender', 'Stopper',
    'Sweeper', 'Enforcer', 'Anchor', 'Workhorse', 'Workhorse', 'TargetMan',
    'AerialThreat'].map(x => [x]),
};

const built = (name: string, style: PlaystyleName, idBase: number) =>
  team(name, style, idBase, SQUAD_FOR[style] ?? MIXED);

/** Shots per match for the first side. Far less noisy than points. */
function shotsFor(att: TeamSetup, def: TeamSetup, seed: number, matches = 500): number {
  const rand = rng(seed);
  let shots = 0;
  for (let i = 0; i < matches; i++) shots += simulateMatch(att, def, rand, roles).home.shots;
  return shots / matches;
}

describe('the interaction rules', () => {
  // Tested for what they claim. Every attempt to read them off shot counts got
  // confounded: a pressing side and a low block differ in tempo by half again,
  // and a squad stripped of its traits is weaker everywhere rather than only at
  // pressing. Measured that way the press came out backwards.
  const PRESS = 0.4;

  it('a press costs a side playing out, and barely touches one going long', () => {
    const short = pressFactor(PLAYSTYLES.tikiTaka.buildUp, 0.1, PRESS);
    const long = pressFactor(PLAYSTYLES.routeOne.buildUp, 0.1, PRESS);
    expect(short, `short build-up keeps ${short.toFixed(3)}, long ball ${long.toFixed(3)}`)
      .toBeLessThan(long);
    expect(long, 'going long should be nearly immune').toBeGreaterThan(0.97);
  });

  it('lets a technical side play through a press', () => {
    const technical = pressFactor(PLAYSTYLES.tikiTaka.buildUp, 0.9, PRESS);
    const not = pressFactor(PLAYSTYLES.tikiTaka.buildUp, 0.0, PRESS);
    expect(technical, `${technical.toFixed(3)} with resistance, ${not.toFixed(3)} without`)
      .toBeGreaterThan(not);
    // It plays through a press; it is not immune to one. Eight per cent is what
    // a heavy press still costs a side committed to building from the back.
    expect(technical).toBeGreaterThan(0.88);
  });

  it('does nothing to anybody when the opponent cannot press', () => {
    expect(pressFactor(1, 0, 0)).toBe(1);
  });

  it('congests a patient side against a deep block, and creation relieves it', () => {
    const patient = congestionFactor(PLAYSTYLES.tikiTaka.buildUp, 0, PLAYSTYLES.lowBlock.line);
    const creative = congestionFactor(PLAYSTYLES.tikiTaka.buildUp, 0.5, PLAYSTYLES.lowBlock.line);
    const direct = congestionFactor(PLAYSTYLES.routeOne.buildUp, 0, PLAYSTYLES.lowBlock.line);
    expect(patient).toBeLessThan(1);
    expect(creative, 'creation should unpick a deep block').toBeGreaterThan(patient);
    expect(direct, 'going long is not congested').toBeGreaterThan(patient);
  });

  it('does not congest anyone against a high line', () => {
    expect(congestionFactor(1, 0, 1)).toBe(1);
  });

  it('rewards runners against a high line and nothing against a deep one', () => {
    const vsHigh = spaceFactor(PLAYSTYLES.direct.buildUp, 0.6, 1, PLAYSTYLES.gegenpress.line, 0);
    const vsDeep = spaceFactor(PLAYSTYLES.direct.buildUp, 0.6, 1, PLAYSTYLES.lowBlock.line, 0);
    expect(vsHigh, `${vsHigh.toFixed(3)} against a high line, ${vsDeep.toFixed(3)} against a deep one`)
      .toBeGreaterThan(vsDeep);
  });

  it('gives a patient side nothing from space in behind', () => {
    const patient = spaceFactor(PLAYSTYLES.tikiTaka.buildUp, 0.6, 1, 0.9, 0);
    const direct = spaceFactor(PLAYSTYLES.direct.buildUp, 0.6, 1, 0.9, 0);
    expect(patient).toBeLessThan(direct);
  });

  it('lets recovery pace cover the space', () => {
    const exposed = spaceFactor(0.3, 0.6, 1, 0.9, 0);
    const covered = spaceFactor(0.3, 0.6, 1, 0.9, 0.6);
    expect(covered, `${covered.toFixed(3)} with recovery, ${exposed.toFixed(3)} without`)
      .toBeLessThan(exposed);
    expect(covered).toBe(1);
  });

  it('gives nothing to a side that cannot play its style', () => {
    const canPlay = spaceFactor(0.3, 0.6, 1, 0.9, 0);
    const cannot = spaceFactor(0.3, 0.6, 0, 0.9, 0);
    expect(cannot).toBeLessThan(canPlay);
  });
});

describe('and the counters that follow from them', () => {
  it('a counter-attacking side does better than even against a high line', () => {
    const ppg = duel(built('A', 'counter', 0), built('B', 'positionalPlay', 500), 31);
    expect(ppg, `${ppg.toFixed(2)} against an even ${EVEN.toFixed(2)}`).toBeGreaterThan(EVEN);
  });

  it('lets a better side beat a low block, which is the quality claim', () => {
    // Deliberately not asserted between EQUAL sides. Parking the bus against a
    // possession team is a perfectly good plan when the players are the same,
    // which is exactly why teams do it.
    const good = team('Good', 'positionalPlay', 0, SQUAD_FOR.positionalPlay, 84);
    const parked = team('Parked', 'lowBlock', 500, SQUAD_FOR.lowBlock, 74);
    const ppg = duel(good, parked, 91);
    expect(ppg, `${ppg.toFixed(2)} against an even ${EVEN.toFixed(2)}`).toBeGreaterThan(EVEN);
  });
});

describe('a style you cannot play does not work', () => {
  const NO_TAGS = SHAPE.map(() => [] as string[]);
  const TECHNICAL = ['ShotStopper', 'BallPlayingDefender', 'BallPlayingDefender', 'Stopper',
    'AttackingFullback', 'Carrier', 'Regista', 'DeepLyingPlaymaker', 'ChanceCreator',
    'FalseNine', 'Trequartista'].map(x => [x]);
  const QUICK = ['ShotStopper', 'Pacey', 'Stopper', 'Sweeper', 'Pacey', 'Pacey',
    'Workhorse', 'Anchor', 'Pacey', 'Pacey', 'Poacher'].map(x => [x]);

  it('rewards tiki-taka only with the technicians for it', () => {
    const ppg = duel(team('With', 'tikiTaka', 0, TECHNICAL),
      team('Without', 'tikiTaka', 500, NO_TAGS), 77);
    expect(ppg, `${ppg.toFixed(2)} against an even ${EVEN.toFixed(2)}`).toBeGreaterThan(EVEN + 0.1);
  });

  it('rewards counter-attacking only with the runners for it', () => {
    const ppg = duel(team('With', 'counter', 0, QUICK),
      team('Without', 'counter', 500, NO_TAGS), 79);
    expect(ppg, `${ppg.toFixed(2)} against an even ${EVEN.toFixed(2)}`).toBeGreaterThan(EVEN + 0.1);
  });

  it('asks nothing of a balanced side, which is what makes it safe', () => {
    expect(PLAYSTYLES.balanced.needs).toEqual({});
  });
});

describe('slowing the game down is an underdog strategy', () => {
  it('gives a weak side a better chance the fewer chances there are', () => {
    // Arithmetic, not a thumb on the scale: signal grows with the number of
    // chances and noise only with its square root, so a low-scoring game is
    // where quality is expressed least often. It is why the worst teams are
    // the most defensive, and it needs no rule of its own.
    const result = (style: PlaystyleName) => {
      const strong = team('Strong', style, 0, MIXED, 84);
      const weak = team('Weak', style, 500, MIXED, 70);
      const rand = rng(555);
      let got = 0;
      const M = 1500;
      for (let i = 0; i < M; i++) {
        const m = i % 2 === 0 ? simulateMatch(strong, weak, rand, roles)
          : simulateMatch(weak, strong, rand, roles);
        const sg = i % 2 === 0 ? m.home.goals : m.away.goals;
        const wg = i % 2 === 0 ? m.away.goals : m.home.goals;
        if (wg >= sg) got++;
      }
      return got / M;
    };
    const parked = result('parkTheBus');
    const open = result('gegenpress');
    expect(parked, `parked ${(100 * parked).toFixed(1)}% v open ${(100 * open).toFixed(1)}%`)
      .toBeGreaterThan(open);
  });
});

describe('the taxonomy', () => {
  it('places every style on all three axes', () => {
    for (const [name, s] of Object.entries(PLAYSTYLES)) {
      expect(s.name, `${name} name`).toBe(name);
      expect(s.buildUp, `${name} buildUp`).toBeGreaterThanOrEqual(0);
      expect(s.buildUp, `${name} buildUp`).toBeLessThanOrEqual(1);
      expect(s.line, `${name} line`).toBeGreaterThanOrEqual(0);
      expect(s.line, `${name} line`).toBeLessThanOrEqual(1);
      expect(s.tempo, `${name} tempo`).toBeGreaterThan(0.5);
      expect(s.tempo, `${name} tempo`).toBeLessThan(1.5);
    }
  });

  it('only asks for qualities a trait can actually provide', () => {
    const provided = new Set(gameData.roles.flatMap(r => Object.keys(r.qualities ?? {})));
    for (const [name, s] of Object.entries(PLAYSTYLES)) {
      for (const need of Object.keys(s.needs)) {
        expect(provided, `${name} needs "${need}", which no trait grants`).toContain(need);
      }
    }
  });

  it('keeps route one and direct as different things', () => {
    // Direct is fast vertical passing to feet and into space; route one is a
    // long ball to a target man. They want different players.
    expect(PLAYSTYLES.direct.needs.pace).toBeGreaterThan(0);
    expect(PLAYSTYLES.routeOne.needs.aerial).toBeGreaterThan(0);
    expect(PLAYSTYLES.direct.buildUp).toBeGreaterThan(PLAYSTYLES.routeOne.buildUp);
  });

  it('keeps a low block, catenaccio and parking the bus as different things', () => {
    // Parking the bus trades all attacking intent for density; catenaccio is
    // an attacking plan wearing a defensive shape, and asks for an outlet.
    expect(PLAYSTYLES.parkTheBus.tempo).toBeLessThan(PLAYSTYLES.lowBlock.tempo);
    expect(PLAYSTYLES.catenaccio.needs.pace).toBeGreaterThan(0);
    expect(PLAYSTYLES.lowBlock.needs.pace ?? 0).toBe(0);
  });
});
