import { describe, expect, it } from 'vitest';
import type { Position } from './formations';
import {
  __ratingCurve,
  computeOverall,
  preSeasonOdds,
  simulateSeason,
  zoneWeight,
  type OpponentSquad,
  type SquadPick,
  type SimulationResult,
} from './simulation';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const XI_POSITIONS: Position[] = [
  'ST', 'ST', 'LM', 'CDM', 'CM', 'RM', 'LB', 'CB', 'CB', 'RB', 'GK',
];

/** An XI where every player has the same rating, for isolating squad strength. */
function makeXI(rating: number): SquadPick[] {
  return XI_POSITIONS.map((position, slotIndex) => ({
    slotIndex,
    position,
    playerId: 9000 + slotIndex,
    playerName: `Player ${slotIndex} ${position}`,
    rating,
    clubName: 'Test XI',
    seasonLabel: '2025/26',
    positions: [position],
    roles: [],
  }));
}

/** Nineteen opponents of a fixed strength, so results depend only on the seed. */
function makeOpponents(rating: number): OpponentSquad[] {
  return Array.from({ length: 19 }, (_, i) => ({
    clubName: `Opponent ${i + 1}`,
    strength: rating,
    players: XI_POSITIONS.map((position, j) => ({
      id: String(j),
      name: `Opp ${i}-${j}`,
      role: position === 'GK' ? ('gk' as const)
        : ['LB', 'CB', 'RB'].includes(position) ? ('def' as const)
        : ['ST'].includes(position) ? ('att' as const)
        : ('mid' as const),
      position,
      rating,
      roles: [],
    })),
  }));
}

const SEED = 12345;

