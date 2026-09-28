import { type Position, effectiveRating } from './formations';
import {
  DEFAULT_COHESION, PLAYSTYLES, fitForStyle, inferStyle, simulateMatch,
  type MatchPlayer, type PlaystyleName, type RoleMultipliers, type TeamSetup, type Zone,
} from './matchEngine';

// ── Player roles (weight modifiers) ──────────────────────────────────────────
// Roles tweak per-player goal/assist probability during attribution.
// Traits (match-level strength modifiers, e.g. Hardman) are a separate future system.

export const PLAYER_ROLES = [
  'InsideForward', 'Winger',
  'Poacher', 'TargetMan', 'CompleteForward', 'Trequartista', 'FalseNine', 'DeepLyingForward',
  'ChanceCreator', 'DeepLyingPlaymaker', 'Regista', 'Mezzala', 'LateRunner', 'BoxToBox', 'Anchor', 'Enforcer',
  'AttackingFullback', 'CrossingSpecialist', 'InvertedWingback',
  'BallPlayingDefender',
  'SetPieceDeliverer', 'AerialThreat',
] as const;
// String alias so DB-created roles work without a code change.
export type PlayerRole = string;

// Goal/assist multipliers per role.
// Stacking rule: suppressors (<1) multiply together; boosters (>1) compete — highest wins.
// This prevents two scoring roles from compounding absurdly while preserving
// valid combos (Anchor×DLP = genuinely low scorer who occasionally creates).
const ROLE_GOAL_MULT: Record<PlayerRole, number> = {
  InsideForward:       1.4,  // cuts inside to score
  Winger:              0.5,  // stays wide, crosses instead
  Poacher:             1.6,  // pure box finisher — boosted by ST base already
  TargetMan:           1.2,  // physical ST, wins headers
  CompleteForward:     1.2,  // all-round striker
  Trequartista:        1.3,  // floats between lines
  FalseNine:           1.1,  // still scores (Messi) but primarily a creator
  DeepLyingForward:    1.0,  // drops deep to link; finishes when presented
  ChanceCreator:       0.5,  // gives, doesn't take
  DeepLyingPlaymaker:  0.4,  // rarely gets in the box
  Regista:             0.2,  // open-play goals almost nil; free kicks handled separately
  Mezzala:             1.3,  // breaks into the box from half-space
  LateRunner:          1.4,  // times runs (Lampard, Gerrard)
  BoxToBox:            1.2,  // balanced
  Anchor:              0.2,  // pure shield, almost never scores
  Enforcer:            0.15, // win the ball, give it simple
  AttackingFullback:   1.0,  // overlaps but still a FB
  CrossingSpecialist:  0.1,  // never shoots, only delivers
  InvertedWingback:    1.1,  // cuts inside into dangerous areas
  BallPlayingDefender: 0.5,  // occasional header from set piece
  SetPieceDeliverer:   0.3,  // corner/FK taker, rarely scores
  AerialThreat:        1.5,  // heads in crosses and set pieces — not a goal machine
};
const ROLE_ASSIST_MULT: Record<PlayerRole, number> = {
  InsideForward:       0.6,
  Winger:              1.8,
  Poacher:             0.4,
  TargetMan:           0.9,
  CompleteForward:     1.5,
  Trequartista:        1.3,
  FalseNine:           1.8,
  DeepLyingForward:    1.8,
  ChanceCreator:       2.0,
  DeepLyingPlaymaker:  1.8,
  Regista:             2.2,
  Mezzala:             1.3,
  LateRunner:          0.7,
  BoxToBox:            1.2,
  Anchor:              0.4,
  Enforcer:            0.5,
  AttackingFullback:   1.8,
  CrossingSpecialist:  2.8,
  InvertedWingback:    1.3,
  BallPlayingDefender: 1.5,
  SetPieceDeliverer:   2.5,
  AerialThreat:        0.3,
};

// Roles are silently inactive if the player's slot position isn't in this list.
// Roles with no entry here are valid at any position (e.g. AerialThreat).
export const ROLE_VALID_POSITIONS: Partial<Record<PlayerRole, Position[]>> = {
  InsideForward:       ['LW', 'RW', 'LM', 'RM'],
  Winger:              ['LW', 'RW', 'LM', 'RM'],
  Poacher:             ['ST', 'CF'],
  TargetMan:           ['ST', 'CF'],
  CompleteForward:     ['ST', 'CF'],
  Trequartista:        ['CAM', 'CF'],
  FalseNine:           ['ST', 'CF'],
  DeepLyingForward:    ['ST', 'CF'],
  ChanceCreator:       ['CAM', 'CM', 'LM', 'RM'],
  DeepLyingPlaymaker:  ['CDM', 'CM'],
  Regista:             ['CDM', 'CM'],
  Mezzala:             ['CM', 'LM', 'RM', 'CAM'],
  LateRunner:          ['CM', 'CDM', 'CAM'],
  BoxToBox:            ['CM'],
  Anchor:              ['CDM'],
  Enforcer:            ['CM', 'CDM'],
  AttackingFullback:   ['LB', 'RB', 'LWB', 'RWB'],
  CrossingSpecialist:  ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW'],
  InvertedWingback:    ['LB', 'RB', 'LWB', 'RWB'],
  BallPlayingDefender: ['CB'],
  SetPieceDeliverer:   ['LM', 'RM', 'LW', 'RW', 'LB', 'RB', 'LWB', 'RWB', 'CM', 'CAM'],
  // AerialThreat: unrestricted — heading ability spans all outfield positions
};

