// A match, played out rather than assigned.
//
// The engine this replaces did not simulate a match at all: it computed a goal
// count for each side, drew two numbers, and then held a separate lottery to
// decide who scored them. The scoreline and the scorers were unrelated, and no
// arrangement of players could produce a 5-4, because nothing in it knew what a
// chance was.
//
// Here a match is a sequence of possessions. A possession may become a chance,
// a chance has a quality, and that quality is converted or it is not. Goals,
// assists, cards and match ratings are recorded as they happen. Every scoreline
// from 0-0 to 8-2 is reachable, and none of them is arranged.
//
// ── On calibration ───────────────────────────────────────────────────────────
//
// The constants below are rates for a single event: how often a possession
// becomes a shot, how often a chance of a given type is scored, how often a
// foul is booked. They are facts about football and can be checked against it.
//
// There is deliberately nothing here that constrains an outcome — no floor
// under a team's goals, no cap on a multiplier, no target for the league table.
// If the table comes out wrong, something in this file is wrong, and this file
// is what gets fixed.

import { type Position, positionZone } from './formations';

export type Zone = 'L' | 'C' | 'R';
export type PlayerRole = string;

// ── Reference rates, per team per match (Premier League) ─────────────────────
//
//   possessions   ~100     shots        ~13      shots on target  ~4.4
//   goals        ~1.40     conversion  ~10.8%    fouls           ~10.4
//   yellows       ~1.9     reds        ~0.05
//
// Everything below aims at reproducing those, and the calibration test asserts
// that we still do.

/** Possessions in a match, shared between the sides. */
const POSSESSIONS = 200;

/** Chance that a possession produces a shot, for evenly matched sides. */
const BASE_SHOT_RATE = 0.137;

/** Chance that a possession concedes a foul. */
const BASE_FOUL_RATE = 0.099;

// Home advantage. The Premier League runs about 1.55 goals at home against
// 1.25 away, and it is not one effect: the home side sees marginally more of
// the ball, works more openings, and gets the run of the tight decisions.
const HOME_POSSESSION = 1.07;
const HOME_SHOT_RATE = 1.1;
const HOME_CHANCE_QUALITY = 1.04;

/** Share of goals set up by a team-mate, excluding penalties. */
const OPEN_PLAY_ASSIST_RATE = 0.8;

// How far quality carries. A better side creates more chances AND finishes them
// better, and those compound — so these three are deliberately gentle. Set them
// high and a strong squad wins by an amount no real league has ever seen.
const EDGE_TO_CHANCES = 0.2;
const FINISHING_EXPONENT = 0.4;
const KEEPING_EXPONENT = 0.32;

// Role multipliers were written for an engine that multiplied a goal *count*.
// Here they decide who gets on the end of a chance, where the same numbers are
// far too strong: a Poacher at 2.2 took half his side's shots. A leading
// striker takes roughly a quarter of them, so both role and rating are damped.
const ROLE_SELECTION_POWER = 0.5;
const RATING_SELECTION_POWER = 0.6;

// ── Set pieces ───────────────────────────────────────────────────────────────
//
// About 30% of shots and a quarter of goals in real football come from a dead
// ball, and they behave differently from open play. Winning a corner does not
// need you to play through a side — a deep defence wins them from clearances
// and counters — and converting one is a contest of height and delivery rather
// than of general quality.
//
// That matters more than it sounds. Without them, the only route to a goal is
// the one that scales hardest with squad quality, so a strong side dominates a
// weak league by more than any real team ever has.

/** Share of a side's shots that come from a dead ball. */
const SET_PIECE_SHARE = 0.3;

/** How much territorial superiority earns extra set pieces. Deliberately far
 *  below EDGE_TO_CHANCES: a side pinned back still wins corners. */
const SET_PIECE_EDGE = 0.06;

/** Base quality of a shot from a dead ball. Lower than a through ball. */
const SET_PIECE_QUALITY = 0.092;

/** How far an aerial mismatch carries on a set piece. */
const AERIAL_EXPONENT = 0.5;

// ── Cohesion ─────────────────────────────────────────────────────────────────
//
// How well drilled a side is: how reliably its talent turns into results.
//
// This is not a bonus and it is not a rating. A well-drilled side performs
// close to its level every week. A poorly drilled one is the same players
// having a different afternoon — brilliant one week, disjointed the next.
//
// It matters because everything else in this engine changes how much talent is
// worth on average, which moves every side together and leaves the table the
// same shape. Cohesion changes the RELIABILITY of talent, and unreliability is
// what closes a table up: upsets take points off the sides that should not be
// dropping them.
//
// It is also the honest way to say something true about football history. The
// modern game is coached far harder than the 1992/93 game was, which is why a
// talent gap converted into a points gap less dependably then.
//
// A caution for whoever sets these values: cohesion must be judged from what is
// known about a side — Wimbledon were drilled and limited, some talented sides
// were shambolic — and never fitted to make a historical table come out right.
// Doing that would be exactly the outcome-fitting this engine exists to avoid.

/** Cohesion of a side with nothing recorded. */
export const DEFAULT_COHESION = 72;

/** Swing, in rating points, of a wholly undrilled side's weekly performance. */
const COHESION_SWING = 9;

// Cohesion has a second, larger effect than that swing, and it is the one that
// matters. Talent is only expressed through organisation: eleven good players
// who have not been drilled do not play like eleven good players. So how far a
// quality advantage carries is itself scaled by how well drilled the sides are.
//
// A symmetric weekly swing turns out to do very little to a season — noise
// averages out over 42 games. This does not average out, because it changes how
// much being better is worth in the first place.
const EXPRESSION_FLOOR = 0.34;

/** A side at this cohesion performs at its level almost every week. */
const COHESION_CEILING = 100;

/** Who wins a header in the box. */
const AERIAL_WEIGHT: Record<Position, number> = {
  CB: 1.0, ST: 0.9, CF: 0.7, CDM: 0.6, GK: 0.35,
  LB: 0.4, RB: 0.4, LWB: 0.35, RWB: 0.35, CM: 0.45, CAM: 0.3,
  LM: 0.3, RM: 0.3, LW: 0.2, RW: 0.2,
};

