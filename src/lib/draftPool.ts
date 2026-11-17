// ── The draft pool ─────────────────────────────────────
//
// Everything the draft can offer, after the run's rules are applied: the era,
// Prime mode, and a challenge filter. The draft page spins from this pool, and
// "What Could Have Been" on the results page reads players through the same
// rules, so the two always agree on who was draftable and at what rating.
//
// A challenge is a filter, not a different game. One Club keeps one club's
// seasons; One Nation keeps players of one nationality and drops any squad left
// with nobody; Budget XI keeps players at or under a rating. The draft then
// runs exactly as it does without one. See docs/draft-pool.md.
//
// A filter can leave a pool that cannot field an XI (82 of 109 nations cannot
// fill a 4-4-2), or one that can but only if the right player goes in the right
// slot: in simulated random drafts restricted to Finland, 59% got stuck with an
// open slot nobody left could fill. So the pool comes with a feasibility check,
// used to offer only workable choices on the setup page and to refuse a
// placement during the draft that would make the XI impossible to finish.

import { canFillSlot, type Formation, type Position } from './formations';
import {
  describeCompetition, gameData, leagueName, listCompetitions, listDraftableSquads, SIMULATED_LEAGUE,
  type DataPlayer, type SpunSquad,
} from './gameData';

export type DraftFilter =
  | { kind: 'club'; clubId: number }
  | { kind: 'nation'; nation: string }
  | { kind: 'max-rating'; maxRating: number };

export interface PoolRules {
  yearStart: number;
  yearEnd: number;
  /** 'prime' rates every player at the best rating the snapshot holds for them. */
  playerRating: 'career' | 'prime';
  filter: DraftFilter | null;
  /**
   * The parts of the pool switched on: league codes ('PL', 'LL') and/or
   * ICONS. See poolSourceOf. Absent falls back to `scope`.
   */
  sources?: readonly string[];
  /**
   * The choice before `sources`, still read from setups saved with it:
   * 'premier-league' is Premier League only, and 'with-icons' or absent is
   * Premier League + icons. The daily challenge saves neither, so it keeps
   * the pool it has always had.
   */
  scope?: PoolScope;
}

export type PoolScope = 'with-icons' | 'premier-league';

// ── Pool sources ──────────────────────────────────────

/** The source for famous sides from outside a full league-season. */
export const ICONS = 'icons';

/** What a new run drafts from unless the player switches more on. */
export const DEFAULT_SOURCES: readonly string[] = [SIMULATED_LEAGUE];

/** Premier League + icons: old setups, and the daily challenge. */
export const LEGACY_SOURCES: readonly string[] = [SIMULATED_LEAGUE, ICONS];

const fullLeagueSeason = new Map<string, boolean>();

/**
 * Which part of the pool a club-season belongs to. English sides are 'PL'.
 * A side from a league-season complete enough to play a league in
 * (describeCompetition) is its league, so every La Liga 2025/26 club is 'LL'.
 * Anything else, such as Barcelona 2009/10 on its own, is an icon.
 */
export function poolSourceOf(squad: Pick<SpunSquad, 'league' | 'seasonId'>): string {
  if (squad.league === SIMULATED_LEAGUE) return SIMULATED_LEAGUE;
  const key = `${squad.league}|${squad.seasonId}`;
  let full = fullLeagueSeason.get(key);
  if (full === undefined) {
    full = describeCompetition(squad.seasonId, squad.league) !== null;
    fullLeagueSeason.set(key, full);
  }
  return full ? squad.league : ICONS;
}

/** The sources a set of rules switches on. */
export function resolveSources(rules: Pick<PoolRules, 'sources' | 'scope'>): readonly string[] {
  if (rules.sources) return rules.sources;
  return rules.scope === 'premier-league' ? DEFAULT_SOURCES : LEGACY_SOURCES;
}

export interface PoolSourceOption {
  id: string;
  label: string;
  description: string;
}

/**
 * The sources the setup page offers: the Premier League, every other league
 * with at least one full season in the snapshot, and the icons. A league
 * appears here as soon as a whole season of it is imported.
 */
export function poolSourceOptions(): PoolSourceOption[] {
  const seasonsByLeague = new Map<string, string[]>();
  for (const c of listCompetitions()) {
    if (c.league === SIMULATED_LEAGUE) continue;
    seasonsByLeague.set(c.league, [...(seasonsByLeague.get(c.league) ?? []), c.seasonLabel]);
  }
  return [
    { id: SIMULATED_LEAGUE, label: leagueName(SIMULATED_LEAGUE), description: 'Every English top-flight season' },
    ...[...seasonsByLeague.entries()].map(([league, seasons]) => ({
      id: league,
      label: leagueName(league),
      description: `Every club, ${seasons.sort().join(', ')}`,
    })),
    { id: ICONS, label: 'Icons', description: 'Famous Serie A, La Liga, Bundesliga and World Cup sides' },
  ];
}

