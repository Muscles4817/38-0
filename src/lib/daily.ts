// ── The daily challenge ──────────────────────────────────
//
// One draft a day that everyone plays: the same formation, the same spins in
// the same order, the same league-season and the same season seed. Two
// friends who draft the same XI and pick the same style get the same table,
// so the share text is a comparison rather than a boast.
//
// There is no server, so everything is derived from the date. The date is UTC,
// so a challenge changes at the same moment everywhere and two people in
// different time zones are playing the same one.
//
// The first season played with the day's draft is the one that counts. Later
// seasons — another style, the same XI again — are practice: they go into the
// ordinary run history but never replace the day's result.

import { mulberry32 as seeded } from './matchEngine';
import type { SimulationResult } from './simulation';

export const DAILY_KEY = '38-0-daily';

/** Challenge #1. */
export const DAILY_EPOCH = '2026-11-13';

/** Enough days to show a streak and a month of results, small enough to never matter. */
export const DAILY_LIMIT = 60;

const DAY_MS = 86_400_000;

/** Today's date, as the challenge counts days: `YYYY-MM-DD` in UTC. */
export function dailyDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The challenge's number: #1 on the epoch, counting up a day at a time. */
export function dailyNumber(date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) / DAY_MS) + 1;
}

/** FNV-1a: a string to a 32-bit unsigned integer, the same in every browser. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** What a day's challenge fixes. Stored in `38-0-setup` as `daily`. */
export interface DailyChallenge {
  date: string;
  number: number;
  formation: string;
  /** The league-season the XI plays in. */
  seasonId: number;
  league: string;
  /** The season's seed: everyone's 38 games are drawn from the same stream. */
  seed: number;
  /** Orders the draft pool; see `dailyOrder`. */
  spinSeed: number;
}

/**
 * The challenge for a date. The formation and the league-season are drawn
 * from the lists given, which the caller takes from the shipped snapshot: a
 * data release that adds a season can change which one a future day draws,
 * but the same build always gives the same answer.
 */
export function dailyChallenge(
  date: string,
  formations: readonly string[],
  competitions: readonly { seasonId: number; league: string }[],
): DailyChallenge {
  const rand = seeded(hash(`38-0 daily ${date}`));
  const formation = [...formations].sort()[Math.floor(rand() * formations.length)];
  const ordered = [...competitions].sort((a, b) => a.seasonId - b.seasonId || a.league.localeCompare(b.league));
  const competition = ordered[Math.floor(rand() * ordered.length)];
  return {
    date,
    number: dailyNumber(date),
    formation,
    seasonId: competition.seasonId,
    league: competition.league,
    seed: Math.floor(rand() * 2_000_000_000),
    spinSeed: Math.floor(rand() * 2_000_000_000),
  };
}

/**
 * The day's draft pool in the order its spins walk through it. Each spin lands
 * on the next squad in this order that the XI can still use, so two players
 * who place the same players get exactly the same spins, and two who do not
 * diverge only where one of them had no use for a squad.
 *
 * Sorted before it is shuffled, so the order does not depend on how the pool
 * happened to be built.
 */
export function dailyOrder<T extends { clubId: number; seasonId: number }>(pool: readonly T[], spinSeed: number): T[] {
  const rand = seeded(spinSeed);
  const out = [...pool].sort((a, b) => a.clubId - b.clubId || a.seasonId - b.seasonId);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Results ──────────────────────────────────────────────

export interface DailyResult {
  date: string;
  number: number;
  seasonLabel: string;
  formation: string;
  overall: number;
  style: string;
  changedTo?: string;
  position: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  topScorer: string;
  topScorerGoals: number;
  /** One letter a match, W, D or L, in order: the share grid. */
  form: string;
  /** Which season played on the day this is; a later one never replaces it. */
  playedAt: number;
}

function isDailyResult(entry: unknown): entry is DailyResult {
  if (typeof entry !== 'object' || entry === null) return false;
  const r = entry as Record<string, unknown>;
  return typeof r.date === 'string' && typeof r.form === 'string'
    && Number.isFinite(r.points) && Number.isFinite(r.position) && Number.isFinite(r.playedAt);
}

/** The stored value as a list of results, dropping anything that is not one. */
export function parseDailyResults(stored: unknown): DailyResult[] {
  return Array.isArray(stored) ? stored.filter(isDailyResult) : [];
}

/**
 * Records a day's season. The first season of a day is the one that counts:
 * another for the same date is ignored, unless it is the same season (same
 * `playedAt`) rewritten by a change of style at halfway.
 */
export function withDailyResult(list: readonly DailyResult[], result: DailyResult, limit = DAILY_LIMIT): DailyResult[] {
  const i = list.findIndex(r => r.date === result.date);
  if (i >= 0) return list[i].playedAt === result.playedAt ? list.map((r, j) => (j === i ? result : r)) : [...list];
  return [...list, result].sort((a, b) => a.date.localeCompare(b.date)).slice(-limit);
}

/** The XI's results, one letter a match. */
export function formOf(result: Pick<SimulationResult, 'gameweeks'>): string {
  return result.gameweeks.map(gw => {
    const f = gw.fixtures.find(x => x.userInvolved);
    if (!f) return '';
    const home = f.home === 'Your XI';
    const gf = home ? f.homeGoals : f.awayGoals;
    const ga = home ? f.awayGoals : f.homeGoals;
    return gf > ga ? 'W' : gf === ga ? 'D' : 'L';
  }).join('');
}

/**
 * Days in a row with a counted result, ending today — or yesterday, so a
 * streak is not shown as broken before today's has been played.
 */
export function dailyStreak(list: readonly DailyResult[], today: string): number {
  const played = new Set(list.map(r => r.date));
  let day = Date.parse(`${today}T00:00:00Z`);
  if (!played.has(today)) day -= DAY_MS;
  let streak = 0;
  while (played.has(new Date(day).toISOString().slice(0, 10))) {
    streak++;
    day -= DAY_MS;
  }
  return streak;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const SQUARE: Record<string, string> = { W: '🟩', D: '🟨', L: '🟥' };

/**
 * The text a day's result is shared as. The grid is the season in two rows,
 * one per half, so the half-time decision is visible in it.
 */
export function dailyShareText(r: DailyResult, styleLabel: (style: string) => string): string {
  const half = Math.floor(r.form.length / 2);
  const row = (s: string) => [...s].map(c => SQUARE[c] ?? '⬜').join('');
  return [
    `38-0 Daily #${r.number} · ${r.seasonLabel}`,
    `${ordinal(r.position)} · ${r.points} pts · ${r.wins}-${r.draws}-${r.losses}`,
    row(r.form.slice(0, half)),
    row(r.form.slice(half)),
    `XI ${r.overall} · ${styleLabel(r.style)}${r.changedTo ? ` → ${styleLabel(r.changedTo)}` : ''} · ${r.topScorer} ${r.topScorerGoals}`,
  ].join('\n');
}
