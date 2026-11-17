import { describe, expect, it } from 'vitest';
import { goalStyle, lateWinnerText, onlyGoalText, type GoalLine } from './momentText';

const note = (position: string, ...traits: string[]) => ({ position: position as never, traits });

describe('how a goal reads', () => {
  it('follows the chance and who took it', () => {
    expect(goalStyle('longShot', note('CM', 'LongShot'))).toBe('screamer');
    expect(goalStyle('cross', note('ST', 'TargetMan'))).toBe('header');
    expect(goalStyle('cross', note('ST', 'Poacher'))).toBe('poacher');
    expect(goalStyle('throughBall', note('ST', 'Pacey'))).toBe('breakaway');
    expect(goalStyle('individual', note('LW', 'Dribbler'))).toBe('solo');
    expect(goalStyle('setPiece', note('CM', 'SetPieceDeliverer'))).toBe('free-kick');
    expect(goalStyle('setPiece', note('CB'))).toBe('set-piece-header');
    expect(goalStyle('penalty')).toBe('penalty');
    expect(goalStyle(undefined)).toBe('scramble');
  });
});

describe('a moment, said', () => {
  const winner = (week: number, g: Partial<GoalLine> = {}) =>
    lateWinnerText(week, { name: 'Steven Gerrard', opp: 'Everton', minute: 88, ...g });

  it('reads the same every time it is shown', () => {
    expect(winner(12)).toBe(winner(12));
  });

  it('is said several ways across a season, always naming the scorer and the opponent', () => {
    const lines = new Set(Array.from({ length: 38 }, (_, w) => winner(w + 1)));
    expect(lines.size).toBeGreaterThanOrEqual(4);
    for (const l of lines) {
      expect(l).toContain('Gerrard');
      expect(l).toContain('Everton');
    }
  });

  it('sounds like the scorer: a long-range specialist\'s winner from distance is mostly said as one', () => {
    const lines = Array.from({ length: 40 }, (_, w) => winner(w + 1, { chance: 'longShot', scorer: note('CM', 'LongShot') }));
    const fromDistance = lines.filter(l => /yard|distance|top corner|shoots|thunderbolt|rocket|curler|volley|outside the box/.test(l));
    expect(fromDistance.length / lines.length).toBeGreaterThan(0.6);
  });

  it('makes something of a centre-back scoring', () => {
    const lines = Array.from({ length: 40 }, (_, w) => winner(w + 1, { name: 'Jaap Stam', scorer: note('CB') }));
    expect(lines.some(l => /of all people|Up from the back|centre-forward's job/.test(l))).toBe(true);
  });

  it('says a defender\'s only goal of the season as the event it was', () => {
    const decisive = onlyGoalText(5, 'Gary Neville', 'Spurs', true);
    expect(decisive).toContain('Gary Neville');
    expect(decisive).toMatch(/won|winner|beat/);
    const idle = onlyGoalText(6, 'Gary Neville', 'Spurs', false);
    expect(idle).toMatch(/only|one goal|first and last|collector/);
  });
});