// Caller (e.g. /api/simulate) may pass DB-stored overrides to replace any defaults above.
export interface RoleConfig {
  goalMult?:       Partial<Record<string, number>>;
  assistMult?:     Partial<Record<string, number>>;
  validPositions?: Partial<Record<string, Position[]>>;
  teamContrib?:    Partial<Record<string, { att: number; mid: number; def: number }>>;
  /**
   * What each role says a player is GOOD AT, as opposed to what he produces.
   * Only the tactics below read it: a style's demands are expressed in these
   * names, so without them every style fits every side equally.
   */
  qualities?:      Partial<Record<string, Partial<Record<string, number>>>>;
}

// ── Public Types ──────────────────────────────────────────────────────────────

export interface SquadPick {
  slotIndex: number;
  position: Position;
  playerId: number;
  playerName: string;
  nationality?: string | null;
  rating: number;
  clubName: string;
  seasonLabel: string;
  positions: Position[];
  clubId?: number;
  seasonId?: number;
  roles?: PlayerRole[];
}

export interface PlayerStats {
  playerId: number;
  playerName: string;
  position: Position;
  rating: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  shots: number;
  shotsOnTarget: number;
  chancesCreated: number;
  saves: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  blocks: number;
  aerialsWon: number;
  /** Goals conceded where he was the defender beaten. */
  beaten: number;
  yellowCards: number;
  redCards: number;
  /** One per match, from the match engine. */
  matchRatings: number[];
  avgMatchRating: number;
}

export interface FixtureResult {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  userInvolved: boolean;
  scorers: { name: string; minute: number }[]; // only populated for user fixtures
}

export interface Gameweek {
  week: number;
  fixtures: FixtureResult[];
  tableSnapshot: TeamStanding[];
}

export interface TeamStanding {
  name: string;
  isUser: boolean;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  gd: number;
  points: number;
  ovr: number;
  att: number;
  mid: number;
  def: number;
}

export interface LeagueEntry {
  playerName: string;
  clubName: string;
  value: number;
  isUser: boolean;
}

export interface SimulationResult {
  gameweeks: Gameweek[];
  finalTable: TeamStanding[];
  finalPosition: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  wins: number;
  draws: number;
  losses: number;
  playerStats: PlayerStats[];
  awards: {
    goldenBoot: { name: string; goals: number };
    playmaker: { name: string; assists: number };
    goldenGlove: { name: string; cleanSheets: number };
    /** Best average match rating in the XI. */
    playerOfSeason: { name: string; goals: number; assists: number; rating: number };
    /** Best average match rating in the league. */
    leaguePlayerOfSeason: { name: string; club: string; goals: number; assists: number; isUser: boolean; rating: number };
  };
  longestWinStreak: number;
  biggestWin: string;
  highestScoring: string;
  narrative: string;
  topScorers: LeagueEntry[];
  topAssisters: LeagueEntry[];
  topKeepers: LeagueEntry[];
}

// ── Opponent squad types (real DB players) ───────────────────────────────────

export interface OpponentPlayer {
  id: string;
  name: string;
  role: 'gk' | 'def' | 'mid' | 'att';
  /** The slot he fills in this eleven. */
  position: Position;
  rating: number;
  roles?: PlayerRole[];
}

export interface OpponentSquad {
  clubName: string;
  players: OpponentPlayer[];
  strength: number;
  /** How the club-season set up, where the data records it. Otherwise inferred from the eleven. */
  formation?: string;
  style?: PlaystyleName;
  focus?: Record<Zone, number>;
  /** How well drilled the side was, 0-100. Defaults to the engine's ordinary side. */
  cohesion?: number;
}

// ── Constants (fallback when DB squads are unavailable) ───────────────────────

const PL_OPPONENTS = [
  'Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton',
  'Chelsea', 'Crystal Palace', 'Everton', 'Fulham', 'Ipswich Town',
  'Liverpool', 'Manchester City', 'Manchester United', 'Newcastle United', 'Nottingham Forest',
  'Southampton', 'Tottenham Hotspur', 'West Ham United', 'Wolverhampton Wanderers',
];