/** "Premier League + La Liga", for the setup summary. */
export function describeSources(sources: readonly string[]): string {
  const labels = poolSourceOptions().filter(o => sources.includes(o.id)).map(o => o.label);
  if (labels.length === 1 && sources[0] !== ICONS) return `${labels[0]} only`;
  return labels.join(' + ');
}

// ── Prime ratings ─────────────────────────────────────

let primeRatings: Map<number, number> | null = null;

/**
 * Each player's best rating in any season the snapshot holds, era aside:
 * Prime means the best version of the player, wherever it was.
 */
function primeRatingOf(playerId: number): number | undefined {
  if (!primeRatings) {
    primeRatings = new Map();
    for (const squad of gameData.squads) {
      for (const p of squad.players) {
        if (p.rating > (primeRatings.get(p.playerId) ?? -Infinity)) primeRatings.set(p.playerId, p.rating);
      }
    }
  }
  return primeRatings.get(playerId);
}

// ── Applying the rules ────────────────────────────────

/**
 * One squad's players under the rules: re-rated for Prime, then filtered.
 *
 * Prime takes only the rating from a player's best season. Positions stay those
 * of the squad being shown, so "where they can play" in the list is still true
 * of the row it is printed on. The club filter is a squad-level rule and is
 * applied in draftPool, not here.
 */
export function applyRules(players: DataPlayer[], rules: Pick<PoolRules, 'playerRating' | 'filter'>): DataPlayer[] {
  let result = players;
  if (rules.playerRating === 'prime') {
    result = result
      .map(p => ({ ...p, rating: primeRatingOf(p.playerId) ?? p.rating }))
      // Squads are stored best first; keep that true after re-rating.
      .sort((a, b) => b.rating - a.rating);
  }
  const filter = rules.filter;
  if (filter?.kind === 'nation') result = result.filter(p => p.nationality === filter.nation);
  // After Prime, so Budget XI in Prime mode means "whose best was 78 or below".
  if (filter?.kind === 'max-rating') result = result.filter(p => p.rating <= filter.maxRating);
  return result;
}

/** The club-seasons the draft can spin, with their players under the rules. */
export function draftPool(rules: PoolRules): SpunSquad[] {
  const filter = rules.filter;
  const sources = new Set(resolveSources(rules));
  const pool: SpunSquad[] = [];
  for (const squad of listDraftableSquads(rules.yearStart, rules.yearEnd)) {
    if (filter?.kind === 'club' && squad.clubId !== filter.clubId) continue;
    if (!sources.has(poolSourceOf(squad))) continue;
    const players = applyRules(squad.players, rules);
    if (players.length > 0) pool.push({ ...squad, players });
  }
  return pool;
}

// ── Feasibility ───────────────────────────────────────

export interface Feasibility {
  /** Whether the open slots can still all be filled by players not yet picked. */
  canComplete(picks: readonly { slotIndex: number; playerId: number }[]): boolean;
  /** Whether putting `player` in `slotIndex` is legal and leaves the XI completable. */
  canPlace(
    picks: readonly { slotIndex: number; playerId: number }[],
    player: Pick<DataPlayer, 'playerId' | 'positions'>,
    slotIndex: number,
  ): boolean;
}

/**
 * Answers "can this XI still be finished from this pool?".
 *
 * It is a bipartite matching of open slots to unpicked players, with one
 * shortcut that makes it cheap enough to ask for every row of every spin: with
 * k slots open, a slot that has at least k candidates can always be filled
 * last, because the other k - 1 slots use at most k - 1 players. Only slots
 * with fewer candidates than that need matching, and their candidate lists are
 * short by definition. In an unfiltered pool every slot has hundreds, so the
 * check does no matching at all.
 *
 * A player counts as a candidate for a slot if any version of them in the pool
 * can play it, since whichever squad they turn up in next is the one offered.
 */
