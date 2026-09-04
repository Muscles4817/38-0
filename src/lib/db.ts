import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', '38-0.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      short_name TEXT,
      color TEXT NOT NULL DEFAULT '#ffffff'
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      year_start INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nationality TEXT
    );

    CREATE TABLE IF NOT EXISTS player_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 75,
      positions TEXT NOT NULL DEFAULT '[]',
      roles TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS squad_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      player_version_id INTEGER NOT NULL REFERENCES player_versions(id) ON DELETE CASCADE,
      UNIQUE(club_id, season_id, player_version_id)
    );

    CREATE TABLE IF NOT EXISTS team_lineups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      formation TEXT NOT NULL,
      UNIQUE(club_id, season_id)
    );

    -- How a side plays, as opposed to who is in it.
    --
    -- Separate from team_lineups on purpose: a club-season can have tactics
    -- recorded without anyone having picked its XI, and most historical ones
    -- do. Cohesion is how well drilled the side is — not a rating and not a
    -- bonus, but how reliably its talent turns into results. See the comment
    -- above DEFAULT_COHESION in matchEngine.ts.
    CREATE TABLE IF NOT EXISTS club_season_traits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      cohesion INTEGER NOT NULL DEFAULT 72,
      playstyle TEXT NOT NULL DEFAULT 'balanced',
      focus_left REAL NOT NULL DEFAULT 1,
      focus_centre REAL NOT NULL DEFAULT 1,
      focus_right REAL NOT NULL DEFAULT 1,
      -- Whether this side is one people would name. Curation, not quality:
      -- an overall rating already says how good they were, and plenty of
      -- ordinary sides are famous. Classic mode lists every club-season in
      -- the database, so without this the great ones are indistinguishable
      -- from the two hundred others.
      iconic INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      UNIQUE(club_id, season_id)
    );

    CREATE TABLE IF NOT EXISTS lineup_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lineup_id INTEGER NOT NULL REFERENCES team_lineups(id) ON DELETE CASCADE,
      slot_index INTEGER NOT NULL,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      UNIQUE(lineup_id, slot_index),
      UNIQUE(lineup_id, player_id)
    );
  `);

  migratePlayerColumns(db);
  migrateToPlayerVersions(db);
  migrateRoleConfig(db);
  const { c } = db.prepare('SELECT COUNT(*) as c FROM clubs').get() as { c: number };
  if (c === 0) seedData(db);
  seedPL2526IfNeeded(db);
  seedClassicTeamsIfNeeded(db);
  seedMorePLClassicsIfNeeded(db);
  seedNonPLClassicsIfNeeded(db);
  seedPL2425IfNeeded(db);
}

function migratePlayerColumns(db: Database.Database): void {
  const cols = db.pragma('table_info(players)') as { name: string }[];
  const have = new Set(cols.map(c => c.name));
  const seCols = db.pragma('table_info(squad_entries)') as { name: string }[];
  const seHave = new Set(seCols.map(c => c.name));
  const oldSchema = seHave.has('player_id'); // true = pre-migration schema

  if (!have.has('base_rating')) {
    db.exec('ALTER TABLE players ADD COLUMN base_rating INTEGER NOT NULL DEFAULT 75');
    if (oldSchema) {
      db.exec(`UPDATE players SET base_rating = COALESCE((SELECT MAX(se.rating) FROM squad_entries se WHERE se.player_id = players.id), 75)`);
    }
  }
  if (!have.has('base_positions')) {
    db.exec("ALTER TABLE players ADD COLUMN base_positions TEXT NOT NULL DEFAULT '[]'");
    if (oldSchema) {
      db.exec(`UPDATE players SET base_positions = COALESCE((SELECT se.positions FROM squad_entries se WHERE se.player_id = players.id ORDER BY se.rating DESC LIMIT 1), '[]')`);
    }
  }
  if (!have.has('roles')) {
    db.exec("ALTER TABLE players ADD COLUMN roles TEXT NOT NULL DEFAULT '[]'");
  }

  // Only add roles to old-schema squad_entries (new schema has roles in player_versions)
  if (oldSchema && !seHave.has('roles')) {
    db.exec("ALTER TABLE squad_entries ADD COLUMN roles TEXT NOT NULL DEFAULT '[]'");
  }

  const clubCols = db.pragma('table_info(clubs)') as { name: string }[];
  const clubHave = new Set(clubCols.map(c => c.name));
  if (!clubHave.has('league')) {
    db.exec("ALTER TABLE clubs ADD COLUMN league TEXT NOT NULL DEFAULT 'PL'");
  }
}

function migrateToPlayerVersions(db: Database.Database): void {
  const seCols = db.pragma('table_info(squad_entries)') as { name: string }[];
  if (!seCols.some(c => c.name === 'player_id')) return; // already on new schema

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      type OldEntry = { id: number; player_id: number; season_label: string; rating: number; positions: string; roles: string };
      const entries = db.prepare(`
        SELECT se.id, se.player_id, s.label AS season_label,
               se.rating, se.positions, COALESCE(se.roles, '[]') AS roles
        FROM squad_entries se
        JOIN seasons s ON s.id = se.season_id
      `).all() as OldEntry[];

      const insertPV = db.prepare(
        'INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)'
      );
      const seToVersionId = new Map<number, number>();
      for (const e of entries) {
        const { lastInsertRowid } = insertPV.run(e.player_id, e.season_label, e.rating, e.positions, e.roles);
        seToVersionId.set(e.id, Number(lastInsertRowid));
      }

      db.exec(`
        CREATE TABLE squad_entries_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
          season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
          player_version_id INTEGER NOT NULL REFERENCES player_versions(id) ON DELETE CASCADE,
          UNIQUE(club_id, season_id, player_version_id)
        )
      `);

      const insertSE = db.prepare(
        'INSERT INTO squad_entries_v2 (id, club_id, season_id, player_version_id) VALUES (?, ?, ?, ?)'
      );
      const oldEntries = db.prepare('SELECT id, club_id, season_id FROM squad_entries').all() as
        { id: number; club_id: number; season_id: number }[];
      for (const e of oldEntries) {
        const pvId = seToVersionId.get(e.id);
        if (pvId != null) insertSE.run(e.id, e.club_id, e.season_id, pvId);
      }

      db.exec('DROP TABLE squad_entries');
      db.exec('ALTER TABLE squad_entries_v2 RENAME TO squad_entries');
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function seedData(db: Database.Database): void {
  // Seed all 34 seasons (1992/93 – 2025/26)
  const insertSeason = db.prepare('INSERT OR IGNORE INTO seasons (label, year_start) VALUES (?, ?)');
  for (let y = 1992; y <= 2025; y++) {
    insertSeason.run(`${y}/${String(y + 1).slice(-2)}`, y);
  }

  const ic = db.prepare('INSERT INTO clubs (name, short_name, color) VALUES (?, ?, ?)');
  const ip = db.prepare('INSERT INTO players (name, nationality) VALUES (?, ?)');
  const ipv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
  const ise = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');

  function season(label: string): number {
    return (db.prepare('SELECT id FROM seasons WHERE label = ?').get(label) as { id: number }).id;
  }

  // ── Arsenal 2003/04 (Invincibles) ──────────────────────────────────────────
  const ars = ic.run('Arsenal', 'ARS', '#ef0107').lastInsertRowid as number;
  const ars0304 = season('2003/04');
  const arsPlayers: [string, string, number, string][] = [
    ['Jens Lehmann', 'Germany', 87, '["GK"]'],
    ['Ashley Cole', 'England', 88, '["LB"]'],
    ['Sol Campbell', 'England', 88, '["CB"]'],
    ['Martin Keown', 'England', 79, '["CB"]'],
    ['Lauren', 'Cameroon', 81, '["RB"]'],
    ['Robert Pires', 'France', 90, '["LM","LW","CAM"]'],
    ['Patrick Vieira', 'France', 93, '["CM","CDM"]'],
    ['Gilberto Silva', 'Brazil', 83, '["CDM","CM"]'],
    ['Fredrik Ljungberg', 'Sweden', 85, '["RM","CM","CAM"]'],
    ['Dennis Bergkamp', 'Netherlands', 92, '["ST","CAM"]'],
    ['Thierry Henry', 'France', 97, '["ST","LW","LM"]'],
    ['Edu', 'Brazil', 78, '["CM","CDM"]'],
    ['Kolo Toure', 'Ivory Coast', 82, '["CB","RB"]'],
    ['Jose Antonio Reyes', 'Spain', 81, '["LW","LM","RW"]'],
    ['Pascal Cygan', 'France', 72, '["CB","LB"]'],
    ['Gael Clichy', 'France', 72, '["LB"]'],
    ['Cesc Fabregas', 'Spain', 80, '["CM","CAM"]'],
  ];
  for (const [name, nat, rating, pos] of arsPlayers) {
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(ars, ars0304, ipv.run(pid, '2003/04', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Manchester United 1998/99 (Treble) ────────────────────────────────────
  const mun = ic.run('Manchester United', 'MUN', '#da020a').lastInsertRowid as number;
  const mun9899 = season('1998/99');
  const munPlayers: [string, string, number, string][] = [
    ['Peter Schmeichel', 'Denmark', 93, '["GK"]'],
    ['Denis Irwin', 'Ireland', 84, '["LB","RB"]'],
    ['Jaap Stam', 'Netherlands', 90, '["CB"]'],
    ['Ronny Johnsen', 'Norway', 81, '["CB"]'],
    ['Gary Neville', 'England', 85, '["RB","CB"]'],
    ['Ryan Giggs', 'Wales', 91, '["LM","LW","CAM"]'],
    ['Roy Keane', 'Ireland', 93, '["CM","CDM"]'],
    ['Paul Scholes', 'England', 90, '["CM","CAM"]'],
    ['David Beckham', 'England', 89, '["RM","CM","RW"]'],
    ['Andy Cole', 'England', 86, '["ST"]'],
    ['Dwight Yorke', 'Trinidad & Tobago', 89, '["ST","CAM"]'],
    ['Ole Gunnar Solskjaer', 'Norway', 82, '["ST"]'],
    ['Teddy Sheringham', 'England', 83, '["ST","CAM"]'],
    ['Nicky Butt', 'England', 79, '["CM","CDM"]'],
    ['Phil Neville', 'England', 76, '["RB","LB","CM"]'],
    ['Jesper Blomqvist', 'Sweden', 75, '["LM","LW"]'],
  ];
  for (const [name, nat, rating, pos] of munPlayers) {
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(mun, mun9899, ipv.run(pid, '1998/99', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Chelsea 2004/05 ────────────────────────────────────────────────────────
  const che = ic.run('Chelsea', 'CHE', '#034694').lastInsertRowid as number;
  const che0405 = season('2004/05');
  const chePlayers: [string, string, number, string][] = [
    ['Petr Cech', 'Czech Republic', 91, '["GK"]'],
    ['William Gallas', 'France', 84, '["LB","CB"]'],
    ['John Terry', 'England', 92, '["CB"]'],
    ['Ricardo Carvalho', 'Portugal', 88, '["CB"]'],
    ['Paulo Ferreira', 'Portugal', 77, '["RB"]'],
    ['Joe Cole', 'England', 83, '["LM","CAM","RM"]'],
    ['Claude Makelele', 'France', 89, '["CDM"]'],
    ['Frank Lampard', 'England', 93, '["CM","CAM"]'],
    ['Arjen Robben', 'Netherlands', 88, '["RM","RW","LM"]'],
    ['Eidur Gudjohnsen', 'Iceland', 83, '["ST","CAM"]'],
    ['Didier Drogba', 'Ivory Coast', 91, '["ST"]'],
    ['Tiago', 'Portugal', 78, '["CM","CDM"]'],
    ['Damien Duff', 'Ireland', 85, '["LM","LW","RM"]'],
    ['Hernan Crespo', 'Argentina', 85, '["ST"]'],
    ['Glen Johnson', 'England', 75, '["RB"]'],
  ];
  for (const [name, nat, rating, pos] of chePlayers) {
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(che, che0405, ipv.run(pid, '2004/05', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Manchester City 2011/12 ────────────────────────────────────────────────
  const mci = ic.run('Manchester City', 'MCI', '#6cabdd').lastInsertRowid as number;
  const mci1112 = season('2011/12');
  const mciPlayers: [string, string, number, string][] = [
    ['Joe Hart', 'England', 87, '["GK"]'],
    ['Gael Clichy', 'France', 81, '["LB"]'],
    ['Vincent Kompany', 'Belgium', 90, '["CB"]'],
    ['Joleon Lescott', 'England', 82, '["CB"]'],
    ['Pablo Zabaleta', 'Argentina', 84, '["RB"]'],
    ['David Silva', 'Spain', 93, '["CM","CAM","LM"]'],
    ['Yaya Toure', 'Ivory Coast', 92, '["CM","CDM"]'],
    ['Gareth Barry', 'England', 83, '["CDM","CM"]'],
    ['James Milner', 'England', 81, '["RM","CM","LM"]'],
    ['Sergio Aguero', 'Argentina', 93, '["ST"]'],
    ['Carlos Tevez', 'Argentina', 90, '["ST","CAM"]'],
    ['Mario Balotelli', 'Italy', 84, '["ST"]'],
    ['Edin Dzeko', 'Bosnia & Herzegovina', 84, '["ST"]'],
    ['Samir Nasri', 'France', 86, '["CAM","CM","LM"]'],
    ['Adam Johnson', 'England', 80, '["RM","LM","LW"]'],
  ];
  for (const [name, nat, rating, pos] of mciPlayers) {
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(mci, mci1112, ipv.run(pid, '2011/12', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Leicester City 2015/16 ────────────────────────────────────────────────
  const lei = ic.run('Leicester City', 'LEI', '#003090').lastInsertRowid as number;
  const lei1516 = season('2015/16');
  const leiPlayers: [string, string, number, string][] = [
    ['Kasper Schmeichel', 'Denmark', 85, '["GK"]'],
    ['Christian Fuchs', 'Austria', 78, '["LB","LWB"]'],
    ['Wes Morgan', 'Jamaica', 80, '["CB"]'],
    ['Robert Huth', 'Germany', 82, '["CB"]'],
    ['Danny Simpson', 'England', 75, '["RB"]'],
    ['Marc Albrighton', 'England', 77, '["RM","LM","RW"]'],
    ["N'Golo Kante", 'France', 90, '["CDM","CM"]'],
    ['Danny Drinkwater', 'England', 79, '["CM"]'],
    ['Riyad Mahrez', 'Algeria', 88, '["RM","RW","LM"]'],
    ['Jamie Vardy', 'England', 87, '["ST"]'],
    ['Shinji Okazaki', 'Japan', 76, '["ST","CAM"]'],
    ['Andy King', 'Wales', 74, '["CM","LM"]'],
    ['Leonardo Ulloa', 'Argentina', 75, '["ST"]'],
  ];
  for (const [name, nat, rating, pos] of leiPlayers) {
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(lei, lei1516, ipv.run(pid, '2015/16', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Liverpool 2019/20 ─────────────────────────────────────────────────────
  const liv = ic.run('Liverpool', 'LIV', '#c8102e').lastInsertRowid as number;
  const liv1920 = season('2019/20');
  const livPlayers: [string, string, number, string][] = [
    ['Alisson', 'Brazil', 92, '["GK"]'],
    ['Andy Robertson', 'Scotland', 90, '["LB","LWB"]'],
    ['Virgil van Dijk', 'Netherlands', 94, '["CB"]'],
    ['Joel Matip', 'Cameroon', 85, '["CB"]'],
    ['Trent Alexander-Arnold', 'England', 89, '["RB","RM"]'],
    ['Sadio Mane', 'Senegal', 92, '["LW","LM","ST"]'],
    ['Jordan Henderson', 'England', 85, '["CM","CDM"]'],
    ['Fabinho', 'Brazil', 90, '["CDM","CM"]'],
    ['Georginio Wijnaldum', 'Netherlands', 85, '["CM"]'],
    ['Roberto Firmino', 'Brazil', 87, '["ST","CAM"]'],
    ['Mohamed Salah', 'Egypt', 93, '["RW","RM","ST"]'],
    ['Divock Origi', 'Belgium', 77, '["ST","LW"]'],
    ['Alex Oxlade-Chamberlain', 'England', 82, '["CM","RM","LM"]'],
    ['Xherdan Shaqiri', 'Switzerland', 79, '["RM","CAM","LM"]'],
    ['Joe Gomez', 'England', 82, '["CB","RB"]'],
  ];
  for (const [name, nat, rating, pos] of livPlayers) {
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(liv, liv1920, ipv.run(pid, '2019/20', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Blackburn Rovers 1994/95 ──────────────────────────────────────────────
  const blk = ic.run('Blackburn Rovers', 'BLK', '#009ee0').lastInsertRowid as number;
  const blk9495 = season('1994/95');
  const blkPlayers: [string, string, number, string][] = [
    ['Tim Flowers', 'England', 81, '["GK"]'],
    ['Graeme Le Saux', 'England', 83, '["LB","LM"]'],
    ['Colin Hendry', 'Scotland', 83, '["CB"]'],
    ['Ian Pearce', 'England', 74, '["CB"]'],
    ['Henning Berg', 'Norway', 79, '["RB","CB"]'],
    ['Stuart Ripley', 'England', 74, '["RM","RW"]'],
    ['Tim Sherwood', 'England', 78, '["CM"]'],
    ['David Batty', 'England', 80, '["CDM","CM"]'],
    ['Jason Wilcox', 'England', 76, '["LM","LW"]'],
    ['Alan Shearer', 'England', 94, '["ST"]'],
    ['Chris Sutton', 'England', 84, '["ST","CAM"]'],
    ['Kevin Gallacher', 'Scotland', 77, '["ST","RM"]'],
    ['Mike Newell', 'England', 73, '["ST"]'],
  ];
  for (const [name, nat, rating, pos] of blkPlayers) {
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(blk, blk9495, ipv.run(pid, '1994/95', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Chelsea 2013/14 (from screenshots) ────────────────────────────────────
  const che1314 = season('2013/14');
  const che1314Players: [string, string, number, string][] = [
    ['Petr Cech', 'Czech Republic', 88, '["GK"]'],
    ['Ashley Cole', 'England', 83, '["LB","LM"]'],
    ['John Terry', 'England', 89, '["CB"]'],
    ['Gary Cahill', 'England', 83, '["CB"]'],
    ['Branislav Ivanovic', 'Serbia', 83, '["RB","CB","LB"]'],
    ['Oscar', 'Brazil', 84, '["CAM","RM"]'],
    ['Nemanja Matic', 'Serbia', 87, '["CDM","CM"]'],
    ['Frank Lampard', 'England', 85, '["CM","CAM"]'],
    ['Willian', 'Brazil', 84, '["RM","RW","LM"]'],
    ['Eden Hazard', 'Belgium', 91, '["LM","LW","RM"]'],
    ['Samuel Eto\'o', 'Cameroon', 84, '["ST"]'],
    ['Fernando Torres', 'Spain', 79, '["ST"]'],
    ['Andre Schurrle', 'Germany', 80, '["LM","RM","ST"]'],
    ['David Luiz', 'Brazil', 82, '["CB","LB","CDM"]'],
    ['Mark Schwarzer', 'Australia', 77, '["GK"]'],
  ];
  const cheId = (db.prepare('SELECT id FROM clubs WHERE name = ?').get('Chelsea') as { id: number }).id;
  for (const [name, nat, rating, pos] of che1314Players) {
    const pidRow = db.prepare('SELECT id FROM players WHERE name = ?').get(name) as { id: number } | undefined;
    const pid = pidRow ? pidRow.id : (ip.run(name, nat).lastInsertRowid as number);
    ise.run(cheId, che1314, ipv.run(pid, '2013/14', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Tottenham 2018/19 ─────────────────────────────────────────────────────
  const tot = ic.run('Tottenham Hotspur', 'TOT', '#132257').lastInsertRowid as number;
  const tot1819 = season('2018/19');
  const totPlayers: [string, string, number, string][] = [
    ['Hugo Lloris', 'France', 88, '["GK"]'],
    ['Danny Rose', 'England', 82, '["LB","LWB"]'],
    ['Toby Alderweireld', 'Belgium', 87, '["CB"]'],
    ['Jan Vertonghen', 'Belgium', 86, '["CB","LB"]'],
    ['Kieran Trippier', 'England', 83, '["RB","RM"]'],
    ['Christian Eriksen', 'Denmark', 89, '["CAM","CM","RM","LM"]'],
    ['Moussa Sissoko', 'France', 80, '["CM","CDM","RM"]'],
    ['Victor Wanyama', 'Kenya', 79, '["CDM","CM"]'],
    ['Dele Alli', 'England', 86, '["CAM","CM","ST"]'],
    ['Son Heung-min', 'South Korea', 88, '["LM","LW","ST"]'],
    ['Harry Kane', 'England', 93, '["ST"]'],
    ['Davinson Sanchez', 'Colombia', 83, '["CB"]'],
    ['Lucas Moura', 'Brazil', 82, '["RM","LM","ST"]'],
    ['Fernando Llorente', 'Spain', 78, '["ST"]'],
  ];
  for (const [name, nat, rating, pos] of totPlayers) {
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(tot, tot1819, ipv.run(pid, '2018/19', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Newcastle United 2022/23 ──────────────────────────────────────────────
  const new_ = ic.run('Newcastle United', 'NEW', '#241f20').lastInsertRowid as number;
  const new2223 = season('2022/23');
  const newPlayers: [string, string, number, string][] = [
    ['Nick Pope', 'England', 86, '["GK"]'],
    ['Dan Burn', 'England', 79, '["LB","CB"]'],
    ['Fabian Schar', 'Switzerland', 82, '["CB"]'],
    ['Sven Botman', 'Netherlands', 83, '["CB"]'],
    ['Kieran Trippier', 'England', 85, '["RB","RM","LB"]'],
    ['Bruno Guimaraes', 'Brazil', 87, '["CDM","CM"]'],
    ['Joelinton', 'Brazil', 82, '["CM","CDM","LM"]'],
    ['Joe Willock', 'England', 77, '["CM","CAM"]'],
    ['Miguel Almiron', 'Paraguay', 82, '["RM","CAM","LM"]'],
    ['Alexander Isak', 'Sweden', 85, '["ST"]'],
    ['Callum Wilson', 'England', 81, '["ST"]'],
    ['Allan Saint-Maximin', 'France', 81, '["RM","LM","RW"]'],
    ['Anthony Gordon', 'England', 78, '["LM","RM","LW"]'],
  ];
  for (const [name, nat, rating, pos] of newPlayers) {
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(new_, new2223, ipv.run(pid, '2022/23', rating, pos, '[]').lastInsertRowid as number);
  }

  // ── Aston Villa 2024/25 ───────────────────────────────────────────────────
  const avl = ic.run('Aston Villa', 'AVL', '#95bfe5').lastInsertRowid as number;
  const avl2425 = season('2024/25');
  const avlPlayers: [string, string, number, string][] = [
    ['Emiliano Martinez', 'Argentina', 89, '["GK"]'],
    ['Lucas Digne', 'France', 79, '["LB","LWB"]'],
    ['Pau Torres', 'Spain', 84, '["CB"]'],
    ['Ezri Konsa', 'England', 82, '["CB","RB"]'],
    ['Matty Cash', 'Poland', 80, '["RB","RM"]'],
    ['Leon Bailey', 'Jamaica', 82, '["RM","LM","RW"]'],
    ['Douglas Luiz', 'Brazil', 84, '["CDM","CM"]'],
    ['Youri Tielemans', 'Belgium', 82, '["CM","CAM"]'],
    ['John McGinn', 'Scotland', 82, '["CM","RM"]'],
    ['Ollie Watkins', 'England', 87, '["ST"]'],
    ['Unai Emery', 'Spain', 0, '["MANAGER"]'],
    ['Moussa Diaby', 'France', 84, '["RM","LM","RW"]'],
    ['Jhon Duran', 'Colombia', 77, '["ST"]'],
    ['Morgan Rogers', 'England', 79, '["CAM","LM","RM"]'],
  ];
  for (const [name, nat, rating, pos] of avlPlayers) {
    if (name === 'Unai Emery') continue; // skip manager
    const pid = ip.run(name, nat).lastInsertRowid as number;
    ise.run(avl, avl2425, ipv.run(pid, '2024/25', rating, pos, '[]').lastInsertRowid as number);
  }
}

// ── PL 2025/26 Real Squads ────────────────────────────────────────────────

function seedPL2526IfNeeded(db: Database.Database): void {
  const season = db.prepare('SELECT id FROM seasons WHERE year_start = 2025').get() as { id: number } | undefined;
  if (!season) return;
  const { c } = db.prepare('SELECT COUNT(*) as c FROM squad_entries WHERE season_id = ?').get(season.id) as { c: number };
  if (c >= 380) return;
  seedPL2526(db, season.id);
}

type PL = { short: string; color: string; players: [string, string, number, string][] };

function seedPL2526(db: Database.Database, seasonId: number): void {
  const ip = db.prepare('INSERT OR IGNORE INTO players (name, nationality) VALUES (?, ?)');
  const ic = db.prepare('INSERT OR IGNORE INTO clubs (name, short_name, color) VALUES (?, ?, ?)');
  const ipv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
  const ise = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');

  function getOrCreateClub(name: string, short: string, color: string): number {
    ic.run(name, short, color);
    return (db.prepare('SELECT id FROM clubs WHERE name = ?').get(name) as { id: number }).id;
  }
  function getOrCreatePlayer(name: string, nat: string): number {
    let row = db.prepare('SELECT id FROM players WHERE name = ?').get(name) as { id: number } | undefined;
    if (!row) { ip.run(name, nat); row = db.prepare('SELECT id FROM players WHERE name = ?').get(name) as { id: number }; }
    return row.id;
  }

  const teams: Record<string, PL> = {
    'Arsenal': { short: 'ARS', color: '#EF0107', players: [
      ['David Raya',           'Spain',         86, '["GK"]'],
      ['Karl Hein',            'Estonia',       75, '["GK"]'],
      ['Ben White',            'England',       84, '["RB","CB"]'],
      ['William Saliba',       'France',        90, '["CB"]'],
      ['Gabriel Magalhães',    'Brazil',        86, '["CB"]'],
      ['Jurriën Timber',       'Netherlands',   83, '["LB","CB","RB"]'],
      ['Riccardo Calafiori',   'Italy',         82, '["CB","LB"]'],
      ['Jakub Kiwior',         'Poland',        77, '["CB","LB"]'],
      ['Oleksandr Zinchenko',  'Ukraine',       79, '["LB","CM"]'],
      ['Thomas Partey',        'Ghana',         82, '["CDM","CM"]'],
      ['Declan Rice',          'England',       88, '["CM","CDM"]'],
      ['Jorginho',             'Italy',         77, '["CDM","CM"]'],
      ['Martin Ødegaard',      'Norway',        89, '["CAM","CM"]'],
      ['Fabio Vieira',         'Portugal',      77, '["CAM","CM"]'],
      ['Myles Lewis-Skelly',   'England',       75, '["LB","CM"]'],
      ['Bukayo Saka',          'England',       90, '["RW","RM"]'],
      ['Gabriel Martinelli',   'Brazil',        84, '["LW","LM"]'],
      ['Leandro Trossard',     'Belgium',       83, '["LW","LM","CAM"]'],
      ['Reiss Nelson',         'England',       73, '["RW","LW"]'],
      ['Kai Havertz',          'Germany',       83, '["ST","CF"]'],
      ['Gabriel Jesus',        'Brazil',        80, '["ST","LW"]'],
      ['Eddie Nketiah',        'England',       76, '["ST"]'],
    ]},
    'Aston Villa': { short: 'AVL', color: '#670E36', players: [
      ['Emiliano Martínez',    'Argentina',     89, '["GK"]'],
      ['Robin Olsen',          'Sweden',        75, '["GK"]'],
      ['Matty Cash',           'Poland',        80, '["RB"]'],
      ['Ezri Konsa',           'England',       82, '["CB","RB"]'],
      ['Pau Torres',           'Spain',         84, '["CB"]'],
      ['Diego Carlos',         'Brazil',        80, '["CB"]'],
      ['Clément Lenglet',      'France',        76, '["CB"]'],
      ['Lucas Digne',          'France',        79, '["LB","LWB"]'],
      ['Alex Moreno',          'Spain',         77, '["LB"]'],
      ['Amadou Onana',         'Belgium',       83, '["CDM","CM"]'],
      ['Boubacar Kamara',      'France',        79, '["CDM","CM"]'],
      ['John McGinn',          'Scotland',      82, '["CM","RM"]'],
      ['Youri Tielemans',      'Belgium',       82, '["CM","CAM"]'],
      ['Ross Barkley',         'England',       75, '["CM","CAM"]'],
      ['Leon Bailey',          'Jamaica',       82, '["RW","LW","RM"]'],
      ['Morgan Rogers',        'England',       80, '["CAM","LM","RM"]'],
      ['Emiliano Buendía',     'Argentina',     79, '["CAM","LM","RM"]'],
      ['Moussa Diaby',         'France',        83, '["RW","LW"]'],
      ['Jaden Philogene',      'England',       76, '["RW","LW"]'],
      ['Ollie Watkins',        'England',       87, '["ST"]'],
      ['Jhon Durán',           'Colombia',      79, '["ST"]'],
    ]},
    'Bournemouth': { short: 'BOU', color: '#DA291C', players: [
      ['Kepa Arrizabalaga',    'Spain',         82, '["GK"]'],
      ['Neto',                 'Brazil',        75, '["GK"]'],
      ['Adam Smith',           'England',       73, '["RB"]'],
      ['Marcos Senesi',        'Argentina',     77, '["CB"]'],
      ['Ilya Zabarnyi',        'Ukraine',       80, '["CB"]'],
      ['Chris Mepham',         'Wales',         74, '["CB"]'],
      ['Milos Kerkez',         'Hungary',       80, '["LB"]'],
      ['Lewis Cook',           'England',       78, '["CDM","CM"]'],
      ['Tyler Adams',          'United States', 78, '["CDM","CM"]'],
      ['Ryan Christie',        'Scotland',      77, '["CM","RM"]'],
      ['Philip Billing',       'Denmark',       76, '["CM","CDM"]'],
      ['Alex Scott',           'England',       75, '["CM"]'],
      ['Marcus Tavernier',     'England',       76, '["RM","CM"]'],
      ['Dango Ouattara',       'Burkina Faso',  80, '["RW","RM"]'],
      ['Justin Kluivert',      'Netherlands',   80, '["CAM","LW"]'],
      ['Antoine Semenyo',      'Ghana',         79, '["RW","ST"]'],
      ['Luis Sinisterra',      'Colombia',      77, '["LW","LM"]'],
      ['David Brooks',         'Wales',         75, '["CAM","LW"]'],
      ['Evanilson',            'Brazil',        80, '["ST"]'],
      ['Enes Ünal',            'Turkey',        76, '["ST"]'],
    ]},
    'Brentford': { short: 'BRE', color: '#E30613', players: [
      ['Mark Flekken',         'Netherlands',   81, '["GK"]'],
      ['Thomas Strakosha',     'Albania',       74, '["GK"]'],
      ['Aaron Hickey',         'Scotland',      78, '["RB","LB"]'],
      ['Sepp van den Berg',    'Netherlands',   80, '["CB","RB"]'],
      ['Ethan Pinnock',        'Jamaica',       79, '["CB"]'],
      ['Pontus Jansson',       'Sweden',        79, '["CB"]'],
      ['Ben Mee',              'England',       77, '["CB"]'],
      ['Nathan Collins',       'Ireland',       79, '["CB"]'],
      ['Rico Henry',           'England',       79, '["LB","LWB"]'],
      ['Mads Roerslev',        'Denmark',       74, '["RB"]'],
      ['Christian Nørgaard',   'Denmark',       80, '["CDM","CM"]'],
      ['Vitaly Janelt',        'Germany',       78, '["CM","CDM"]'],
      ['Mathias Jensen',       'Denmark',       77, '["CM"]'],
      ['Frank Onyeka',         'Nigeria',       76, '["CDM","CM"]'],
      ['Josh Dasilva',         'England',       75, '["CM"]'],
      ['Keane Lewis-Potter',   'England',       76, '["LW","LM"]'],
      ['Kevin Schade',         'Germany',       76, '["LW","RW"]'],
      ['Bryan Mbeumo',         'Cameroon',      84, '["RW","ST","RM"]'],
      ['Yoane Wissa',          'Congo DR',      81, '["ST","LW"]'],
      ['Igor Thiago',          'Brazil',        78, '["ST"]'],
    ]},
    'Brighton': { short: 'BHA', color: '#0057B8', players: [
      ['Bart Verbruggen',      'Netherlands',   80, '["GK"]'],
      ['Jason Steele',         'England',       75, '["GK"]'],
      ['Tariq Lamptey',        'Ghana',         79, '["RB"]'],
      ['Lewis Dunk',           'England',       83, '["CB"]'],
      ['Jan Paul van Hecke',   'Netherlands',   80, '["CB"]'],
      ['Adam Webster',         'England',       76, '["CB"]'],
      ['Pervis Estupiñán',     'Ecuador',       82, '["LB","LWB"]'],
      ['Igor',                 'Brazil',        79, '["LB"]'],
      ['Carlos Baleba',        'Cameroon',      79, '["CDM","CM"]'],
      ['Mats Wieffer',         'Netherlands',   79, '["CDM","CM"]'],
      ['James Milner',         'England',       76, '["CM","CDM"]'],
      ['Billy Gilmour',        'Scotland',      77, '["CDM","CM"]'],
      ['Matt O\'Riley',        'Denmark',       80, '["CM","CAM"]'],
      ['Jack Hinshelwood',     'England',       74, '["CM"]'],
      ['Kaoru Mitoma',         'Japan',         83, '["LW","LM"]'],
      ['Simon Adingra',        'Ivory Coast',   79, '["RW","LW"]'],
      ['Solly March',          'England',       77, '["RW","LM"]'],
      ['Julio Enciso',         'Paraguay',      76, '["CAM","RW"]'],
      ['Yankuba Minteh',       'Gambia',        79, '["RW","LW"]'],
      ['João Pedro',           'Brazil',        82, '["ST","CF"]'],
      ['Evan Ferguson',        'Ireland',       80, '["ST"]'],
    ]},
    'Chelsea': { short: 'CHE', color: '#034694', players: [
      ['Robert Sánchez',       'Spain',         79, '["GK"]'],
      ['Djordje Petrović',     'Serbia',        77, '["GK"]'],
      ['Reece James',          'England',       84, '["RB"]'],
      ['Axel Disasi',          'France',        79, '["CB","RB"]'],
      ['Levi Colwill',         'England',       82, '["CB","LB"]'],
      ['Wesley Fofana',        'France',        81, '["CB"]'],
      ['Benoît Badiashile',    'France',        80, '["CB"]'],
      ['Marc Cucurella',       'Spain',         80, '["LB","CB"]'],
      ['Ben Chilwell',         'England',       79, '["LB"]'],
      ['Moisés Caicedo',       'Ecuador',       86, '["CDM","CM"]'],
      ['Romeo Lavia',          'Belgium',       80, '["CDM","CM"]'],
      ['Enzo Fernández',       'Argentina',     83, '["CM","CAM"]'],
      ['Kiernan Dewsbury-Hall','England',        79, '["CM","CAM"]'],
      ['Cole Palmer',          'England',       88, '["CAM","CM","RW"]'],
      ['Pedro Neto',           'Portugal',      83, '["RW","LW","RM"]'],
      ['Noni Madueke',         'England',       80, '["RW","LW"]'],
      ['Jadon Sancho',         'England',       80, '["LW","RW"]'],
      ['Mykhaylo Mudryk',      'Ukraine',       78, '["LW","LM"]'],
      ['Christopher Nkunku',   'France',        83, '["LW","ST","LM"]'],
      ['Nicolas Jackson',      'Senegal',       82, '["ST"]'],
      ['Armando Broja',        'Albania',       77, '["ST"]'],
    ]},
    'Crystal Palace': { short: 'CRY', color: '#1B458F', players: [
      ['Dean Henderson',       'England',       82, '["GK"]'],
      ['Sam Johnstone',        'England',       76, '["GK"]'],
      ['Daniel Muñoz',         'Colombia',      78, '["RB"]'],
      ['Nathaniel Clyne',      'England',       74, '["RB"]'],
      ['Marc Guéhi',           'England',       83, '["CB"]'],
      ['Joachim Andersen',     'Denmark',       82, '["CB"]'],
      ['Chris Richards',       'United States', 76, '["CB","RB"]'],
      ['Tyrick Mitchell',      'England',       79, '["LB"]'],
      ['Cheick Doucouré',      'France',        80, '["CDM","CM"]'],
      ['Adam Wharton',         'England',       79, '["CM","CDM"]'],
      ['Jefferson Lerma',      'Colombia',      77, '["CDM","CM"]'],
      ['Will Hughes',          'England',       75, '["CM","CDM"]'],
      ['Daichi Kamada',        'Japan',         78, '["CAM","CM"]'],
      ['Eberechi Eze',         'England',       85, '["CAM","CM","RW"]'],
      ['Ismaïla Sarr',         'Senegal',       80, '["RW","LW"]'],
      ['Jean-Philippe Mateta', 'France',        82, '["ST"]'],
      ['Odsonne Édouard',      'France',        77, '["ST","CAM"]'],
      ['Jordan Ayew',          'Ghana',         75, '["ST","LW"]'],
    ]},
    'Everton': { short: 'EVE', color: '#274488', players: [
      ['Jordan Pickford',      'England',       83, '["GK"]'],
      ['Joao Virginia',        'Portugal',      73, '["GK"]'],
      ['Nathan Patterson',     'Scotland',      75, '["RB"]'],
      ['Séamus Coleman',       'Ireland',       74, '["RB"]'],
      ['Jarrad Branthwaite',   'England',       81, '["CB"]'],
      ['James Tarkowski',      'England',       80, '["CB"]'],
      ['Michael Keane',        'England',       75, '["CB"]'],
      ['Ben Godfrey',          'England',       76, '["CB","RB"]'],
      ['Vitaliy Mykolenko',    'Ukraine',       78, '["LB"]'],
      ['Idrissa Gueye',        'Senegal',       78, '["CDM","CM"]'],
      ['Abdoulaye Doucouré',   'France',        79, '["CM","CDM"]'],
      ['James Garner',         'England',       77, '["CM","CDM"]'],
      ['Tim Iroegbunam',       'England',       75, '["CDM","CM"]'],
      ['Jack Harrison',        'England',       78, '["LW","LM","RW"]'],
      ['Arnaut Danjuma',       'Netherlands',   76, '["LW","RW"]'],
      ['Iliman Ndiaye',        'Senegal',       80, '["CAM","LW","RW"]'],
      ['Dominic Calvert-Lewin','England',       79, '["ST"]'],
      ['Beto',                 'Portugal',      78, '["ST"]'],
      ['Youssef Chermiti',     'Portugal',      75, '["ST"]'],
    ]},
    'Fulham': { short: 'FUL', color: '#CC0000', players: [
      ['Bernd Leno',           'Germany',       83, '["GK"]'],
      ['Marek Rodák',          'Slovakia',      74, '["GK"]'],
      ['Kenny Tete',           'Netherlands',   77, '["RB"]'],
      ['Timothy Castagne',     'Belgium',       79, '["RB","LB"]'],
      ['Calvin Bassey',        'Nigeria',       79, '["CB"]'],
      ['Issa Diop',            'France',        79, '["CB"]'],
      ['Tim Ream',             'United States', 76, '["CB"]'],
      ['Antonee Robinson',     'United States', 81, '["LB","LWB"]'],
      ['Harrison Reed',        'England',       77, '["CDM","CM"]'],
      ['Sasa Lukic',           'Serbia',        76, '["CM","CDM"]'],
      ['Tom Cairney',          'Scotland',      76, '["CM","CAM"]'],
      ['Andreas Pereira',      'Brazil',        81, '["CAM","CM","LM"]'],
      ['Emile Smith Rowe',     'England',       82, '["CAM","LM","CM"]'],
      ['Alex Iwobi',           'Nigeria',       81, '["RM","CAM","RW"]'],
      ['Harry Wilson',         'Wales',         75, '["RM","CAM"]'],
      ['Bobby De Cordova-Reid','Jamaica',       75, '["RW","LM"]'],
      ['Rodrigo Muniz',        'Brazil',        80, '["ST"]'],
      ['Raúl Jiménez',         'Mexico',        78, '["ST","CF"]'],
      ['Carlos Vinícius',      'Brazil',        77, '["ST"]'],
      ['Jay Stansfield',       'England',       76, '["ST"]'],
    ]},
    'Ipswich Town': { short: 'IPS', color: '#0044A9', players: [
      ['Arijanet Muric',       'Kosovo',        78, '["GK"]'],
      ['Christian Walton',     'England',       74, '["GK"]'],
      ['Harry Clarke',         'England',       74, '["RB"]'],
      ['Jacob Greaves',        'England',       73, '["RB","CB"]'],
      ['Dara O\'Shea',         'Ireland',       78, '["CB","RB"]'],
      ['Luke Woolfenden',      'England',       76, '["CB"]'],
      ['Axel Tuanzebe',        'England',       75, '["CB"]'],
      ['Leif Davis',           'England',       77, '["LB","LWB"]'],
      ['Sam Morsy',            'Egypt',         77, '["CDM","CM"]'],
      ['Kalvin Phillips',      'England',       77, '["CDM","CM"]'],
      ['Jack Taylor',          'Ireland',       75, '["CM"]'],
      ['Massimo Luongo',       'Australia',     74, '["CM","CDM"]'],
      ['Omari Hutchinson',     'England',       78, '["LW","LM","RW"]'],
      ['Wes Burns',            'Wales',         75, '["RW","RM"]'],
      ['Marcus Harness',       'England',       74, '["RM","LM"]'],
      ['Nathan Broadhead',     'Wales',         75, '["LW","ST"]'],
      ['Conor Chaplin',        'England',       75, '["CAM","ST"]'],
      ['Sammie Szmodics',      'Ireland',       78, '["CAM","RW"]'],
      ['Liam Delap',           'England',       80, '["ST"]'],
      ['George Hirst',         'England',       74, '["ST"]'],
    ]},
    'Liverpool': { short: 'LIV', color: '#C8102E', players: [
      ['Alisson',              'Brazil',        90, '["GK"]'],
      ['Caoimhin Kelleher',    'Ireland',       78, '["GK"]'],
      ['Trent Alexander-Arnold','England',      89, '["RB","CM","RM"]'],
      ['Joe Gomez',            'England',       80, '["CB","RB"]'],
      ['Virgil van Dijk',      'Netherlands',   91, '["CB"]'],
      ['Ibrahima Konaté',      'France',        85, '["CB"]'],
      ['Andy Robertson',       'Scotland',      87, '["LB","LWB"]'],
      ['Konstantinos Tsimikas','Greece',        78, '["LB","LWB"]'],
      ['Alexis Mac Allister',  'Argentina',     86, '["CM","CDM"]'],
      ['Ryan Gravenberch',     'Netherlands',   83, '["CM","CDM"]'],
      ['Wataru Endo',          'Japan',         79, '["CDM","CM"]'],
      ['Dominik Szoboszlai',   'Hungary',       84, '["CM","CAM"]'],
      ['Harvey Elliott',       'England',       78, '["CM","RW"]'],
      ['Curtis Jones',         'England',       78, '["CM"]'],
      ['Mohamed Salah',        'Egypt',         92, '["RW","RM","ST"]'],
      ['Federico Chiesa',      'Italy',         79, '["RW","LW"]'],
      ['Cody Gakpo',           'Netherlands',   84, '["LW","ST","LM"]'],
      ['Luis Díaz',            'Colombia',      86, '["LW","LM"]'],
      ['Ben Doak',             'Scotland',      76, '["RW","LM"]'],
      ['Diogo Jota',           'Portugal',      84, '["ST","LW"]'],
      ['Darwin Núñez',         'Uruguay',       83, '["ST"]'],
    ]},
    'Manchester City': { short: 'MCI', color: '#6CABDD', players: [
      ['Ederson',              'Brazil',        88, '["GK"]'],
      ['Stefan Ortega',        'Germany',       81, '["GK"]'],
      ['Kyle Walker',          'England',       83, '["RB"]'],
      ['Rico Lewis',           'England',       78, '["RB","CM"]'],
      ['Rúben Dias',           'Portugal',      90, '["CB"]'],
      ['John Stones',          'England',       82, '["CB","CDM"]'],
      ['Manuel Aké',           'Netherlands',   83, '["CB","LB"]'],
      ['Josko Gvardiol',       'Croatia',       85, '["CB","LB"]'],
      ['Rodri',                'Spain',         91, '["CDM","CM"]'],
      ['Mateo Kovačić',        'Croatia',       82, '["CM","CDM"]'],
      ['İlkay Gündoğan',       'Germany',       83, '["CM","CAM"]'],
      ['Bernardo Silva',       'Portugal',      87, '["CM","CAM","RM"]'],
      ['Kevin De Bruyne',      'Belgium',       91, '["CM","CAM"]'],
      ['Matheus Nunes',        'Portugal',      79, '["CM","CDM"]'],
      ['Phil Foden',           'England',       88, '["RW","CM","CAM"]'],
      ['Savinho',              'Brazil',        80, '["RW","LM"]'],
      ['Oscar Bobb',           'Norway',        77, '["RW","LM"]'],
      ['Jack Grealish',        'England',       81, '["LW","LM"]'],
      ['Jeremy Doku',          'Belgium',       82, '["LW","LM"]'],
      ['Erling Haaland',       'Norway',        94, '["ST"]'],
    ]},
    'Manchester United': { short: 'MUN', color: '#DA020A', players: [
      ['André Onana',          'Cameroon',      83, '["GK"]'],
      ['Tom Heaton',           'England',       73, '["GK"]'],
      ['Noussair Mazraoui',    'Morocco',       79, '["RB","CB"]'],
      ['Diogo Dalot',          'Portugal',      82, '["RB","LB"]'],
      ['Leny Yoro',            'France',        80, '["CB"]'],
      ['Lisandro Martínez',    'Argentina',     84, '["CB"]'],
      ['Harry Maguire',        'England',       79, '["CB"]'],
      ['Victor Lindelöf',      'Sweden',        78, '["CB"]'],
      ['Luke Shaw',            'England',       80, '["LB"]'],
      ['Tyrell Malacia',       'Netherlands',   77, '["LB"]'],
      ['Casemiro',             'Brazil',        82, '["CDM","CM"]'],
      ['Kobbie Mainoo',        'England',       83, '["CM","CDM"]'],
      ['Mason Mount',          'England',       80, '["CM","CAM"]'],
      ['Bruno Fernandes',      'Portugal',      86, '["CAM","CM"]'],
      ['Alejandro Garnacho',   'Argentina',     82, '["LW","RW","LM"]'],
      ['Amad Diallo',          'Ivory Coast',   81, '["RW","LW","RM"]'],
      ['Marcus Rashford',      'England',       83, '["LW","ST","RW"]'],
      ['Antony',               'Brazil',        76, '["RW","LW"]'],
      ['Joshua Zirkzee',       'Netherlands',   80, '["ST","CF"]'],
      ['Rasmus Højlund',       'Denmark',       81, '["ST"]'],
    ]},
    'Newcastle United': { short: 'NEW', color: '#241F20', players: [
      ['Nick Pope',            'England',       85, '["GK"]'],
      ['Martin Dúbravka',      'Slovakia',      78, '["GK"]'],
      ['Kieran Trippier',      'England',       84, '["RB","LB"]'],
      ['Sven Botman',          'Netherlands',   83, '["CB"]'],
      ['Fabian Schär',         'Switzerland',   82, '["CB"]'],
      ['Dan Burn',             'England',       79, '["CB","LB"]'],
      ['Lloyd Kelly',          'England',       78, '["CB","LB"]'],
      ['Jamaal Lascelles',     'England',       76, '["CB"]'],
      ['Matt Targett',         'England',       76, '["LB"]'],
      ['Bruno Guimarães',      'Brazil',        87, '["CDM","CM"]'],
      ['Sandro Tonali',        'Italy',         85, '["CM","CDM"]'],
      ['Joelinton',            'Brazil',        83, '["CM","CDM","LM"]'],
      ['Lewis Miley',          'England',       76, '["CM"]'],
      ['Sean Longstaff',       'England',       76, '["CM","CDM"]'],
      ['Joe Willock',          'England',       76, '["CM","CAM"]'],
      ['Anthony Gordon',       'England',       83, '["LW","LM","RW"]'],
      ['Harvey Barnes',        'England',       79, '["LW","LM","RW"]'],
      ['Jacob Murphy',         'England',       75, '["RM","LM"]'],
      ['Miguel Almirón',       'Paraguay',      79, '["RM","CAM"]'],
      ['Alexander Isak',       'Sweden',        87, '["ST"]'],
      ['Callum Wilson',        'England',       79, '["ST"]'],
    ]},
    'Nottingham Forest': { short: 'NFO', color: '#DD0000', players: [
      ['Matz Sels',            'Belgium',       80, '["GK"]'],
      ['Matt Turner',          'United States', 76, '["GK"]'],
      ['Ola Aina',             'Nigeria',       79, '["RB","LB"]'],
      ['Nikola Milenkovic',    'Serbia',        81, '["CB"]'],
      ['Murillo',              'Brazil',        80, '["CB"]'],
      ['Andrew Omobamidele',   'Ireland',       77, '["CB"]'],
      ['Willy Boly',           'France',        76, '["CB"]'],
      ['Nuno Tavares',         'Portugal',      81, '["LB","LWB"]'],
      ['Harry Toffolo',        'England',       74, '["LB"]'],
      ['Ibrahim Sangaré',      'Ivory Coast',   80, '["CDM","CM"]'],
      ['Elliot Anderson',      'England',       78, '["CM","CDM"]'],
      ['Nicolás Domínguez',    'Argentina',     78, '["CDM","CM"]'],
      ['Ryan Yates',           'England',       76, '["CM","CDM"]'],
      ['Morgan Gibbs-White',   'England',       82, '["CAM","CM"]'],
      ['Danilo',               'Brazil',        77, '["CM","CDM"]'],
      ['Callum Hudson-Odoi',   'England',       79, '["LW","RW","LM"]'],
      ['Anthony Elanga',       'Sweden',        79, '["RW","LW"]'],
      ['Taiwo Awoniyi',        'Nigeria',       79, '["ST"]'],
      ['Chris Wood',           'New Zealand',   79, '["ST"]'],
      ['Divock Origi',         'Belgium',       75, '["ST","LW"]'],
    ]},
    'Southampton': { short: 'SOU', color: '#D71920', players: [
      ['Gavin Bazunu',         'Ireland',       77, '["GK"]'],
      ['Alex McCarthy',        'England',       74, '["GK"]'],
      ['Yukinari Sugawara',    'Japan',         76, '["RB"]'],
      ['Kyle Walker-Peters',   'England',       79, '["RB","LB"]'],
      ['Jan Bednarek',         'Poland',        78, '["CB"]'],
      ['Taylor Harwood-Bellis','England',        77, '["CB"]'],
      ['Armel Bella-Kotchap',  'Germany',       76, '["CB"]'],
      ['Jack Stephens',        'England',       74, '["CB"]'],
      ['Romain Perraud',       'France',        77, '["LB"]'],
      ['Flynn Downes',         'England',       76, '["CDM","CM"]'],
      ['Joe Aribo',            'Nigeria',       77, '["CM","CAM"]'],
      ['Carlos Alcaraz',       'Argentina',     76, '["CM","CAM"]'],
      ['Adam Lallana',         'England',       74, '["CM","CAM"]'],
      ['Stuart Armstrong',     'Scotland',      74, '["CM"]'],
      ['Tyler Dibling',        'England',       75, '["LW","LM"]'],
      ['Nathan Tella',         'England',       75, '["RW","LM"]'],
      ['Sékou Mara',           'Guinea',        74, '["ST","LW"]'],
      ['Cameron Archer',       'England',       76, '["ST"]'],
      ['Adam Armstrong',       'England',       76, '["ST","LW"]'],
      ['Paul Onuachu',         'Nigeria',       76, '["ST"]'],
    ]},
    'Tottenham Hotspur': { short: 'TOT', color: '#132257', players: [
      ['Guglielmo Vicario',    'Italy',         82, '["GK"]'],
      ['Fraser Forster',       'England',       74, '["GK"]'],
      ['Pedro Porro',          'Spain',         82, '["RB","RM"]'],
      ['Radu Drăgușin',        'Romania',       78, '["CB"]'],
      ['Cristian Romero',      'Argentina',     87, '["CB"]'],
      ['Micky van de Ven',     'Netherlands',   84, '["CB"]'],
      ['Davinson Sánchez',     'Colombia',      78, '["CB"]'],
      ['Ben Davies',           'Wales',         78, '["LB","CB"]'],
      ['Destiny Udogie',       'Italy',         81, '["LB","LWB"]'],
      ['Yves Bissouma',        'Mali',          80, '["CDM","CM"]'],
      ['Pape Sarr',            'Senegal',       79, '["CM","CDM"]'],
      ['Oliver Skipp',         'England',       76, '["CM","CDM"]'],
      ['Dejan Kulusevski',     'Sweden',        83, '["CM","RW","RM"]'],
      ['James Maddison',       'England',       84, '["CAM","CM"]'],
      ['Giovani Lo Celso',     'Argentina',     78, '["CM","CAM"]'],
      ['Son Heung-min',        'South Korea',   87, '["LW","LM","ST"]'],
      ['Wilson Odobert',       'France',        77, '["LW","LM"]'],
      ['Brennan Johnson',      'Wales',         81, '["RW","LW","RM"]'],
      ['Manor Solomon',        'Israel',        75, '["LW","LM"]'],
      ['Richarlison',          'Brazil',        78, '["ST","LW"]'],
      ['Dominic Solanke',      'England',       82, '["ST","CF"]'],
    ]},
    'West Ham United': { short: 'WHU', color: '#7A263A', players: [
      ['Alphonse Areola',      'France',        78, '["GK"]'],
      ['Wes Foderingham',      'England',       73, '["GK"]'],
      ['Vladimir Coufal',      'Czech Republic',77, '["RB"]'],
      ['Aaron Wan-Bissaka',    'England',       78, '["RB","LB"]'],
      ['Kurt Zouma',           'France',        80, '["CB"]'],
      ['Konstantinos Mavropanos','Greece',      79, '["CB"]'],
      ['Nayef Aguerd',         'Morocco',       79, '["CB"]'],
      ['Max Kilman',           'England',       80, '["CB"]'],
      ['Emerson Palmieri',     'Italy',         77, '["LB","LWB"]'],
      ['Edson Álvarez',        'Mexico',        81, '["CDM","CM"]'],
      ['Guido Rodríguez',      'Argentina',     78, '["CDM","CM"]'],
      ['Tomáš Souček',         'Czech Republic',79, '["CM","CDM"]'],
      ['James Ward-Prowse',    'England',       80, '["CM","CAM"]'],
      ['Lucas Paquetá',        'Brazil',        84, '["CM","CAM"]'],
      ['Carlos Soler',         'Spain',         77, '["CM","CAM"]'],
      ['Jarrod Bowen',         'England',       83, '["RW","RM","ST"]'],
      ['Mohammed Kudus',       'Ghana',         83, '["RW","CAM","LW"]'],
      ['Crysencio Summerville','Netherlands',   80, '["LW","LM","RW"]'],
      ['Said Benrahma',        'Algeria',       76, '["LW","CAM"]'],
      ['Michail Antonio',      'Jamaica',       76, '["ST","LW"]'],
      ['Danny Ings',           'England',       75, '["ST"]'],
    ]},
    'Wolverhampton Wanderers': { short: 'WOL', color: '#FDB913', players: [
      ['José Sá',              'Portugal',      82, '["GK"]'],
      ['Daniel Bentley',       'England',       74, '["GK"]'],
      ['Nelson Semedo',        'Portugal',      82, '["RB"]'],
      ['Pedro Lima',           'Portugal',      73, '["RB"]'],
      ['Santiago Bueno',       'Uruguay',       78, '["CB"]'],
      ['Toti Gomes',           'Portugal',      77, '["CB"]'],
      ['Yerson Mosquera',      'Colombia',      76, '["CB"]'],
      ['Emmanuel Agbadou',     'Cameroon',      76, '["CB"]'],
      ['Rayan Aït-Nouri',      'France',        81, '["LB","LWB"]'],
      ['João Gomes',           'Brazil',        79, '["CDM","CM"]'],
      ['Mario Lemina',         'Gabon',         79, '["CDM","CM"]'],
      ['Boubacar Traoré',      'Mali',          76, '["CM","CDM"]'],
      ['Tommy Doyle',          'England',       76, '["CM","CDM"]'],
      ['Luke Cundle',          'England',       73, '["CM"]'],
      ['Matheus Cunha',        'Brazil',        84, '["CAM","ST","LW"]'],
      ['Pablo Sarabia',        'Spain',         79, '["RW","LW","CAM"]'],
      ['Hwang Hee-chan',       'South Korea',   80, '["ST","LW","LM"]'],
      ['Gonçalo Guedes',       'Portugal',      78, '["LW","LM","RW"]'],
      ['Rodrigo Gomes',        'Portugal',      74, '["RW","LM"]'],
      ['Jorgen Strand Larsen', 'Norway',        78, '["ST"]'],
      ['Carlos Forbs',         'Portugal',      74, '["LW","RW"]'],
    ]},
  };

  const doSeed = db.transaction(() => {
    for (const [clubName, { short, color, players }] of Object.entries(teams)) {
      const cid = getOrCreateClub(clubName, short, color);
      for (const [name, nat, rating, pos] of players) {
        const pid = getOrCreatePlayer(name, nat);
        const pvId = ipv.run(pid, '2025/26', rating, pos, '[]').lastInsertRowid as number;
        ise.run(cid, seasonId, pvId);
      }
    }
  });
  doSeed();

  // Backfill base_rating / base_positions for all players from their best player_version
  db.exec(`
    UPDATE players SET
      base_rating = (SELECT MAX(pv.rating) FROM player_versions pv WHERE pv.player_id = players.id),
      base_positions = (
        SELECT pv.positions FROM player_versions pv
        WHERE pv.player_id = players.id ORDER BY pv.rating DESC LIMIT 1
      )
    WHERE EXISTS (SELECT 1 FROM player_versions pv WHERE pv.player_id = players.id)
  `);
}

// ── Classic team seeding ──────────────────────────────────────────────────────
// Most classic teams are already seeded in seedData. Only Man City 2017/18 is missing.

function seedClassicTeamsIfNeeded(db: Database.Database) {
  const s2017 = db.prepare('SELECT id FROM seasons WHERE year_start = 2017').get() as { id: number } | undefined;
  if (!s2017) return;
  const mci = db.prepare("SELECT id FROM clubs WHERE name = 'Manchester City'").get() as { id: number } | undefined;
  if (mci) {
    const { c } = db.prepare('SELECT COUNT(*) as c FROM squad_entries WHERE season_id = ? AND club_id = ?').get(s2017.id, mci.id) as { c: number };
    if (c > 0) return;
  }

  const ic = db.prepare('INSERT OR IGNORE INTO clubs (name, short_name, color) VALUES (?, ?, ?)');
  const ipv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
  const ise = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');

  ic.run('Manchester City', 'MCI', '#6cabdd');
  const mciId = (db.prepare("SELECT id FROM clubs WHERE name = 'Manchester City'").get() as { id: number }).id;

  function findOrCreatePlayer(name: string, nat: string): number {
    const existing = db.prepare('SELECT id FROM players WHERE name = ? AND nationality = ?').get(name, nat) as { id: number } | undefined;
    if (existing) return existing.id;
    return db.prepare('INSERT INTO players (name, nationality) VALUES (?, ?)').run(name, nat).lastInsertRowid as number;
  }

  const playerData: [string, string, number, string][] = [
    ['Ederson',          'Brazil',     89, '["GK"]'],
    ['Kyle Walker',      'England',    85, '["RB","RWB"]'],
    ['Vincent Kompany',  'Belgium',    84, '["CB"]'],
    ['Nicolas Otamendi', 'Argentina',  83, '["CB"]'],
    ['Benjamin Mendy',   'France',     82, '["LB","LWB"]'],
    ['Kevin De Bruyne',  'Belgium',    93, '["CM","CAM"]'],
    ['Fernandinho',      'Brazil',     85, '["CDM","CM"]'],
    ['David Silva',      'Spain',      88, '["CAM","CM","LM"]'],
    ['Leroy Sane',       'Germany',    86, '["LW","LM"]'],
    ['Sergio Aguero',    'Argentina',  91, '["ST"]'],
    ['Raheem Sterling',  'England',    85, '["RW","LW","ST"]'],
    ['Bernardo Silva',   'Portugal',   85, '["CAM","CM","RW"]'],
    ['Ilkay Gundogan',   'Germany',    83, '["CM","CAM"]'],
    ['John Stones',      'England',    81, '["CB"]'],
    ['Aymeric Laporte',  'France',     86, '["CB","LB"]'],
    ['Gabriel Jesus',    'Brazil',     82, '["ST","LW"]'],
    ['Fabian Delph',     'England',    79, '["LB","CM"]'],
    ['Claudio Bravo',    'Chile',      77, '["GK"]'],
  ];

  for (const [name, nat, rating, pos] of playerData) {
    const pid = findOrCreatePlayer(name, nat);
    ise.run(mciId, s2017.id, ipv.run(pid, '2017/18', rating, pos, '[]').lastInsertRowid as number);
  }
}

// ── Additional PL classic seasons ─────────────────────────────────────────
// Each team gates independently — new entries can be added without
// re-seeding already-present club-seasons.

function seedMorePLClassicsIfNeeded(db: Database.Database) {
  function findOrCreatePlayer(name: string, nat: string): number {
    const existing = db.prepare('SELECT id FROM players WHERE name = ? AND nationality = ?').get(name, nat) as { id: number } | undefined;
    if (existing) return existing.id;
    return db.prepare('INSERT INTO players (name, nationality) VALUES (?, ?)').run(name, nat).lastInsertRowid as number;
  }

  function clubId(name: string): number | undefined {
    return (db.prepare('SELECT id FROM clubs WHERE name = ?').get(name) as { id: number } | undefined)?.id;
  }

  function seasonId(yearStart: number): number | undefined {
    return (db.prepare('SELECT id FROM seasons WHERE year_start = ?').get(yearStart) as { id: number } | undefined)?.id;
  }

  function alreadySeeded(cId: number, sId: number): boolean {
    const { c } = db.prepare('SELECT COUNT(*) as c FROM squad_entries WHERE club_id = ? AND season_id = ?').get(cId, sId) as { c: number };
    return c > 0;
  }

  const ipv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
  const ise = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');

  function seedSquad(cId: number, sId: number, label: string, players: [string, string, number, string][]) {
    for (const [name, nat, rating, pos] of players) {
      const pid = findOrCreatePlayer(name, nat);
      ise.run(cId, sId, ipv.run(pid, label, rating, pos, '[]').lastInsertRowid as number);
    }
  }

  // ── Chelsea 2009/10 (Ancelotti – PL + FA Cup double) ──────────────────────
  const che = clubId('Chelsea'); const s0910 = seasonId(2009);
  if (che && s0910 && !alreadySeeded(che, s0910)) {
    seedSquad(che, s0910, '2009/10', [
      ['Petr Cech',              'Czech Republic', 88, '["GK"]'],
      ['Branislav Ivanovic',     'Serbia',         83, '["RB","CB"]'],
      ['John Terry',             'England',        90, '["CB"]'],
      ['Alex',                   'Brazil',         82, '["CB"]'],
      ['Ashley Cole',            'England',        88, '["LB"]'],
      ['Michael Essien',         'Ghana',          85, '["CDM","CM"]'],
      ['Frank Lampard',          'England',        91, '["CM","CAM"]'],
      ['Michael Ballack',        'Germany',        83, '["CM","CAM"]'],
      ['Nicolas Anelka',         'France',         84, '["ST","RW","LW"]'],
      ['Didier Drogba',          'Ivory Coast',    92, '["ST"]'],
      ['Florent Malouda',        'France',         82, '["LM","LW","RM"]'],
      ['Ricardo Carvalho',       'Portugal',       86, '["CB"]'],
      ['John Obi Mikel',         'Nigeria',        78, '["CDM","CM"]'],
      ['Salomon Kalou',          'Ivory Coast',    78, '["LW","ST","LM"]'],
      ['Yury Zhirkov',           'Russia',         75, '["LM","LW"]'],
      ['Ross Turnbull',          'England',        72, '["GK"]'],
    ]);
  }

  // ── Liverpool 2013/14 (Rodgers – title narrowly missed; Suárez's best season) ──
  const liv = clubId('Liverpool'); const s1314liv = seasonId(2013);
  if (liv && s1314liv && !alreadySeeded(liv, s1314liv)) {
    seedSquad(liv, s1314liv, '2013/14', [
      ['Simon Mignolet',         'Belgium',        80, '["GK"]'],
      ['Glen Johnson',           'England',        80, '["RB"]'],
      ['Martin Skrtel',          'Slovakia',       82, '["CB"]'],
      ['Mamadou Sakho',          'France',         79, '["CB"]'],
      ['Jose Enrique',           'Spain',          76, '["LB","LWB"]'],
      ['Steven Gerrard',         'England',        87, '["CM","CDM","CAM"]'],
      ['Jordan Henderson',       'England',        79, '["CM","CDM"]'],
      ['Philippe Coutinho',      'Brazil',         87, '["CAM","CM","LM"]'],
      ['Raheem Sterling',        'England',        82, '["RW","LW","RM"]'],
      ['Daniel Sturridge',       'England',        88, '["ST"]'],
      ['Luis Suarez',            'Uruguay',        94, '["ST","LW","RW"]'],
      ['Kolo Toure',             'Ivory Coast',    77, '["CB"]'],
      ['Lucas Leiva',            'Brazil',         74, '["CDM","CM"]'],
      ['Victor Moses',           'Nigeria',        76, '["RM","LM","RW"]'],
      ['Joe Allen',              'Wales',          74, '["CM"]'],
      ['Brad Jones',             'Australia',      72, '["GK"]'],
    ]);
  }

  // ── Manchester United 1994/95 (Ferguson – runners-up PL; Cantona ban) ──────
  const mun = clubId('Manchester United'); const s9495 = seasonId(1994);
  if (mun && s9495 && !alreadySeeded(mun, s9495)) {
    seedSquad(mun, s9495, '1994/95', [
      ['Peter Schmeichel',       'Denmark',        91, '["GK"]'],
      ['Gary Neville',           'England',        80, '["RB","CB"]'],
      ['Gary Pallister',         'England',        84, '["CB"]'],
      ['Steve Bruce',            'England',        83, '["CB"]'],
      ['Denis Irwin',            'Ireland',        84, '["LB","RB"]'],
      ['Andrei Kanchelskis',     'Russia',         85, '["RM","RW","LM"]'],
      ['Roy Keane',              'Ireland',        89, '["CM","CDM"]'],
      ['Paul Ince',              'England',        84, '["CM","CDM"]'],
      ['Ryan Giggs',             'Wales',          86, '["LM","LW","CAM"]'],
      ['Eric Cantona',           'France',         89, '["CAM","ST"]'],
      ['Mark Hughes',            'Wales',          83, '["ST"]'],
      ['Andy Cole',              'England',        85, '["ST"]'],
      ['Lee Sharpe',             'England',        80, '["LM","LW","RM"]'],
      ['Brian McClair',          'Scotland',       76, '["ST","CM"]'],
      ['Nicky Butt',             'England',        76, '["CM","CDM"]'],
      ['Gary Walsh',             'England',        73, '["GK"]'],
    ]);
  }

  // ── Chelsea 2014/15 (Mourinho – PL champions; Hazard PFA player of year) ───
  const s1415 = seasonId(2014);
  if (che && s1415 && !alreadySeeded(che, s1415)) {
    seedSquad(che, s1415, '2014/15', [
      ['Thibaut Courtois',       'Belgium',        90, '["GK"]'],
      ['Branislav Ivanovic',     'Serbia',         83, '["RB","CB"]'],
      ['John Terry',             'England',        87, '["CB"]'],
      ['Gary Cahill',            'England',        84, '["CB"]'],
      ['Cesar Azpilicueta',      'Spain',          85, '["LB","RB","CB"]'],
      ['Nemanja Matic',          'Serbia',         86, '["CDM","CM"]'],
      ['Cesc Fabregas',          'Spain',          87, '["CM","CAM"]'],
      ['Willian',                'Brazil',         83, '["RM","RW","LM"]'],
      ['Eden Hazard',            'Belgium',        92, '["LM","LW","CAM","RM"]'],
      ['Oscar',                  'Brazil',         82, '["CAM","RM","CM"]'],
      ['Diego Costa',            'Spain',          88, '["ST"]'],
      ['Petr Cech',              'Czech Republic', 85, '["GK"]'],
      ['Filipe Luis',            'Brazil',         82, '["LB","LWB"]'],
      ['Ramires',                'Brazil',         81, '["CM","CDM","RM"]'],
      ['Loic Remy',              'France',         79, '["ST","LW"]'],
      ['Kurt Zouma',             'France',         76, '["CB"]'],
    ]);
  }

  // ── Chelsea 2016/17 (Conte – 3-4-3; 30 wins in PL) ───────────────────────
  const s1617 = seasonId(2016);
  if (che && s1617 && !alreadySeeded(che, s1617)) {
    seedSquad(che, s1617, '2016/17', [
      ['Thibaut Courtois',       'Belgium',        89, '["GK"]'],
      ['Cesar Azpilicueta',      'Spain',          86, '["CB","RB","LB"]'],
      ['Gary Cahill',            'England',        83, '["CB"]'],
      ['David Luiz',             'Brazil',         85, '["CB","CDM"]'],
      ['Victor Moses',           'Nigeria',        82, '["RWB","RB","RM"]'],
      ["N'Golo Kante",           'France',         91, '["CDM","CM"]'],
      ['Nemanja Matic',          'Serbia',         84, '["CDM","CM"]'],
      ['Marcos Alonso',          'Spain',          84, '["LWB","LB","LM"]'],
      ['Pedro',                  'Spain',          82, '["RW","LW","RM","ST"]'],
      ['Diego Costa',            'Spain',          87, '["ST"]'],
      ['Eden Hazard',            'Belgium',        90, '["LW","LM","CAM","RW"]'],
      ['Cesc Fabregas',          'Spain',          85, '["CM","CAM"]'],
      ['Willian',                'Brazil',         83, '["RW","LW","RM"]'],
      ['Michy Batshuayi',        'Belgium',        79, '["ST"]'],
      ['John Terry',             'England',        82, '["CB"]'],
      ['Eduardo',                'Croatia',        74, '["GK"]'],
    ]);
  }

  // ── Manchester United 2007/08 (Ferguson – UCL + PL; Ronaldo Ballon d'Or) ──
  const s0708 = seasonId(2007);
  if (mun && s0708 && !alreadySeeded(mun, s0708)) {
    seedSquad(mun, s0708, '2007/08', [
      ['Edwin van der Sar',      'Netherlands',    90, '["GK"]'],
      ['Wes Brown',              'England',        79, '["RB","CB"]'],
      ['Rio Ferdinand',          'England',        91, '["CB"]'],
      ['Nemanja Vidic',          'Serbia',         90, '["CB"]'],
      ['Patrice Evra',           'France',         87, '["LB","LWB"]'],
      ['Cristiano Ronaldo',      'Portugal',       96, '["RW","RM","LW","ST"]'],
      ['Michael Carrick',        'England',        83, '["CM","CDM"]'],
      ['Owen Hargreaves',        'England',        82, '["CDM","CM"]'],
      ['Ryan Giggs',             'Wales',          82, '["LM","LW","CM"]'],
      ['Wayne Rooney',           'England',        89, '["ST","CAM","LW"]'],
      ['Carlos Tevez',           'Argentina',      87, '["ST","LW","CAM"]'],
      ['Paul Scholes',           'England',        85, '["CM","CAM"]'],
      ['Nani',                   'Portugal',       82, '["LM","RM","LW","RW"]'],
      ['Louis Saha',             'France',         77, '["ST"]'],
      ['Anderson',               'Brazil',         77, '["CM","CDM"]'],
      ['Tomasz Kuszczak',        'Poland',         75, '["GK"]'],
    ]);
  }

  // ── Liverpool 2004/05 (Benítez – CL winners; Miracle of Istanbul) ─────────
  const s0405liv = seasonId(2004);
  if (liv && s0405liv && !alreadySeeded(liv, s0405liv)) {
    seedSquad(liv, s0405liv, '2004/05', [
      ['Jerzy Dudek',            'Poland',         80, '["GK"]'],
      ['Steve Finnan',           'Ireland',        79, '["RB"]'],
      ['Sami Hyypia',            'Finland',        83, '["CB"]'],
      ['Jamie Carragher',        'England',        85, '["CB"]'],
      ['John Arne Riise',        'Norway',         81, '["LB","LM","LWB"]'],
      ['Dietmar Hamann',         'Germany',        83, '["CDM","CM"]'],
      ['Steven Gerrard',         'England',        90, '["CM","CAM","CDM"]'],
      ['Xabi Alonso',            'Spain',          87, '["CM","CDM"]'],
      ['Luis Garcia',            'Spain',          82, '["CAM","LM","RM"]'],
      ['Milan Baros',            'Czech Republic', 79, '["ST"]'],
      ['Djibril Cisse',          'France',         80, '["ST","LW"]'],
      ['Harry Kewell',           'Australia',      79, '["LM","LW","RM"]'],
      ['Vladimir Smicer',        'Czech Republic', 77, '["RM","RW","CAM"]'],
      ['Igor Biscan',            'Croatia',        73, '["CM","CDM"]'],
      ['Chris Kirkland',         'England',        74, '["GK"]'],
    ]);
  }

  // ── Liverpool 2008/09 (Benítez – 2nd in PL, 86 pts; Torres & Gerrard peak) ─
  const s0809 = seasonId(2008);
  if (liv && s0809 && !alreadySeeded(liv, s0809)) {
    seedSquad(liv, s0809, '2008/09', [
      ['Pepe Reina',             'Spain',          88, '["GK"]'],
      ['Alvaro Arbeloa',         'Spain',          79, '["RB","LB"]'],
      ['Daniel Agger',           'Denmark',        82, '["CB","LB"]'],
      ['Jamie Carragher',        'England',        86, '["CB"]'],
      ['Fabio Aurelio',          'Brazil',         77, '["LB","LWB"]'],
      ['Javier Mascherano',      'Argentina',      88, '["CDM","CM"]'],
      ['Steven Gerrard',         'England',        91, '["CM","CAM"]'],
      ['Yossi Benayoun',         'Israel',         79, '["CAM","RM","LM"]'],
      ['Albert Riera',           'Spain',          78, '["LM","LW"]'],
      ['Dirk Kuyt',              'Netherlands',    80, '["RM","ST","RW"]'],
      ['Fernando Torres',        'Spain',          91, '["ST"]'],
      ['Sami Hyypia',            'Finland',        80, '["CB"]'],
      ['Ryan Babel',             'Netherlands',    77, '["LW","LM","RW"]'],
      ['Lucas Leiva',            'Brazil',         73, '["CDM","CM"]'],
      ['Diego Cavalieri',        'Brazil',         72, '["GK"]'],
    ]);
  }
}

// ── Non-PL classic teams (Serie A, La Liga etc.) ──────────────────────────
// These clubs must never appear in the 2025/26 PL simulation opponents.
// Gate each team on its own squad_entries count so new entries can be added
// without invalidating existing seeds.

function seedNonPLClassicsIfNeeded(db: Database.Database) {
  function findOrCreatePlayer(name: string, nat: string): number {
    const existing = db.prepare('SELECT id FROM players WHERE name = ? AND nationality = ?').get(name, nat) as { id: number } | undefined;
    if (existing) return existing.id;
    return db.prepare('INSERT INTO players (name, nationality) VALUES (?, ?)').run(name, nat).lastInsertRowid as number;
  }

  function findOrCreateClub(name: string, shortName: string, color: string, league = 'PL'): number {
    const existing = db.prepare('SELECT id, league FROM clubs WHERE name = ?').get(name) as { id: number; league: string } | undefined;
    if (existing) {
      if (existing.league !== league) db.prepare('UPDATE clubs SET league = ? WHERE id = ?').run(league, existing.id);
      return existing.id;
    }
    return db.prepare('INSERT INTO clubs (name, short_name, color, league) VALUES (?, ?, ?, ?)').run(name, shortName, color, league).lastInsertRowid as number;
  }

  // ── AC Milan 2006/07 (Champions League winners) ─────────────────────────
  const s2006 = db.prepare('SELECT id FROM seasons WHERE year_start = 2006').get() as { id: number } | undefined;
  if (s2006) {
    const milId = findOrCreateClub('AC Milan', 'ACM', '#C8102E', 'SA');
    const { c: milC } = db.prepare('SELECT COUNT(*) as c FROM squad_entries WHERE season_id = ? AND club_id = ?').get(s2006.id, milId) as { c: number };
    if (milC === 0) {
      const milIpv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
      const milIse = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');
      const squad: [string, string, number, string][] = [
        // GK
        ['Dida',               'Brazil',         82, '["GK"]'],
        // Defenders
        ['Cafu',               'Brazil',         81, '["RB","RWB"]'],
        ['Alessandro Nesta',   'Italy',          90, '["CB"]'],
        ['Paolo Maldini',      'Italy',          87, '["CB","LB"]'],
        ['Marek Jankulovski',  'Czech Republic', 77, '["LB","LWB"]'],
        // Midfielders
        ['Gennaro Gattuso',    'Italy',          82, '["CDM","CM"]'],
        ['Andrea Pirlo',       'Italy',          89, '["CM","CDM"]'],
        ['Massimo Ambrosini',  'Italy',          78, '["CM","CDM"]'],
        ['Clarence Seedorf',   'Netherlands',    84, '["CM","CAM"]'],
        // Attacking
        ['Kaká',               'Brazil',         93, '["CAM","CM"]'],
        ['Filippo Inzaghi',    'Italy',          83, '["ST","CF"]'],
        // Squad depth
        ['Alberto Gilardino',  'Italy',          81, '["ST","CF"]'],
        ['Christian Abbiati',  'Italy',          76, '["GK"]'],
        ['Massimo Oddo',       'Italy',          77, '["RB","RWB"]'],
        ['Giuseppe Favalli',   'Italy',          73, '["LB","CB"]'],
        ['Kaká',               'Brazil',         93, '["CAM","CM"]'], // deduplicated by findOrCreatePlayer
      ];
      // remove accidental duplicate
      const seen = new Set<string>();
      for (const [name, nat, rating, pos] of squad) {
        const key = `${name}|${nat}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pid = findOrCreatePlayer(name, nat);
        milIse.run(milId, s2006.id, milIpv.run(pid, '2006/07', rating, pos, '[]').lastInsertRowid as number);
      }

      // Save the UCL final XI as the default lineup (4-3-2-1 Christmas tree)
      const existingLineup = db.prepare('SELECT id FROM team_lineups WHERE club_id = ? AND season_id = ?').get(milId, s2006.id) as { id: number } | undefined;
      if (!existingLineup) {
        const lineupId = db.prepare('INSERT INTO team_lineups (club_id, season_id, formation) VALUES (?, ?, ?)').run(milId, s2006.id, '4-3-2-1').lastInsertRowid as number;
        const xiNames = [
          'Dida', 'Cafu', 'Nesta', 'Maldini', 'Jankulovski',
          'Gattuso', 'Pirlo', 'Ambrosini',
          'Kaká', 'Seedorf', 'Inzaghi',
        ];
        // Map slot index to player by matching partial name
        const allEntries = db.prepare(`
          SELECT se.id AS entry_id, p.name, pv.player_id
          FROM squad_entries se
          JOIN player_versions pv ON pv.id = se.player_version_id
          JOIN players p ON p.id = pv.player_id
          WHERE se.club_id = ? AND se.season_id = ?
        `).all(milId, s2006.id) as { entry_id: number; name: string; player_id: number }[];

        const ils = db.prepare('INSERT INTO lineup_slots (lineup_id, slot_index, player_id) VALUES (?, ?, ?)');
        const nameMap = new Map(allEntries.map(e => [e.name, e.player_id]));

        // 4-3-2-1 slots: ST, LCAM, RCAM, LCM, CM, RCM, LB, CB, CB, RB, GK
        const xiOrder = ['Filippo Inzaghi', 'Kaká', 'Clarence Seedorf', 'Massimo Ambrosini', 'Andrea Pirlo', 'Gennaro Gattuso', 'Marek Jankulovski', 'Paolo Maldini', 'Alessandro Nesta', 'Cafu', 'Dida'];
        void xiNames;
        xiOrder.forEach((fullName, i) => {
          const playerId = nameMap.get(fullName);
          if (playerId != null) ils.run(lineupId, i, playerId);
        });
      }
    }
  }
}