const SURNAMES = [
  'Silva', 'García', 'Müller', 'Santos', 'Rossi', 'Martin', 'Williams', 'Taylor', 'Brown',
  'Davis', 'Wilson', 'Moore', 'Thomas', 'Jackson', 'Harris', 'Diallo', 'Ferreira', 'Okonkwo',
  'Kowalski', 'Andersen', 'Pedersen', 'Tremblay', 'Volkov', 'Mbeki', 'Nkosi', 'Vieira',
  'Torres', 'Drogba', 'Lampard', 'Scholes', 'Beckham', 'Cole', 'Ferdinand', 'Fowler',
  'Shearer', 'Keane', 'Cantona', 'Ginola', 'Yorke', 'Sheringham', 'Zola', 'Bergkamp',
];
const INITIALS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','R','S','T','W'];

// ── RNG helpers ───────────────────────────────────────────────────────────────

// mulberry32, the generator the engine's calibration tests already use. The
// linear congruential generator it replaces had a period of 233,280, and a
// season played through the match engine draws a few hundred numbers per match
// across 380 matches — about one full period. The season would have started
// repeating itself.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genName(rand: () => number): string {
  return `${INITIALS[Math.floor(rand() * INITIALS.length)]}. ${SURNAMES[Math.floor(rand() * SURNAMES.length)]}`;
}

// ── Scheduling ────────────────────────────────────────────────────────────────

/**
 * Standard circle/Berger double round robin: `n - 1` rounds, then the same
 * rounds with home and away swapped, each of n/2 `[homeIdx, awayIdx]` pairs.
 * The team at index 0 is fixed and the others rotate.
 *
 * `n` must be even — with an odd field one team would have to sit out each
 * round, and the rotation has nowhere to put it. A caller assembling an
 * opponent list is responsible for handing over an odd number of opponents.
 */
function buildSchedule(n: number): [number, number][][] {
  const schedule: [number, number][][] = [];
  const order = Array.from({ length: n }, (_, i) => i);

  for (let r = 0; r < n - 1; r++) {
    const round: [number, number][] = [];
    round.push([order[0], order[n - 1]]);
    for (let i = 1; i < n / 2; i++) round.push([order[i], order[n - 1 - i]]);
    schedule.push(round);
    // Rotate indices 1..n-1
    const last = order[n - 1];
    for (let i = n - 1; i > 1; i--) order[i] = order[i - 1];
    order[1] = last;
  }

  // Second half: swap home/away
  const firstHalf = schedule.slice();
  schedule.push(...firstHalf.map(r => r.map(([h, a]): [number, number] => [a, h])));
  return schedule;
}

// ── Standings helpers ─────────────────────────────────────────────────────────

type MutableStanding = Omit<TeamStanding, 'position'>;

function initStanding(name: string, isUser: boolean, ovr = 0, att = 0, def = 0, mid = 0): MutableStanding {
  return { name, isUser, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, gd: 0, points: 0, ovr, att, mid, def };
}

function applyResult(s: MutableStanding, gf: number, ga: number) {
  s.played++;
  s.goalsFor += gf;
  s.goalsAgainst += ga;
  s.gd = s.goalsFor - s.goalsAgainst;
  if (gf > ga) { s.won++; s.points += 3; }
  else if (gf === ga) { s.drawn++; s.points++; }
  else s.lost++;
}

function sortedTable(standings: Map<string, MutableStanding>): TeamStanding[] {
  return [...standings.values()]
    .sort((a, b) =>
      b.points !== a.points ? b.points - a.points :
      b.gd     !== a.gd     ? b.gd     - a.gd     :
      b.goalsFor - a.goalsFor)
    .map((s, i) => ({ ...s, position: i + 1 }));
}

// ── Line strengths ────────────────────────────────────────────────────────────
//
// Attack, midfield and defence as the league table and the pre-season screen
// show them. They are a summary for the player to read, not an input: the match
// engine reads the eleven itself, zone by zone.

// CM sits in both attack and defence — it's a genuinely balanced role.
function isAttPosition(pos: Position): boolean {
  return ['ST','CF','LW','RW','LM','RM','CAM','CM'].includes(pos);
}
function isDefPosition(pos: Position): boolean {
  return ['GK','CB','LB','RB','LWB','RWB','CDM','CM'].includes(pos);
}
function isMidPosition(pos: Position): boolean {
  return ['CM','CDM','CAM','LM','RM'].includes(pos);
}

// How sharply a rating compounds into effectiveness. Each 5-point band is worth
// about 17% more than the one below, so 85→90 matters more than 75→80. The
// match engine uses the same constant for the same reason.
//
// ratingScale and scaledAvgRating are inverses and MUST share this constant.
// They previously did not — 0.032 out, 0.055 back — which silently dragged
// every squad 58% of the way toward 80. See simulation.test.ts for the round
// trip that now guards it.
const RATING_CURVE = 0.032;

// Maps a rating onto the curve.
function ratingScale(rating: number): number {
  return Math.exp(RATING_CURVE * (rating - 80));
}

// Averages ratings in curve space, then maps back to rating units.
//
// Not a plain mean: a 90-rated player raises the effective average more than a
// 70-rated one lowers it, so a side is carried by its best players rather than
// dragged to the middle by its worst.
function scaledAvgRating(players: { rating: number }[]): number {
  if (players.length === 0) return 70;
  const avgScale = players.reduce((s, p) => s + ratingScale(p.rating), 0) / players.length;
  return Math.log(avgScale) / RATING_CURVE + 80;
}

