'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATIONS, getFormation, canFillSlot, Formation } from '@/lib/formations';
import type { Position } from '@/lib/formations';
import PitchView from '@/components/PitchView';
import OptionCard from '@/components/OptionCard';
import type { SquadPick } from '@/lib/simulation';
import type { ClassicTeam } from '@/app/api/classic-teams/route';
import SiteNav from '@/components/SiteNav';

type RawEntry = {
  player_id: number;
  player_name: string;
  nationality: string | null;
  rating: number;
  positions: string;
  club_name: string;
  season_label: string;
  club_id: number;
  season_id: number;
};

type SavedSlot = {
  slot_index: number;
  player_id: number;
  player_name: string;
  rating: number;
  positions: string;
};

function autoPickXI(entries: RawEntry[], formation: Formation): SquadPick[] {
  const slots = formation.slots;
  const used = new Set<number>();
  const picks: SquadPick[] = [];

  const slotOrder = slots
    .map((slot, i) => ({
      i,
      eligible: entries.filter(e =>
        canFillSlot(JSON.parse(e.positions) as Position[], slot.position)
      ).length,
    }))
    .sort((a, b) => a.eligible - b.eligible)
    .map(x => x.i);

  const sorted = [...entries].sort((a, b) => b.rating - a.rating);

  for (const slotIdx of slotOrder) {
    const slot = slots[slotIdx];
    const player = sorted.find(
      e => !used.has(e.player_id) && canFillSlot(JSON.parse(e.positions) as Position[], slot.position)
    );
    if (!player) continue;
    used.add(player.player_id);
    picks.push({
      slotIndex: slotIdx,
      position: slot.position,
      playerId: player.player_id,
      playerName: player.player_name,
      nationality: player.nationality,
      rating: player.rating,
      clubName: player.club_name,
      seasonLabel: player.season_label,
      positions: JSON.parse(player.positions) as Position[],
      clubId: player.club_id,
      seasonId: player.season_id,
    });
  }
  return picks;
}

function entryToPick(e: RawEntry, slotIdx: number, slotPos: Position): SquadPick {
  return {
    slotIndex: slotIdx,
    position: slotPos,
    playerId: e.player_id,
    playerName: e.player_name,
    nationality: e.nationality,
    rating: e.rating,
    clubName: e.club_name,
    seasonLabel: e.season_label,
    positions: JSON.parse(e.positions) as Position[],
    clubId: e.club_id,
    seasonId: e.season_id,
  };
}

function ratingColor(r: number) {
  if (r >= 88) return '#fbbf24';
  if (r >= 83) return '#00c896';
  if (r >= 78) return '#60a5fa';
  return '#888';
}

