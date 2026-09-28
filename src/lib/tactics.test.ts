// Choosing a style, and what it does to a season.
//
// A style is played by the match engine; the interaction rules themselves are
// tested in playstyles.test.ts. What is tested here is the seam: what the
// pre-season screen is told about a style, and that the choice reaches the
// season. Tests that pinned a style's points total would break on the first
// piece of tuning; these assert the shape of the trade.

import { describe, expect, it } from 'vitest';
import type { Position } from './formations';
import { PLAYSTYLES, type PlaystyleName } from './matchEngine';
import {
  simulateSeason,
  tacticEffect,
  type OpponentSquad,
  type RoleConfig,
  type SquadPick,
} from './simulation';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const XI_POSITIONS: Position[] = [
  'ST', 'ST', 'LM', 'CDM', 'CM', 'RM', 'LB', 'CB', 'CB', 'RB', 'GK',
];

/** An XI of one rating, optionally with a role on every player. */
function makeXI(rating: number, roles: string[] = []): SquadPick[] {
  return XI_POSITIONS.map((position, slotIndex) => ({
    slotIndex,
    position,
    playerId: 9000 + slotIndex,
    playerName: `Player ${slotIndex} ${position}`,
    rating,
    clubName: 'Test XI',
    seasonLabel: '2025/26',
    positions: [position],
    roles,
  }));
}

function makeOpponents(rating: number): OpponentSquad[] {
  return Array.from({ length: 19 }, (_, i) => ({
    clubName: `Opponent ${i + 1}`,
    strength: rating,
    players: XI_POSITIONS.map((position, j) => ({
      id: String(j),
      name: `Opp ${i}-${j}`,
      role: position === 'GK' ? ('gk' as const)
        : ['LB', 'CB', 'RB'].includes(position) ? ('def' as const)
        : ['ST'].includes(position) ? ('att' as const)
        : ('mid' as const),
      position,
      rating,
      roles: [],
    })),
  }));
}

/** A role that is good at everything a style could ask for. */
const COMPLETE: RoleConfig = {
  qualities: {
    Complete: {
      pressResist: 3, pressing: 3, pace: 3, creation: 3,
      aerial: 3, recovery: 3, dribble: 3, setPiece: 3,
    },
  },
};

const STYLES = Object.keys(PLAYSTYLES) as PlaystyleName[];

// ── The effect of a style ────────────────────────────────────────────────────

describe('tacticEffect', () => {
  it('asks nothing of a balanced side, which is what makes it safe', () => {
    const plan = tacticEffect(makeXI(80), 'balanced');
    expect(plan.fit).toBe(1);
    expect(plan.tempo).toBe(1);
  });

  it('gives no fit to a side without the players a style needs', () => {
    // Gegenpress asks for pressing and pace. An XI with no roles has neither.
    expect(tacticEffect(makeXI(80), 'gegenpress').fit).toBe(0);
  });

  it('gives full fit to a side that has them', () => {
    expect(tacticEffect(makeXI(80, ['Complete']), 'gegenpress', COMPLETE).fit).toBeGreaterThan(0.9);
  });

  it('reports the style as the engine plays it', () => {
    for (const style of STYLES) {
      const plan = tacticEffect(makeXI(80), style);
      expect(plan.line, style).toBe(PLAYSTYLES[style].line);
      expect(plan.buildUp, style).toBe(PLAYSTYLES[style].buildUp);
      expect(plan.tempo, style).toBe(PLAYSTYLES[style].tempo);
      expect(plan.possessionBias, style).toBe(PLAYSTYLES[style].possessionBias);
    }
  });

  it('falls back to balanced for a style it does not know', () => {
    const plan = tacticEffect(makeXI(80), 'catenaccio-ish' as PlaystyleName);
    expect(plan.style).toBe('balanced');
  });
});

// ── What a style does to a season ────────────────────────────────────────────

