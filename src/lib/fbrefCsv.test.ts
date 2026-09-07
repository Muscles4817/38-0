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

/** The parser's own row shape, kept local so the test states what it expects. */
interface ParsedPlayer {
  name: string;
  fbrefId: string | null;
  nation: string | null;
  minutes: number;
  goals: number | null;
}

function parse(header: string): ParsedPlayer[] {
  const csv = [GROUPS, header, ...ROWS].join('\n');
  return parseFbrefCsv(csv).players as ParsedPlayer[];
}

describe('parsing an FBref standard-stats export', () => {
  it('reads the players and drops the aggregate rows', () => {
    expect(parse(HEADER).map(p => p.name)).toEqual(['Jens Lehmann', 'Thierry Henry']);
  });

  it('keeps the FBref id, which is what makes player identity exact', () => {
    expect(parse(HEADER)[1].fbrefId).toBe('c0c5ee74');
  });

  it('strips the flag prefix from a nation cell', () => {
    expect(parse(HEADER).map(p => p.nation)).toEqual(['GER', 'FRA']);
  });

  it('takes the count of goals rather than the per-90 rate', () => {
    // "Gls" appears twice: once under Performance, once under Per 90 Minutes.
    // Resolving to the first occurrence is the difference between 27 and 0.91.
    expect(parse(HEADER)[1].goals).toBe(27);
  });

  // FBref writes its sort-direction arrow into the header cell of whichever
  // column the table is sorted by. Copying a table sorted by name therefore
  // gives "Player▲", and the parser used to key off that cell exactly — so four
  // club-seasons of otherwise perfect data failed to parse over one character.
  it('reads a header copied while the table was sorted', () => {
    expect(parse(HEADER.replace('Player', 'Player▲'))).toHaveLength(2);
    expect(parse(HEADER.replace('Player', 'Player▼'))).toHaveLength(2);
  });

  it('finds a sorted column anywhere in the header, not just the first', () => {
    expect(parse(HEADER.replace('Min,', 'Min▼,'))[0].minutes).toBe(3420);
  });

  it('rejects a file with no header row at all', () => {
    expect(() => parseFbrefCsv([GROUPS, ...ROWS].join('\n'))).toThrow(/no header row/);
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