// ── PL 2024/25 squads ─────────────────────────────────────────────────────

function seedPL2425IfNeeded(db: Database.Database): void {
  seedArsenal2425IfNeeded(db);
  seedChelsea2425IfNeeded(db);
  seedLiverpool2425IfNeeded(db);
  seedBrighton2425IfNeeded(db);
  seedWestHam2425IfNeeded(db);
}

function seedArsenal2425IfNeeded(db: Database.Database): void {
  const season = db.prepare('SELECT id FROM seasons WHERE year_start = 2024').get() as { id: number } | undefined;
  if (!season) return;
  const arsClub = db.prepare("SELECT id FROM clubs WHERE name = 'Arsenal'").get() as { id: number } | undefined;
  if (!arsClub) return;
  const { c } = db.prepare(
    'SELECT COUNT(*) as c FROM squad_entries se JOIN player_versions pv ON pv.id = se.player_version_id WHERE se.club_id = ? AND se.season_id = ?'
  ).get(arsClub.id, season.id) as { c: number };
  if (c > 0) return;

  function findOrCreatePlayer(name: string, nat: string): number {
    const row = db.prepare('SELECT id FROM players WHERE name = ?').get(name) as { id: number } | undefined;
    if (row) return row.id;
    return db.prepare('INSERT INTO players (name, nationality) VALUES (?, ?)').run(name, nat).lastInsertRowid as number;
  }

  const ipv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
  const ise = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');

  const squad: [string, string, number, string][] = [
    // Goalkeepers
    ['David Raya',           'Spain',        87, '["GK"]'],
    ['Karl Hein',            'Estonia',      74, '["GK"]'],
    // Defenders
    ['Ben White',            'England',      83, '["RB","CB"]'],
    ['William Saliba',       'France',       90, '["CB"]'],
    ['Gabriel Magalhães',    'Brazil',       85, '["CB"]'],
    ['Jurriën Timber',       'Netherlands',  84, '["LB","CB","RB"]'],
    ['Riccardo Calafiori',   'Italy',        82, '["CB","LB"]'],
    ['Jakub Kiwior',         'Poland',       76, '["CB","LB"]'],
    ['Oleksandr Zinchenko',  'Ukraine',      78, '["LB","CM"]'],
    ['Takehiro Tomiyasu',    'Japan',        78, '["RB","CB"]'],
    ['Myles Lewis-Skelly',   'England',      75, '["LB","CM"]'],
    // Midfielders
    ['Declan Rice',          'England',      88, '["CDM","CM"]'],
    ['Martin Ødegaard',      'Norway',       89, '["CAM","CM"]'],
    ['Mikel Merino',         'Spain',        82, '["CM","CDM"]'],
    ['Thomas Partey',        'Ghana',        80, '["CDM","CM"]'],
    ['Jorginho',             'Italy',        76, '["CDM","CM"]'],
    ['Fabio Vieira',         'Portugal',     76, '["CAM","CM"]'],
    ['Leandro Trossard',     'Belgium',      83, '["LW","LM","CAM"]'],
    // Forwards
    ['Bukayo Saka',          'England',      91, '["RW","RM"]'],
    ['Gabriel Martinelli',   'Brazil',       83, '["LW","LM"]'],
    ['Kai Havertz',          'Germany',      84, '["ST","CF"]'],
    ['Gabriel Jesus',        'Brazil',       79, '["ST","LW"]'],
    ['Eddie Nketiah',        'England',      75, '["ST"]'],
    ['Reiss Nelson',         'England',      72, '["RW","LW"]'],
    ['Ethan Nwaneri',        'England',      74, '["CAM","LW"]'],
  ];

  db.transaction(() => {
    for (const [name, nat, rating, pos] of squad) {
      const pid = findOrCreatePlayer(name, nat);
      ise.run(arsClub.id, season.id, ipv.run(pid, '2024/25', rating, pos, '[]').lastInsertRowid as number);
    }

    // Save Arteta's most-used XI: 4-3-3 (CDM)
    // Slots: 0=LW, 1=ST, 2=RW, 3=CM-left, 4=CDM, 5=CM-right, 6=LB, 7=CB, 8=CB, 9=RB, 10=GK
    const existingLineup = db.prepare('SELECT id FROM team_lineups WHERE club_id = ? AND season_id = ?').get(arsClub.id, season.id) as { id: number } | undefined;
    if (!existingLineup) {
      const lineupId = db.prepare('INSERT INTO team_lineups (club_id, season_id, formation) VALUES (?, ?, ?)').run(arsClub.id, season.id, '4-3-3 (CDM)').lastInsertRowid as number;
      const allPlayers = db.prepare(`
        SELECT p.name, pv.player_id
        FROM squad_entries se
        JOIN player_versions pv ON pv.id = se.player_version_id
        JOIN players p ON p.id = pv.player_id
        WHERE se.club_id = ? AND se.season_id = ?
      `).all(arsClub.id, season.id) as { name: string; player_id: number }[];
      const nameMap = new Map(allPlayers.map(e => [e.name, e.player_id]));
      const xi = [
        'Gabriel Martinelli',  // 0: LW
        'Kai Havertz',         // 1: ST
        'Bukayo Saka',         // 2: RW
        'Martin Ødegaard',     // 3: CM-left
        'Declan Rice',         // 4: CDM (holding)
        'Mikel Merino',        // 5: CM-right
        'Riccardo Calafiori',  // 6: LB
        'Gabriel Magalhães',   // 7: CB
        'William Saliba',      // 8: CB
        'Jurriën Timber',      // 9: RB
        'David Raya',          // 10: GK
      ];
      const ils = db.prepare('INSERT INTO lineup_slots (lineup_id, slot_index, player_id) VALUES (?, ?, ?)');
      xi.forEach((name, i) => {
        const playerId = nameMap.get(name);
        if (playerId != null) ils.run(lineupId, i, playerId);
      });
    }
  })();
}

