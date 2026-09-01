import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

const FULL_SELECT = `
  SELECT se.id, se.club_id, se.season_id, se.player_version_id,
         pv.player_id, pv.rating, pv.positions, pv.roles, pv.label AS version_label,
         p.name AS player_name, p.nationality,
         c.name AS club_name, s.label AS season_label
  FROM squad_entries se
  JOIN player_versions pv ON pv.id = se.player_version_id
  JOIN players p ON p.id = pv.player_id
  JOIN clubs c ON c.id = se.club_id
  JOIN seasons s ON s.id = se.season_id
`;

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const clubId = searchParams.get('clubId');
  const seasonId = searchParams.get('seasonId');

  // Return season IDs that have entries for a given club
  if (clubId && searchParams.get('distinct') === 'seasons') {
    const rows = db.prepare(
      'SELECT DISTINCT season_id FROM squad_entries WHERE club_id = ?'
    ).all(clubId) as { season_id: number }[];
    return NextResponse.json(rows.map(r => r.season_id));
  }

  const playerId = searchParams.get('playerId');
  if (playerId) {
    const rows = db.prepare(
      `${FULL_SELECT} WHERE pv.player_id = ? ORDER BY s.year_start, c.name`
    ).all(playerId);
    return NextResponse.json(rows);
  }

  if (!clubId || !seasonId) {
    const rows = db.prepare(
      `${FULL_SELECT} ORDER BY c.name, s.year_start, p.name`
    ).all();
    return NextResponse.json(rows);
  }

  const rows = db.prepare(
    `${FULL_SELECT} WHERE se.club_id = ? AND se.season_id = ? ORDER BY p.name`
  ).all(clubId, seasonId);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const db = getDb();
  const { club_id, season_id, player_id, rating, positions, roles, version_label } = await req.json();
  try {
    const existing = db.prepare(`
      SELECT se.id FROM squad_entries se
      JOIN player_versions pv ON pv.id = se.player_version_id
      WHERE se.club_id = ? AND se.season_id = ? AND pv.player_id = ?
    `).get(club_id, season_id, player_id);
    if (existing) return NextResponse.json({ error: 'Player already in this squad' }, { status: 409 });

    const seasonRow = db.prepare('SELECT label FROM seasons WHERE id = ?').get(season_id) as { label: string } | undefined;
    const label = version_label ?? seasonRow?.label ?? '';
    const pvId = db.prepare(
      'INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)'
    ).run(player_id, label, rating ?? 75, JSON.stringify(positions ?? []), JSON.stringify(roles ?? [])).lastInsertRowid;
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO squad_entries (club_id, season_id, player_version_id) VALUES (?, ?, ?)'
    ).run(club_id, season_id, pvId);
    const row = db.prepare(
      `${FULL_SELECT} WHERE se.id = ?`
    ).get(lastInsertRowid);
    return NextResponse.json(row, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
