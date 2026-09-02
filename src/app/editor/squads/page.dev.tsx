'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import PositionBadge from '@/components/PositionBadge';
import { Position, FORMATIONS, getFormation } from '@/lib/formations';
import { PlayerRole } from '@/lib/simulation';
import { NATIONALITIES, isValidNationality } from '@/lib/nationalities';

const ALL_POSITIONS: Position[] = ['GK','LB','CB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','ST','CF'];

const POSITION_ORDER: Record<string, number> = {
  GK: 0, LB: 1, LWB: 2, CB: 3, RWB: 4, RB: 5,
  CDM: 6, CM: 7, LM: 8, RM: 9, CAM: 10,
  LW: 11, RW: 12, CF: 13, ST: 14,
};

type SortKey = 'position' | 'overall' | 'name' | 'nationality';

// Stable empties, so deriving "nothing selected" does not produce a new
// reference on every render.
const NO_ENTRIES: EntryFull[] = [];
const NO_SEASON_IDS: ReadonlySet<number> = new Set<number>();

const emptySlots = (): (number | null)[] => Array(11).fill(null);


interface Club   { id: number; name: string; color: string; }
interface Season { id: number; label: string; year_start: number; }

interface PlayerResult {
  id: number; name: string; nationality: string | null;
  base_rating: number; base_positions: string;
}

interface EntryFull {
  id: number; player_id: number; player_version_id: number; player_name: string; nationality: string | null;
  rating: number; positions: string; roles: string; version_label: string;
  club_name: string; season_label: string;
}

