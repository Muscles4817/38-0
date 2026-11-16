// ── The bench ────────────────────────────────────────────
//
// Five players drafted after the eleven, used by the player's own choice: to
// pick the starting eleven before kick-off, and to change the shape and the
// personnel at half-time. Nothing else uses them yet: no injuries, no
// suspensions, no rotation, and the opponents have no bench. See
// docs/bench.md.
//
// A bench pick is a SquadPick whose slotIndex is BENCH_SLOT_BASE or above, so
// it can never be read as a formation slot (those are 0–10).

import { canFillSlot, effectiveRating, getFormation, type Formation, type Position } from './formations';
import type { SquadPick } from './simulation';

export const BENCH_SIZE = 5;
export const BENCH_SLOT_BASE = 100;
export const BENCH_KEY = '38-0-bench';

export function isBenchPick(pick: { slotIndex: number }): boolean {
  return pick.slotIndex >= BENCH_SLOT_BASE;
}

/** A drafted player put on the bench: no slot, listed at his first position. */
export function toBenchPick(pick: SquadPick, place: number): SquadPick {
  return { ...pick, slotIndex: BENCH_SLOT_BASE + place, position: pick.positions[0] ?? pick.position };
}

/** The bench in place order, renumbered from the first place. */
function benchInOrder(bench: readonly SquadPick[]): SquadPick[] {
  return [...bench].sort((a, b) => a.slotIndex - b.slotIndex).map((p, i) => toBenchPick(p, i));
}

// ── The computer's bench ─────────────────────────────────

type Line = 'GK' | 'DEF' | 'MID' | 'FWD';

function lineOf(position: Position | undefined): Line {
  if (position === 'GK') return 'GK';
  if (position && ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) return 'DEF';
  if (position && ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return 'MID';
  return 'FWD';
}

/**
 * A bench the computer picks for a club: one goalkeeper, then one defender,
 * one midfielder and one forward, then the best outfield player left, each
 * the best rated of his kind not already in the eleven. A line the squad
 * cannot supply is filled by the best player left.
 */
export function deriveBench<T extends { playerId: number; rating: number; positions: Position[] }>(
  squad: readonly T[], startingIds: ReadonlySet<number>, size = BENCH_SIZE,
): T[] {
  const left = [...squad].filter(p => !startingIds.has(p.playerId)).sort((a, b) => b.rating - a.rating);
  const bench: T[] = [];
  const take = (want?: Line) => {
    const i = left.findIndex(p => (want ? lineOf(p.positions[0]) === want : lineOf(p.positions[0]) !== 'GK'));
    const at = i >= 0 ? i : left.findIndex(p => lineOf(p.positions[0]) !== 'GK');
    const j = at >= 0 ? at : 0;
    if (left.length === 0) return;
    bench.push(left.splice(j, 1)[0]);
  };
  for (const line of ['GK', 'DEF', 'MID', 'FWD'] as Line[]) if (bench.length < size) take(line);
  while (bench.length < size && left.length > 0) take();
  return bench;
}

// ── Changing the lineup ──────────────────────────────────

/**
 * Swaps two players, each either in a formation slot or on the bench, keyed
 * by slotIndex. A player who moves into a slot takes that slot's position.
 */
export function swapPlayers(
  formation: Formation, xi: readonly SquadPick[], bench: readonly SquadPick[], a: number, b: number,
): { xi: SquadPick[]; bench: SquadPick[] } {
  const all = [...xi, ...bench];
  const pa = all.find(p => p.slotIndex === a);
  const pb = all.find(p => p.slotIndex === b);
  const place = (p: SquadPick, slotIndex: number): SquadPick =>
    slotIndex >= BENCH_SLOT_BASE
      ? toBenchPick(p, slotIndex - BENCH_SLOT_BASE)
      : { ...p, slotIndex, position: formation.slots[slotIndex].position };
  const rest = all.filter(p => p !== pa && p !== pb);
  const moved = [...(pa ? [place(pa, b)] : []), ...(pb ? [place(pb, a)] : [])];
  const next = [...rest, ...moved];
  return {
    xi: next.filter(p => !isBenchPick(p)).sort((x, y) => x.slotIndex - y.slotIndex),
    bench: benchInOrder(next.filter(isBenchPick)),
  };
}

/**
 * The eleven laid into another formation: the current starters placed where
 * they fit best (by position, then by rating in the slot), and any slot none
 * of them can play filled from the bench. Whoever is left over goes to the
 * bench. Exact: every way of placing the starters is weighed.
 */
export function refitToFormation(
  formationName: string, xi: readonly SquadPick[], bench: readonly SquadPick[],
): { xi: SquadPick[]; bench: SquadPick[] } {
  const formation = getFormation(formationName);
  const slots = formation.slots.length;
  // A starter in a slot is worth more than any bench player in it, so the
  // starters are kept wherever they can play; rating decides among them.
  const STARTER = 1000;
  const candidates = [...xi.map(p => ({ p, bonus: STARTER })), ...bench.map(p => ({ p, bonus: 0 }))];
  const value = (c: { p: SquadPick; bonus: number }, s: number) =>
    canFillSlot(c.p.positions, formation.slots[s].position)
      ? c.bonus + 10 + effectiveRating(c.p.rating, c.p.positions, formation.slots[s].position)
      : -Infinity;

  // best[i][mask]: the most the first i candidates can be worth filling mask.
  const full = 1 << slots;
  let best = new Array<number>(full).fill(-Infinity);
  best[0] = 0;
  const took: Int8Array[] = [];
  for (const c of candidates) {
    const next = best.slice();
    const step = new Int8Array(full).fill(-1);
    for (let mask = 0; mask < full; mask++) {
      if (best[mask] === -Infinity) continue;
      for (let s = 0; s < slots; s++) {
        if (mask & (1 << s)) continue;
        const v = value(c, s);
        if (v === -Infinity) continue;
        const m = mask | (1 << s);
        if (best[mask] + v > next[m]) { next[m] = best[mask] + v; step[m] = s; }
      }
    }
    took.push(step);
    best = next;
  }
  let mask = 0;
  for (let m = 0; m < full; m++) if (best[m] > best[mask]) mask = m;
  const placed = new Map<number, number>(); // candidate index -> slot
  for (let i = candidates.length - 1; i >= 0; i--) {
    const s = took[i][mask];
    if (s < 0) continue;
    placed.set(i, s);
    mask &= ~(1 << s);
  }
  const nextXi: SquadPick[] = [];
  const nextBench: SquadPick[] = [];
  candidates.forEach(({ p }, i) => {
    const s = placed.get(i);
    if (s === undefined) nextBench.push(p);
    else nextXi.push({ ...p, slotIndex: s, position: formation.slots[s].position });
  });
  return { xi: nextXi.sort((a, b) => a.slotIndex - b.slotIndex), bench: benchInOrder(nextBench) };
}

/** Whether two elevens are the same players in the same slots. */
export function sameLineup(a: readonly SquadPick[], b: readonly SquadPick[]): boolean {
  const key = (xs: readonly SquadPick[]) => [...xs].sort((x, y) => x.slotIndex - y.slotIndex)
    .map(p => `${p.slotIndex}:${p.playerId}`).join('|');
  return key(a) === key(b);
}
