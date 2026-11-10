// The abilities are one list, and the match engine reads them only through
// moments that declare what they read. These tests hold that structure in
// place: nothing decorative, nothing read that is not declared, and a rating
// baseline only ever added to a skill. See docs/abilities.md.

import { describe, it, expect } from 'vitest';
import { ABILITIES, ABILITY_NAMES, NOT_YET_READ, NOT_YET_GIVEN, isAbility } from './abilities';
import { MOMENT_READS, PHASES } from './matchEngine';

const read = new Set(Object.values(MOMENT_READS).flat());

describe('the abilities', () => {
  it('are each read by some moment of a match', () => {
    // An ability no moment reads is decorative: a trait that gives it does
    // nothing in a match, whatever its description says.
    const unread = ABILITY_NAMES.filter(a => !read.has(a) && !(a in NOT_YET_READ));
    expect(unread, `abilities nothing reads: ${unread.join(', ')}`).toEqual([]);
  });

  it('only list as not yet read the ones that really are not', () => {
    // So the list cannot go stale: once something reads an ability, it must
    // come off the list.
    const readAfterAll = Object.keys(NOT_YET_READ).filter(a => read.has(a as never));
    expect(readAfterAll).toEqual([]);
  });

  it('are the only thing a moment reads', () => {
    for (const [moment, abilities] of Object.entries(MOMENT_READS)) {
      for (const a of abilities) expect(isAbility(a), `${moment} reads unknown "${a}"`).toBe(true);
    }
  });

  it('list their exceptions by name, with a reason', () => {
    for (const [a, why] of Object.entries({ ...NOT_YET_READ, ...NOT_YET_GIVEN })) {
      expect(isAbility(a), a).toBe(true);
      expect(why, a).toBeTruthy();
    }
  });

  it('let a rating count toward a phase only when every ability in it is a skill', () => {
    // A 90-rated striker is not fast or tall because he is 90-rated; he is
    // decent on the ball. Checked by name too, so changing an ability's kind
    // shows up here as the behaviour change it is.
    for (const [phase, spec] of Object.entries(PHASES)) {
      const allSkills = Object.keys(spec.ability).every(a => ABILITIES[a as keyof typeof ABILITIES].kind === 'skill');
      expect(spec.rated, phase).toBe(allSkills);
    }
    const unrated = Object.entries(PHASES).filter(([, s]) => !s.rated).map(([p]) => p).sort();
    expect(unrated).toEqual(['aerialAttack', 'aerialDefence', 'break']);
  });
});
