import { describe, expect, it } from 'vitest';
import { blocksSave, checkTraits, traitDefinitions, type TraitDefinition } from './traitRules';
import { gameData } from './gameData';

const defs: TraitDefinition[] = traitDefinitions(gameData.roles);
const rules = (traits: string[], positions: string[]) => checkTraits(traits, positions, defs).map(i => i.rule);

describe('traits that cannot work are blocked', () => {
  it('B1: a trait the game does not define', () => {
    expect(rules(['Superstar'], ['ST'])).toContain('B1');
  });

  it('B2: the same trait twice', () => {
    expect(rules(['Pacey', 'Pacey'], ['ST'])).toContain('B2');
  });

  it('B3: a goalkeeper trait on a player who does not play in goal', () => {
    expect(rules(['ShotStopper'], ['CB'])).toContain('B3');
    expect(rules(['ShotStopper'], ['GK'])).not.toContain('B3');
  });

  it('B4: a trait with no abilities whose weights apply in none of his positions', () => {
    // AttackingFullback has no abilities and applies only at full-back.
    expect(rules(['AttackingFullback'], ['RM'])).toContain('B4');
    expect(rules(['AttackingFullback'], ['RB', 'RM'])).not.toContain('B4');
  });

  it('stops a save only for a block', () => {
    expect(blocksSave(checkTraits(['ShotStopper'], ['CB'], defs))).toBe(true);
    expect(blocksSave(checkTraits(['Pacey', 'Ponderous'], ['CB'], defs))).toBe(false);
  });
});

describe('traits that work, but probably not as meant, are warned about', () => {
  it('B5: a strength and the weakness that cancels it', () => {
    const issue = checkTraits(['Pacey', 'Ponderous'], ['CB'], defs).find(i => i.rule === 'B5');
    expect(issue?.level).toBe('warn');
  });

  it('W1: AerialThreat on a striker, but not on a centre-back', () => {
    expect(rules(['AerialThreat'], ['ST'])).toContain('W1');
    expect(rules(['AerialThreat'], ['CB'])).not.toContain('W1');
  });

  it('W2: a trait with abilities whose weights apply in none of his positions', () => {
    // Anchor has abilities and applies only at CDM.
    expect(rules(['Anchor'], ['CM'])).toContain('W2');
    expect(rules(['Anchor'], ['CDM', 'CM'])).not.toContain('W2');
  });

  it('W3: two traits favouring the same chance, once per pair', () => {
    const issues = checkTraits(['AerialThreat', 'TargetMan'], ['CB'], defs).filter(i => i.rule === 'W3');
    // They share headers, crosses and set pieces: one warning naming all three.
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('headers');
    expect(issues[0].message).toContain('set pieces');
  });

  it('lets a trequartista or poacher who presses carry a pressing trait', () => {
    expect(checkTraits(['Trequartista', 'PressingForward'], ['CAM', 'CF'], defs)).toEqual([]);
    expect(checkTraits(['Poacher', 'PressingForward'], ['ST'], defs)).toEqual([]);
  });
});

describe('the shipped snapshot', () => {
  it('has no player whose traits break a block rule', () => {
    const club = new Map(gameData.clubs.map(c => [c.id, c.name]));
    const season = new Map(gameData.seasons.map(s => [s.id, s.label]));
    const broken: string[] = [];
    for (const squad of gameData.squads) {
      for (const p of squad.players) {
        for (const issue of checkTraits(p.roles ?? [], p.positions, defs)) {
          if (issue.level === 'block') {
            broken.push(`${p.name} (${club.get(squad.clubId)} ${season.get(squad.seasonId)}): ${issue.message}`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
