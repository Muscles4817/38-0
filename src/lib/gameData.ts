// Read-only access to the bundled game data.
//
// The game runs entirely on the client: this module is the only source of
// clubs, squads, lineups and role tuning, and it replaces what used to be the
// /api/spin, /api/simulate, /api/strengths and /api/classic-teams routes.
//
// The snapshot is generated from the local SQLite database by
// `npm run export:data`. SQLite and the editor UI are authoring tools that
// never run in a deployed build.

import rawData from '@/data/game-data.json';
import { Position } from './formations';
import { bestFormation } from './lineupFit';
import {
  simulateSeason,
  type PlayerRole,
  type SquadPick,
  type OpponentPlayer,
  type OpponentSquad,
  type RoleConfig,
  type SimulationResult,
} from './simulation';

// ── Snapshot types ───────────────────────────────────────────────────────────

export interface DataClub {
  id: number;
  name: string;
  shortName: string;
  color: string;
  league: string;
}

export interface DataSeason {
  id: number;
  label: string;
  yearStart: number;
}

export interface DataPlayer {
  playerId: number;
  name: string;
  nationality: string | null;
  rating: number;
  positions: Position[];
  roles: PlayerRole[];
}

/** One club's squad for one season. Players are sorted best first. */
export interface DataSquad {
  clubId: number;
  seasonId: number;
  players: DataPlayer[];
}

/**
 * How a club-season plays: how well drilled it is, and its shape of attack.
 *
 * Absent means nothing has been recorded, not that the side is average — the
 * default lives in matchEngine.ts so there is one place it is decided.
 */
export interface DataTraits {
  clubId: number;
  seasonId: number;
  cohesion: number;
  playstyle: string;
  focus: { L: number; C: number; R: number };
  note?: string;
}

export interface DataLineup {
  clubId: number;
  seasonId: number;
  formation: string;
  slots: { slotIndex: number; playerId: number }[];
}

export interface DataRole {
  name: string;
  label: string;
  goalMult: number;
  assistMult: number;
  validPositions: Position[];
  description: string;
  attContrib: number;
  midContrib: number;
  defContrib: number;
}

export interface GameData {
  clubs: DataClub[];
  seasons: DataSeason[];
  squads: DataSquad[];
  lineups: DataLineup[];
  roles: DataRole[];
  /** Optional: older snapshots predate it. */
  traits?: DataTraits[];
}

export const gameData = rawData as GameData;


// ── Indexes ──────────────────────────────────────────────────────────────────

const key = (clubId: number, seasonId: number) => `${clubId}-${seasonId}`;

const clubById   = new Map(gameData.clubs.map(c => [c.id, c]));
const seasonById = new Map(gameData.seasons.map(s => [s.id, s]));
const squadByKey = new Map(gameData.squads.map(s => [key(s.clubId, s.seasonId), s]));
const lineupByKey = new Map(gameData.lineups.map(l => [key(l.clubId, l.seasonId), l]));

const traitsByKey = new Map<string, DataTraits>(
  (gameData.traits ?? []).map(t => [key(t.clubId, t.seasonId), t]),
);

/** The season the user's XI is dropped into and plays against. */
export const SIMULATED_SEASON_START = 2025;
export const SIMULATED_LEAGUE = 'PL';

const simulatedSeason = gameData.seasons.find(s => s.yearStart === SIMULATED_SEASON_START) ?? null;

export function getClub(clubId: number): DataClub | null {
  return clubById.get(clubId) ?? null;
}

export function getSeason(seasonId: number): DataSeason | null {
  return seasonById.get(seasonId) ?? null;
}

export function getSquad(clubId: number, seasonId: number): DataSquad | null {
  return squadByKey.get(key(clubId, seasonId)) ?? null;
}

export function getLineup(clubId: number, seasonId: number): DataLineup | null {
  return lineupByKey.get(key(clubId, seasonId)) ?? null;
}

/**
 * Recorded tactics for a club-season, or null when nobody has set any.
 *
 * Null means unrecorded, not average: the default lives in matchEngine.ts so
 * there is one place that decision is made.
 */
export function getTraits(clubId: number, seasonId: number): DataTraits | null {
  return traitsByKey.get(key(clubId, seasonId)) ?? null;
}

// ── Best XI ──────────────────────────────────────────────────────────────────

