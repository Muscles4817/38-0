// Aggregates roster files into one entry per human.
//
// Pure: no filesystem. The script and the tests both use it.
//
// Identity is the FBref player id, which is stable across clubs and seasons.
// Names are not — the same player is spelled differently by different sources,
// and a name match would fragment a twenty-year career into twenty people.

/** Fallback for the rare row with no FBref id. */
export function nameKey(name) {
  return `name:${String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()}`;
}

export function identityKey(player) {
  return player.fbrefId ? `fbref:${player.fbrefId}` : nameKey(player.name);
}

/**
 * Groups roster files into one entry per player.
 *
 * Takes an array of `{ season, club, competition, squad }` and returns
 * `{ players, playerSeasons, idless }` — the aggregated players, how many
 * player-seasons went in, and any rows that had no FBref id to match on.
 */
export function buildPlayerList(rosters) {
  const byKey = new Map();
  const idless = [];
  let playerSeasons = 0;

  for (const roster of rosters) {
    for (const p of roster.squad ?? []) {
      const key = identityKey(p);
      if (!p.fbrefId) idless.push(`${roster.season} ${roster.club}: ${p.name}`);

      if (!byKey.has(key)) {
        byKey.set(key, {
          fbrefId: p.fbrefId ?? null,
          name: p.name,
          names: new Set([p.name]),
          nation: p.nation ?? null,
          seasons: [],
        });
      }
      const entry = byKey.get(key);
      entry.names.add(p.name);
      if (!entry.nation && p.nation) entry.nation = p.nation;

      entry.seasons.push({
        season: roster.season,
        club: roster.club,
        competition: roster.competition,
        age: p.age ?? null,
        matchesPlayed: p.matchesPlayed ?? 0,
        starts: p.starts ?? 0,
        minutes: p.minutes ?? 0,
        goals: p.goals ?? null,
        assists: p.assists ?? null,
        fbrefPosition: p.fbrefPosition ?? null,
        positionBuckets: p.positionBuckets ?? [],
      });
      playerSeasons++;
    }
  }

  const players = [...byKey.values()].map(p => {
    const seasons = p.seasons.slice().sort(
      (a, b) => a.season.localeCompare(b.season) || b.minutes - a.minutes);
    const labels = seasons.map(s => s.season);

    return {
      fbrefId: p.fbrefId,
      name: p.name,
      aliases: [...p.names].filter(n => n !== p.name),
      nation: p.nation,
      seasonCount: seasons.length,
      totalMinutes: seasons.reduce((n, s) => n + (s.minutes ?? 0), 0),
      firstSeason: labels[0],
      lastSeason: labels[labels.length - 1],
      positionBuckets: [...new Set(seasons.flatMap(s => s.positionBuckets ?? []))],
      // A mid-season transfer is real, not an error. Recorded here; the ratings
      // phase decides which club the player belongs to (see ratings.md).
      transferSeasons: [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))],
      seasons,
    };
  });

  // Most-played first, so the players who matter most get rated first.
  players.sort((a, b) => b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name));

  return { players, playerSeasons, idless };
}
