// Assembles data/squads/ staging files from the three pipeline outputs.
//
//   node scripts/build-squad-files.mjs --season 1992/93 [--dry-run]
//
// The pipeline keeps appearances, positions and ratings apart on purpose: each
// was produced by a different pass, and each is verifiable on its own. This is
// the step that joins them into the shape the importer accepts.
//
// Nothing here makes a judgement. If a player is missing a position or a
// rating, that is a gap in an earlier phase and this script says so rather than
// inventing a value.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { validateSquadFile, validateAcrossFiles, MIN_APPEARANCES } from './lib/squad-file.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const value = n => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };
const SEASON = value('season');
const dryRun = args.includes('--dry-run');

if (!SEASON) {
  console.error('Pass --season, e.g. --season 1992/93');
  process.exit(1);
}
const slug = SEASON.replace('/', '-').replace(/^(\d{2})(\d{2})-(\d{2})$/, '$1$2-$3');

// FBref's own three-letter codes. Only the ones the data actually uses; an
// unknown code is an error rather than a guess, because "which country" is not
// something to infer from an abbreviation.
const NATIONS = {
  AUS: 'Australia', BUL: 'Bulgaria', CAN: 'Canada', CYP: 'Cyprus',
  CZE: 'Czech Republic', DEN: 'Denmark', ENG: 'England', ESP: 'Spain',
  FRA: 'France', GER: 'Germany', IRL: 'Republic of Ireland', ISL: 'Iceland',
  ISR: 'Israel', JAM: 'Jamaica', MSR: 'Montserrat', NED: 'Netherlands',
  NGA: 'Nigeria', NIR: 'Northern Ireland', NOR: 'Norway', POL: 'Poland',
  RUS: 'Russia', SCO: 'Scotland', SKN: 'Saint Kitts and Nevis', SWE: 'Sweden',
  TRI: 'Trinidad and Tobago', USA: 'United States', WAL: 'Wales',
  ZIM: 'Zimbabwe', BRA: 'Brazil', ITA: 'Italy', POR: 'Portugal',
  BEL: 'Belgium', SUI: 'Switzerland', GHA: 'Ghana', RSA: 'South Africa',
  NZL: 'New Zealand', FIN: 'Finland', GRE: 'Greece', ROU: 'Romania',
};

// A handful of FBref exports have an empty nation cell. That is a gap in the
// source, not something to infer from the player's name, so each one is looked
// up by hand and recorded here with the evidence.
const OVERRIDES_PATH = path.join(ROOT, 'data', 'raw', 'nation-overrides.json');
const overrides = fs.existsSync(OVERRIDES_PATH)
  ? JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8')).players
  : {};

const rosterDir = path.join(ROOT, 'data', 'raw', 'rosters', slug);
if (!fs.existsSync(rosterDir)) {
  console.error(`No rosters at ${path.relative(ROOT, rosterDir)}`);
  process.exit(1);
}

function loadBatches(dir, fn) {
  const out = new Map();
  const full = path.join(ROOT, 'data', 'raw', dir);
  if (!fs.existsSync(full)) return out;
  for (const f of fs.readdirSync(full).filter(x => /^batch-\d+\.json$/.test(x)).sort()) {
    for (const p of JSON.parse(fs.readFileSync(path.join(full, f), 'utf8')).players) fn(out, p);
  }
  return out;
}

const positionOf = loadBatches('positions', (m, p) => {
  if (Array.isArray(p.positions) && p.positions.length) m.set(p.fbrefId, p.positions);
});
const ratingOf = loadBatches('ratings', (m, p) => {
  for (const s of p.seasons ?? []) {
    if (typeof s.rating === 'number') m.set(`${p.fbrefId}|${s.season}|${s.club}`, s);
  }
});

// ── A player belongs to one club per season ──────────────────────────────────
//
// A January transfer leaves two roster rows. The rating is the same in both —
// the same footballer played both halves — but the game needs him in one squad,
// or he would appear twice on a leaderboard and score against himself. He goes
// to whoever played him more.

