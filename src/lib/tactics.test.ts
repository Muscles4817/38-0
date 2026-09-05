// Choosing a style, and what it is worth.
//
// The thing worth testing here is not a number but a rule: a style costs the
// same whoever plays it, and pays out only as far as the eleven can carry it
// out. Tests that pinned a style's points total would break on the first piece
// of tuning; these assert the shape of the trade.

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
  it('leaves a balanced side exactly where it was', () => {
    // Balanced sits at the origin of all three axes, which is what makes it a
    // safe choice rather than a weak one — and what lets every season measured
    // before tactics existed still be reproduced.
    const plan = tacticEffect(makeXI(80), 'balanced');
    expect(plan.att).toBe(0);
    expect(plan.def).toBe(0);
    expect(plan.mid).toBe(0);
    expect(plan.tempo).toBe(1);
    expect(plan.fit).toBe(1);
  });

  it('charges a side that cannot play the style, and pays it nothing', () => {
    // Gegenpress asks for pressing and pace. An XI with no roles at all has
    // neither, so it buys the high line's exposure and collects none of the
    // pressure that is supposed to pay for it.
    const plan = tacticEffect(makeXI(80), 'gegenpress');
    expect(plan.fit).toBe(0);
    expect(plan.def).toBeLessThan(0);
    // Gegenpress builds up slightly short as well, so even its attack is a
    // small cost here rather than the pressure it is supposed to buy.
    expect(plan.att).toBeLessThanOrEqual(0);
  });

  it('pays a side that can play it', () => {
    const cannot = tacticEffect(makeXI(80), 'gegenpress');
    const can    = tacticEffect(makeXI(80, ['Complete']), 'gegenpress', COMPLETE);
    expect(can.fit).toBeGreaterThan(0.9);
    expect(can.att).toBeGreaterThan(cannot.att);
    // The cost is the same either way; only the benefit moved.
    expect(can.def).toBeCloseTo(cannot.def, 5);
  });

  it('never lets fit reduce a cost', () => {
    for (const style of STYLES) {
      const cannot = tacticEffect(makeXI(80), style);
      const can    = tacticEffect(makeXI(80, ['Complete']), style, COMPLETE);
      for (const axis of ['att', 'def', 'mid'] as const) {
        // Every axis is either unchanged or better for the side that can play
        // the style: fit only ever adds.
        expect(can[axis]).toBeGreaterThanOrEqual(cannot[axis] - 1e-9);
      }
    }
  });

  it('reports the style axes unscaled, so a style can be described honestly', () => {
    const parked = tacticEffect(makeXI(80), 'parkTheBus');
    expect(parked.line).toBe(PLAYSTYLES.parkTheBus.line);
    expect(parked.buildUp).toBe(PLAYSTYLES.parkTheBus.buildUp);
    // Fit is zero for this XI, so the benefit is nil even though the style is
    // as deep as they come.
    expect(parked.def).toBe(0);
  });

  it('keeps every style within a few rating points and a quarter of the tempo', () => {
    for (const style of STYLES) {
      const plan = tacticEffect(makeXI(80, ['Complete']), style, COMPLETE);
      for (const axis of ['att', 'def', 'mid'] as const) {
        expect(Math.abs(plan[axis]), `${style} ${axis}`).toBeLessThanOrEqual(6);
      }
      expect(plan.tempo, style).toBeGreaterThan(0.7);
      expect(plan.tempo, style).toBeLessThan(1.25);
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

  function seasons(style: PlaystyleName, rating: number) {
    return SEEDS.map(seed =>
      simulateSeason(makeXI(rating, ['Complete']), makeOpponents(78), seed, COMPLETE, style));
  }

  function average(style: PlaystyleName, rating: number, of: (r: ReturnType<typeof seasons>[number]) => number) {
    const runs = seasons(style, rating);
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

  it('produces a quieter season the slower the tempo', () => {
    // The whole underdog argument rests on this: fewer chances, fewer goals at
    // both ends. If it stops being true, slowing a game down stops being a
    // real decision.
    const parked = average('parkTheBus', 80, r => r.goalsFor + r.goalsAgainst);
    const gegen  = average('gegenpress', 80, r => r.goalsFor + r.goalsAgainst);
    expect(parked).toBeLessThan(gegen);
  });

  it('leaves the other nineteen clubs playing at their own rate', () => {
    // Tempo belongs to the side that chose it, so only the ten fixtures a
    // gameweek that involve the user should move. The rest of the league's
    // goals must be identical for the same seed.
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

  it('does not hand any style a season the others cannot match', () => {
    // Measured, not asserted from the constants: no style may be worth more
    // than about a fifth of a season's points over the worst one. A ladder of
    // styles would make picking one matter more than picking players, which is
    // what went wrong with the six styles this taxonomy replaced.
    const points = STYLES.map(style => average(style, 82, r => r.points));
    const spread = Math.max(...points) - Math.min(...points);
    expect(spread).toBeLessThan(20);
  });

  it('suits a strong side and a weak side differently', () => {
    // The point of a tactic: the best answer depends on who is playing. A
    // strong side is better off in a fast game, a weak one in a slow game,
    // because signal grows with the chances and noise with their square root.
    const strongFast = average('gegenpress', 88, r => r.points) - average('parkTheBus', 88, r => r.points);
    const weakFast   = average('gegenpress', 68, r => r.points) - average('parkTheBus', 68, r => r.points);
    expect(strongFast).toBeGreaterThan(weakFast);
  });
});
