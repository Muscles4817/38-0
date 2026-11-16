// One command from an FBref export to the shipped snapshot.
//
//   npm run data:import                     # everything in data/inbox/
//   npm run data:import -- --no-claude      # stop when judgement work is needed
//   npm run data:import -- --competition serie-a --season 1997-98
//                                           # no inbox file: club CSVs already pasted
//   npm run data:import -- --skip-check     # skip lint/typecheck/test/build at the end
//   npm run data:import -- --model <id> --concurrency 3
//
// Drop a league-wide "Player Standard Stats" export into data/inbox/, named for
// what it is — serie-a-1997-98.csv, premier-league-2003-04.csv,
// world-cup-2006.csv — and run this. In order, it:
//
//   1. splits the export into data/raw/fbref/<competition>/<season>/<club>.csv
//   2. ingests every export, rebuilds the player list, re-plans both batch sets
//      (both planners carry finished work forward by FBref id)
//   3. hands ONLY the empty positions, then ONLY the empty ratings, to Claude
//      Code in headless mode, and checks every answer with the repo's own
//      checkers before merging it
//   4. adds data/clubs.json metadata for clubs the database has never seen
//   5. builds the squad files (strict), imports, derives lineups, exports the
//      snapshot, and runs the four CI checks
//
// The inbox file moves to data/inbox/done/ only once the CI checks pass. Every step is
// safe to re-run, so after a failure fix what it says and run it again.
//
// Why Claude never edits the batch files itself: a merge here takes only the
// fields that were empty — positions/confidence/note on a position stub,
// rating/note on an unrated season — so finished, reviewed work cannot change
// however the answer comes back. Claude runs with read-only tools and returns
// JSON; this script does every write.
//
// Never fetches anything from fbref.com (see docs/squad-data-pipeline.md).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { checkAssignment } from './lib/positions.mjs';
import { checkRatingEntry } from './lib/rating-file.mjs';

const ROOT = process.cwd();
const INBOX = path.join(ROOT, 'data', 'inbox');
const DONE = path.join(INBOX, 'done');
const LOGS = path.join(INBOX, 'logs');
const POSITIONS = path.join(ROOT, 'data', 'raw', 'positions');
const RATINGS = path.join(ROOT, 'data', 'raw', 'ratings');
const ROSTERS = path.join(ROOT, 'data', 'raw', 'rosters');
const CLUBS = path.join(ROOT, 'data', 'clubs.json');
const DB_PATH = path.join(ROOT, 'data', '38-0.db');
const GAME_DATA = path.join(ROOT, 'src', 'data', 'game-data.json');

const LEAGUE_CODE = {
  'premier-league': 'PL', 'serie-a': 'SA', 'la-liga': 'LL', 'bundesliga': 'BL', 'world-cup': 'WC',
};

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const has = name => args.includes(`--${name}`);

const useClaude = !has('no-claude');
const skipCheck = has('skip-check');
const model = flag('model');
const concurrency = Math.max(1, Number(flag('concurrency') ?? 3));
const POSITION_CHUNK = 25;
const RATING_CHUNK = 15;

// ── Helpers ──────────────────────────────────────────────────────────────────

class Stop extends Error {}

function step(title) {
  console.log(`\n━━ ${title} ${'━'.repeat(Math.max(0, 70 - title.length))}`);
}

