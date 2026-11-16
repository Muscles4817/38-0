import { describe, expect, it } from 'vitest';
import { gameData, getSquad } from './gameData';
import { groupByPick, parseSeenSquads, resolveSeenSquads, withSeenSquad } from './seenSquads';

const withPlayers = gameData.squads.filter(s => s.players.length > 0);
const [a, b] = withPlayers;

describe('parseSeenSquads', () => {
  it('keeps references', () => {
    expect(parseSeenSquads([{ clubId: a.clubId, seasonId: a.seasonId }]))
      .toEqual([{ clubId: a.clubId, seasonId: a.seasonId }]);
  });

  it('drops entries in the old full-copy shape, which carry no ids', () => {
    const legacy = [{ clubName: 'Arsenal', seasonLabel: '2003/04', players: a.players }];
    expect(parseSeenSquads(legacy)).toEqual([]);
  });

  it('treats anything that is not a list as empty', () => {
    for (const junk of [null, undefined, 'x', 42, {}]) expect(parseSeenSquads(junk)).toEqual([]);
  });
});

describe('withSeenSquad', () => {
  it('records a squad once however often it is drawn', () => {
    const ref = { clubId: a.clubId, seasonId: a.seasonId };
    const once = withSeenSquad([], ref);
    expect(withSeenSquad(once, ref)).toBe(once);
    expect(withSeenSquad(once, { clubId: b.clubId, seasonId: b.seasonId })).toHaveLength(2);
  });

  it('records the same squad again when it comes up for another pick', () => {
    const first = withSeenSquad([], { clubId: a.clubId, seasonId: a.seasonId, pick: 0 });
    expect(withSeenSquad(first, { clubId: a.clubId, seasonId: a.seasonId, pick: 0 })).toBe(first);
    expect(withSeenSquad(first, { clubId: a.clubId, seasonId: a.seasonId, pick: 3 })).toHaveLength(2);
  });

  it('keeps the pick through storage', () => {
    expect(parseSeenSquads([{ clubId: a.clubId, seasonId: a.seasonId, pick: 2 }]))
      .toEqual([{ clubId: a.clubId, seasonId: a.seasonId, pick: 2 }]);
  });
});

describe('groupByPick', () => {
  it('puts a spin and its rerolls together, in pick order', () => {
    const groups = groupByPick([{ pick: 0, n: 'a' }, { pick: 0, n: 'b' }, { pick: 1, n: 'c' }]);
    expect(groups.map(g => g.map(x => x.n))).toEqual([['a', 'b'], ['c']]);
  });

  it('treats a squad recorded before picks were as a pick of its own', () => {
    expect(groupByPick([{ n: 'a' }, { n: 'b' }] as { pick?: number; n: string }[])).toHaveLength(2);
  });

  it('stays small even with every club-season in the snapshot recorded', () => {
    const all = withPlayers.reduce(
      (list, s) => withSeenSquad(list, { clubId: s.clubId, seasonId: s.seasonId }), parseSeenSquads([]));
    // A single full-copy entry used to be about 2.5 KB; the whole snapshot's
    // worth of references now fits in well under 50 KB of a 5 MB quota.
    expect(JSON.stringify(all).length).toBeLessThan(50_000);
  });
});

describe('resolveSeenSquads', () => {
  it('looks the players up in the snapshot', () => {
    const [squad] = resolveSeenSquads([{ clubId: a.clubId, seasonId: a.seasonId }]);
    expect(squad.players).toBe(getSquad(a.clubId, a.seasonId)!.players);
    expect(squad.clubName).toBeTruthy();
    expect(squad.seasonLabel).toBeTruthy();
  });

  it('skips a reference the snapshot no longer holds', () => {
    expect(resolveSeenSquads([{ clubId: -1, seasonId: -1 }])).toEqual([]);
  });
});
