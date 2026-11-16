import { describe, expect, it } from 'vitest';
import { EMERGENCY_PENALTY, isBanned, newDiscipline, pickStandIns, recordMatch } from './suspensions';
import type { Position } from './formations';

const card = (playerId: number, yellow: boolean, red = false) => ({ playerId, yellow, red });

describe('bans', () => {
  it('gives one match for a second yellow and three for a straight red', () => {
    const d = newDiscipline();
    expect(recordMatch(d, [card(1, true, true), card(2, false, true)], 3)).toEqual([
      { playerId: 1, matches: 1, reason: 'second-yellow' },
      { playerId: 2, matches: 3, reason: 'red' },
    ]);
    // The yellows that made the red do not build towards a ban.
    expect(d.yellows.get(1)).toBeUndefined();
  });

  it('serves a match each time the side plays', () => {
    const d = newDiscipline();
    recordMatch(d, [card(2, false, true)], 1);
    for (let m = 2; m <= 4; m++) {
      expect(isBanned(d, 2)).toBe(true);
      recordMatch(d, [], m);
    }
    expect(isBanned(d, 2)).toBe(false);
  });

  it('bans a fifth yellow by the 19th match, and not after it', () => {
    const early = newDiscipline();
    for (let m = 1; m <= 4; m++) recordMatch(early, [card(7, true)], m);
    expect(recordMatch(early, [card(7, true)], 19)).toEqual([{ playerId: 7, matches: 1, reason: 'yellows' }]);

    const late = newDiscipline();
    for (let m = 1; m <= 4; m++) recordMatch(late, [card(7, true)], m);
    expect(recordMatch(late, [card(7, true)], 20)).toEqual([]);
  });

  it('bans a tenth yellow by the 32nd for two, and a fifteenth for three', () => {
    const d = newDiscipline();
    const given = [];
    for (let m = 1; m <= 15; m++) given.push(...recordMatch(d, [card(7, true)], m * 2));
    expect(given.map(g => [g.matches, g.reason])).toEqual([[1, 'yellows'], [2, 'yellows'], [3, 'yellows']]);
  });
});

describe('stand-ins', () => {
  const p = (rating: number, ...positions: Position[]) => ({ rating, positions });

  it('takes the best bench player who can play the slot', () => {
    const bench = [p(70, 'GK'), p(80, 'ST'), p(78, 'CB'), p(84, 'CM')];
    const [s] = pickStandIns(['CB'], bench, () => false);
    expect(s.player).toBe(bench[2]);
    expect(s).toMatchObject({ rating: 78, fits: true });
  });

  it('fills the keeper first and uses nobody twice', () => {
    const bench = [p(70, 'GK'), p(78, 'CB')];
    const [cb, gk, st] = pickStandIns(['CB', 'GK', 'ST'], bench, () => false);
    expect(gk.player).toBe(bench[0]);
    expect(cb.player).toBe(bench[1]);
    expect(st.player).toBeNull();
  });

  it('puts someone in a slot nobody can play, at a heavy cost, and an outfielder before a keeper', () => {
    const bench = [p(85, 'GK'), p(80, 'CB')];
    const [s] = pickStandIns(['ST'], bench, () => false);
    expect(s.player).toBe(bench[1]);
    expect(s).toMatchObject({ rating: 80 - EMERGENCY_PENALTY, fits: false });
  });

  it('skips a bench player who is banned himself', () => {
    const bench = [p(84, 'CB'), p(76, 'CB')];
    const [s] = pickStandIns(['CB'], bench, c => c === bench[0]);
    expect(s.player).toBe(bench[1]);
  });
});