export function feasibility(pool: SpunSquad[], formation: Formation): Feasibility {
  const positionsById = new Map<number, Set<Position>>();
  for (const squad of pool) {
    for (const p of squad.players) {
      const set = positionsById.get(p.playerId) ?? new Set<Position>();
      for (const pos of p.positions) set.add(pos);
      positionsById.set(p.playerId, set);
    }
  }
  const candidatesByPosition = new Map<Position, number[]>();
  for (const slot of formation.slots) {
    if (candidatesByPosition.has(slot.position)) continue;
    const ids: number[] = [];
    for (const [id, positions] of positionsById) {
      if (canFillSlot([...positions], slot.position)) ids.push(id);
    }
    candidatesByPosition.set(slot.position, ids);
  }

  function completable(openSlots: number[], taken: ReadonlySet<number>): boolean {
    const k = openSlots.length;
    const scarce: number[][] = [];
    for (const i of openSlots) {
      const free: number[] = [];
      for (const id of candidatesByPosition.get(formation.slots[i].position) ?? []) {
        if (taken.has(id)) continue;
        free.push(id);
        if (free.length >= k) break;
      }
      if (free.length === 0) return false;
      if (free.length < k) scarce.push(free);
    }
    // Kuhn's augmenting paths over the scarce slots only.
    const slotOfPlayer = new Map<number, number>();
    function assign(s: number, seen: Set<number>): boolean {
      for (const id of scarce[s]) {
        if (seen.has(id)) continue;
        seen.add(id);
        const holder = slotOfPlayer.get(id);
        if (holder === undefined || assign(holder, seen)) {
          slotOfPlayer.set(id, s);
          return true;
        }
      }
      return false;
    }
    return scarce.every((_, s) => assign(s, new Set()));
  }

  function openAfter(picks: readonly { slotIndex: number }[], extra?: number): number[] {
    const filled = new Set(picks.map(p => p.slotIndex));
    if (extra !== undefined) filled.add(extra);
    return formation.slots.map((_, i) => i).filter(i => !filled.has(i));
  }

  return {
    canComplete(picks) {
      return completable(openAfter(picks), new Set(picks.map(p => p.playerId)));
    },
    canPlace(picks, player, slotIndex) {
      if (picks.some(p => p.slotIndex === slotIndex || p.playerId === player.playerId)) return false;
      if (!canFillSlot(player.positions, formation.slots[slotIndex].position)) return false;
      const taken = new Set(picks.map(p => p.playerId));
      taken.add(player.playerId);
      return completable(openAfter(picks, slotIndex), taken);
    },
  };
}

// ── Choices for the setup page ────────────────────────

export interface ChallengeChoice<T> {
  value: T;
  label: string;
  /** Club-seasons in the pool for this choice, within the era. */
  seasons: number;
}

/** Clubs that can field this formation within the era, alphabetically. */
export function clubChoices(rules: Omit<PoolRules, 'filter'>, formation: Formation): ChallengeChoice<number>[] {
  const byClub = new Map<number, SpunSquad[]>();
  for (const squad of draftPool({ ...rules, filter: null })) {
    byClub.set(squad.clubId, [...(byClub.get(squad.clubId) ?? []), squad]);
  }
  return [...byClub.entries()]
    .filter(([, squads]) => feasibility(squads, formation).canComplete([]))
    .map(([clubId, squads]) => ({ value: clubId, label: squads[0].clubName, seasons: squads.length }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Nationalities that can field this formation within the era, alphabetically. */
export function nationChoices(rules: Omit<PoolRules, 'filter'>, formation: Formation): ChallengeChoice<string>[] {
  const base = draftPool({ ...rules, filter: null });
  const nations = new Set<string>();
  for (const squad of base) for (const p of squad.players) if (p.nationality) nations.add(p.nationality);
  const choices: ChallengeChoice<string>[] = [];
  for (const nation of nations) {
    const pool = base
      .map(squad => ({ ...squad, players: squad.players.filter(p => p.nationality === nation) }))
      .filter(squad => squad.players.length > 0);
    if (feasibility(pool, formation).canComplete([])) {
      choices.push({ value: nation, label: nation, seasons: pool.length });
    }
  }
  return choices.sort((a, b) => a.label.localeCompare(b.label));
}

/** Whether a whole pool can field this formation at all. */
export function poolCanFieldXI(rules: PoolRules, formation: Formation): boolean {
  return feasibility(draftPool(rules), formation).canComplete([]);
}

// ── The order a spun squad is listed in ──────────────

/** Where a player's first position sits on a team sheet: keeper first, forwards last. */
function lineOrder(positions: readonly Position[]): number {
  const first = positions[0];
  if (first === 'GK') return 0;
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(first)) return 1;
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(first)) return 2;
  return 3;
}

/**
 * A spun squad's players in the order the draft lists them: a team sheet's
 * (keepers, defenders, midfielders, forwards, alphabetical within each), and,
 * when spinning for a position, those who can fill it first. Never best
 * first: squads are stored that way, and listing them as stored told a blind
 * draft who the best player was.
 */
export function draftListOrder<T extends { name: string; positions: Position[] }>(
  players: readonly T[], position?: Position,
): T[] {
  const fits = (p: T) => (position && canFillSlot(p.positions, position) ? 0 : position ? 1 : 0);
  return [...players].sort((a, b) =>
    fits(a) - fits(b) || lineOrder(a.positions) - lineOrder(b.positions) || a.name.localeCompare(b.name));
}
