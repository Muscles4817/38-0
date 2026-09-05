'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATIONS, getFormation, canFillSlot, Formation } from '@/lib/formations';
import type { Position } from '@/lib/formations';
import PitchView from '@/components/PitchView';
import OptionCard from '@/components/OptionCard';
import type { SquadPick } from '@/lib/simulation';
import { getClassicTeams, getSquad, getLineup, type ClassicTeam, type DataPlayer } from '@/lib/gameData';
import SiteNav from '@/components/SiteNav';
import BackLink from '@/components/BackLink';
import { writeStored, clearStored } from '@/lib/clientStorage';

// Stable empty array so an unselected team does not hand out a new reference.
const NO_PLAYERS: DataPlayer[] = [];

/**
 * Best legal XI for a formation, filling the scarcest slots first so a rare
 * position is not left empty by a greedy earlier pick.
 *
 * `existing` slots are kept as they are and only the gaps are filled, which is
 * how a stored lineup missing a player or two is topped up.
 */
function autoPickXI(
  players: DataPlayer[], formation: Formation, team: ClassicTeam, existing: SquadPick[] = [],
): SquadPick[] {
  const slots = formation.slots;
  const picks = [...existing];
  const used = new Set(existing.map(p => p.playerId));
  const filled = new Set(existing.map(p => p.slotIndex));

  const slotOrder = slots
    .map((slot, i) => ({
      i,
      eligible: players.filter(p => canFillSlot(p.positions, slot.position)).length,
    }))
    .filter(x => !filled.has(x.i))
    .sort((a, b) => a.eligible - b.eligible)
    .map(x => x.i);

  const sorted = [...players].sort((a, b) => b.rating - a.rating);

  for (const slotIdx of slotOrder) {
    const slot = slots[slotIdx];
    const player = sorted.find(p => !used.has(p.playerId) && canFillSlot(p.positions, slot.position));
    if (!player) continue;
    used.add(player.playerId);
    picks.push(playerToPick(player, slotIdx, slot.position, team));
  }
  return picks;
}

