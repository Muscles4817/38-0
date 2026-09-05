// Traits describe ability. Everything else about a role describes output.
//
// The older fields — goalMult, assistMult, attContrib and friends — can only
// say how much a player scores, creates, or adds to a team-strength number.
// That is why AerialThreat is a 3.5x goal multiplier rather than "wins
// headers": there was nowhere else to put it. Qualities are the vocabulary that
// was missing, and the playstyle interactions are built on them.

import { describe, it, expect } from 'vitest';
import { gameData } from './gameData';
import { aerialQuality } from './matchEngine';
import type { MatchPlayer, RoleMultipliers } from './matchEngine';
import type { Position } from './formations';

const VOCABULARY = [
  'aerial', 'pace', 'recovery', 'pressing', 'pressResist', 'creation',
  'dribble', 'shotStopping', 'claiming', 'setPiece', 'penalty', 'longShot',
  'discipline',
];

/** The qualities each playstyle interaction will read. */
const NEEDED_BY_PLAYSTYLES = ['pace', 'pressing', 'pressResist', 'creation', 'aerial'];

describe('role qualities', () => {
  it('are present on every role', () => {
    for (const role of gameData.roles) {
      expect(role.qualities, `${role.name} has no qualities`).toBeDefined();
    }
  });

  it('only use quality names the engine knows', () => {
    for (const role of gameData.roles) {
      for (const key of Object.keys(role.qualities ?? {})) {
        expect(VOCABULARY, `${role.name} claims an unknown quality "${key}"`).toContain(key);
      }
    }
  });

  it('are scored on the same scale everywhere, in both directions', () => {
    // 1 notable, 2 strong, 3 defining, and the same going down. A role claiming
    // 9 for something would quietly dominate whichever interaction reads it.
    for (const role of gameData.roles) {
      for (const [key, value] of Object.entries(role.qualities ?? {})) {
        expect(value, `${role.name}.${key} is zero, which says nothing`).not.toBe(0);
        expect(Math.abs(value ?? 0), `${role.name}.${key}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('let a trait describe a weakness', () => {
    // Without negatives every trait is a bonus, so tagging a player is never a
    // cost and the rating is the only thing that can be bad about him. A slow
    // centre-half is a real and specific liability against a counter-attack,
    // and nothing else in the data could say so.
    const negative = gameData.roles.filter(r =>
      Object.values(r.qualities ?? {}).some(v => (v ?? 0) < 0));
    expect(negative.length).toBeGreaterThanOrEqual(5);
    expect(negative.map(r => r.name)).toContain('Ponderous');
  });

  it('only assert a weakness the trait actually implies', () => {
    // Correlation is not definition. Poachers are not quick, aerial threats are
    // not slow, and target men are not slow — an earlier version asserted all
    // three and was wrong about all three. These four are checked by name
    // because they are the ones that were wrong.
    const noPaceClaim = ['Poacher', 'AerialThreat', 'TargetMan', 'Winger'];
    for (const name of noPaceClaim) {
      const role = gameData.roles.find(r => r.name === name);
      expect(role, `${name} is missing`).toBeDefined();
      expect(role!.qualities?.pace ?? 0, `${name} should say nothing about pace`).toBe(0);
    }
  });

  it('leave nothing in the vocabulary unreachable', () => {
    // The real risk is a quality no trait can express, which is what happened
    // to pace: the playstyle interactions would read it and always find zero.
    //
    // Not a count. One dedicated trait is a perfectly good way to say something
    // — pace is now Pacey and Ponderous and nothing else, which is cleaner than
    // sprinkling it over traits that do not actually imply it. Some qualities
    // are only ever negative: nobody needs a trait for being averagely
    // disciplined.
    for (const quality of VOCABULARY) {
      const providers = gameData.roles.filter(r => (r.qualities?.[quality] ?? 0) !== 0);
      expect(providers.length, `nothing can express "${quality}"`).toBeGreaterThan(0);
    }
  });

  it('can express every quality the playstyle work reads, in both directions', () => {
    for (const quality of NEEDED_BY_PLAYSTYLES) {
      const up = gameData.roles.filter(r => (r.qualities?.[quality] ?? 0) > 0);
      const down = gameData.roles.filter(r => (r.qualities?.[quality] ?? 0) < 0);
      expect(up.length, `no trait grants ${quality}`).toBeGreaterThan(0);
      expect(down.length, `no trait denies ${quality}`).toBeGreaterThan(0);
    }
  });

  it('include a way to say a player is quick', () => {
    // The single largest gap in the old vocabulary: nothing expressed pace,
    // which is the whole basis of counter-attacking and of punishing a high
    // line. Named explicitly so it cannot quietly disappear again.
    const quick = gameData.roles.filter(r => (r.qualities?.pace ?? 0) >= 3);
    expect(quick.map(r => r.name)).toContain('Pacey');
  });

  it('give goalkeepers more than one thing to be good at', () => {
    const keeperRoles = gameData.roles.filter(r => r.validPositions.includes('GK'));
    expect(keeperRoles.length).toBeGreaterThanOrEqual(3);
    const keeperQualities = new Set(
      keeperRoles.flatMap(r => Object.keys(r.qualities ?? {})),
    );
    expect(keeperQualities.has('shotStopping')).toBe(true);
    expect(keeperQualities.has('claiming')).toBe(true);
  });

  it('do not double as a scoring bonus', () => {
    // A trait that exists to describe an ability should not also make a player
    // score more. The ones that legitimately do — Poacher, AerialThreat — are
    // about finishing; the new descriptive traits are not.
    const descriptive = ['Pacey', 'Sweeper', 'Stopper', 'Workhorse', 'Carrier',
      'ShotStopper', 'CommandingKeeper'];
    for (const name of descriptive) {
      const role = gameData.roles.find(r => r.name === name);
      expect(role, `${name} is missing`).toBeDefined();
      expect(role!.goalMult, `${name} goal multiplier`).toBeLessThanOrEqual(1.2);
    }
  });
});

describe('the role set itself', () => {
  it('still contains the roles the data actually uses', () => {
    // NoNonsenseDefender and SweeperKeeper existed only in the database: they
    // had been added without being written back into the code defaults, so
    // rebuilding from scratch would have silently dropped them — and
    // NoNonsenseDefender is the most used role in the whole dataset.
    const used = new Set<string>();
    for (const squad of gameData.squads) {
      for (const player of squad.players) {
        for (const role of player.roles ?? []) used.add(role);
      }
    }
    const known = new Set(gameData.roles.map(r => r.name));
    const orphaned = [...used].filter(r => !known.has(r));
    expect(orphaned, `roles used by players but not defined: ${orphaned.join(', ')}`)
      .toEqual([]);
  });
});

// ── Aerial presence ──────────────────────────────────────────────────────────
//
// This is a regression test for a bug that was silently backwards for as long
// as the aerial number existed. Role names used to multiply a player's WEIGHT
// in a weighted mean of ratings, but the weight decides how much his rating
// counts toward the average — so a specialist rated below his team-mates
// dragged the side's aerial number DOWN. Signing a target man was a downgrade
// in the air. The `aerial` quality now scales his contribution instead.

describe('aerial presence', () => {
  const roles: RoleMultipliers = {
    goalMult: {},
    assistMult: {},
    qualities: {
      AerialThreat: { aerial: 3 },
      Lightweight: { aerial: -2 },
    },
  };

  /** A flat, unremarkable eleven, so the striker's slot is the only variable. */
  const eleven = (striker: MatchPlayer): MatchPlayer[] => [
    { playerId: 1, name: 'GK', position: 'GK', rating: 84 },
    { playerId: 2, name: 'LB', position: 'LB', rating: 82 },
    { playerId: 3, name: 'CB1', position: 'CB', rating: 84 },
    { playerId: 4, name: 'CB2', position: 'CB', rating: 83 },
    { playerId: 5, name: 'RB', position: 'RB', rating: 82 },
    { playerId: 6, name: 'LM', position: 'LM', rating: 82 },
    { playerId: 7, name: 'CM1', position: 'CM', rating: 83 },
    { playerId: 8, name: 'CM2', position: 'CM', rating: 82 },
    { playerId: 9, name: 'RM', position: 'RM', rating: 82 },
    { playerId: 10, name: 'ST1', position: 'ST', rating: 84 },
    striker,
  ];

  const plain = { playerId: 11, name: 'Plain', position: 'ST' as Position, rating: 79 };
  const specialist = { ...plain, name: 'Target man', roles: ['AerialThreat'] };
  const lightweight = { ...plain, name: 'Lightweight', roles: ['Lightweight'] };

  it('is raised by a specialist rated below his team-mates', () => {
    // The bug: this was the wrong way round, so the more aerial the player, the
    // worse his side got in the air whenever he was not also the best player.
    expect(aerialQuality(eleven(specialist), roles))
      .toBeGreaterThan(aerialQuality(eleven(plain), roles));
  });

  it('is lowered by a player who loses headers', () => {
    // Nothing in the old role-name map could say this at all.
    expect(aerialQuality(eleven(lightweight), roles))
      .toBeLessThan(aerialQuality(eleven(plain), roles));
  });

  it('still reads rating, not only traits', () => {
    const better = { ...plain, playerId: 12, name: 'Better', rating: 86 };
    expect(aerialQuality(eleven(better), roles))
      .toBeGreaterThan(aerialQuality(eleven(plain), roles));
  });

  it('weighs a centre-back more heavily than a winger', () => {
    // Position decides how much of the contest a player is part of.
    const asCB = { ...specialist, position: 'CB' as Position };
    const asWinger = { ...specialist, position: 'LW' as Position };
    expect(aerialQuality(eleven(asCB), roles))
      .toBeGreaterThan(aerialQuality(eleven(asWinger), roles));
  });
});
