import { describe, expect, it } from 'vitest';
import { getFormation, type Formation } from './formations';
import { gameData, type DataPlayer, type SpunSquad } from './gameData';
import {
  applyRules, clubChoices, draftPool, feasibility, nationChoices, poolCanFieldXI, type PoolRules,
} from './draftPool';

const ALL_TIME: PoolRules = { yearStart: 1992, yearEnd: 2026, playerRating: 'career', filter: null };
const F442 = getFormation('4-4-2');

function everyPlayer(pool: SpunSquad[]): DataPlayer[] {
  return pool.flatMap(s => s.players);
}

describe('draftPool', () => {
  it('without a filter offers every draftable squad unchanged', () => {
    const pool = draftPool(ALL_TIME);
    expect(pool.length).toBeGreaterThan(400);
    const squad = pool[0];
    const stored = gameData.squads.find(s => s.clubId === squad.clubId && s.seasonId === squad.seasonId)!;
    expect(squad.players).toEqual(stored.players);
  });

  it('One Club keeps only that club, across its seasons', () => {
    const chelsea = gameData.clubs.find(c => c.name === 'Chelsea')!;
    const pool = draftPool({ ...ALL_TIME, filter: { kind: 'club', clubId: chelsea.id } });
    expect(pool.length).toBeGreaterThan(10);
    expect(pool.every(s => s.clubId === chelsea.id)).toBe(true);
  });

  it('One Nation keeps only that nationality and drops squads left empty', () => {
    const pool = draftPool({ ...ALL_TIME, filter: { kind: 'nation', nation: 'France' } });
    expect(pool.every(s => s.players.length > 0)).toBe(true);
    expect(everyPlayer(pool).every(p => p.nationality === 'France')).toBe(true);
    expect(pool.length).toBeLessThan(draftPool(ALL_TIME).length);
  });

  it('Budget XI keeps only players at or under the cap', () => {
    const pool = draftPool({ ...ALL_TIME, filter: { kind: 'max-rating', maxRating: 78 } });
    expect(everyPlayer(pool).every(p => p.rating <= 78)).toBe(true);
    expect(poolCanFieldXI({ ...ALL_TIME, filter: { kind: 'max-rating', maxRating: 78 } }, F442)).toBe(true);
  });

  it('respects the era', () => {
    const modern = draftPool({ ...ALL_TIME, yearStart: 2016 });
    const seasons = new Map(gameData.seasons.map(s => [s.id, s.yearStart]));
    expect(modern.every(s => seasons.get(s.seasonId)! >= 2016)).toBe(true);
  });
});

describe('Prime mode', () => {
  // A player with more than one rating in the snapshot.
  const versions = new Map<number, number[]>();
  for (const s of gameData.squads) for (const p of s.players) {
    versions.set(p.playerId, [...(versions.get(p.playerId) ?? []), p.rating]);
  }
  const [playerId, ratings] = [...versions.entries()].find(([, r]) => new Set(r).size > 1)!;
  const best = Math.max(...ratings);
  const weakest = gameData.squads.flatMap(s => s.players)
    .find(p => p.playerId === playerId && p.rating < best)!;

  it('rates a player at their best season wherever they are drafted from', () => {
    const [primed] = applyRules([weakest], { playerRating: 'prime', filter: null });
    expect(primed.rating).toBe(best);
  });

  it('keeps the positions of the squad they were drafted from', () => {
    const [primed] = applyRules([weakest], { playerRating: 'prime', filter: null });
    expect(primed.positions).toEqual(weakest.positions);
  });

  it('leaves Career mode alone', () => {
    expect(applyRules([weakest], { playerRating: 'career', filter: null })[0].rating).toBe(weakest.rating);
  });

  it('keeps a squad sorted best first after re-rating', () => {
    for (const squad of draftPool({ ...ALL_TIME, playerRating: 'prime' }).slice(0, 50)) {
      const r = squad.players.map(p => p.rating);
      expect(r).toEqual([...r].sort((a, b) => b - a));
    }
  });

  it('applies Budget XI to the prime rating', () => {
    const pool = draftPool({ ...ALL_TIME, playerRating: 'prime', filter: { kind: 'max-rating', maxRating: 78 } });
    expect(everyPlayer(pool).every(p => p.rating <= 78)).toBe(true);
  });
});

