import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export type ClassicTeam = {
  clubId: number;
  clubName: string;
  shortName: string;
  color: string;
  league: string;
  seasonId: number;
  seasonLabel: string;
  yearStart: number;
  playerCount: number;
  overallRating: number;
};

export async function GET() {
  const db = getDb();

  type Row = {
    club_id: number;
    club_name: string;
    short_name: string;
    color: string;
    league: string;
    season_id: number;
    season_label: string;
    year_start: number;
    player_count: number;
  };

  const rows = db.prepare(`
    SELECT
      c.id        AS club_id,
      c.name      AS club_name,
      c.short_name,
      c.color,
      c.league,
      s.id        AS season_id,
      s.label     AS season_label,
      s.year_start,
      COUNT(se.id) AS player_count
    FROM squad_entries se
    JOIN player_versions pv ON pv.id = se.player_version_id
    JOIN clubs c   ON c.id = se.club_id
    JOIN seasons s ON s.id = se.season_id
    WHERE NOT (c.league = 'PL' AND s.year_start = 2025)
      AND pv.rating > 0
    GROUP BY c.id, s.id
    HAVING player_count >= 11
    ORDER BY s.year_start DESC, c.name ASC
  `).all() as Row[];

  // Compute best-XI average rating for each club-season
  type EntryRow = { rating: number; positions: string };
  const result: ClassicTeam[] = rows.map(row => {
    const entries = db.prepare(`
      SELECT pv.rating, pv.positions
      FROM squad_entries se
      JOIN player_versions pv ON pv.id = se.player_version_id
      WHERE se.club_id = ? AND se.season_id = ?
      ORDER BY pv.rating DESC
    `).all(row.club_id, row.season_id) as EntryRow[];

    const gk = entries.find(e => (JSON.parse(e.positions) as string[])[0] === 'GK');
    const outfield = entries.filter(e => (JSON.parse(e.positions) as string[])[0] !== 'GK');
    const xi = [...(gk ? [gk] : []), ...outfield.slice(0, 10)];
    const overall = xi.length > 0
      ? Math.round(xi.reduce((s, p) => s + p.rating, 0) / xi.length)
      : 0;

    return {
      clubId: row.club_id,
      clubName: row.club_name,
      shortName: row.short_name,
      color: row.color,
      league: row.league,
      seasonId: row.season_id,
      seasonLabel: row.season_label,
      yearStart: row.year_start,
      playerCount: row.player_count,
      overallRating: overall,
    };
  });

  return NextResponse.json(result);
}
