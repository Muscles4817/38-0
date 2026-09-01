import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const db = getDb();
  const { yearStart = 1992, yearEnd = 2026, excludeIds = [] } = await req.json();

  // Find all club-seasons that have players and fall within the era
  const rows = db.prepare(`
    SELECT DISTINCT c.id as club_id, c.name as club_name, c.color,
           s.id as season_id, s.label as season_label, s.year_start
    FROM squad_entries se
    JOIN clubs c ON c.id = se.club_id
    JOIN seasons s ON s.id = se.season_id
    WHERE s.year_start >= ? AND s.year_start < ?
    ORDER BY RANDOM()
    LIMIT 50
  `).all(yearStart, yearEnd) as {
    club_id: number; club_name: string; color: string;
    season_id: number; season_label: string; year_start: number;
  }[];

  const available = rows.filter(r =>
    !excludeIds.includes(`${r.club_id}-${r.season_id}`)
  );

  if (available.length === 0) {
    return NextResponse.json({ error: 'No club-seasons available in this era' }, { status: 404 });
  }

  const picked = available[Math.floor(Math.random() * available.length)];

  const players = db.prepare(`
    SELECT se.id as entry_id, pv.rating, pv.positions,
           pv.player_id, p.name as player_name, p.nationality
    FROM squad_entries se
    JOIN player_versions pv ON pv.id = se.player_version_id
    JOIN players p ON p.id = pv.player_id
    WHERE se.club_id = ? AND se.season_id = ?
    ORDER BY pv.rating DESC
  `).all(picked.club_id, picked.season_id);

  return NextResponse.json({
    clubId: picked.club_id,
    clubName: picked.club_name,
    color: picked.color,
    seasonId: picked.season_id,
    seasonLabel: picked.season_label,
    players,
  });
}
