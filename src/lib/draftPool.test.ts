import { describe, expect, it } from 'vitest';
import { canFillSlot, getFormation, type Formation, type Position } from './formations';
import { gameData, type DataPlayer, type SpunSquad } from './gameData';
import {
  draftListOrder,
  applyRules, clubChoices, draftPool, feasibility, nationChoices, poolCanFieldXI, type PoolRules,
  DEFAULT_SOURCES, describeSources, ICONS, LEGACY_SOURCES, poolSourceOf, poolSourceOptions, resolveSources,
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

  it('Premier League only leaves out the icons, and nothing else', () => {
    const all = draftPool({ ...ALL_TIME, playerRating: 'career', filter: null });
    const english = draftPool({ ...ALL_TIME, playerRating: 'career', filter: null, scope: 'premier-league' });
    expect(all.some(s => s.league !== 'PL')).toBe(true);
    expect(english.every(s => s.league === 'PL')).toBe(true);
    expect(english).toHaveLength(all.filter(s => s.league === 'PL').length);
  });

  it('respects the era', () => {
    const modern = draftPool({ ...ALL_TIME, yearStart: 2016 });
    const seasons = new Map(gameData.seasons.map(s => [s.id, s.yearStart]));
    expect(modern.every(s => seasons.get(s.seasonId)! >= 2016)).toBe(true);
  });
});

describe('pool sources', () => {
  const everything = draftPool({ ...ALL_TIME, sources: [...LEGACY_SOURCES, 'LL'] });
  const name = (s: SpunSquad) => `${s.clubName} ${s.seasonLabel}`;

  it('a new run drafts from the Premier League only', () => {
    expect(DEFAULT_SOURCES).toEqual(['PL']);
    const pool = draftPool({ ...ALL_TIME, sources: DEFAULT_SOURCES });
    expect(pool.length).toBeGreaterThan(400);
    expect(pool.every(s => s.league === 'PL')).toBe(true);
  });

  it('puts every club of a full league-season in that league, and nothing else there', () => {
    const laLiga = draftPool({ ...ALL_TIME, sources: ['LL'] });
    expect(laLiga.length).toBeGreaterThanOrEqual(19);
    expect(laLiga.every(s => s.league === 'LL' && s.seasonLabel === '2025/26')).toBe(true);
    expect(laLiga.map(name)).toContain('Oviedo 2025/26');
  });

  it('keeps a famous side from outside a full league-season among the icons', () => {
    const icons = draftPool({ ...ALL_TIME, sources: [ICONS] });
    expect(icons.every(s => s.league !== 'PL')).toBe(true);
    expect(icons.map(name)).toContain('Barcelona 2009/10');
    expect(icons.some(s => poolSourceOf(s) === 'LL')).toBe(false);
  });

  it('gives every squad exactly one source', () => {
    const bySource = (id: string) => draftPool({ ...ALL_TIME, sources: [id] }).length;
    expect(bySource('PL') + bySource('LL') + bySource(ICONS)).toBe(everything.length);
  });

  it('reads old setups, and the daily challenge, as Premier League + icons', () => {
    expect(resolveSources({})).toEqual(LEGACY_SOURCES);
    expect(resolveSources({ scope: 'with-icons' })).toEqual(LEGACY_SOURCES);
    expect(resolveSources({ scope: 'premier-league' })).toEqual(['PL']);
    const legacy = draftPool(ALL_TIME);
    expect(legacy.some(s => poolSourceOf(s) === 'LL')).toBe(false);
  });

  it('offers a league on the setup page once a full season of it exists', () => {
    expect(poolSourceOptions().map(o => o.id)).toEqual(['PL', 'LL', ICONS]);
    expect(describeSources(['PL'])).toBe('Premier League only');
    expect(describeSources(['PL', 'LL'])).toBe('Premier League + La Liga');
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
    ({ clubId: 1, clubName: 'Test', color: '#000', seasonId: 1, seasonLabel: 'T', league: 'PL', players });
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

describe('the order a spun squad is listed in', () => {
  const p = (name: string, rating: number, positions: Position[]) => ({ name, rating, positions });
  const squad = [p('Zola', 90, ['CAM']), p('Adams', 85, ['CB']), p('Seaman', 84, ['GK']), p('Bergkamp', 92, ['CF']), p('Dixon', 80, ['RB'])];

  it('is a team sheet, not best first', () => {
    expect(draftListOrder(squad).map(x => x.name)).toEqual(['Seaman', 'Adams', 'Dixon', 'Zola', 'Bergkamp']);
  });

  it('puts the players who can fill the position being spun for first', () => {
    for (const position of ['GK', 'CB', 'RB', 'CM', 'ST'] as Position[]) {
      const fits = draftListOrder(squad, position).map(x => canFillSlot(x.positions, position));
      // Every true before every false.
      expect(fits).toEqual([...fits].sort((x, y) => Number(y) - Number(x)));
    }
  });
});
