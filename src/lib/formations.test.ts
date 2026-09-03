import { describe, expect, it } from 'vitest';
import {
  FORMATIONS,
  canFillSlot,
  getFormation,
  playerInitials,
  type Position,
} from './formations';

const formationNames = Object.keys(FORMATIONS);

describe('FORMATIONS', () => {
  it('defines at least one formation', () => {
    expect(formationNames.length).toBeGreaterThan(0);
  });

  it.each(formationNames)('%s fields eleven players', name => {
    expect(FORMATIONS[name].slots).toHaveLength(11);
  });

  it.each(formationNames)('%s has exactly one goalkeeper', name => {
    const keepers = FORMATIONS[name].slots.filter(s => s.position === 'GK');
    expect(keepers).toHaveLength(1);
  });

  it.each(formationNames)('%s places every slot on the pitch', name => {
    for (const slot of FORMATIONS[name].slots) {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x).toBeLessThanOrEqual(100);
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeLessThanOrEqual(100);
    }
  });

  it.each(formationNames)('%s keeps the keeper behind every outfielder', name => {
    const slots = FORMATIONS[name].slots;
    const keeper = slots.find(s => s.position === 'GK')!;
    for (const slot of slots.filter(s => s.position !== 'GK')) {
      // y runs from the opposition goal (0) to your own (100).
      expect(keeper.y).toBeGreaterThan(slot.y);
    }
  });

  it.each(formationNames)('%s names itself consistently with its key', name => {
    expect(FORMATIONS[name].name).toBe(name);
  });

  it.each(formationNames)('%s labels every slot', name => {
    for (const slot of FORMATIONS[name].slots) {
      expect(slot.label.length).toBeGreaterThan(0);
    }
  });
});

describe('getFormation', () => {
  it('returns the requested formation', () => {
    expect(getFormation('4-3-3').name).toBe('4-3-3');
  });

  it('falls back to 4-4-2 for an unknown name', () => {
    expect(getFormation('not-a-formation').name).toBe('4-4-2');
  });
});

describe('canFillSlot', () => {
  it('accepts a player who lists the slot position', () => {
    expect(canFillSlot(['CM', 'CDM'], 'CDM')).toBe(true);
  });

  it('lets a player cover an adjacent role', () => {
    // A left-back covers left wing-back. Requiring an exact match here made
    // several formations unfillable; see positionFit.test.ts for the model.
    expect(canFillSlot(['LB'], 'LWB')).toBe(true);
  });

  it('still refuses a position that is nowhere near', () => {
    expect(canFillSlot(['LB'], 'ST')).toBe(false);
    expect(canFillSlot(['LB'], 'RB')).toBe(false);
  });

  it('rejects a player with no positions', () => {
    expect(canFillSlot([], 'ST')).toBe(false);
  });

  it('lets every formation slot be filled by a specialist in that position', () => {
    for (const name of formationNames) {
      for (const slot of FORMATIONS[name].slots) {
        expect(canFillSlot([slot.position as Position], slot.position)).toBe(true);
      }
    }
  });
});

describe('playerInitials', () => {
  it('takes the first and last initial of a full name', () => {
    expect(playerInitials('Dennis Bergkamp')).toBe('DB');
  });

  it('skips middle names', () => {
    expect(playerInitials('Ruud van Nistelrooy')).toBe('RN');
  });

  it('uses the first two letters of a single name', () => {
    expect(playerInitials('Lauren')).toBe('LA');
  });

  it('tolerates surrounding and repeated whitespace', () => {
    expect(playerInitials('  Thierry   Henry  ')).toBe('TH');
  });
});
