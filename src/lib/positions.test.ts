import { describe, expect, it } from 'vitest';
import {
  BUCKET_POSITIONS, GAME_POSITIONS, allowedPositions, ambiguity,
  bucketsOf, checkAssignment, primaryPositions,
} from '../../scripts/lib/positions.mjs';
import { FORMATIONS } from './formations';

// The FBref label is a fact; the specific position is judgement. These tests
// hold the line between them, so an assignment can never contradict what the
// source actually recorded.

describe('reading FBref labels', () => {
  it('splits a single bucket', () => {
    expect(bucketsOf('DF')).toEqual(['DF']);
  });

  it('splits a combined label in the order FBref wrote it', () => {
    expect(bucketsOf('DFMF')).toEqual(['DF', 'MF']);
    expect(bucketsOf('MFDF')).toEqual(['MF', 'DF']);
  });

  it('treats the first bucket as primary', () => {
    expect(primaryPositions('DFMF')).toEqual(BUCKET_POSITIONS.DF);
    expect(primaryPositions('MFDF')).toEqual(BUCKET_POSITIONS.MF);
  });

  it('copes with an empty or unknown label', () => {
    expect(bucketsOf(null)).toEqual([]);
    expect(bucketsOf('XX')).toEqual([]);
  });
});

describe('how much judgement a label leaves', () => {
  it('leaves none for a goalkeeper', () => {
    expect(ambiguity('GK')).toBe(1);
    expect(allowedPositions('GK')).toEqual(['GK']);
  });

  it('leaves the most for a two-bucket label', () => {
    expect(ambiguity('DF')).toBe(5);
    expect(ambiguity('FW')).toBe(4);
    expect(ambiguity('DFMF')).toBe(10);
  });

  it('covers every game position across the four buckets', () => {
    const all = Object.values(BUCKET_POSITIONS).flat() as string[];
    expect(new Set(all)).toEqual(new Set(GAME_POSITIONS));
  });

  it('uses only positions that appear in real formations', () => {
    const used = new Set(Object.values(FORMATIONS).flatMap(f => f.slots.map(s => s.position)));
    for (const p of used) expect(GAME_POSITIONS).toContain(p);
  });
});

describe('checkAssignment', () => {
  const ok = { name: 'Denis Irwin', fbrefPosition: 'DF', positions: ['LB', 'RB'] };

  it('accepts an assignment inside the label', () => {
    expect(checkAssignment(ok)).toEqual([]);
  });

  it('rejects a position outside the label', () => {
    // The single most valuable rule: a defender cannot become a winger.
    const bad = { name: 'Denis Irwin', fbrefPosition: 'DF', positions: ['LB', 'LW'] };
    expect(checkAssignment(bad).join(' ')).toMatch(/assigned LW but FBref recorded them as DF/);
  });

  it('rejects a primary position from the secondary bucket', () => {
    // FBref said defender first, so the main position must be a defensive one.
    const bad = { name: 'Utility Man', fbrefPosition: 'DFMF', positions: ['CM', 'CB'] };
    expect(checkAssignment(bad).join(' ')).toMatch(/primary position CM does not match/);
  });

  it('accepts a secondary position from the secondary bucket', () => {
    const good = { name: 'Utility Man', fbrefPosition: 'DFMF', positions: ['CB', 'CM'] };
    expect(checkAssignment(good)).toEqual([]);
  });

  it('pins a goalkeeper exactly', () => {
    expect(checkAssignment({ name: 'K', fbrefPosition: 'GK', positions: ['GK'] })).toEqual([]);
    expect(checkAssignment({ name: 'K', fbrefPosition: 'GK', positions: ['CB'] }).join(' '))
      .toMatch(/allows only GK/);
  });

  it('rejects a position the game does not know', () => {
    expect(checkAssignment({ name: 'X', fbrefPosition: 'DF', positions: ['SW'] }).join(' '))
      .toMatch(/not a position the game knows/);
  });

  it('rejects duplicates and padding', () => {
    expect(checkAssignment({ name: 'X', fbrefPosition: 'DF', positions: ['CB', 'CB'] }).join(' '))
      .toMatch(/listed twice/);
    expect(checkAssignment({
      name: 'X', fbrefPosition: 'DFMF', positions: ['CB', 'LB', 'RB', 'CM', 'CDM'],
    }).join(' ')).toMatch(/guesswork/);
  });

  it('rejects an empty assignment', () => {
    expect(checkAssignment({ name: 'X', fbrefPosition: 'DF', positions: [] }).join(' '))
      .toMatch(/no positions assigned/);
  });

  it('reports an unreadable FBref label rather than guessing', () => {
    expect(checkAssignment({ name: 'X', fbrefPosition: '', positions: ['CB'] }).join(' '))
      .toMatch(/not understood/);
  });
});
