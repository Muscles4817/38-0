// Collects the raw appearance data every later phase is built on.
//
//   node scripts/scrape-appearances.mjs                 # every season, resuming
//   node scripts/scrape-appearances.mjs --season 1994   # one season (1993/94)
//   node scripts/scrape-appearances.mjs --from 2000 --to 2010
//   node scripts/scrape-appearances.mjs --force         # refetch what exists
//   node scripts/scrape-appearances.mjs --delay 2500    # be gentler
//
// Writes data/raw/appearances/<season>/<club>.json — one file per club-season,
// holding the source rows verbatim so a later verification pass can check a
// rating against the real appearance count without going back to the web.
//
// This is the ONLY step that touches the network. Everything after it — the
// canonical player list, ratings, lineups — reads these local files. Nothing
// downstream should ever poll a website.
//
// Note on the source: 11v11 counts appearances across ALL COMPETITIONS, not
// league only. A 1990s club shows more than 42. Treat the numbers as "how much
// football did this player actually play for this club", which is what the
// squad-inclusion rule wants anyway.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data', 'raw', 'appearances');
const BASE = 'https://www.11v11.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';

// 11v11 names a season by its ending year: 1994 is 1993/94.
const FIRST_YEAR = 1993;   // 1992/93
const LAST_YEAR = 2026;    // 2025/26

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = name => args.includes(`--${name}`);

const delayMs = Number(flag('delay', 1500));
const force = has('force');
const only = flag('season', null);
const from = Number(flag('from', FIRST_YEAR));
const to = Number(flag('to', LAST_YEAR));

const years = only
  ? [Number(only)]
  : Array.from({ length: to - from + 1 }, (_, i) => from + i);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const seasonLabel = year => `${year - 1}/${String(year).slice(-2)}`;

async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, html: await res.text() };
  } catch (e) {
    if (attempt >= 4) return { ok: false, status: String(e.message ?? e) };
    // Back off hard: being rate-limited is the main way this job fails.
    const wait = delayMs * Math.pow(3, attempt);
    console.log(`    retry ${attempt} in ${Math.round(wait / 1000)}s (${e.message ?? e})`);
    await sleep(wait);
    return get(url, attempt + 1);
  }
}

const stripTags = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

/** The clubs that played in the Premier League in a given season. */
function parseClubs(html) {
  const clubs = [];
  const seen = new Set();
  for (const [, slug, name] of html.matchAll(/href="\/teams\/([a-z0-9-]+)\/"[^>]*>([^<]+)</g)) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    clubs.push({ slug, name: name.trim() });
  }
  return clubs;
}

/**
 * The per-player table.
 *
 * Column count varies — goalkeepers carry clean-sheet and conceded columns that
 * outfielders do not — so this reads the stable leading columns by index and
 * takes the position from the last cell rather than trusting a fixed width.
 */
function parsePlayers(html) {
  const players = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => stripTags(m[1]));
    if (cells.length < 9) continue;
    const [squadNumber, nationality, name, apps, subs, goals] = cells;
    if (!name || !/^\d+$/.test(apps)) continue;   // header and filler rows
    players.push({
      name,
      squadNumber: squadNumber || null,
      nationality: nationality || null,
      appearances: Number(apps),
      substitute: /^\d+$/.test(subs) ? Number(subs) : 0,
      goals: /^\d+$/.test(goals) ? Number(goals) : 0,
      positionLabel: cells[cells.length - 1] || null,
      raw: cells,
    });
  }
  return players;
}

// ── Run ──────────────────────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

let fetched = 0, skipped = 0, failed = 0;
const problems = [];

for (const year of years) {
  const label = seasonLabel(year);
  const dir = path.join(OUT_DIR, label.replace('/', '-'));
  fs.mkdirSync(dir, { recursive: true });

  process.stdout.write(`\n${label}  `);
  const table = await get(`${BASE}/league-tables/premier-league/${year}/`);
  if (!table.ok) {
    problems.push(`${label}: could not read league table (${table.status})`);
    process.stdout.write('LEAGUE TABLE FAILED');
    continue;
  }
  const clubs = parseClubs(table.html);
  process.stdout.write(`${clubs.length} clubs\n`);
  await sleep(delayMs);

  for (const club of clubs) {
    const file = path.join(dir, `${club.slug}.json`);
    if (!force && fs.existsSync(file)) { skipped++; continue; }

    const url = `${BASE}/teams/${club.slug}/tab/players/season/${year}/`;
    const res = await get(url);
    if (!res.ok) {
      failed++;
      problems.push(`${label} ${club.name}: HTTP ${res.status}`);
      console.log(`  ! ${club.name} — ${res.status}`);
      await sleep(delayMs);
      continue;
    }

    const players = parsePlayers(res.html);
    if (players.length === 0) {
      failed++;
      problems.push(`${label} ${club.name}: page fetched but no player rows parsed`);
      console.log(`  ! ${club.name} — no rows`);
      await sleep(delayMs);
      continue;
    }

    fs.writeFileSync(file, JSON.stringify({
      club: club.name,
      clubSlug: club.slug,
      season: label,
      sourceYear: year,
      source: url,
      fetchedAt: new Date().toISOString(),
      note: 'Appearances are across all competitions, not league only.',
      players,
    }, null, 2) + '\n', 'utf8');

    fetched++;
    console.log(`  ${club.name.padEnd(26)} ${String(players.length).padStart(3)} players`);
    await sleep(delayMs);
  }
}

console.log(`\n\nfetched ${fetched}, skipped ${skipped} already present, ${failed} failed`);
if (problems.length) {
  console.log('\nproblems:');
  for (const p of problems) console.log(`  ${p}`);
  console.log('\nRe-run to retry only the missing ones; existing files are skipped.');
}
