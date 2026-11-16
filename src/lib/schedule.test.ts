import { describe, expect, it } from 'vitest';
import { buildSchedule } from './simulation';

describe('the fixture list', () => {
  for (const n of [20, 18, 22]) {
    describe(`${n} sides`, () => {
      const schedule = buildSchedule(n);
      const venues = (team: number) => schedule.map(round => {
        const m = round.find(([h, a]) => h === team || a === team)!;
        return m[0] === team ? 'H' : 'A';
      }).join('');

      it('is a double round robin: every pair meets once at each ground', () => {
        expect(schedule).toHaveLength(2 * (n - 1));
        const seen = new Set<string>();
        for (const round of schedule) {
          expect(new Set(round.flat()).size).toBe(n);
          for (const [h, a] of round) seen.add(`${h}-${a}`);
        }
        expect(seen.size).toBe(n * (n - 1));
      });

      it('gives every side half its home games in each half, give or take one', () => {
        const half = n - 1;
        for (let t = 0; t < n; t++) {
          const home = [...venues(t).slice(0, half)].filter(v => v === 'H').length;
          expect(Math.abs(home - half / 2), `side ${t}: ${venues(t)}`).toBeLessThanOrEqual(0.5);
        }
      });

      it('never plays the same fixture two weeks running', () => {
        for (let r = 1; r < schedule.length; r++) {
          const last = new Set(schedule[r - 1].map(([h, a]) => [h, a].sort().join('-')));
          for (const [h, a] of schedule[r]) expect(last.has([h, a].sort().join('-'))).toBe(false);
        }
      });

      it('never plays a side at home or away more than twice running', () => {
        for (let t = 0; t < n; t++) {
          expect(venues(t), `side ${t}`).not.toMatch(/HHH|AAA/);
        }
      });
    });
  }
});
