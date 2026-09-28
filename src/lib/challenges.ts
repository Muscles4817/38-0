// ── Challenge modes ────────────────────────────────────
//
// Three of these are filters on the draft pool (see draftPool.ts). The other
// three are shortcuts for settings the setup page already has: an era, or a
// difficulty plus a random formation. They are listed together because to a
// player they are all "a harder draft", but only the filters reach the draft.

import type { DraftFilter } from './draftPool';

export type ChallengeId =
  | 'none'
  | 'one-club'
  | 'one-nation'
  | 'budget'
  | 'golden-era'
  | 'modern-masters'
  | 'pure-chaos';

export const CHALLENGES: { id: ChallengeId; label: string; description: string }[] = [
  { id: 'none',           label: 'None',              description: 'The standard draft' },
  { id: 'one-club',       label: '🏟️ One Club',       description: 'Every season of one club' },
  { id: 'one-nation',     label: '🌍 One Nation',     description: 'Players of one nationality' },
  { id: 'budget',         label: '💰 Budget XI',      description: 'Every player rated 78 or below' },
  { id: 'golden-era',     label: '⏳ Golden Era',     description: '1992/93 to 2004/05 only' },
  { id: 'modern-masters', label: '⚡ Modern Masters', description: '2015/16 onwards only' },
  { id: 'pure-chaos',     label: '🎲 Pure Chaos',     description: 'No rerolls, ratings hidden, random formation' },
];

export const BUDGET_MAX_RATING = 78;

/** Era challenges, as the setup page's year range (end exclusive). */
export const CHALLENGE_ERAS: Partial<Record<ChallengeId, { start: number; end: number }>> = {
  'golden-era':     { start: 1992, end: 2005 },
  'modern-masters': { start: 2015, end: 2026 },
};

/** How a stored filter reads back to the player, e.g. "One Nation · France". */
export function describeFilter(filter: DraftFilter | null, clubName: (id: number) => string | null): string | null {
  if (!filter) return null;
  switch (filter.kind) {
    case 'club':       return `One Club · ${clubName(filter.clubId) ?? 'Unknown club'}`;
    case 'nation':     return `One Nation · ${filter.nation}`;
    case 'max-rating': return `Budget XI · ${filter.maxRating} or below`;
  }
}