function seedChelsea2425IfNeeded(db: Database.Database): void {
  const season = db.prepare('SELECT id FROM seasons WHERE year_start = 2024').get() as { id: number } | undefined;
  if (!season) return;
  const cheClub = db.prepare("SELECT id FROM clubs WHERE name = 'Chelsea'").get() as { id: number } | undefined;
  if (!cheClub) return;
  const { c } = db.prepare(
    'SELECT COUNT(*) as c FROM squad_entries se JOIN player_versions pv ON pv.id = se.player_version_id WHERE se.club_id = ? AND se.season_id = ?'
  ).get(cheClub.id, season.id) as { c: number };
  if (c > 0) return;

  function findOrCreatePlayer(name: string, nat: string): number {
    const row = db.prepare('SELECT id FROM players WHERE name = ?').get(name) as { id: number } | undefined;
    if (row) return row.id;
    return db.prepare('INSERT INTO players (name, nationality) VALUES (?, ?)').run(name, nat).lastInsertRowid as number;
  }

  const ipv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
  const ise = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');

  const squad: [string, string, number, string][] = [
    // Goalkeepers
    ['Filip Jørgensen',       'Denmark',      79, '["GK"]'],
    ['Robert Sánchez',        'Spain',        77, '["GK"]'],
    // Defenders
    ['Reece James',           'England',      83, '["RB"]'],
    ['Malo Gusto',            'France',       80, '["RB"]'],
    ['Axel Disasi',           'France',       78, '["CB","RB"]'],
    ['Levi Colwill',          'England',      83, '["CB","LB"]'],
    ['Wesley Fofana',         'France',       80, '["CB"]'],
    ['Benoît Badiashile',     'France',       78, '["CB"]'],
    ['Tosin Adarabioyo',      'England',      78, '["CB"]'],
    ['Renato Veiga',          'Portugal',     79, '["CB","LB","CDM"]'],
    ['Marc Cucurella',        'Spain',        82, '["LB","CB"]'],
    ['Ben Chilwell',          'England',      76, '["LB"]'],
    // Midfielders
    ['Moisés Caicedo',        'Ecuador',      87, '["CDM","CM"]'],
    ['Romeo Lavia',           'Belgium',      81, '["CDM","CM"]'],
    ['Enzo Fernández',        'Argentina',    82, '["CM","CAM"]'],
    ['Kiernan Dewsbury-Hall', 'England',      79, '["CM","CAM"]'],
    ['Cole Palmer',           'England',      90, '["CAM","CM","RW"]'],
    // Forwards
    ['Pedro Neto',            'Portugal',     83, '["RW","LW","RM"]'],
    ['Noni Madueke',          'England',      81, '["RW","LW"]'],
    ['Jadon Sancho',          'England',      81, '["LW","RW"]'],
    ['Mykhaylo Mudryk',       'Ukraine',      77, '["LW","LM"]'],
    ['Christopher Nkunku',    'France',       83, '["LW","ST","LM"]'],
    ['Nicolas Jackson',       'Senegal',      82, '["ST"]'],
    ['Armando Broja',         'Albania',      74, '["ST"]'],
  ];

  db.transaction(() => {
    for (const [name, nat, rating, pos] of squad) {
      const pid = findOrCreatePlayer(name, nat);
      ise.run(cheClub.id, season.id, ipv.run(pid, '2024/25', rating, pos, '[]').lastInsertRowid as number);
    }

    // Maresca's preferred XI: 4-2-3-1
    // Slots: 0=ST, 1=LM, 2=CAM, 3=RM, 4=CDM, 5=CDM, 6=LB, 7=CB, 8=CB, 9=RB, 10=GK
    const existingLineup = db.prepare('SELECT id FROM team_lineups WHERE club_id = ? AND season_id = ?').get(cheClub.id, season.id) as { id: number } | undefined;
    if (!existingLineup) {
      const lineupId = db.prepare('INSERT INTO team_lineups (club_id, season_id, formation) VALUES (?, ?, ?)').run(cheClub.id, season.id, '4-2-3-1').lastInsertRowid as number;
      const allPlayers = db.prepare(`
        SELECT p.name, pv.player_id
        FROM squad_entries se
        JOIN player_versions pv ON pv.id = se.player_version_id
        JOIN players p ON p.id = pv.player_id
        WHERE se.club_id = ? AND se.season_id = ?
      `).all(cheClub.id, season.id) as { name: string; player_id: number }[];
      const nameMap = new Map(allPlayers.map(e => [e.name, e.player_id]));
      const xi = [
        'Nicolas Jackson',        // 0: ST
        'Christopher Nkunku',     // 1: LM
        'Cole Palmer',            // 2: CAM
        'Noni Madueke',           // 3: RM
        'Moisés Caicedo',         // 4: CDM
        'Romeo Lavia',            // 5: CDM
        'Marc Cucurella',         // 6: LB
        'Levi Colwill',           // 7: CB
        'Wesley Fofana',          // 8: CB
        'Malo Gusto',             // 9: RB
        'Filip Jørgensen',        // 10: GK
      ];
      const ils = db.prepare('INSERT INTO lineup_slots (lineup_id, slot_index, player_id) VALUES (?, ?, ?)');
      xi.forEach((name, i) => {
        const playerId = nameMap.get(name);
        if (playerId != null) ils.run(lineupId, i, playerId);
      });
    }
  })();
}

