// The shipped data, drafted and played.
//
// Every other test exercises one piece against a fixture it builds itself. This
// one takes src/data/game-data.json exactly as the game loads it, drafts an XI
// out of 1992/93, and plays a season with it. It is the test that would have
// caught a squad exported with no positions, or a rating that never reached the
// snapshot — the joins between the pipeline and the game, which nothing else
// covers.

import { describe, it, expect } from 'vitest';
import { gameData, getOpponentSquads, runSeasonSimulation, type DataPlayer } from './gameData';
import { toBenchPick } from './bench';
import { bestFormation, type FittablePlayer } from './lineupFit';
import { FORMATIONS } from './formations';
import type { SquadPick } from './simulation';
import type { Position } from './formations';

const SEASON = '1992/93';

function squadsFor(label: string) {
  const season = gameData.seasons.find(s => s.label === label);
  if (!season) throw new Error(`${label} is not in the snapshot`);
  return gameData.squads.filter(s => s.seasonId === season.id);
}

describe(`${SEASON} in the shipped snapshot`, () => {
  const squads = squadsFor(SEASON);

  it('has every club, with a usable squad each', () => {
    expect(squads).toHaveLength(22);
    for (const squad of squads) {
      const club = gameData.clubs.find(c => c.id === squad.clubId);
      expect(club, `club ${squad.clubId} missing`).toBeDefined();
      // Eleven is the floor for fielding a side at all.
      expect(squad.players.length, `${club?.name} squad`).toBeGreaterThanOrEqual(11);
      expect(
        squad.players.some(p => p.positions.includes('GK')),
        `${club?.name} has no goalkeeper`,
      ).toBe(true);
    }
  });

  it('gives every player a rating and at least one position', () => {
    for (const squad of squads) {
      for (const p of squad.players) {
        expect(Number.isInteger(p.rating), `${p.name} rating`).toBe(true);
        expect(p.rating).toBeGreaterThanOrEqual(40);
        expect(p.rating).toBeLessThanOrEqual(99);
        expect(p.positions.length, `${p.name} positions`).toBeGreaterThan(0);
      }
    }
  });

  it('names nobody twice across the season', () => {
    // One human belongs to one club per season. A player in two squads would
    // face himself and appear twice on the same leaderboard.
    const seen = new Map<number, string>();
    for (const squad of squads) {
      const club = gameData.clubs.find(c => c.id === squad.clubId)?.name ?? '?';
      for (const p of squad.players) {
        const already = seen.get(p.playerId);
        expect(already, `${p.name} is in both ${already} and ${club}`).toBeUndefined();
        seen.set(p.playerId, club);
      }
    }
  });
});

