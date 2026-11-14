// ── The rules for giving a player traits ─────────────────
//
// What the editor checks before it saves a player's traits, and what the
// import of the shipped snapshot is tested against. Two levels:
//
// - **block**: the trait cannot work. The editor will not save it and the API
//   refuses it.
// - **warn**: it works, but probably not as intended. The editor says why and
//   saves anyway.
//
// The rules were agreed one by one; docs/roles.md has the reasoning. Any rule
// that depends on what a trait does reads the trait's definition, so changing
// a trait's positions or abilities in the editor changes what the rules say.

import { ROLE_CHANCE_AFFINITY } from './matchEngine';

export type TraitRuleId = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'W1' | 'W2' | 'W3';

export interface TraitIssue {
  rule: TraitRuleId;
  level: 'block' | 'warn';
  /** The traits it is about. */
  traits: string[];
  message: string;
}

/** What the rules need to know about a trait. */
export interface TraitDefinition {
  name: string;
  /** Positions where its goal and assist weights apply; empty means anywhere. */
  validPositions: string[];
  /** Its abilities, which apply in any position. */
  qualities: Record<string, number>;
}

/**
 * A strength and the weakness that says the opposite about the same ability.
 * The numbers still add up, so this warns rather than blocks.
 */
export const CONTRADICTIONS: { weakness: string; strengths: string[]; ability: string }[] = [
  { weakness: 'Ponderous',          strengths: ['Pacey'], ability: 'pace' },
  { weakness: 'Lightweight',        strengths: ['AerialThreat', 'TargetMan', 'Stopper', 'NoNonsenseDefender'], ability: 'aerial' },
  { weakness: 'FlapsAtCrosses',     strengths: ['CommandingKeeper'], ability: 'claiming crosses' },
  { weakness: 'LooseInPossession',  strengths: ['Carrier', 'BallPlayingDefender', 'Sweeper', 'DeepLyingPlaymaker', 'SweeperKeeper'], ability: 'keeping the ball under pressure' },
  { weakness: 'Immobile',           strengths: ['PressingForward', 'Workhorse', 'BoxToBox', 'Enforcer'], ability: 'pressing' },
  { weakness: 'NoNonsenseDefender', strengths: ['BallPlayingDefender'], ability: 'playing out from the back' },
  { weakness: 'PoorDistribution',   strengths: ['SweeperKeeper'], ability: 'distribution' },
];

/** Where AerialThreat's goal weight decides who takes the chances. */
const STRIKER_POSITIONS = ['ST', 'CF'];

/** Reads trait definitions from the editor's role rows or the snapshot's roles. */
export function traitDefinitions(rows: readonly {
  name: string;
  valid_positions?: string;
  validPositions?: string[];
  qualities?: string | Partial<Record<string, number>> | null;
}[]): TraitDefinition[] {
  const parse = <T>(value: unknown, fallback: T): T => {
    if (typeof value !== 'string') return (value as T) ?? fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  };
  return rows.map(r => ({
    name: r.name,
    validPositions: r.validPositions ?? parse<string[]>(r.valid_positions, []),
    qualities: parse<Record<string, number>>(r.qualities, {}),
  }));
}

/**
 * Every rule a player-season's traits break, blocks first. `positions` are
 * every position he plays, not one slot.
 */
export function checkTraits(
  traits: readonly string[],
  positions: readonly string[],
  definitions: readonly TraitDefinition[],
): TraitIssue[] {
  const issues: TraitIssue[] = [];
  const byName = new Map(definitions.map(d => [d.name, d]));
  const plays = new Set(positions);
  const has = (name: string) => traits.includes(name);

  // B1 — a trait the game does not define is ignored by the engine.
  for (const t of traits) {
    if (!byName.has(t)) {
      issues.push({ rule: 'B1', level: 'block', traits: [t], message: `${t} is not a trait the game defines.` });
    }
  }

  // B2 — the same trait twice would count its abilities twice.
  for (const t of new Set(traits)) {
    if (traits.filter(x => x === t).length > 1) {
      issues.push({ rule: 'B2', level: 'block', traits: [t], message: `${t} is listed more than once.` });
    }
  }

  for (const t of new Set(traits)) {
    const def = byName.get(t);
    if (!def) continue;
    const valid = def.validPositions;
    const reaches = valid.length === 0 || valid.some(p => plays.has(p));
    const hasAbilities = Object.values(def.qualities).some(v => v !== 0);

    // B3 — keeping is read only for the goalkeeper.
    if (valid.length === 1 && valid[0] === 'GK' && !plays.has('GK')) {
      issues.push({
        rule: 'B3', level: 'block', traits: [t],
        message: `${t} is a goalkeeper trait, and he does not play in goal. The engine reads it only for the keeper.`,
      });
      continue;
    }
    // B4 — no abilities, and its weights apply in none of his positions: it
    // does nothing wherever he plays.
    if (!hasAbilities && !reaches) {
      issues.push({
        rule: 'B4', level: 'block', traits: [t],
        message: `${t} does nothing for him: it has no abilities, and its goal and assist weights apply only at ${valid.join(', ')}, none of which he plays.`,
      });
      continue;
    }
    // W2 — its abilities apply, its weights never will.
    if (hasAbilities && !reaches) {
      issues.push({
        rule: 'W2', level: 'warn', traits: [t],
        message: `${t}'s abilities apply wherever he plays, but its goal and assist weights apply only at ${valid.join(', ')}, none of which he plays.`,
      });
    }
  }

  // B5 — a strength and the weakness that cancels it.
  for (const { weakness, strengths, ability } of CONTRADICTIONS) {
    if (!has(weakness)) continue;
    for (const s of strengths) {
      if (has(s)) {
        issues.push({
          rule: 'B5', level: 'warn', traits: [s, weakness],
          message: `${s} and ${weakness} say opposite things about his ${ability}. They partly cancel out.`,
        });
      }
    }
  }

  // W1 — AerialThreat's goal weight is the largest in the data, and on a
  // striker it decides who takes the chances. TargetMan says the same thing.
  if (has('AerialThreat') && STRIKER_POSITIONS.some(p => plays.has(p))) {
    issues.push({
      rule: 'W1', level: 'warn', traits: ['AerialThreat'],
      message: 'AerialThreat on a striker takes most of his side\'s chances (docs/roles.md). TargetMan says he is strong in the air without that.',
    });
  }

  // W3 — two traits that favour the same kind of chance multiply when he
  // finishes one. One warning per set of traits, naming every kind they share.
  const shared = new Map<string, { traits: string[]; types: string[] }>();
  for (const [type, affinity] of Object.entries(ROLE_CHANCE_AFFINITY)) {
    const both = [...new Set(traits)].filter(t => (affinity[t] ?? 1) > 1).sort();
    if (both.length < 2) continue;
    const key = both.join('+');
    const entry = shared.get(key) ?? { traits: both, types: [] };
    entry.types.push(CHANCE_NAMES[type] ?? type);
    shared.set(key, entry);
  }
  for (const { traits: both, types } of shared.values()) {
    issues.push({
      rule: 'W3', level: 'warn', traits: both,
      message: `${both.join(' and ')} both make him better at finishing ${types.join(', ')}, and the two multiply.`,
    });
  }

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1));
}

const CHANCE_NAMES: Record<string, string> = {
  aerial: 'headers', cross: 'crosses', throughBall: 'through balls', individual: 'chances he makes himself',
  longShot: 'long shots', setPiece: 'set pieces',
};

/** Whether any issue stops the traits being saved. */
export function blocksSave(issues: readonly TraitIssue[]): boolean {
  return issues.some(i => i.level === 'block');
}