function seedLiverpool2425IfNeeded(db: Database.Database): void {
  const season = db.prepare('SELECT id FROM seasons WHERE year_start = 2024').get() as { id: number } | undefined;
  if (!season) return;
  const livClub = db.prepare("SELECT id FROM clubs WHERE name = 'Liverpool'").get() as { id: number } | undefined;
  if (!livClub) return;
  const { c } = db.prepare(
    'SELECT COUNT(*) as c FROM squad_entries se JOIN player_versions pv ON pv.id = se.player_version_id WHERE se.club_id = ? AND se.season_id = ?'
  ).get(livClub.id, season.id) as { c: number };
  if (c > 0) return;

  function findOrCreatePlayer(name: string, nat: string): number {
    const row = db.prepare('SELECT id FROM players WHERE name = ?').get(name) as { id: number } | undefined;
    if (row) return row.id;
    return db.prepare('INSERT INTO players (name, nationality) VALUES (?, ?)').run(name, nat).lastInsertRowid as number;
  }

  const ipv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
  const ise = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');

  const squad: [string, string, number, string][] = [
    // Goalkeepers
    ['Alisson',                  'Brazil',        91, '["GK"]'],
    ['Caoimhín Kelleher',        'Ireland',       78, '["GK"]'],
    ['Vitézslav Jaroš',          'Czech Republic',73, '["GK"]'],
    // Defenders
    ['Trent Alexander-Arnold',   'England',       88, '["RB","CM","RM"]'],
    ['Conor Bradley',            'Northern Ireland', 80, '["RB"]'],
    ['Virgil van Dijk',          'Netherlands',   91, '["CB"]'],
    ['Ibrahima Konaté',          'France',        86, '["CB"]'],
    ['Jarell Quansah',           'England',       77, '["CB"]'],
    ['Joe Gomez',                'England',       79, '["CB","RB"]'],
    ['Andy Robertson',           'Scotland',      85, '["LB","LWB"]'],
    ['Konstantinos Tsimikas',    'Greece',        77, '["LB","LWB"]'],
    // Midfielders
    ['Ryan Gravenberch',         'Netherlands',   85, '["CDM","CM"]'],
    ['Alexis Mac Allister',      'Argentina',     86, '["CM","CDM"]'],
    ['Dominik Szoboszlai',       'Hungary',       83, '["CM","CAM"]'],
    ['Curtis Jones',             'England',       79, '["CM"]'],
    ['Wataru Endo',              'Japan',         78, '["CDM","CM"]'],
    ['Harvey Elliott',           'England',       78, '["CM","RW"]'],
    ['Tyler Morton',             'England',       74, '["CDM","CM"]'],
    // Forwards
    ['Mohamed Salah',            'Egypt',         93, '["RW","RM","ST"]'],
    ['Luis Díaz',                'Colombia',      86, '["LW","LM"]'],
    ['Cody Gakpo',               'Netherlands',   83, '["LW","ST","LM"]'],
    ['Diogo Jota',               'Portugal',      84, '["ST","LW"]'],
    ['Darwin Núñez',             'Uruguay',       82, '["ST"]'],
    ['Federico Chiesa',          'Italy',         78, '["RW","LW"]'],
    ['Ben Doak',                 'Scotland',      76, '["RW","LM"]'],
  ];

  db.transaction(() => {
    for (const [name, nat, rating, pos] of squad) {
      const pid = findOrCreatePlayer(name, nat);
      ise.run(livClub.id, season.id, ipv.run(pid, '2024/25', rating, pos, '[]').lastInsertRowid as number);
    }

    // Slot's most-used XI: 4-3-3 (CDM)
    // Slots: 0=LW, 1=ST, 2=RW, 3=CM-left, 4=CDM, 5=CM-right, 6=LB, 7=CB, 8=CB, 9=RB, 10=GK
    const existingLineup = db.prepare('SELECT id FROM team_lineups WHERE club_id = ? AND season_id = ?').get(livClub.id, season.id) as { id: number } | undefined;
    if (!existingLineup) {
      const lineupId = db.prepare('INSERT INTO team_lineups (club_id, season_id, formation) VALUES (?, ?, ?)').run(livClub.id, season.id, '4-3-3 (CDM)').lastInsertRowid as number;
      const allPlayers = db.prepare(`
        SELECT p.name, pv.player_id
        FROM squad_entries se
        JOIN player_versions pv ON pv.id = se.player_version_id
        JOIN players p ON p.id = pv.player_id
        WHERE se.club_id = ? AND se.season_id = ?
      `).all(livClub.id, season.id) as { name: string; player_id: number }[];
      const nameMap = new Map(allPlayers.map(e => [e.name, e.player_id]));
      const xi = [
        'Luis Díaz',               // 0: LW
        'Diogo Jota',              // 1: ST
        'Mohamed Salah',           // 2: RW
        'Dominik Szoboszlai',      // 3: CM-left
        'Ryan Gravenberch',        // 4: CDM (holding)
        'Alexis Mac Allister',     // 5: CM-right
        'Andy Robertson',          // 6: LB
        'Ibrahima Konaté',         // 7: CB
        'Virgil van Dijk',         // 8: CB
        'Trent Alexander-Arnold',  // 9: RB
        'Alisson',                 // 10: GK
      ];
      const ils = db.prepare('INSERT INTO lineup_slots (lineup_id, slot_index, player_id) VALUES (?, ?, ?)');
      xi.forEach((name, i) => {
        const playerId = nameMap.get(name);
        if (playerId != null) ils.run(lineupId, i, playerId);
      });
    }
  })();
}

