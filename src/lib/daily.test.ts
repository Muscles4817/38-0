import { describe, expect, it } from 'vitest';
import {
  DAILY_EPOCH, dailyChallenge, dailyDate, dailyNumber, dailyOrder, dailyShareText, dailyStreak,
  formOf, parseDailyResults, withDailyResult, type DailyResult,
} from './daily';
import { FORMATIONS } from './formations';
import { describeCompetition, listCompetitions } from './gameData';
import { draftPool } from './draftPool';
import type { Gameweek } from './simulation';

function result(over: Partial<DailyResult>): DailyResult {
  return {
    date: '2026-11-13', number: 1, seasonLabel: '2003/04', formation: '4-3-3', overall: 84, style: 'balanced',
    position: 2, points: 80, wins: 24, draws: 8, losses: 6, goalsFor: 70, goalsAgainst: 30,
    topScorer: 'Someone', topScorerGoals: 20, form: 'W'.repeat(24) + 'D'.repeat(8) + 'L'.repeat(6), playedAt: 1, ...over,
  };
}

describe('the day', () => {
  it('is the UTC date, so it changes at the same moment everywhere', () => {
    expect(dailyDate(new Date('2026-11-13T23:59:59Z'))).toBe('2026-11-13');
    expect(dailyDate(new Date('2026-11-14T00:00:00Z'))).toBe('2026-11-14');
  });

  it('numbers challenges from one', () => {
    expect(dailyNumber(DAILY_EPOCH)).toBe(1);
    expect(dailyNumber('2026-11-14')).toBe(2);
    expect(dailyNumber('2027-11-13')).toBe(366);
  });
});

describe("a day's challenge", () => {
  const formations = Object.keys(FORMATIONS);
  const competitions = listCompetitions();

  it('is the same for everyone on the same day', () => {
    const shuffled = [...competitions].reverse();
    expect(dailyChallenge('2026-12-01', formations, competitions))
      .toEqual(dailyChallenge('2026-12-01', [...formations].reverse(), shuffled));
  });

  it('changes from day to day', () => {
    const days = Array.from({ length: 10 }, (_, i) => dailyChallenge(`2026-12-${String(i + 1).padStart(2, '0')}`, formations, competitions));
    expect(new Set(days.map(d => d.seed)).size).toBe(10);
    expect(new Set(days.map(d => `${d.formation} ${d.seasonId}`)).size).toBeGreaterThan(1);
  });

  it('draws a formation that exists and a season the game can play', () => {
    for (let i = 1; i <= 30; i++) {
      const d = dailyChallenge(`2027-01-${String(i).padStart(2, '0')}`, formations, competitions);
      expect(formations).toContain(d.formation);
      expect(describeCompetition(d.seasonId, d.league)).not.toBeNull();
    }
  });
});

describe("the day's spins", () => {
  const pool = draftPool({ yearStart: 1992, yearEnd: 2026, playerRating: 'career', filter: null });

  it('put every squad in the pool in one order, whatever order the pool came in', () => {
    const a = dailyOrder(pool, 42);
    const b = dailyOrder([...pool].reverse(), 42);
    expect(a.map(s => `${s.clubId}-${s.seasonId}`)).toEqual(b.map(s => `${s.clubId}-${s.seasonId}`));
    expect(new Set(a)).toEqual(new Set(pool));
  });

  it('are a different order on a different day', () => {
    expect(dailyOrder(pool, 1).slice(0, 11)).not.toEqual(dailyOrder(pool, 2).slice(0, 11));
  });
});

describe("the day's result", () => {
  it('counts the first season of the day and ignores later ones', () => {
    const first = withDailyResult([], result({ playedAt: 1, points: 70 }));
    const again = withDailyResult(first, result({ playedAt: 2, points: 90 }));
    expect(again).toEqual(first);
  });

  it('takes the same season back when its second half is rewritten', () => {
    const first = withDailyResult([], result({ playedAt: 1, points: 70 }));
    expect(withDailyResult(first, result({ playedAt: 1, points: 75, changedTo: 'gegenpress' }))[0])
      .toMatchObject({ points: 75, changedTo: 'gegenpress' });
  });

  it('keeps days in order and drops the oldest beyond the limit', () => {
    let list: DailyResult[] = [];
    for (const date of ['2026-11-15', '2026-11-13', '2026-11-14']) list = withDailyResult(list, result({ date }), 2);
    expect(list.map(r => r.date)).toEqual(['2026-11-14', '2026-11-15']);
  });

  it('drops anything stored that is not a result', () => {
    expect(parseDailyResults([result({}), { date: 'x' }, null])).toHaveLength(1);
    expect(parseDailyResults('nonsense')).toEqual([]);
  });

  it('reads the form from the XI’s own fixtures', () => {
    const gw = (hg: number, ag: number, home = 'Your XI'): Gameweek => ({
      week: 1, tableSnapshot: [],
      fixtures: [
        { home: 'A', away: 'B', homeGoals: 9, awayGoals: 0, userInvolved: false, scorers: [] },
        { home, away: home === 'Your XI' ? 'C' : 'Your XI', homeGoals: hg, awayGoals: ag, userInvolved: true, scorers: [] },
      ],
    });
    expect(formOf({ gameweeks: [gw(2, 1), gw(1, 1), gw(2, 1, 'C')] })).toBe('WDL');
  });
});

describe('a streak', () => {
  const days = (...dates: string[]) => dates.map(date => result({ date }));

  it('counts days in a row up to today', () => {
    expect(dailyStreak(days('2026-11-13', '2026-11-14', '2026-11-15'), '2026-11-15')).toBe(3);
  });

  it('is not broken before today has been played', () => {
    expect(dailyStreak(days('2026-11-13', '2026-11-14'), '2026-11-15')).toBe(2);
  });

  it('is broken by a missed day', () => {
    expect(dailyStreak(days('2026-11-12', '2026-11-14'), '2026-11-15')).toBe(1);
    expect(dailyStreak(days('2026-11-12'), '2026-11-15')).toBe(0);
  });
});

describe('the share text', () => {
  it('names the challenge and shows the season as two halves of squares', () => {
    const text = dailyShareText(result({ number: 7, changedTo: 'gegenpress' }), s => s.toUpperCase());
    const lines = text.split('\n');
    expect(lines[0]).toBe('38-0 Daily #7 · 2003/04');
    expect(lines[1]).toBe('2nd · 80 pts · 24-8-6');
    expect([...lines[2]]).toHaveLength(19);
    expect([...lines[3]]).toHaveLength(19);
    expect(lines[4]).toContain('BALANCED → GEGENPRESS');
  });
});
