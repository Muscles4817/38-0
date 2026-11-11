import { describe, expect, it } from 'vitest';
import {
  bestRuns, parseRunHistory, replaceRun, styleRecords, withRun, xiKey, type RunRecord,
} from './runHistory';

function run(over: Partial<RunRecord>): RunRecord {
  return {
    xi: 'A', seasonId: 1, seasonLabel: '2025/26', style: 'balanced', formation: '4-4-2', overall: 80,
    position: 5, points: 60, wins: 17, draws: 9, losses: 12, goalsFor: 55, goalsAgainst: 45,
    expectedPoints: 58, topScorer: 'Someone', topScorerGoals: 14, seed: 1, playedAt: 0, ...over,
  };
}

describe('xiKey', () => {
  const picks = [
    { slotIndex: 1, playerId: 20, clubId: 3, seasonId: 9 },
    { slotIndex: 0, playerId: 10, clubId: 3, seasonId: 9 },
  ];

  it('does not depend on the order the picks were made in', () => {
    expect(xiKey(picks)).toBe(xiKey([...picks].reverse()));
  });

  it('tells the same players in different slots apart', () => {
    const swapped = [{ ...picks[0], slotIndex: 0 }, { ...picks[1], slotIndex: 1 }];
    expect(xiKey(swapped)).not.toBe(xiKey(picks));
  });

  it('tells one player from two of his seasons apart', () => {
    const older = [picks[0], { ...picks[1], seasonId: 4 }];
    expect(xiKey(older)).not.toBe(xiKey(picks));
  });
});

describe('the stored history', () => {
  it('drops anything that is not a run', () => {
    expect(parseRunHistory(null)).toEqual([]);
    expect(parseRunHistory('nonsense')).toEqual([]);
    expect(parseRunHistory([run({}), { xi: 'A' }, 7, null])).toHaveLength(1);
  });

  it('keeps the newest seasons when it is full', () => {
    let list: RunRecord[] = [];
    for (let i = 0; i < 12; i++) list = withRun(list, run({ seed: i }), 10);
    expect(list).toHaveLength(10);
    expect(list[0].seed).toBe(2);
    expect(list[9].seed).toBe(11);
  });
});

describe('styleRecords', () => {
  const list = [
    run({ style: 'balanced', points: 60, position: 5 }),
    run({ style: 'counter', points: 70, position: 2 }),
    run({ style: 'counter', points: 80, position: 1 }),
    run({ style: 'gegenpress', points: 90, position: 1, xi: 'B' }),
    run({ style: 'gegenpress', points: 90, position: 1, seasonId: 2 }),
  ];

  it('reports only this eleven in this league', () => {
    expect(styleRecords(list, 'A', 1).map(r => r.style)).toEqual(['counter', 'balanced']);
  });

  it('adds up what a style has done', () => {
    const counter = styleRecords(list, 'A', 1)[0];
    expect(counter).toMatchObject({ played: 2, bestPoints: 80, bestPosition: 1, averagePoints: 75, titles: 1 });
  });

  it('is empty for an eleven that has not played', () => {
    expect(styleRecords(list, 'C', 1)).toEqual([]);
  });
});

describe('bestRuns', () => {
  it('ranks by finish, then by points', () => {
    const list = [
      run({ position: 3, points: 70, seed: 1 }),
      run({ position: 1, points: 82, seed: 2 }),
      run({ position: 1, points: 91, seed: 3 }),
    ];
    expect(bestRuns(list, 2).map(r => r.seed)).toEqual([3, 2]);
  });
});

describe('a season whose style changed at halfway', () => {
  it('replaces the record first written for it, rather than adding a second', () => {
    const first = run({ seed: 5, playedAt: 100, points: 60 });
    const list = [run({ seed: 1, playedAt: 1 }), first];
    const changed = replaceRun(list, { ...first, points: 70, changedTo: 'gegenpress' });
    expect(changed).toHaveLength(2);
    expect(changed[1]).toMatchObject({ points: 70, changedTo: 'gegenpress' });
    expect(changed[0]).toBe(list[0]);
  });

  it('adds the season when the first record has gone', () => {
    expect(replaceRun([], run({ seed: 5 }))).toHaveLength(1);
  });

  it('is left off the tactics board, since it measures neither style', () => {
    const list = [run({ style: 'balanced', points: 60 }), run({ style: 'balanced', points: 90, changedTo: 'gegenpress' })];
    expect(styleRecords(list, 'A', 1)).toEqual([expect.objectContaining({ style: 'balanced', played: 1, averagePoints: 60 })]);
  });
});