function run(userRating: number, oppRating = 80, seed = SEED): SimulationResult {
  return simulateSeason(makeXI(userRating), makeOpponents(oppRating), seed);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('simulateSeason — season shape', () => {
  const result = run(80);

  it('plays 38 gameweeks', () => {
    expect(result.gameweeks).toHaveLength(38);
  });

  it('plays ten fixtures in every gameweek', () => {
    for (const gw of result.gameweeks) {
      expect(gw.fixtures).toHaveLength(10);
    }
  });

  it('involves the user exactly once per gameweek', () => {
    for (const gw of result.gameweeks) {
      expect(gw.fixtures.filter(f => f.userInvolved)).toHaveLength(1);
    }
  });

  it('gives every team 38 matches', () => {
    expect(result.finalTable).toHaveLength(20);
    for (const row of result.finalTable) {
      expect(row.played).toBe(38);
      expect(row.won + row.drawn + row.lost).toBe(38);
    }
  });

  it('never has a team face itself', () => {
    for (const gw of result.gameweeks) {
      for (const fixture of gw.fixtures) {
        expect(fixture.home).not.toBe(fixture.away);
      }
    }
  });

  it('has every team meet every other twice, once at home', () => {
    const meetings = new Map<string, number>();
    for (const gw of result.gameweeks) {
      for (const f of gw.fixtures) {
        meetings.set(`${f.home}|${f.away}`, (meetings.get(`${f.home}|${f.away}`) ?? 0) + 1);
      }
    }
    const teams = result.finalTable.map(r => r.name);
    for (const home of teams) {
      for (const away of teams) {
        if (home === away) continue;
        expect(meetings.get(`${home}|${away}`)).toBe(1);
      }
    }
  });
});

describe('simulateSeason — table integrity', () => {
  const result = run(82);

  it('awards three points per win and one per draw', () => {
    for (const row of result.finalTable) {
      expect(row.points).toBe(row.won * 3 + row.drawn);
    }
  });

  it('computes goal difference from goals for and against', () => {
    for (const row of result.finalTable) {
      expect(row.gd).toBe(row.goalsFor - row.goalsAgainst);
    }
  });

  it('balances goals scored against goals conceded league-wide', () => {
    const scored = result.finalTable.reduce((n, r) => n + r.goalsFor, 0);
    const conceded = result.finalTable.reduce((n, r) => n + r.goalsAgainst, 0);
    expect(scored).toBe(conceded);
  });

  it('orders the table by points, then goal difference, then goals scored', () => {
    for (let i = 1; i < result.finalTable.length; i++) {
      const above = result.finalTable[i - 1];
      const below = result.finalTable[i];
      const ordered =
        above.points > below.points ||
        (above.points === below.points && above.gd > below.gd) ||
        (above.points === below.points && above.gd === below.gd && above.goalsFor >= below.goalsFor);
      expect(ordered).toBe(true);
    }
  });

  it('numbers positions 1 to 20', () => {
    expect(result.finalTable.map(r => r.position)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('reports the user row and the summary consistently', () => {
    const userRow = result.finalTable.find(r => r.isUser)!;
    expect(userRow.position).toBe(result.finalPosition);
    expect(userRow.points).toBe(result.points);
    expect(userRow.won).toBe(result.wins);
    expect(userRow.drawn).toBe(result.draws);
    expect(userRow.lost).toBe(result.losses);
    expect(userRow.goalsFor).toBe(result.goalsFor);
    expect(userRow.goalsAgainst).toBe(result.goalsAgainst);
  });

  it('has exactly one user team', () => {
    expect(result.finalTable.filter(r => r.isUser)).toHaveLength(1);
  });
});

describe('simulateSeason — determinism', () => {
  it('produces an identical season for the same seed', () => {
    expect(run(80, 80, 777)).toEqual(run(80, 80, 777));
  });

  it('produces a different season for a different seed', () => {
    const a = run(80, 80, 777);
    const b = run(80, 80, 778);
    const scoreline = (r: SimulationResult) =>
      r.gameweeks.flatMap(gw => gw.fixtures.map(f => `${f.homeGoals}-${f.awayGoals}`)).join(',');
    expect(scoreline(a)).not.toBe(scoreline(b));
  });
});

describe('simulateSeason — player attribution', () => {
  const result = run(82);

  it('accounts for every goal the user scored', () => {
    const scored = result.playerStats.reduce((n, p) => n + p.goals, 0);
    expect(scored).toBe(result.goalsFor);
  });

  it('never records more assists than goals', () => {
    const assists = result.playerStats.reduce((n, p) => n + p.assists, 0);
    expect(assists).toBeLessThanOrEqual(result.goalsFor);
  });

  it('rates every player in every match', () => {
    for (const player of result.playerStats) {
      expect(player.matchRatings).toHaveLength(38);
      for (const rating of player.matchRatings) {
        expect(rating).toBeGreaterThanOrEqual(4);
        expect(rating).toBeLessThanOrEqual(10);
      }
    }
  });

  it('keeps clean sheets within the number of matches played', () => {
    for (const player of result.playerStats) {
      expect(player.cleanSheets).toBeGreaterThanOrEqual(0);
      expect(player.cleanSheets).toBeLessThanOrEqual(38);
    }
  });

  it('gives the keeper a clean sheet for every match without conceding', () => {
    const shutouts = result.gameweeks
      .flatMap(gw => gw.fixtures.filter(f => f.userInvolved))
      .filter(f => (f.home === 'Your XI' ? f.awayGoals : f.homeGoals) === 0).length;
    const keeper = result.playerStats.find(p => p.position === 'GK')!;
    expect(keeper.cleanSheets).toBe(shutouts);
  });

  it('names a golden boot winner who scored the most', () => {
    const most = Math.max(...result.playerStats.map(p => p.goals));
    expect(result.awards.goldenBoot.goals).toBe(most);
  });

  it('only lists scorers for the user fixtures', () => {
    for (const gw of result.gameweeks) {
      for (const fixture of gw.fixtures) {
        if (!fixture.userInvolved) expect(fixture.scorers).toHaveLength(0);
      }
    }
  });

  it('lists user scorers in chronological order within the match', () => {
    for (const gw of result.gameweeks) {
      const fixture = gw.fixtures.find(f => f.userInvolved)!;
      const minutes = fixture.scorers.map(s => s.minute);
      expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
      expect(new Set(minutes).size).toBe(minutes.length);
    }
  });
});

describe('simulateSeason — squad strength matters', () => {
  // Averaged over fixed seeds, so this is deterministic but not knife-edge.
  const seeds = [11, 222, 3333, 44444, 555555, 6060, 71717, 8888];
  const average = (rating: number) =>
    seeds.reduce((total, seed) => total + run(rating, 80, seed).points, 0) / seeds.length;

  it('gives a much stronger XI more points than a much weaker one', () => {
    expect(average(90)).toBeGreaterThan(average(70));
  });

  it('is monotonic across a wide rating range', () => {
    const weak = average(72);
    const mid = average(81);
    const strong = average(90);
    expect(mid).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(mid);
  });
});

describe('simulateSeason — fictional opponents fallback', () => {
  it('still produces a full league when no opponent squads are supplied', () => {
    const result = simulateSeason(makeXI(80), [], 999);
    expect(result.finalTable).toHaveLength(20);
    expect(result.gameweeks).toHaveLength(38);
    expect(result.finalTable.every(r => r.played === 38)).toBe(true);
  });
});

describe('computeOverall', () => {
  it('averages the ratings and rounds', () => {
    expect(computeOverall(makeXI(83))).toBe(83);
  });

  it('returns zero for an empty squad', () => {
    expect(computeOverall([])).toBe(0);
  });
});

describe('zoneWeight', () => {
  it('splits every position between attack and defence', () => {
    const positions: Position[] = [
      'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST',
    ];
    for (const position of positions) {
      const { att, def } = zoneWeight(position);
      expect(att + def).toBeCloseTo(1, 5);
    }
  });

  it('weights a striker to attack and a keeper to defence', () => {
    expect(zoneWeight('ST').att).toBe(1);
    expect(zoneWeight('GK').def).toBe(1);
  });
});

describe('preSeasonOdds', () => {
  // Whether the projection matches what the simulation actually produces is
  // measured in preSeasonOdds.calibration.test.ts. These assert the properties
  // that must hold for any field, including ones the calibration never saw.

  /** A twenty-team league of the given overalls. */
  const FIELD_2025 = [86, 85, 84, 84, 83, 82, 81, 81, 80, 80, 80, 79, 79, 79, 78, 78, 77, 77, 76];
  const FIELD_WEAK = FIELD_2025.map(o => o - 6);

  it('keeps every probability within range, against any field', () => {
    for (const field of [FIELD_2025, FIELD_WEAK, []]) {
      for (let overall = 50; overall <= 99; overall++) {
        const odds = preSeasonOdds(overall, field);
        for (const value of [odds.winLeague, odds.top4, odds.top6, odds.top10, odds.relegation]) {
          expect(value, `${overall} v field of ${field.length}`).toBeGreaterThanOrEqual(0);
          expect(value, `${overall} v field of ${field.length}`).toBeLessThanOrEqual(100);
        }
        expect(odds.projectedPosition).toBeGreaterThanOrEqual(1);
        expect(odds.projectedPosition).toBeLessThanOrEqual(20);
        expect(odds.expectedPoints).toBeGreaterThanOrEqual(0);
        expect(odds.expectedPoints).toBeLessThanOrEqual(114);
      }
    }
  });

  it('nests the outcomes, since finishing top four is finishing top six', () => {
    for (let overall = 50; overall <= 99; overall++) {
      const odds = preSeasonOdds(overall, FIELD_2025);
      expect(odds.winLeague).toBeLessThanOrEqual(odds.top4 + 0.1);
      expect(odds.top4).toBeLessThanOrEqual(odds.top6 + 0.1);
      expect(odds.top6).toBeLessThanOrEqual(odds.top10 + 0.1);
      expect(odds.top10 + odds.relegation).toBeLessThanOrEqual(100.1);
    }
  });

  it('improves the projection as the squad improves', () => {
    for (let overall = 51; overall <= 99; overall++) {
      const worse  = preSeasonOdds(overall - 1, FIELD_2025);
      const better = preSeasonOdds(overall, FIELD_2025);
      expect(better.projectedPosition).toBeLessThanOrEqual(worse.projectedPosition);
      expect(better.expectedPoints).toBeGreaterThanOrEqual(worse.expectedPoints);
      expect(better.winLeague).toBeGreaterThanOrEqual(worse.winLeague);
      expect(better.relegation).toBeLessThanOrEqual(worse.relegation);
    }
  });

  it('reads the field, not just the squad', () => {
    // The same XI is a title favourite in one league and a top-four side in
    // another. The old projection could not express this at all: it was a
    // function of the squad's own rating and nothing else.
    const strong = preSeasonOdds(86, FIELD_2025);
    const weak   = preSeasonOdds(86, FIELD_WEAK);
    expect(weak.winLeague).toBeGreaterThan(strong.winLeague + 20);
    expect(weak.projectedPosition).toBeLessThanOrEqual(strong.projectedPosition);
    expect(weak.expectedPoints).toBeGreaterThan(strong.expectedPoints);
  });

  it('puts a side level with its field in mid-table', () => {
    const level = preSeasonOdds(80, new Array(19).fill(80));
    expect(level.projectedPosition).toBeGreaterThanOrEqual(9);
    expect(level.projectedPosition).toBeLessThanOrEqual(12);
    expect(level.winLeague).toBeLessThan(20);
    expect(level.relegation).toBeLessThan(25);
  });
});

describe('the rating curve', () => {
  const { RATING_CURVE, ratingScale, scaledAvgRating } = __ratingCurve;

  // ratingScale and scaledAvgRating are inverses. They once used different
  // constants — 0.032 forward, 0.055 back — which silently pulled every squad
  // 58% of the way toward 80: a squad of 90s was simulated as 85.8, and the
  // league became far more random than the ratings said it should be. These
  // tests exist so that can never happen again unnoticed.

  it('returns a uniform squad at exactly its own rating', () => {
    for (const rating of [60, 70, 75, 80, 85, 90, 95, 99]) {
      const squad = Array.from({ length: 11 }, () => ({ rating }));
      expect(scaledAvgRating(squad)).toBeCloseTo(rating, 6);
    }
  });

  it('round-trips a single player', () => {
    for (const rating of [64, 78, 91]) {
      expect(scaledAvgRating([{ rating }])).toBeCloseTo(rating, 6);
    }
  });

  it('is the true inverse of ratingScale', () => {
    for (const rating of [55, 72, 88, 97]) {
      expect(Math.log(ratingScale(rating)) / RATING_CURVE + 80).toBeCloseTo(rating, 6);
    }
  });

  it('lets the best players carry the side, so it sits above the plain mean', () => {
    // One outstanding player among ordinary ones.
    const squad = [{ rating: 95 }, ...Array.from({ length: 10 }, () => ({ rating: 75 }))];
    const plainMean = squad.reduce((n, p) => n + p.rating, 0) / squad.length;
    expect(scaledAvgRating(squad)).toBeGreaterThan(plainMean);
  });

  it('preserves the gap between two squads rather than compressing it', () => {
    const of = (rating: number) => Array.from({ length: 11 }, () => ({ rating }));
    // A 6-point difference in the data must arrive as a 6-point difference.
    expect(scaledAvgRating(of(77)) - scaledAvgRating(of(71))).toBeCloseTo(6, 6);
  });

  it('is monotonic', () => {
    const of = (rating: number) => Array.from({ length: 11 }, () => ({ rating }));
    for (let r = 50; r < 99; r++) {
      expect(scaledAvgRating(of(r + 1))).toBeGreaterThan(scaledAvgRating(of(r)));
    }
  });

  it('falls back to 70 for an empty squad', () => {
    expect(scaledAvgRating([])).toBe(70);
  });
});
