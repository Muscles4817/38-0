// ── Suspensions ──────────────────────────────────────────
//
// A player sent off, or booked once too often, misses his side's next
// matches, and the best player on the bench for his slot stands in. The rules
// are the Premier League's, simplified only where the engine cannot tell the
// difference:
//
//   - A second yellow in a match: one match.
//   - A straight red: three matches (the engine's straight reds are serious
//     foul play; there is no handball or denial of a goal to tell apart).
//   - Yellows build up: a fifth by the side's 19th match costs one match, a
//     tenth by its 32nd costs two, a fifteenth costs three. The two yellows
//     that make a red do not count towards these.
//
// Suspensions apply to every side or none: only when the player has a bench,
// so a run without one plays exactly as it always did. See docs/bench.md.

import { canFillSlot, effectiveRating, type Position } from './formations';

/** A fifth, tenth and fifteenth yellow, and the last match each counts in. */
const ACCUMULATION: readonly { yellows: number; byMatch: number; ban: number }[] = [
  { yellows: 5, byMatch: 19, ban: 1 },
  { yellows: 10, byMatch: 32, ban: 2 },
  { yellows: 15, byMatch: Infinity, ban: 3 },
];
const SECOND_YELLOW_BAN = 1;
const STRAIGHT_RED_BAN = 3;

/**
 * Rating points off a stand-in who cannot play the slot at all. The ordinary
 * out-of-position penalty (4) is for a player one slot over; this is for an
 * outfield player in goal, or a centre-back up front because nobody else is
 * left, and it should hurt as much as it would.
 */
export const EMERGENCY_PENALTY = 20;

/** One side's disciplinary record through a season, keyed by season player id. */
export interface Discipline {
  yellows: Map<number, number>;
  /** Matches still to serve. */
  banned: Map<number, number>;
}

export function newDiscipline(): Discipline {
  return { yellows: new Map(), banned: new Map() };
}

export function isBanned(d: Discipline, playerId: number): boolean {
  return (d.banned.get(playerId) ?? 0) > 0;
}

/** Why a player is out, for saying so. */
export type BanReason = 'red' | 'second-yellow' | 'yellows';

/**
 * Records a match the side has just played: everyone already banned has served
 * one more match, then this match's cards add new bans. `matchNumber` is the
 * side's match, from 1. Returns the bans this match gave.
 */
export function recordMatch(
  d: Discipline,
  cards: readonly { playerId: number; yellow: boolean; red: boolean }[],
  matchNumber: number,
): { playerId: number; matches: number; reason: BanReason }[] {
  for (const [id, left] of d.banned) {
    if (left <= 1) d.banned.delete(id); else d.banned.set(id, left - 1);
  }
  const given: { playerId: number; matches: number; reason: BanReason }[] = [];
  const ban = (playerId: number, matches: number, reason: BanReason) => {
    d.banned.set(playerId, (d.banned.get(playerId) ?? 0) + matches);
    given.push({ playerId, matches, reason });
  };
  for (const c of cards) {
    if (c.red) {
      // Booked in the same match means the red was a second yellow.
      if (c.yellow) ban(c.playerId, SECOND_YELLOW_BAN, 'second-yellow');
      else ban(c.playerId, STRAIGHT_RED_BAN, 'red');
      continue;
    }
    if (!c.yellow) continue;
    const total = (d.yellows.get(c.playerId) ?? 0) + 1;
    d.yellows.set(c.playerId, total);
    const step = ACCUMULATION.find(a => a.yellows === total);
    if (step && matchNumber <= step.byMatch) ban(c.playerId, step.ban, 'yellows');
  }
  return given;
}

export interface StandInCandidate {
  rating: number;
  positions: Position[];
}

export interface StandIn<C> {
  /** The bench player, or null when nobody is left at all. */
  player: C | null;
  /** His rating in the slot. */
  rating: number;
  /** False when he cannot play the slot and takes the emergency penalty. */
  fits: boolean;
}

/**
 * Who stands in for each banned slot. The goalkeeper's slot is filled first,
 * then the rest in order; each takes the bench player rated highest in that
 * slot among those who can play it, and failing that the best-rated player
 * left, at the emergency penalty. No bench player is used twice.
 */
export function pickStandIns<C extends StandInCandidate>(
  slots: readonly Position[], bench: readonly C[], unavailable: (c: C) => boolean,
): StandIn<C>[] {
  const used = new Set<C>();
  const out = new Array<StandIn<C>>(slots.length);
  const order = slots.map((s, i) => i).sort((a, b) => Number(slots[b] === 'GK') - Number(slots[a] === 'GK'));
  for (const i of order) {
    const slot = slots[i];
    const free = bench.filter(c => !used.has(c) && !unavailable(c));
    const fitting = free.filter(c => canFillSlot(c.positions, slot));
    let choice: StandIn<C>;
    if (fitting.length > 0) {
      const best = fitting.reduce((a, b) =>
        effectiveRating(b.rating, b.positions, slot) > effectiveRating(a.rating, a.positions, slot) ? b : a);
      choice = { player: best, rating: effectiveRating(best.rating, best.positions, slot), fits: true };
    } else if (free.length > 0) {
      // A keeper is the worst outfield choice for an outfield slot.
      const outfield = free.filter(c => !c.positions.includes('GK'));
      const pool = outfield.length > 0 && slot !== 'GK' ? outfield : free;
      const best = pool.reduce((a, b) => (b.rating > a.rating ? b : a));
      choice = { player: best, rating: Math.max(1, best.rating - EMERGENCY_PENALTY), fits: false };
    } else {
      choice = { player: null, rating: 0, fits: false };
    }
    if (choice.player) used.add(choice.player);
    out[i] = choice;
  }
  return out;
}