// Exported for the round-trip test; not part of the simulation's public API.
export const __ratingCurve = { RATING_CURVE, ratingScale, scaledAvgRating };

function lineStrengths(players: { position: Position; rating: number }[]): { att: number; mid: number; def: number } {
  return {
    att: Math.round(scaledAvgRating(players.filter(p => isAttPosition(p.position)))),
    mid: Math.round(scaledAvgRating(players.filter(p => isMidPosition(p.position)))),
    def: Math.round(scaledAvgRating(players.filter(p => isDefPosition(p.position)))),
  };
}

// ── Roles, as the match engine reads them ─────────────────────────────────────

/**
 * The goal, assist and quality tables for the engine: the tuned values from the
 * database where given, the defaults in this file otherwise.
 */
function toRoleMultipliers(roleConfig?: RoleConfig): RoleMultipliers {
  return {
    goalMult:   { ...ROLE_GOAL_MULT,   ...(roleConfig?.goalMult   ?? {}) },
    assistMult: { ...ROLE_ASSIST_MULT, ...(roleConfig?.assistMult ?? {}) },
    qualities:  roleConfig?.qualities,
  };
}

/**
 * A player's roles that apply in the slot he is filling. An inside forward
 * played at left-back is not an inside forward there; roles with no entry in
 * the table apply anywhere.
 */
function activeRoles(
  roles: PlayerRole[] | undefined,
  position: Position,
  validPos: Partial<Record<PlayerRole, Position[]>>,
): PlayerRole[] {
  return (roles ?? []).filter(r => {
    const valid = validPos[r];
    return !valid || valid.includes(position);
  });
}

function validPositionsFor(roleConfig?: RoleConfig): Partial<Record<PlayerRole, Position[]>> {
  return { ...ROLE_VALID_POSITIONS, ...(roleConfig?.validPositions ?? {}) };
}

function toMatchPlayer(pick: SquadPick, validPos: Partial<Record<PlayerRole, Position[]>>): MatchPlayer {
  return {
    playerId:  pick.playerId,
    name:      pick.playerName,
    position:  pick.position,
    rating:    ratingInSlot(pick),
    roles:     activeRoles(pick.roles, pick.position, validPos),
    positions: pick.positions,
  };
}

// ── Tactics ───────────────────────────────────────────────────────────────────
//
// A style is played by the match engine, not converted into a bonus. Its line,
// build-up and tempo decide who has the ball, how chances arise and how many a
// match produces, and four interaction rules decide how it meets the
// opponent's style: a press against a side playing out, a deep block against a
// patient one, runners against a high line, recovery pace covering the space.
// See docs/playstyles.md. Nobody writes down that a counter-attacking side
// punishes a possession side; it falls out of those rules.
//
// What the pre-season screen needs is therefore a description of the style and
// how well this eleven can play it, which is what this returns.

/** A style, described for the eleven that would play it. */
export interface TacticEffect {
  style: PlaystyleName;
  label: string;
  /**
   * 0-1: how well this eleven can execute the style. The engine scales what a
   * style's demands buy — its press, its runners in behind — by this.
   */
  fit: number;
  /** Deep at 0, high at 1. */
  line: number;
  /** Long ball at 0, short and patient at 1. */
  buildUp: number;
  /** Chances a match produces, relative to an ordinary game. Shared by both sides. */
  tempo: number;
  /** How strongly the side pulls possession its way. 1 is neutral. */
  possessionBias: number;
}

/**
 * The chosen style, and this eleven's fit for it.
 *
 * Exported because the pre-season screen shows it: a player choosing a tactic
 * is shown the same fit the season will play.
 */
export function tacticEffect(
  picks: SquadPick[],
  style: PlaystyleName = 'balanced',
  roleConfig?: RoleConfig,
): TacticEffect {
  const chosen = PLAYSTYLES[style] ?? PLAYSTYLES.balanced;
  const validPos = validPositionsFor(roleConfig);
  const fit = fitForStyle(picks.map(p => toMatchPlayer(p, validPos)), chosen.name, toRoleMultipliers(roleConfig));
  return {
    style:          chosen.name,
    label:          chosen.label,
    fit,
    line:           chosen.line,
    buildUp:        chosen.buildUp,
    tempo:          chosen.tempo,
    possessionBias: chosen.possessionBias,
  };
}


// ── Main export ───────────────────────────────────────────────────────────────

/**
 * A pick's rating in the slot it is actually filling.
 *
 * Players may cover an adjacent position, but not for free: a left-back at
 * left wing-back is worse than a left wing-back. Without this, drafting would
 * be a game of finding the most flexible players rather than the best ones.
 */
export function ratingInSlot(pick: SquadPick): number {
  return effectiveRating(pick.rating, pick.positions ?? [pick.position], pick.position);
}

