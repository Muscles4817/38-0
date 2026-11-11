import { describe, expect, it } from 'vitest';
import { keyMoments, LATE_MINUTE, seasonStory, type KeyMoment } from './keyMoments';
import type { FixtureDetail, FixtureResult, Gameweek, TeamStanding } from './simulation';

const ME = 'Your XI';

type Event = FixtureDetail['events'][number];

const goal = (minute: number, user: boolean, name = user ? 'Our Striker' : 'Their Striker'): Event =>
  ({ minute, type: 'goal', user, name });

/** One of the XI's matches, at home to `opp`, with these events. */
function match(events: Event[], opp = 'Rivals FC'): FixtureResult {
  const side = { shots: 10, shotsOnTarget: 4, expectedGoals: 1.2, possession: 50 };
  return {
    home: ME, away: opp,
    homeGoals: events.filter(e => e.type === 'goal' && e.user).length,
    awayGoals: events.filter(e => e.type === 'goal' && !e.user).length,
    userInvolved: true, scorers: [],
    detail: { home: side, away: side, events },
  };
}

/** A table in the order given, from names and points. */
function table(rows: [string, number][], played = 1): TeamStanding[] {
  return rows.map(([name, points], i) => ({
    name, isUser: name === ME, position: i + 1, played, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, gd: 0, points, ovr: 0, att: 0, mid: 0, def: 0,
  }));
}

/** A twenty-team table with the XI at `position` on `points`, everyone else spaced out around it. */
function league(position: number, points: number, gap = 1): [string, number][] {
  return Array.from({ length: 20 }, (_, i): [string, number] =>
    i + 1 === position ? [ME, points] : [`Club ${i + 1}`, points + (position - (i + 1)) * gap]);
}

/** A season of `weeks` gameweeks, each with a quiet 0–0 unless given. */
function season(weeks: number, over: Record<number, { fixture?: FixtureResult; table?: TeamStanding[] }> = {}) {
  const gameweeks: Gameweek[] = Array.from({ length: weeks }, (_, i) => ({
    week: i + 1,
    fixtures: [over[i + 1]?.fixture ?? match([])],
    tableSnapshot: over[i + 1]?.table ?? table(league(10, 0, 0)),
  }));
  return { gameweeks, finalTable: gameweeks[weeks - 1].tableSnapshot };
}

const kinds = (moments: KeyMoment[], week?: number) =>
  moments.filter(m => week === undefined || m.week === week).map(m => m.kind);

describe('what a match has in it', () => {
  it('calls a winner from the last minutes a late winner, naming the scorer', () => {
    const m = keyMoments(season(38, { 5: { fixture: match([goal(30, false), goal(60, true), goal(LATE_MINUTE + 3, true, 'Late Hero')]) } }));
    const late = m.find(x => x.kind === 'late-winner');
    expect(late?.week).toBe(5);
    expect(late?.text).toContain('Late Hero');
  });

  it('does not call a goal before the last minutes late', () => {
    const m = keyMoments(season(38, { 5: { fixture: match([goal(LATE_MINUTE - 1, true)]) } }));
    expect(kinds(m)).not.toContain('late-winner');
  });

  it('tells a late equaliser for and against apart', () => {
    const m = keyMoments(season(38, {
      3: { fixture: match([goal(10, false), goal(89, true)]) },
      4: { fixture: match([goal(10, true), goal(89, false)]) },
    }));
    expect(kinds(m, 3)).toContain('late-equaliser');
    expect(kinds(m, 4)).toContain('late-equaliser-against');
  });

  it('counts coming from two down for more than coming from one down', () => {
    const m = keyMoments(season(38, {
      2: { fixture: match([goal(10, false), goal(50, true), goal(60, true)]) },
      3: { fixture: match([goal(10, false), goal(20, false), goal(50, true), goal(60, true), goal(70, true)]) },
    }));
    const one = m.find(x => x.kind === 'comeback' && x.week === 2)!;
    const two = m.find(x => x.kind === 'comeback' && x.week === 3)!;
    expect(two.weight).toBeGreaterThan(one.weight);
    expect(two.text).toContain('0–2 down');
  });

  it('calls a big win a thrashing, not a comeback', () => {
    const m = keyMoments(season(38, { 2: { fixture: match([goal(5, false), ...[20, 30, 40, 50, 60].map(t => goal(t, true))]) } }));
    expect(kinds(m, 2)).toContain('thrashing');
    expect(kinds(m, 2)).not.toContain('comeback');
  });

  it('notices a hat-trick for either side, and a red card for the XI', () => {
    const m = keyMoments(season(38, {
      6: { fixture: match([goal(10, true, 'A'), goal(20, true, 'A'), goal(30, true, 'A'), { minute: 40, type: 'red', user: true, name: 'B' }]) },
      7: { fixture: match([goal(10, false, 'C'), goal(20, false, 'C'), goal(30, false, 'C')]) },
    }));
    expect(kinds(m, 6)).toEqual(expect.arrayContaining(['hat-trick', 'red-card']));
    expect(kinds(m, 7)).toContain('hat-trick-against');
  });
});

