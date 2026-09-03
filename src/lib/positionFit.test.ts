import { describe, expect, it } from 'vitest';
import {
  FORMATIONS, OUT_OF_POSITION_PENALTY, canFillSlot, effectiveRating,
  fillsSlotNaturally, positionFit, slotFit, type Position,
} from './formations';
import { fitFormation } from './lineupFit';

// Positions are places on a pitch, not strings. A left-back covers left
// wing-back; a central midfielder covers holding and attacking midfield.
// Requiring an exact match made half the formations unfillable and forced the
// position lookup to be more precise than football is.

describe('positionFit', () => {
  it('is exact for the same position', () => {
    expect(positionFit('CB', 'CB')).toBe('exact');
  });

  it('lets a full-back cover the wing-back role on the same flank', () => {
    expect(positionFit('LB', 'LWB')).toBe('adjacent');
    expect(positionFit('RB', 'RWB')).toBe('adjacent');
  });

  it('lets a central midfielder cover holding and attacking midfield', () => {
    expect(positionFit('CM', 'CDM')).toBe('adjacent');
    expect(positionFit('CM', 'CAM')).toBe('adjacent');
  });

  it('lets a striker drop to centre-forward', () => {
    expect(positionFit('ST', 'CF')).toBe('adjacent');
    expect(positionFit('CF', 'CAM')).toBe('adjacent');
  });

  it('lets a wide midfielder push on to the wing', () => {
    expect(positionFit('LM', 'LW')).toBe('adjacent');
    expect(positionFit('RM', 'RW')).toBe('adjacent');
  });

  it('lets a wide player tuck inside at the same height', () => {
    expect(positionFit('LM', 'CM')).toBe('adjacent');
    expect(positionFit('LB', 'CB')).toBe('adjacent');
  });

  it('never swaps a left-sided player to the right', () => {
    // A player who genuinely played both flanks lists both.
    expect(positionFit('LB', 'RB')).toBe('none');
    expect(positionFit('LW', 'RW')).toBe('none');
  });

  it('never stretches two steps', () => {
    expect(positionFit('CB', 'CM')).toBe('none');
    expect(positionFit('CDM', 'CAM')).toBe('none');
    expect(positionFit('LB', 'LW')).toBe('none');
  });

  it('keeps the goalkeeper absolute in both directions', () => {
    expect(positionFit('CB', 'GK')).toBe('none');
    expect(positionFit('GK', 'CB')).toBe('none');
    expect(positionFit('GK', 'GK')).toBe('exact');
  });
});

describe('slotFit across a player’s positions', () => {
  it('takes the best fit available', () => {
    expect(slotFit(['CM', 'CB'], 'CB')).toBe('exact');
    expect(slotFit(['CM'], 'CDM')).toBe('adjacent');
    expect(slotFit(['ST'], 'GK')).toBe('none');
  });

  it('drives canFillSlot and fillsSlotNaturally differently', () => {
    expect(canFillSlot(['CM'], 'CAM')).toBe(true);
    expect(fillsSlotNaturally(['CM'], 'CAM')).toBe(false);
    expect(fillsSlotNaturally(['CAM'], 'CAM')).toBe(true);
  });
});

describe('effectiveRating', () => {
  it('leaves a natural fit untouched', () => {
    expect(effectiveRating(85, ['LB'], 'LB')).toBe(85);
  });

  it('docks a player out of position', () => {
    expect(effectiveRating(85, ['LB'], 'LWB')).toBe(85 - OUT_OF_POSITION_PENALTY);
  });

  it('never drops below one', () => {
    expect(effectiveRating(2, ['LB'], 'LWB')).toBeGreaterThanOrEqual(1);
  });
});

describe('formations are fillable', () => {
  const names = Object.keys(FORMATIONS);

  /**
   * A realistic twenty-man squad. Not one player per slot: a real club carries
   * cover in every area, which is what makes every shape reachable. A squad
   * built for 4-4-2 genuinely cannot play 3-4-3 — that is football, not a bug.
   */
  const squad = ([
    ['GK'], ['GK'],
    ['LB'], ['LB'],
    ['CB'], ['CB'], ['CB'],
    ['RB'], ['RB'],
    ['CDM'], ['CDM'],
    ['CM'], ['CM'], ['CM'],
    ['LM'], ['LW'],
    ['RM'], ['RW'],
    ['ST'], ['ST'], ['CF'],
  ] as Position[][]).map((positions, i) => ({
    name: `P${i}`, positions, minutes: 3000 - i,
  }));

  it('offers a decent spread of shapes', () => {
    expect(names.length).toBeGreaterThanOrEqual(20);
  });

  it.each(names)('%s can be filled by a full squad', name => {
    expect(fitFormation(squad, name).filled).toBe(11);
  });

  it.each(names)('%s still has eleven slots and one keeper', name => {
    expect(FORMATIONS[name].slots).toHaveLength(11);
    expect(FORMATIONS[name].slots.filter(s => s.position === 'GK')).toHaveLength(1);
  });

  it('fills a CDM slot from central midfielders', () => {
    // The regression this change exists for: under exact matching a squad
    // whose central midfielders were all recorded as CM could not fill a CDM
    // slot, which made seven of the formations impossible.
    const noHolders = ([
      ['GK'], ['LB'], ['CB'], ['CB'], ['RB'],
      ['CM'], ['CM'], ['LM'], ['RM'], ['ST'], ['ST'],
    ] as Position[][]).map((positions, i) => ({
      name: `P${i}`, positions, minutes: 3000 - i,
    }));
    const fit = fitFormation(noHolders, '4-4-2');
    expect(fit.filled).toBe(11);
    // Filled, but not naturally: someone is covering the holding role.
    expect(fit.natural).toBe(10);
    // 4-1-4-1 is not asserted here: this squad has two strikers and that
    // shape has one striker slot, so it legitimately cannot be filled.
  });

  it('plays a left-back at left wing-back when the shape asks for it', () => {
    const backFour = ([
      ['GK'], ['LB'], ['CB'], ['CB'], ['CB'], ['RB'],
      ['CM'], ['CM'], ['CM'], ['ST'], ['ST'],
    ] as Position[][]).map((positions, i) => ({
      name: `P${i}`, positions, minutes: 3000 - i,
    }));
    const fit = fitFormation(backFour, '5-3-2');
    expect(fit.filled).toBe(11);
    // Two of them are covering wing-back rather than playing it naturally.
    expect(fit.natural).toBeLessThan(11);
  });
});
