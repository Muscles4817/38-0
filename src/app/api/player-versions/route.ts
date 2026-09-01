import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get('playerId');
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  const rows = db.prepare(
    'SELECT * FROM player_versions WHERE player_id = ? ORDER BY label'
  ).all(playerId);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const db = getDb();
  const { player_id, label, rating, positions, roles } = await req.json();
  try {
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO player_versions (player_id, label, rating, positions, roles) VALUES (?, ?, ?, ?, ?)'
    ).run(player_id, label ?? '', rating ?? 75, JSON.stringify(positions ?? []), JSON.stringify(roles ?? []));
    const row = db.prepare('SELECT * FROM player_versions WHERE id = ?').get(lastInsertRowid);
    return NextResponse.json(row, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