/** Runs a step, streaming its output. With `capture`, also returns the text. */
function run(cmd, cmdArgs, { capture = false } = {}) {
  console.log(`$ ${[cmd, ...cmdArgs].join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, {
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    cwd: ROOT, shell: needsShell(cmd), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (capture) { process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? ''); }
  if (r.status !== 0) throw new Stop(`${cmd} ${cmdArgs.join(' ')} failed (exit ${r.status}).`);
  return capture ? `${r.stdout}\n${r.stderr}` : '';
}

// npm and claude are .cmd shims on Windows and need a shell; node itself must
// not go through one, or a path with a space in it splits in two.
const needsShell = cmd => process.platform === 'win32' && cmd !== process.execPath;

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
const batchFiles = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => /^batch-\d+\.json$/.test(f)).sort().map(f => path.join(dir, f))
  : [];
const keyOf = p => p.fbrefId ?? p.name;
const chunk = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/**
 * "serie-a-1997-98.csv" -> { competition, seasonDir: "1997-98", label: "1997/98" }.
 * Accepts FBref's own 1997-1998 too, and a single year for a World Cup.
 */
function parseTarget(competition, season) {
  if (!LEAGUE_CODE[competition]) {
    throw new Stop(`Unknown competition "${competition}". Use one of: ${Object.keys(LEAGUE_CODE).join(', ')}.`);
  }
  let m;
  if (competition === 'world-cup') {
    if (!/^\d{4}$/.test(season)) throw new Stop(`A World Cup season is one year, e.g. world-cup-2006.csv (got "${season}").`);
    return { competition, seasonDir: season, label: season };
  }
  if ((m = /^(\d{4})[-/](\d{2}|\d{4})$/.exec(season))) {
    const end = m[2].slice(-2);
    if ((Number(m[1]) + 1) % 100 !== Number(end)) throw new Stop(`"${season}" is not two consecutive years.`);
    return { competition, seasonDir: `${m[1]}-${end}`, label: `${m[1]}/${end}` };
  }
  throw new Stop(`Cannot read a season from "${season}". Use 1997-98 (or 1997-1998).`);
}

function targetFromFilename(file) {
  const base = path.basename(file, '.csv').toLowerCase();
  const competition = Object.keys(LEAGUE_CODE).find(c => base.startsWith(`${c}-`));
  if (!competition) {
    throw new Stop(`${path.basename(file)}: name it <competition>-<season>.csv, e.g. serie-a-1997-98.csv. ` +
      `Competitions: ${Object.keys(LEAGUE_CODE).join(', ')}.`);
  }
  return { ...parseTarget(competition, base.slice(competition.length + 1)), file };
}

// ── Claude ───────────────────────────────────────────────────────────────────

let claudeChecked = false;
function requireClaude() {
  if (claudeChecked) return;
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: needsShell('claude') });
  if (r.status !== 0) {
    throw new Stop('The `claude` command is not on your PATH, so the judgement steps cannot run. ' +
      'Install Claude Code, or run with --no-claude and fill the batches another way.');
  }
  claudeChecked = true;
}

/**
 * Runs Claude Code headless with read-only tools and returns the JSON array
 * from the last ```json block of its answer. Raw output is kept in
 * data/inbox/logs/ so any answer can be audited after the fact.
 */
function askClaude(label, prompt) {
  requireClaude();
  fs.mkdirSync(LOGS, { recursive: true });
  // The prompt goes in on stdin: as an argument it would be mangled by the
  // Windows shell, and it can be longer than a command line allows.
  const claudeArgs = [
    '-p',
    '--output-format', 'text',
    // dontAsk: anything not listed below is refused rather than prompted for,
    // so nothing can stall waiting for a person and nothing can write a file.
    '--permission-mode', 'dontAsk',
    '--allowedTools', 'Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch',
  ];
  if (model) claudeArgs.push('--model', model);
  return new Promise((resolve, reject) => {
    const child = spawn('claude', claudeArgs, { cwd: ROOT, shell: needsShell('claude') });
    child.stdin.end(prompt);
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', reject);
    child.on('close', code => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(LOGS, `${stamp}-${label}.txt`),
        `PROMPT\n${prompt}\n\nEXIT ${code}\n\nSTDOUT\n${out}\n\nSTDERR\n${err}\n`, 'utf8');
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${err.trim().slice(0, 300)}`));
      const blocks = [...out.matchAll(/```json\s*([\s\S]*?)```/g)];
      const text = blocks.length ? blocks[blocks.length - 1][1] : out;
      try {
        const parsed = JSON.parse(text.trim());
        resolve(Array.isArray(parsed) ? parsed : parsed.players ?? parsed.clubs ?? []);
      } catch {
        reject(new Error('answer had no parseable ```json block'));
      }
    });
  });
}

/** Runs tasks with at most `concurrency` going at once. */
async function pool(tasks) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

