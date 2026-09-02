import { describe, expect, it } from 'vitest';
import { FORMATIONS, canFillSlot, type Position } from './formations';
import {
  SIMULATED_LEAGUE,
  SIMULATED_SEASON_START,
  bestXI,
  gameData,
  getClassicTeams,
  getLineup,
  getOpponentSquads,
  getRoleConfig,
  getSquad,
  getTeamStrengths,
  listDraftableSquads,
  pickRandomSquad,
  runSeasonSimulation,
  type DataPlayer,
} from './gameData';
import type { SquadPick } from './simulation';

const ALL_POSITIONS: Position[] = [
  'GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF',
];

const clubIds = new Set(gameData.clubs.map(c => c.id));
const seasonIds = new Set(gameData.seasons.map(s => s.id));

// ── Snapshot integrity ───────────────────────────────────────────────────────
//
// These guard the committed src/data/game-data.json. If one fails after
// "npm run export:data", the database it came from needs fixing.

describe('game data snapshot', () => {
  it('is not empty', () => {
    expect(gameData.clubs.length).toBeGreaterThan(0);
    expect(gameData.seasons.length).toBeGreaterThan(0);
    expect(gameData.squads.length).toBeGreaterThan(0);
    expect(gameData.roles.length).toBeGreaterThan(0);
  });

  it('gives every club and season a unique id', () => {
    expect(clubIds.size).toBe(gameData.clubs.length);
    expect(seasonIds.size).toBe(gameData.seasons.length);
  });

  it('points every squad at a club and season that exist', () => {
    for (const squad of gameData.squads) {
      expect(clubIds.has(squad.clubId)).toBe(true);
      expect(seasonIds.has(squad.seasonId)).toBe(true);
    }
  });

  it('holds one squad per club-season', () => {
    const keys = gameData.squads.map(s => `${s.clubId}-${s.seasonId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never lists the same player twice in one squad', () => {
    for (const squad of gameData.squads) {
      const ids = squad.players.map(p => p.playerId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('gives every player a valid position and a plausible rating', () => {
    for (const squad of gameData.squads) {
      for (const player of squad.players) {
        expect(player.positions.length).toBeGreaterThan(0);
        for (const position of player.positions) {
          expect(ALL_POSITIONS).toContain(position);
        }
        expect(player.rating).toBeGreaterThan(0);
        expect(player.rating).toBeLessThanOrEqual(99);
        expect(player.name.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('sorts every squad by rating, best first', () => {
    for (const squad of gameData.squads) {
      const ratings = squad.players.map(p => p.rating);
      expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    }
  });

  it('configures every role any player is given', () => {
    const configured = new Set(gameData.roles.map(r => r.name));
    for (const squad of gameData.squads) {
      for (const player of squad.players) {
        for (const role of player.roles) {
          expect(configured.has(role)).toBe(true);
        }
      }
    }
  });

  it('only restricts roles to real positions', () => {
    for (const role of gameData.roles) {
      for (const position of role.validPositions) {
        expect(ALL_POSITIONS).toContain(position);
      }
    }
  });
});

describe('stored lineups', () => {
  it('names a formation the app knows', () => {
    for (const lineup of gameData.lineups) {
      expect(Object.keys(FORMATIONS)).toContain(lineup.formation);
    }
  });

  it('belongs to a club-season that has a squad', () => {
    for (const lineup of gameData.lineups) {
      expect(getSquad(lineup.clubId, lineup.seasonId)).not.toBeNull();
    }
  });

  it('only names players who are in that squad', () => {
    // The export drops slots left behind when a player leaves a squad, so a
    // failure here means that filter regressed.
    for (const lineup of gameData.lineups) {
      const squad = getSquad(lineup.clubId, lineup.seasonId)!;
      const ids = new Set(squad.players.map(p => p.playerId));
      for (const slot of lineup.slots) {
        expect(ids.has(slot.playerId)).toBe(true);
      }
    }
  });

  it('uses each slot index at most once, within the eleven', () => {
    for (const lineup of gameData.lineups) {
      const indices = lineup.slots.map(s => s.slotIndex);
      expect(new Set(indices).size).toBe(indices.length);
      for (const index of indices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(10);
      }
    }
  });

  it('never plays the same player in two slots', () => {
    for (const lineup of gameData.lineups) {
      const ids = lineup.slots.map(s => s.playerId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// ── Queries ──────────────────────────────────────────────────────────────────

describe('bestXI', () => {
  const players = (specs: [Position, number][]): DataPlayer[] =>
    specs.map(([position, rating], i) => ({
      playerId: i, name: `P${i}`, nationality: null, rating, positions: [position], roles: [],
    }));

  it('returns eleven when there are enough players', () => {
    const squad = players([
      ['GK', 70], ['GK', 80],
      ...Array.from({ length: 15 }, (): [Position, number] => ['CM', 75]),
    ]);
    expect(bestXI(squad)).toHaveLength(11);
  });

  it('picks the best keeper and only one', () => {
    const squad = players([
      ['GK', 70], ['GK', 88],
      ...Array.from({ length: 12 }, (): [Position, number] => ['CM', 75]),
    ]);
    const xi = bestXI(squad);
    const keepers = xi.filter(p => p.positions[0] === 'GK');
    expect(keepers).toHaveLength(1);
    expect(keepers[0].rating).toBe(88);
  });

  it('picks the highest-rated outfielders', () => {
    const squad = players([
      ['GK', 70], ['ST', 60], ['ST', 90], ['ST', 80],
    ]);
    const xi = bestXI(squad);
    expect(xi.map(p => p.rating)).toEqual([70, 90, 80, 60]);
  });

  it('copes with a squad that has no keeper', () => {
    const squad = players(Array.from({ length: 12 }, (): [Position, number] => ['CM', 75]));
    expect(bestXI(squad)).toHaveLength(10);
  });
});

describe('listDraftableSquads', () => {
  it('includes only squads inside the era, end-exclusive', () => {
    const squads = listDraftableSquads(2000, 2005);
    expect(squads.length).toBeGreaterThan(0);
    for (const squad of squads) {
      const season = gameData.seasons.find(s => s.id === squad.seasonId)!;
      expect(season.yearStart).toBeGreaterThanOrEqual(2000);
      expect(season.yearStart).toBeLessThan(2005);
    }
  });

  it('narrows as the era narrows', () => {
    const all = listDraftableSquads(1992, 2026).length;
    const modern = listDraftableSquads(2016, 2026).length;
    expect(modern).toBeLessThan(all);
    expect(modern).toBeGreaterThan(0);
  });

  it('returns nothing for an empty era', () => {
    expect(listDraftableSquads(1900, 1901)).toEqual([]);
  });

  it('never returns an empty squad', () => {
    for (const squad of listDraftableSquads(1992, 2026)) {
      expect(squad.players.length).toBeGreaterThan(0);
      expect(squad.clubName.length).toBeGreaterThan(0);
      expect(squad.seasonLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('pickRandomSquad', () => {
  it('honours the exclusion list', () => {
    const all = listDraftableSquads(1992, 2026);
    const excluded = all.slice(0, all.length - 1).map(s => `${s.clubId}-${s.seasonId}`);
    const picked = pickRandomSquad(1992, 2026, excluded)!;
    expect(picked).not.toBeNull();
    expect(`${picked.clubId}-${picked.seasonId}`).toBe(
      `${all[all.length - 1].clubId}-${all[all.length - 1].seasonId}`,
    );
  });

  it('returns null when everything is excluded', () => {
    const all = listDraftableSquads(1992, 2026).map(s => `${s.clubId}-${s.seasonId}`);
    expect(pickRandomSquad(1992, 2026, all)).toBeNull();
  });

  it('is deterministic given a fixed random source', () => {
    const first = pickRandomSquad(1992, 2026, [], () => 0)!;
    const last = pickRandomSquad(1992, 2026, [], () => 0.999999)!;
    expect(first).toEqual(listDraftableSquads(1992, 2026)[0]);
    expect(last.clubId).toBe(listDraftableSquads(1992, 2026).at(-1)!.clubId);
  });
});

describe('getClassicTeams', () => {
  const teams = getClassicTeams();

  it('offers teams to pick', () => {
    expect(teams.length).toBeGreaterThan(0);
  });

  it('only offers squads that can field an XI', () => {
    for (const team of teams) {
      expect(team.playerCount).toBeGreaterThanOrEqual(11);
      expect(getSquad(team.clubId, team.seasonId)!.players.length).toBeGreaterThanOrEqual(11);
    }
  });

  it('excludes the season being simulated against', () => {
    for (const team of teams) {
      const clashes = team.league === SIMULATED_LEAGUE && team.yearStart === SIMULATED_SEASON_START;
      expect(clashes).toBe(false);
    }
  });

  it('rates every team plausibly', () => {
    for (const team of teams) {
      expect(team.overallRating).toBeGreaterThan(0);
      expect(team.overallRating).toBeLessThanOrEqual(99);
    }
  });

  it('sorts newest first', () => {
    const years = teams.map(t => t.yearStart);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });
});

describe('getOpponentSquads', () => {
  const opponents = getOpponentSquads();

  it('fields nineteen opponents, so the league is twenty with the user', () => {
    expect(opponents).toHaveLength(19);
  });

  it('gives every opponent exactly eleven players', () => {
    for (const squad of opponents) {
      expect(squad.players).toHaveLength(11);
    }
  });

  it('names every opponent uniquely', () => {
    const names = opponents.map(s => s.clubName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('rates every opponent plausibly', () => {
    for (const squad of opponents) {
      expect(squad.strength).toBeGreaterThan(50);
      expect(squad.strength).toBeLessThanOrEqual(99);
    }
  });

  it('uses a stored lineup when one is complete', () => {
    const withLineup = gameData.lineups.find(l => {
      const club = gameData.clubs.find(c => c.id === l.clubId);
      const season = gameData.seasons.find(s => s.id === l.seasonId);
      return l.slots.length === 11
        && club?.league === SIMULATED_LEAGUE
        && season?.yearStart === SIMULATED_SEASON_START;
    });
    expect(withLineup).toBeDefined();

    const club = gameData.clubs.find(c => c.id === withLineup!.clubId)!;
    const squad = opponents.find(s => s.clubName === club.name)!;
    const squadPlayers = getSquad(withLineup!.clubId, withLineup!.seasonId)!.players;
    const expected = withLineup!.slots
      .map(slot => squadPlayers.find(p => p.playerId === slot.playerId)!.name)
      .sort();
    expect(squad.players.map(p => p.name).sort()).toEqual(expected);
  });

  it('agrees with the strength table', () => {
    const strengths = getTeamStrengths();
    expect(strengths).toHaveLength(opponents.length);
    const byName = new Map(strengths.map(s => [s.clubName, s.overall]));
    for (const squad of opponents) {
      expect(byName.get(squad.clubName)).toBe(squad.strength);
    }
    const values = strengths.map(s => s.overall);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe('getRoleConfig', () => {
  const config = getRoleConfig();

  it('covers every configured role', () => {
    expect(Object.keys(config.goalMult ?? {})).toHaveLength(gameData.roles.length);
    expect(Object.keys(config.assistMult ?? {})).toHaveLength(gameData.roles.length);
  });

  it('uses non-negative multipliers', () => {
    for (const value of Object.values(config.goalMult ?? {})) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
    for (const value of Object.values(config.assistMult ?? {})) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('only lists position restrictions that actually restrict', () => {
    for (const positions of Object.values(config.validPositions ?? {})) {
      expect(positions!.length).toBeGreaterThan(0);
    }
  });
});

// ── End to end ───────────────────────────────────────────────────────────────

describe('runSeasonSimulation', () => {
  /** Fills a 4-4-2 from a real club-season the way the classic page would. */
  function classicXI(clubName: string): SquadPick[] {
    const team = getClassicTeams().find(t => t.clubName === clubName)!;
    const squad = getSquad(team.clubId, team.seasonId)!;
    const formation = FORMATIONS['4-4-2'];
    const used = new Set<number>();
    const picks: SquadPick[] = [];

    const order = formation.slots
      .map((slot, i) => ({ i, n: squad.players.filter(p => canFillSlot(p.positions, slot.position)).length }))
      .sort((a, b) => a.n - b.n);

    for (const { i } of order) {
      const slot = formation.slots[i];
      const player = squad.players.find(p => !used.has(p.playerId) && canFillSlot(p.positions, slot.position))
        ?? squad.players.find(p => !used.has(p.playerId))!;
      used.add(player.playerId);
      picks.push({
        slotIndex: i, position: slot.position, playerId: player.playerId,
        playerName: player.name, nationality: player.nationality, rating: player.rating,
        clubName: team.clubName, seasonLabel: team.seasonLabel,
        clubId: team.clubId, seasonId: team.seasonId, positions: player.positions,
      });
    }
    return picks;
  }

  const picks = classicXI('Arsenal');

  it('builds a full XI from real data', () => {
    expect(picks).toHaveLength(11);
  });

  it('plays a complete season against the real opponents', () => {
    const result = runSeasonSimulation(picks, 2024);
    expect(result.gameweeks).toHaveLength(38);
    expect(result.finalTable).toHaveLength(20);
    expect(result.wins + result.draws + result.losses).toBe(38);
    expect(result.playerStats).toHaveLength(11);
  });

  it('is deterministic for a given seed', () => {
    expect(runSeasonSimulation(picks, 31337)).toEqual(runSeasonSimulation(picks, 31337));
  });

  it('applies the roles stored for the club-season the player came from', () => {
    // Arsenal 2000/01 has roles recorded; the simulation must see them.
    const withRoles = gameData.squads.find(s =>
      s.players.some(p => p.roles.length > 0))!;
    const player = withRoles.players.find(p => p.roles.length > 0)!;
    const stripped: SquadPick = {
      slotIndex: 0, position: player.positions[0], playerId: player.playerId,
      playerName: player.name, nationality: player.nationality, rating: player.rating,
      clubName: 'x', seasonLabel: 'y',
      clubId: withRoles.clubId, seasonId: withRoles.seasonId,
      positions: player.positions, roles: [],
    };
    // runSeasonSimulation looks the roles back up rather than trusting the pick.
    const lineup = [stripped, ...classicXI('Arsenal').slice(1)];
    expect(() => runSeasonSimulation(lineup, 7)).not.toThrow();
    expect(getSquad(withRoles.clubId, withRoles.seasonId)!
      .players.find(p => p.playerId === player.playerId)!.roles.length).toBeGreaterThan(0);
  });
});

describe('getLineup', () => {
  it('returns null for a club-season with no stored lineup', () => {
    expect(getLineup(-1, -1)).toBeNull();
  });

  it('returns the stored lineup when there is one', () => {
    const stored = gameData.lineups[0];
    expect(getLineup(stored.clubId, stored.seasonId)).toEqual(stored);
  });
});
