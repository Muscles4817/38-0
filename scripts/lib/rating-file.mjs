// Validation for the rating batch files in data/raw/ratings/.
//
// Ratings are per player-SEASON, not per player: a 22-year-old and a 34-year-old
// are different footballers. That is the whole reason a player's career is rated
// in one pass — the arc has to make sense, and it cannot if twenty agents each
// see one season.
//
// Pure: no filesystem. The scripts and the tests both use it.

/** A jump larger than this between adjacent seasons wants explaining. */
export const MAX_UNEXPLAINED_SWING = 8;

export function checkRatingEntry(player, { validRoles = null } = {}) {
  const problems = [];
  const warnings = [];
  const who = player?.name ?? 'player';

  if (!player || !Array.isArray(player.seasons) || player.seasons.length === 0) {
    return { problems: [`${who}: no seasons`], warnings };
  }

  if (!['high', 'medium', 'low'].includes(player.confidence)) {
    problems.push(`${who}: confidence must be high, medium or low`);
  }

  for (const s of player.seasons) {
    const where = `${who} ${s.season}`;
    if (typeof s.rating !== 'number' || !Number.isInteger(s.rating)) {
      problems.push(`${where}: rating must be a whole number`);
      continue;
    }
    if (s.rating < 40 || s.rating > 99) {
      problems.push(`${where}: rating ${s.rating} is outside 40-99`);
    }
    if (s.roles !== undefined) {
      if (!Array.isArray(s.roles)) {
        problems.push(`${where}: "roles" must be an array`);
      } else if (validRoles) {
        for (const r of s.roles) {
          if (!validRoles.includes(r)) problems.push(`${where}: unknown role "${r}"`);
        }
      }
    }
  }

  // The career arc. A player can fall off a cliff or break through, but a
  // sudden swing with no explanation is usually two agents' worth of drift
  // rather than a real change — and here it would be one agent contradicting
  // itself, which is worse.
  const rated = player.seasons
    .filter(s => typeof s.rating === 'number')
    .slice()
    .sort((a, b) => String(a.season).localeCompare(String(b.season)));

  for (let i = 1; i < rated.length; i++) {
    const prev = rated[i - 1];
    const curr = rated[i];
    const swing = Math.abs(curr.rating - prev.rating);
    if (swing > MAX_UNEXPLAINED_SWING && !String(curr.note ?? '').trim()) {
      problems.push(
        `${who}: ${prev.season} ${prev.rating} to ${curr.season} ${curr.rating} ` +
        `is a ${swing}-point swing with no note explaining it`
      );
    } else if (swing > MAX_UNEXPLAINED_SWING) {
      warnings.push(`${who}: ${swing}-point swing ${prev.season} to ${curr.season} — ${curr.note}`);
    }
  }

  // A player who moved mid-season is the same footballer at both clubs, so the
  // two club rows should carry the same rating. The pilot produced 81 and 80
  // for one keeper's single season, which is not a judgement about him but
  // about the spec being silent.
  const bySeason = new Map();
  for (const s of player.seasons) {
    if (typeof s.rating !== 'number') continue;
    if (!bySeason.has(s.season)) bySeason.set(s.season, []);
    bySeason.get(s.season).push(s);
  }
  for (const [season, rows] of bySeason) {
    if (rows.length < 2) continue;
    const distinct = new Set(rows.map(r => r.rating));
    // A hard rule, not a nudge. Allowing a note to excuse the difference was
    // too loose: the pilot wrote a note about the transfer, which is not the
    // same as a reason the player was better at one club than the other.
    if (distinct.size > 1) {
      problems.push(
        `${who} ${season}: rated ${[...distinct].join(' and ')} at different clubs ` +
        `in the same season. Ability does not change with the club — the same ` +
        `season gets the same rating.`
      );
    }
  }

  return { problems, warnings };
}

/** Distribution across a whole batch, for spotting an agent that has drifted. */
export function ratingSpread(players) {
  const all = players.flatMap(p =>
    (p.seasons ?? []).map(s => s.rating).filter(r => typeof r === 'number'));
  if (all.length === 0) return null;
  const sorted = all.slice().sort((a, b) => a - b);
  const band = (lo, hi) => all.filter(r => r >= lo && r <= hi).length;
  return {
    count: all.length,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
    mean: Number((all.reduce((a, b) => a + b, 0) / all.length).toFixed(1)),
    bands: {
      '95+': band(95, 99), '90-94': band(90, 94), '85-89': band(85, 89),
      '80-84': band(80, 84), '75-79': band(75, 79), '70-74': band(70, 74),
      'under70': band(0, 69),
    },
  };
}
