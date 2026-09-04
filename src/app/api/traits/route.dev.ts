import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PLAYSTYLES, DEFAULT_COHESION } from '@/lib/matchEngine';

export const runtime = 'nodejs';

interface TraitRow {
  club_id: number;
  club_name: string;
  cohesion: number;
  playstyle: string;
  focus_left: number;
  focus_centre: number;
  focus_right: number;
  note: string;
  saved: number;
}

/**
 * Every club in a season, with its tactics — including the ones nobody has
 * set, which come back at the defaults. Returning the whole season at once is
 * deliberate: cohesion is a judgement about a side *relative to the rest of
 * its league*, so editing it one club at a time invites drift.
 */
export async function GET(req: Request) {
  const db = getDb();
  const seasonId = Number(new URL(req.url).searchParams.get('seasonId'));
  if (!seasonId) {
    return NextResponse.json({ error: 'seasonId required' }, { status: 400 });
  }

  const rows = db.prepare(`
    SELECT c.id AS club_id, c.name AS club_name,
           COALESCE(t.cohesion, ?)        AS cohesion,
           COALESCE(t.playstyle, 'balanced') AS playstyle,
           COALESCE(t.focus_left, 1)      AS focus_left,
           COALESCE(t.focus_centre, 1)    AS focus_centre,
           COALESCE(t.focus_right, 1)     AS focus_right,
           COALESCE(t.note, '')           AS note,
           CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS saved
    FROM clubs c
    JOIN (SELECT DISTINCT club_id FROM squad_entries WHERE season_id = ?) s ON s.club_id = c.id
    LEFT JOIN club_season_traits t ON t.club_id = c.id AND t.season_id = ?
    ORDER BY c.name
  `).all(DEFAULT_COHESION, seasonId, seasonId) as TraitRow[];

  return NextResponse.json({
    clubs: rows,
    styles: Object.values(PLAYSTYLES).map(s => ({ name: s.name, label: s.label })),
    defaultCohesion: DEFAULT_COHESION,
  });
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json() as {
    season_id: number;
    clubs: {
      club_id: number;
      cohesion: number;
      playstyle: string;
      focus_left: number;
      focus_centre: number;
      focus_right: number;
      note?: string;
    }[];
  };

  if (!body.season_id || !Array.isArray(body.clubs)) {
    return NextResponse.json({ error: 'season_id and clubs required' }, { status: 400 });
  }

  const valid = new Set(Object.keys(PLAYSTYLES));
  for (const c of body.clubs) {
    if (!valid.has(c.playstyle)) {
      return NextResponse.json({ error: `unknown playstyle "${c.playstyle}"` }, { status: 400 });
    }
    if (!Number.isFinite(c.cohesion) || c.cohesion < 0 || c.cohesion > 100) {
      return NextResponse.json({ error: 'cohesion must be 0-100' }, { status: 400 });
    }
    for (const f of [c.focus_left, c.focus_centre, c.focus_right]) {
      if (!Number.isFinite(f) || f < 0) {
        return NextResponse.json({ error: 'focus weights must be zero or more' }, { status: 400 });
      }
    }
    if (c.focus_left + c.focus_centre + c.focus_right <= 0) {
      return NextResponse.json({ error: 'a side must attack somewhere' }, { status: 400 });
    }
  }

  const upsert = db.prepare(`
    INSERT INTO club_season_traits
      (club_id, season_id, cohesion, playstyle, focus_left, focus_centre, focus_right, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(club_id, season_id) DO UPDATE SET
      cohesion = excluded.cohesion,
      playstyle = excluded.playstyle,
      focus_left = excluded.focus_left,
      focus_centre = excluded.focus_centre,
      focus_right = excluded.focus_right,
      note = excluded.note
  `);

  db.transaction(() => {
    for (const c of body.clubs) {
      upsert.run(c.club_id, body.season_id, Math.round(c.cohesion), c.playstyle,
        c.focus_left, c.focus_centre, c.focus_right, (c.note ?? '').trim());
    }
  })();

  return NextResponse.json({ saved: body.clubs.length });
}
