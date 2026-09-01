import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const clubId = searchParams.get('clubId');
  const seasonId = searchParams.get('seasonId');

  if (!clubId || !seasonId) {
    return NextResponse.json({ error: 'clubId and seasonId required' }, { status: 400 });
  }

  const lineup = db.prepare(
    'SELECT * FROM team_lineups WHERE club_id = ? AND season_id = ?'
  ).get(Number(clubId), Number(seasonId)) as { id: number; formation: string } | undefined;

  if (!lineup) {
    return NextResponse.json(null);
  }

  type SlotRow = { slot_index: number; player_id: number; player_name: string; rating: number; positions: string };
  const slots = db.prepare(`
    SELECT ls.slot_index, ls.player_id, p.name AS player_name, pv.rating, pv.positions
    FROM lineup_slots ls
    JOIN players p ON p.id = ls.player_id
    JOIN squad_entries se ON se.club_id = ? AND se.season_id = ?
    JOIN player_versions pv ON pv.id = se.player_version_id AND pv.player_id = ls.player_id
    WHERE ls.lineup_id = ?
    ORDER BY ls.slot_index
  `).all(Number(clubId), Number(seasonId), lineup.id) as SlotRow[];

  return NextResponse.json({ formation: lineup.formation, slots });
}

export async function POST(req: Request) {
  const db = getDb();
  const { club_id, season_id, formation, slots } = await req.json() as {
    club_id: number;
    season_id: number;
    formation: string;
    slots: { slot_index: number; player_id: number | null }[];
  };

  if (!club_id || !season_id || !formation) {
    return NextResponse.json({ error: 'club_id, season_id, formation required' }, { status: 400 });
  }

  db.prepare(`
    INSERT INTO team_lineups (club_id, season_id, formation)
    VALUES (?, ?, ?)
    ON CONFLICT(club_id, season_id) DO UPDATE SET formation = excluded.formation
  `).run(club_id, season_id, formation);

  const lineup = db.prepare(
    'SELECT id FROM team_lineups WHERE club_id = ? AND season_id = ?'
  ).get(club_id, season_id) as { id: number };

  db.prepare('DELETE FROM lineup_slots WHERE lineup_id = ?').run(lineup.id);

  const insertSlot = db.prepare(
    'INSERT OR IGNORE INTO lineup_slots (lineup_id, slot_index, player_id) VALUES (?, ?, ?)'
  );
  const validSlots = slots.filter(s => s.player_id != null);
  const insertAll = db.transaction(() => {
    for (const s of validSlots) {
      insertSlot.run(lineup.id, s.slot_index, s.player_id);
    }
  });
  insertAll();

  return NextResponse.json({ ok: true });
}
