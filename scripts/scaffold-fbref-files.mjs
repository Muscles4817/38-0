// Creates one empty CSV per club-season, ready to paste an FBref Standard
// Stats export into.
//
//   node scripts/scaffold-fbref-files.mjs            # create everything missing
//   node scripts/scaffold-fbref-files.mjs --status   # what is filled in so far
//
// Never overwrites a file that already has content, so it is safe to re-run at
// any point to pick up a season you have not scaffolded yet.
//
// The club list for each season comes from that season's league table, so it is
// the real set of clubs — including the 22-club seasons up to 1994/95 — rather
// than a hand-typed list that will be wrong for a promoted side somewhere.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'data', 'raw', 'fbref', 'premier-league');
const MANIFEST = path.join(OUT, 'seasons.json');
const BASE = 'https://www.11v11.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const FIRST_YEAR = 1993;   // 1992/93, the first Premier League season
const LAST_YEAR = 2026;    // 2025/26

const args = process.argv.slice(2);
const statusOnly = args.includes('--status');
const delayMs = 1500;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const seasonLabel = year => `${year - 1}/${String(year).slice(-2)}`;
const seasonDir = year => seasonLabel(year).replace('/', '-');

// ── Progress report ──────────────────────────────────────────────────────────

function report() {
  if (!fs.existsSync(MANIFEST)) {
    console.error('No manifest yet. Run without --status first.');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let done = 0, total = 0;
  const rows = [];
  for (const [season, clubs] of Object.entries(manifest.seasons)) {
    const dir = path.join(OUT, season.replace('/', '-'));
    let filled = 0;
    for (const club of clubs) {
      total++;
      const file = path.join(dir, `${club.slug}.csv`);
      if (fs.existsSync(file) && fs.statSync(file).size > 0) { filled++; done++; }
    }
    rows.push({ season, clubs: clubs.length, filled, remaining: clubs.length - filled });
  }
  console.table(rows);
  const pct = total ? ((done / total) * 100).toFixed(1) : '0.0';
  console.log(`\n${done} of ${total} club-seasons filled in (${pct}%).`);
  const next = rows.find(r => r.remaining > 0);
  if (next) {
    const dir = path.join(OUT, next.season.replace('/', '-'));
    const empty = fs.readdirSync(dir)
      .filter(f => f.endsWith('.csv') && fs.statSync(path.join(dir, f)).size === 0);
    console.log(`Next up — ${next.season}: ${empty.slice(0, 6).join(', ')}${empty.length > 6 ? ` … +${empty.length - 6}` : ''}`);
  } else {
    console.log('Nothing left to paste.');
  }
}

if (statusOnly) { report(); process.exit(0); }

// ── Scaffold ─────────────────────────────────────────────────────────────────

async function clubsFor(year) {
  const res = await fetch(`${BASE}/league-tables/premier-league/${year}/`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const clubs = [];
  const seen = new Set();
  for (const [, slug, name] of html.matchAll(/href="\/teams\/([a-z0-9-]+)\/"[^>]*>([^<]+)</g)) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    clubs.push({ slug, name: name.trim() });
  }
  return clubs;
}

fs.mkdirSync(OUT, { recursive: true });

const manifest = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  : { competition: 'Premier League', generatedAt: null, seasons: {} };

let created = 0, kept = 0;

for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
  const label = seasonLabel(year);
  const dir = path.join(OUT, seasonDir(year));
  fs.mkdirSync(dir, { recursive: true });

  let clubs = manifest.seasons[label];
  if (!clubs) {
    try {
      clubs = await clubsFor(year);
      await sleep(delayMs);
    } catch (e) {
      console.error(`  ${label}: could not read club list — ${e.message}`);
      continue;
    }
    manifest.seasons[label] = clubs;
  }

  let madeHere = 0;
  for (const club of clubs) {
    const file = path.join(dir, `${club.slug}.csv`);
    if (fs.existsSync(file)) {
      if (fs.statSync(file).size > 0) kept++;
      continue;
    }
    fs.writeFileSync(file, '', 'utf8');
    created++; madeHere++;
  }
  console.log(`  ${label}  ${String(clubs.length).padStart(2)} clubs   ${madeHere} file(s) created`);
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const totalClubSeasons = Object.values(manifest.seasons).reduce((n, c) => n + c.length, 0);
console.log(
  `\n${created} empty file(s) created, ${kept} already filled in. ` +
  `${totalClubSeasons} club-seasons in total.`
);
console.log(`Manifest: ${path.relative(ROOT, MANIFEST)}`);
console.log('Paste an FBref Standard Stats export into each file, then:');
console.log('  node scripts/scaffold-fbref-files.mjs --status');