describe('the season around it', () => {
  it('says the XI is top once, and knocked off only after being told it was top', () => {
    const top = table(league(1, 30));
    const second = table(league(2, 30));
    const m = keyMoments(season(38, {
      1: { table: top }, 2: { table: top }, 3: { table: second },
      // Quiet until the table means something; then top, then not.
      10: { table: top }, 11: { table: top }, 12: { table: second },
    }));
    expect(m.filter(x => x.kind === 'top').map(x => x.week)).toEqual([10]);
    expect(m.filter(x => x.kind === 'knocked-off-top').map(x => x.week)).toEqual([12]);
  });

  it('names the champions the week nobody can catch them', () => {
    // Five to play, fifteen points the most anyone can make up: a lead of
    // sixteen is settled, a lead of fifteen is not.
    const lead = (n: number) => table([[ME, 80], ['Chasers', 80 - n], ...league(20, 0, 1).slice(2)]);
    const m = keyMoments(season(38, { 32: { table: lead(15) }, 33: { table: lead(16) }, 38: { table: lead(30) } }));
    const won = m.filter(x => x.kind === 'champions');
    expect(won).toHaveLength(1);
    expect(won[0].week).toBe(33);
    expect(won[0].text).toBe('Champions with 5 to play');
  });

  it('settles a title that went to the last day on the last day', () => {
    const m = keyMoments(season(38, { 38: { table: table([['Rivals FC', 80], [ME, 80], ...league(20, 0, 1).slice(2)]) } }));
    const title = m.find(x => x.kind === 'title-elsewhere');
    expect(title?.text).toBe('Rivals FC are champions on the final day');
    expect(title?.tone).toBe('bad');
  });

  it('says when the XI is relegated, and never then calls it safe', () => {
    // Bottom on 10, with the seventeenth-placed side on 37: catchable with
    // nine to play (10 + 27), out of reach with eight.
    const doomed = table(league(20, 10, 9));
    const m = keyMoments(season(38, { 29: { table: doomed }, 30: { table: doomed }, 38: { table: doomed } }));
    expect(m.filter(x => x.kind === 'relegated').map(x => x.week)).toEqual([30]);
    expect(kinds(m)).not.toContain('safe');
  });

  it('marks a perfect season', () => {
    const wins = Object.fromEntries(Array.from({ length: 38 }, (_, i) => [i + 1, { fixture: match([goal(10, true)]) }]));
    const m = keyMoments(season(38, wins));
    expect(kinds(m, 38)).toContain('perfect');
    expect(kinds(m)).toEqual(expect.arrayContaining(['win-streak']));
  });
});

describe('the story of a season', () => {
  it('keeps the most important moments, in the order they happened', () => {
    const m: KeyMoment[] = [
      { week: 30, kind: 'champions', text: '', tone: 'good', weight: 100 },
      { week: 2, kind: 'thrashing', text: '', tone: 'good', weight: 35 },
      { week: 10, kind: 'late-winner', text: '', tone: 'good', weight: 80 },
    ];
    expect(seasonStory(m, 2).map(x => x.week)).toEqual([10, 30]);
  });
});
