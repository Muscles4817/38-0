import { describe, expect, it } from 'vitest';
import { buildPlayerList, identityKey, nameKey } from '../../scripts/lib/player-list.mjs';

// The point of the canonical player list is that one human is one entry across
// a whole career. The five sample club-seasons are all from different years, so
// nothing in the real data exercises that yet — these fixtures do.

const player = (over: Record<string, unknown> = {}) => ({
  name: 'Ryan Giggs', fbrefId: 'abc123', nation: 'WAL', age: 22,
  matchesPlayed: 33, starts: 30, minutes: 2700, goals: 6, assists: 4,
  fbrefPosition: 'MF', positionBuckets: ['MF'],
  ...over,
});

const roster = (season: string, club: string, squad: Record<string, unknown>[]) =>
  ({ season, club, competition: 'premier-league', squad });

describe('identity', () => {
  it('keys on the FBref id when there is one', () => {
    expect(identityKey({ fbrefId: 'abc123', name: 'Anything' })).toBe('fbref:abc123');
  });

  it('falls back to a normalised name when there is not', () => {
    expect(identityKey({ fbrefId: null, name: 'Pavel Srníček' }))
      .toBe(identityKey({ fbrefId: null, name: 'Pavel Srnicek' }));
  });

  it('normalises accents and punctuation in the fallback', () => {
    expect(nameKey("Jan O'Neill")).toBe(nameKey('Ján ONeill'));
  });
});

describe('buildPlayerList', () => {
  it('collapses one player across many seasons into a single entry', () => {
    const { players, playerSeasons } = buildPlayerList([
      roster('1995/96', 'Manchester United', [player({ age: 22, minutes: 2000 })]),
      roster('1996/97', 'Manchester United', [player({ age: 23, minutes: 2400 })]),
      roster('1997/98', 'Manchester United', [player({ age: 24, minutes: 2200 })]),
    ]);
    expect(players).toHaveLength(1);
    expect(playerSeasons).toBe(3);
    expect(players[0].seasonCount).toBe(3);
    expect(players[0].totalMinutes).toBe(6600);
    expect(players[0].firstSeason).toBe('1995/96');
    expect(players[0].lastSeason).toBe('1997/98');
  });

  it('matches on the id even when the name is spelled differently', () => {
    const { players } = buildPlayerList([
      roster('1995/96', 'Newcastle United', [
        player({ name: 'Pavel Srníček', fbrefId: 'zzz999' })]),
      roster('1996/97', 'Newcastle United', [
        player({ name: 'Pavel Srnicek', fbrefId: 'zzz999' })]),
    ]);
    expect(players).toHaveLength(1);
    expect(players[0].aliases).toContain('Pavel Srnicek');
  });

  it('keeps genuinely different players apart even with the same name', () => {
    const { players } = buildPlayerList([
      roster('1995/96', 'Manchester United', [
        player({ name: 'Gary Neville', fbrefId: 'aaa' }),
        player({ name: 'Gary Neville', fbrefId: 'bbb' }),
      ]),
    ]);
    expect(players).toHaveLength(2);
  });

  it('follows a player between clubs', () => {
    const { players } = buildPlayerList([
      roster('2000/01', 'Leeds United', [player({ name: 'Rio Ferdinand', fbrefId: 'rio' })]),
      roster('2002/03', 'Manchester United', [player({ name: 'Rio Ferdinand', fbrefId: 'rio' })]),
    ]);
    expect(players).toHaveLength(1);
    expect(players[0].seasons.map((s: { club: string }) => s.club))
      .toEqual(['Leeds United', 'Manchester United']);
  });

  it('records a mid-season transfer rather than rejecting it', () => {
    const { players } = buildPlayerList([
      roster('1996/97', 'Newcastle United', [
        player({ name: 'Paul Kitson', fbrefId: 'kit', minutes: 300 })]),
      roster('1996/97', 'West Ham United', [
        player({ name: 'Paul Kitson', fbrefId: 'kit', minutes: 1200 })]),
    ]);
    expect(players).toHaveLength(1);
    expect(players[0].transferSeasons).toEqual(['1996/97']);
    expect(players[0].seasonCount).toBe(2);
    // Ordered by minutes within the season, so the main club comes first.
    expect(players[0].seasons[0].club).toBe('West Ham United');
  });

  it('gathers the position buckets seen across a career', () => {
    const { players } = buildPlayerList([
      roster('2004/05', 'Everton', [player({ fbrefPosition: 'MF', positionBuckets: ['MF'] })]),
      roster('2008/09', 'Everton', [player({ fbrefPosition: 'DFMF', positionBuckets: ['DF', 'MF'] })]),
    ]);
    expect(players[0].positionBuckets.sort()).toEqual(['DF', 'MF']);
  });

  it('orders players by minutes played, most first', () => {
    const { players } = buildPlayerList([
      roster('2020/21', 'Everton', [
        player({ name: 'Fringe', fbrefId: 'f', minutes: 400 }),
        player({ name: 'Regular', fbrefId: 'r', minutes: 3200 }),
      ]),
    ]);
    expect(players.map((p: { name: string }) => p.name)).toEqual(['Regular', 'Fringe']);
  });

  it('reports rows with no id so they can be checked', () => {
    const { idless } = buildPlayerList([
      roster('1995/96', 'Wimbledon', [player({ fbrefId: null, name: 'Mystery Man' })]),
    ]);
    expect(idless.join(' ')).toMatch(/Mystery Man/);
  });

  it('copes with an empty squad', () => {
    const { players, playerSeasons } = buildPlayerList([roster('1995/96', 'Nobody', [])]);
    expect(players).toEqual([]);
    expect(playerSeasons).toBe(0);
  });
});
