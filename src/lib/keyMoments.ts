// ── Key moments ───────────────────────────────────────────
//
// The live season used to be 38 scorelines. Everything that makes a season a
// story was already recorded — who scored and when, every card, the table
// after every round — and this picks it out and says it: a late winner, a
// hat-trick, a red card, going top, the week the title is settled.
//
// It reads a finished SimulationResult and nothing else, so it costs the
// simulation nothing and cannot change a result. It is pure, so the live view
// and the final report ask the same question and get the same answer.

import type { FixtureResult, SimulationResult, TeamStanding } from './simulation';

export type MomentTone = 'good' | 'bad' | 'neutral';

export type MomentKind =
  | 'late-winner' | 'late-equaliser' | 'late-defeat' | 'late-equaliser-against'
  | 'comeback' | 'hat-trick' | 'hat-trick-against' | 'red-card'
  | 'thrashing' | 'hammering'
  | 'top' | 'knocked-off-top' | 'into-drop-zone' | 'out-of-drop-zone'
  | 'champions' | 'title-elsewhere' | 'relegated' | 'safe'
  | 'win-streak' | 'goal-milestone' | 'perfect' | 'invincible';

export interface KeyMoment {
  week: number;
  kind: MomentKind;
  text: string;
  tone: MomentTone;
  /** How much it matters, for choosing the few worth showing. Higher first. */
  weight: number;
}

/**
 * A goal from this minute on is late. The engine plays ninety minutes; the
 * last five are where a result turns without time to answer.
 */
export const LATE_MINUTE = 85;

/** A win or defeat by this many is worth saying on its own. */
const BIG_MARGIN = 4;

/** Places at the bottom that go down. */
const RELEGATION_PLACES = 3;

/**
 * Before this many rounds the table says very little: a side is top after one
 * game by having won it. Movements into and out of places are ignored until
 * then.
 */
const TABLE_SETTLES_AFTER = 3;
const DROP_ZONE_SETTLES_AFTER = 6;

const GOAL_MILESTONES = [10, 20, 30, 40];
const STREAK_MILESTONES = [5, 10, 15, 20, 25, 30];

const WEIGHTS: Record<MomentKind, number> = {
  perfect: 120, invincible: 110, champions: 100, relegated: 95,
  'late-winner': 80, comeback: 75, 'hat-trick': 70, top: 65,
  'title-elsewhere': 60, 'into-drop-zone': 60, 'late-equaliser': 60, safe: 60,
  'knocked-off-top': 55, 'out-of-drop-zone': 55, 'late-defeat': 55,
  'red-card': 50, 'late-equaliser-against': 50, 'win-streak': 45,
  'goal-milestone': 40, 'hat-trick-against': 40, thrashing: 35, hammering: 35,
};

/** A comeback from a single goal down: worth a line, not a headline. */
const ONE_GOAL_COMEBACK_WEIGHT = 42;

/** A moment before it is weighed; `weight` overrides its kind's. */
type Draft = Omit<KeyMoment, 'weight'> & { weight?: number };

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Whether the leader can no longer be caught: every other side's most
 * possible points are below the leader's. Level on points is not settled,
 * since goal difference can still swing.
 */
function titleSettled(table: TeamStanding[], remaining: number): boolean {
  if (table.length < 2) return true;
  if (remaining === 0) return true;
  const leader = table[0];
  return table.slice(1).every(t => t.points + 3 * remaining < leader.points);
}

/** Whether `team` is certain to finish in the bottom places. */
function certainlyRelegated(table: TeamStanding[], team: TeamStanding, remaining: number): boolean {
  if (remaining === 0) return team.position > table.length - RELEGATION_PLACES;
  const above = table.filter(t => t !== team && t.points > team.points + 3 * remaining).length;
  return above >= table.length - RELEGATION_PLACES;
}

/** Whether `team` is certain to finish above the bottom places. */
function certainlySafe(table: TeamStanding[], team: TeamStanding, remaining: number): boolean {
  if (remaining === 0) return team.position <= table.length - RELEGATION_PLACES;
  const below = table.filter(t => t !== team && t.points + 3 * remaining < team.points).length;
  return below >= RELEGATION_PLACES;
}

