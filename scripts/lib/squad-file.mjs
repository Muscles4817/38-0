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
/**
 * Letters NFD does not decompose, because they are distinct letters rather than
 * a base plus a combining accent. Stripping accents alone left "Jorgen" and
 * "Jørgen" Strand Larsen as two different people, which let the same man sit in
 * both Wolves' and Crystal Palace's 2025/26 squads without this file's
 * cross-squad check noticing.
 */
const FOLD = {
  ø: 'o', đ: 'd', ł: 'l', ß: 'ss', æ: 'ae', œ: 'oe',
  ð: 'd', þ: 'th', ı: 'i', ħ: 'h', ŧ: 't',
};

export function playerKey(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .replace(/[.'’]/g, '')          // O'Neill / O'Neill / Jr.
    .toLowerCase()
    .replace(/[^\x00-\x7f]/g, c => FOLD[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
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
 *
 * Returns an object with `errors` and `warnings`: errors block the import,
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
    if (p.fbrefId !== undefined && (typeof p.fbrefId !== 'string' || !p.fbrefId.trim())) {
      bad('"fbrefId" must be a non-empty string when present');
    }
  });

  if (keepers === 0) fail('no goalkeeper');
  if (keepers > 3) warn(`${keepers} goalkeepers`);

  // Deliberately NOT a distribution check.
  //
  // An earlier version warned when a squad held more than four players at 90+.
  // That is wrong: peak Manchester City really did field Aguero, De Bruyne,
  // Silva, Kompany, Fernandinho, Bernardo and Walker at once, and the 2003/04
  // Arsenal side was similarly stacked. Players are as good as they are, and a
  // rule about squad averages would only push correct ratings down.
  //
  // What is left catches a broken file, not an unusual squad.
  const ratings = file.players
    .map(p => p && p.rating)
    .filter(r => typeof r === 'number');
  if (ratings.length > 1) {
    if (new Set(ratings).size === 1) {
      warn(`every player is rated ${ratings[0]}; this looks unrated rather than flat`);
    }
    const top = Math.max(...ratings);
    if (top < 65) warn(`best player is only ${top}; check the whole squad`);
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
      // Two men can share a name. 1992/93 had a David Smith at Coventry and a
      // different David Smith at Norwich, and keying on the name alone reads
      // that as one player who cannot be in two squads. Where the file carries
      // an FBref id, that is the identity; the name is only a fallback for the
      // hand-written files that predate it.
      const identity = typeof p.fbrefId === 'string' && p.fbrefId ? p.fbrefId : norm;
      const key = `${data.season}::${identity}`;
      if (!bySeason.has(key)) bySeason.set(key, []);
      bySeason.get(key).push({ path, club: data.club, name: p.name.trim() });
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
      const [season] = key.split('::');
      const name = entries[0].name;
      errors.push(
        `${name} appears in ${entries.length} squads for ${season} ` +
        `(${entries.map(e => e.club).join(', ')}). ` +
        `A player belongs to the club they played most for; see docs/ratings.md.`
      );
    }
  }

  return errors;
}
