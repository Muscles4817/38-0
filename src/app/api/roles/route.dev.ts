import { NextResponse } from 'next/server';
import { getDb, loadRoleRows } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  return NextResponse.json(loadRoleRows(db));
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json() as {
    name: string;
    label: string;
    goal_mult?: number;
    assist_mult?: number;
    valid_positions?: string[];
    description?: string;
    att_contrib?: number;
    mid_contrib?: number;
    def_contrib?: number;
  };
  const { name, label } = body;
  if (!name || !label) return NextResponse.json({ error: 'name and label required' }, { status: 400 });
  try {
    db.prepare(
      'INSERT INTO role_config (name, label, goal_mult, assist_mult, valid_positions, description, att_contrib, mid_contrib, def_contrib) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      name, label,
      body.goal_mult   ?? 1.0,
      body.assist_mult ?? 1.0,
      JSON.stringify(body.valid_positions ?? []),
      body.description ?? '',
      body.att_contrib ?? 0,
      body.mid_contrib ?? 0,
      body.def_contrib ?? 0,
    );
    const row = db.prepare('SELECT * FROM role_config WHERE name=?').get(name);
    return NextResponse.json(row, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const db = getDb();
  const body = await req.json() as {
    name: string;
    label: string;
    goal_mult: number;
    assist_mult: number;
    valid_positions: string[];
    description: string;
    att_contrib: number;
    mid_contrib: number;
    def_contrib: number;
  };
  const { name, label, goal_mult, assist_mult, valid_positions, description, att_contrib, mid_contrib, def_contrib } = body;
  db.prepare(
    'UPDATE role_config SET label=?, goal_mult=?, assist_mult=?, valid_positions=?, description=?, att_contrib=?, mid_contrib=?, def_contrib=? WHERE name=?'
  ).run(label, goal_mult, assist_mult, JSON.stringify(valid_positions ?? []), description ?? '', att_contrib ?? 0, mid_contrib ?? 0, def_contrib ?? 0, name);
  const row = db.prepare('SELECT * FROM role_config WHERE name=?').get(name);
  return NextResponse.json(row);
}