/**
 * Asks for answers for one chunk, validates each, and asks once more for the
 * ones that failed, with the problems quoted. Returns { accepted, failed }.
 */
async function resolveChunk(label, items, buildPrompt, validate) {
  const accepted = new Map();
  let pending = items;
  let feedback = null;
  for (let attempt = 1; attempt <= 2 && pending.length; attempt++) {
    let answers = [];
    try {
      answers = await askClaude(`${label}-try${attempt}`, buildPrompt(pending, feedback));
    } catch (e) {
      console.log(`  ${label}: ${e.message}`);
      feedback = `Your previous answer could not be used: ${e.message}. Reply with the JSON block exactly as specified.`;
      continue;
    }
    const byKey = new Map(answers.filter(a => a && typeof a === 'object').map(a => [a.fbrefId ?? a.name, a]));
    const problems = [];
    const retry = [];
    for (const item of pending) {
      const answer = byKey.get(keyOf(item));
      const result = answer ? validate(item, answer) : { problems: [`${item.name}: no answer given`] };
      if (result.problems.length) { problems.push(...result.problems); retry.push(item); }
      else accepted.set(keyOf(item), result.value);
    }
    pending = retry;
    feedback = problems.length
      ? `Your previous answer was rejected for these players:\n${problems.map(p => `- ${p}`).join('\n')}\nFix them.`
      : null;
  }
  return { accepted, failed: pending, feedback };
}

// ── Positions ────────────────────────────────────────────────────────────────

function positionPrompt(players, feedback) {
  const stubs = players.map(p => ({
    fbrefId: p.fbrefId, name: p.name, nation: p.nation,
    fbrefPosition: p.fbrefPosition, allowed: p.allowed, primaryMustBeOneOf: p.primaryMustBeOneOf,
    totalMinutes: p.totalMinutes, seasons: p.seasons,
  }));
  return `You are assigning playing positions for the 38-0 football game repository.

Read docs/positions-lookup.md first and follow its rules exactly. In short: use
only values from "allowed"; the first position must come from
"primaryMustBeOneOf"; most natural position first; two or three positions is
normal, never more than four; set confidence to high, medium or low honestly.
Use your own knowledge, and WebSearch if you are unsure who a player was. Do not
fetch fbref.com. Do not edit any file.

${feedback ? `${feedback}\n\n` : ''}Players:
${JSON.stringify(stubs, null, 1)}

Reply with ONE fenced \`\`\`json block holding an array, one object per player:
[{"fbrefId": "...", "positions": ["CB", "RB"], "confidence": "high", "note": "optional short reason or null"}]
Only if FBref's label is genuinely wrong, add "labelDisputed": true with a note
explaining it, as docs/positions-lookup.md describes.`;
}

function validatePosition(stub, answer) {
  const merged = {
    ...stub,
    positions: Array.isArray(answer.positions) ? answer.positions : [],
    confidence: answer.confidence ?? null,
    note: answer.note ?? null,
    ...(answer.labelDisputed ? { labelDisputed: true } : {}),
  };
  const problems = checkAssignment(merged);
  if (!['high', 'medium', 'low'].includes(merged.confidence)) {
    problems.push(`${stub.name}: confidence must be high, medium or low`);
  }
  return { problems, value: merged };
}

async function fillPositions() {
  const gaps = [];
  for (const file of batchFiles(POSITIONS)) {
    for (const p of readJson(file).players) {
      if (!Array.isArray(p.positions) || p.positions.length === 0) gaps.push(p);
    }
  }
  if (gaps.length === 0) { console.log('Every player already has positions.'); return 0; }
  console.log(`${gaps.length} player(s) need positions.`);
  if (!useClaude) return gaps.length;

  const chunks = chunk(gaps, POSITION_CHUNK);
  const results = await pool(chunks.map((c, i) => async () => {
    const r = await resolveChunk(`positions-${i + 1}`, c, positionPrompt, validatePosition);
    console.log(`  positions ${i + 1}/${chunks.length}: ${r.accepted.size} accepted, ${r.failed.length} not`);
    return r;
  }));

  const accepted = new Map(results.flatMap(r => [...r.accepted]));
  for (const file of batchFiles(POSITIONS)) {
    const batch = readJson(file);
    let changed = false;
    batch.players = batch.players.map(p => {
      const empty = !Array.isArray(p.positions) || p.positions.length === 0;
      const a = empty && accepted.get(keyOf(p));
      if (!a) return p;
      changed = true;
      return { ...p, positions: a.positions, confidence: a.confidence, note: a.note,
        ...(a.labelDisputed ? { labelDisputed: true } : {}) };
    });
    if (changed) writeJson(file, batch);
  }
  const failed = results.flatMap(r => r.failed);
  for (const f of failed) console.log(`  still empty: ${f.name} (${f.fbrefPosition})`);
  return failed.length;
}

