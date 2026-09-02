import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  const seasons = db.prepare('SELECT * FROM seasons ORDER BY year_start').all();
  return NextResponse.json(seasons);
}
