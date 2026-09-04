// Exports the local SQLite database to a JSON snapshot that ships with the app.
//
// The game itself never touches SQLite: it reads src/data/game-data.json, which
// is committed. The database and the editor UI are authoring tools that only run
// on a developer machine. Re-run this whenever you change data in the editor:
//
//   npm run export:data
//
// Usage: node scripts/export-game-data.mjs

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, 'data', '38-0.db');
const OUT_PATH = path.join(ROOT, 'src', 'data', 'game-data.json');

if (!fs.existsSync(DB_PATH)) {
  console.error(
    `No database at ${DB_PATH}.\n` +
    `It is created and seeded the first time the dev server serves an editor page.\n` +
    `Run "npm run dev", open http://localhost:3000/editor, then try again.`
  );
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value ?? '');
  } catch {
    return fallback;
  }
};

const clubs = db.prepare(`
  SELECT id, name, short_name, color, league FROM clubs ORDER BY name
`).all().map(c => ({
  id: c.id,
  name: c.name,
  shortName: c.short_name ?? c.name.slice(0, 3).toUpperCase(),
  color: c.color,
  league: c.league,
}));

const seasons = db.prepare(`
  SELECT id, label, year_start FROM seasons ORDER BY year_start
`).all().map(s => ({ id: s.id, label: s.label, yearStart: s.year_start }));

// Squad entries, grouped by club-season and sorted best player first.
const entryRows = db.prepare(`
  SELECT se.club_id, se.season_id, pv.player_id, p.name, p.nationality,
         pv.rating, pv.positions, pv.roles
  FROM squad_entries se
  JOIN player_versions pv ON pv.id = se.player_version_id
  JOIN players p ON p.id = pv.player_id
  ORDER BY se.club_id, se.season_id, pv.rating DESC
`).all();

const squadsByKey = new Map();
for (const row of entryRows) {
  const key = `${row.club_id}-${row.season_id}`;
  if (!squadsByKey.has(key)) {
    squadsByKey.set(key, { clubId: row.club_id, seasonId: row.season_id, players: [] });
  }
  squadsByKey.get(key).players.push({
    playerId: row.player_id,
    name: row.name,
    nationality: row.nationality,
    rating: row.rating,
    positions: parseJson(row.positions, []),
    roles: parseJson(row.roles, []),
  });
}
const squads = [...squadsByKey.values()];

// Stored starting XIs. Slots are sparse: a lineup may have fewer than 11 filled.
//
// lineup_slots.player_id references players(id) rather than squad membership,
// so dropping a player from a squad leaves the slot behind pointing at someone
// who is no longer in that club-season. Those slots are dropped here (and
// reported) to keep the snapshot internally consistent.
const lineupRows = db.prepare(`
  SELECT tl.id, tl.club_id, tl.season_id, tl.formation FROM team_lineups tl
`).all();
const slotStmt = db.prepare(`
  SELECT slot_index, player_id FROM lineup_slots WHERE lineup_id = ? ORDER BY slot_index
`);

const orphaned = [];
const lineups = lineupRows.map(l => {
  const squad = squadsByKey.get(`${l.club_id}-${l.season_id}`);
  const squadIds = new Set(squad ? squad.players.map(p => p.playerId) : []);
  const slots = [];
  for (const s of slotStmt.all(l.id)) {
    if (squadIds.has(s.player_id)) {
      slots.push({ slotIndex: s.slot_index, playerId: s.player_id });
    } else {
      const club = clubs.find(c => c.id === l.club_id);
      const season = seasons.find(x => x.id === l.season_id);
      const player = db.prepare('SELECT name FROM players WHERE id = ?').get(s.player_id);
      orphaned.push(
        `${club?.name ?? l.club_id} ${season?.label ?? l.season_id} ` +
        `slot ${s.slot_index}: ${player?.name ?? `player ${s.player_id}`}`
      );
    }
  }
  return { clubId: l.club_id, seasonId: l.season_id, formation: l.formation, slots };
});

const roles = db.prepare(`
  SELECT name, label, goal_mult, assist_mult, valid_positions, description,
         att_contrib, mid_contrib, def_contrib
  FROM role_config ORDER BY name
`).all().map(r => ({
  name: r.name,
  label: r.label,
  goalMult: r.goal_mult,
  assistMult: r.assist_mult,
  validPositions: parseJson(r.valid_positions, []),
  description: r.description,
  attContrib: r.att_contrib,
  midContrib: r.mid_contrib,
  defContrib: r.def_contrib,
}));

// How each side plays. Absent rows are not defaulted here: the engine's own
// DEFAULT_COHESION is the single place that decision lives, so a club with
// nothing recorded simply does not appear.
const hasTraits = db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='club_season_traits'"
).get();
const traits = hasTraits
  ? db.prepare(`
      SELECT club_id, season_id, cohesion, playstyle,
             focus_left, focus_centre, focus_right, iconic, note
      FROM club_season_traits ORDER BY season_id, club_id
    `).all().map(t => ({
      clubId: t.club_id,
      seasonId: t.season_id,
      cohesion: t.cohesion,
      playstyle: t.playstyle,
      focus: { L: t.focus_left, C: t.focus_centre, R: t.focus_right },
      ...(t.iconic ? { iconic: true } : {}),
      ...(t.note ? { note: t.note } : {}),
    }))
  : [];

const snapshot = { clubs, seasons, squads, lineups, roles, traits };

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

const playerCount = squads.reduce((n, s) => n + s.players.length, 0);
const sizeKb = (fs.statSync(OUT_PATH).size / 1024).toFixed(0);
console.log(
  `Wrote ${path.relative(ROOT, OUT_PATH)} — ` +
  `${clubs.length} clubs, ${seasons.length} seasons, ${squads.length} club-seasons, ` +
  `${playerCount} squad entries, ${lineups.length} lineups, ${traits.length} tactics, ` +
  `${roles.length} roles (${sizeKb} KB)`
);

if (orphaned.length > 0) {
  console.warn(
    `\nDropped ${orphaned.length} lineup slot(s) naming a player who is no longer ` +
    `in that squad:\n  ${orphaned.join('\n  ')}\n` +
    `Those XIs are now short. Fix them in the lineup editor and export again.`
  );
}

const short = lineups.filter(l => l.slots.length > 0 && l.slots.length < 11);
if (short.length > 0) {
  console.warn(`${short.length} lineup(s) have fewer than 11 players set.`);
}