/**
 * Highest-rated goalkeeper plus the ten highest-rated outfielders.
 *
 * This ignores shape, so it can return a back four of centre-backs. Clubs with
 * a stored lineup use that instead; see getOpponentSquads.
 */
export function bestXI(players: DataPlayer[]): DataPlayer[] {
  // Sorting by rating and taking ten does not field a football team. For
  // 1992/93, where no club has a stored lineup, it put Manchester United out
  // with five forwards and one central midfielder, which flattered them in
  // every simulated match. Fit the best shape the squad can actually fill.
  const fit = bestFormation(players.map(p => ({
    name: p.name,
    positions: p.positions as Position[],
    // No minutes here, so rating stands in: it is what a picker would choose on.
    minutes: p.rating,
  })));

  const byName = new Map(players.map(p => [p.name, p]));
  const eleven = fit.slots
    .map(slot => byName.get(slot.player.name))
    .filter((p): p is DataPlayer => p != null);
  if (eleven.length === 11) return eleven;

  // A squad too lopsided to fill any shape still has to field someone.
  const isGk = (p: DataPlayer) => p.positions[0] === 'GK';
  const keepers = players.filter(isGk).sort((a, b) => b.rating - a.rating);
  const outfield = players.filter(p => !isGk(p)).sort((a, b) => b.rating - a.rating);
  return [...keepers.slice(0, 1), ...outfield.slice(0, 10)];
}

function averageRating(players: DataPlayer[]): number {
  if (players.length === 0) return 0;
  return Math.round(players.reduce((sum, p) => sum + p.rating, 0) / players.length);
}

// ── Draft pool ───────────────────────────────────────────────────────────────

export interface SpunSquad {
  clubId: number;
  clubName: string;
  color: string;
  seasonId: number;
  seasonLabel: string;
  players: DataPlayer[];
}

function toSpunSquad(squad: DataSquad): SpunSquad | null {
  const club = clubById.get(squad.clubId);
  const season = seasonById.get(squad.seasonId);
  if (!club || !season) return null;
  return {
    clubId: club.id,
    clubName: club.name,
    color: club.color,
    seasonId: season.id,
    seasonLabel: season.label,
    players: squad.players,
  };
}

/** Club-seasons that can be spun for, within the era chosen on the setup page. */
export function listDraftableSquads(yearStart: number, yearEnd: number): SpunSquad[] {
  const result: SpunSquad[] = [];
  for (const squad of gameData.squads) {
    const season = seasonById.get(squad.seasonId);
    if (!season || season.yearStart < yearStart || season.yearStart >= yearEnd) continue;
    if (squad.players.length === 0) continue;
    const spun = toSpunSquad(squad);
    if (spun) result.push(spun);
  }
  return result;
}

/**
 * Picks a random club-season from the era, skipping any in `excludeKeys`
 * (each `"<clubId>-<seasonId>"`). Returns null when the era has nothing left.
 */
export function pickRandomSquad(
  yearStart: number,
  yearEnd: number,
  excludeKeys: readonly string[] = [],
  random: () => number = Math.random,
): SpunSquad | null {
  const excluded = new Set(excludeKeys);
  const available = listDraftableSquads(yearStart, yearEnd)
    .filter(s => !excluded.has(key(s.clubId, s.seasonId)));
  if (available.length === 0) return null;
  return available[Math.floor(random() * available.length)];
}

// ── Classic mode ─────────────────────────────────────────────────────────────

export interface ClassicTeam {
  clubId: number;
  clubName: string;
  shortName: string;
  color: string;
  league: string;
  seasonId: number;
  seasonLabel: string;
  yearStart: number;
  playerCount: number;
  overallRating: number;
}

/**
 * Every club-season with a full XI available, newest first. The season being
 * simulated against is excluded — you cannot pick this year's Arsenal and then
 * also play against them.
 */
export function getClassicTeams(): ClassicTeam[] {
  const teams: ClassicTeam[] = [];
  for (const squad of gameData.squads) {
    const club = clubById.get(squad.clubId);
    const season = seasonById.get(squad.seasonId);
    if (!club || !season) continue;
    if (club.league === SIMULATED_LEAGUE && season.yearStart === SIMULATED_SEASON_START) continue;

    const rated = squad.players.filter(p => p.rating > 0);
    if (rated.length < 11) continue;

    teams.push({
      clubId: club.id,
      clubName: club.name,
      shortName: club.shortName,
      color: club.color,
      league: club.league,
      seasonId: season.id,
      seasonLabel: season.label,
      yearStart: season.yearStart,
      playerCount: rated.length,
      overallRating: averageRating(bestXI(rated)),
    });
  }
  return teams.sort((a, b) => b.yearStart - a.yearStart || a.clubName.localeCompare(b.clubName));
}

