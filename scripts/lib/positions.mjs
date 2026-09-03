// Turning FBref's coarse position labels into the fifteen positions the game
// matches literally.
//
// The game needs LB / CB / RB. FBref gives DF. That gap is judgement, and
// judgement is where invented data comes from — so the label is treated as a
// hard constraint rather than a hint: whoever assigns positions never decides
// *whether* someone is a defender, only *which kind*. Everything outside the
// label's bucket is rejected by validation, which removes the whole class of
// error where a centre-back ends up listed as a winger.
//
// FBref orders a combined label by primacy: DFMF is a defender who also played
// midfield, MFDF the reverse. The first bucket therefore constrains the
// player's *primary* position, which is the one the draft cares about most.

export const GAME_POSITIONS = [
  'GK', 'LB', 'CB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF',
];

/** What each FBref bucket allows. */
export const BUCKET_POSITIONS = {
  GK: ['GK'],
  DF: ['LB', 'CB', 'RB', 'LWB', 'RWB'],
  MF: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  FW: ['LW', 'RW', 'ST', 'CF'],
};

/**
 * Splits "DFMF" into ['DF', 'MF'], in the order FBref wrote them.
 * Order matters: the first is the primary role.
 */
export function bucketsOf(label) {
  if (!label) return [];
  const out = [];
  const text = String(label).toUpperCase();
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    if (BUCKET_POSITIONS[pair] && !out.includes(pair)) out.push(pair);
  }
  return out;
}

/** Every game position the label permits. */
export function allowedPositions(label) {
  return bucketsOf(label).flatMap(b => BUCKET_POSITIONS[b]);
}

/** The positions the player's *primary* bucket permits. */
export function primaryPositions(label) {
  const [first] = bucketsOf(label);
  return first ? BUCKET_POSITIONS[first] : [];
}

/**
 * Checks one player's assigned positions against their FBref label.
 *
 * Returns a list of problems; empty means the assignment is consistent with
 * what the source actually recorded.
 */
export function checkAssignment({ name, fbrefPosition, positions }) {
  const problems = [];
  const who = name ?? 'player';

  if (!Array.isArray(positions) || positions.length === 0) {
    return [`${who}: no positions assigned`];
  }
  for (const p of positions) {
    if (!GAME_POSITIONS.includes(p)) problems.push(`${who}: "${p}" is not a position the game knows`);
  }
  if (new Set(positions).size !== positions.length) {
    problems.push(`${who}: the same position listed twice`);
  }
  if (positions.length > 4) {
    problems.push(`${who}: ${positions.length} positions is guesswork, not a record`);
  }

  const buckets = bucketsOf(fbrefPosition);
  if (buckets.length === 0) {
    problems.push(`${who}: FBref position "${fbrefPosition}" not understood`);
    return problems;
  }

  const allowed = allowedPositions(fbrefPosition);
  for (const p of positions) {
    if (GAME_POSITIONS.includes(p) && !allowed.includes(p)) {
      problems.push(
        `${who}: assigned ${p} but FBref recorded them as ${fbrefPosition}, ` +
        `which allows only ${allowed.join(' ')}`
      );
    }
  }

  // The first position listed is the player's main one, and must match the
  // bucket FBref put first.
  const primary = primaryPositions(fbrefPosition);
  if (positions.length && !primary.includes(positions[0])) {
    problems.push(
      `${who}: primary position ${positions[0]} does not match FBref's primary ` +
      `bucket ${buckets[0]} (expected one of ${primary.join(' ')})`
    );
  }

  return problems;
}

/**
 * How much judgement a label leaves. Useful for routing: a goalkeeper needs
 * none, a DFMF needs the most.
 */
export function ambiguity(label) {
  return allowedPositions(label).length;
}