/**
 * How much the `aerial` quality raises a player's presence in the air.
 *
 * This used to be a hardcoded list of role names multiplying a player's WEIGHT
 * in a mean, which had it backwards: the weight decides how much his rating
 * counts toward the average, so a below-average aerial specialist dragged his
 * side's aerial number DOWN. A 79-rated AerialThreat made a team worse in the
 * air than a plain 79-rated striker — signing a target man was a downgrade.
 *
 * The quality now scales his contribution rather than his influence, and it
 * picks up the negative side for free: Lightweight is aerial -2, and the old
 * map had no way to say that at all.
 */
const AERIAL_FROM_QUALITY = 0.28;

/** A foul that is booked, and a foul that is a straight red. */
const FOUL_TO_YELLOW = 0.2;
const FOUL_TO_RED = 0.0012;

// A booked player plays differently: he pulls out of challenges, and his
// manager often takes him off. Second yellows are rare for that reason rather
// than because anything forbids them, so a booked man both fouls less and is
// judged more leniently on the next one.
const BOOKED_FOUL_WEIGHT = 0.3;
const SECOND_YELLOW_LENIENCY = 0.35;

/** How sharply a rating compounds. Shared with the draft side of the game. */
const RATING_CURVE = 0.032;

const ratingScale = (rating: number) => Math.exp(RATING_CURVE * (rating - 80));

// ── Chance types ─────────────────────────────────────────────────────────────
//
// A chance is not a generic event: where it came from decides how good it is,
// and who is well placed to take it. The base figures are open-play averages —
// a header from a cross is a worse chance than a through ball.

export type ChanceType =
  | 'throughBall' | 'cross' | 'aerial' | 'longShot' | 'individual'
  | 'setPiece' | 'penalty';

const CHANCE_QUALITY: Record<ChanceType, number> = {
  throughBall: 0.16,
  individual: 0.11,
  aerial: 0.095,
  cross: 0.08,
  longShot: 0.032,
  setPiece: SET_PIECE_QUALITY,
  penalty: 0.78,
};

/** Roles that are better than average at converting a given kind of chance. */
const ROLE_CHANCE_AFFINITY: Record<ChanceType, Partial<Record<PlayerRole, number>>> = {
  aerial: { AerialThreat: 2.6, TargetMan: 1.9, NoNonsenseDefender: 1.3 },
  cross: { AerialThreat: 2.2, TargetMan: 1.7, Poacher: 1.3 },
  throughBall: { Poacher: 1.8, LateRunner: 1.6, InsideForward: 1.4, DeepLyingForward: 1.3 },
  individual: { InsideForward: 1.7, Trequartista: 1.5, Winger: 1.3 },
  longShot: { Mezzala: 1.5, Trequartista: 1.4, Regista: 1.2 },
  setPiece: { AerialThreat: 2.8, TargetMan: 2.0, NoNonsenseDefender: 1.9, BallPlayingDefender: 1.4 },
  penalty: {},
};

/**
 * How much a negative `discipline` quality raises a player's share of the
 * fouls. This used to be a hardcoded list of role names here in the engine,
 * which was the trait system reimplemented in the wrong place: adding a rash
 * defender meant editing the simulator.
 *
 * Note this changes WHO fouls, not how many fouls there are — the weights are
 * a selection among eleven players, so the cards-per-team rate is untouched.
 */
const DISCIPLINE_TO_FOULS = 1.8;

// ── Playstyles ───────────────────────────────────────────────────────────────
//
// A style is a set of trade-offs, not a bonus. Counter-attacking concedes the
// ball on purpose and is paid in chance quality; route one manufactures more
// chances but worse ones, and aims them at whoever wins headers.

export type PlaystyleName =
  | 'tikiTaka' | 'positionalPlay' | 'totalFootball' | 'possession'
  | 'gegenpress' | 'highPress' | 'balanced' | 'wingPlay'
  | 'direct' | 'counter' | 'routeOne' | 'catenaccio'
  | 'lowBlock' | 'parkTheBus';

export interface Playstyle {
  name: PlaystyleName;
  label: string;
  /** Long ball at 0, short and patient at 1. */
  buildUp: number;
  /** Deep at 0, very high at 1. */
  line: number;
  /** Scales the number of chances the match produces. */
  tempo: number;
  /** Pull on the share of the ball, before the midfield battle. */
  possessionBias: number;
  /** Weighting of the chance types this style manufactures. */
  chanceMix: Partial<Record<ChanceType, number>>;
  /** Fouls conceded. */
  aggression: number;
  /**
   * What the eleven needs to execute it, as quality names and weights.
   *
   * The cost of a style is always paid; the benefit is collected in
   * proportion to how well the side can actually play it. Tiki-taka without
   * technicians buys the low tempo and the high line and none of the control.
   */
  needs: Partial<Record<string, number>>;
}

