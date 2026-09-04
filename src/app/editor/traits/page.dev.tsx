'use client';

import { useState, useEffect, useCallback } from 'react';

interface Season { id: number; label: string; year_start: number }
interface Style { name: string; label: string }
interface ClubTraits {
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
 * Cohesion needs describing, because it is the one number here that is not a
 * measure of how good a side is. Every band says what it means for results,
 * since that is what it actually controls.
 */
const BANDS: { min: number; label: string; hint: string; colour: string }[] = [
  { min: 90, label: 'Drilled',    hint: 'Performs at its level almost every week. Wenger, Guardiola.', colour: '#00c896' },
  { min: 78, label: 'Settled',    hint: 'A long-standing side that knows itself.',                     colour: '#4ec9a0' },
  { min: 66, label: 'Ordinary',   hint: 'Turns talent into results about as often as not.',            colour: '#c9b84e' },
  { min: 52, label: 'Unsettled',  hint: 'Wildly inconsistent — brilliant one week, disjointed the next.', colour: '#e08a4e' },
  { min: 0,  label: 'Shambolic',  hint: 'A collection of players. Results barely track quality.',       colour: '#e05a4e' },
];

const bandFor = (v: number) => BANDS.find(b => v >= b.min) ?? BANDS[BANDS.length - 1];

export default function TraitsEditorPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [clubs, setClubs] = useState<ClubTraits[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [defaultCohesion, setDefaultCohesion] = useState(72);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    fetch('/api/seasons')
      .then(r => r.json())
      .then((s: Season[]) => {
        const sorted = [...s].sort((a, b) => b.year_start - a.year_start);
        setSeasons(sorted);
        if (sorted.length > 0) setSeasonId(sorted[0].id);
      });
  }, []);

  const load = useCallback((id: number) => {
    fetch(`/api/traits?seasonId=${id}`)
      .then(r => r.json())
      .then((d: { clubs: ClubTraits[]; styles: Style[]; defaultCohesion: number }) => {
        setClubs(d.clubs);
        setStyles(d.styles);
        setDefaultCohesion(d.defaultCohesion);
        setDirty(false);
        setStatus('idle');
      });
  }, []);

  useEffect(() => {
    if (seasonId != null) load(seasonId);
  }, [seasonId, load]);

  function update(clubId: number, patch: Partial<ClubTraits>) {
    setClubs(prev => prev.map(c => (c.club_id === clubId ? { ...c, ...patch } : c)));
    setDirty(true);
    setStatus('idle');
  }

  async function save() {
    if (seasonId == null) return;
    setStatus('saving');
    const res = await fetch('/api/traits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season_id: seasonId, clubs }),
    });
    if (res.ok) {
      setStatus('saved');
      setDirty(false);
      load(seasonId);
    } else {
      setStatus('error');
    }
  }

  const unsaved = clubs.filter(c => !c.saved).length;

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24">
      <div>
        <h1 className="text-2xl font-black">Chemistry &amp; tactics</h1>
        <p className="text-[#555] text-sm mt-1">
          How well drilled each side is, and how it plays. Cohesion is not a rating —
          it does not make a team better on average, it decides how <em>reliably</em> its
          talent turns into results. An undrilled side of good players drops points it
          should not.
        </p>
        <p className="text-[#555] text-sm mt-2">
          Judge it from what is known about the side. Wimbledon were drilled and limited;
          plenty of talented sides were shambolic. Do not tune it to make a historical
          table come out right — that is the one use that would make the simulation lie.
        </p>
      </div>

      <div className="flex items-center gap-3 sticky top-0 bg-[#0a0a0a] py-3 z-10 border-b border-[#1a1a1a]">
        <select
          value={seasonId ?? ''}
          onChange={e => setSeasonId(Number(e.target.value))}
          className="bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm"
        >
          {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        <span className="text-xs text-[#555]">
          {clubs.length} clubs
          {unsaved > 0 && <> · <span className="text-[#c9b84e]">{unsaved} still on defaults</span></>}
        </span>

        <div className="flex-1" />

        {status === 'saved' && <span className="text-xs text-[#00c896]">Saved</span>}
        {status === 'error' && <span className="text-xs text-[#e05a4e]">Save failed</span>}
        <button
          onClick={save}
          disabled={!dirty || status === 'saving'}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-[#00c896] text-black disabled:bg-[#1a1a1a] disabled:text-[#555]"
        >
          {status === 'saving' ? 'Saving…' : 'Save season'}
        </button>
      </div>

      <div className="space-y-2">
        {clubs.map(c => {
          const band = bandFor(c.cohesion);
          const total = c.focus_left + c.focus_centre + c.focus_right || 1;
          const pct = (v: number) => Math.round((v / total) * 100);
          return (
            <div key={c.club_id} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-48 font-bold text-sm">
                  {c.club_name}
                  {!c.saved && <span className="ml-2 text-[10px] text-[#555]">default</span>}
                </div>

                <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                  <input
                    type="range" min={30} max={100} value={c.cohesion}
                    onChange={e => update(c.club_id, { cohesion: Number(e.target.value) })}
                    className="flex-1 accent-[#00c896]"
                    aria-label={`${c.club_name} cohesion`}
                  />
                  <div className="w-28 text-right">
                    <span className="font-black tabular-nums" style={{ color: band.colour }}>
                      {c.cohesion}
                    </span>
                    <span className="text-[10px] text-[#555] ml-2">{band.label}</span>
                  </div>
                </div>

                <select
                  value={c.playstyle}
                  onChange={e => update(c.club_id, { playstyle: e.target.value })}
                  className="bg-[#0a0a0a] border border-[#222] rounded-lg px-2 py-1.5 text-xs"
                  aria-label={`${c.club_name} playstyle`}
                >
                  {styles.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-4 mt-3 text-[11px] text-[#555]">
                <span className="w-48">{band.hint}</span>
                <span className="flex items-center gap-2">
                  attacks:
                  {(['left', 'centre', 'right'] as const).map(zone => {
                    const key = `focus_${zone}` as 'focus_left' | 'focus_centre' | 'focus_right';
                    return (
                      <label key={zone} className="flex items-center gap-1">
                        <span className="uppercase">{zone[0]}</span>
                        <input
                          type="number" min={0} max={5} step={0.5} value={c[key]}
                          onChange={e => update(c.club_id, { [key]: Number(e.target.value) } as Partial<ClubTraits>)}
                          className="w-14 bg-[#0a0a0a] border border-[#222] rounded px-1.5 py-1 text-right"
                          aria-label={`${c.club_name} focus ${zone}`}
                        />
                        <span className="w-8 text-[#333]">{pct(c[key])}%</span>
                      </label>
                    );
                  })}
                </span>
                <input
                  type="text" value={c.note} placeholder="why (optional)"
                  onChange={e => update(c.club_id, { note: e.target.value })}
                  className="flex-1 bg-[#0a0a0a] border border-[#222] rounded px-2 py-1"
                  aria-label={`${c.club_name} note`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {clubs.length === 0 && (
        <p className="text-[#555] text-sm">No squads imported for this season yet.</p>
      )}

      <p className="text-[11px] text-[#333]">
        Clubs with nothing set use a cohesion of {defaultCohesion}. Saving writes only the
        season shown. Run <span className="text-[#555]">Data: export the game snapshot</span> afterwards,
        or nothing reaches the game.
      </p>
    </div>
  );
}
