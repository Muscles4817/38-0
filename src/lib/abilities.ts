// The abilities: what a player can be good or bad at.
//
// This is the one list. A trait (a label a person picks in the editor) is a
// recipe of these; the match engine reads these and never a trait's name. Each
// ability has one meaning, and is scored from −3 to +3 per trait, where 0 is
// "what his rating implies" and a negative is a real weakness.
//
// The target design — every ability the game should have, and what each does
// in a match — is docs/abilities.md. This file holds the ones that exist.
//
// Pure data with no imports, so the game, the editor seeds and the tests can
// all share it.

/** Which part of the game an ability belongs to. See docs/abilities.md. */
export type AbilityFamily =
  | 'movement' | 'onTheBall' | 'shooting' | 'physical'
  | 'defending' | 'goalkeeping' | 'mental';

/**
 * A skill improves with the rating: a 90-rated centre-back passes decently
 * with no trait saying so. A gift does not: a 90-rated striker is not fast or
 * tall because he is 90-rated. Where the engine adds a rating baseline to an
 * ability, it may only do so for a skill.
 */
export type AbilityKind = 'skill' | 'gift';

export interface AbilityDefinition {
  family: AbilityFamily;
  kind: AbilityKind;
  /** What the ability means, in the editor's words. */
  description: string;
}

export const ABILITIES = {
  // Movement (off the ball). See docs/movement.md.
  boxMovement: { family: 'movement', kind: 'skill', description: 'In the right place in the box; gets on the end of it' },
  attackingTheBox: { family: 'movement', kind: 'skill', description: 'Commits to the box when the ball goes wide, from any position' },
  lateRuns: { family: 'movement', kind: 'skill', description: 'Arrives late from midfield, unmarked, for the cut-back or second ball' },
  runsInBehind: { family: 'movement', kind: 'skill', description: "Plays on the last defender's shoulder and goes beyond him" },
  channelRuns: { family: 'movement', kind: 'skill', description: 'Moves from wide into the gap between full-back and centre-back' },

  // On the ball
  pressResist: { family: 'onTheBall', kind: 'skill', description: 'Keeps the ball under pressure' },
  creation: { family: 'onTheBall', kind: 'skill', description: 'Unlocks a set defence' },
  dribble: { family: 'onTheBall', kind: 'skill', description: 'Beats a man one on one' },
  setPiece: { family: 'onTheBall', kind: 'skill', description: 'Dead-ball delivery' },

  // Shooting
  longShot: { family: 'shooting', kind: 'skill', description: 'Shoots from distance' },
  penalty: { family: 'shooting', kind: 'skill', description: 'Takes penalties' },

  // Physical
  pace: { family: 'physical', kind: 'gift', description: 'Genuine speed; runs in behind' },
  aerial: { family: 'physical', kind: 'gift', description: 'Wins the ball in the air' },

  // Defending
  pressing: { family: 'defending', kind: 'skill', description: 'Presses from the front or through midfield' },
  recovery: { family: 'defending', kind: 'skill', description: 'Gets back and covers the space behind the defence' },
  defending: { family: 'defending', kind: 'skill', description: 'Defends in a set block' },

  // Goalkeeping
  shotStopping: { family: 'goalkeeping', kind: 'skill', description: 'Saves shots he sees coming: positioning and handling' },
  reflexes: { family: 'goalkeeping', kind: 'skill', description: 'Saves from close range: reactions' },
  claiming: { family: 'goalkeeping', kind: 'skill', description: 'Commands his box; claims crosses' },

  // Mental
  discipline: { family: 'mental', kind: 'skill', description: 'Stays on his feet. Negative means he does not.' },
} as const satisfies Record<string, AbilityDefinition>;

export type Ability = keyof typeof ABILITIES;

/** The abilities a rating says something about. */
export type Skill = {
  [A in Ability]: (typeof ABILITIES)[A]['kind'] extends 'skill' ? A : never
}[Ability];

export const ABILITY_NAMES = Object.keys(ABILITIES) as Ability[];

export function isAbility(name: string): name is Ability {
  return Object.prototype.hasOwnProperty.call(ABILITIES, name);
}

export function isSkill(name: Ability): name is Skill {
  return ABILITIES[name].kind === 'skill';
}

/**
 * Abilities that exist but that no moment of a match reads yet, each with why.
 * Nothing should be here for long: an ability nobody reads is decorative, and
 * the test that checks every ability is read allows exactly these.
 */
export const NOT_YET_READ: Partial<Record<Ability, string>> = {
  longShot: 'Who shoots from distance still comes from role affinity and the goal multiplier.',
};

/**
 * Abilities the engine reads but that no trait gives yet, each with why.
 * The test that checks every ability can be expressed allows exactly these.
 */
export const NOT_YET_GIVEN: Partial<Record<Ability, string>> = {
  defending: 'The block reads it; Ball Winner and Tracks Back are designed in docs/abilities.md but not built.',
};