function seedBrighton2425IfNeeded(db: Database.Database): void {
  const season = db.prepare('SELECT id FROM seasons WHERE year_start = 2024').get() as { id: number } | undefined;
  if (!season) return;
  const club = db.prepare("SELECT id FROM clubs WHERE name = 'Brighton'").get() as { id: number } | undefined;
  if (!club) return;
  const { c } = db.prepare(
    'SELECT COUNT(*) as c FROM squad_entries se JOIN player_versions pv ON pv.id = se.player_version_id WHERE se.club_id = ? AND se.season_id = ?'
  ).get(club.id, season.id) as { c: number };
  if (c > 0) return;

  function findOrCreatePlayer(name: string, nat: string): number {
    const row = db.prepare('SELECT id FROM players WHERE name = ?').get(name) as { id: number } | undefined;
    if (row) return row.id;
    return db.prepare('INSERT INTO players (name, nationality) VALUES (?, ?)').run(name, nat).lastInsertRowid as number;
  }

  const ipv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
  const ise = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');

  const squad: [string, string, number, string][] = [
    // Goalkeepers
    ['Bart Verbruggen',      'Netherlands',   81, '["GK"]'],
    ['Jason Steele',         'England',       74, '["GK"]'],
    // Defenders
    ['Joel Veltman',         'Netherlands',   76, '["RB","CB"]'],
    ['Tariq Lamptey',        'Ghana',         78, '["RB"]'],
    ['Lewis Dunk',           'England',       83, '["CB"]'],
    ['Jan Paul van Hecke',   'Netherlands',   81, '["CB"]'],
    ['Adam Webster',         'England',       75, '["CB"]'],
    ['Pervis Estupiñán',     'Ecuador',       81, '["LB","LWB"]'],
    ['Igor',                 'Brazil',        78, '["LB"]'],
    ['James Milner',         'England',       74, '["CM","CDM"]'],
    ['Jack Hinshelwood',     'England',       75, '["CM","RB"]'],
    // Midfielders
    ['Carlos Baleba',        'Cameroon',      80, '["CDM","CM"]'],
    ['Mats Wieffer',         'Netherlands',   80, '["CDM","CM"]'],
    ['Billy Gilmour',        'Scotland',      77, '["CDM","CM"]'],
    ['Matt O\'Riley',        'Denmark',       81, '["CM","CAM"]'],
    ['Yasin Ayari',          'Sweden',        74, '["CM"]'],
    // Forwards
    ['Kaoru Mitoma',         'Japan',         84, '["LW","LM"]'],
    ['Simon Adingra',        'Ivory Coast',   80, '["RW","LW"]'],
    ['Georginio Rutter',     'France',        80, '["CAM","ST","LW"]'],
    ['Solly March',          'England',       76, '["RW","LM"]'],
    ['Yankuba Minteh',       'Gambia',        79, '["RW","LW"]'],
    ['Julio Enciso',         'Paraguay',      75, '["CAM","RW"]'],
    ['João Pedro',           'Brazil',        82, '["ST","CF"]'],
    ['Evan Ferguson',        'Ireland',       80, '["ST"]'],
  ];

  db.transaction(() => {
    for (const [name, nat, rating, pos] of squad) {
      const pid = findOrCreatePlayer(name, nat);
      ise.run(club.id, season.id, ipv.run(pid, '2024/25', rating, pos, '[]').lastInsertRowid as number);
    }

    // Hürzeler's most-used XI: 4-2-3-1
    // Slots: 0=ST, 1=LM, 2=CAM, 3=RM, 4=CDM, 5=CDM, 6=LB, 7=CB, 8=CB, 9=RB, 10=GK
    const existingLineup = db.prepare('SELECT id FROM team_lineups WHERE club_id = ? AND season_id = ?').get(club.id, season.id) as { id: number } | undefined;
    if (!existingLineup) {
      const lineupId = db.prepare('INSERT INTO team_lineups (club_id, season_id, formation) VALUES (?, ?, ?)').run(club.id, season.id, '4-2-3-1').lastInsertRowid as number;
      const allPlayers = db.prepare(`
        SELECT p.name, pv.player_id
        FROM squad_entries se
        JOIN player_versions pv ON pv.id = se.player_version_id
        JOIN players p ON p.id = pv.player_id
        WHERE se.club_id = ? AND se.season_id = ?
      `).all(club.id, season.id) as { name: string; player_id: number }[];
      const nameMap = new Map(allPlayers.map(e => [e.name, e.player_id]));
      const xi = [
        'João Pedro',          // 0: ST
        'Kaoru Mitoma',        // 1: LM
        'Matt O\'Riley',       // 2: CAM
        'Simon Adingra',       // 3: RM
        'Carlos Baleba',       // 4: CDM
        'Mats Wieffer',        // 5: CDM
        'Igor',                // 6: LB
        'Lewis Dunk',          // 7: CB
        'Jan Paul van Hecke',  // 8: CB
        'Joel Veltman',        // 9: RB
        'Bart Verbruggen',     // 10: GK
      ];
      const ils = db.prepare('INSERT INTO lineup_slots (lineup_id, slot_index, player_id) VALUES (?, ?, ?)');
      xi.forEach((name, i) => {
        const playerId = nameMap.get(name);
        if (playerId != null) ils.run(lineupId, i, playerId);
      });
    }
  })();
}

