import { describe, expect, it } from 'vitest';
import { bestFormation, equallyGoodFormations, fitFormation, type FittablePlayer } from './lineupFit';
import { FORMATIONS, type Position } from './formations';

const p = (name: string, positions: Position[], minutes = 3000): FittablePlayer =>
  ({ name, positions, minutes });

/** A squad shaped like the formation, plus a few fringe players. */
function squadFor(formationName: string, minutes = 3000): FittablePlayer[] {
  return FORMATIONS[formationName].slots.map((slot, i) =>
    p(`${slot.position}${i}`, [slot.position], minutes - i * 10));
}

describe('fitFormation', () => {
  it('fills every slot when the squad matches the shape', () => {
    const fit = fitFormation(squadFor('4-4-2'), '4-4-2');
    expect(fit.filled).toBe(11);
    expect(fit.slots).toHaveLength(11);
  });

  it('leaves slots empty when nobody can play there', () => {
    // No goalkeeper in the squad.
    const outfield = squadFor('4-4-2').filter(x => !x.positions.includes('GK'));
    expect(fitFormation(outfield, '4-4-2').filled).toBe(10);
  });

  it('never puts a player in a slot they cannot fill', () => {
    const fit = fitFormation(squadFor('4-3-3'), '4-3-3');
    for (const s of fit.slots) {
      expect(s.player.positions).toContain(s.position);
    }
  });

  it('uses each player at most once', () => {
    const fit = fitFormation(squadFor('3-5-2'), '3-5-2');
    const names = fit.slots.map(s => s.player.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('bumps a versatile player aside to fill a scarce slot', () => {
    // Only one player can keep goal, and he can also play outfield. The match
    // must not waste him at centre-back.
    const players = [
      p('Versatile', ['GK', 'CB'], 3000),
      p('Defender', ['CB'], 2900),
      ...squadFor('4-4-2').filter(x => !x.positions.includes('GK')).slice(0, 9),
    ];
    const fit = fitFormation(players, '4-4-2');
    const keeper = fit.slots.find(s => s.position === 'GK');
    expect(keeper?.player.name).toBe('Versatile');
  });
});

describe('bestFormation', () => {
  it('recognises the shape a squad was built for', () => {
    for (const name of ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '5-4-1']) {
      const fit = bestFormation(squadFor(name));
      expect(fit.filled).toBe(11);
      // Some formations are genuinely interchangeable given only positions;
      // what matters is that the chosen one fits perfectly.
      expect(equallyGoodFormations(squadFor(name))).toContain(name);
    }
  });

  it('prefers the shape that accommodates the players who actually played', () => {
    // Three centre-backs on heavy minutes, plus fringe full-backs.
    const players = [
      p('GK', ['GK'], 3400),
      p('CB1', ['CB'], 3300), p('CB2', ['CB'], 3200), p('CB3', ['CB'], 3100),
      p('LM', ['LM'], 3000), p('RM', ['RM'], 2900),
      p('CM1', ['CM'], 2800), p('CM2', ['CM'], 2700),
      p('ST1', ['ST'], 2600), p('ST2', ['ST'], 2500),
      p('LB', ['LB'], 400), p('RB', ['RB'], 300),
    ];
    const fit = bestFormation(players);
    // A back three uses the regulars; a back four benches a centre-back for a
    // fringe full-back.
    expect(fit.minutes).toBeGreaterThan(fitFormation(players, '4-4-2').minutes);
  });

  it('still returns its best effort for an incomplete squad', () => {
    const fit = bestFormation([p('GK', ['GK']), p('CB', ['CB']), p('ST', ['ST'])]);
    expect(fit.filled).toBe(3);
    expect(fit.formation).toBeTruthy();
  });

  it('is deterministic', () => {
    const squad = squadFor('4-2-3-1');
    expect(bestFormation(squad).formation).toBe(bestFormation(squad).formation);
  });
});

describe('equallyGoodFormations', () => {
  it('surfaces a genuine tie rather than hiding it', () => {
    const tied = equallyGoodFormations(squadFor('4-4-2'));
    expect(tied.length).toBeGreaterThanOrEqual(1);
    expect(tied).toContain('4-4-2');
  });
});