export function computeOverall(picks: SquadPick[]): number {
  if (picks.length === 0) return 0;
  return Math.round(picks.reduce((s, p) => s + ratingInSlot(p), 0) / picks.length);
}

// ── Pre-season odds ───────────────────────────────────────────────────────────
//
// What the projection is, and why it is not a formula in `overall`.
//
// The old version was five straight lines in the squad's overall rating, fitted
// to nothing: it told an 88-rated XI it would finish 1st on 83 points with a 60%
// title chance, when the same XI actually averaged 4.9th and 63 points and won
// 23% of the time. It also could not have been right, because it never looked
// at who the XI was playing — and now that the player picks the season, an 86
// against the 2025/26 field (20% title) and an 86 against 1992/93 (67%) are not
// the same bet.
//
// So the projection reads the field. Three measured facts do all the work:
//
//   1. A team's points depend on how far it is above the *average of its own
//      league*, on a curve that saturates at both ends because a season cannot
//      produce fewer than 0 or more than 114 points.
//   2. A season lands about 8 points either side of that expectation.
//   3. Everyone in the league is measured on the same scale, so the same curve
//      gives every opponent an expectation too.
//
// From those, the chance of finishing above any one opponent is a normal
// comparison, and the chance of finishing in the top `n` is the chance that at
// most `n - 1` opponents finish above you — a Poisson binomial over the whole
// field, which is exact and cheap for nineteen opponents.
//
// The one thing that cannot be treated as independent is the player's own
// season: when it goes badly, *every* opponent passes them at once. Ignoring
// that made the odds far too confident — a squad measured to go down 41% of the
// time was told 7%. Conditioning on the player's own points and integrating
// over them fixes it, and is why this is a weighted sum over `SEASON_NODES`
// rather than one comparison.
//
// Re-fitted when on-ball ability became a contest between the players in each
// phase, on 900 seasons (18,000 team-seasons) across the 2025/26, 2003/04 and
// 1992/93 fields at squad ratings from 62 to 98: the curve is within 1.6
// points of the XI's measured mean and 2.8 of an opponent's. See
// docs/simulation.md for this and the two fits before it.

/** 38 wins. The ceiling the points curve saturates against. */
const MAX_POINTS = 114;
/** How sharply points rise with a rating edge over the field. */
const POINTS_STEEPNESS = 0.086;
/** The rating edge at which a side is worth half the maximum points. */
const POINTS_MIDPOINT = 2.04;
/** How far the player's own season lands either side of its expectation. */
const SEASON_SD = 6.7;
/** The same for an opponent's season, which is not shared across comparisons. */
const OPPONENT_SD = 8.1;
/** Quadrature nodes for integrating over the player's own season. */
const SEASON_NODES = 41;

/** Expected points for a side this many rating points above its league. */
function expectedSeasonPoints(edge: number): number {
  return MAX_POINTS / (1 + Math.exp(-POINTS_STEEPNESS * (edge - POINTS_MIDPOINT)));
}

/** Standard normal CDF, Abramowitz & Stegun 26.2.17. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
          + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/**
 * The chance that exactly `n` of the given independent events happen, for every
 * `n`. Exact, and O(events²) — nothing here is big enough to want anything else.
 */
function poissonBinomial(probabilities: number[]): number[] {
  let distribution = [1];
  for (const p of probabilities) {
    const next = new Array(distribution.length + 1).fill(0);
    for (let i = 0; i < distribution.length; i++) {
      next[i]     += distribution[i] * (1 - p);
      next[i + 1] += distribution[i] * p;
    }
    distribution = next;
  }
  return distribution;
}

export interface SeasonOdds {
  /** Where the XI is expected to finish, on average. */
  projectedPosition: number;
  expectedPoints: number;
  /** Percentages, 0-100. */
  winLeague: number;
  top4: number;
  top6: number;
  top10: number;
  relegation: number;
}

/**
 * What a squad of this overall should expect against this particular field.
 *
 * `fieldOveralls` is every opponent's overall — `getTeamStrengths()` in
 * gameData.ts produces exactly it. Without a field there is nothing to be
 * better or worse than, so an empty one is treated as a league of the XI's own
 * equals, which lands it mid-table.
 */