export default function SquadsEditor() {
  const [clubs,   setClubs]   = useState<Club[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);

  const [selClub,        setSelClub]        = useState('');
  const [selSeason,      setSelSeason]      = useState('');

  // Fetched data is stored with the selection it belongs to, so the derived
  // values below fall back to empty rather than showing a previous club's
  // squad while a new request is in flight.
  const [loadedEntries,  setLoadedEntries]  = useState<{ club: string; season: string; rows: EntryFull[] } | null>(null);
  const [clubSeasonIds,  setClubSeasonIds]  = useState<{ club: string; ids: Set<number> } | null>(null);

  // add-player form
  const [playerQuery,   setPlayerQuery]   = useState('');
  const [playerSearch,  setPlayerSearch]  = useState<PlayerResult[]>([]);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [selPlayer,     setSelPlayer]     = useState<PlayerResult | null>(null);
  const [isNewPlayer,   setIsNewPlayer]   = useState(false);
  const [newPlayerNat,  setNewPlayerNat]  = useState('');
  const [natWarn,       setNatWarn]       = useState(false);
  const [rating,        setRating]        = useState(75);
  const [selPos,        setSelPos]        = useState<Position[]>([]);
  const [selRoles,      setSelRoles]      = useState<PlayerRole[]>([]);
  const [saving,        setSaving]        = useState(false);

  // editing existing entry
  const [editEntry,  setEditEntry]  = useState<EntryFull | null>(null);
  const [editRating, setEditRating] = useState(75);
  const [editPos,    setEditPos]    = useState<Position[]>([]);
  const [editRoles,  setEditRoles]  = useState<PlayerRole[]>([]);

  // sort
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [sortAsc, setSortAsc] = useState(true);

  // tab
  const [activeTab, setActiveTab] = useState<'squad' | 'lineup'>('squad');

  // lineup
  const [formation,       setFormation]       = useState('4-3-3');
  const [lineupSlots,     setLineupSlots]     = useState<(number | null)[]>(emptySlots);
  const [lineupSaving,    setLineupSaving]    = useState(false);
  const [lineupStatus,    setLineupStatus]    = useState<'idle' | 'saved' | 'error'>('idle');

  const searchRef = useRef<HTMLDivElement>(null);

  async function loadEntries() {
    if (!selClub || !selSeason) return;
    const club = selClub, season = selSeason;
    const r = await fetch(`/api/squads?clubId=${club}&seasonId=${season}`);
    setLoadedEntries({ club, season, rows: await r.json() });
  }

  const entries = useMemo(
    () => (loadedEntries?.club === selClub && loadedEntries?.season === selSeason
      ? loadedEntries.rows
      : NO_ENTRIES),
    [loadedEntries, selClub, selSeason],
  );

  const validSeasonIds = useMemo(
    () => (clubSeasonIds?.club === selClub ? clubSeasonIds.ids : NO_SEASON_IDS),
    [clubSeasonIds, selClub],
  );

  // Changing club invalidates the season choice and everything built from it.
  function changeClub(club: string) {
    setSelClub(club);
    setSelSeason('');
    setLineupSlots(emptySlots());
  }

  function changeSeason(season: string) {
    setSelSeason(season);
    setLineupSlots(emptySlots());
  }

  const [roleOptions, setRoleOptions] = useState<{ name: string; label: string }[]>([]);

  useEffect(() => {
    fetch('/api/clubs').then(r => r.json()).then(setClubs);
    fetch('/api/seasons').then(r => r.json()).then(setSeasons);
    fetch('/api/roles').then(r => r.json()).then((rows: { name: string; label: string }[]) => setRoleOptions(rows));
  }, []);
  useEffect(() => {
    if (!selClub || !selSeason) return;
    const club = selClub, season = selSeason;
    fetch(`/api/squads?clubId=${club}&seasonId=${season}`)
      .then(r => r.json())
      .then((rows: EntryFull[]) => setLoadedEntries({ club, season, rows }));
  }, [selClub, selSeason]);

  useEffect(() => {
    if (!selClub) return;
    const club = selClub;
    fetch(`/api/squads?clubId=${club}&distinct=seasons`)
      .then(r => r.json())
      .then((ids: number[]) => setClubSeasonIds({ club, ids: new Set(ids) }));
  }, [selClub]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load saved lineup whenever club+season changes. Clearing on deselection is
  // handled by changeClub/changeSeason.
  useEffect(() => {
    if (!selClub || !selSeason) return;
    fetch(`/api/lineups?clubId=${selClub}&seasonId=${selSeason}`)
      .then(r => r.json())
      .then((data: { formation: string; slots: { slot_index: number; player_id: number }[] } | null) => {
        if (data?.formation) {
          setFormation(data.formation);
          const s = emptySlots();
          for (const sl of data.slots) s[sl.slot_index] = sl.player_id;
          setLineupSlots(s);
        } else {
          setLineupSlots(emptySlots());
        }
      });
  }, [selClub, selSeason]);

  function changeFormation(f: string) { setFormation(f); setLineupSlots(emptySlots()); }

  function setLineupSlot(i: number, playerId: number | null) {
    setLineupSlots(prev => {
      const next = [...prev];
      if (playerId != null) {
        const dup = next.indexOf(playerId);
        if (dup !== -1 && dup !== i) next[dup] = null;
      }
      next[i] = playerId;
      return next;
    });
  }

  async function saveLineup() {
    if (!selClub || !selSeason) return;
    setLineupSaving(true);
    setLineupStatus('idle');
    try {
      const res = await fetch('/api/lineups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          club_id: +selClub, season_id: +selSeason, formation,
          slots: lineupSlots.map((player_id, slot_index) => ({ slot_index, player_id })),
        }),
      });
      setLineupStatus(res.ok ? 'saved' : 'error');
    } catch { setLineupStatus('error'); }
    finally {
      setLineupSaving(false);
      setTimeout(() => setLineupStatus('idle'), 2500);
    }
  }

  async function searchPlayers(q: string) {
    setPlayerQuery(q);
    setSelPlayer(null);
    setIsNewPlayer(false);
    if (!q.trim()) { setPlayerSearch([]); setShowDropdown(false); return; }
    const r = await fetch(`/api/players?q=${encodeURIComponent(q)}`);
    const results: PlayerResult[] = await r.json();
    setPlayerSearch(results);
    setShowDropdown(true);
  }

  function pickExistingPlayer(p: PlayerResult) {
    setSelPlayer(p);
    setIsNewPlayer(false);
    setPlayerQuery(p.name);
    setPlayerSearch([]);
    setShowDropdown(false);
    setRating(p.base_rating ?? 75);
    setSelPos((JSON.parse(p.base_positions ?? '[]') as Position[]).filter(x => ALL_POSITIONS.includes(x)));
    setSelRoles([]);
  }

  function pickNewPlayer() {
    setSelPlayer(null);
    setIsNewPlayer(true);
    setShowDropdown(false);
    setRating(75);
    setSelPos([]);
    setSelRoles([]);
    setNewPlayerNat('');
    setNatWarn(false);
  }

  function clearSelection() {
    setSelPlayer(null);
    setIsNewPlayer(false);
    setPlayerQuery('');
    setPlayerSearch([]);
    setShowDropdown(false);
    setSelPos([]);
    setSelRoles([]);
    setNewPlayerNat('');
    setNatWarn(false);
  }

  async function addEntry() {
    if (!selClub || !selSeason || selPos.length === 0) return;
    if (!selPlayer && !isNewPlayer) return;
    if (isNewPlayer && !playerQuery.trim()) return;

    if (isNewPlayer && newPlayerNat && !isValidNationality(newPlayerNat)) {
      setNatWarn(true);
      return;
    }

    setSaving(true);
    try {
      let playerId: number;

      if (isNewPlayer) {
        // Create the player first
        const createRes = await fetch('/api/players', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: playerQuery.trim(),
            nationality: newPlayerNat.trim() || null,
            base_rating: rating,
            base_positions: selPos,
            roles: [],
          }),
        });
        const created = await createRes.json();
        playerId = created.id;
      } else {
        playerId = selPlayer!.id;
      }

      await fetch('/api/squads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          club_id: +selClub, season_id: +selSeason,
          player_id: playerId, rating, positions: selPos, roles: selRoles,
        }),
      });

      clearSelection();
      await loadEntries();
    } finally {
      setSaving(false);
    }
  }

  function startEditEntry(e: EntryFull) {
    setEditEntry(e);
    setEditRating(e.rating);
    setEditPos(JSON.parse(e.positions) as Position[]);
    setEditRoles(JSON.parse(e.roles ?? '[]') as PlayerRole[]);
  }

  async function updateEntry() {
    if (!editEntry) return;
    setSaving(true);
    await fetch(`/api/squads/${editEntry.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: editRating, positions: editPos, roles: editRoles }),
    });
    setEditEntry(null);
    await loadEntries();
    setSaving(false);
  }

  async function delEntry(id: number) {
    if (!confirm('Remove player from this squad?')) return;
    await fetch(`/api/squads/${id}`, { method: 'DELETE' });
    await loadEntries();
  }

  const selectedSeason = seasons.find(s => String(s.id) === selSeason);
  const alreadyInSquad = new Set(entries.map(e => e.player_id));

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(key !== 'overall'); }
  }

  const sortedEntries = [...entries].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'position') {
      const ap = (JSON.parse(a.positions) as string[])[0] ?? '';
      const bp = (JSON.parse(b.positions) as string[])[0] ?? '';
      cmp = (POSITION_ORDER[ap] ?? 99) - (POSITION_ORDER[bp] ?? 99);
    } else if (sortKey === 'overall') {
      cmp = b.rating - a.rating;
    } else if (sortKey === 'name') {
      cmp = a.player_name.localeCompare(b.player_name);
    } else if (sortKey === 'nationality') {
      cmp = (a.nationality ?? '').localeCompare(b.nationality ?? '');
    }
    return sortAsc ? cmp : -cmp;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-black">Squads</h1>

      {/* Club + Season selector — always full width at top */}
      <div className="bg-[#111] rounded-xl p-5 border border-[#1a1a1a] space-y-3">
        <h2 className="text-sm font-bold text-[#888]">Select Club Season</h2>
        <div className="grid grid-cols-2 gap-3">
          <select
            className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm border border-[#2a2a2a] focus:border-[#00c896] outline-none"
            value={selClub} onChange={e => changeClub(e.target.value)}
          >
            <option value="">— Select club —</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm border border-[#2a2a2a] focus:border-[#00c896] outline-none"
            value={selSeason} onChange={e => changeSeason(e.target.value)}
          >
            <option value="">— Select season —</option>
            {[...seasons].reverse()
              .map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}{validSeasonIds.has(s.id) ? ' ✓' : ''}
                </option>
              ))}
          </select>
        </div>
      </div>

      {selClub && selSeason && (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-[#1a1a1a]">
            {(['squad', 'lineup'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'border-[#00c896] text-white'
                    : 'border-transparent text-[#555] hover:text-[#888]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'squad' && (
        <div className="flex flex-col md:flex-row gap-6 items-start">

          {/* Left: scrollable player list */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#555] uppercase tracking-widest font-bold mr-1">
                {entries.length} players
              </span>
              {(['position','overall','name','nationality'] as SortKey[]).map(key => (
                <button
                  key={key}
                  onClick={() => toggleSort(key)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-semibold capitalize transition-colors ${
                    sortKey === key
                      ? 'bg-[#00c896]/20 text-[#00c896] border border-[#00c896]/40'
                      : 'bg-[#1a1a1a] text-[#555] border border-transparent hover:text-[#888]'
                  }`}
                >
                  {key}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
            {sortedEntries.map(e => (
              <div
                key={e.id}
                className={`bg-[#111] rounded-xl border transition-colors ${editEntry?.id === e.id ? 'border-[#00c896]/40' : 'border-[#1a1a1a]'}`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="font-bold text-sm flex-1 min-w-0 truncate">{e.player_name}</span>
                  {e.nationality && <span className="text-[#444] text-xs shrink-0">{e.nationality}</span>}
                  <div className="flex gap-1 shrink-0">
                    {(JSON.parse(e.positions) as Position[]).map(pos => (
                      <PositionBadge key={pos} pos={pos} size="xs" />
                    ))}
                  </div>
                  {(() => {
                    const roles = JSON.parse(e.roles ?? '[]') as PlayerRole[];
                    return roles.length > 0 ? (
                      <div className="flex gap-1 shrink-0 max-w-[120px] overflow-hidden">
                        {roles.slice(0, 2).map(r => (
                          <span key={r} className="text-[9px] bg-[#8b5cf6]/20 text-[#8b5cf6] px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                            {roleOptions.find(o => o.name === r)?.label ?? r}
                          </span>
                        ))}
                        {roles.length > 2 && (
                          <span className="text-[9px] text-[#555]">+{roles.length - 2}</span>
                        )}
                      </div>
                    ) : null;
                  })()}
                  <span className="text-[#00c896] font-black text-sm w-6 text-right shrink-0">{e.rating}</span>
                  <button
                    onClick={() => editEntry?.id === e.id ? setEditEntry(null) : startEditEntry(e)}
                    className={`text-xs ml-2 shrink-0 transition-colors ${editEntry?.id === e.id ? 'text-[#00c896]' : 'text-[#555] hover:text-[#00c896]'}`}
                  >
                    {editEntry?.id === e.id ? 'Editing' : 'Edit'}
                  </button>
                  <button onClick={() => delEntry(e.id)}
                    className="text-xs text-[#555] hover:text-red-400 shrink-0">Remove</button>
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="text-[#444] text-sm py-4 text-center">No players in this squad yet.</div>
            )}

          </div>

          {/* Right: sticky editing panel */}
          <div className="w-full md:w-80 shrink-0 sticky top-4">
            {editEntry ? (
              /* ── Edit existing entry ── */
              <div className="bg-[#111] rounded-xl p-5 border border-[#00c896]/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-[#555] uppercase tracking-widest font-bold mb-0.5">Editing</div>
                    <div className="font-black text-sm">{editEntry.player_name}</div>
                  </div>
                  <button onClick={() => setEditEntry(null)}
                    className="text-xs text-[#555] hover:text-white transition-colors px-2 py-1 rounded bg-[#1a1a1a]">
                    ✕ Cancel
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <Label className="w-12">Rating</Label>
                  <input type="range" min={50} max={99} value={editRating}
                    onChange={ev => setEditRating(+ev.target.value)}
                    className="flex-1 accent-[#00c896]" />
                  <span className="text-[#00c896] font-black w-6">{editRating}</span>
                </div>

                <div>
                  <Label>Positions</Label>
                  <PositionGrid
                    selected={editPos}
                    onToggle={p => setEditPos(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                  />
                </div>

                <div>
                  <Label>Roles</Label>
                  <RoleGrid
                    roleOptions={roleOptions}
                    selected={editRoles}
                    onToggle={r => setEditRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                  />
                </div>

                <button onClick={updateEntry} disabled={saving}
                  className="w-full px-4 py-2 rounded-lg bg-[#00c896] text-black text-sm font-bold hover:bg-[#00b385] disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            ) : (
              /* ── Add new player ── */
              <div className="bg-[#111] rounded-xl p-5 border border-[#1a1a1a] space-y-4">
                <h2 className="text-sm font-bold text-[#888]">
                  Add Player — {clubs.find(c => String(c.id) === selClub)?.name} {selectedSeason?.label}
                </h2>

                <div className="relative" ref={searchRef}>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm border border-[#2a2a2a] focus:border-[#00c896] outline-none"
                      placeholder="Search or type a new player name…"
                      value={playerQuery}
                      onChange={e => searchPlayers(e.target.value)}
                      onFocus={() => playerSearch.length > 0 && setShowDropdown(true)}
                    />
                    {(selPlayer || isNewPlayer) && (
                      <button
                        onClick={clearSelection}
                        className="px-3 py-2 rounded-lg bg-[#1a1a1a] text-xs text-[#555] hover:text-white transition-colors border border-[#2a2a2a]"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg mt-1 z-10 max-h-56 overflow-y-auto">
                      {playerSearch.map(p => {
                        const inSquad = alreadyInSquad.has(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => !inSquad && pickExistingPlayer(p)}
                            disabled={inSquad}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors
                              ${inSquad ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#222]'}`}
                          >
                            <span className="flex-1">{p.name}</span>
                            {p.nationality && <span className="text-[#555] text-xs">{p.nationality}</span>}
                            {inSquad && <span className="text-[#444] text-xs">in squad</span>}
                            <span className="text-[#00c896] font-black text-xs w-6 text-right">{p.base_rating}</span>
                          </button>
                        );
                      })}
                      {playerQuery.trim() && (
                        <button
                          onClick={pickNewPlayer}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[#222] transition-colors flex items-center gap-2 border-t border-[#2a2a2a]"
                        >
                          <span className="text-[#00c896] font-bold">+ Create new player</span>
                          <span className="text-[#888]">&ldquo;{playerQuery}&rdquo;</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {selPlayer && (
                  <div className="text-xs text-[#00c896]">
                    Adding existing player: <span className="font-bold">{selPlayer.name}</span>
                  </div>
                )}
                {isNewPlayer && (
                  <div className="space-y-2">
                    <div className="text-xs text-amber-400">
                      Creating new player: <span className="font-bold">{playerQuery}</span>
                    </div>
                    <div>
                      <Label>Nationality (optional)</Label>
                      <input
                        list="nat-list-sq"
                        className={`w-full bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm border outline-none transition-colors
                          ${natWarn ? 'border-red-500' : 'border-[#2a2a2a] focus:border-[#00c896]'}`}
                        placeholder="e.g. England"
                        value={newPlayerNat}
                        onChange={e => { setNatWarn(false); setNewPlayerNat(e.target.value); }}
                      />
                      <datalist id="nat-list-sq">
                        {NATIONALITIES.map(n => <option key={n} value={n} />)}
                      </datalist>
                      {natWarn && <p className="text-red-400 text-xs mt-1">Pick from the list.</p>}
                    </div>
                  </div>
                )}

                {(selPlayer || isNewPlayer) && (
                  <>
                    <div className="flex items-center gap-3">
                      <Label className="w-12">Rating</Label>
                      <input type="range" min={50} max={99} value={rating}
                        onChange={e => setRating(+e.target.value)}
                        className="flex-1 accent-[#00c896]" />
                      <span className="text-[#00c896] font-black w-6">{rating}</span>
                    </div>

                    <div>
                      <Label>Positions</Label>
                      <PositionGrid selected={selPos} onToggle={p => setSelPos(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} />
                    </div>

                    <div>
                      <Label>Roles</Label>
                      <RoleGrid roleOptions={roleOptions} selected={selRoles} onToggle={r => setSelRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])} />
                    </div>

                    <button
                      onClick={addEntry}
                      disabled={saving || selPos.length === 0}
                      className="w-full px-4 py-2 rounded-lg bg-[#00c896] text-black text-sm font-bold hover:bg-[#00b385] disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Adding…' : isNewPlayer ? 'Create & Add to Squad' : 'Add to Squad'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
          )}

          {activeTab === 'lineup' && (() => {
            const fmt         = getFormation(formation);
            const assignedIds = new Set(lineupSlots.filter((id): id is number => id != null));
            const filledCount = assignedIds.size;
            return (
              <div className="space-y-4">
                {/* Formation picker */}
                <div className="flex items-center gap-4">
                  <Label className="mb-0 shrink-0">Formation</Label>
                  <select
                    className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm border border-[#2a2a2a] focus:border-[#00c896] outline-none"
                    value={formation}
                    onChange={e => changeFormation(e.target.value)}
                  >
                    {Object.keys(FORMATIONS).map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <span className="text-xs text-[#555]">{filledCount}/11 assigned</span>
                  {filledCount > 0 && (
                    <span className="text-xs text-[#00c896]">
                      Avg {Math.round(
                        lineupSlots
                          .filter((id): id is number => id != null)
                          .map(id => entries.find(p => p.player_id === id)?.rating ?? 0)
                          .reduce((a, b) => a + b, 0) / filledCount
                      )} OVR
                    </span>
                  )}
                </div>

                {/* Slot list */}
                <div className="space-y-1.5">
                  {fmt.slots.map((slot, i) => {
                    const assignedId     = lineupSlots[i];
                    const assignedPlayer = entries.find(p => p.player_id === assignedId);
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
                          onChange={e => setLineupSlot(i, e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">— Unassigned —</option>
                          {entries
                            .slice()
                            .sort((a, b) => {
                              const ap = (JSON.parse(a.positions) as string[]).includes(slot.position);
                              const bp = (JSON.parse(b.positions) as string[]).includes(slot.position);
                              if (ap && !bp) return -1;
                              if (!ap && bp) return 1;
                              return b.rating - a.rating;
                            })
                            .map(p => {
                              const taken = assignedIds.has(p.player_id) && p.player_id !== assignedId;
                              return (
                                <option key={p.player_id} value={p.player_id} disabled={taken}>
                                  {taken ? '✓ ' : ''}{p.player_name} ({p.rating})
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
                  onClick={saveLineup}
                  disabled={lineupSaving}
                  className="w-full py-3 rounded-xl font-black bg-[#00c896] text-black hover:bg-[#00b385] transition-colors disabled:opacity-50"
                >
                  {lineupSaving ? 'Saving…' : lineupStatus === 'saved' ? 'Saved ✓' : lineupStatus === 'error' ? 'Error — try again' : 'Save Lineup'}
                </button>
              </div>
            );
          })()}

        </>
      )}
    </div>
  );
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[10px] font-bold tracking-widest text-[#555] uppercase mb-1 ${className}`}>
      {children}
    </div>
  );
}

function PositionGrid({ selected, onToggle }: { selected: Position[]; onToggle: (p: Position) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_POSITIONS.map(pos => (
        <button key={pos} onClick={() => onToggle(pos)}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors
            ${selected.includes(pos) ? 'bg-[#00c896] text-black' : 'bg-[#1a1a1a] text-[#666] hover:bg-[#222]'}`}>
          {pos}
        </button>
      ))}
    </div>
  );
}

function RoleGrid({ selected, onToggle, roleOptions }: {
  selected: string[];
  onToggle: (r: string) => void;
  roleOptions: { name: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roleOptions.map(r => (
        <button key={r.name} onClick={() => onToggle(r.name)}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors
            ${selected.includes(r.name) ? 'bg-[#8b5cf6] text-white' : 'bg-[#1a1a1a] text-[#666] hover:bg-[#222]'}`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}
