// ── Squads the draft has offered ─────────────────────────
//
// "What Could Have Been" on the results page builds the best XI from every
// squad the draft showed, so the draft records each one it lands on. It records
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
}

/** A recorded squad with its players looked up, as the results page uses it. */
export interface SeenSquad {
  clubName: string;
  seasonLabel: string;
  players: DataPlayer[];
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
  return stored.filter(isRef).map(({ clubId, seasonId }) => ({ clubId, seasonId }));
}

/**
 * Adds a squad to the list. A squad seen twice offers nothing new to the best
 * XI, so it is recorded once, which also caps the list at one entry per
 * club-season in the snapshot.
 */
export function withSeenSquad(list: SeenSquadRef[], ref: SeenSquadRef): SeenSquadRef[] {
  if (list.some(s => s.clubId === ref.clubId && s.seasonId === ref.seasonId)) return list;
  return [...list, { clubId: ref.clubId, seasonId: ref.seasonId }];
}

/** Looks each reference up in the snapshot, skipping any it no longer holds. */
export function resolveSeenSquads(refs: SeenSquadRef[]): SeenSquad[] {
  const squads: SeenSquad[] = [];
  for (const { clubId, seasonId } of refs) {
    const club   = getClub(clubId);
    const season = getSeason(seasonId);
    const squad  = getSquad(clubId, seasonId);
    if (!club || !season || !squad) continue;
    squads.push({ clubName: club.name, seasonLabel: season.label, players: squad.players });
  }
  return squads;
}
