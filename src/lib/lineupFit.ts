import { FORMATIONS, Formation, Position, canFillSlot } from './formations';

/**
 * Working out which formation a side actually played, from who played and where.
 *
 * Formation does not need researching. Once each player has positions, the
 * shape falls out of the data: take the players who played the most, and find
 * the formation whose eleven slots they fill best. A squad of one keeper, four
 * defenders, four midfielders and two forwards is a 4-4-2 whether or not
 * anybody wrote that down.
 *
 * This is deliberately deterministic. A formation derived from minutes played
 * is reproducible and auditable; one recalled by an agent is neither.
 */

export interface FittablePlayer {
  name: string;
  positions: Position[];
  /** Minutes played that season. Drives who makes the XI. */
  minutes: number;
}

export interface LineupFit {
  formation: string;
  /** Slot index -> player, for the slots that could be filled. */
  slots: { slotIndex: number; position: Position; player: FittablePlayer }[];
  filled: number;
  /** Minutes played by the matched XI — how well the shape matches who played. */
  minutes: number;
}

/**
 * Maximum bipartite matching between players and formation slots.
 *
 * Players are considered in minutes order, and the augmenting-path search keeps
 * every player it has already placed, so a fully-filled XI favours the players
 * who actually played. Slots are exact-match: `canFillSlot` is literal.
 */
function matchSlots(players: FittablePlayer[], formation: Formation): (number | null)[] {
  const slotCount = formation.slots.length;
  // slotForPlayer[i] = slot index taken by player i, or null.
  const slotTakenBy: (number | null)[] = Array(slotCount).fill(null);

  const tryAssign = (playerIndex: number, seen: boolean[]): boolean => {
    for (let s = 0; s < slotCount; s++) {
      if (seen[s]) continue;
      if (!canFillSlot(players[playerIndex].positions, formation.slots[s].position)) continue;
      seen[s] = true;
      const current = slotTakenBy[s];
      // Take the slot, or bump whoever has it if they can go elsewhere.
      if (current === null || tryAssign(current, seen)) {
        slotTakenBy[s] = playerIndex;
        return true;
      }
    }
    return false;
  };

  const ordered = players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.minutes - a.p.minutes);

  for (const { i } of ordered) {
    tryAssign(i, Array(slotCount).fill(false));
  }
  return slotTakenBy;
}

/** How well one formation fits a squad. */
export function fitFormation(players: FittablePlayer[], formationName: string): LineupFit {
  const formation = FORMATIONS[formationName];
  const taken = matchSlots(players, formation);

  const slots = taken
    .map((playerIndex, slotIndex) => ({ playerIndex, slotIndex }))
    .filter((s): s is { playerIndex: number; slotIndex: number } => s.playerIndex !== null)
    .map(({ playerIndex, slotIndex }) => ({
      slotIndex,
      position: formation.slots[slotIndex].position,
      player: players[playerIndex],
    }));

  return {
    formation: formationName,
    slots,
    filled: slots.length,
    minutes: slots.reduce((n, s) => n + s.player.minutes, 0),
  };
}

/**
 * The formation this squad most likely played.
 *
 * Ranked by how many slots can be filled at all, then by the minutes of the
 * players filling them — so a shape that accommodates the regular starters
 * beats one that only works by picking fringe players.
 */
export function bestFormation(
  players: FittablePlayer[],
  formationNames: string[] = Object.keys(FORMATIONS),
): LineupFit {
  const fits = formationNames.map(name => fitFormation(players, name));
  fits.sort((a, b) =>
    b.filled - a.filled ||
    b.minutes - a.minutes ||
    a.formation.localeCompare(b.formation));   // stable when genuinely tied
  return fits[0];
}

/**
 * Every formation that fits equally well, so a genuine ambiguity is visible
 * rather than silently resolved by alphabetical order.
 */
export function equallyGoodFormations(
  players: FittablePlayer[],
  formationNames: string[] = Object.keys(FORMATIONS),
): string[] {
  const best = bestFormation(players, formationNames);
  return formationNames
    .map(name => fitFormation(players, name))
    .filter(f => f.filled === best.filled && f.minutes === best.minutes)
    .map(f => f.formation);
}