describe(`drafting and playing a ${SEASON} XI`, () => {
  // A draft in the game spins club-seasons and takes players from each. Fixed
  // clubs here rather than a random spin, so a failure names the same squad
  // twice running.
  const drafted: DataPlayer[] = [];
  for (const name of ['Manchester United', 'Arsenal', 'Aston Villa', 'Norwich City', 'Blackburn Rovers']) {
    const club = gameData.clubs.find(c => c.name === name);
    const squad = squadsFor(SEASON).find(s => s.clubId === club?.id);
    if (!squad) throw new Error(`no ${name} squad in ${SEASON}`);
    drafted.push(...[...squad.players].sort((a, b) => b.rating - a.rating).slice(0, 6));
  }

  // bestFormation ranks candidates by `minutes`. Drafting has no minutes to go
  // on, and rating is the thing a drafter is choosing on, so it stands in.
  const fittable: FittablePlayer[] = drafted.map(p => ({
    name: p.name, positions: p.positions, minutes: p.rating,
  }));

  const fit = bestFormation(fittable);

  it('finds a formation the drafted players can actually fill', () => {
    expect(fit.filled, `only filled ${fit.filled} of 11 in ${fit.formation}`).toBe(11);
    expect(Object.keys(FORMATIONS)).toContain(fit.formation);
    // A pool this good should not need anyone played out of position.
    expect(fit.natural).toBeGreaterThanOrEqual(9);
  });

  const picks: SquadPick[] = fit.slots.map(slot => {
    const player = drafted.find(p => p.name === slot.player.name);
    if (!player) throw new Error(`${slot.player.name} vanished between fit and pick`);
    return {
      slotIndex: slot.slotIndex,
      position: slot.position as Position,
      playerId: player.playerId,
      playerName: player.name,
      nationality: player.nationality,
      rating: player.rating,
      clubName: 'Drafted XI',
      seasonLabel: SEASON,
      positions: player.positions as Position[],
      roles: player.roles,
    };
  });

  it('plays a full season and produces a coherent table', () => {
    const result = runSeasonSimulation(picks, 1993);

    expect(result.gameweeks).toHaveLength(38);
    expect(result.wins + result.draws + result.losses).toBe(38);
    expect(result.points).toBe(result.wins * 3 + result.draws);
    expect(result.points).toBeGreaterThanOrEqual(0);
    expect(result.points).toBeLessThanOrEqual(114);

    // Everyone plays everyone twice, so the league's goals must balance.
    const scored = result.finalTable.reduce((n, t) => n + t.goalsFor, 0);
    const conceded = result.finalTable.reduce((n, t) => n + t.goalsAgainst, 0);
    expect(scored).toBe(conceded);

    const positions = result.finalTable.map((_, i) => i + 1);
    expect(result.finalPosition).toBeGreaterThanOrEqual(1);
    expect(result.finalPosition).toBeLessThanOrEqual(positions.length);

    // The players who played are the ones who were drafted.
    expect(result.playerStats.length).toBeGreaterThan(0);
    const draftedIds = new Set(picks.map(p => p.playerId));
    for (const s of result.playerStats) expect(draftedIds.has(s.playerId)).toBe(true);
    expect(result.awards.goldenBoot.name).toBeTruthy();
  });

  it('is deterministic for a given seed', () => {
    const a = runSeasonSimulation(picks, 1993);
    const b = runSeasonSimulation(picks, 1993);
    expect(b.points).toBe(a.points);
    expect(b.finalPosition).toBe(a.finalPosition);
    expect(b.goalsFor).toBe(a.goalsFor);

    const different = runSeasonSimulation(picks, 1994);
    // Not an assertion that they differ — two seeds can agree on points by
    // chance — but the whole gameweek sequence agreeing would mean the seed is
    // being ignored.
    const same = JSON.stringify(different.gameweeks) === JSON.stringify(a.gameweeks);
    expect(same).toBe(false);
  });

  it('plays a change of style at halfway without touching the first half', () => {
    const before = runSeasonSimulation(picks, 1993, { style: 'balanced' });
    const after = runSeasonSimulation(picks, 1993, {
      style: 'balanced', change: { afterWeek: 19, style: 'gegenpress' },
    });
    // The results page has already shown nineteen gameweeks when the change is
    // made; they must not rewrite themselves.
    expect(JSON.stringify(after.gameweeks.slice(0, 19))).toBe(JSON.stringify(before.gameweeks.slice(0, 19)));
    expect(JSON.stringify(after.gameweeks.slice(19))).not.toBe(JSON.stringify(before.gameweeks.slice(19)));
    expect(before.styles).toEqual([{ fromWeek: 1, style: 'balanced' }]);
    expect(after.styles).toEqual([{ fromWeek: 1, style: 'balanced' }, { fromWeek: 20, style: 'gegenpress' }]);
  });

  it('plays a change of eleven at halfway without touching the first half', () => {
    // A drafted player who did not start comes on for the starter in a slot he
    // can play, as the half-time lineup editor would put him there.
    const used = new Set(picks.map(p => p.playerId));
    const sub = drafted.find(p => !used.has(p.playerId) && picks.some(s => s.position !== 'GK' && p.positions.includes(s.position)));
    if (!sub) throw new Error('no drafted player left to bring on');
    const off = picks.find(s => s.position !== 'GK' && sub.positions.includes(s.position))!;
    const secondHalf: SquadPick[] = picks.map(p => p === off ? {
      ...off, playerId: sub.playerId, playerName: sub.name, rating: sub.rating,
      positions: sub.positions as Position[], roles: sub.roles,
    } : p);

    const before = runSeasonSimulation(picks, 1993, { style: 'balanced' });
    const after = runSeasonSimulation(picks, 1993, {
      style: 'balanced', change: { afterWeek: 19, style: 'balanced', picks: secondHalf },
    });
    expect(JSON.stringify(after.gameweeks.slice(0, 19))).toBe(JSON.stringify(before.gameweeks.slice(0, 19)));
    expect(after.lineupChangedFrom).toBe(20);
    expect(before.lineupChangedFrom).toBeUndefined();

    // Twelve played: the one taken off and the one who came on each played a half.
    expect(after.playerStats).toHaveLength(12);
    const apps = (name: string) => after.playerStats.find(s => s.playerName === name)?.appearances;
    expect(apps(off.playerName)).toBe(19);
    expect(apps(sub.name)).toBe(19);
    expect(apps(picks.find(p => p !== off)!.playerName)).toBe(38);
  });

  describe('with a bench, suspensions', () => {
    // The five best drafted players left out of the eleven.
    const used = new Set(picks.map(p => p.playerId));
    const bench: SquadPick[] = drafted.filter(p => !used.has(p.playerId)).slice(0, 5).map((p, i) => toBenchPick({
      slotIndex: 0, position: p.positions[0] as Position, playerId: p.playerId, playerName: p.name,
      rating: p.rating, clubName: 'Drafted XI', seasonLabel: SEASON, positions: p.positions as Position[], roles: p.roles,
    }, i));

    it('gives every opponent a bench of five with a keeper on it', () => {
      const season = gameData.seasons.find(s => s.label === SEASON)!;
      for (const squad of getOpponentSquads(season.id)) {
        expect(squad.bench, squad.clubName).toHaveLength(5);
        const keepers = squad.bench!.filter(p => p.positions?.includes('GK')).length;
        expect(keepers, `${squad.clubName} bench keepers`).toBeLessThanOrEqual(1);
      }
    });

    it('is not played without a bench', () => {
      const plain = runSeasonSimulation(picks, 1993);
      expect(plain.suspensions).toBeUndefined();
      expect(plain.gameweeks.some(g => g.fixtures.some(f => f.detail?.absent))).toBe(false);
    });

    it('keeps a banned player out and brings a bench player in', () => {
      // Over a few seasons, so the test does not hang on one seed's luck.
      const seasons = [1993, 1994, 1995, 1996].map(seed => runSeasonSimulation(picks, seed, { bench }));
      const banned = seasons.find(r => (r.bans?.length ?? 0) > 0);
      if (!banned) throw new Error('no bans in four seasons');
      expect(banned.suspensions).toBe(true);
      const first = banned.bans![0];
      // He misses the side's next match, and someone stands in.
      const next = banned.gameweeks[first.week];
      const fixture = next.fixtures.find(f => f.userInvolved)!;
      expect(fixture.detail!.absent!.map(a => a.name)).toContain(first.playerName);
      const standIn = fixture.detail!.absent!.find(a => a.name === first.playerName)!.standIn!;
      expect(bench.map(p => p.playerName)).toContain(standIn);

      const apps = (name: string) => banned.playerStats.find(s => s.playerName === name)?.appearances ?? 0;
      expect(apps(first.playerName)).toBeLessThan(38);
      expect(apps(standIn)).toBeGreaterThan(0);
      // Eleven play every match, whoever they are.
      const total = banned.playerStats.reduce((sum, s) => sum + s.appearances, 0);
      expect(total).toBe(38 * 11);
    });

    it('gives Player of the Season to someone who played at least half the season', () => {
      // A stand-in with two good games used to win it on his average.
      for (const seed of [1993, 1994, 1995, 1996, 1997, 1998]) {
        const r = runSeasonSimulation(picks, seed, { bench });
        const pots = r.playerStats.find(s => s.playerName === r.awards.playerOfSeason.name)!;
        expect(pots.appearances, `seed ${seed}`).toBeGreaterThanOrEqual(19);
      }
    });

    it('leaves the first half alone when the eleven changes at halfway', () => {
      const before = runSeasonSimulation(picks, 1993, { bench });
      const secondHalf = picks.map(p => p);
      const after = runSeasonSimulation(picks, 1993, { bench, change: { afterWeek: 19, style: 'counter', picks: secondHalf } });
      expect(JSON.stringify(after.gameweeks.slice(0, 19))).toBe(JSON.stringify(before.gameweeks.slice(0, 19)));
    });
  });

  it('treats the same eleven at halfway as no change', () => {
    const plain = runSeasonSimulation(picks, 1993, { style: 'balanced' });
    const same = runSeasonSimulation(picks, 1993, { style: 'balanced', change: { afterWeek: 19, style: 'balanced', picks: [...picks].reverse() } });
    expect(same).toEqual(plain);
  });

  it('treats a change to the same style as no change', () => {
    const plain = runSeasonSimulation(picks, 1993, { style: 'balanced' });
    const same = runSeasonSimulation(picks, 1993, { style: 'balanced', change: { afterWeek: 19, style: 'balanced' } });
    expect(same).toEqual(plain);
  });
});