function seedWestHam2425IfNeeded(db: Database.Database): void {
  const season = db.prepare('SELECT id FROM seasons WHERE year_start = 2024').get() as { id: number } | undefined;
  if (!season) return;
  const club = db.prepare("SELECT id FROM clubs WHERE name = 'West Ham United'").get() as { id: number } | undefined;
  if (!club) return;
  const { c } = db.prepare(
    'SELECT COUNT(*) as c FROM squad_entries se JOIN player_versions pv ON pv.id = se.player_version_id WHERE se.club_id = ? AND se.season_id = ?'
  ).get(club.id, season.id) as { c: number };
  if (c > 0) return;

  function findOrCreatePlayer(name: string, nat: string): number {
    const row = db.prepare('SELECT id FROM players WHERE name = ?').get(name) as { id: number } | undefined;
    if (row) return row.id;
    return db.prepare('INSERT INTO players (name, nationality) VALUES (?, ?)').run(name, nat).lastInsertRowid as number;
  }

  const ipv = db.prepare('INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)');
  const ise = db.prepare('INSERT OR IGNORE INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)');

  const squad: [string, string, number, string][] = [
    // Goalkeepers
    ['Alphonse Areola',       'France',        78, '["GK"]'],
    ['Lukasz Fabiański',      'Poland',        73, '["GK"]'],
    // Defenders
    ['Aaron Wan-Bissaka',     'England',       79, '["RB","LB"]'],
    ['Vladimir Coufal',       'Czech Republic',75, '["RB"]'],
    ['Max Kilman',            'England',       81, '["CB"]'],
    ['Kurt Zouma',            'France',        79, '["CB"]'],
    ['Konstantinos Mavropanos','Greece',        78, '["CB"]'],
    ['Nayef Aguerd',          'Morocco',       78, '["CB"]'],
    ['Emerson Palmieri',      'Italy',         77, '["LB","LWB"]'],
    // Midfielders
    ['Edson Álvarez',         'Mexico',        81, '["CDM","CM"]'],
    ['Tomáš Souček',          'Czech Republic',79, '["CM","CDM"]'],
    ['James Ward-Prowse',     'England',       80, '["CM","CAM"]'],
    ['Lucas Paquetá',         'Brazil',        83, '["CM","CAM"]'],
    ['Carlos Soler',          'Spain',         77, '["CM","CAM"]'],
    ['Guido Rodríguez',       'Argentina',     77, '["CDM","CM"]'],
    // Forwards
    ['Jarrod Bowen',          'England',       83, '["RW","RM","ST"]'],
    ['Mohammed Kudus',        'Ghana',         83, '["RW","CAM","LW"]'],
    ['Crysencio Summerville', 'Netherlands',   81, '["LW","LM","RW"]'],
    ['Luis Guilherme',        'Brazil',        76, '["LW","LM","RW"]'],
    ['Niclas Füllkrug',       'Germany',       81, '["ST"]'],
    ['Michail Antonio',       'Jamaica',       74, '["ST","LW"]'],
    ['Danny Ings',            'England',       74, '["ST"]'],
  ];

  db.transaction(() => {
    for (const [name, nat, rating, pos] of squad) {
      const pid = findOrCreatePlayer(name, nat);
      ise.run(club.id, season.id, ipv.run(pid, '2024/25', rating, pos, '[]').lastInsertRowid as number);
    }

    // Lopetegui/Potter 4-2-3-1
    // Slots: 0=ST, 1=LM, 2=CAM, 3=RM, 4=CDM, 5=CDM, 6=LB, 7=CB, 8=CB, 9=RB, 10=GK
    const existingLineup = db.prepare('SELECT id FROM team_lineups WHERE club_id = ? AND season_id = ?').get(club.id, season.id) as { id: number } | undefined;
    if (!existingLineup) {
      const lineupId = db.prepare('INSERT INTO team_lineups (club_id, season_id, formation) VALUES (?, ?, ?)').run(club.id, season.id, '4-2-3-1').lastInsertRowid as number;
      const allPlayers = db.prepare(`
        SELECT p.name, pv.player_id
        FROM squad_entries se
        JOIN player_versions pv ON pv.id = se.player_version_id
        JOIN players p ON p.id = pv.player_id
        WHERE se.club_id = ? AND se.season_id = ?
      `).all(club.id, season.id) as { name: string; player_id: number }[];
      const nameMap = new Map(allPlayers.map(e => [e.name, e.player_id]));
      const xi = [
        'Niclas Füllkrug',        // 0: ST
        'Crysencio Summerville',  // 1: LM
        'Lucas Paquetá',          // 2: CAM
        'Jarrod Bowen',           // 3: RM
        'Edson Álvarez',          // 4: CDM
        'Tomáš Souček',           // 5: CDM
        'Emerson Palmieri',       // 6: LB
        'Max Kilman',             // 7: CB
        'Konstantinos Mavropanos',// 8: CB
        'Aaron Wan-Bissaka',      // 9: RB
        'Alphonse Areola',        // 10: GK
      ];
      const ils = db.prepare('INSERT INTO lineup_slots (lineup_id, slot_index, player_id) VALUES (?, ?, ?)');
      xi.forEach((name, i) => {
        const playerId = nameMap.get(name);
        if (playerId != null) ils.run(lineupId, i, playerId);
      });
    }
  })();
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Club {
  id: number;
  name: string;
  short_name: string | null;
  color: string;
}

export interface Season {
  id: number;
  label: string;
  year_start: number;
}

export interface Player {
  id: number;
  name: string;
  nationality: string | null;
  base_rating: number;
  base_positions: string; // JSON array string
}

export interface PlayerVersion {
  id: number;
  player_id: number;
  label: string;
  rating: number;
  positions: string;
  roles: string;
}

export interface SquadEntry {
  id: number;
  club_id: number;
  season_id: number;
  player_version_id: number;
}

export interface SquadEntryFull {
  id: number;
  club_id: number;
  season_id: number;
  player_version_id: number;
  player_id: number;
  rating: number;
  positions: string;
  roles: string;
  version_label: string;
  player_name: string;
  nationality: string | null;
  club_name: string;
  season_label: string;
}

// ── Role config ───────────────────────────────────────────────────────────────

export interface RoleRow {
  name: string;
  label: string;
  goal_mult: number;
  assist_mult: number;
  valid_positions: string; // JSON array string e.g. '["LW","RW"]', empty = unrestricted
  description: string;
  att_contrib: number;
  mid_contrib: number;
  def_contrib: number;
}

export function loadRoleRows(db: Database.Database): RoleRow[] {
  return db.prepare('SELECT * FROM role_config ORDER BY name').all() as RoleRow[];
}

const ROLE_DEFAULTS: (Omit<RoleRow, 'valid_positions'> & { valid_positions: string[] })[] = [
  // name, label, goal_mult, assist_mult, valid_positions, description, att_contrib, mid_contrib, def_contrib
  { name: 'AerialThreat',        label: 'Aerial Threat',         goal_mult: 3.50, assist_mult: 0.30, valid_positions: [],                                                              description: 'Dominant in the air; major threat at set pieces from any position', att_contrib:  0, mid_contrib:  0, def_contrib:  0 },
  { name: 'Anchor',              label: 'Anchor',                goal_mult: 0.20, assist_mult: 0.40, valid_positions: ['CDM'],                                                          description: 'Pure defensive shield; almost never scores',                         att_contrib:  0, mid_contrib:  0, def_contrib:  3 },
  { name: 'AttackingFullback',   label: 'Attacking Fullback',    goal_mult: 1.00, assist_mult: 1.80, valid_positions: ['LB','RB','LWB','RWB'],                                          description: 'Bombs forward to provide width and crosses',                         att_contrib:  2, mid_contrib:  0, def_contrib: -2 },
  { name: 'BallPlayingDefender', label: 'Ball Playing Defender', goal_mult: 0.50, assist_mult: 1.50, valid_positions: ['CB'],                                                            description: 'Plays out from the back; contributes to build-up play',             att_contrib:  0, mid_contrib:  2, def_contrib:  0 },
  { name: 'BoxToBox',            label: 'Box to Box',            goal_mult: 1.30, assist_mult: 1.20, valid_positions: ['CM'],                                                            description: 'Balanced midfielder contributing at both ends',                      att_contrib:  1, mid_contrib:  0, def_contrib:  1 },
  { name: 'ChanceCreator',       label: 'Chance Creator',        goal_mult: 0.50, assist_mult: 2.00, valid_positions: ['CAM','CM','LM','RM'],                                            description: 'Natural playmaker who creates chances for others',                   att_contrib:  2, mid_contrib:  0, def_contrib:  0 },
  { name: 'CompleteForward',     label: 'Complete Forward',      goal_mult: 1.30, assist_mult: 1.50, valid_positions: ['ST','CF'],                                                       description: 'All-round striker contributing to goals and assists',                att_contrib:  0, mid_contrib:  0, def_contrib:  0 },
  { name: 'CrossingSpecialist',  label: 'Crossing Specialist',   goal_mult: 0.10, assist_mult: 2.80, valid_positions: ['LB','RB','LWB','RWB','LM','RM','LW','RW'],                      description: 'Elite delivery from wide; rarely attempts shots',                    att_contrib:  0, mid_contrib:  0, def_contrib:  0 },
  { name: 'DeepLyingForward',    label: 'Deep Lying Forward',    goal_mult: 1.00, assist_mult: 1.80, valid_positions: ['ST','CF'],                                                       description: 'Drops deep to link play and create; finishes when presented',        att_contrib:  0, mid_contrib:  1, def_contrib:  0 },
  { name: 'DeepLyingPlaymaker',  label: 'Deep Lying Playmaker',  goal_mult: 0.40, assist_mult: 1.80, valid_positions: ['CDM','CM'],                                                      description: 'Dictates tempo from deep; rarely gets forward',                      att_contrib:  0, mid_contrib:  1, def_contrib:  0 },
  { name: 'Enforcer',            label: 'Enforcer',              goal_mult: 0.15, assist_mult: 0.50, valid_positions: ['CM','CDM'],                                                      description: 'Win it, keep it simple; physical midfield presence',                 att_contrib:  0, mid_contrib:  1, def_contrib:  2 },
  { name: 'FalseNine',           label: 'False Nine',            goal_mult: 1.10, assist_mult: 1.80, valid_positions: ['ST','CF'],                                                       description: 'Drops into midfield to link play; still a scoring threat',           att_contrib:  1, mid_contrib:  1, def_contrib:  0 },
  { name: 'InsideForward',       label: 'Inside Forward',        goal_mult: 1.80, assist_mult: 0.60, valid_positions: ['LW','RW','LM','RM'],                                             description: 'Cuts inside from wide to shoot; sacrifices crossing for goals',      att_contrib:  1, mid_contrib:  0, def_contrib:  0 },
  { name: 'InvertedWingback',    label: 'Inverted Wingback',     goal_mult: 1.10, assist_mult: 1.30, valid_positions: ['LB','RB','LWB','RWB'],                                           description: 'Cuts inside into dangerous half-spaces; box threat from fullback',   att_contrib:  1, mid_contrib:  1, def_contrib: -1 },
  { name: 'LateRunner',          label: 'Late Runner',           goal_mult: 1.80, assist_mult: 0.70, valid_positions: ['CM','CDM','CAM'],                                                description: 'Times runs into the box perfectly; Lampard/Gerrard archetype',       att_contrib:  1, mid_contrib:  0, def_contrib:  0 },
  { name: 'Mezzala',             label: 'Mezzala',               goal_mult: 1.50, assist_mult: 1.30, valid_positions: ['CM','LM','RM','CAM'],                                            description: 'Half-space runner who breaks into the box from midfield',            att_contrib:  1, mid_contrib:  1, def_contrib:  0 },
  { name: 'Poacher',             label: 'Poacher',               goal_mult: 2.20, assist_mult: 0.40, valid_positions: ['ST','CF'],                                                       description: 'Lives in the box for the tap-in; pure goal threat',                  att_contrib:  0, mid_contrib:  0, def_contrib:  0 },
  { name: 'Regista',             label: 'Regista',               goal_mult: 0.20, assist_mult: 2.20, valid_positions: ['CDM','CM'],                                                      description: 'Orchestrates from deep; elite passer, minimal open-play goal threat', att_contrib:  0, mid_contrib:  3, def_contrib: -2 },
  { name: 'SetPieceDeliverer',   label: 'Set Piece Deliverer',   goal_mult: 0.30, assist_mult: 2.50, valid_positions: ['LM','RM','LW','RW','LB','RB','LWB','RWB','CM','CAM'],           description: 'Corner and free kick specialist; rarely scores directly',            att_contrib:  0, mid_contrib:  0, def_contrib:  0 },
  { name: 'TargetMan',           label: 'Target Man',            goal_mult: 1.30, assist_mult: 0.90, valid_positions: ['ST','CF'],                                                       description: 'Physical presence up front; wins aerial duels and holds up play',    att_contrib:  0, mid_contrib:  0, def_contrib:  0 },
  { name: 'Trequartista',        label: 'Trequartista',          goal_mult: 1.40, assist_mult: 1.30, valid_positions: ['CAM','CF'],                                                      description: 'Floats between the lines; creative and dangerous in pockets of space', att_contrib:  0, mid_contrib:  0, def_contrib:  0 },
  { name: 'Winger',              label: 'Winger',                goal_mult: 0.50, assist_mult: 1.80, valid_positions: ['LW','RW','LM','RM'],                                             description: 'Stays wide to deliver crosses; rarely attempts shots on goal',       att_contrib:  0, mid_contrib:  0, def_contrib:  0 },
];

function migrateRoleConfig(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_config (
      name TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      goal_mult REAL NOT NULL DEFAULT 1.0,
      assist_mult REAL NOT NULL DEFAULT 1.0,
      valid_positions TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      att_contrib REAL NOT NULL DEFAULT 0,
      mid_contrib REAL NOT NULL DEFAULT 0,
      def_contrib REAL NOT NULL DEFAULT 0
    );
  `);

  // Add columns that may be missing from databases created before this version.
  const cols = db.pragma('table_info(role_config)') as { name: string }[];
  const have = new Set(cols.map(c => c.name));
  const needsContribMigration = !have.has('att_contrib');
  if (!have.has('att_contrib')) db.exec('ALTER TABLE role_config ADD COLUMN att_contrib REAL NOT NULL DEFAULT 0');
  if (!have.has('mid_contrib')) db.exec('ALTER TABLE role_config ADD COLUMN mid_contrib REAL NOT NULL DEFAULT 0');
  if (!have.has('def_contrib')) db.exec('ALTER TABLE role_config ADD COLUMN def_contrib REAL NOT NULL DEFAULT 0');

  const { c } = db.prepare('SELECT COUNT(*) as c FROM role_config').get() as { c: number };
  if (c === 0) {
    // Fresh database — insert all defaults.
    const insert = db.prepare(
      'INSERT OR IGNORE INTO role_config (name, label, goal_mult, assist_mult, valid_positions, description, att_contrib, mid_contrib, def_contrib) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertAll = db.transaction(() => {
      for (const r of ROLE_DEFAULTS) {
        insert.run(r.name, r.label, r.goal_mult, r.assist_mult, JSON.stringify(r.valid_positions), r.description, r.att_contrib, r.mid_contrib, r.def_contrib);
      }
    });
    insertAll();
  } else if (needsContribMigration) {
    // Existing database — columns were just added as 0; seed the non-zero contrib values.
    const update = db.prepare('UPDATE role_config SET att_contrib=?, mid_contrib=?, def_contrib=? WHERE name=?');
    const updateAll = db.transaction(() => {
      for (const r of ROLE_DEFAULTS) {
        update.run(r.att_contrib, r.mid_contrib, r.def_contrib, r.name);
      }
    });
    updateAll();
  }
}
