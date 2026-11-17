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
import * as say from './momentText';
import type { PlayerNote } from './momentText';

export type MomentTone = 'good' | 'bad' | 'neutral';

export type MomentKind =
  | 'late-winner' | 'late-equaliser' | 'late-defeat' | 'late-equaliser-against'
  | 'comeback' | 'hat-trick' | 'hat-trick-against' | 'red-card' | 'suspension'
  | 'thrashing' | 'hammering'
  | 'top' | 'knocked-off-top' | 'into-drop-zone' | 'out-of-drop-zone'
  | 'champions' | 'title-elsewhere' | 'relegated' | 'safe'
  | 'win-streak' | 'goal-milestone' | 'perfect' | 'invincible'
  | 'screamer' | 'only-goal' | 'drought-over'
  | 'unbeaten-run' | 'clean-sheet-run' | 'losing-run' | 'winless-run';

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
  'knocked-off-top': 55, 'out-of-drop-zone': 55, 'late-defeat': 55, 'losing-run': 52,
  'red-card': 50, 'late-equaliser-against': 50, 'only-goal': 48, screamer: 47, 'unbeaten-run': 46,
  'win-streak': 45, 'clean-sheet-run': 44, 'winless-run': 44,
  'goal-milestone': 40, 'drought-over': 40, 'hat-trick-against': 40, suspension: 38, thrashing: 35, hammering: 35,
};

/** A comeback from a single goal down: worth a line, not a headline. */
const ONE_GOAL_COMEBACK_WEIGHT = 42;
/** A defender's only goal that did not decide anything: a smile, not a headline. */
const IDLE_ONLY_GOAL_WEIGHT = 41;

const UNBEATEN_MILESTONES = [10, 15, 20, 25, 30];
const CLEAN_SHEET_MILESTONES = [4, 6, 8, 10];
const LOSING_MILESTONES = [3, 5, 7];
const LOSING_RUN_WEIGHT: Record<number, number> = { 3: 37, 5: 52, 7: 62 };
const WINLESS_MILESTONES = [6, 10, 15];
/** A forward this many matches without a goal, then scoring, is worth saying. */
const DROUGHT_GAMES = 8;
/** Positions whose only goal of the season is a story. */
const RARE_SCORERS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM'];
const FORWARDS = ['ST', 'CF', 'LW', 'RW'];
/** Lines about one goal, which a defender's only-goal line replaces. */
const SAME_GOAL_KINDS: readonly MomentKind[] = ['late-winner', 'late-equaliser', 'screamer'];

/** A moment before it is weighed; `weight` overrides its kind's. */
type Draft = Omit<KeyMoment, 'weight'> & { weight?: number };

function matchesWord(n: number): string {
  return n === 1 ? 'the next match' : `${say.numberWord(n)} matches`;
}

