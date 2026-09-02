import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const { id } = await params;
  const { name, nationality, base_rating, base_positions, roles } = await req.json();
  db.prepare('UPDATE players SET name=?, nationality=?, base_rating=?, base_positions=?, roles=? WHERE id=?')
    .run(name, nationality || null, base_rating ?? 75, JSON.stringify(base_positions ?? []), JSON.stringify(roles ?? []), id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const { id } = await params;
  db.prepare('DELETE FROM players WHERE id=?').run(id);
  return NextResponse.json({ ok: true });
}