export function preSeasonOdds(overall: number, fieldOveralls: readonly number[] = []): SeasonOdds {
  const field = fieldOveralls.length > 0 ? fieldOveralls : new Array(19).fill(overall);
  const fieldMean = field.reduce((sum, o) => sum + o, 0) / field.length;

  const mine   = expectedSeasonPoints(overall - fieldMean);
  const theirs = field.map(o => expectedSeasonPoints(o - fieldMean));

  // Integrate over the player's own season, which every comparison shares.
  const aboveMe = new Array(field.length + 1).fill(0);
  let expectedAbove = 0;
  let weightSum = 0;
  for (let i = 0; i < SEASON_NODES; i++) {
    const z = -4 + (8 * i) / (SEASON_NODES - 1);
    const weight = Math.exp(-z * z / 2);
    weightSum += weight;

    const mySeason = mine + z * SEASON_SD;
    const beatsMe = theirs.map(t => normalCdf((t - mySeason) / OPPONENT_SD));
    expectedAbove += weight * beatsMe.reduce((sum, p) => sum + p, 0);

    const distribution = poissonBinomial(beatsMe);
    for (let n = 0; n < distribution.length; n++) aboveMe[n] += weight * distribution[n];
  }

  const clamp = (p: number) => Math.max(0, Math.min(100, Math.round(p * 1000) / 10));
  /** The chance of finishing in the top `n` — at most `n - 1` sides above. */
  const topN = (n: number) => aboveMe.slice(0, n).reduce((sum, p) => sum + p, 0) / weightSum;
  const places = field.length + 1;

  return {
    projectedPosition: Math.max(1, Math.min(places, Math.round(1 + expectedAbove / weightSum))),
    expectedPoints:    Math.round(mine),
    winLeague:  clamp(topN(1)),
    top4:       clamp(topN(4)),
    top6:       clamp(topN(6)),
    top10:      clamp(topN(10)),
    // Bottom three of a twenty-team league, and of a shorter one too.
    relegation: clamp(1 - topN(places - 3)),
  };
}

/**
 * Plays a 38-game season: the XI and nineteen opponents, a double round robin,
 * every fixture played out by the match engine.
 *
 * Nothing here decides a score or a scorer. The engine plays each match as a
 * sequence of possessions and reports what happened in it — goals, assists,
 * shots, saves, cards and a rating for every player — and this adds those up.
 * If the goal charts or the awards come out wrong, the engine is what gets
 * fixed; see docs/simulation.md.
 */
