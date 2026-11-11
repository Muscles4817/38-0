// ── Seasons played ───────────────────────────────────────
//
// Every season the game simulates is recorded here, in localStorage, as a few
// numbers. Two screens read it:
//
// - the pre-season screen, to show what each style has done with THIS eleven
//   in THIS league. The pre-season odds are priced for a plain Balanced side
//   on purpose, so the only way to learn what Gegenpress is worth to an XI is
//   to play it, and this is where that gets written down;
// - the home page, as a record of past runs.
//
// It holds references and totals only, a couple of hundred bytes a season, and
// is capped, so it cannot grow into the quota problem seenSquads.ts describes.

export const RUN_HISTORY_KEY = '38-0-history';

/** Enough seasons to fill a tactics board many times over, small enough to never matter. */
export const RUN_HISTORY_LIMIT = 200;

export interface RunRecord {
  /** Which eleven, in which slots: see `xiKey`. */
  xi: string;
  /** The league-season it was played in. */
  seasonId: number;
  seasonLabel: string;
  style: string;
  formation: string;
  overall: number;
  position: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** What the pre-season odds expected of the XI playing Balanced. */
  expectedPoints: number;
  topScorer: string;
  topScorerGoals: number;
  /** The seed the season was played on, so it can be played again exactly. */
  seed: number;
  /** Milliseconds since the epoch. */
  playedAt: number;
}

/**
 * Identifies an eleven by who plays where. Two drafts that end with the same
 * players in the same slots are the same XI; move one player and it is not,
 * because the engine plays him differently there.
 */
export function xiKey(picks: readonly { slotIndex: number; playerId: number; clubId?: number; seasonId?: number }[]): string {
  return [...picks]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map(p => `${p.slotIndex}:${p.playerId}@${p.clubId ?? 0}-${p.seasonId ?? 0}`)
    .join('|');
}

function isRun(entry: unknown): entry is RunRecord {
  if (typeof entry !== 'object' || entry === null) return false;
  const r = entry as Record<string, unknown>;
  return typeof r.xi === 'string' && typeof r.style === 'string'
    && Number.isFinite(r.seasonId) && Number.isFinite(r.points) && Number.isFinite(r.position);
}

/** The stored value as a list of runs, dropping anything that is not one. */
export function parseRunHistory(stored: unknown): RunRecord[] {
  return Array.isArray(stored) ? stored.filter(isRun) : [];
}

/** Adds a season, newest last, dropping the oldest beyond the limit. */
export function withRun(list: readonly RunRecord[], run: RunRecord, limit = RUN_HISTORY_LIMIT): RunRecord[] {
  return [...list, run].slice(-limit);
}

export interface StyleRecord {
  style: string;
  played: number;
  bestPoints: number;
  bestPosition: number;
  averagePoints: number;
  titles: number;
}

/**
 * What each style has done for one eleven in one league-season, best average
 * first. Styles never played are absent.
 */
export function styleRecords(list: readonly RunRecord[], xi: string, seasonId: number): StyleRecord[] {
  const byStyle = new Map<string, RunRecord[]>();
  for (const run of list) {
    if (run.xi !== xi || run.seasonId !== seasonId) continue;
    byStyle.set(run.style, [...(byStyle.get(run.style) ?? []), run]);
  }
  return [...byStyle].map(([style, runs]) => ({
    style,
    played: runs.length,
    bestPoints: Math.max(...runs.map(r => r.points)),
    bestPosition: Math.min(...runs.map(r => r.position)),
    averagePoints: runs.reduce((sum, r) => sum + r.points, 0) / runs.length,
    titles: runs.filter(r => r.position === 1).length,
  })).sort((a, b) => b.averagePoints - a.averagePoints || b.bestPoints - a.bestPoints);
}

/** The best seasons on record: highest finish, then most points. */
export function bestRuns(list: readonly RunRecord[], count: number): RunRecord[] {
  return [...list]
    .sort((a, b) => a.position - b.position || b.points - a.points || b.playedAt - a.playedAt)
    .slice(0, count);
}