describe('a season played to a plan', () => {
  const SEEDS = [11, 29, 57, 83, 101, 137];

  // Every season here is 380 matches played out possession by possession,
  // about a tenth of a second each, so these tests get a longer timeout.
  const SLOW = { timeout: 60_000 };

  function seasons(style: PlaystyleName, rating: number, complete = true) {
    return SEEDS.map(seed => complete
      ? simulateSeason(makeXI(rating, ['Complete']), makeOpponents(78), seed, COMPLETE, style)
      : simulateSeason(makeXI(rating), makeOpponents(78), seed, undefined, style));
  }

  function average(
    style: PlaystyleName, rating: number, of: (r: ReturnType<typeof seasons>[number]) => number, complete = true,
  ) {
    const runs = seasons(style, rating, complete);
    return runs.reduce((sum, r) => sum + of(r), 0) / runs.length;
  }

  it('plays the same season for the same seed and plan', () => {
    const a = simulateSeason(makeXI(84), makeOpponents(78), 4242, undefined, 'counter');
    const b = simulateSeason(makeXI(84), makeOpponents(78), 4242, undefined, 'counter');
    expect(a).toEqual(b);
  });

  it('plays a different season under a different plan', () => {
    const balanced = simulateSeason(makeXI(84), makeOpponents(78), 4242, undefined, 'balanced');
    const parked   = simulateSeason(makeXI(84), makeOpponents(78), 4242, undefined, 'parkTheBus');
    expect(parked.points).not.toBe(balanced.points);
  });

  it('produces a quieter season the slower the tempo', SLOW, () => {
    // The whole underdog argument rests on this: fewer chances, fewer goals at
    // both ends. If it stops being true, slowing a game down stops being a
    // real decision.
    const parked = average('parkTheBus', 80, r => r.goalsFor + r.goalsAgainst);
    const gegen  = average('gegenpress', 80, r => r.goalsFor + r.goalsAgainst);
    expect(parked).toBeLessThan(gegen);
  });

  it('leaves the other nineteen clubs playing their own football', () => {
    // The player's style is played in the player's matches. The rest of the
    // league keeps scoring whatever the XI chose.
    const goalsElsewhere = (style: PlaystyleName) => {
      const result = simulateSeason(makeXI(80), makeOpponents(78), 777, undefined, style);
      return result.gameweeks.flatMap(gw => gw.fixtures)
        .filter(f => !f.userInvolved)
        .reduce((sum, f) => sum + f.homeGoals + f.awayGoals, 0);
    };
    // Not equal, but close: the same random stream is consumed in a different
    // order once the user's matches produce different numbers of goals.
    expect(goalsElsewhere('parkTheBus')).toBeGreaterThan(0);
    expect(goalsElsewhere('balanced')).toBeGreaterThan(0);
  });

  it('does not hand any style a season the others cannot match', SLOW, () => {
    // Measured, not asserted from the constants: no style may be worth more
    // than about a fifth of a season's points over the worst one. A ladder of
    // styles would make picking one matter more than picking players, which is
    // what went wrong with the six styles this taxonomy replaced.
    const points = STYLES.map(style => average(style, 82, r => r.points));
    const spread = Math.max(...points) - Math.min(...points);
    expect(spread).toBeLessThan(20);
  });

  it('suits a strong side and a weak side differently', SLOW, () => {
    // The point of a tactic: the best answer depends on who is playing. A
    // strong side is better off in a fast game, a weak one in a slow game,
    // because signal grows with the chances and noise with their square root.
    //
    // Played without the Complete role on purpose. It gives every player the
    // most of every quality, and the engine reads those as real advantages —
    // in the air, on the ball, in behind — so a "68" side of them took 74
    // points off 78-rated opposition. That is not an underdog.
    const strongFast = average('gegenpress', 88, r => r.points, false) - average('parkTheBus', 88, r => r.points, false);
    const weakFast   = average('gegenpress', 68, r => r.points, false) - average('parkTheBus', 68, r => r.points, false);
    expect(strongFast).toBeGreaterThan(weakFast);
  });
});
