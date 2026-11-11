// Splits ONE league-wide FBref export into the per-club CSVs that
// ingest-fbref.mjs reads, so a whole season is one copy-paste instead of
// twenty.
//
//   node scripts/split-fbref-league.mjs <export.csv> --competition serie-a --season 1997-98
//   node scripts/split-fbref-league.mjs <export.csv> --competition serie-a --season 1997-98 --only juventus,inter
//   node scripts/split-fbref-league.mjs <export.csv> ... --dry-run
//   node scripts/split-fbref-league.mjs <export.csv> ... --force    # overwrite filled-in files
//   node scripts/split-fbref-league.mjs <export.csv> ... --rename "Milan=ac-milan"
//
// Where the export comes from: the league season's "Standard Stats" page, e.g.
//   https://fbref.com/en/comps/11/1997-1998/stats/1997-1998-Serie-A-Stats
// The "Player Standard Stats" table on that page has every player in the
// league with a Squad column. Share & Export -> Get table as CSV, copy it into
// a file, and run this. Players who moved mid-season appear once per club,
// which is exactly what the per-club files want.
//
// Nothing here touches the network — fbref.com refuses automated requests and
// that is not something we work around (see docs/squad-data-pipeline.md).
//
// Output matches a club-page export: the Rk, Squad and Born columns are
// dropped so the header row starts with "Player", and the FBref id stays in
// the last column. Files that already have content are left alone.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const IN_DIR = path.join(ROOT, 'data', 'raw', 'fbref');
const CLUBS = path.join(ROOT, 'data', 'clubs.json');

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const has = name => args.includes(`--${name}`);

const VALUED = new Set(['--competition', '--season', '--only', '--rename']);
const input = args.find((a, i) => !a.startsWith('--') && !VALUED.has(args[i - 1]));
const competition = flag('competition');
const season = flag('season')?.replace('/', '-');
const only = flag('only')?.split(',').map(s => s.trim()).filter(Boolean) ?? null;
const dryRun = has('dry-run');
const force = has('force');

if (!input || !competition || !season || !/^\d{4}(-\d{2})?$/.test(season)) {
  console.error(
    'usage: node scripts/split-fbref-league.mjs <export.csv> --competition <slug> --season <YYYY-YY> ' +
    '[--only club,club] [--dry-run] [--force]',
  );
  process.exit(1);
}

/** Splits a CSV line, honouring quoted fields. Kept raw so cells round-trip. */
function splitRow(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '""'; i++; continue; }
      quoted = !quoted;
      cur += c;
    } else if (c === ',' && !quoted) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const bare = cell => cell.replace(/^"|"$/g, '').replace(/[▲▼]/g, '').trim();

function slugify(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const aliases = fs.existsSync(CLUBS) ? JSON.parse(fs.readFileSync(CLUBS, 'utf8'))._aliases ?? {} : {};

const outDir = path.join(IN_DIR, competition, season);
const compDir = path.join(IN_DIR, competition);
const slugsIn = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => f.endsWith('.csv')).map(f => f.replace(/\.csv$/, ''))
  : [];

// A competition with a manifest (the Premier League) has every club-season
// scaffolded already, so a club that matches no file is a naming problem, not
// a new club — report it rather than write a stray file beside the real one.
const hasManifest = fs.existsSync(path.join(compDir, 'seasons.json'));
const known = new Set(slugsIn(outDir));
if (!hasManifest && fs.existsSync(compDir)) {
  // Other competitions are made by hand: reuse the slug a club already has in
  // another season, so "Milan" lands in ac-milan.csv if that is what exists.
  for (const d of fs.readdirSync(compDir, { withFileTypes: true })) {
    if (d.isDirectory()) for (const s of slugsIn(path.join(compDir, d.name))) known.add(s);
  }
}

const renames = Object.fromEntries((flag('rename') ?? '').split(',').filter(Boolean)
  .map(pair => pair.split('=').map(s => s.trim())));

/** Every token of `short` is a prefix of a token of `long`, in order. */
function tokensWithin(short, long) {
  const a = short.split('-'), b = long.split('-');
  let j = 0;
  for (const t of a) {
    while (j < b.length && !b[j].startsWith(t)) j++;
    if (j === b.length) return false;
    j++;
  }
  return true;
}

/**
 * FBref's squad name -> file slug, or { error }. In order: --rename, an exact
 * existing slug (via the alias map or as spelt), then a unique existing slug
 * the short name sits inside ("Tottenham" -> tottenham-hotspur,
 * "Bournemouth" -> afc-bournemouth). Only without a manifest does an unknown
 * club get a new file.
 */
