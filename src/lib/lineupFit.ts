import {
  FORMATIONS, Formation, Position, canFillSlot, fillsSlotNaturally, slotFit,
} from './formations';

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
 *
 * Players may cover an adjacent position - a left-back at left wing-back, a
 * central midfielder as a holder - so a shape is not ruled out just because
 * nobody's listed position matches a slot exactly. Natural fits are preferred:
 * a formation nobody has to be shoehorned into beats one that needs it.
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
  /** How many of the eleven are in a position they actually play. */
  natural: number;
}

/**
 * Matches players to formation slots.
 *
 * Two passes, and the order matters. The first uses only natural fits, so
 * everyone who has a slot they actually play gets it. The second fills what is
 * left by asking players to cover an adjacent position.
 *
 * Doing it in one pass over the combined graph would fill the same number of
 * slots but could put a player in a slot he merely covers while his natural one
 * went to someone else — a right-back at right wing-back with the wing-back at
 * right-back. Maximum cardinality is not the same as a sensible team.
 */
function matchSlots(players: FittablePlayer[], formation: Formation): (number | null)[] {
  const slotCount = formation.slots.length;
  const slotTakenBy: (number | null)[] = Array(slotCount).fill(null);
  const placed = new Set<number>();

  // Most minutes first, so a fully-filled XI favours the players who played.
  const ordered = players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.minutes - a.p.minutes)
    .map(({ i }) => i);

  // ── Pass 1: natural fits only, with augmenting so nobody blocks anyone ──
  const tryNatural = (playerIndex: number, seen: boolean[]): boolean => {
    for (let s = 0; s < slotCount; s++) {
      if (seen[s]) continue;
      if (!fillsSlotNaturally(players[playerIndex].positions, formation.slots[s].position)) continue;
      seen[s] = true;
      const current = slotTakenBy[s];
      if (current === null || tryNatural(current, seen)) {
        slotTakenBy[s] = playerIndex;
        return true;
      }
    }
    return false;
  };

  for (const i of ordered) {
    if (tryNatural(i, Array(slotCount).fill(false))) placed.add(i);
  }
  // Anyone displaced during augmenting is still matched somewhere.
  placed.clear();
  for (const taken of slotTakenBy) if (taken !== null) placed.add(taken);

  // ── Pass 2: cover the rest, without disturbing the natural placements ──
  const emptySlots = slotTakenBy
    .map((taken, slotIndex) => ({ taken, slotIndex }))
    .filter(x => x.taken === null)
    .map(x => x.slotIndex);

  for (const slotIndex of emptySlots) {
    const slot = formation.slots[slotIndex].position;
    const candidate = ordered.find(i =>
      !placed.has(i) && canFillSlot(players[i].positions, slot));
    if (candidate !== undefined) {
      slotTakenBy[slotIndex] = candidate;
      placed.add(candidate);
    }
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
    natural: slots.filter(s => slotFit(s.player.positions, s.position) === 'exact').length,
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
    b.natural - a.natural ||        // prefer a shape nobody is shoehorned into
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
    .filter(f => f.filled === best.filled && f.natural === best.natural &&
                 f.minutes === best.minutes)
    .map(f => f.formation);
}
