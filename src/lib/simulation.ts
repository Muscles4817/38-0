import { Position } from './formations';

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
    playerOfSeason: { name: string; goals: number; assists: number };
    leaguePlayerOfSeason: { name: string; club: string; goals: number; assists: number; isUser: boolean };
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
  position: Position;
  rating: number;
  roles?: PlayerRole[];
}

export interface OpponentSquad {
  clubName: string;
  players: OpponentPlayer[];
  strength: number;
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

// Sensible concrete position for each coarse role bucket (used in fictional fallback squads)
const ROLE_DEFAULT_POS: Record<'gk' | 'def' | 'mid' | 'att', Position> = {
  gk: 'GK', def: 'CB', mid: 'CM', att: 'ST',
};

// ── RNG helpers ───────────────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function weightedRandom(rand: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}

function poissonSample(rand: () => number, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return Math.max(0, k - 1);
}

function genName(rand: () => number): string {
  return `${INITIALS[Math.floor(rand() * INITIALS.length)]}. ${SURNAMES[Math.floor(rand() * SURNAMES.length)]}`;
}

// ── Scheduling ────────────────────────────────────────────────────────────────

// Standard circle/Berger round-robin for n teams.
// Team at index 0 is fixed; others rotate each round.
// Returns 2*(n-1) rounds, each with n/2 fixtures as [homeIdx, awayIdx] pairs.
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

// ── Fixture simulation ────────────────────────────────────────────────────────

// Midfield dominance acts as an opportunity multiplier on both teams' expected goals.
// Winning the midfield battle by 10 points gives ~20% more chances; losing gives ~20% fewer.
function simulateScore(
  rand: () => number,
  homeAtt: number, homeDef: number,
  awayAtt: number, awayDef: number,
  homeMid: number, awayMid: number,
) {
  const midDiff = (homeMid - awayMid) / 10;
  const homeMult = Math.max(0.7, Math.min(1.35, 1.0 + midDiff * 0.2));
  const awayMult = Math.max(0.7, Math.min(1.35, 1.0 - midDiff * 0.2));
  const homeDiff = (homeAtt + 3 - awayDef) / 10;
  const awayDiff = (awayAtt - homeDef) / 10;
  const lh = Math.max(0.3, (1.3 + homeDiff * 0.38) * homeMult);
  const la = Math.max(0.2, (1.0 + awayDiff * 0.30) * awayMult);
  return { homeGoals: poissonSample(rand, lh), awayGoals: poissonSample(rand, la), lh, la };
}

// ── Goal / assist weights ─────────────────────────────────────────────────────

// Positions that feed into attack and defence ratings respectively.
// CM sits in both buckets — it's a genuinely balanced role.
function isAttPosition(pos: Position): boolean {
  return ['ST','CF','LW','RW','LM','RM','CAM','CM'].includes(pos);
}
function isDefPosition(pos: Position): boolean {
  return ['GK','CB','LB','RB','LWB','RWB','CDM','CM'].includes(pos);
}
function isMidPosition(pos: Position): boolean {
  return ['CM','CDM','CAM','LM','RM'].includes(pos);
}

export function zoneWeight(pos: Position): { att: number; def: number } {
  const w: Partial<Record<Position, { att: number; def: number }>> = {
    GK:  { att: 0.00, def: 1.00 },
    CB:  { att: 0.10, def: 0.90 },
    LB:  { att: 0.20, def: 0.80 },
    RB:  { att: 0.20, def: 0.80 },
    LWB: { att: 0.30, def: 0.70 },
    RWB: { att: 0.30, def: 0.70 },
    CDM: { att: 0.30, def: 0.70 },
    CM:  { att: 0.50, def: 0.50 },
    LM:  { att: 0.60, def: 0.40 },
    RM:  { att: 0.60, def: 0.40 },
    CAM: { att: 0.70, def: 0.30 },
    LW:  { att: 0.85, def: 0.15 },
    RW:  { att: 0.85, def: 0.15 },
    CF:  { att: 0.90, def: 0.10 },
    ST:  { att: 1.00, def: 0.00 },
  };
  return w[pos] ?? { att: 0.50, def: 0.50 };
}

// Averages ratings in exponential space then inverts back to rating units.
// A 90-rated player raises the effective mean more than a 70-rated one lowers it,
// so elite players carry a team beyond what a raw average would suggest.
function scaledAvgRating(players: { rating: number }[]): number {
  if (players.length === 0) return 70;
  const avgScale = players.reduce((s, p) => s + ratingScale(p.rating), 0) / players.length;
  return Math.log(avgScale) / 0.055 + 80;
}

// Rating scales contribution to goals/assists with an exponential curve.
// Each 5-point band adds ~28% more than the previous band, so 85→90 is a much bigger
// jump than 75→80. This prevents a mediocre striker from matching elite players just by
// holding a high-multiplier role (e.g. Poacher).
function ratingScale(rating: number): number {
  return Math.exp(0.032 * (rating - 80));
}

function posGoalWeight(pos: Position): number {
  const w: Partial<Record<Position, number>> = {
    ST: 20, CF: 16, CAM: 12, LW: 10, RW: 10, LM: 6, RM: 6,
    CM: 4, CDM: 2, CB: 1, LB: 1, RB: 1, LWB: 1, RWB: 1, GK: 0,
  };
  return w[pos] ?? 1;
}

function posAssistWeight(pos: Position): number {
  const w: Partial<Record<Position, number>> = {
    CAM: 25, LM: 18, RM: 18, LW: 16, RW: 16, CM: 12,
    ST: 8, CF: 8, CDM: 5, LB: 4, RB: 4, CB: 1, GK: 0,
  };
  return w[pos] ?? 2;
}


function applyRoleMults(base: number, mults: number[]): number {
  const suppressors = mults.filter(m => m < 1);
  const boosters    = mults.filter(m => m > 1);
  const suppressed  = suppressors.reduce((a, b) => a * b, 1);
  const boosted     = boosters.length > 0 ? Math.max(...boosters) : 1;
  return base * suppressed * boosted;
}


// Sums role team-strength contributions across a set of players.
// Each active role adds (contribution × player_rating/80) to the relevant bucket.
// Position-locking uses the same validPos map as goal/assist weights.
function roleStrBonus(
  players: { position: Position; roles?: PlayerRole[]; rating: number }[],
  contrib: Partial<Record<PlayerRole, { att: number; mid: number; def: number }>>,
  validPos: Partial<Record<PlayerRole, Position[]>>,
): { att: number; mid: number; def: number } {
  let att = 0, mid = 0, def = 0;
  for (const p of players) {
    for (const r of p.roles ?? []) {
      const vp = validPos[r];
      if (vp && !vp.includes(p.position)) continue;
      const c = contrib[r];
      if (!c) continue;
      const scale = p.rating / 80;
      att += c.att * scale;
      mid += c.mid * scale;
      def += c.def * scale;
    }
  }
  return { att, mid, def };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeOverall(picks: SquadPick[]): number {
  if (picks.length === 0) return 0;
  return Math.round(picks.reduce((s, p) => s + p.rating, 0) / picks.length);
}

export function preSeasonOdds(overall: number) {
  // Calibrated for real PL squad ratings (avg XI typically 76–86 OVR).
  // 79 OVR ≈ 9th/mid-table, 85 OVR ≈ 2nd/title contender, 90 OVR ≈ 1st.
  const pos = Math.max(1,  Math.min(20,  Math.round(115 - overall * 1.33)));
  const ep  = Math.max(20, Math.min(105, Math.round(50 + (overall - 79) * 3.7)));
  return {
    projectedPosition: pos,
    expectedPoints:    ep,
    winLeague:    Math.max(0.1, Math.min(99, Math.round((overall - 76) * 5))),
    top4:         Math.max(1,   Math.min(99, Math.round((overall - 72) * 5))),
    top6:         Math.max(2,   Math.min(99, Math.round((overall - 70) * 6))),
    top10:        Math.max(10,  Math.min(99, Math.round((overall - 66) * 6))),
    relegation:   Math.max(0.1, Math.min(70, Math.round((83 - overall) * 4))),
  };
}

export function simulateSeason(
  picks: SquadPick[],
  opponentSquads: OpponentSquad[] = [],
  seed?: number,
  roleConfig?: RoleConfig,
): SimulationResult {
  const rand = rng(seed ?? Date.now() % 999983);
  const USER = 'Your XI';

  const effectiveGoalMult:    Partial<Record<string, number>>                              = { ...ROLE_GOAL_MULT,       ...(roleConfig?.goalMult      ?? {}) };
  const effectiveAssistMult:  Partial<Record<string, number>>                              = { ...ROLE_ASSIST_MULT,     ...(roleConfig?.assistMult    ?? {}) };
  const effectiveValidPos:    Partial<Record<string, Position[]>>                          = { ...ROLE_VALID_POSITIONS,  ...(roleConfig?.validPositions ?? {}) };
  const effectiveTeamContrib: Partial<Record<string, { att: number; mid: number; def: number }>> = roleConfig?.teamContrib ?? {};

  const gw = (pos: Position, roles: PlayerRole[] = [], rating = 80) => {
    const active = roles.filter(r => { const v = effectiveValidPos[r]; return !v || v.includes(pos); });
    return applyRoleMults(posGoalWeight(pos), active.map(r => effectiveGoalMult[r] ?? 1)) * ratingScale(rating);
  };
  const aw = (pos: Position, roles: PlayerRole[] = [], rating = 80) => {
    const active = roles.filter(r => { const v = effectiveValidPos[r]; return !v || v.includes(pos); });
    return applyRoleMults(posAssistWeight(pos), active.map(r => effectiveAssistMult[r] ?? 1)) * ratingScale(rating);
  };

  const useRealSquads = opponentSquads.length > 0;

  // ── 20 teams: user + 19 opponents ──────────────────────────────────────────
  const oppNames = useRealSquads ? opponentSquads.map(s => s.clubName) : PL_OPPONENTS;
  const teams = [USER, ...oppNames];
  const n     = teams.length;

  // ── Attack / defence ratings per team ──────────────────────────────────────
  // Each team has separate att and def strengths so that shape matters:
  // a high-press side with weak defenders scores lots but leaks too.
  const attStr = new Map<string, number>();
  const defStr = new Map<string, number>();
  const midStr = new Map<string, number>();

  const userBonus = roleStrBonus(picks, effectiveTeamContrib, effectiveValidPos);
  attStr.set(USER, scaledAvgRating(picks.filter(p => isAttPosition(p.position))) + userBonus.att);
  defStr.set(USER, scaledAvgRating(picks.filter(p => isDefPosition(p.position))) + userBonus.def);
  midStr.set(USER, scaledAvgRating(picks.filter(p => isMidPosition(p.position))) + userBonus.mid);

  // ── Squad representation for player attribution ─────────────────────────────
  interface FPLayer { id: string; name: string; team: string; role: string; position: Position; roles: PlayerRole[]; rating: number }
  const teamSquads = new Map<string, FPLayer[]>();

  if (useRealSquads) {
    for (const sq of opponentSquads) {
      const oppBonus = roleStrBonus(sq.players, effectiveTeamContrib, effectiveValidPos);
      attStr.set(sq.clubName, scaledAvgRating(sq.players.filter(p => isAttPosition(p.position))) + oppBonus.att);
      defStr.set(sq.clubName, scaledAvgRating(sq.players.filter(p => isDefPosition(p.position))) + oppBonus.def);
      midStr.set(sq.clubName, scaledAvgRating(sq.players.filter(p => isMidPosition(p.position))) + oppBonus.mid);
      teamSquads.set(sq.clubName, sq.players.map(p => ({
        id: `${sq.clubName}-${p.id}`, name: p.name, team: sq.clubName,
        role: p.role, position: p.position, roles: p.roles ?? [], rating: p.rating,
      })));
    }
  } else {
    const ROLES: ('gk' | 'def' | 'mid' | 'att')[] = ['gk', 'def', 'def', 'mid', 'mid', 'att', 'att'];
    for (const opp of PL_OPPONENTS) {
      const teamRating = 62 + rand() * 28;
      attStr.set(opp, teamRating);
      defStr.set(opp, teamRating);
      midStr.set(opp, teamRating);
      teamSquads.set(opp, ROLES.map((role, i) => ({
        id: `${opp}-${i}`, name: genName(rand), team: opp,
        role, position: ROLE_DEFAULT_POS[role], roles: [], rating: Math.round(teamRating),
      })));
    }
  }

  // ── Stats tracking ──────────────────────────────────────────────────────────
  const uStats = new Map<number, PlayerStats>();
  for (const p of picks) {
    uStats.set(p.playerId, { playerId: p.playerId, playerName: p.playerName, position: p.position, rating: p.rating, goals: 0, assists: 0, cleanSheets: 0, matchRatings: [], avgMatchRating: 0 });
  }

  const fStats = new Map<string, { name: string; team: string; role: string; goals: number; assists: number; cleanSheets: number }>();
  for (const [, squad] of teamSquads) {
    for (const p of squad) fStats.set(p.id, { name: p.name, team: p.team, role: p.role, goals: 0, assists: 0, cleanSheets: 0 });
  }

  // ── Per-player weights (position × role multipliers) ───────────────────────
  const uGoalW   = picks.map(p => gw(p.position, p.roles, p.rating));
  const uAssistW = picks.map(p => aw(p.position, p.roles, p.rating));

  function pickUserScorer() { return picks[weightedRandom(rand, uGoalW)]; }
  function pickUserAssister(excludeId?: number) {
    const w = uAssistW.map((wt, i) => picks[i].playerId === excludeId ? 0 : wt);
    return picks[weightedRandom(rand, w)];
  }

  function pickFictionalScorer(squad: FPLayer[]) {
    return squad[weightedRandom(rand, squad.map(p => gw(p.position, p.roles, p.rating)))];
  }
  function pickFictionalAssister(squad: FPLayer[], excludeId: string) {
    return squad[weightedRandom(rand, squad.map(p => p.id === excludeId ? 0 : aw(p.position, p.roles, p.rating)))];
  }

  // ── Standings ───────────────────────────────────────────────────────────────
  const standings = new Map<string, MutableStanding>();
  for (const t of teams) {
    const isUser = t === USER;
    const ovr = isUser ? computeOverall(picks) : Math.round(opponentSquads.find(s => s.clubName === t)?.strength ?? 75);
    const att = Math.round(attStr.get(t) ?? 70);
    const def = Math.round(defStr.get(t) ?? 70);
    const mid = Math.round(midStr.get(t) ?? 70);
    standings.set(t, initStanding(t, isUser, ovr, att, def, mid));
  }

  // ── Schedule ────────────────────────────────────────────────────────────────
  const schedule = buildSchedule(n); // 38 rounds × 10 fixtures

  // ── Simulate ────────────────────────────────────────────────────────────────
  const gameweeks: Gameweek[] = [];

  for (let r = 0; r < schedule.length; r++) {
    const fixtures: FixtureResult[] = [];

    for (const [hi, ai] of schedule[r]) {
      const homeTeam = teams[hi];
      const awayTeam = teams[ai];
      const { homeGoals, awayGoals, lh, la } = simulateScore(
        rand,
        attStr.get(homeTeam)!, defStr.get(homeTeam)!,
        attStr.get(awayTeam)!, defStr.get(awayTeam)!,
        midStr.get(homeTeam)!, midStr.get(awayTeam)!,
      );

      const userInvolved = homeTeam === USER || awayTeam === USER;
      const scorers: { name: string; minute: number }[] = [];
      const usedMins = new Set<number>();
      const pgGoals   = new Map<number, number>();
      const pgAssists = new Map<number, number>();

      for (const [teamName, teamGoals, isHome] of [
        [homeTeam, homeGoals, true],
        [awayTeam, awayGoals, false],
      ] as [string, number, boolean][]) {
        for (let g = 0; g < teamGoals; g++) {
          if (teamName === USER) {
            const scorer   = pickUserScorer();
            const assister = rand() < 0.75 ? pickUserAssister(scorer.playerId) : null;
            let min: number;
            do { min = 1 + Math.floor(rand() * 90); } while (usedMins.has(min));
            usedMins.add(min);
            uStats.get(scorer.playerId)!.goals++;
            pgGoals.set(scorer.playerId, (pgGoals.get(scorer.playerId) ?? 0) + 1);
            if (assister) {
              uStats.get(assister.playerId)!.assists++;
              pgAssists.set(assister.playerId, (pgAssists.get(assister.playerId) ?? 0) + 1);
            }
            scorers.push({ name: scorer.playerName.split(' ').pop()!, minute: min });
          } else {
            const squad    = teamSquads.get(teamName)!;
            const scorer   = pickFictionalScorer(squad);
            const assister = rand() < 0.75 ? pickFictionalAssister(squad, scorer.id) : null;
            fStats.get(scorer.id)!.goals++;
            if (assister) fStats.get(assister.id)!.assists++;
          }
          void isHome;
        }
      }

      // Clean sheets
      if (homeGoals === 0) {
        if (awayTeam === USER) {
          const gk  = picks.find(p => p.position === 'GK');
          const def = picks.filter(p => ['CB','LB','RB','LWB','RWB'].includes(p.position));
          if (gk) uStats.get(gk.playerId)!.cleanSheets++;
          for (const d of def) uStats.get(d.playerId)!.cleanSheets++;
        } else {
          const squad = teamSquads.get(awayTeam)!;
          const gk = squad.find(p => p.role === 'gk');
          if (gk) fStats.get(gk.id)!.cleanSheets++;
        }
      }
      if (awayGoals === 0) {
        if (homeTeam === USER) {
          const gk  = picks.find(p => p.position === 'GK');
          const def = picks.filter(p => ['CB','LB','RB','LWB','RWB'].includes(p.position));
          if (gk) uStats.get(gk.playerId)!.cleanSheets++;
          for (const d of def) uStats.get(d.playerId)!.cleanSheets++;
        } else {
          const squad = teamSquads.get(homeTeam)!;
          const gk = squad.find(p => p.role === 'gk');
          if (gk) fStats.get(gk.id)!.cleanSheets++;
        }
      }

      applyResult(standings.get(homeTeam)!, homeGoals, awayGoals);
      applyResult(standings.get(awayTeam)!, awayGoals, homeGoals);

      if (userInvolved) {
        const uIsHome = homeTeam === USER;
        const userGF  = uIsHome ? homeGoals : awayGoals;
        const oppGF   = uIsHome ? awayGoals : homeGoals;
        const expUser = uIsHome ? lh : la;
        const expOpp  = uIsHome ? la : lh;
        const attZone = userGF - expUser;
        const defZone = expOpp - oppGF;
        const resultMod = userGF > oppGF ? 1.5 : userGF === oppGF ? 0 : -1.0;
        for (const p of picks) {
          const g  = pgGoals.get(p.playerId) ?? 0;
          const a  = pgAssists.get(p.playerId) ?? 0;
          const zw = zoneWeight(p.position);
          const zoneMod = (attZone * zw.att + defZone * zw.def) * 0.5;
          const raw = 6.5 + resultMod + g + a * 0.7 + zoneMod;
          uStats.get(p.playerId)!.matchRatings.push(
            parseFloat(Math.max(4.0, Math.min(10.0, raw)).toFixed(1))
          );
        }
        scorers.sort((a, b) => a.minute - b.minute);
      }
      fixtures.push({ home: homeTeam, away: awayTeam, homeGoals, awayGoals, userInvolved, scorers: userInvolved ? scorers : [] });
    }

    gameweeks.push({ week: r + 1, fixtures, tableSnapshot: sortedTable(standings) });
  }

  // ── Season-average match ratings ────────────────────────────────────────────
  for (const stats of uStats.values()) {
    const r = stats.matchRatings;
    stats.avgMatchRating = r.length
      ? parseFloat((r.reduce((a, b) => a + b, 0) / r.length).toFixed(1))
      : 6.5;
  }

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

  // ── Awards (user squad) ─────────────────────────────────────────────────────
  const statsArr = [...uStats.values()];
  const topScorer  = statsArr.reduce((a, b) => a.goals > b.goals ? a : b);
  const topAssist  = statsArr.reduce((a, b) => a.assists > b.assists ? a : b);
  const topGKs     = statsArr.filter(s => s.position === 'GK');
  const topGK      = topGKs.length ? topGKs.reduce((a, b) => a.cleanSheets > b.cleanSheets ? a : b) : statsArr[0];
  const pots       = statsArr.reduce((a, b) => (a.goals + a.assists * 0.7) > (b.goals + b.assists * 0.7) ? a : b);

  // ── League Player of the Season ────────────────────────────────────────────
  const allOutfield = [
    ...statsArr.filter(s => s.position !== 'GK').map(s => ({
      name: s.playerName, club: USER, goals: s.goals, assists: s.assists, isUser: true,
    })),
    ...[...fStats.values()].filter(s => s.role !== 'gk').map(s => ({
      name: s.name, club: s.team, goals: s.goals, assists: s.assists, isUser: false,
    })),
  ];
  const leaguePots = allOutfield.length > 0
    ? allOutfield.reduce((a, b) => (a.goals + a.assists * 0.7) >= (b.goals + b.assists * 0.7) ? a : b)
    : { name: '—', club: '—', goals: 0, assists: 0, isUser: false };

  // ── League leaderboards ─────────────────────────────────────────────────────
  const topScorers: LeagueEntry[] = [
    ...statsArr.filter(s => s.goals > 0).map(s => ({ playerName: s.playerName, clubName: USER, value: s.goals, isUser: true })),
    ...[...fStats.values()].filter(s => s.goals > 0).map(s => ({ playerName: s.name, clubName: s.team, value: s.goals, isUser: false })),
  ].sort((a, b) => b.value - a.value).slice(0, 20);

  const topAssisters: LeagueEntry[] = [
    ...statsArr.filter(s => s.assists > 0).map(s => ({ playerName: s.playerName, clubName: USER, value: s.assists, isUser: true })),
    ...[...fStats.values()].filter(s => s.assists > 0).map(s => ({ playerName: s.name, clubName: s.team, value: s.assists, isUser: false })),
  ].sort((a, b) => b.value - a.value).slice(0, 20);

  const topKeepers: LeagueEntry[] = [
    ...statsArr.filter(s => s.position === 'GK' && s.cleanSheets > 0).map(s => ({ playerName: s.playerName, clubName: USER, value: s.cleanSheets, isUser: true })),
    ...[...fStats.values()].filter(s => s.role === 'gk' && s.cleanSheets > 0).map(s => ({ playerName: s.name, clubName: s.team, value: s.cleanSheets, isUser: false })),
  ].sort((a, b) => b.value - a.value).slice(0, 20);

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
      playerOfSeason: { name: pots.playerName, goals: pots.goals, assists: pots.assists },
      leaguePlayerOfSeason: { name: leaguePots.name, club: leaguePots.club, goals: leaguePots.goals, assists: leaguePots.assists, isUser: leaguePots.isUser },
    },
    longestWinStreak: maxStreak,
    biggestWin:       biggestWinStr,
    highestScoring:   highestScoringStr,
    narrative:        buildNarrative(finalPosition, userRow.points, userRow.won, userRow.drawn, userRow.lost),
    topScorers,
    topAssisters,
    topKeepers,
  };
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