describe('feasibility', () => {
  const player = (playerId: number, positions: DataPlayer['positions']): DataPlayer =>
    ({ playerId, name: `P${playerId}`, nationality: null, rating: 70, positions, roles: [] });
  const squad = (players: DataPlayer[]): SpunSquad =>
    ({ clubId: 1, clubName: 'Test', color: '#000', seasonId: 1, seasonLabel: 'T', players });
  // Two slots competing for one player: #1 is the only one who can play up front.
  const tiny: Formation = {
    name: 'test', description: '',
    slots: [{ position: 'GK', label: 'GK', x: 0, y: 0 }, { position: 'ST', label: 'ST', x: 0, y: 0 }],
  };
  const both = player(1, ['GK', 'ST']);
  const keeper = player(2, ['GK']);

  it('refuses a placement that leaves a slot nobody left can fill', () => {
    const f = feasibility([squad([both, keeper])], tiny);
    expect(f.canComplete([])).toBe(true);
    expect(f.canPlace([], both, 0)).toBe(false);  // in goal: nobody left for ST
    expect(f.canPlace([], both, 1)).toBe(true);
    expect(f.canPlace([], keeper, 0)).toBe(true);
  });

  it('refuses an illegal or duplicate placement', () => {
    const f = feasibility([squad([both, keeper])], tiny);
    expect(f.canPlace([], keeper, 1)).toBe(false);                               // a GK up front
    expect(f.canPlace([{ slotIndex: 1, playerId: 1 }], both, 0)).toBe(false);     // already picked
  });

  it('knows when a pool cannot field the formation at all', () => {
    expect(feasibility([squad([keeper])], tiny).canComplete([])).toBe(false);
  });

  it('can always finish from the unfiltered pool', () => {
    expect(feasibility(draftPool(ALL_TIME), F442).canComplete([])).toBe(true);
  });
});

describe('setup choices', () => {
  const eraRules = { yearStart: 1992, yearEnd: 2026, playerRating: 'career' as const };

  it('offers only nations that can field the formation', () => {
    const nations = nationChoices(eraRules, F442);
    const labels = nations.map(n => n.label);
    expect(labels).toContain('England');
    expect(labels).toContain('France');
    // A nation with fewer than eleven players in the snapshot cannot be offered.
    const counts = new Map<string, Set<number>>();
    for (const s of gameData.squads) for (const p of s.players) {
      if (p.nationality) counts.set(p.nationality, (counts.get(p.nationality) ?? new Set()).add(p.playerId));
    }
    const tiny = [...counts.entries()].find(([, ids]) => ids.size < 11)![0];
    expect(labels).not.toContain(tiny);
    for (const n of nations) {
      expect(poolCanFieldXI({ ...eraRules, filter: { kind: 'nation', nation: n.value } }, F442)).toBe(true);
    }
  });

  it('offers clubs by name, each with its season count in the era', () => {
    const clubs = clubChoices({ ...eraRules, yearStart: 2016 }, F442);
    expect(clubs.length).toBeGreaterThan(0);
    expect(clubs.map(c => c.label)).toEqual([...clubs.map(c => c.label)].sort((a, b) => a.localeCompare(b)));
    expect(clubs.every(c => c.seasons > 0)).toBe(true);
  });
});

describe('a guarded draft', () => {
  // Plays drafts the way the draft page does: spin a squad that has a player
  // with a placement the guard allows, put a random allowed player in a random
  // allowed slot. Unguarded, 59% of random Finland drafts got stuck.
  function draftToEnd(pool: SpunSquad[], formation: Formation, random: () => number): boolean {
    const f = feasibility(pool, formation);
    const picks: { slotIndex: number; playerId: number }[] = [];
    const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)];
    while (picks.length < formation.slots.length) {
      const moves = (p: DataPlayer) => formation.slots.map((_, i) => i).filter(i => f.canPlace(picks, p, i));
      const squads = pool.filter(s => s.players.some(p => moves(p).length > 0));
      if (squads.length === 0) return false;
      const player = pick(pick(squads).players.filter(p => moves(p).length > 0));
      picks.push({ slotIndex: pick(moves(player)), playerId: player.playerId });
    }
    return true;
  }

  it('never gets stuck, even from a thin pool', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const nation of ['Finland', 'Ghana', 'Slovakia']) {
      const pool = draftPool({ ...ALL_TIME, filter: { kind: 'nation', nation } });
      for (let run = 0; run < 60; run++) expect(draftToEnd(pool, F442, random), nation).toBe(true);
    }
  });
});