function playerToPick(
  player: DataPlayer, slotIdx: number, slotPos: Position, team: ClassicTeam,
): SquadPick {
  return {
    slotIndex: slotIdx,
    position: slotPos,
    playerId: player.playerId,
    playerName: player.name,
    nationality: player.nationality,
    rating: player.rating,
    clubName: team.clubName,
    seasonLabel: team.seasonLabel,
    positions: player.positions,
    clubId: team.clubId,
    seasonId: team.seasonId,
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
  const teams = useMemo(() => getClassicTeams(), []);
  const [sortBy,    setSortBy]    = useState<'ovr' | 'year' | 'name'>('ovr');
  const [search,    setSearch]    = useState('');
  const [iconsOnly, setIconsOnly] = useState(false);
  const [selected,  setSelected]  = useState<ClassicTeam | null>(null);
  const [formation, setFormation] = useState('4-4-2');
  const [picks,     setPicks]     = useState<SquadPick[]>([]);
  const [editSlot,  setEditSlot]  = useState<number | null>(null);
  // True while the side list is open. Starts open, since nothing is chosen yet.
  const [browsing,  setBrowsing]  = useState(true);

  // Every player available to the selected team.
  const entries = useMemo(
    () => (selected ? getSquad(selected.clubId, selected.seasonId)?.players ?? NO_PLAYERS : NO_PLAYERS),
    [selected],
  );

  function selectTeam(team: ClassicTeam) {
    setSelected(team);
    setBrowsing(false);
    setEditSlot(null);

    const players = getSquad(team.clubId, team.seasonId)?.players ?? NO_PLAYERS;
    const lineup = getLineup(team.clubId, team.seasonId);

    if (lineup && lineup.slots.length > 0) {
      // Use the lineup stored in the editor, topping up any slot it leaves
      // empty so the pitch is always a full XI.
      setFormation(lineup.formation);
      const fmt = getFormation(lineup.formation);
      const byId = new Map(players.map(p => [p.playerId, p]));
      const fromLineup = lineup.slots.flatMap(slot => {
        const player = byId.get(slot.playerId);
        const slotPos = fmt.slots[slot.slotIndex]?.position ?? 'CM';
        return player ? [playerToPick(player, slot.slotIndex, slotPos, team)] : [];
      });
      setPicks(autoPickXI(players, fmt, team, fromLineup));
    } else {
      setPicks(autoPickXI(players, getFormation(formation), team));
    }
  }

  function changeFormation(name: string) {
    setFormation(name);
    setEditSlot(null);
    if (selected && entries.length > 0) {
      setPicks(autoPickXI(entries, getFormation(name), selected));
    }
  }

  function resetToAuto() {
    setEditSlot(null);
    if (selected) setPicks(autoPickXI(entries, getFormation(formation), selected));
  }

  function handleSlotClick(slotIdx: number) {
    setEditSlot(prev => prev === slotIdx ? null : slotIdx);
  }

  function swapPlayerIntoSlot(entry: DataPlayer) {
    if (editSlot == null) return;
    const fmt = getFormation(formation);
    const slotPos = fmt.slots[editSlot].position;

    setPicks(prev => {
      const next = prev.filter(p => p.slotIndex !== editSlot && p.playerId !== entry.playerId);
      if (selected) next.push(playerToPick(entry, editSlot, slotPos, selected));
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
    writeStored('38-0-setup', setup);
    writeStored('38-0-squad', picks);
    clearStored('38-0-seen-squads', '38-0-plan');
    router.push('/squad');
  }

  const fmt = getFormation(formation);
  const assignedIds = new Set(picks.map(p => p.playerId));
  const overall = picks.length > 0
    ? Math.round(picks.reduce((s, p) => s + p.rating, 0) / picks.length)
    : 0;

  // Two hundred club-seasons and climbing, so the list has to be narrowed
  // before it can be read. Search matches the club or the season, so "1999"
  // and "forest" both work.
  const needle = search.trim().toLowerCase();
  const sortedTeams = teams
    .filter(t => !iconsOnly || t.iconic)
    .filter(t => needle === '' ||
      t.clubName.toLowerCase().includes(needle) ||
      t.seasonLabel.includes(needle))
    .sort((a, b) => {
    if (sortBy === 'ovr')  return b.overallRating - a.overallRating;
    if (sortBy === 'year') return b.yearStart - a.yearStart;
    return a.clubName.localeCompare(b.clubName) || b.yearStart - a.yearStart;
  });

  // For the swap panel: squad players sorted by position match then rating
  const editingSlotPos = editSlot != null ? fmt.slots[editSlot]?.position : null;
  const swapCandidates = editingSlotPos
    ? [...entries].sort((a, b) => {
        const aMatch = canFillSlot(a.positions, editingSlotPos);
        const bMatch = canFillSlot(b.positions, editingSlotPos);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return b.rating - a.rating;
      })
    : [];

  const currentInSlot = editSlot != null ? picks.find(p => p.slotIndex === editSlot) : null;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-2xl">
        <BackLink href="/" label="Setup" />
      </div>
      <h1 className="text-6xl font-black mb-2 mt-4 tracking-tight">
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
          {/*
            Once a side is chosen the list folds away. It is two hundred cards
            and climbing, and on a phone leaving it expanded pushed the XI you
            just picked several screens down, so nothing appeared to happen.
          */}
          {selected && !browsing ? (
            <button
              type="button"
              onClick={() => setBrowsing(true)}
              className="w-full rounded-xl border px-4 py-3 flex items-center gap-3 text-left transition-colors touch-manipulation"
              style={{ borderColor: `${selected.color}66`, background: `${selected.color}14` }}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selected.color }} />
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-sm text-white truncate">
                  {selected.clubName} <span className="text-[#888] font-normal">{selected.seasonLabel}</span>
                </span>
                <span className="block text-xs font-bold" style={{ color: ratingColor(selected.overallRating) }}>
                  OVR {selected.overallRating}
                </span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#00c896] shrink-0">
                Change
              </span>
            </button>
          ) : (
          <>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search club or season"
              aria-label="Search club or season"
              className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg px-3 py-2.5 text-sm
                         placeholder:text-[#333] focus:border-[#00c896] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setIconsOnly(v => !v)}
              aria-pressed={iconsOnly}
              className={`px-3 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest shrink-0
                          transition-colors touch-manipulation border ${
                iconsOnly
                  ? 'bg-[#c9b84e] text-black border-[#c9b84e]'
                  : 'text-[#444] border-[#1a1a1a] hover:text-white'
              }`}
            >
              {'★'} Icons
            </button>
          </div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-[10px] font-bold tracking-widest text-[#555] uppercase">
              {sortedTeams.length} side{sortedTeams.length === 1 ? '' : 's'}
            </span>
            <div className="flex gap-1">
              {(['ovr', 'year', 'name'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSortBy(opt)}
                  className={`px-3 py-2.5 rounded text-[10px] font-bold uppercase tracking-widest transition-colors touch-manipulation ${
                    sortBy === opt ? 'bg-[#00c896] text-black' : 'text-[#444] hover:text-white'
                  }`}
                >
                  {opt === 'ovr' ? 'OVR' : opt === 'year' ? 'Year' : 'Name'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sortedTeams.map(team => {
              const isSelected = selected?.clubId === team.clubId && selected?.seasonId === team.seasonId;
              return (
                <button
                  key={`${team.clubId}-${team.seasonId}`}
                  type="button"
                  onClick={() => selectTeam(team)}
                  className="relative rounded-xl border text-left px-4 py-3 transition-all"
                  style={{
                    borderColor: isSelected ? team.color : '#1a1a1a',
                    background:  isSelected ? `${team.color}18` : '#0d0d0d',
                    boxShadow:   isSelected ? `0 0 0 1px ${team.color}44` : undefined,
                  }}
                >
                  {team.iconic && (
                    <span className="absolute top-2 right-2 text-[#c9b84e] text-xs leading-none"
                          title="Iconic side">{'★'}</span>
                  )}
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
          {sortedTeams.length === 0 && (
            <p className="text-[#555] text-sm py-6 text-center">
              {iconsOnly
                ? 'No sides are marked as icons yet. Star them in the editor.'
                : 'Nothing matches that search.'}
            </p>
          )}
          </>
          )}
        </section>

        {/* Configuration — visible once a team is selected */}
        {selected && (
          <>
            {/* Formation */}
            <section>
              <Label>Formation</Label>
              <div className="grid grid-cols-2 gap-2 mb-1 sm:grid-cols-3 lg:grid-cols-4">
                {Object.keys(FORMATIONS).map(f => (
                  <OptionCard key={f} label={f} selected={formation === f} onClick={() => changeFormation(f)} />
                ))}
              </div>
              <p className="text-[#555] text-[11px] text-center mt-1">{FORMATIONS[formation]?.description}</p>
            </section>

            {/* Pitch + player list */}
            <div className="flex flex-col sm:flex-row gap-6 items-start justify-center">
              <div className="flex justify-center flex-shrink-0">
                <PitchView
                  formation={fmt}
                  picks={picks}
                  onSlotClick={handleSlotClick}
                  highlightSlot={editSlot ?? undefined}
                />
              </div>

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
                    const inOtherSlot = assignedIds.has(e.playerId) && e.playerId !== currentInSlot?.playerId;
                    const isCurrent   = e.playerId === currentInSlot?.playerId;
                    const posMatch    = canFillSlot(e.positions, editingSlotPos!);
                    return (
                      <button
                        key={e.playerId}
                        onClick={() => !inOtherSlot && swapPlayerIntoSlot(e)}
                        disabled={inOtherSlot}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors
                          ${isCurrent  ? 'bg-[#00c896]/10 cursor-default' : ''}
                          ${inOtherSlot ? 'opacity-30 cursor-not-allowed' : !isCurrent ? 'hover:bg-[#1a1a1a]' : ''}`}
                      >
                        <span className="flex-1 text-sm truncate">{e.name}</span>
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
