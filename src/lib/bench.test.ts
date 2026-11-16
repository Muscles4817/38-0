import { describe, expect, it } from 'vitest';
import { BENCH_SLOT_BASE, deriveBench, isBenchPick, refitToFormation, sameLineup, swapPlayers, toBenchPick } from './bench';
import { getFormation, type Position } from './formations';
import type { SquadPick } from './simulation';

let id = 1;
const pick = (name: string, positions: Position[], rating = 80, slotIndex = -1, position?: Position): SquadPick => ({
  slotIndex, position: position ?? positions[0], playerId: id++, playerName: name, rating,
  clubName: 'Club', seasonLabel: '2003/04', positions,
});

/** A 4-4-2 eleven in its slots, and a bench of five. */
function squad() {
  const f = getFormation('4-4-2');
  const xi = f.slots.map((slot, i) => pick(`S${i}`, [slot.position], 80, i, slot.position));
  const bench = [pick('GK2', ['GK'], 70), pick('CB2', ['CB'], 78), pick('CM2', ['CM'], 79), pick('ST2', ['ST'], 85), pick('LW2', ['LW'], 77)]
    .map((p, i) => toBenchPick(p, i));
  return { f, xi, bench };
}

describe('the computer\'s bench', () => {
  const p = (playerId: number, rating: number, positions: Position[]) => ({ playerId, rating, positions });
  const players = [
    p(1, 90, ['GK']), p(2, 75, ['GK']), p(3, 88, ['CB']), p(4, 84, ['CB']), p(5, 70, ['CB']),
    p(6, 86, ['CM']), p(7, 83, ['CM']), p(8, 72, ['CM']), p(9, 89, ['ST']), p(10, 81, ['ST']),
    p(11, 79, ['LW']), p(12, 74, ['LB']), p(13, 73, ['RB']),
  ];
  const starters = new Set([1, 3, 4, 6, 7, 9, 10, 11, 12, 13, 8]);

  it('has one goalkeeper, then a defender, a midfielder and a forward', () => {
    const bench = deriveBench(players, starters);
    expect(bench).toHaveLength(2);
    expect(bench.map(b => b.playerId)).toEqual([2, 5]);
  });

  it('fills to five from the best left, never a second keeper over an outfielder', () => {
    const many = [...players, p(14, 78, ['CM']), p(15, 77, ['ST']), p(16, 76, ['GK']), p(17, 71, ['RW'])];
    const bench = deriveBench(many, starters);
    expect(bench).toHaveLength(5);
    expect(bench.filter(b => b.positions[0] === 'GK')).toHaveLength(1);
    expect(bench.map(b => b.playerId)).toEqual([16, 5, 14, 15, 17]);
  });
});

describe('changing the lineup', () => {
  it('swaps a starter for a sub, the sub taking the slot\'s position', () => {
    const { f, xi, bench } = squad();
    const st = xi.find(p => p.position === 'ST')!;
    const next = swapPlayers(f, xi, bench, st.slotIndex, BENCH_SLOT_BASE + 3);
    expect(next.xi).toHaveLength(11);
    expect(next.bench).toHaveLength(5);
    const inSlot = next.xi.find(p => p.slotIndex === st.slotIndex)!;
    expect(inSlot.playerName).toBe('ST2');
    expect(inSlot.position).toBe('ST');
    expect(next.bench.some(p => p.playerName === st.playerName && isBenchPick(p))).toBe(true);
  });

  it('swaps two starters\' slots', () => {
    const { f, xi, bench } = squad();
    const next = swapPlayers(f, xi, bench, 0, 1);
    expect(next.xi.find(p => p.slotIndex === 0)!.playerName).toBe(xi[1].playerName);
    expect(next.xi.find(p => p.slotIndex === 0)!.position).toBe(f.slots[0].position);
  });

  it('lays the eleven into a new shape, keeping the starters who can play it', () => {
    const { xi, bench } = squad();
    const next = refitToFormation('4-3-3', xi, bench);
    expect(next.xi).toHaveLength(11);
    expect(next.xi.length + next.bench.length).toBe(16);
    // Eleven starters, of whom at most the ones with no 4-3-3 slot leave.
    const kept = next.xi.filter(p => xi.some(s => s.playerId === p.playerId)).length;
    expect(kept).toBeGreaterThanOrEqual(9);
  });

  it('fills a slot no starter can play from the bench', () => {
    // A back three needs a third centre-back; the bench has one.
    const { xi, bench } = squad();
    const next = refitToFormation('3-5-2', xi, bench);
    expect(next.xi).toHaveLength(11);
  });

  it('knows an unchanged eleven', () => {
    const { xi } = squad();
    expect(sameLineup(xi, [...xi].reverse())).toBe(true);
    expect(sameLineup(xi, xi.slice(1))).toBe(false);
  });
});