export const PLAYSTYLES: Record<PlaystyleName, Playstyle> = {
  tikiTaka: {
    name: 'tikiTaka', label: 'Tiki-taka',
    buildUp: 1.0, line: 0.65, tempo: 0.80, possessionBias: 1.60, aggression: 0.80,
    chanceMix: { throughBall: 1.8, individual: 1.2, longShot: 0.9, cross: 0.5, aerial: 0.3 },
    needs: { pressResist: 3, creation: 2 },
  },
  positionalPlay: {
    name: 'positionalPlay', label: 'Positional play',
    buildUp: 0.85, line: 0.75, tempo: 0.95, possessionBias: 1.45, aggression: 0.90,
    chanceMix: { throughBall: 1.5, individual: 1.2, cross: 1.0, longShot: 1.0, aerial: 0.6 },
    needs: { pressResist: 2, creation: 2, pressing: 1 },
  },
  totalFootball: {
    name: 'totalFootball', label: 'Total football',
    buildUp: 0.80, line: 0.80, tempo: 1.05, possessionBias: 1.35, aggression: 0.95,
    chanceMix: { throughBall: 1.4, individual: 1.3, cross: 1.1, longShot: 1.0, aerial: 0.7 },
    needs: { pressResist: 1, creation: 1, pressing: 1 },
  },
  possession: {
    name: 'possession', label: 'Possession',
    buildUp: 0.80, line: 0.55, tempo: 0.90, possessionBias: 1.40, aggression: 0.85,
    chanceMix: { throughBall: 1.4, cross: 1.0, longShot: 1.1, individual: 1.1, aerial: 0.6 },
    needs: { pressResist: 2, creation: 2 },
  },
  gegenpress: {
    name: 'gegenpress', label: 'Gegenpress',
    buildUp: 0.60, line: 0.90, tempo: 1.25, possessionBias: 1.15, aggression: 1.30,
    chanceMix: { throughBall: 1.5, individual: 1.4, cross: 1.0, longShot: 1.0, aerial: 0.7 },
    needs: { pressing: 3, pace: 1 },
  },
  highPress: {
    name: 'highPress', label: 'High press',
    buildUp: 0.55, line: 0.85, tempo: 1.15, possessionBias: 1.10, aggression: 1.20,
    chanceMix: { throughBall: 1.3, individual: 1.2, cross: 1.0, longShot: 1.0, aerial: 0.8 },
    needs: { pressing: 2 },
  },
  balanced: {
    name: 'balanced', label: 'Balanced',
    buildUp: 0.50, line: 0.50, tempo: 1.00, possessionBias: 1.00, aggression: 1.00,
    chanceMix: { throughBall: 1, cross: 1, aerial: 1, longShot: 1, individual: 1 },
    needs: {},
  },
  wingPlay: {
    name: 'wingPlay', label: 'Wing play',
    buildUp: 0.45, line: 0.55, tempo: 1.05, possessionBias: 1.00, aggression: 1.00,
    chanceMix: { cross: 2.6, aerial: 1.6, individual: 1.1, throughBall: 0.6, longShot: 0.8 },
    needs: { aerial: 2, dribble: 1, setPiece: 1 },
  },
  direct: {
    name: 'direct', label: 'Direct',
    buildUp: 0.30, line: 0.55, tempo: 1.05, possessionBias: 0.85, aggression: 1.05,
    chanceMix: { throughBall: 1.8, individual: 1.2, cross: 1.0, aerial: 0.9, longShot: 0.8 },
    needs: { pace: 3 },
  },
  counter: {
    name: 'counter', label: 'Counter-attack',
    buildUp: 0.35, line: 0.30, tempo: 0.90, possessionBias: 0.65, aggression: 1.10,
    chanceMix: { throughBall: 2.2, individual: 1.5, cross: 0.7, aerial: 0.5, longShot: 0.7 },
    needs: { pace: 3, recovery: 1 },
  },
  routeOne: {
    name: 'routeOne', label: 'Route one',
    buildUp: 0.10, line: 0.45, tempo: 1.00, possessionBias: 0.75, aggression: 1.15,
    chanceMix: { aerial: 3.4, cross: 1.8, longShot: 1.1, throughBall: 0.4, individual: 0.5 },
    needs: { aerial: 3 },
  },
  catenaccio: {
    name: 'catenaccio', label: 'Catenaccio',
    buildUp: 0.30, line: 0.20, tempo: 0.80, possessionBias: 0.70, aggression: 1.20,
    chanceMix: { throughBall: 1.8, individual: 1.2, cross: 0.7, aerial: 0.7, longShot: 0.8 },
    needs: { recovery: 2, pace: 2 },
  },
  lowBlock: {
    name: 'lowBlock', label: 'Low block',
    buildUp: 0.40, line: 0.20, tempo: 0.82, possessionBias: 0.70, aggression: 1.20,
    chanceMix: { throughBall: 1.1, aerial: 1.3, cross: 0.9, longShot: 1.1, individual: 0.8 },
    needs: { aerial: 1, recovery: 1 },
  },
  parkTheBus: {
    name: 'parkTheBus', label: 'Park the bus',
    buildUp: 0.25, line: 0.10, tempo: 0.68, possessionBias: 0.55, aggression: 1.30,
    chanceMix: { aerial: 1.6, longShot: 1.2, cross: 0.8, throughBall: 0.6, individual: 0.5 },
    needs: { aerial: 1 },
  },
};

// ── How far a style's demands carry ──────────────────────────────────────────

/** How much a press cuts an exposed side's chances. */
const PRESS_EFFECT = 2.2;

/** How much a deep block cuts a patient side's chances. */
const CONGESTION_EFFECT = 0.45;

/** How much space in behind is worth to a direct side against a high line. */
const SPACE_EFFECT = 1.1;

/** A team quality of this size counts as fully meeting a style's demand. */
const FIT_REFERENCE = 0.45;

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface MatchPlayer {
  playerId: number;
  name: string;
  position: Position;
  rating: number;
  roles?: PlayerRole[];
  /** Every position he genuinely plays. Only total football reads it. */
  positions?: Position[];
}

export interface TeamSetup {
  name: string;
  players: MatchPlayer[];
  formation: string;
  style: PlaystyleName;
  /** Relative weight of attacks down each side. Normalised internally. */
  focus: Record<Zone, number>;
  /**
   * How well drilled this side is, 0-100. Defaults to DEFAULT_COHESION.
   * Low cohesion does not make a side worse on average — it makes it less
   * reliable, which over a season costs points it should have taken.
   */
  cohesion?: number;
}

