import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const { id } = await params;
  const { label, rating, positions, roles } = await req.json();
  db.prepare('UPDATE player_versions SET label=?, rating=?, positions=?, roles=? WHERE id=?')
    .run(label, rating, JSON.stringify(positions), JSON.stringify(roles ?? []), id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const { id } = await params;
  db.prepare('DELETE FROM player_versions WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
