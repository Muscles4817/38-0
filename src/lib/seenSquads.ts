// ── Squads the draft has offered ─────────────────────────
//
// "What Could Have Been" on the results page builds the best XI the draft
// could have produced, so the draft records each squad it lands on and which
// pick it was for. A pick takes one player from one spin: the squad landed on,
// or one a reroll moved away from at that pick, never two of them. It records
// only which club-season it was; the players are already in the snapshot and
// are looked up again when the results page needs them.
//
// It used to store a full copy of every squad, about 2.5 KB a spin, and the
// home page never cleared the list. After roughly 2,000 spins a browser hit
// its 5 MB localStorage quota, the write threw inside spin(), and the Spin
// button did nothing: sometimes, because whether a squad still fitted depended
// on which one was drawn. parseSeenSquads drops entries in that old shape, so
// rewriting the key with what it returns is also how a full browser gets its
// space back.

import { getClub, getSeason, getSquad, type DataPlayer } from './gameData';

export const SEEN_SQUADS_KEY = '38-0-seen-squads';

/** What is stored per spin: a pointer into the snapshot, about 30 bytes. */
export interface SeenSquadRef {
  clubId: number;
  seasonId: number;
  /**
   * Which pick it was offered for, counting from 0: a spin and its rerolls
   * share one. Absent in a list recorded before picks were, where each squad
   * counts as a pick of its own.
   */
  pick?: number;
}

/** A recorded squad with its players looked up, as the results page uses it. */
export interface SeenSquad {
  clubName: string;
  seasonLabel: string;
  players: DataPlayer[];
  pick?: number;
}

function isRef(entry: unknown): entry is SeenSquadRef {
  if (typeof entry !== 'object' || entry === null) return false;
  const { clubId, seasonId } = entry as Record<string, unknown>;
  return Number.isInteger(clubId) && Number.isInteger(seasonId);
}

/**
 * The stored value as a list of references. Anything else, including the old
 * full-copy entries (which carry no ids), is dropped rather than migrated: it
 * only ever described a draft that is already over.
 */
export function parseSeenSquads(stored: unknown): SeenSquadRef[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter(isRef).map(({ clubId, seasonId, pick }) =>
    (Number.isInteger(pick) ? { clubId, seasonId, pick } : { clubId, seasonId }));
}

/**
 * Adds a squad to the list, for the pick it was offered for. The same squad
 * landed on again for a later pick is a second chance to take a player from
 * it, so it is recorded again; for the same pick it is not. A draft is eleven
 * picks and a few rerolls, so the list stays a few dozen entries.
 */
export function withSeenSquad(list: SeenSquadRef[], ref: SeenSquadRef): SeenSquadRef[] {
  if (list.some(s => s.clubId === ref.clubId && s.seasonId === ref.seasonId && s.pick === ref.pick)) return list;
  return [...list, ref.pick === undefined
    ? { clubId: ref.clubId, seasonId: ref.seasonId }
    : { clubId: ref.clubId, seasonId: ref.seasonId, pick: ref.pick }];
}

/**
 * The squads grouped by the pick they were offered for, in pick order. A
 * squad recorded without a pick is a group of its own.
 */
export function groupByPick<T extends { pick?: number }>(squads: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  squads.forEach((squad, i) => {
    const key = squad.pick === undefined ? `solo-${i}` : `pick-${squad.pick}`;
    groups.set(key, [...(groups.get(key) ?? []), squad]);
  });
  return [...groups.values()];
}

/** Looks each reference up in the snapshot, skipping any it no longer holds. */
export function resolveSeenSquads(refs: SeenSquadRef[]): SeenSquad[] {
  const squads: SeenSquad[] = [];
  for (const { clubId, seasonId, pick } of refs) {
    const club   = getClub(clubId);
    const season = getSeason(seasonId);
    const squad  = getSquad(clubId, seasonId);
    if (!club || !season || !squad) continue;
    squads.push({
      clubName: club.name, seasonLabel: season.label, players: squad.players,
      ...(pick === undefined ? {} : { pick }),
    });
  }
  return squads;
}
