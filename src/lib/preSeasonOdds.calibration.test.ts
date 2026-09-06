// Does the projection match the season it is projecting?
//
// `preSeasonOdds` is a model of `simulateSeason`, fitted to it. A model fitted
// to something that then changes is worse than no model, and that is exactly
// what went wrong with the version this replaced: it promised an 88-rated XI a
// title 60% of the time when the simulation delivered 23%, and nothing failed.
//
// So this test plays real seasons and checks the projection against them. It is
// the only test in the suite that is allowed to be slow, and it is the one that
// fails if either side drifts from the other.
//
// If it fails after a deliberate change to the simulation, that is the model
// being out of date, not the test being wrong: re-fit the constants at the top
// of the pre-season odds section in simulation.ts and record the new numbers in
// docs/simulation.md.

import { describe, expect, it } from 'vitest';
import { getOpponentSquads, listCompetitions } from './gameData';
import { preSeasonOdds, simulateSeason, type SquadPick } from './simulation';
import type { Position } from './formations';

const XI_POSITIONS: Position[] = ['ST','ST','LM','CDM','CM','RM','LB','CB','CB','RB','GK'];

/** An XI where every player has the same rating, so only strength varies. */
function makeXI(rating: number): SquadPick[] {
  return XI_POSITIONS.map((position, slotIndex) => ({
    slotIndex, position,
    playerId: 9000 + slotIndex,
    playerName: `Player ${slotIndex}`,
    rating,
    clubName: 'Test XI', seasonLabel: '2025/26',
    positions: [position], roles: [],
  }));
}

// Enough seasons that a probability is worth comparing, few enough that the
// suite stays usable. At 60 runs a measured percentage carries about ±6 points
// of sampling error of its own, which is why the tolerances below are not
// tighter than they are.
const SEEDS = 60;

interface Played {
  meanPosition: number;
  meanPoints: number;
  title: number;
  top4: number;
  top10: number;
  relegation: number;
}

function playSeasons(overall: number, seasonLabel: string): { played: Played; field: number[] } {
  const competition = listCompetitions().find(c => c.seasonLabel === seasonLabel);
  if (!competition) throw new Error(`${seasonLabel} cannot field a league`);
  const opponents = getOpponentSquads(competition.seasonId, competition.league);
  const picks = makeXI(overall);

  const runs = Array.from({ length: SEEDS }, (_, s) =>
    simulateSeason(picks, opponents, 5000 + s * 101));

  const share = (f: (r: (typeof runs)[number]) => boolean) =>
    (100 * runs.filter(f).length) / runs.length;
  const mean = (f: (r: (typeof runs)[number]) => number) =>
    runs.reduce((sum, r) => sum + f(r), 0) / runs.length;

  return {
    field: opponents.map(o => o.strength),
    played: {
      meanPosition: mean(r => r.finalPosition),
      meanPoints:   mean(r => r.points),
      title:        share(r => r.finalPosition === 1),
      top4:         share(r => r.finalPosition <= 4),
      top10:        share(r => r.finalPosition <= 10),
      relegation:   share(r => r.finalPosition >= 18),
    },
  };
}

describe('the projection against the season it projects', () => {
  // Three fields and four strengths: a squad that should go down, one that
  // should be mid-table, one that should challenge, and one that should walk it.
  const CASES: { overall: number; season: string }[] = [
    { overall: 74, season: '2025/26' },
    { overall: 82, season: '2025/26' },
    { overall: 86, season: '2025/26' },
    { overall: 90, season: '2025/26' },
    { overall: 78, season: '2003/04' },
    { overall: 86, season: '2003/04' },
    { overall: 74, season: '1992/93' },
    { overall: 82, season: '1992/93' },
  ];

  for (const { overall, season } of CASES) {
    it(`projects a ${overall}-rated XI in ${season}`, () => {
      const { played, field } = playSeasons(overall, season);
      const odds = preSeasonOdds(overall, field);

      // Points: the projection is a mean, so it should sit close to one.
      expect(Math.abs(odds.expectedPoints - played.meanPoints),
        `expected ${odds.expectedPoints} points, played ${played.meanPoints.toFixed(1)}`)
        .toBeLessThanOrEqual(6);

      // Finish: within a place and a half of where the XI actually finishes.
      expect(Math.abs(odds.projectedPosition - played.meanPosition),
        `projected ${odds.projectedPosition}th, finished ${played.meanPosition.toFixed(1)}th`)
        .toBeLessThanOrEqual(1.5);

      // Probabilities: within 15 points, of which about 6 is the sampling error
      // in the measurement itself.
      const within = (name: string, projected: number, measured: number) =>
        expect(Math.abs(projected - measured),
          `${name}: projected ${projected}%, happened ${measured.toFixed(0)}%`)
          .toBeLessThanOrEqual(15);

      within('title',      odds.winLeague,  played.title);
      within('top 4',      odds.top4,       played.top4);
      within('top 10',     odds.top10,      played.top10);
      within('relegation', odds.relegation, played.relegation);
    }, 60000);
  }

  it('does not flatter a squad the way the old projection did', () => {
    // The case recorded in known-issues.md: an 88-rated XI was told 1st on 83
    // points with a 60% title chance, and actually averaged 4.9th and 63 points
    // with 23% titles. Whatever the simulation now does, the projection has to
    // agree with it.
    const { played, field } = playSeasons(88, '2025/26');
    const odds = preSeasonOdds(88, field);

    expect(Math.abs(odds.winLeague - played.title)).toBeLessThanOrEqual(15);
    expect(Math.abs(odds.projectedPosition - played.meanPosition)).toBeLessThanOrEqual(1.5);
  }, 60000);
});
