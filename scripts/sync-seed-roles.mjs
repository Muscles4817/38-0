// Brings an existing local database in line with what the code defines:
// the traits in src/lib/seedRoles.ts, and the definition of every trait
// (positions, label, description, contributions) in src/lib/db.ts.
//
//   npm run sync:seed-roles [-- --dry-run]
//
// Trait definitions are inserted once and then left alone, so a change to one
// in the code (Trequartista gaining LM and RM) never reached a database that
// already had it, and the next export put the old one back. Abilities are
// already synced every time by db.ts; this does the rest. A definition edited
// in the editor and not copied into db.ts is overwritten, and reported.
//
// A few club-seasons are seeded by db.ts from code rather than imported from
// data/squads/, and the seed only runs for a squad the database does not have
// yet. So a trait added to SEED_ROLES — and to the shipped snapshot — never
// reaches a database that already holds that squad, and the next
// `npm run export:data` from it would drop the trait again. This closes that
// gap: for every player listed in SEED_ROLES it sets the traits on his entry
// in that club-season, and reports each one it changes.
//
// It overwrites those players' traits only. Anything else, and every player
// SEED_ROLES does not list, is left alone.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { SEED_ROLES } from '../src/lib/seedRoles.ts';
import { ALL_ROLES } from '../src/lib/db.ts';

const DB_PATH = path.join(process.cwd(), 'data', '38-0.db');
const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}. Nothing to sync.`);
  process.exit(1);
}

const plain = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const db = new Database(DB_PATH);
const entries = db.prepare(`
  SELECT pv.id, p.name, pv.roles
  FROM squad_entries se
  JOIN clubs c ON c.id = se.club_id
  JOIN seasons s ON s.id = se.season_id
  JOIN player_versions pv ON pv.id = se.player_version_id
  JOIN players p ON p.id = pv.player_id
  WHERE c.name = ? AND s.label = ?
`);
const update = db.prepare('UPDATE player_versions SET roles = ? WHERE id = ?');

let changed = 0, missing = 0;
db.transaction(() => {
  for (const [key, players] of Object.entries(SEED_ROLES)) {
    const [, club, season] = key.match(/^(.*) (\d{4}\/\d{2})$/);
    const rows = entries.all(club, season);
    if (rows.length === 0) { console.log(`  not in this database: ${key}`); missing++; continue; }
    for (const [name, roles] of Object.entries(players)) {
      const row = rows.find(r => plain(r.name) === plain(name));
      if (!row) { console.log(`  not in ${key}: ${name}`); missing++; continue; }
      const next = JSON.stringify(roles);
      if (row.roles === next) continue;
      console.log(`  ${key} ${row.name}: ${row.roles} -> ${next}`);
      if (!dryRun) update.run(next, row.id);
      changed++;
    }
  }
})();
const roleRow = db.prepare('SELECT * FROM role_config WHERE name = ?');
const setRole = db.prepare(`UPDATE role_config SET label = ?, valid_positions = ?, description = ?,
  att_contrib = ?, mid_contrib = ?, def_contrib = ? WHERE name = ?`);
let roleChanges = 0;
db.transaction(() => {
  for (const r of ALL_ROLES) {
    const row = roleRow.get(r.name);
    if (!row) continue;
    const want = {
      label: r.label, valid_positions: JSON.stringify(r.valid_positions), description: r.description,
      att_contrib: r.att_contrib, mid_contrib: r.mid_contrib, def_contrib: r.def_contrib,
    };
    const diff = Object.keys(want).filter(k => row[k] !== want[k]);
    if (diff.length === 0) continue;
    for (const k of diff) console.log(`  trait ${r.name} ${k}: ${row[k]} -> ${want[k]}`);
    if (!dryRun) setRole.run(want.label, want.valid_positions, want.description, want.att_contrib, want.mid_contrib, want.def_contrib, r.name);
    roleChanges++;
  }
})();

console.log(`${dryRun ? 'Would change' : 'Changed'} ${changed} player(s) and ${roleChanges} trait definition(s); ${missing} not found.`);
if ((changed || roleChanges) && !dryRun) console.log('Run "npm run export:data" to refresh the snapshot the game ships with.');