/** The XI's players by name: position and traits, from the season's stats. */
type Notes = ReadonlyMap<string, PlayerNote>;

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
function matchMoments(week: number, f: FixtureResult, userName: string, notes: Notes): Draft[] {
  const out: Draft[] = [];
  const home = f.home === userName;
  const opp = home ? f.away : f.home;
  const gf = home ? f.homeGoals : f.awayGoals;
  const ga = home ? f.awayGoals : f.homeGoals;
  const events = [...(f.detail?.events ?? [])].sort((a, b) => a.minute - b.minute);
  const goals = events.filter(e => e.type === 'goal');
  const line = (g: typeof goals[number]): say.GoalLine => ({
    name: g.name, opp, minute: g.minute, chance: g.chance,
    scorer: g.user ? notes.get(g.name) : undefined,
    assist: g.assist, assister: g.user && g.assist ? notes.get(g.assist) : undefined,
    score: `${gf}–${ga}`,
  });

  // The score as it stood before the last goal, and the worst it got.
  let us = 0, them = 0, worstDeficit = 0, deficitScore = '';
  for (const g of goals) {
    if (g.user) us++; else them++;
    if (them - us > worstDeficit) { worstDeficit = them - us; deficitScore = `${us}–${them}`; }
  }
  const last = goals[goals.length - 1];
  const late = last !== undefined && last.minute >= LATE_MINUTE;

  if (late && last.user && gf === ga + 1) {
    out.push({ week, kind: 'late-winner', tone: 'good', text: say.lateWinnerText(week, line(last)) });
  } else if (late && last.user && gf === ga) {
    out.push({ week, kind: 'late-equaliser', tone: 'good', text: say.lateEqualiserText(week, line(last)) });
  } else if (late && !last.user && ga === gf + 1) {
    out.push({ week, kind: 'late-defeat', tone: 'bad', text: say.lateDefeatText(week, line(last)) });
  } else if (late && !last.user && gf === ga) {
    out.push({ week, kind: 'late-equaliser-against', tone: 'bad', text: say.lateEqualiserAgainstText(week, line(last)) });
  }

  // A goal from distance that won a close match, when the late-goal line has
  // not already said it. In a rout, the first goal decided nothing.
  const winner = gf > ga ? winningGoal(goals, ga) : undefined;
  if (winner && winner.chance === 'longShot' && gf - ga <= 2 && !(late && winner === last)) {
    out.push({ week, kind: 'screamer', tone: 'good', text: say.screamerText(week, line(winner)) });
  }

  // Coming from one down is common — a strong side does it twice a season —
  // so it counts for less than coming from two down. A win big enough to be a
  // thrashing is said as one, not as a comeback.
  if (gf > ga && worstDeficit > 0 && gf - ga < BIG_MARGIN) {
    out.push({
      week, kind: 'comeback', tone: 'good',
      text: say.comebackText(week, deficitScore, opp, gf, ga),
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
    out.push(t.user
      ? { week, kind: 'hat-trick', tone: 'good', text: say.hatTrickText(week, name, opp, t.goals, notes.get(name)) }
      : { week, kind: 'hat-trick-against', tone: 'bad', text: say.hatTrickAgainstText(week, name, opp, t.goals) });
  }

  for (const e of events) {
    if (e.type === 'red' && e.user) {
      out.push({ week, kind: 'red-card', tone: 'bad', text: say.redCardText(week, e.name, opp, e.minute, notes.get(e.name)) });
    }
  }

  if (gf - ga >= BIG_MARGIN) {
    out.push({ week, kind: 'thrashing', tone: 'good', text: say.thrashingText(week, opp, gf, ga) });
  } else if (ga - gf >= BIG_MARGIN) {
    out.push({ week, kind: 'hammering', tone: 'bad', text: say.hammeringText(week, opp, gf, ga) });
  }
  return out;
}

/** The XI's goal that put it ahead for good, in a win: its (ga + 1)th. */
function winningGoal<G extends { user: boolean }>(goals: readonly G[], ga: number): G | undefined {
  let n = 0;
  for (const g of goals) {
    if (!g.user) continue;
    n++;
    if (n === ga + 1) return g;
  }
  return undefined;
}

/**
 * Every key moment of a season, in gameweek order and, within a gameweek,
 * most important first.
 */
export function keyMoments(result: Pick<SimulationResult, 'gameweeks' | 'finalTable' | 'bans'> & Partial<Pick<SimulationResult, 'playerStats'>>): KeyMoment[] {
  const out: Draft[] = [];
  const lastWeek = result.gameweeks.length;
  const userName = result.finalTable.find(t => t.isUser)?.name ?? 'Your XI';
  const notes: Notes = new Map((result.playerStats ?? []).map(s => [s.playerName, { position: s.position, traits: s.traits ?? [] }]));
  const keeper = (result.playerStats ?? []).filter(s => s.position === 'GK').sort((a, b) => b.appearances - a.appearances)[0]?.playerName;

  const seasonGoals = new Map<string, number>();
  // Each scorer's goals by week, and whether each one won the match.
  const goalLog = new Map<string, { week: number; opp: string; decisive: boolean; chance?: say.GoalLine['chance'] }[]>();
  const lastScored = new Map<string, number>();
  let winStreak = 0;
  let unbeaten = 0;
  let cleanSheets = 0;
  let losing = 0;
  let winless = 0;
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
      // A red card says how long he is out for, when suspensions are played;
      // a ban for yellows is a moment of its own.
      const bansNow = (result.bans ?? []).filter(b => b.week === week);
      const reds = new Map(bansNow.filter(b => b.reason !== 'yellows').map(b => [b.playerName, b]));
      const redsNow = (f.detail?.events ?? []).filter(e => e.type === 'red' && e.user).map(e => e.name);
      out.push(...matchMoments(week, f, userName, notes).map(m => {
        if (m.kind !== 'red-card') return m;
        const who = redsNow.find(n => m.text.includes(n));
        const ban = who ? reds.get(who) : undefined;
        return ban ? { ...m, text: `${m.text}. Out for ${matchesWord(ban.matches)}` } : m;
      }));
      for (const b of bansNow) {
        if (b.reason !== 'yellows') continue;
        out.push({ week, kind: 'suspension', tone: 'bad', text: say.suspensionText(week, b.playerName, matchesWord(b.matches), notes.get(b.playerName)) });
      }
      const home = f.home === userName;
      const opp = home ? f.away : f.home;
      const gf = home ? f.homeGoals : f.awayGoals;
      const ga = home ? f.awayGoals : f.homeGoals;

      if (gf > ga) { winStreak++; wins++; } else winStreak = 0;
      if (gf >= ga) unbeaten++; else unbeaten = 0;
      if (ga === 0) cleanSheets++; else cleanSheets = 0;
      if (gf < ga) losing++; else losing = 0;
      if (gf <= ga) winless++; else winless = 0;
      if (STREAK_MILESTONES.includes(winStreak) && winStreak < lastWeek) {
        out.push({ week, kind: 'win-streak', tone: 'good', text: say.winStreakText(week, winStreak) });
      } else if (UNBEATEN_MILESTONES.includes(unbeaten) && unbeaten > winStreak && unbeaten < lastWeek) {
        out.push({ week, kind: 'unbeaten-run', tone: 'good', text: say.unbeatenRunText(week, unbeaten) });
      }
      if (CLEAN_SHEET_MILESTONES.includes(cleanSheets)) {
        out.push({ week, kind: 'clean-sheet-run', tone: 'good', text: say.cleanSheetRunText(week, cleanSheets, keeper) });
      }
      if (LOSING_MILESTONES.includes(losing)) {
        // Three in a row happens to most sides; five is a crisis.
        out.push({ week, kind: 'losing-run', tone: 'bad', text: say.losingRunText(week, losing), weight: LOSING_RUN_WEIGHT[losing] });
      } else if (WINLESS_MILESTONES.includes(winless) && winless > losing) {
        out.push({ week, kind: 'winless-run', tone: 'bad', text: say.winlessRunText(week, winless) });
      }

      const events = [...(f.detail?.events ?? [])].sort((a, b) => a.minute - b.minute);
      const goals = events.filter(e => e.type === 'goal');
      const winner = gf > ga ? winningGoal(goals, ga) : undefined;
      const scoredToday = new Set<string>();
      for (const g of goals) {
        if (!g.user) continue;
        const n = (seasonGoals.get(g.name) ?? 0) + 1;
        seasonGoals.set(g.name, n);
        const log = goalLog.get(g.name) ?? [];
        log.push({ week, opp, decisive: g === winner, chance: g.chance });
        goalLog.set(g.name, log);
        if (GOAL_MILESTONES.includes(n)) {
          out.push({ week, kind: 'goal-milestone', tone: 'good', text: say.goalMilestoneText(week, g.name, n, opp, notes.get(g.name)) });
        }
        if (scoredToday.has(g.name)) continue;
        scoredToday.add(g.name);
        // A forward who had played every match since his last goal, or since
        // the start, and went DROUGHT_GAMES without one.
        const note = notes.get(g.name);
        const since = lastScored.get(g.name) ?? 0;
        const gap = week - since - 1;
        const stat = result.playerStats?.find(s => s.playerName === g.name);
        if (note?.position && FORWARDS.includes(note.position) && gap >= DROUGHT_GAMES && stat?.appearances === lastWeek) {
          out.push({ week, kind: 'drought-over', tone: 'good', text: say.droughtOverText(week, g.name, gap, opp, since === 0) });
        }
        lastScored.set(g.name, week);
      }
    }

    // Said once on the way in and once on the way out. The state is what has
    // been announced, not what the table says, so a side top since the first
    // weekend is told it is top once the table means something, and is never
    // told it has been knocked off a top it was never said to be on.
    if (me && week > TABLE_SETTLES_AFTER) {
      if (me.position === 1 && !onTop) {
        onTop = true;
        out.push({ week, kind: 'top', tone: 'good', text: say.topText(week, me.points, me.played) });
      } else if (me.position !== 1 && onTop) {
        onTop = false;
        out.push({ week, kind: 'knocked-off-top', tone: 'bad', text: say.knockedOffTopText(week, table[0].name) });
      }
    }

    const dropLine = table.length - RELEGATION_PLACES;
    if (me && week > DROP_ZONE_SETTLES_AFTER && !dropDone && !safeDone) {
      if (me.position > dropLine && !inDropZone) {
        inDropZone = true;
        out.push({ week, kind: 'into-drop-zone', tone: 'bad', text: say.intoDropZoneText(week, me.position) });
      } else if (me.position <= dropLine && inDropZone) {
        inDropZone = false;
        out.push({ week, kind: 'out-of-drop-zone', tone: 'good', text: say.outOfDropZoneText(week, me.position) });
      }
    }

    if (!titleDone && titleSettled(table, remaining)) {
      titleDone = true;
      const leader = table[0];
      out.push(leader.isUser
        ? { week, kind: 'champions', tone: 'good', text: say.championsText(week, remaining) }
        : { week, kind: 'title-elsewhere', tone: me && me.position === 2 ? 'bad' : 'neutral', text: say.titleElsewhereText(week, leader.name, remaining) });
    }

    if (me && !dropDone && !safeDone) {
      if (certainlyRelegated(table, me, remaining)) {
        dropDone = true;
        out.push({ week, kind: 'relegated', tone: 'bad', text: say.relegatedText(week, remaining) });
      } else if (certainlySafe(table, me, remaining)) {
        safeDone = true;
        // Only worth saying for a side that had something to fear: a title
        // contender is mathematically safe by October and nobody cares.
        if (me.position > table.length / 2) {
          out.push({ week, kind: 'safe', tone: 'good', text: say.safeText(week, remaining) });
        }
      }
    }

    if (week === lastWeek && f) {
      if (wins === lastWeek) {
        out.push({ week, kind: 'perfect', tone: 'good', text: say.perfectText(week, lastWeek) });
      } else if (unbeaten === lastWeek) {
        out.push({ week, kind: 'invincible', tone: 'good', text: say.invincibleText(week) });
      }
    }
  }

  // Known only once the season is over: a defender, a holding midfielder or a
  // keeper who scored exactly once. Said at the week he scored it.
  for (const [name, log] of goalLog) {
    const note = notes.get(name);
    if (log.length !== 1 || !note?.position || !RARE_SCORERS.includes(note.position)) continue;
    const g = log[0];
    // If the goal already has a line of its own (a late winner, a screamer),
    // this one replaces it and takes its place in the story.
    const same = out.filter(m => m.week === g.week && SAME_GOAL_KINDS.includes(m.kind) && m.text.includes(name));
    const replaced = Math.max(0, ...same.map(m => m.weight ?? WEIGHTS[m.kind]));
    for (const m of same) out.splice(out.indexOf(m), 1);
    out.push({
      week: g.week, kind: 'only-goal', tone: 'good',
      text: say.onlyGoalText(g.week, name, g.opp, g.decisive, g.chance, note),
      ...(replaced > 0 ? { weight: Math.max(replaced, WEIGHTS['only-goal']) } : g.decisive ? {} : { weight: IDLE_ONLY_GOAL_WEIGHT }),
    });
  }

  return out
    .map(m => ({ ...m, weight: m.weight ?? WEIGHTS[m.kind] }))
    .sort((a, b) => a.week - b.week || b.weight - a.weight);
}

/** No kind of moment takes more than this many places in a season's story. */
const STORY_PER_KIND = 2;

/**
 * The moments that tell a whole season: the most important `count`, in the
 * order they happened, with no kind more than twice. A striker's fourth
 * hat-trick is a fine thing, but the season had other things in it.
 */
export function seasonStory(moments: readonly KeyMoment[], count: number): KeyMoment[] {
  const used = new Map<MomentKind, number>();
  const chosen: KeyMoment[] = [];
  for (const m of [...moments].sort((a, b) => b.weight - a.weight || a.week - b.week)) {
    if (chosen.length >= count) break;
    const n = used.get(m.kind) ?? 0;
    if (n >= STORY_PER_KIND) continue;
    used.set(m.kind, n + 1);
    chosen.push(m);
  }
  return chosen.sort((a, b) => a.week - b.week || b.weight - a.weight);
}
