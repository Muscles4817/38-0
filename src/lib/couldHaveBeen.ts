// ── What Could Have Been ─────────────────────────────────
//
// The best XI the draft could have produced from the squads it actually
// offered. A draft is a series of picks, and each pick takes exactly one
// player from one spin: the squad landed on, or a squad a reroll moved away
// from at that pick. So the best possible XI takes at most one player per
// pick, puts each in a slot he can play, and uses no player twice.
//
// It used to pool every player from every squad shown and choose freely,
// which was the best XI from all those squads put together, a side no draft
// could ever have produced.
//
// Eleven picks and eleven slots make this a small assignment problem, solved
// exactly: the best player each pick could offer for each slot, then the best
// matching of picks to slots over every subset of slots. Your own XI is always
// one of the answers it considers, so it never comes out below what you drafted.

import { canFillSlot, effectiveRating, type Formation, type Position } from './formations';
import type { DataPlayer } from './gameData';
import type { SquadPick } from './simulation';

/** A squad offered at a pick, with the players the draft's rules allowed. */
export interface OfferedSquad {
  clubName: string;
  seasonLabel: string;
  players: DataPlayer[];
}

type Choice = { player: DataPlayer; squad: OfferedSquad; value: number };

/** The best a pick could have given a slot, skipping players already excluded. */
function bestFor(pick: OfferedSquad[], position: Position, excluded: Set<number>): Choice | null {
  let best: Choice | null = null;
  for (const squad of pick) {
    for (const player of squad.players) {
      if (excluded.has(player.playerId) || !canFillSlot(player.positions, position)) continue;
      const value = effectiveRating(player.rating, player.positions, position);
      if (!best || value > best.value) best = { player, squad, value };
    }
  }
  return best;
}

/**
 * The best assignment of picks to slots: most slots filled, then the highest
 * total rating in those slots. `excluded[i]` is the players pick i may not use.
 */
function assign(formation: Formation, picks: OfferedSquad[][], excluded: Set<number>[]) {
  const slots = formation.slots.length;
  const full = 1 << slots;
  // A filled slot is worth far more than any rating, so the most slots win.
  const FILL = 1000;
  const choice = picks.map((pick, i) =>
    formation.slots.map(slot => bestFor(pick, slot.position, excluded[i])));

  // best[mask]: the most a set of filled slots can be worth after each pick.
  // took[i][mask]: the slot pick i filled to reach it, or -1 if it went unused.
  let best = new Array<number>(full).fill(-Infinity);
  best[0] = 0;
  const took: Int8Array[] = [];
  for (let i = 0; i < picks.length; i++) {
    const next = best.slice();
    const step = new Int8Array(full).fill(-1);
    for (let mask = 0; mask < full; mask++) {
      if (best[mask] === -Infinity) continue;
      for (let s = 0; s < slots; s++) {
        const c = choice[i][s];
        if (!c || mask & (1 << s)) continue;
        const m = mask | (1 << s);
        const v = best[mask] + FILL + c.value;
        if (v > next[m]) { next[m] = v; step[m] = s; }
      }
    }
    took.push(step);
    best = next;
  }

  let mask = 0;
  for (let m = 0; m < full; m++) if (best[m] > best[mask]) mask = m;
  const total = best[mask];
  const result: { pick: number; slot: number; choice: Choice }[] = [];
  for (let i = picks.length - 1; i >= 0; i--) {
    const s = took[i][mask];
    if (s < 0) continue;
    result.push({ pick: i, slot: s, choice: choice[i][s]! });
    mask &= ~(1 << s);
  }
  return { total, result };
}

/**
 * The strongest XI the draft could have made: one player from each pick, each
 * in a slot he can play, no player twice. `picks` is the squads offered at
 * each pick, in order.
 */
export function bestPossibleXI(formation: Formation, picks: OfferedSquad[][]): SquadPick[] {
  const excluded = picks.map(() => new Set<number>());

  // The same player can be offered at two picks (two of his seasons, or the
  // same squad landed on twice). If the best answer uses him twice, try each
  // way of keeping him once and take the better. It is rare, and each retry
  // excludes one more, so this ends.
  function solve(ex: Set<number>[]): ReturnType<typeof assign> {
    const answer = assign(formation, picks, ex);
    const seen = new Map<number, number>();
    for (const { pick, choice } of answer.result) {
      const id = choice.player.playerId;
      const other = seen.get(id);
      if (other === undefined) { seen.set(id, pick); continue; }
      const options = [other, pick].map(drop => {
        const next = ex.map(set => new Set(set));
        next[drop].add(id);
        return solve(next);
      });
      return options[0].total >= options[1].total ? options[0] : options[1];
    }
    return answer;
  }

  const { result } = solve(excluded);
  return result
    .map(({ slot, choice }) => {
      const s = formation.slots[slot];
      return {
        slotIndex: slot,
        position: s.position,
        playerId: choice.player.playerId,
        playerName: choice.player.name,
        nationality: choice.player.nationality,
        rating: choice.player.rating,
        clubName: choice.squad.clubName,
        seasonLabel: choice.squad.seasonLabel,
        positions: choice.player.positions,
      };
    })
    .sort((a, b) => a.slotIndex - b.slotIndex);
}
