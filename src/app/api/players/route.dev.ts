import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get('q');
  const seasonId = searchParams.get('seasonId');

  // When a season is specified, join with squad_entries so we only return players
  // who have a version for that season, and include their season-specific rating/positions.
  if (seasonId) {
    const like = q ? `%${q}%` : '%';
    const rows = db.prepare(`
      SELECT p.*, se.id AS entry_id, pv.rating AS season_rating, pv.positions AS season_positions,
             se.club_id, c.name AS club_name
      FROM players p
      JOIN player_versions pv ON pv.player_id = p.id
      JOIN squad_entries se ON se.player_version_id = pv.id AND se.season_id = ?
      JOIN clubs c ON c.id = se.club_id
      WHERE p.name LIKE ?
      ORDER BY p.name, c.name
      LIMIT 100
    `).all(seasonId, like);
    return NextResponse.json(rows);
  }

  const players = q
    ? db.prepare('SELECT * FROM players WHERE name LIKE ? ORDER BY name LIMIT 100').all(`%${q}%`)
    : db.prepare('SELECT * FROM players ORDER BY name').all();
  return NextResponse.json(players);
}

export async function POST(req: Request) {
  const db = getDb();
  const { name, nationality, base_rating, base_positions, roles } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const { lastInsertRowid } = db
    .prepare('INSERT INTO players (name, nationality, base_rating, base_positions, roles) VALUES (?, ?, ?, ?, ?)')
    .run(
      name.trim(),
      nationality?.trim() || null,
      base_rating ?? 75,
      JSON.stringify(base_positions ?? []),
      JSON.stringify(roles ?? []),
    );
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(lastInsertRowid);
  return NextResponse.json(player, { status: 201 });
}
