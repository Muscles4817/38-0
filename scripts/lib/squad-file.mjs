// Validation for the squad staging files in data/squads/.
//
// Pure: no filesystem, no database. The importer and the test suite both use
// it, so a file that fails here never reaches the database and never lands on
// main.

/**
 * Key used to decide whether two spellings are the same person.
 *
 * Squad files are written by many hands across 30+ seasons, so the same player
 * arrives as "Pavel Srnicek" and "Pavel Srnicek" with diacritics. Matching on
 * the raw string would give them two rows in `players` and break the whole
 * point of the three-level model, where one human has many versions.
 */
export function playerKey(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[.'’]/g, '')          // O'Neill / O'Neill / Jr.
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export const VALID_POSITIONS = [
  'GK', 'LB', 'CB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF',
];

/** Anyone with fewer league appearances than this is not part of the squad. */
export const MIN_APPEARANCES = 3;

const SEASON_RE = /^(19|20)\d{2}\/\d{2}$/;

/**
 * Checks one parsed squad file.
 * Returns { errors: string[], warnings: string[] } — errors block the import,
 * warnings are reported and allowed through.
 */
export function validateSquadFile(file, { label = 'squad' } = {}) {
  const errors = [];
  const warnings = [];
  const fail = m => errors.push(`${label}: ${m}`);
  const warn = m => warnings.push(`${label}: ${m}`);

  if (typeof file !== 'object' || file === null) {
    return { errors: [`${label}: not an object`], warnings };
  }

  for (const key of ['club', 'season', 'source', 'players']) {
    if (file[key] === undefined) fail(`missing "${key}"`);
  }
  if (typeof file.club === 'string' && file.club.trim() === '') fail('empty "club"');
  if (typeof file.season === 'string' && !SEASON_RE.test(file.season)) {
    fail(`season "${file.season}" is not in YYYY/YY form`);
  }
  if (typeof file.source === 'string' && !/^https?:\/\//.test(file.source)) {
    fail('"source" must be a URL the roster was taken from');
  }
  if (!Array.isArray(file.players)) {
    return { errors: errors.length ? errors : [`${label}: "players" must be an array`], warnings };
  }

  if (file.players.length < 11) {
    fail(`only ${file.players.length} players; a squad needs at least 11`);
  }

  const seenNames = new Set();
  let keepers = 0;

  file.players.forEach((p, i) => {
    const who = p && typeof p.name === 'string' && p.name.trim() ? p.name : `player[${i}]`;
    const bad = m => fail(`${who}: ${m}`);

    if (!p || typeof p !== 'object') { fail(`player[${i}] is not an object`); return; }
    if (typeof p.name !== 'string' || !p.name.trim()) bad('missing name');
    if (typeof p.nationality !== 'string' || !p.nationality.trim()) bad('missing nationality');

    const key = playerKey(p.name);
    if (seenNames.has(key)) bad('listed twice in this squad');
    seenNames.add(key);

    if (!Array.isArray(p.positions) || p.positions.length === 0) {
      bad('needs at least one position');
    } else {
      for (const pos of p.positions) {
        if (!VALID_POSITIONS.includes(pos)) bad(`unknown position "${pos}"`);
      }
      if (p.positions.length > 4) warn(`${who}: ${p.positions.length} positions looks like guesswork`);
      if (p.positions.includes('GK')) keepers++;
    }

    if (typeof p.rating !== 'number' || !Number.isInteger(p.rating)) {
      bad('rating must be a whole number');
    } else if (p.rating < 40 || p.rating > 99) {
      bad(`rating ${p.rating} is outside 40-99`);
    }

    if (typeof p.appearances !== 'number' || !Number.isInteger(p.appearances)) {
      bad('appearances must be a whole number');
    } else if (p.appearances < MIN_APPEARANCES) {
      bad(`${p.appearances} appearances is below the ${MIN_APPEARANCES} needed to count`);
    }

    if (p.roles !== undefined && !Array.isArray(p.roles)) bad('"roles" must be an array');
  });

  if (keepers === 0) fail('no goalkeeper');
  if (keepers > 3) warn(`${keepers} goalkeepers`);

  // Distribution sanity — see docs/ratings.md. Warnings only: a genuinely great
  // side should trip the high one.
  const ratings = file.players
    .map(p => p && p.rating)
    .filter(r => typeof r === 'number');
  if (ratings.length) {
    const elite = ratings.filter(r => r >= 90).length;
    if (elite > 4) warn(`${elite} players rated 90+; world class should be rare`);
    if (ratings.filter(r => r >= 95).length > 2) {
      warn('more than two all-time-great ratings in one squad');
    }
    const top = Math.max(...ratings);
    if (top < 70) warn(`best player is only ${top}; check the whole squad`);
  }

  return { errors, warnings };
}

/**
 * Cross-file checks: the same player may only belong to one club per season.
 * Files are [{ path, data }].
 */
export function validateAcrossFiles(files) {
  const errors = [];
  const bySeason = new Map();

  // Spellings that differ only by accent are the same person, so normalise
  // before comparing — otherwise a transfer slips through as two players.
  const spellings = new Map();

  for (const { path, data } of files) {
    if (!data || !Array.isArray(data.players)) continue;
    for (const p of data.players) {
      if (!p || typeof p.name !== 'string') continue;
      const norm = playerKey(p.name);
      if (!spellings.has(norm)) spellings.set(norm, new Set());
      spellings.get(norm).add(p.name.trim());
      const key = `${data.season}::${norm}`;
      if (!bySeason.has(key)) bySeason.set(key, []);
      bySeason.get(key).push({ path, club: data.club });
    }
  }

  for (const [, variants] of spellings) {
    if (variants.size > 1) {
      errors.push(
        `the same player is spelled ${[...variants].map(v => `"${v}"`).join(' and ')}. ` +
        `Pick one spelling; they would otherwise become separate players.`
      );
    }
  }

  for (const [key, entries] of bySeason) {
    if (entries.length > 1) {
      const [season, name] = key.split('::');
      errors.push(
        `${name} appears in ${entries.length} squads for ${season} ` +
        `(${entries.map(e => e.club).join(', ')}). ` +
        `A player belongs to the club they played most for; see docs/ratings.md.`
      );
    }
  }

  return errors;
}