/** What one of the XI's matches had in it, apart from the table. */
function matchMoments(week: number, f: FixtureResult, userName: string): Draft[] {
  const out: Draft[] = [];
  const home = f.home === userName;
  const opp = home ? f.away : f.home;
  const gf = home ? f.homeGoals : f.awayGoals;
  const ga = home ? f.awayGoals : f.homeGoals;
  const events = [...(f.detail?.events ?? [])].sort((a, b) => a.minute - b.minute);
  const goals = events.filter(e => e.type === 'goal');

  // The score as it stood before the last goal, and the worst it got.
  let us = 0, them = 0, worstDeficit = 0, deficitScore = '';
  for (const g of goals) {
    if (g.user) us++; else them++;
    if (them - us > worstDeficit) { worstDeficit = them - us; deficitScore = `${us}–${them}`; }
  }
  const last = goals[goals.length - 1];
  const late = last !== undefined && last.minute >= LATE_MINUTE;

  if (late && last.user && gf === ga + 1) {
    out.push({ week, kind: 'late-winner', tone: 'good', text: `${last.name} wins it in the ${ordinal(last.minute)} minute against ${opp}` });
  } else if (late && last.user && gf === ga) {
    out.push({ week, kind: 'late-equaliser', tone: 'good', text: `${last.name} rescues a point against ${opp} in the ${ordinal(last.minute)} minute` });
  } else if (late && !last.user && ga === gf + 1) {
    out.push({ week, kind: 'late-defeat', tone: 'bad', text: `${last.name} wins it late for ${opp}, ${last.minute}′` });
  } else if (late && !last.user && gf === ga) {
    out.push({ week, kind: 'late-equaliser-against', tone: 'bad', text: `${opp} snatch a late equaliser through ${last.name}, ${last.minute}′` });
  }

  // Coming from one down is common — a strong side does it twice a season —
  // so it counts for less than coming from two down. A win big enough to be a
  // thrashing is said as one, not as a comeback.
  if (gf > ga && worstDeficit > 0 && gf - ga < BIG_MARGIN) {
    out.push({
      week, kind: 'comeback', tone: 'good',
      text: `Comeback: ${deficitScore} down against ${opp}, won ${gf}–${ga}`,
      ...(worstDeficit === 1 ? { weight: ONE_GOAL_COMEBACK_WEIGHT } : {}),
    });
  }

  const tally = new Map<string, { user: boolean; goals: number }>();
  for (const g of goals) {
    const t = tally.get(g.name) ?? { user: g.user, goals: 0 };
    t.goals++;
    tally.set(g.name, t);
  }
  for (const [name, t] of tally) {
    if (t.goals < 3) continue;
    const what = t.goals === 3 ? 'Hat-trick' : `${NUMBER_WORDS[t.goals] ?? t.goals} goals`;
    out.push(t.user
      ? { week, kind: 'hat-trick', tone: 'good', text: `${what} for ${name} against ${opp}` }
      : { week, kind: 'hat-trick-against', tone: 'bad', text: `${what} for ${opp}'s ${name}` });
  }

  for (const e of events) {
    if (e.type === 'red' && e.user) {
      out.push({ week, kind: 'red-card', tone: 'bad', text: `${e.name} sent off against ${opp}, ${e.minute}′` });
    }
  }

  if (gf - ga >= BIG_MARGIN) {
    out.push({ week, kind: 'thrashing', tone: 'good', text: `${opp} beaten ${gf}–${ga}` });
  } else if (ga - gf >= BIG_MARGIN) {
    out.push({ week, kind: 'hammering', tone: 'bad', text: `Beaten ${ga}–${gf} by ${opp}` });
  }
  return out;
}

/**
 * Every key moment of a season, in gameweek order and, within a gameweek,
 * most important first.
 */
