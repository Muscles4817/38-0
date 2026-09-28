import { describe, expect, it } from 'vitest';
import { gameData, getSquad } from './gameData';
import { parseSeenSquads, resolveSeenSquads, withSeenSquad } from './seenSquads';

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
