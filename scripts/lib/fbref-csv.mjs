// Parser for FBref "Standard Stats" CSV exports.
//
// These are supplied by hand: fbref.com sits behind a Cloudflare challenge that
// no scraper of ours will pass, and working around it is not something we do.
// The export is better data than anything reachable anyway — see below.
//
// Expected layout: data/raw/fbref/<competition>/<season>/<club>.csv
//   e.g. data/raw/fbref/premier-league/1993-94/manchester-united.csv
//
// The competition and season come from the path because the CSV itself does not
// carry them.

/** Splits a CSV line, honouring quoted fields. */
function splitRow(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const num = v => (v === '' || v == null ? null : Number.isNaN(Number(v)) ? null : Number(v));

/**
 * "it ITA" -> "ITA", "de GER" -> "GER". FBref prefixes a flag code.
 * Returns null when the cell is blank.
 */
function nationCode(value) {
  if (!value) return null;
  const parts = String(value).trim().split(/\s+/);
  return parts[parts.length - 1] || null;
}

/**
 * Rows that are not players.
 * FBref closes the table with aggregate rows; blank-name rows are padding.
 */
function isAggregate(name) {
  return !name || /^(squad total|opponent total|total)$/i.test(name);
}

/**
 * Parses one FBref standard-stats CSV.
 *
 * The file has two header rows: a group row ("Playing Time", "Performance")
 * and the real column names. We key off the second, so added or reordered
 * columns do not break this.
 */
export function parseFbrefCsv(text, { competition, season, club, source = null } = {}) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 3) throw new Error('file has no data rows');

  // The header row is the one that starts with "Player".
  const headerIndex = lines.findIndex(l => splitRow(l)[0] === 'Player');
  if (headerIndex === -1) throw new Error('no header row starting with "Player"');

  const header = splitRow(lines[headerIndex]);
  const col = name => header.indexOf(name);

  // Duplicated names (Gls, Ast appear again under "Per 90 Minutes") resolve to
  // the first occurrence, which is the count rather than the rate.
  const iPlayer = col('Player');
  const iNation = col('Nation');
  const iPos = col('Pos');
  const iAge = col('Age');
  const iMP = col('MP');
  const iStarts = col('Starts');
  const iMin = col('Min');
  const iGls = col('Gls');
  const iAst = col('Ast');
  const iCrdY = col('CrdY');
  const iCrdR = col('CrdR');
  // FBref's last column is its own player id. It is the thing that makes player
  // identity exact instead of a name-matching guess.
  const iId = header.length - 1;

  if (iPlayer === -1 || iMP === -1) throw new Error('missing Player or MP column');

  const players = [];
  const warnings = [];

  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitRow(line);
    const name = cells[iPlayer];
    if (isAggregate(name)) continue;

    const fbrefId = cells[iId] && cells[iId] !== '-9999' ? cells[iId] : null;
    if (!fbrefId) warnings.push(`${name}: no FBref id in the last column`);

    players.push({
      name,
      fbrefId,
      nation: nationCode(cells[iNation]),
      positionLabel: cells[iPos] || null,
      age: num(cells[iAge]),
      matchesPlayed: num(cells[iMP]) ?? 0,
      starts: num(cells[iStarts]) ?? 0,
      minutes: num(cells[iMin]) ?? 0,
      goals: iGls === -1 ? null : num(cells[iGls]),
      assists: iAst === -1 ? null : num(cells[iAst]),
      yellow: iCrdY === -1 ? null : num(cells[iCrdY]),
      red: iCrdR === -1 ? null : num(cells[iCrdR]),
    });
  }

  if (players.length === 0) throw new Error('no player rows found');

  const ids = players.map(p => p.fbrefId).filter(Boolean);
  if (new Set(ids).size !== ids.length) warnings.push('duplicate FBref ids in this file');

  return { competition, season, club, source, players, warnings };
}

/**
 * FBref's coarse position codes, expanded to the buckets the game understands.
 * "DFMF" means the player was used in both. This is a hint for the positions
 * phase, not an answer: the game needs LB/CB/RB, not DF.
 */
export function positionBuckets(label) {
  if (!label) return [];
  const found = [];
  for (const code of ['GK', 'DF', 'MF', 'FW']) {
    if (label.includes(code)) found.push(code);
  }
  return found;
}