export function keyMoments(result: Pick<SimulationResult, 'gameweeks' | 'finalTable'>): KeyMoment[] {
  const out: Draft[] = [];
  const lastWeek = result.gameweeks.length;
  const userName = result.finalTable.find(t => t.isUser)?.name ?? 'Your XI';

  const seasonGoals = new Map<string, number>();
  let winStreak = 0;
  let unbeaten = 0;
  let wins = 0;
  let onTop = false;
  let inDropZone = false;
  let titleDone = false;
  let dropDone = false;
  let safeDone = false;

  for (let i = 0; i < lastWeek; i++) {
    const gw = result.gameweeks[i];
    const week = gw.week;
    const remaining = lastWeek - week;
    const table = gw.tableSnapshot;
    const me = table.find(t => t.isUser);
    const f = gw.fixtures.find(x => x.userInvolved);

    if (f) {
      out.push(...matchMoments(week, f, userName));
      const home = f.home === userName;
      const gf = home ? f.homeGoals : f.awayGoals;
      const ga = home ? f.awayGoals : f.homeGoals;

      if (gf > ga) { winStreak++; wins++; } else winStreak = 0;
      if (gf >= ga) unbeaten++; else unbeaten = 0;
      if (STREAK_MILESTONES.includes(winStreak) && winStreak < lastWeek) {
        out.push({ week, kind: 'win-streak', tone: 'good', text: `${NUMBER_WORDS[winStreak] ?? winStreak} wins in a row` });
      }

      for (const g of f.detail?.events ?? []) {
        if (g.type !== 'goal' || !g.user) continue;
        const n = (seasonGoals.get(g.name) ?? 0) + 1;
        seasonGoals.set(g.name, n);
        if (GOAL_MILESTONES.includes(n)) {
          out.push({ week, kind: 'goal-milestone', tone: 'good', text: `${g.name} reaches ${n} league goals` });
        }
      }
    }

    // Said once on the way in and once on the way out. The state is what has
    // been announced, not what the table says, so a side top since the first
    // weekend is told it is top once the table means something, and is never
    // told it has been knocked off a top it was never said to be on.
    if (me && week > TABLE_SETTLES_AFTER) {
      if (me.position === 1 && !onTop) {
        onTop = true;
        out.push({ week, kind: 'top', tone: 'good', text: `Top of the table, ${me.points} points from ${me.played}` });
      } else if (me.position !== 1 && onTop) {
        onTop = false;
        out.push({ week, kind: 'knocked-off-top', tone: 'bad', text: `Knocked off the top by ${table[0].name}` });
      }
    }

    const dropLine = table.length - RELEGATION_PLACES;
    if (me && week > DROP_ZONE_SETTLES_AFTER && !dropDone && !safeDone) {
      if (me.position > dropLine && !inDropZone) {
        inDropZone = true;
        out.push({ week, kind: 'into-drop-zone', tone: 'bad', text: `Into the relegation places, ${ordinal(me.position)}` });
      } else if (me.position <= dropLine && inDropZone) {
        inDropZone = false;
        out.push({ week, kind: 'out-of-drop-zone', tone: 'good', text: `Out of the relegation places, up to ${ordinal(me.position)}` });
      }
    }

    if (!titleDone && titleSettled(table, remaining)) {
      titleDone = true;
      const leader = table[0];
      const when = remaining === 0 ? 'on the final day' : `with ${remaining} to play`;
      out.push(leader.isUser
        ? { week, kind: 'champions', tone: 'good', text: `Champions ${when}` }
        : { week, kind: 'title-elsewhere', tone: me && me.position === 2 ? 'bad' : 'neutral', text: `${leader.name} are champions ${when}` });
    }

    if (me && !dropDone && !safeDone) {
      if (certainlyRelegated(table, me, remaining)) {
        dropDone = true;
        out.push({ week, kind: 'relegated', tone: 'bad', text: remaining === 0 ? 'Relegated on the final day' : `Relegated, with ${remaining} to play` });
      } else if (certainlySafe(table, me, remaining)) {
        safeDone = true;
        // Only worth saying for a side that had something to fear: a title
        // contender is mathematically safe by October and nobody cares.
        if (me.position > table.length / 2) {
          out.push({ week, kind: 'safe', tone: 'good', text: remaining === 0 ? 'Survival on the final day' : `Safe, with ${remaining} to play` });
        }
      }
    }

    if (week === lastWeek && f) {
      if (wins === lastWeek) {
        out.push({ week, kind: 'perfect', tone: 'good', text: `${lastWeek} wins from ${lastWeek}. Perfect.` });
      } else if (unbeaten === lastWeek) {
        out.push({ week, kind: 'invincible', tone: 'good', text: `Unbeaten all season` });
      }
    }
  }

  return out
    .map(m => ({ ...m, weight: m.weight ?? WEIGHTS[m.kind] }))
    .sort((a, b) => a.week - b.week || b.weight - a.weight);
}

/**
 * The moments that tell a whole season: the most important `count`, in the
 * order they happened.
 */
export function seasonStory(moments: readonly KeyMoment[], count: number): KeyMoment[] {
  return [...moments]
    .sort((a, b) => b.weight - a.weight || a.week - b.week)
    .slice(0, count)
    .sort((a, b) => a.week - b.week || b.weight - a.weight);
}
