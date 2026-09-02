import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  const clubs = db.prepare('SELECT * FROM clubs ORDER BY name').all();
  return NextResponse.json(clubs);
}

export async function POST(req: Request) {
  const db = getDb();
  const { name, short_name, color, league } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const { lastInsertRowid } = db
    .prepare('INSERT INTO clubs (name, short_name, color, league) VALUES (?, ?, ?, ?)')
    .run(name.trim(), short_name?.trim() || null, color || '#ffffff', league || 'PL');
  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(lastInsertRowid);
  return NextResponse.json(club, { status: 201 });
}
