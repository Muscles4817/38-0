import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  const season = db
    .prepare('SELECT id FROM seasons WHERE year_start = 2025')
    .get() as { id: number } | undefined;

  if (!season) return NextResponse.json([]);

  type Row = { club_name: string; rating: number; positions: string };
  const rows = db.prepare(`
    SELECT c.name AS club_name, pv.rating, pv.positions
    FROM squad_entries se
    JOIN player_versions pv ON pv.id = se.player_version_id
    JOIN clubs c ON c.id = se.club_id
    WHERE se.season_id = ?
    ORDER BY c.name, pv.rating DESC
  `).all(season.id) as Row[];

  // Group by club, pick best XI (1 GK + 10 outfield), compute avg OVR
  const byClub = new Map<string, Row[]>();
  for (const row of rows) {
    if (!byClub.has(row.club_name)) byClub.set(row.club_name, []);
    byClub.get(row.club_name)!.push(row);
  }

  const result: { clubName: string; overall: number }[] = [];
  for (const [clubName, players] of byClub) {
    const gks      = players.filter(p => (JSON.parse(p.positions) as string[])[0] === 'GK');
    const outfield = players.filter(p => (JSON.parse(p.positions) as string[])[0] !== 'GK');
    const xi = [...gks.slice(0, 1), ...outfield.slice(0, 10)];
    if (xi.length === 0) continue;
    const overall = Math.round(xi.reduce((s, p) => s + p.rating, 0) / xi.length);
    result.push({ clubName, overall });
  }

  return NextResponse.json(result.sort((a, b) => b.overall - a.overall));
}