// ── Ratings ──────────────────────────────────────────────────────────────────

const unrated = s => typeof s.rating !== 'number';

function ratingPrompt(players, feedback) {
  return `You are rating footballers for the 38-0 football game repository.

Read docs/ratings.md fully before rating anybody, and follow it: one absolute
40-99 scale across every era and league; rate the player that season, never
their career and never relative to teammates. To calibrate, look at how players
already in the game were rated — e.g. Grep data/raw/ratings/ for a club or a
teammate's name. Use your own knowledge, and WebSearch if unsure. Do not fetch
fbref.com. Do not edit any file.

Each player below shows every season they have in the game. Seasons with a
"rating" already set are finished: use them for the career arc, do not change
them. Rate every season whose rating is null. A swing of more than a few points
from an adjacent season needs a short "note" saying why (injury, breakthrough,
decline). Set the player's "confidence" to high, medium or low if it is null.

${feedback ? `${feedback}\n\n` : ''}Players:
${JSON.stringify(players.map(p => ({
    fbrefId: p.fbrefId, name: p.name, nation: p.nation, positions: p.positions, confidence: p.confidence,
    seasons: p.seasons.map(s => ({ season: s.season, club: s.club, age: s.age, minutes: s.minutes,
      starts: s.starts, goals: s.goals, assists: s.assists, rating: s.rating, note: s.note })),
  })), null, 1)}

Reply with ONE fenced \`\`\`json block holding an array, one object per player,
listing only the seasons you rated:
[{"fbrefId": "...", "confidence": "medium", "seasons": [{"season": "1997/98", "club": "Lazio", "rating": 78, "note": null}]}]`;
}

function mergeRating(player, answer) {
  const given = new Map((answer.seasons ?? []).map(s => [`${s.season}|${s.club}`, s]));
  return {
    ...player,
    confidence: player.confidence ?? answer.confidence ?? null,
    seasons: player.seasons.map(s => {
      if (!unrated(s)) return s;
      const g = given.get(`${s.season}|${s.club}`);
      return g ? { ...s, rating: g.rating, note: g.note ?? s.note ?? null } : s;
    }),
  };
}

function validateRating(validRoles) {
  return (player, answer) => {
    const merged = mergeRating(player, answer);
    const problems = merged.seasons.filter(unrated)
      .map(s => `${player.name}: no rating for ${s.season} ${s.club}`);
    problems.push(...checkRatingEntry(merged, { validRoles }).problems);
    return { problems, value: merged };
  };
}

async function fillRatings() {
  const gaps = [];
  for (const file of batchFiles(RATINGS)) {
    for (const p of readJson(file).players) if ((p.seasons ?? []).some(unrated)) gaps.push(p);
  }
  if (gaps.length === 0) { console.log('Every player-season already has a rating.'); return 0; }
  const seasons = gaps.reduce((n, p) => n + p.seasons.filter(unrated).length, 0);
  console.log(`${seasons} player-season(s) across ${gaps.length} player(s) need ratings.`);
  if (!useClaude) return gaps.length;

  const validRoles = fs.existsSync(GAME_DATA) ? readJson(GAME_DATA).roles.map(r => r.name) : null;
  const chunks = chunk(gaps, RATING_CHUNK);
  const results = await pool(chunks.map((c, i) => async () => {
    const r = await resolveChunk(`ratings-${i + 1}`, c, ratingPrompt, validateRating(validRoles));
    console.log(`  ratings ${i + 1}/${chunks.length}: ${r.accepted.size} accepted, ${r.failed.length} not`);
    return r;
  }));

  const accepted = new Map(results.flatMap(r => [...r.accepted]));
  for (const file of batchFiles(RATINGS)) {
    const batch = readJson(file);
    let changed = false;
    batch.players = batch.players.map(p => {
      const a = accepted.get(keyOf(p));
      if (!a || !(p.seasons ?? []).some(unrated)) return p;
      changed = true;
      // Re-merge onto the file's own copy, so only empty fields ever change.
      return mergeRating(p, a);
    });
    if (changed) writeJson(file, batch);
  }
  const failed = results.flatMap(r => r.failed);
  for (const f of failed) console.log(`  still unrated: ${f.name}`);
  return failed.length;
}