const rosters = fs.readdirSync(rosterDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(rosterDir, f), 'utf8')));

const minutesByPlayer = new Map();
for (const r of rosters) {
  for (const p of r.squad) {
    const prev = minutesByPlayer.get(p.fbrefId);
    if (!prev || (p.minutes ?? 0) > prev.minutes) {
      minutesByPlayer.set(p.fbrefId, { club: r.club, minutes: p.minutes ?? 0 });
    }
  }
}

const gaps = [];
const moved = [];
const outDir = path.join(ROOT, 'data', 'squads', slug);
const written = [];

for (const r of rosters) {
  const players = [];
  for (const p of r.squad) {
    const home = minutesByPlayer.get(p.fbrefId);
    if (home.club !== r.club) {
      moved.push(`${p.name}: ${r.club} ${p.minutes}' -> ${home.club} ${home.minutes}'`);
      continue;
    }
    const positions = positionOf.get(p.fbrefId);
    const rating = ratingOf.get(`${p.fbrefId}|${r.season}|${r.club}`);
    if (!positions) { gaps.push(`${p.name} (${r.club}): no position assigned`); continue; }
    if (!rating) { gaps.push(`${p.name} (${r.club}): no rating`); continue; }
    const nationality = overrides[p.fbrefId]?.nationality ?? NATIONS[p.nation];
    if (!nationality) {
      gaps.push(`${p.name} (${r.club}) [${p.fbrefId}]: no nation — FBref cell is ` +
        `"${p.nation}". Add it to data/raw/nation-overrides.json.`);
      continue;
    }
    if ((p.matchesPlayed ?? 0) < MIN_APPEARANCES) continue;

    const row = {
      name: p.name, fbrefId: p.fbrefId, nationality, positions,
      rating: rating.rating, appearances: p.matchesPlayed,
    };
    if (rating.roles?.length) row.roles = rating.roles;
    if (String(rating.note ?? '').trim()) row.note = rating.note;
    players.push(row);
  }

  written.push({
    path: `data/squads/${slug}/${r.clubSlug}.json`,
    data: {
      club: r.club,
      season: r.season,
      source: `https://fbref.com/en/comps/9/${slug.replace('-', '-19').replace(/^(\d{4})-19(\d{2})$/, '$1-$2')}/`,
      players,
    },
  });
}

// The season URL FBref serves these tables from. Built once, plainly.
const yr = Number(slug.slice(0, 4));
const seasonUrl = `https://fbref.com/en/comps/9/${yr}-${yr + 1}/${yr}-${yr + 1}-Premier-League-Stats`;
for (const w of written) w.data.source = seasonUrl;

const errors = [];
for (const w of written) {
  const v = validateSquadFile(w.data, { label: w.path });
  errors.push(...v.errors);
  for (const warn of v.warnings) console.log(`  warning: ${warn}`);
}
errors.push(...validateAcrossFiles(written));

if (gaps.length) {
  console.error(`\n${gaps.length} player(s) could not be assembled:`);
  for (const g of gaps.slice(0, 20)) console.error(`  ${g}`);
}
if (errors.length) {
  console.error(`\n${errors.length} validation error(s):`);
  for (const e of errors.slice(0, 20)) console.error(`  ${e}`);
  process.exit(1);
}

if (moved.length) {
  console.log(`\n${moved.length} mid-season move(s), assigned to the club that played them more:`);
  for (const m of moved) console.log(`  ${m}`);
}

const total = written.reduce((n, w) => n + w.data.players.length, 0);
console.log(`\n${written.length} club(s), ${total} squad entries for ${SEASON}.`);

if (dryRun) { console.log('Dry run; nothing written.'); process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });
for (const w of written) {
  fs.writeFileSync(path.join(ROOT, w.path), JSON.stringify(w.data, null, 2) + '\n', 'utf8');
}
console.log(`Wrote ${written.length} file(s) to data/squads/${slug}/`);