export default function ClassicPage() {
  const router = useRouter();
  const [teams,        setTeams]        = useState<ClassicTeam[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [sortBy,       setSortBy]       = useState<'ovr' | 'year' | 'name'>('ovr');
  const [selected,     setSelected]     = useState<ClassicTeam | null>(null);
  const [formation,    setFormation]    = useState('4-4-2');
  const [entries,      setEntries]      = useState<RawEntry[]>([]);
  const [picks,        setPicks]        = useState<SquadPick[]>([]);
  const [loadingSquad, setLoadingSquad] = useState(false);
  const [editSlot,     setEditSlot]     = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/classic-teams')
      .then(r => r.json())
      .then((data: ClassicTeam[]) => { setTeams(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function selectTeam(team: ClassicTeam) {
    setSelected(team);
    setEditSlot(null);
    setLoadingSquad(true);
    try {
      const [squadRes, lineupRes] = await Promise.all([
        fetch(`/api/squads?clubId=${team.clubId}&seasonId=${team.seasonId}`),
        fetch(`/api/lineups?clubId=${team.clubId}&seasonId=${team.seasonId}`),
      ]);
      const squadData: RawEntry[] = await squadRes.json();
      const lineupData: { formation: string; slots: SavedSlot[] } | null = await lineupRes.json();

      setEntries(squadData);

      if (lineupData?.formation && lineupData.slots.length > 0) {
        // Use saved lineup
        const savedFormation = lineupData.formation;
        setFormation(savedFormation);
        const fmt = getFormation(savedFormation);
        const newPicks: SquadPick[] = lineupData.slots
          .filter(s => s.player_id != null)
          .map(s => {
            const entry = squadData.find(e => e.player_id === s.player_id);
            const slotPos = fmt.slots[s.slot_index]?.position ?? 'CM';
            if (entry) return entryToPick(entry, s.slot_index, slotPos);
            // Fallback: build from slot data (rating/positions may differ from squad entry)
            return {
              slotIndex: s.slot_index,
              position: slotPos,
              playerId: s.player_id,
              playerName: s.player_name,
              rating: s.rating,
              clubName: team.clubName,
              seasonLabel: team.seasonLabel,
              positions: JSON.parse(s.positions) as Position[],
              clubId: team.clubId,
              seasonId: team.seasonId,
            };
          });
        setPicks(newPicks);
      } else {
        // Auto-pick
        const fmt = getFormation(formation);
        setPicks(autoPickXI(squadData, fmt));
      }
    } finally {
      setLoadingSquad(false);
    }
  }

  function changeFormation(name: string) {
    setFormation(name);
    setEditSlot(null);
    if (entries.length > 0) {
      setPicks(autoPickXI(entries, getFormation(name)));
    }
  }

  function resetToAuto() {
    setEditSlot(null);
    setPicks(autoPickXI(entries, getFormation(formation)));
  }

  function handleSlotClick(slotIdx: number) {
    setEditSlot(prev => prev === slotIdx ? null : slotIdx);
  }

  function swapPlayerIntoSlot(entry: RawEntry) {
    if (editSlot == null) return;
    const fmt = getFormation(formation);
    const slotPos = fmt.slots[editSlot].position;

    setPicks(prev => {
      const next = prev.filter(p => p.slotIndex !== editSlot && p.playerId !== entry.player_id);
      next.push(entryToPick(entry, editSlot, slotPos));
      return next;
    });
    setEditSlot(null);
  }

  function removeFromSlot(slotIdx: number) {
    setPicks(prev => prev.filter(p => p.slotIndex !== slotIdx));
    setEditSlot(null);
  }

  function simulate() {
    if (picks.length < 11) return;
    const setup = {
      formation,
      difficulty: 'normal',
      showRatings: true,
      draftMode: 'classic',
      playerRating: 'career',
      yearStart: 1992,
      yearEnd: 2026,
    };
    localStorage.setItem('38-0-setup', JSON.stringify(setup));
    localStorage.setItem('38-0-squad', JSON.stringify(picks));
    localStorage.removeItem('38-0-seen-squads');
    router.push('/results');
  }

  const fmt = getFormation(formation);
  const assignedIds = new Set(picks.map(p => p.playerId));
  const overall = picks.length > 0
    ? Math.round(picks.reduce((s, p) => s + p.rating, 0) / picks.length)
    : 0;

  const sortedTeams = [...teams].sort((a, b) => {
    if (sortBy === 'ovr')  return b.overallRating - a.overallRating;
    if (sortBy === 'year') return b.yearStart - a.yearStart;
    return a.clubName.localeCompare(b.clubName) || b.yearStart - a.yearStart;
  });

  // For the swap panel: squad players sorted by position match then rating
  const editingSlotPos = editSlot != null ? fmt.slots[editSlot]?.position : null;
  const swapCandidates = editingSlotPos
    ? [...entries].sort((a, b) => {
        const aMatch = canFillSlot(JSON.parse(a.positions) as Position[], editingSlotPos);
        const bMatch = canFillSlot(JSON.parse(b.positions) as Position[], editingSlotPos);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return b.rating - a.rating;
      })
    : [];

  const currentInSlot = editSlot != null ? picks.find(p => p.slotIndex === editSlot) : null;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center py-12 px-4">
      <h1 className="text-6xl font-black mb-2 tracking-tight">
        <span className="text-white">38</span>
        <span className="text-[#00c896]">-0</span>
      </h1>
      <p className="text-[#888] text-sm mb-2">Classic Mode</p>
      <p className="text-[#555] text-xs mb-10">
        Pick a legendary side and see how they&apos;d do in the 2025/26 Premier League
      </p>

      <div className="w-full max-w-2xl space-y-8">

        {/* Team selection */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold tracking-widest text-[#555] uppercase">Choose a Classic Side</span>
            <div className="flex gap-1">
              {(['ovr', 'year', 'name'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setSortBy(opt)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    sortBy === opt ? 'bg-[#00c896] text-black' : 'text-[#444] hover:text-white'
                  }`}
                >
                  {opt === 'ovr' ? 'OVR' : opt === 'year' ? 'Year' : 'Name'}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <p className="text-[#555] text-sm text-center py-8">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {sortedTeams.map(team => {
                const isSelected = selected?.clubId === team.clubId && selected?.seasonId === team.seasonId;
                return (
                  <button
                    key={`${team.clubId}-${team.seasonId}`}
                    onClick={() => selectTeam(team)}
                    className="relative rounded-xl border text-left px-4 py-3 transition-all"
                    style={{
                      borderColor: isSelected ? team.color : '#1a1a1a',
                      background:  isSelected ? `${team.color}18` : '#0d0d0d',
                      boxShadow:   isSelected ? `0 0 0 1px ${team.color}44` : undefined,
                    }}
                  >
                    <div className="w-2 h-2 rounded-full mb-2" style={{ background: team.color }} />
                    <div className="font-bold text-sm text-white leading-tight">{team.clubName}</div>
                    <div className="text-[#888] text-xs mt-0.5">{team.seasonLabel}</div>
                    <div className="text-xs font-bold mt-1" style={{ color: ratingColor(team.overallRating) }}>
                      OVR {team.overallRating}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Configuration — visible once a team is selected */}
        {selected && (
          <>
            {/* Formation */}
            <section>
              <Label>Formation</Label>
              <div className="grid grid-cols-4 gap-2 mb-1">
                {Object.keys(FORMATIONS).map(f => (
                  <OptionCard key={f} label={f} selected={formation === f} onClick={() => changeFormation(f)} />
                ))}
              </div>
              <p className="text-[#555] text-[11px] text-center mt-1">{FORMATIONS[formation]?.description}</p>
            </section>

            {/* Pitch + player list */}
            <div className="flex flex-col sm:flex-row gap-6 items-start justify-center">
              <div className="flex justify-center flex-shrink-0">
                {loadingSquad ? (
                  <div className="rounded-xl bg-[#111] flex items-center justify-center" style={{ width: 300, height: 420 }}>
                    <span className="text-[#555] text-sm">Loading…</span>
                  </div>
                ) : (
                  <PitchView
                    formation={fmt}
                    picks={picks}
                    onSlotClick={handleSlotClick}
                    highlightSlot={editSlot ?? undefined}
                  />
                )}
              </div>

              {!loadingSquad && (
                <div className="flex-1 space-y-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-bold tracking-widest text-[#555] uppercase">
                      XI — {selected.clubName} {selected.seasonLabel}
                    </div>
                    <button
                      onClick={resetToAuto}
                      className="text-[10px] text-[#555] hover:text-[#00c896] transition-colors font-bold uppercase tracking-wider"
                    >
                      Auto-fill
                    </button>
                  </div>

                  {/* Slot list */}
                  {fmt.slots.map((slot, i) => {
                    const pick = picks.find(p => p.slotIndex === i);
                    const isEditing = editSlot === i;
                    return (
                      <button
                        key={i}
                        onClick={() => handleSlotClick(i)}
                        className="w-full flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg text-left transition-colors"
                        style={{
                          background: isEditing ? '#1a1a1a' : '#111',
                          outline: isEditing ? '1px solid #00c896' : undefined,
                        }}
                      >
                        <span className="text-[10px] font-bold w-10 shrink-0 text-left" style={{ color: '#555' }}>
                          {slot.position}
                        </span>
                        {pick ? (
                          <>
                            <span className="text-sm text-white truncate flex-1 text-left">{pick.playerName}</span>
                            <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: ratingColor(pick.rating) }}>
                              {pick.rating}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-[#333] flex-1 text-left italic">— empty —</span>
                        )}
                        <span className="text-[10px] text-[#444] shrink-0">{isEditing ? '▲' : '▼'}</span>
                      </button>
                    );
                  })}

                  {picks.length < 11 && (
                    <p className="text-amber-500 text-xs mt-2">
                      {picks.length}/11 slots filled — squad may not cover every position.
                    </p>
                  )}
                  <div className="text-[#555] text-xs mt-2 text-right">
                    OVR <span className="font-bold" style={{ color: ratingColor(overall) }}>{overall}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Swap panel */}
            {editSlot != null && (
              <div className="bg-[#111] rounded-xl border border-[#1a1a1a] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#888]">
                    Slot {editSlot + 1} — <span className="text-white">{editingSlotPos}</span>
                    {currentInSlot && (
                      <span className="text-[#555] ml-2">currently {currentInSlot.playerName}</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {currentInSlot && (
                      <button
                        onClick={() => removeFromSlot(editSlot)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    <button
                      onClick={() => setEditSlot(null)}
                      className="text-xs text-[#555] hover:text-white transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1">
                  {swapCandidates.map(e => {
                    const inOtherSlot = assignedIds.has(e.player_id) && e.player_id !== currentInSlot?.playerId;
                    const isCurrent   = e.player_id === currentInSlot?.playerId;
                    const posMatch    = canFillSlot(JSON.parse(e.positions) as Position[], editingSlotPos!);
                    return (
                      <button
                        key={e.player_id}
                        onClick={() => !inOtherSlot && swapPlayerIntoSlot(e)}
                        disabled={inOtherSlot}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors
                          ${isCurrent  ? 'bg-[#00c896]/10 cursor-default' : ''}
                          ${inOtherSlot ? 'opacity-30 cursor-not-allowed' : !isCurrent ? 'hover:bg-[#1a1a1a]' : ''}`}
                      >
                        <span className="flex-1 text-sm truncate">{e.player_name}</span>
                        {!posMatch && (
                          <span className="text-[9px] text-amber-500 shrink-0">out of pos</span>
                        )}
                        {inOtherSlot && (
                          <span className="text-[9px] text-[#555] shrink-0">in XI</span>
                        )}
                        {isCurrent && (
                          <span className="text-[9px] text-[#00c896] shrink-0">current</span>
                        )}
                        <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: ratingColor(e.rating) }}>
                          {e.rating}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={simulate}
              disabled={picks.length < 11}
              className="w-full py-4 rounded-xl font-black text-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#00c896', color: '#000' }}
            >
              Simulate Season →
            </button>
          </>
        )}

        <SiteNav />
      </div>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-widest text-[#555] uppercase mb-2">
      {children}
    </div>
  );
}
