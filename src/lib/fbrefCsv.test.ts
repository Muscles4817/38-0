import { describe, expect, it } from 'vitest';
import { parseFbrefCsv, positionBuckets } from '../../scripts/lib/fbref-csv.mjs';

// Phase 1 of the squad pipeline. These exports are pasted in by hand, so the
// parser meets whatever the browser put on the clipboard — and a file that
// fails to parse costs a whole club-season.

const GROUPS =
  ',,,,,Playing Time,Playing Time,Playing Time,Performance,Performance,' +
  'Per 90 Minutes,,-additional';
const HEADER =
  'Player,Nation,Pos,Age,MP,Starts,Min,90s,Gls,Ast,Gls,Matches,-9999';
const ROWS = [
  'Jens Lehmann,de GER,GK,35,38,38,3420,38.0,0,0,0.00,Matches,d1ca1129',
  'Thierry Henry,fr FRA,FW,27,32,30,2672,29.7,27,8,0.91,Matches,c0c5ee74',
  'Squad Total,,,26.2,38,418,3420,38.0,66,46,1.74,,-9999',
  'Opponent Total,,,26.8,38,,3420,38.0,,,,,-9999',
];

const csv = (header: string) => [GROUPS, header, ...ROWS].join('\n');
const parse = (header: string) =>
  parseFbrefCsv(csv(header), { competition: 'premier-league', season: '2005/06', club: 'Arsenal' });

describe('parsing an FBref standard-stats export', () => {
  it('reads the players and drops the aggregate rows', () => {
    const { players } = parse(HEADER);
    expect(players.map((p: { name: string }) => p.name))
      .toEqual(['Jens Lehmann', 'Thierry Henry']);
  });

  it('keeps the FBref id, which is what makes player identity exact', () => {
    const { players } = parse(HEADER);
    expect(players[1].fbrefId).toBe('c0c5ee74');
  });

  it('strips the flag prefix from a nation cell', () => {
    const { players } = parse(HEADER);
    expect(players.map((p: { nation: string }) => p.nation)).toEqual(['GER', 'FRA']);
  });

  it('takes the count of goals rather than the per-90 rate', () => {
    // "Gls" appears twice: once under Performance, once under Per 90 Minutes.
    // Resolving to the first occurrence is the difference between 27 and 0.91.
    const { players } = parse(HEADER);
    expect(players[1].goals).toBe(27);
  });

  // FBref writes its sort-direction arrow into the header cell of whichever
  // column the table is sorted by. Copying a table sorted by name therefore
  // gives "Player▲", and the parser used to key off that cell exactly — so four
  // club-seasons of otherwise perfect data failed to parse over one character.
  it('reads a header copied while the table was sorted', () => {
    expect(parse(HEADER.replace('Player', 'Player▲')).players).toHaveLength(2);
    expect(parse(HEADER.replace('Player', 'Player▼')).players).toHaveLength(2);
  });

  it('finds a sorted column anywhere in the header, not just the first', () => {
    const { players } = parse(HEADER.replace('Min,', 'Min▼,'));
    expect(players[0].minutes).toBe(3420);
  });

  it('rejects a file with no header row at all', () => {
    expect(() => parseFbrefCsv([GROUPS, ...ROWS].join('\n'), {}))
      .toThrow(/no header row/);
  });
});

describe('expanding FBref position labels into buckets', () => {
  it('splits a combined label', () => {
    expect(positionBuckets('DFMF')).toEqual(['DF', 'MF']);
  });

  it('returns nothing for a missing label', () => {
    expect(positionBuckets(null)).toEqual([]);
  });
});
