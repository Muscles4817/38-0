'use client';

import { useState, useEffect, useMemo } from 'react';
import { FORMATIONS, getFormation } from '@/lib/formations';

interface Club        { id: number; name: string; short_name: string; color: string; }
interface Season      { id: number; label: string; year_start: number; }
interface SquadPlayer { id: number; player_id: number; player_name: string; rating: number; positions: string; }
interface SavedSlot   { slot_index: number; player_id: number; player_name: string; rating: number; positions: string; }

// Stable empty arrays, so deriving "nothing selected" does not produce a new
// reference on every render.
const NO_CLUBS: Club[] = [];
const NO_SQUAD: SquadPlayer[] = [];

const emptySlots = (): (number | null)[] => Array(11).fill(null);

export default function LineupsEditorPage() {
  const [allClubs,    setAllClubs]    = useState<Club[]>([]);
  const [allSeasons,  setAllSeasons]  = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [selectedClubId,   setSelectedClubId]   = useState<number | null>(null);
  const [formation,   setFormation]   = useState('4-3-3');
  const [slots,       setSlots]       = useState<(number | null)[]>(emptySlots);

  // Fetched data is stored with the selection it belongs to, so the derived
  // values below fall back to empty rather than briefly showing a previous
  // club's squad while a new request is in flight.
  const [seasonClubIds, setSeasonClubIds] = useState<{ seasonId: number; ids: Set<number> } | null>(null);
  const [loadedSquad,   setLoadedSquad]   = useState<{ clubId: number; seasonId: number; players: SquadPlayer[] } | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState<'idle' | 'saved' | 'error'>('idle');

  // Load clubs + seasons on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/clubs').then(r => r.json()),
      fetch('/api/seasons').then(r => r.json()),
    ]).then(([c, s]: [Club[], Season[]]) => {
      setAllClubs(c);
      // Show seasons newest-first; only seasons that have squad entries (checked lazily on season change)
      setAllSeasons([...s].sort((a, b) => b.year_start - a.year_start));
      // Default to 2025/26
      const s2526 = s.find(x => x.year_start === 2025);
      if (s2526) setSelectedSeasonId(s2526.id);
    });
  }, []);

  // When season changes, find which clubs have a squad for it
  useEffect(() => {
    if (!selectedSeasonId) return;
    const seasonId = selectedSeasonId;
    fetch(`/api/squads?seasonId=${seasonId}`)
      .then(r => r.json())
      .then((entries: { club_id: number }[]) =>
        setSeasonClubIds({ seasonId, ids: new Set(entries.map(e => e.club_id)) }));
  }, [selectedSeasonId]);

  // Only clubs with a squad in the selected season can be given a lineup.
  const clubs = useMemo(
    () => (seasonClubIds?.seasonId === selectedSeasonId
      ? allClubs.filter(c => seasonClubIds.ids.has(c.id))
      : NO_CLUBS),
    [allClubs, seasonClubIds, selectedSeasonId],
  );

  // When club changes, load squad + saved lineup
  useEffect(() => {
    if (!selectedClubId || !selectedSeasonId) return;
    const clubId = selectedClubId;
    const seasonId = selectedSeasonId;
    Promise.all([
      fetch(`/api/squads?clubId=${clubId}&seasonId=${seasonId}`).then(r => r.json()),
      fetch(`/api/lineups?clubId=${clubId}&seasonId=${seasonId}`).then(r => r.json()),
    ]).then(([squadData, lineupData]: [SquadPlayer[], { formation: string; slots: SavedSlot[] } | null]) => {
      setLoadedSquad({ clubId, seasonId, players: squadData });
      if (lineupData?.formation) {
        setFormation(lineupData.formation);
        const newSlots = emptySlots();
        for (const s of lineupData.slots) newSlots[s.slot_index] = s.player_id;
        setSlots(newSlots);
      } else {
        setSlots(emptySlots());
      }
    });
  }, [selectedClubId, selectedSeasonId]);

  const squad = useMemo(
    () => (loadedSquad?.clubId === selectedClubId && loadedSquad?.seasonId === selectedSeasonId
      ? loadedSquad.players
      : NO_SQUAD),
    [loadedSquad, selectedClubId, selectedSeasonId],
  );

  // Changing season invalidates the club choice and anything built from it.
  function handleSeasonChange(seasonId: number | null) {
    setSelectedSeasonId(seasonId);
    setSelectedClubId(null);
    setSlots(emptySlots());
  }

  function handleFormationChange(f: string) {
    setFormation(f);
    setSlots(emptySlots());
  }

  function setSlotPlayer(slotIndex: number, playerId: number | null) {
    const newSlots = [...slots];
    if (playerId != null) {
      const existing = newSlots.indexOf(playerId);
      if (existing !== -1 && existing !== slotIndex) newSlots[existing] = null;
    }
    newSlots[slotIndex] = playerId;
    setSlots(newSlots);
  }

  async function save() {
    if (!selectedClubId || !selectedSeasonId) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch('/api/lineups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          club_id: selectedClubId,
          season_id: selectedSeasonId,
          formation,
          slots: slots.map((player_id, slot_index) => ({ slot_index, player_id })),
        }),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus('idle'), 2500);
    }
  }

  const fmt = getFormation(formation);
  const assignedIds = new Set(slots.filter((id): id is number => id != null));
  const filledCount  = assignedIds.size;
  const selectedClub = clubs.find(c => c.id === selectedClubId);
  const selectedSeason = allSeasons.find(s => s.id === selectedSeasonId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black">Team Lineups</h1>
        <p className="text-[#555] text-sm mt-1">
          Set the formation and starting XI for any club-season. Used during simulation and as the default for Classic Mode.
        </p>
      </div>

      {/* Season + Club + Formation row */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Season</Label>
          <select
            className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c896]"
            value={selectedSeasonId ?? ''}
            onChange={e => handleSeasonChange(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select a season…</option>
            {allSeasons.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Club</Label>
          <select
            className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c896]"
            value={selectedClubId ?? ''}
            onChange={e => {
              setSelectedClubId(e.target.value ? Number(e.target.value) : null);
              setSaveStatus('idle');
            }}
            disabled={!selectedSeasonId || clubs.length === 0}
          >
            <option value="">Select a club…</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Formation</Label>
          <select
            className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00c896]"
            value={formation}
            onChange={e => handleFormationChange(e.target.value)}
          >
            {Object.keys(FORMATIONS).map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      {/* Slot list */}
      {selectedClubId ? (
        <>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#555]">
              {selectedClub?.name} {selectedSeason?.label} — {filledCount}/11 assigned
            </span>
            {filledCount > 0 && (
              <span className="text-xs text-[#00c896]">
                Avg: {Math.round(
                  slots
                    .filter((id): id is number => id != null)
                    .map(id => squad.find(p => p.player_id === id)?.rating ?? 0)
                    .reduce((a, b) => a + b, 0) / filledCount
                )} OVR
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {fmt.slots.map((slot, i) => {
              const assignedId     = slots[i];
              const assignedPlayer = squad.find(p => p.player_id === assignedId);

              return (
                <div key={i} className="flex items-center gap-3 bg-[#0d0d0d] rounded-lg px-4 py-2.5 border border-[#1a1a1a]">
                  <div className="w-11 shrink-0">
                    <span className="text-[10px] font-black tracking-wider text-[#555] bg-[#1a1a1a] px-1.5 py-0.5 rounded">
                      {slot.position}
                    </span>
                  </div>
                  <div className="w-24 shrink-0 text-xs text-[#444]">{slot.label}</div>
                  <select
                    className="flex-1 bg-[#111] border border-[#222] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#00c896]"
                    value={assignedId ?? ''}
                    onChange={e => setSlotPlayer(i, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Unassigned —</option>
                    {squad
                      .slice()
                      .sort((a, b) => {
                        const aPos = (JSON.parse(a.positions) as string[]).includes(slot.position);
                        const bPos = (JSON.parse(b.positions) as string[]).includes(slot.position);
                        if (aPos && !bPos) return -1;
                        if (!aPos && bPos) return 1;
                        return b.rating - a.rating;
                      })
                      .map(p => {
                        const inOtherSlot = assignedIds.has(p.player_id) && p.player_id !== assignedId;
                        return (
                          <option key={p.player_id} value={p.player_id} disabled={inOtherSlot}>
                            {inOtherSlot ? '✓ ' : ''}{p.player_name} ({p.rating})
                          </option>
                        );
                      })}
                  </select>
                  <div className="w-10 shrink-0 text-right">
                    {assignedPlayer
                      ? <span className="text-sm font-bold text-[#00c896]">{assignedPlayer.rating}</span>
                      : <span className="text-sm text-[#333]">—</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 rounded-xl font-black bg-[#00c896] text-black hover:bg-[#00b385] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Error — try again' : 'Save Lineup'}
          </button>
        </>
      ) : (
        <div className="text-center text-[#444] text-sm py-12 border border-dashed border-[#1a1a1a] rounded-xl">
          Select a season and club above to configure their lineup.
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold tracking-widest text-[#555] uppercase mb-1">{children}</div>;
}