// ── Club metadata ────────────────────────────────────────────────────────────

/** Clubs in this import that import-squads would create without metadata. */
function clubsNeedingMetadata(target) {
  const clubs = readJson(CLUBS);
  const dir = path.join(ROSTERS, target.seasonDir);
  const names = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => readJson(path.join(dir, f)))
      .filter(r => r.competition === target.competition).map(r => r.club)
    : [];
  let inDb = new Set();
  if (fs.existsSync(DB_PATH)) {
    const r = spawnSync(process.execPath, ['-e',
      `const D=require('better-sqlite3');const db=new D(${JSON.stringify(DB_PATH)},{readonly:true});` +
      `console.log(JSON.stringify(db.prepare('SELECT name FROM clubs').all().map(r=>r.name)))`],
    { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) inDb = new Set(JSON.parse(r.stdout));
  }
  // Outside the Premier League a club must be in clubs.json even if it is in
  // the database: without an entry the importer files it under league PL.
  return [...new Set(names)].filter(n => !clubs[n] && (target.competition !== 'premier-league' ? true : !inDb.has(n)));
}

async function ensureClubMetadata(target) {
  const missing = clubsNeedingMetadata(target);
  if (missing.length === 0) return;
  console.log(`${missing.length} club(s) need data/clubs.json entries: ${missing.join(', ')}`);
  if (!useClaude) {
    throw new Stop('Add shortName, color and league for them to data/clubs.json, or run without --no-claude.');
  }
  const clubs = readJson(CLUBS);
  const taken = new Set(Object.values(clubs).map(c => c?.shortName).filter(Boolean));
  const league = LEAGUE_CODE[target.competition];
  const prompt = `For the 38-0 football game, give each club below a three-letter short name and
its primary home shirt colour as a hex code (see data/clubs.json for the existing
entries and style). Short names must be unique; these are already taken:
${[...taken].sort().join(', ')}.
Do not edit any file.

Clubs (${target.competition} ${target.label}): ${JSON.stringify(missing)}

Reply with ONE fenced \`\`\`json block:
[{"name": "Lazio", "shortName": "LAZ", "color": "#87d8f7"}]`;
  const answers = await askClaude('clubs', prompt).catch(e => { throw new Stop(`club metadata: ${e.message}`); });
  const problems = [];
  for (const name of missing) {
    const a = answers.find(x => x?.name === name);
    if (!a) { problems.push(`${name}: no answer`); continue; }
    if (!/^[A-Z]{3}$/.test(a.shortName ?? '') || taken.has(a.shortName)) {
      problems.push(`${name}: short name "${a.shortName}" is not three capitals or is taken`); continue;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(a.color ?? '')) { problems.push(`${name}: colour "${a.color}" is not #rrggbb`); continue; }
    taken.add(a.shortName);
    clubs[name] = { shortName: a.shortName, color: a.color, league };
    console.log(`  + ${name}: ${a.shortName} ${a.color} ${league}`);
  }
  writeJson(CLUBS, clubs);
  if (problems.length) {
    throw new Stop(`Some clubs still need data/clubs.json entries:\n  ${problems.join('\n  ')}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function importTarget(target) {
  console.log(`\n████ ${target.competition} ${target.label}${target.file ? `  (${path.basename(target.file)})` : ''}`);

  if (target.file) {
    step('Split the league export into club files');
    run(process.execPath, ['scripts/split-fbref-league.mjs', target.file,
      '--competition', target.competition, '--season', target.seasonDir]);
  }

  step('Ingest, player list, batch plans');
  run(process.execPath, ['scripts/ingest-fbref.mjs']);
  run(process.execPath, ['scripts/build-player-list.mjs']);
  run(process.execPath, ['scripts/plan-position-batches.mjs']);

  step('Positions');
  const posLeft = await fillPositions();
  if (posLeft) {
    throw new Stop(`${posLeft} player(s) still have no position. ` +
      (useClaude ? 'See data/inbox/logs/ for what Claude answered, then re-run.'
        : 'Fill data/raw/positions/ (docs/positions-lookup.md), then re-run.'));
  }
  run(process.execPath, ['scripts/check-position-batch.mjs']);

  step('Ratings');
  // Re-planned after positions, so each stub carries the player's positions.
  run(process.execPath, ['scripts/plan-rating-batches.mjs']);
  const rateLeft = await fillRatings();
  if (rateLeft) {
    throw new Stop(`${rateLeft} player(s) still unrated. ` +
      (useClaude ? 'See data/inbox/logs/ for what Claude answered, then re-run.'
        : 'Fill data/raw/ratings/ (docs/ratings.md), then re-run.'));
  }
  run(process.execPath, ['scripts/plan-rating-batches.mjs', '--check']);

  step('Club metadata');
  await ensureClubMetadata(target);

  step('Squad files, import, lineups, snapshot');
  run(process.execPath, ['scripts/build-squad-files.mjs', '--season', target.label,
    '--competition', target.competition, '--strict']);
  run(process.execPath, ['scripts/import-squads.mjs', `data/squads/${target.seasonDir}/`]);
  const lineups = run('npm', ['run', 'derive:lineups', '--', '--season', target.label], { capture: true });
  // derive-lineups exits 0 when a side cannot field eleven, and the build then
  // fails in positionCoherence.test.ts. Say so here, where the cause is.
  const illegal = lineups.split('\n').filter(l => /fills only \d+\/11|only \d+ in the squad/.test(l));
  if (illegal.length) {
    throw new Stop(`These sides cannot field a legal eleven, so the build would fail:\n${illegal.join('\n')}\n` +
      'Usually a position is wrong (six centre-backs and no full-back, say). Fix it in data/raw/positions/ — ' +
      'find the player with grep — then run again.');
  }
  run('npm', ['run', 'export:data']);
}

async function main() {
  let targets;
  if (flag('competition') || flag('season')) {
    if (!flag('competition') || !flag('season')) throw new Stop('Pass both --competition and --season.');
    targets = [parseTarget(flag('competition'), flag('season'))];
  } else {
    fs.mkdirSync(INBOX, { recursive: true });
    targets = fs.readdirSync(INBOX).filter(f => f.toLowerCase().endsWith('.csv')).sort()
      .map(f => targetFromFilename(path.join(INBOX, f)));
    if (targets.length === 0) {
      console.log('Nothing in data/inbox/. Save an FBref league export there as e.g. serie-a-1997-98.csv.');
      return;
    }
  }

  for (const target of targets) await importTarget(target);

  if (!skipCheck) {
    step('CI checks: lint, typecheck, test, build');
    run('npm', ['run', 'check']);
  }

  // Only now: a file left in the inbox is how a failed run gets re-run.
  for (const target of targets) {
    if (!target.file) continue;
    fs.mkdirSync(DONE, { recursive: true });
    fs.renameSync(target.file, path.join(DONE, path.basename(target.file)));
  }

  step('Done');
  console.log(`Imported: ${targets.map(t => `${t.competition} ${t.label}`).join(', ')}.
Review what changed, then commit it:

  git status
  git add data src/data/game-data.json
  git commit -m "data: ${targets.map(t => `${t.competition} ${t.label}`).join(', ')}"
`);
}

main().catch(e => {
  if (e instanceof Stop) {
    console.error(`\n✖ ${e.message}\n\nNothing is lost: fix that and run the same command again.`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