function slugFor(squad) {
  if (renames[squad]) return { slug: renames[squad] };
  const candidates = [...new Set([slugify(aliases[squad] ?? squad), slugify(squad)])];
  const exact = candidates.find(c => known.has(c));
  if (exact) return { slug: exact };
  const loose = [...known].filter(k => candidates.some(c => tokensWithin(c, k)));
  if (loose.length === 1) return { slug: loose[0] };
  if (loose.length > 1) return { error: `ambiguous: ${loose.join(', ')}` };
  if (hasManifest) return { error: 'matches no club file for this season' };
  return { slug: candidates[0], isNew: true };
}

// ── Parse ────────────────────────────────────────────────────────────────────

const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(l => l.trim() !== '');
const headerIndex = lines.findIndex(l => {
  const cells = splitRow(l).map(bare);
  return cells.includes('Player') && cells.includes('Squad');
});
if (headerIndex === -1) {
  console.error(
    'No header row with both "Player" and "Squad". This needs the league-wide ' +
    '"Player Standard Stats" table, not a single club\'s.',
  );
  process.exit(1);
}

const header = splitRow(lines[headerIndex]).map(bare);
const groupRow = headerIndex > 0 ? splitRow(lines[headerIndex - 1]) : null;
const iSquad = header.indexOf('Squad');
const iPlayer = header.indexOf('Player');
const drop = new Set(['Rk', 'Squad', 'Born'].map(c => header.indexOf(c)).filter(i => i !== -1));
const keep = cells => cells.filter((_, i) => !drop.has(i));

const byClub = new Map();
for (const line of lines.slice(headerIndex + 1)) {
  const cells = splitRow(line);
  const player = bare(cells[iPlayer] ?? '');
  // FBref repeats the header every 25 rows in long tables.
  if (!player || player === 'Player') continue;
  const squad = bare(cells[iSquad] ?? '');
  if (!squad) continue;
  if (!byClub.has(squad)) byClub.set(squad, []);
  byClub.get(squad).push(keep(cells).join(','));
}

if (byClub.size === 0) {
  console.error('No player rows found under the header.');
  process.exit(1);
}

// ── Write ────────────────────────────────────────────────────────────────────

const head = [groupRow && keep(groupRow).join(','), keep(splitRow(lines[headerIndex])).join(',')]
  .filter(Boolean).join('\n');

const summary = [];
const problems = [];
const resolved = [...byClub].sort(([a], [b]) => a.localeCompare(b))
  .map(([squad, rows]) => ({ squad, rows, ...slugFor(squad) }));

// Two FBref clubs in one file is the "same export in two files" trap from the
// other direction: it would merge two squads silently. Refuse it.
const claimed = new Map();
for (const r of resolved) {
  if (!r.slug) continue;
  if (claimed.has(r.slug)) {
    r.error = `same file as "${claimed.get(r.slug).squad}"`;
    claimed.get(r.slug).error = `same file as "${r.squad}"`;
  } else claimed.set(r.slug, r);
}

for (const { squad, rows, slug, isNew, error } of resolved) {
  if (only && !only.includes(slug) && !only.includes(slugify(squad))) continue;
  if (error) {
    problems.push(`${squad}: ${error} — add an alias in data/clubs.json or --rename "${squad}=<slug>"`);
    summary.push({ fbref: squad, file: '—', players: rows.length, action: 'NOT written' });
    continue;
  }
  const file = path.join(outDir, `${slug}.csv`);
  const filled = fs.existsSync(file) && fs.statSync(file).size > 0;
  const action = filled && !force ? 'skipped (already filled)'
    : `${dryRun ? 'would be ' : ''}${filled ? 'overwritten' : isNew ? 'written (new club)' : 'written'}`;
  if (!dryRun && (!filled || force)) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(file, `${head}\n${rows.join('\n')}\n`, 'utf8');
  }
  summary.push({ fbref: squad, file: path.relative(ROOT, file), players: rows.length, action });
}

console.table(summary);
if (only) {
  const matched = new Set(summary.map(s => path.basename(s.file, '.csv')));
  const missed = only.filter(o => !matched.has(o));
  if (missed.length) console.log(`--only names not found in the export: ${missed.join(', ')}`);
}
if (problems.length) {
  console.log('\nnot written:');
  for (const p of problems) console.log(`  ${p}`);
}
console.log(`\nNext: node scripts/ingest-fbref.mjs`);
process.exitCode = problems.length ? 1 : 0;
