import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const { id } = await params;
  const { rating, positions, roles } = await req.json();
  const se = db.prepare('SELECT player_version_id FROM squad_entries WHERE id = ?').get(id) as { player_version_id: number } | undefined;
  if (!se) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  db.prepare('UPDATE player_versions SET rating=?, positions=?, roles=? WHERE id=?')
    .run(rating, JSON.stringify(positions), JSON.stringify(roles ?? []), se.player_version_id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const { id } = await params;
  db.prepare('DELETE FROM squad_entries WHERE id=?').run(id);
  return NextResponse.json({ ok: true });
}