// ── Opponents ────────────────────────────────────────────────────────────────

function positionGroup(positions: Position[]): OpponentPlayer['role'] {
  const p = positions[0] ?? 'CM';
  if (p === 'GK') return 'gk';
  if (['LB', 'RB', 'CB', 'LWB', 'RWB'].includes(p)) return 'def';
  if (['CM', 'CDM', 'CAM', 'LM', 'RM'].includes(p)) return 'mid';
  return 'att';
}

function toOpponentPlayer(player: DataPlayer, index: number): OpponentPlayer {
  return {
    id: String(index),
    name: player.name,
    role: positionGroup(player.positions),
    position: player.positions[0] ?? 'CM',
    rating: player.rating,
    roles: player.roles,
  };
}

/** The 19 clubs the user's XI plays against, using stored lineups where set. */
export function getOpponentSquads(): OpponentSquad[] {
  if (!simulatedSeason) return [];
  const result: OpponentSquad[] = [];

  for (const squad of gameData.squads) {
    if (squad.seasonId !== simulatedSeason.id) continue;
    const club = clubById.get(squad.clubId);
    if (!club || club.league !== SIMULATED_LEAGUE) continue;

    const lineup = lineupByKey.get(key(squad.clubId, squad.seasonId));
    const byId = new Map(squad.players.map(p => [p.playerId, p]));

    let eleven: DataPlayer[];
    if (lineup && lineup.slots.length === 11) {
      const fromSlots = lineup.slots
        .map(slot => byId.get(slot.playerId))
        .filter((p): p is DataPlayer => p != null);
      eleven = fromSlots.length === 11 ? fromSlots : bestXI(squad.players);
    } else {
      eleven = bestXI(squad.players);
    }

    result.push({
      clubName: club.name,
      players: eleven.map(toOpponentPlayer),
      strength: averageRating(eleven),
    });
  }
  return result;
}

/** Best-XI overall for each opponent, used for the pre-season projection. */
export function getTeamStrengths(): { clubName: string; overall: number }[] {
  return getOpponentSquads()
    .map(s => ({ clubName: s.clubName, overall: s.strength }))
    .sort((a, b) => b.overall - a.overall);
}

// ── Role tuning ──────────────────────────────────────────────────────────────

/** Role multipliers as tuned in the editor, overriding the defaults in code. */
export function getRoleConfig(): RoleConfig {
  return {
    goalMult:   Object.fromEntries(gameData.roles.map(r => [r.name, r.goalMult])),
    assistMult: Object.fromEntries(gameData.roles.map(r => [r.name, r.assistMult])),
    validPositions: Object.fromEntries(
      gameData.roles
        .filter(r => r.validPositions.length > 0)
        .map(r => [r.name, r.validPositions]),
    ),
    teamContrib: Object.fromEntries(
      gameData.roles
        .filter(r => r.attContrib !== 0 || r.midContrib !== 0 || r.defContrib !== 0)
        .map(r => [r.name, { att: r.attContrib, mid: r.midContrib, def: r.defContrib }]),
    ),
  };
}

// ── Simulation ───────────────────────────────────────────────────────────────

/** The roles a player had in the specific club-season they were drafted from. */
function rolesForPick(pick: SquadPick): PlayerRole[] {
  if (pick.clubId == null || pick.seasonId == null) return pick.roles ?? [];
  const squad = squadByKey.get(key(pick.clubId, pick.seasonId));
  const player = squad?.players.find(p => p.playerId === pick.playerId);
  return player?.roles ?? pick.roles ?? [];
}

/** Runs a full 38-game season for the drafted XI against the stored opponents. */
export function runSeasonSimulation(picks: SquadPick[], seed?: number): SimulationResult {
  const enriched = picks.map(pick => ({ ...pick, roles: rolesForPick(pick) }));
  return simulateSeason(enriched, getOpponentSquads(), seed, getRoleConfig());
}
