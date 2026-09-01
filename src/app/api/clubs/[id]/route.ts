import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const { id } = await params;
  const { name, short_name, color } = await req.json();
  db.prepare('UPDATE clubs SET name=?, short_name=?, color=? WHERE id=?')
    .run(name, short_name || null, color || '#ffffff', id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const { id } = await params;
  db.prepare('DELETE FROM clubs WHERE id=?').run(id);
  return NextResponse.json({ ok: true });
}
