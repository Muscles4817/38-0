import { NextResponse } from 'next/server';
import { getDb, loadRoleRows } from '@/lib/db';
import { simulateSeason, SquadPick, OpponentSquad, OpponentPlayer, PlayerRole, RoleConfig } from '@/lib/simulation';
import { Position } from '@/lib/formations';

export const runtime = 'nodejs';

function posToRole(positions: string[]): OpponentPlayer['role'] {
  const p = positions[0] ?? 'CM';
  if (p === 'GK') return 'gk';
  if (['LB','RB','CB','LWB','RWB'].includes(p)) return 'def';
  if (['CM','CDM','CAM','LM','RM'].includes(p)) return 'mid';
  return 'att';
}

function pickStartingXI(players: OpponentPlayer[]): OpponentPlayer[] {
  const gks      = players.filter(p => p.role === 'gk').sort((a, b) => b.rating - a.rating);
  const outfield = players.filter(p => p.role !== 'gk').sort((a, b) => b.rating - a.rating);
  return [...gks.slice(0, 1), ...outfield.slice(0, 10)];
}

export async function POST(req: Request) {
  const body: { picks: SquadPick[] } = await req.json();
  let picks = body.picks;
  if (!picks || picks.length !== 11) {
    return NextResponse.json({ error: 'Need exactly 11 picks' }, { status: 400 });
  }

  const db = getDb();

  // Enrich user picks with version-specific roles from player_versions
  const playerIds = picks.map(p => p.playerId);
  const placeholders = playerIds.map(() => '?').join(',');
  type EntryRoleRow = { player_id: number; club_id: number; season_id: number; roles: string };
  const entryRoleRows = db.prepare(
    `SELECT pv.player_id, se.club_id, se.season_id, pv.roles
     FROM squad_entries se
     JOIN player_versions pv ON pv.id = se.player_version_id
     WHERE pv.player_id IN (${placeholders})`
  ).all(...playerIds) as EntryRoleRow[];
  const entryRoleMap = new Map<string, PlayerRole[]>(
    entryRoleRows.map(r => [`${r.player_id}:${r.club_id}:${r.season_id}`, JSON.parse(r.roles ?? '[]') as PlayerRole[]])
  );
  picks = picks.map(p => ({
    ...p,
    roles: entryRoleMap.get(`${p.playerId}:${p.clubId}:${p.seasonId}`) ?? [],
  }));

  // ── Query 2025/26 PL squads from DB ───────────────────────────────────────
  const season = db
    .prepare('SELECT id FROM seasons WHERE year_start = 2025')
    .get() as { id: number } | undefined;

  let opponentSquads: OpponentSquad[] = [];

  if (season) {
    type Row = { club_id: number; club_name: string; player_name: string; rating: number; positions: string; roles: string };
    const rows = db.prepare(`
      SELECT c.id AS club_id, c.name AS club_name, p.name AS player_name, pv.rating, pv.positions, pv.roles
      FROM squad_entries se
      JOIN player_versions pv ON pv.id = se.player_version_id
      JOIN clubs c ON c.id = se.club_id
      JOIN players p ON p.id = pv.player_id
      WHERE se.season_id = ? AND c.league = 'PL'
      ORDER BY c.name, pv.rating DESC
    `).all(season.id) as Row[];

    // Group by club
    type ClubRow = { id: number; rows: Row[] };
    const byClub = new Map<string, ClubRow>();
    for (const row of rows) {
      if (!byClub.has(row.club_name)) byClub.set(row.club_name, { id: row.club_id, rows: [] });
      byClub.get(row.club_name)!.rows.push(row);
    }

    // Load stored lineups for this season
    type LineupRow = { club_id: number; formation: string };
    type SlotRow   = { club_id: number; slot_index: number; player_id: number; player_name: string; rating: number; positions: string; roles: string };
    const lineupRows = db.prepare(
      'SELECT club_id, formation FROM team_lineups WHERE season_id = ?'
    ).all(season.id) as LineupRow[];
    const lineupMap = new Map(lineupRows.map(l => [l.club_id, l.formation]));

    const slotRows = db.prepare(`
      SELECT tl.club_id, ls.slot_index, ls.player_id, p.name AS player_name, pv.rating, pv.positions, pv.roles
      FROM lineup_slots ls
      JOIN team_lineups tl ON tl.id = ls.lineup_id
      JOIN players p ON p.id = ls.player_id
      JOIN squad_entries se ON se.club_id = tl.club_id AND se.season_id = tl.season_id
      JOIN player_versions pv ON pv.id = se.player_version_id AND pv.player_id = ls.player_id
      WHERE tl.season_id = ?
      ORDER BY tl.club_id, ls.slot_index
    `).all(season.id) as SlotRow[];
    const slotsByClub = new Map<number, SlotRow[]>();
    for (const s of slotRows) {
      if (!slotsByClub.has(s.club_id)) slotsByClub.set(s.club_id, []);
      slotsByClub.get(s.club_id)!.push(s);
    }

    for (const [clubName, { id: clubId, rows: players }] of byClub) {
      let xi: OpponentPlayer[];

      const storedSlots = slotsByClub.get(clubId);
      if (storedSlots && storedSlots.length === 11 && lineupMap.has(clubId)) {
        xi = storedSlots.map((s, i) => {
          const positions = JSON.parse(s.positions) as Position[];
          return {
            id: String(i),
            name: s.player_name,
            role: posToRole(positions),
            position: positions[0] ?? 'CM',
            rating: s.rating,
            roles: JSON.parse(s.roles ?? '[]') as PlayerRole[],
          };
        });
      } else {
        const allPlayers: OpponentPlayer[] = players.map((r, i) => {
          const positions = JSON.parse(r.positions) as Position[];
          return {
            id: String(i),
            name: r.player_name,
            role: posToRole(positions),
            position: positions[0] ?? 'CM',
            rating: r.rating,
            roles: JSON.parse(r.roles ?? '[]') as PlayerRole[],
          };
        });
        xi = pickStartingXI(allPlayers);
      }

      const strength = Math.round(xi.reduce((s, p) => s + p.rating, 0) / xi.length);
      opponentSquads.push({ clubName, players: xi, strength });
    }
  }

  const roleRows = loadRoleRows(db);
  const roleConfig: RoleConfig = {
    goalMult:   Object.fromEntries(roleRows.map(r => [r.name, r.goal_mult]))   as Record<PlayerRole, number>,
    assistMult: Object.fromEntries(roleRows.map(r => [r.name, r.assist_mult])) as Record<PlayerRole, number>,
    validPositions: Object.fromEntries(
      roleRows
        .map(r => [r.name, JSON.parse(r.valid_positions) as Position[]] as const)
        .filter(([, v]) => v.length > 0)
    ) as Partial<Record<PlayerRole, Position[]>>,
    teamContrib: Object.fromEntries(
      roleRows
        .filter(r => r.att_contrib !== 0 || r.mid_contrib !== 0 || r.def_contrib !== 0)
        .map(r => [r.name, { att: r.att_contrib, mid: r.mid_contrib, def: r.def_contrib }])
    ) as Partial<Record<PlayerRole, { att: number; mid: number; def: number }>>,
  };

  const result = simulateSeason(picks, opponentSquads, undefined, roleConfig);
  return NextResponse.json(result);
}