export interface RoleMultipliers {
  goalMult: Partial<Record<PlayerRole, number>>;
  assistMult: Partial<Record<PlayerRole, number>>;
  /**
   * What each role says a player is good at, as opposed to what he produces.
   * See docs/roles.md. Absent means the engine falls back to treating every
   * player as unremarkable, which is right for a caller that has no role data.
   */
  qualities?: Partial<Record<PlayerRole, Partial<Record<string, number>>>>;
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export interface MatchEvent {
  minute: number;
  team: string;
  type: 'goal' | 'yellow' | 'red';
  playerId: number;
  playerName: string;
  assistId?: number;
  assistName?: string;
  chanceType?: ChanceType;
}

export interface MatchPlayerStats {
  playerId: number;
  name: string;
  position: Position;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  chancesCreated: number;
  fouls: number;
  yellow: boolean;
  red: boolean;
  saves: number;
  cleanSheet: boolean;
  rating: number;
}

export interface TeamMatchStats {
  name: string;
  goals: number;
  shots: number;
  shotsOnTarget: number;
  expectedGoals: number;
  possession: number;
  fouls: number;
  yellows: number;
  reds: number;
  players: MatchPlayerStats[];
}

export interface MatchResult {
  home: TeamMatchStats;
  away: TeamMatchStats;
  events: MatchEvent[];
}

// ── Team shape ───────────────────────────────────────────────────────────────

/** How much a position contributes to creating a chance. */
const ATTACK_WEIGHT: Record<Position, number> = {
  ST: 1.0, CF: 0.95, LW: 0.85, RW: 0.85, CAM: 0.8,
  LM: 0.6, RM: 0.6, CM: 0.45, CDM: 0.22,
  LWB: 0.28, RWB: 0.28, LB: 0.18, RB: 0.18, CB: 0.08, GK: 0.0,
};

/** How much a position contributes to stopping one. */
const DEFEND_WEIGHT: Record<Position, number> = {
  GK: 1.0, CB: 0.95, LB: 0.8, RB: 0.8, CDM: 0.72, LWB: 0.62, RWB: 0.62,
  CM: 0.45, LM: 0.3, RM: 0.3, CAM: 0.14, LW: 0.1, RW: 0.1, CF: 0.05, ST: 0.02,
};

/** Control of midfield decides who has the ball. */
const MIDFIELD_WEIGHT: Record<Position, number> = {
  CM: 1.0, CDM: 0.9, CAM: 0.8, LM: 0.65, RM: 0.65, LWB: 0.35, RWB: 0.35,
  CF: 0.25, LW: 0.25, RW: 0.25, CB: 0.2, LB: 0.2, RB: 0.2, ST: 0.05, GK: 0.05,
};

/**
 * How much of a quality advantage a side can actually put on the pitch.
 *
 * 1.0 for a perfectly drilled side, falling to EXPRESSION_FLOOR for one with no
 * organisation at all — where a match is far closer to a lottery regardless of
 * who is playing.
 */
function expression(cohesion: number): number {
  const drilled = Math.max(0, Math.min(COHESION_CEILING, cohesion)) / COHESION_CEILING;
  return EXPRESSION_FLOOR + (1 - EXPRESSION_FLOOR) * drilled;
}

interface TeamModel {
  setup: TeamSetup;
  style: Playstyle;
  players: MatchPlayer[];
  keeper: MatchPlayer | null;
  attackZone: Record<Zone, number>;
  defendZone: Record<Zone, number>;
  midfield: number;
  aerial: number;
  focus: Record<Zone, number>;
  /**
   * What the eleven can actually do, as opposed to how good they are.
   *
   * Each is the sum over the side of a quality, scaled by how good the player
   * carrying it is and normalised by squad size, so three quick players are
   * more running threat than one flying winger. These are what the style
   * interactions read; see docs/playstyles.md.
   */
  pressResistance: number;
  pressIntensity: number;
  runningThreat: number;
  creation: number;
  versatility: number;
  /** 0-1: how well this eleven can play the style it has been given. */
  fit: number;
}

const ZONES: Zone[] = ['L', 'C', 'R'];

/** Attacking down the left is met by the opponent's right. */
const OPPOSITE: Record<Zone, Zone> = { L: 'R', C: 'C', R: 'L' };

function weightedQuality(
  players: MatchPlayer[],
  weight: Record<Position, number>,
  zone: Zone | null,
): number {
  let total = 0;
  let mass = 0;
  for (const p of players) {
    let w = weight[p.position] ?? 0.3;
    if (zone) {
      // A player stationed in the zone under attack does most of the work
      // there, but a central player still helps out wide, so the fall-off is
      // partial rather than absolute.
      const pz = positionZone(p.position);
      w *= pz === zone ? 1 : pz === 'C' || zone === 'C' ? 0.55 : 0.2;
    }
    if (w <= 0) continue;
    total += w * ratingScale(p.rating);
    mass += w;
  }
  return mass === 0 ? ratingScale(70) : total / mass;
}

/**
 * A side's presence in both boxes at a dead ball.
 *
 * Position decides how much of the contest a player is part of; the `aerial`
 * quality decides how well he does in it. Keeping those two separate is the
 * whole point — see AERIAL_FROM_QUALITY.
 */
export function aerialQuality(players: MatchPlayer[], roles: RoleMultipliers): number {
  let total = 0;
  let mass = 0;
  for (const p of players) {
    const w = AERIAL_WEIGHT[p.position] ?? 0.4;
    total += w * ratingScale(p.rating)
      * Math.exp(AERIAL_FROM_QUALITY * quality(p, 'aerial', roles));
    mass += w;
  }
  return mass === 0 ? ratingScale(70) : total / mass;
}

/**
 * A team-level quality: everyone's contribution, weighted by how good he is.
 *
 * Divided by squad size so the numbers are comparable between sides, and so a
 * quality nobody has comes out at zero rather than at some baseline.
 */
function teamQuality(players: MatchPlayer[], name: string, roles: RoleMultipliers): number {
  if (players.length === 0) return 0;
  let total = 0;
  for (const p of players) total += quality(p, name, roles) * ratingScale(p.rating);
  return total / players.length;
}

/**
 * How well an eleven can execute the style it has been given, 0 to 1.
 *
 * A style with no demands fits everybody, which is what makes `balanced` a safe
 * choice rather than a weak one. The cost of a style is paid regardless; only
 * the benefit is scaled by this.
 */
function styleFit(players: MatchPlayer[], style: Playstyle, roles: RoleMultipliers): number {
  const demands = Object.entries(style.needs);
  if (demands.length === 0) return 1;
  let have = 0;
  let want = 0;
  for (const [name, weight] of demands) {
    const w = weight ?? 0;
    want += w;
    have += w * Math.max(0, teamQuality(players, name, roles));
  }
  if (want === 0) return 1;
  return Math.max(0, Math.min(1, have / (want * FIT_REFERENCE)));
}

/**
 * How well an eleven could play a style it has not been given yet, 0 to 1.
 *
 * The same measure `buildTeam` applies to a side that is already set up,
 * exposed so a player can be shown what his XI is equipped to do before he
 * commits to it, and so the season model can scale a style's benefit by it.
 */
export function fitForStyle(
  players: MatchPlayer[], style: PlaystyleName, roles: RoleMultipliers,
): number {
  return styleFit(players, PLAYSTYLES[style] ?? PLAYSTYLES.balanced, roles);
}

function buildTeam(setup: TeamSetup, roles: RoleMultipliers): TeamModel {
  const style = PLAYSTYLES[setup.style] ?? PLAYSTYLES.balanced;
  const players = setup.players;
  const focusTotal = ZONES.reduce((s, z) => s + Math.max(0, setup.focus[z] ?? 0), 0) || 1;
  const model: TeamModel = {
    setup,
    style,
    players,
    keeper: players.find(p => p.position === 'GK') ?? null,
    attackZone: {
      L: weightedQuality(players, ATTACK_WEIGHT, 'L'),
      C: weightedQuality(players, ATTACK_WEIGHT, 'C'),
      R: weightedQuality(players, ATTACK_WEIGHT, 'R'),
    },
    defendZone: {
      L: weightedQuality(players, DEFEND_WEIGHT, 'L'),
      C: weightedQuality(players, DEFEND_WEIGHT, 'C'),
      R: weightedQuality(players, DEFEND_WEIGHT, 'R'),
    },
    midfield: weightedQuality(players, MIDFIELD_WEIGHT, null),
    aerial: aerialQuality(players, roles),
    pressResistance: teamQuality(players, 'pressResist', roles),
    pressIntensity: teamQuality(players, 'pressing', roles),
    runningThreat: teamQuality(players, 'pace', roles),
    creation: teamQuality(players, 'creation', roles),
    versatility: players.filter(p => (p.positions?.length ?? 1) > 1).length
      / Math.max(1, players.length),
    focus: {
      L: Math.max(0, setup.focus.L ?? 0) / focusTotal,
      C: Math.max(0, setup.focus.C ?? 0) / focusTotal,
      R: Math.max(0, setup.focus.R ?? 0) / focusTotal,
    },
    fit: 1,
  };
  model.fit = styleFit(players, style, roles);
  return model;
}

// ── Selection ────────────────────────────────────────────────────────────────

/**
 * What a player's roles say about one ability, summed.
 *
 * Qualities are how a trait describes what a player is GOOD AT, as distinct
 * from the goal and assist multipliers, which describe what he produces. The
 * playstyle interactions are all built on these. See docs/roles.md.
 */
function quality(p: MatchPlayer, name: string, roles: RoleMultipliers): number {
  let total = 0;
  for (const r of p.roles ?? []) total += roles.qualities?.[r]?.[name] ?? 0;
  return total;
}

// ── The interaction rules, as functions ──────────────────────────────────────
//
// Exported so they can be tested for what they claim rather than inferred from
// shot counts. Every attempt to measure them through a match confounded them
// with something else: a pressing side and a deep block differ in tempo as well
// as in pressing, and a squad stripped of traits is weaker everywhere, not only
// at winning the ball back.

/**
 * How much a press cuts the chances of a side trying to play through it.
 *
 * Going long is the answer to a press, which is why `buildUp` sets the exposure
 * and why resistance on the ball subtracts from it. A side that hits it long is
 * not pressed at all, whoever it is playing.
 */
export function pressFactor(
  buildUp: number, pressResistance: number, opponentPress: number,
): number {
  const exposed = Math.max(0, buildUp - pressResistance);
  return 1 / (1 + PRESS_EFFECT * Math.max(0, opponentPress) * exposed);
}

/**
 * How much a deep defence cuts the chances of a patient side.
 *
 * Creation is what unpicks it; without any, patience against a low block is
 * just passing in front of them.
 */
export function congestionFactor(
  buildUp: number, creation: number, opponentLine: number,
): number {
  const deep = 1 - opponentLine;
  const congested = deep * buildUp * Math.max(0, 1 - creation * 2);
  return 1 / (1 + CONGESTION_EFFECT * congested);
}

/**
 * How much better a chance is when there is space in behind.
 *
 * Directness times the opponent's line height times whoever is running into it,
 * less whatever recovery pace the defence has to cover the gap.
 */
export function spaceFactor(
  buildUp: number, runningThreat: number, fit: number,
  opponentLine: number, opponentRecovery: number,
): number {
  const directness = 1 - buildUp;
  const space = directness * opponentLine * Math.max(0, runningThreat - opponentRecovery);
  return 1 + SPACE_EFFECT * space * fit;
}

/** Box-Muller. A performance swing is symmetric around a side's own level. */
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * How far off its own level a side plays today, in rating points.
 *
 * Mean zero: cohesion does not make a side better or worse on average, only
 * more or less dependable. A fully drilled side barely deviates; an undrilled
 * one is a different team week to week.
 */
function formShift(rand: () => number, cohesion: number): number {
  const drilled = Math.max(0, Math.min(COHESION_CEILING, cohesion)) / COHESION_CEILING;
  return gaussian(rand) * COHESION_SWING * (1 - drilled);
}

/** Applies a day's form to everything a side does. */
function applyForm(team: TeamModel, shift: number): void {
  const factor = Math.exp(RATING_CURVE * shift);
  for (const z of ZONES) {
    team.attackZone[z] *= factor;
    team.defendZone[z] *= factor;
  }
  team.aerial *= factor;
  team.midfield *= factor;
}

function pickWeighted<T>(rand: () => number, items: T[], weights: number[]): T | null {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return null;
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Combines a player's role multipliers.
 *
 * Traits do not stack, in either direction. Each one is a statement about the
 * player measured against an ordinary player, not against his other traits, so
 * multiplying them together compounds a comparison that was never meant to be
 * compounded. Saying a man delivers set pieces AND creates chances should not
 * make him unable to score.
 *
 * It bit hard once the traits were assigned properly: Rodri, who scores from
 * distance, came out at 0.33; Reece James, who scores free kicks, at 0.17; and
 * Declan Rice at 0.24 from four separate true statements about him.
 *
 * The old engine already did half of this — applyRoleMults in simulation.ts
 * takes the strongest booster rather than their product — but took the product
 * of the suppressors, which is the same mistake in the other direction.
 */
function combineRoleMults(mults: number[], power: number): number {
  if (mults.length === 0) return 1;
  let boost = 1;
  let suppress = 1;
  for (const m of mults) {
    if (m > 1) boost = Math.max(boost, m);
    else if (m < 1) suppress = Math.min(suppress, m);
  }
  return Math.pow(boost * suppress, power);
}

function pickChanceType(rand: () => number, team: TeamModel, zone: Zone): ChanceType {
  const mix = team.style.chanceMix;
  const types: ChanceType[] = ['throughBall', 'cross', 'aerial', 'longShot', 'individual'];
  const weights = types.map(t => {
    let w = mix[t] ?? 1;
    // Attacks down a flank arrive as crosses; through the middle they do not.
    if (zone === 'C') w *= t === 'cross' ? 0.35 : t === 'throughBall' ? 1.5 : 1;
    else w *= t === 'cross' ? 2.2 : t === 'throughBall' ? 0.7 : 1;
    return w;
  });
  return pickWeighted(rand, types, weights) ?? 'individual';
}

function pickShooter(
  rand: () => number,
  team: TeamModel,
  zone: Zone,
  type: ChanceType,
  roles: RoleMultipliers,
): MatchPlayer | null {
  const affinity = ROLE_CHANCE_AFFINITY[type];
  const candidates = team.players.filter(p => p.position !== 'GK');
  // At a corner the whole side is in the box, and it is usually a centre-half
  // who gets on the end of it. Open-play weighting would all but exclude them.
  const setPiece = type === 'setPiece';
  const weights = candidates.map(p => {
    let w = setPiece
      ? (AERIAL_WEIGHT[p.position] ?? 0.4) + 0.05
      : (ATTACK_WEIGHT[p.position] ?? 0.2) + 0.05;
    const pz = positionZone(p.position);
    if (!setPiece) w *= pz === zone ? 1.35 : pz === 'C' || zone === 'C' ? 1 : 0.55;
    let best = 1;
    const mults: number[] = [];
    for (const r of p.roles ?? []) {
      mults.push(roles.goalMult[r] ?? 1);
      best = Math.max(best, affinity[r] ?? 1);
    }
    return w * combineRoleMults(mults, ROLE_SELECTION_POWER)
      * Math.pow(best, ROLE_SELECTION_POWER)
      * Math.pow(ratingScale(p.rating), RATING_SELECTION_POWER);
  });
  return pickWeighted(rand, candidates, weights);
}

function pickCreator(
  rand: () => number,
  team: TeamModel,
  zone: Zone,
  shooterId: number,
  roles: RoleMultipliers,
): MatchPlayer | null {
  const candidates = team.players.filter(p => p.position !== 'GK' && p.playerId !== shooterId);
  const weights = candidates.map(p => {
    let w = (ATTACK_WEIGHT[p.position] ?? 0.2) + 0.12;
    const pz = positionZone(p.position);
    w *= pz === zone ? 1.5 : pz === 'C' || zone === 'C' ? 1 : 0.5;
    const mults = (p.roles ?? []).map(r => roles.assistMult[r] ?? 1);
    return w * combineRoleMults(mults, ROLE_SELECTION_POWER)
      * Math.pow(ratingScale(p.rating), RATING_SELECTION_POWER);
  });
  return pickWeighted(rand, candidates, weights);
}

function pickFouler(
  rand: () => number,
  team: TeamModel,
  booked: (id: number) => boolean,
  roles: RoleMultipliers,
): MatchPlayer | null {
  const weights = team.players.map(p => {
    let w = (DEFEND_WEIGHT[p.position] ?? 0.3) + 0.05;
    if (p.position === 'GK') w *= 0.06;
    // Negative discipline means he gives away more of them; positive means the
    // opposite, which is why the sign is simply flipped rather than clamped.
    w *= Math.pow(DISCIPLINE_TO_FOULS, -quality(p, 'discipline', roles));
    if (booked(p.playerId)) w *= BOOKED_FOUL_WEIGHT;
    return w;
  });
  return pickWeighted(rand, team.players, weights);
}

// ── The match ────────────────────────────────────────────────────────────────

function blankStats(p: MatchPlayer): MatchPlayerStats {
  return {
    playerId: p.playerId,
    name: p.name,
    position: p.position,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    chancesCreated: 0,
    fouls: 0,
    yellow: false,
    red: false,
    saves: 0,
    cleanSheet: false,
    rating: 6,
  };
}

export function simulateMatch(
  homeSetup: TeamSetup,
  awaySetup: TeamSetup,
  rand: () => number,
  roles: RoleMultipliers = { goalMult: {}, assistMult: {} },
): MatchResult {
  const home = buildTeam(homeSetup, roles);
  const away = buildTeam(awaySetup, roles);

  // What each side turns up as today. Drawn before anything else happens, so
  // the whole match is played by the team that showed up rather than the team
  // on paper.
  applyForm(home, formShift(rand, homeSetup.cohesion ?? DEFAULT_COHESION));
  applyForm(away, formShift(rand, awaySetup.cohesion ?? DEFAULT_COHESION));

  const stats = new Map<number, MatchPlayerStats>();
  for (const p of [...home.players, ...away.players]) stats.set(p.playerId, blankStats(p));
  const sent = new Set<number>();

  const events: MatchEvent[] = [];
  const acc = {
    home: { goals: 0, shots: 0, onTarget: 0, xg: 0, fouls: 0, yellows: 0, reds: 0 },
    away: { goals: 0, shots: 0, onTarget: 0, xg: 0, fouls: 0, yellows: 0, reds: 0 },
  };

  // Who has the ball. Midfield control decides it, style pulls on it, and the
  // home side sees a little more of it.
  const midEdge = Math.log(home.midfield / away.midfield) / RATING_CURVE / 10;
  const homeWeight = home.style.possessionBias * Math.exp(0.22 * midEdge) * HOME_POSSESSION;
  const awayWeight = away.style.possessionBias;
  const homeShare = homeWeight / (homeWeight + awayWeight);

  for (let i = 0; i < POSSESSIONS; i++) {
    const minute = Math.min(90, Math.floor((i / POSSESSIONS) * 90) + 1);
    const isHome = rand() < homeShare;
    const att = isHome ? home : away;
    const def = isHome ? away : home;
    const side = isHome ? acc.home : acc.away;

    // Which way this attack goes, and who meets it.
    const zone = pickWeighted(rand, ZONES, ZONES.map(z => att.focus[z])) ?? 'C';
    const defZone = OPPOSITE[zone];

    // Playing a man short tells in both boxes.
    const shortHanded = def.players.filter(p => sent.has(p.playerId)).length;
    const defPenalty = Math.pow(0.86, shortHanded);

    // Does this possession become a chance? Attacking quality in the zone,
    // against defensive quality in the zone it arrives at.
    const edge =
      Math.log(att.attackZone[zone] / (def.defendZone[defZone] * defPenalty)) / RATING_CURVE / 10;
    // Both sides' organisation decides how far the gap between them tells: a
    // drilled side exploits its superiority, and a drilled one resists it.
    const carry = (expression(att.setup.cohesion ?? DEFAULT_COHESION)
      + expression(def.setup.cohesion ?? DEFAULT_COHESION)) / 2;
    // ── How the styles meet ────────────────────────────────────────────────
    //
    // Four rules, from which every matchup follows. Nobody writes down that a
    // counter-attacking side punishes a possession side; it falls out of these.

    // Tempo is a property of the MATCH, not of one side. Two deep blocks make
    // a slow game whoever has the ball, which is why a weak side wants one:
    // fewer chances means quality is expressed less often, and that is
    // arithmetic rather than a thumb on the scale.
    const tempo = Math.sqrt(att.style.tempo * def.style.tempo);

    // Having the ball is not itself an advantage, and this is the correction
    // that makes the styles a set of trade-offs rather than a ladder.
    //
    // A side with 62% of the ball was taking 62% of the chances, so possession
    // bought volume for free and every patient style sat at the top of the
    // table. Normalising by the share means a possession side gets the same
    // number of chances from more of the ball — which is what patient build-up
    // against a set defence actually looks like. Advantage now has to come from
    // quality, from fit, or from the matchup.
    const ownShare = isHome ? homeShare : 1 - homeShare;
    const shareNormalised = 0.5 / Math.max(0.15, ownShare);

    // 1. Press disruption. A side that presses high hurts one trying to play
    //    out, and is beaten by one that goes long — the reason teams hoof it
    //    against a press. Resistance on the ball is what survives it.
    const press = def.pressIntensity * def.style.line * def.fit;
    const pressed = pressFactor(att.style.buildUp, att.pressResistance, press);

    // 2. Congestion. A deep block leaves a patient side nowhere to play, and
    //    creation is what unpicks it.
    const congested = congestionFactor(att.style.buildUp, att.creation, def.style.line);

    const shotRate =
      BASE_SHOT_RATE *
      tempo *
      shareNormalised *
      pressed *
      congested *
      Math.exp(EDGE_TO_CHANCES * carry * edge) *
      (isHome ? HOME_SHOT_RATE : 1);

    // Two independent routes to a shot. The second barely cares who is on top.
    // BASE_SHOT_RATE is the whole shot count, so the two routes split it rather
    // than stacking: adding dead balls on top put every side on 18 shots.
    // Dead balls are barely affected by any of it: a side pinned in its own
    // half still wins corners from clearances and counters.
    const setPieceRate = BASE_SHOT_RATE * SET_PIECE_SHARE
      * tempo * shareNormalised
      * Math.exp(SET_PIECE_EDGE * edge) * (isHome ? HOME_SHOT_RATE : 1);
    const openPlay = rand() < shotRate * (1 - SET_PIECE_SHARE);
    const deadBall = !openPlay && rand() < setPieceRate;

    if (openPlay || deadBall) {
      const type: ChanceType = deadBall
        ? 'setPiece'
        : rand() < 0.011
          ? 'penalty'
          : pickChanceType(rand, att, zone);
      const shooter = pickShooter(rand, att, zone, type, roles);
      if (shooter) {
        const shooterStats = stats.get(shooter.playerId)!;
        shooterStats.shots++;
        side.shots++;

        // How good the chance is: its type, the finisher, and the keeper.
        const affinity = ROLE_CHANCE_AFFINITY[type];
        let finishing = ratingScale(shooter.rating);
        for (const r of shooter.roles ?? []) finishing *= Math.sqrt(affinity[r] ?? 1);
        const keeper = def.keeper;
        const keeping = keeper ? ratingScale(keeper.rating) : 1;

        // A style's demands are a cost paid up front; what it gives back is
        // collected only in proportion to whether the eleven can play it.
        let xg = CHANCE_QUALITY[type] * (isHome ? HOME_CHANCE_QUALITY : 1);
        if (type === 'aerial' || type === 'cross') {
          xg *= Math.pow(att.aerial / def.aerial, AERIAL_EXPONENT * 0.7)
            * Math.pow(finishing, FINISHING_EXPONENT * carry * 0.5)
            * Math.pow(keeping, -KEEPING_EXPONENT * carry) / defPenalty;
        } else if (type === 'setPiece') {
          // A contest of height and delivery. A poor side with a big defender
          // scores from a corner against anyone, which is exactly why this
          // route does not scale with the open-play gap.
          xg *= Math.pow(att.aerial / def.aerial, AERIAL_EXPONENT) / defPenalty;
        } else if (type !== 'penalty') {
          // 3. Space in behind. A direct side with runners punishes a high
          //    line; a patient one gains nothing from it. Recovery pace in the
          //    defence is what covers the gap.
          const inBehind = spaceFactor(att.style.buildUp, att.runningThreat, att.fit,
            def.style.line, teamQuality(def.players, 'recovery', roles));

          xg *= inBehind
            * Math.pow(finishing, FINISHING_EXPONENT * carry)
            * Math.pow(keeping, -KEEPING_EXPONENT * carry) / defPenalty;
        }
        xg = Math.min(0.95, xg);
        side.xg += xg;

        // On target is a wider event than a goal: a chance can be well struck
        // and saved. Better chances are hit straighter.
        const onTargetRate = Math.min(0.94, 0.22 + xg * 1.1);
        const onTarget = rand() < onTargetRate;
        if (onTarget) {
          shooterStats.shotsOnTarget++;
          side.onTarget++;
        }

        if (onTarget && rand() < xg / onTargetRate) {
          shooterStats.goals++;
          side.goals++;
          // Most goals are assisted; a solo effort or a penalty is not.
          const creator =
            type === 'penalty' || rand() > (type === 'setPiece' ? 0.93 : OPEN_PLAY_ASSIST_RATE)
              ? null
              : pickCreator(rand, att, zone, shooter.playerId, roles);
          if (creator) {
            const cs = stats.get(creator.playerId)!;
            cs.assists++;
            cs.chancesCreated++;
          }
          events.push({
            minute,
            team: att.setup.name,
            type: 'goal',
            playerId: shooter.playerId,
            playerName: shooter.name,
            assistId: creator?.playerId,
            assistName: creator?.name,
            chanceType: type,
          });
        } else if (onTarget && keeper) {
          stats.get(keeper.playerId)!.saves++;
        }
      }
    }

    // Fouls. The side without the ball concedes them.
    if (rand() < BASE_FOUL_RATE * def.style.aggression) {
      const defSide = isHome ? acc.away : acc.home;
      const fouler = pickFouler(rand, def, id => stats.get(id)?.yellow ?? false, roles);
      if (fouler && !sent.has(fouler.playerId)) {
        const fs = stats.get(fouler.playerId)!;
        fs.fouls++;
        defSide.fouls++;
        const straightRed = rand() < FOUL_TO_RED;
        const booked = rand() < FOUL_TO_YELLOW * (fs.yellow ? SECOND_YELLOW_LENIENCY : 1);
        if (straightRed || (booked && fs.yellow)) {
          fs.red = true;
          sent.add(fouler.playerId);
          defSide.reds++;
          events.push({
            minute, team: def.setup.name, type: 'red',
            playerId: fouler.playerId, playerName: fouler.name,
          });
        } else if (booked) {
          fs.yellow = true;
          defSide.yellows++;
          events.push({
            minute, team: def.setup.name, type: 'yellow',
            playerId: fouler.playerId, playerName: fouler.name,
          });
        }
      }
    }
  }

  // ── Match ratings ──────────────────────────────────────────────────────────
  //
  // Built from what the player did, not from what they are rated. A 92-rated
  // keeper who concedes four does not get a 7.

  const finish = (team: TeamModel, own: number, against: number): TeamMatchStats => {
    const players: MatchPlayerStats[] = [];
    for (const p of team.players) {
      const s = stats.get(p.playerId)!;
      s.cleanSheet = against === 0 && p.position !== 'ST' && p.position !== 'CF';
      const defensive = DEFEND_WEIGHT[p.position] ?? 0.3;
      let r = 6.0;
      r += s.goals * 1.05 + s.assists * 0.65;
      r += s.shotsOnTarget * 0.08 + s.chancesCreated * 0.05;
      r += (own - against) * 0.12;
      r -= against * 0.22 * defensive;
      if (against === 0) r += 0.45 * defensive;
      if (p.position === 'GK') r += s.saves * 0.11;
      if (s.yellow) r -= 0.3;
      if (s.red) r -= 1.4;
      s.rating = Math.round(Math.max(1, Math.min(10, r)) * 10) / 10;
      players.push(s);
    }
    const a = team === home ? acc.home : acc.away;
    return {
      name: team.setup.name,
      goals: a.goals,
      shots: a.shots,
      shotsOnTarget: a.onTarget,
      expectedGoals: Math.round(a.xg * 100) / 100,
      possession: Math.round((team === home ? homeShare : 1 - homeShare) * 1000) / 10,
      fouls: a.fouls,
      yellows: a.yellows,
      reds: a.reds,
      players,
    };
  };

  return {
    home: finish(home, acc.home.goals, acc.away.goals),
    away: finish(away, acc.away.goals, acc.home.goals),
    events: events.sort((x, y) => x.minute - y.minute),
  };
}

/**
 * A reasonable style and focus for a side we have no tactical data for.
 *
 * Derived from the shape they actually play: wingers mean the width is used,
 * two strikers with a target man and no creative midfield means the ball goes
 * forward early. This is a placeholder for real per-club-season data, not a
 * substitute for it.
 */
export function inferStyle(
  players: MatchPlayer[],
): { style: PlaystyleName; focus: Record<Zone, number> } {
  const at = (ps: Position[]) => players.filter(p => ps.includes(p.position)).length;
  const hasRole = (names: string[]) =>
    players.filter(p => (p.roles ?? []).some(r => names.includes(r))).length;

  const wide = at(['LW', 'RW', 'LM', 'RM', 'LWB', 'RWB']);
  const creators = hasRole(['Regista', 'DeepLyingPlaymaker', 'ChanceCreator', 'Trequartista']);
  const target = hasRole(['TargetMan', 'AerialThreat']);

  let style: PlaystyleName = 'balanced';
  if (target >= 1 && creators === 0 && at(['ST', 'CF']) >= 2) style = 'routeOne';
  else if (creators >= 2) style = 'possession';
  else if (at(['CDM']) >= 2) style = 'lowBlock';
  else if (creators >= 1 && wide >= 2) style = 'highPress';

  const left = players.filter(p => positionZone(p.position) === 'L').length;
  const right = players.filter(p => positionZone(p.position) === 'R').length;
  return {
    style,
    focus: { L: 1 + left * 0.35, C: 1.5 + (wide === 0 ? 1 : 0), R: 1 + right * 0.35 },
  };
}