export function simulateSeason(
  picks: SquadPick[],
  opponentSquads: OpponentSquad[] = [],
  seed?: number,
  roleConfig?: RoleConfig,
  /** The style the player chose before kick-off. */
  tactic: PlaystyleName = 'balanced',
): SimulationResult {
  const rand = rng(seed ?? Date.now() % 999983);
  const USER = 'Your XI';
  const roles = toRoleMultipliers(roleConfig);
  const validPos = validPositionsFor(roleConfig);
  const opponents = opponentSquads.length > 0 ? opponentSquads : fictionalOpponents(rand);

  // ── The twenty sides, as the match engine sees them ─────────────────────────
  //
  // Every player gets an id unique to this season. The same man can turn up in
  // the XI and in an opponent — drafted out of the season being played — and
  // the engine keys a match's stats by id, so his two selves must not collide.
  const players = new Map<number, SeasonPlayer>();
  let nextId = 1;
  function enter(team: string, isUser: boolean, name: string, position: Position, sourceId: number): number {
    const id = nextId++;
    players.set(id, {
      id, sourceId, name, team, isUser, position,
      goals: 0, assists: 0, cleanSheets: 0, shots: 0, shotsOnTarget: 0, chancesCreated: 0,
      saves: 0, tackles: 0, interceptions: 0, clearances: 0, blocks: 0, aerialsWon: 0, beaten: 0,
      yellowCards: 0, redCards: 0, ratings: [],
    });
    return id;
  }

  const userPlayers: MatchPlayer[] = picks.map(pick => ({
    ...toMatchPlayer(pick, validPos),
    playerId: enter(USER, true, pick.playerName, pick.position, pick.playerId),
  }));
  const sides: { name: string; setup: TeamSetup }[] = [{
    name: USER,
    setup: {
      name: USER,
      players: userPlayers,
      formation: '',
      style: PLAYSTYLES[tactic] ? tactic : 'balanced',
      // Where the attack goes follows from the shape of the eleven: wingers
      // mean the width gets used.
      focus: inferStyle(userPlayers).focus,
      // A drafted XI has never played together, and nothing yet says how well
      // drilled it is. The engine's default is an ordinary side.
      cohesion: DEFAULT_COHESION,
    },
  }];
  for (const squad of opponents) {
    const eleven: MatchPlayer[] = squad.players.map((p, i) => ({
      playerId: enter(squad.clubName, false, p.name, p.position, i),
      name: p.name,
      position: p.position,
      rating: p.rating,
      roles: activeRoles(p.roles, p.position, validPos),
    }));
    const inferred = inferStyle(eleven);
    sides.push({
      name: squad.clubName,
      setup: {
        name: squad.clubName,
        players: eleven,
        formation: squad.formation ?? '',
        style: squad.style && PLAYSTYLES[squad.style] ? squad.style : inferred.style,
        focus: squad.focus ?? inferred.focus,
        cohesion: squad.cohesion ?? DEFAULT_COHESION,
      },
    });
  }

  // ── Standings ───────────────────────────────────────────────────────────────
  const standings = new Map<string, MutableStanding>();
  for (const side of sides) {
    const isUser = side.name === USER;
    const lines = lineStrengths(side.setup.players);
    const ovr = isUser
      ? computeOverall(picks)
      : Math.round(opponents.find(s => s.clubName === side.name)?.strength ?? 75);
    standings.set(side.name, initStanding(side.name, isUser, ovr, lines.att, lines.def, lines.mid));
  }

  // ── The season ──────────────────────────────────────────────────────────────
  const schedule = buildSchedule(sides.length);
  const gameweeks: Gameweek[] = [];

  for (let r = 0; r < schedule.length; r++) {
    const fixtures: FixtureResult[] = [];

    for (const [hi, ai] of schedule[r]) {
      const home = sides[hi];
      const away = sides[ai];
      const match = simulateMatch(home.setup, away.setup, rand, roles);
      const homeGoals = match.home.goals;
      const awayGoals = match.away.goals;

      for (const team of [match.home, match.away]) {
        for (const s of team.players) {
          const p = players.get(s.playerId)!;
          p.goals          += s.goals;
          p.assists        += s.assists;
          p.shots          += s.shots;
          p.shotsOnTarget  += s.shotsOnTarget;
          p.chancesCreated += s.chancesCreated;
          p.saves          += s.saves;
          p.tackles        += s.tackles;
          p.interceptions  += s.interceptions;
          p.clearances     += s.clearances;
          p.blocks         += s.blocks;
          p.aerialsWon     += s.aerialsWon;
          p.beaten         += s.beaten;
          if (s.yellow) p.yellowCards++;
          if (s.red) p.redCards++;
          // A clean sheet is the keeper's and the back line's, as the awards
          // and the squad table count it.
          if (s.cleanSheet && CLEAN_SHEET_POSITIONS.includes(p.position)) p.cleanSheets++;
          p.ratings.push(s.rating);
        }
      }

      applyResult(standings.get(home.name)!, homeGoals, awayGoals);
      applyResult(standings.get(away.name)!, awayGoals, homeGoals);

      const userInvolved = home.name === USER || away.name === USER;
      const scorers = userInvolved
        ? match.events
          .filter(e => e.type === 'goal' && e.team === USER)
          .map(e => ({ name: e.playerName.split(' ').pop()!, minute: e.minute }))
        : [];
      fixtures.push({ home: home.name, away: away.name, homeGoals, awayGoals, userInvolved, scorers });
    }

    gameweeks.push({ week: r + 1, fixtures, tableSnapshot: sortedTable(standings) });
  }

  // ── The XI's season ─────────────────────────────────────────────────────────
  const average = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const seasonOf = [...players.values()].map(p => ({ ...p, avgRating: average(p.ratings) }));
  const userSeason = seasonOf.filter(p => p.isUser);

  const statsArr: PlayerStats[] = picks.map((pick, i) => {
    const s = userSeason[i];
    return {
      playerId:       pick.playerId,
      playerName:     pick.playerName,
      position:       pick.position,
      rating:         pick.rating,
      goals:          s.goals,
      assists:        s.assists,
      cleanSheets:    s.cleanSheets,
      shots:          s.shots,
      shotsOnTarget:  s.shotsOnTarget,
      chancesCreated: s.chancesCreated,
      saves:          s.saves,
      tackles:        s.tackles,
      interceptions:  s.interceptions,
      clearances:     s.clearances,
      blocks:         s.blocks,
      aerialsWon:     s.aerialsWon,
      beaten:         s.beaten,
      yellowCards:    s.yellowCards,
      redCards:       s.redCards,
      matchRatings:   s.ratings,
      avgMatchRating: s.ratings.length ? parseFloat(s.avgRating.toFixed(2)) : 6,
    };
  });

  // ── Final standings ─────────────────────────────────────────────────────────
  const finalTable = sortedTable(standings);
  const finalPosition = finalTable.find(s => s.isUser)!.position;
  const userRow = standings.get(USER)!;

  // ── User streak / record results ────────────────────────────────────────────
  let streak = 0, maxStreak = 0;
  let biggestMargin = 0, biggestWinStr = 'N/A';
  let highestTotal = 0, highestScoringStr = 'N/A';

  for (const gw of gameweeks) {
    const f = gw.fixtures.find(f => f.userInvolved);
    if (!f) continue;
    const gf = f.home === USER ? f.homeGoals : f.awayGoals;
    const ga = f.home === USER ? f.awayGoals : f.homeGoals;
    const opp = f.home === USER ? f.away : f.home;
    if (gf > ga) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0;
    const margin = gf - ga;
    if (margin > biggestMargin) { biggestMargin = margin; biggestWinStr = `${gf}-${ga} vs ${opp}`; }
    if (gf + ga > highestTotal) { highestTotal = gf + ga; highestScoringStr = `${gf}-${ga} vs ${opp}`; }
  }

  // ── Awards ──────────────────────────────────────────────────────────────────
  //
  // Player of the Season goes to the best average match rating: the engine's
  // rating of what each player did, match by match. Goals and assists count
  // toward it, as do shots on target, chances created, saves, clean sheets,
  // the result and the goals conceded — which is what gives a defender any
  // chance at all. It is exactly as good as those ratings are.
  const topScorer = statsArr.reduce((a, b) => a.goals > b.goals ? a : b);
  const topAssist = statsArr.reduce((a, b) => a.assists > b.assists ? a : b);
  const topGKs    = statsArr.filter(s => s.position === 'GK');
  const topGK     = topGKs.length ? topGKs.reduce((a, b) => a.cleanSheets > b.cleanSheets ? a : b) : statsArr[0];
  const pots      = statsArr.reduce((a, b) => b.avgMatchRating > a.avgMatchRating ? b : a);
  const leaguePots = seasonOf.reduce((a, b) => b.avgRating > a.avgRating ? b : a);

  // ── League leaderboards ─────────────────────────────────────────────────────
  const board = (value: (p: typeof seasonOf[number]) => number, only?: (p: typeof seasonOf[number]) => boolean) =>
    seasonOf
      .filter(p => (only ? only(p) : true) && value(p) > 0)
      .map(p => ({ playerName: p.name, clubName: p.team, value: value(p), isUser: p.isUser }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

  return {
    gameweeks,
    finalTable,
    finalPosition,
    points:       userRow.points,
    goalsFor:     userRow.goalsFor,
    goalsAgainst: userRow.goalsAgainst,
    wins:         userRow.won,
    draws:        userRow.drawn,
    losses:       userRow.lost,
    playerStats:  statsArr,
    awards: {
      goldenBoot:     { name: topScorer.playerName, goals: topScorer.goals },
      playmaker:      { name: topAssist.playerName, assists: topAssist.assists },
      goldenGlove:    { name: topGK?.playerName ?? '—', cleanSheets: topGK?.cleanSheets ?? 0 },
      playerOfSeason: { name: pots.playerName, goals: pots.goals, assists: pots.assists, rating: pots.avgMatchRating },
      leaguePlayerOfSeason: {
        name: leaguePots.name, club: leaguePots.team, goals: leaguePots.goals, assists: leaguePots.assists,
        isUser: leaguePots.isUser, rating: parseFloat(leaguePots.avgRating.toFixed(2)),
      },
    },
    longestWinStreak: maxStreak,
    biggestWin:       biggestWinStr,
    highestScoring:   highestScoringStr,
    narrative:        buildNarrative(finalPosition, userRow.points, userRow.won, userRow.drawn, userRow.lost),
    topScorers:       board(p => p.goals),
    topAssisters:     board(p => p.assists),
    topKeepers:       board(p => p.cleanSheets, p => p.position === 'GK'),
  };
}

/** Everything a player did across the season. */
interface SeasonPlayer {
  id: number;
  /** The player's id in the snapshot, or his index in an opponent's eleven. */
  sourceId: number;
  name: string;
  team: string;
  isUser: boolean;
  position: Position;
  goals: number;
  assists: number;
  cleanSheets: number;
  shots: number;
  shotsOnTarget: number;
  chancesCreated: number;
  saves: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  blocks: number;
  aerialsWon: number;
  beaten: number;
  yellowCards: number;
  redCards: number;
  ratings: number[];
}

const CLEAN_SHEET_POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB'];

/** A made-up league, for a caller with no opponent squads to hand over. */
function fictionalOpponents(rand: () => number): OpponentSquad[] {
  const shape: Position[] = ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'ST', 'ST'];
  return PL_OPPONENTS.map(clubName => {
    const rating = Math.round(62 + rand() * 28);
    return {
      clubName,
      strength: rating,
      players: shape.map((position, i) => ({
        id: String(i),
        name: genName(rand),
        role: position === 'GK' ? 'gk' : ['RB', 'CB', 'LB'].includes(position) ? 'def' : position === 'ST' ? 'att' : 'mid',
        position,
        rating,
        roles: [],
      })),
    };
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildNarrative(pos: number, pts: number, w: number, d: number, l: number): string {
  if (pos === 1) {
    if (pts >= 90) return `CHAMPIONS. An all-time season. ${pts} points, top of the pile. History made.`;
    if (pts >= 80) return `CHAMPIONS. ${w} wins, ${pts} points. Held their nerve and got over the line.`;
    return `CHAMPIONS. Unexpected. Chaotic. Brilliant. ${pts} points was enough.`;
  }
  if (pos <= 4)  return `Top four secured. ${pts} pts, ${pos === 2 ? 'runners-up' : `${pos}${pos === 3 ? 'rd' : 'th'} place`}. Champions League next season.`;
  if (pos <= 6)  return `Europa League qualification. ${pts} pts. A decent season but the title slipped away.`;
  if (pos <= 10) return `Mid-table. ${pts} pts. Moments of brilliance, but too many blank matchdays.`;
  if (pos <= 17) return `A season to forget. ${pts} pts. The squad had potential — the results didn't show it.`;
  return `Relegation. ${pts} pts, ${w}W ${d}D ${l}L. A tough campaign. Time to rebuild.`;
}
