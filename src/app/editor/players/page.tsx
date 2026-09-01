'use client';

import { useState, useEffect, useMemo } from 'react';
import PositionBadge from '@/components/PositionBadge';
import { Position } from '@/lib/formations';
import { NATIONALITIES, isValidNationality } from '@/lib/nationalities';
import { PlayerRole } from '@/lib/simulation';

const ALL_POSITIONS: Position[] = ['GK','LB','CB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','ST','CF'];

interface Player {
  id: number; name: string; nationality: string | null;
  base_rating: number; base_positions: string;
}
interface Club   { id: number; name: string; }
interface Season { id: number; label: string; year_start: number; }
interface Entry  {
  id: number; club_id: number; season_id: number; player_version_id: number;
  player_id: number; rating: number; positions: string; roles: string;
  version_label: string; club_name: string; season_label: string;
}

const BLANK_FORM = { name: '', nationality: '', base_rating: 75, base_positions: [] as Position[] };

export default function PlayersEditor() {
  const [players,  setPlayers]  = useState<Player[]>([]);
  const [clubs,    setClubs]    = useState<Club[]>([]);
  const [seasons,  setSeasons]  = useState<Season[]>([]);
  const [query,    setQuery]    = useState('');
  const [form,     setForm]     = useState(BLANK_FORM);
  const [editing,  setEditing]  = useState<Player | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [natWarn,  setNatWarn]  = useState(false);

  // per-player versions panel state
  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [showAddVer,   setShowAddVer]   = useState(false);
  const [verClub,      setVerClub]      = useState('');
  const [verSeason,    setVerSeason]    = useState('');
  const [verRating,    setVerRating]    = useState(75);
  const [verPos,       setVerPos]       = useState<Position[]>([]);
  const [verSaving,    setVerSaving]    = useState(false);
  const [editEntryId,  setEditEntryId]  = useState<number | null>(null);
  const [editRating,   setEditRating]   = useState(75);
  const [editPos,      setEditPos]      = useState<Position[]>([]);
  const [editRoles,    setEditRoles]    = useState<PlayerRole[]>([]);

  async function loadPlayers() {
    const r = await fetch('/api/players');
    setPlayers(await r.json());
  }
  async function loadEntries(playerId: number) {
    const r = await fetch(`/api/squads?playerId=${playerId}`);
    setEntries(await r.json());
  }

  const [roleOptions, setRoleOptions] = useState<{ name: string; label: string }[]>([]);

  useEffect(() => {
    loadPlayers();
    fetch('/api/clubs').then(r => r.json()).then(setClubs);
    fetch('/api/seasons').then(r => r.json()).then(setSeasons);
    fetch('/api/roles').then(r => r.json()).then((rows: { name: string; label: string }[]) => setRoleOptions(rows));
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q
      ? players.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.nationality ?? '').toLowerCase().includes(q))
      : players;
  }, [players, query]);

  function startEdit(p: Player) {
    setEditing(p);
    setForm({
      name: p.name,
      nationality: p.nationality ?? '',
      base_rating: p.base_rating,
      base_positions: JSON.parse(p.base_positions) as Position[],
    });
    setNatWarn(false);
    resetVersionForm(p.base_rating, JSON.parse(p.base_positions) as Position[]);
    loadEntries(p.id);
  }

  function cancelEdit() {
    setEditing(null);
    setForm(BLANK_FORM);
    setNatWarn(false);
    setEntries([]);
    setShowAddVer(false);
    setEditEntryId(null);
  }

  function resetVersionForm(defaultRating = form.base_rating, defaultPos = form.base_positions) {
    setVerClub('');
    setVerSeason('');
    setVerRating(defaultRating);
    setVerPos(defaultPos);
    setShowAddVer(false);
  }

  function togglePos(pos: Position, which: 'base' | 'ver' | 'edit') {
    if (which === 'base') {
      setForm(f => ({
        ...f,
        base_positions: f.base_positions.includes(pos)
          ? f.base_positions.filter(p => p !== pos)
          : [...f.base_positions, pos],
      }));
    } else if (which === 'ver') {
      setVerPos(prev => prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]);
    } else {
      setEditPos(prev => prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]);
    }
  }

  async function savePlayer() {
    if (!form.name.trim()) return;
    if (form.nationality && !isValidNationality(form.nationality)) { setNatWarn(true); return; }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      nationality: form.nationality.trim() || null,
      base_rating: form.base_rating,
      base_positions: form.base_positions,
    };
    if (editing) {
      await fetch(`/api/players/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await loadPlayers();
    } else {
      const res  = await fetch('/api/players', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const newPlayer: Player = await res.json();
      await loadPlayers();
      // Stay in edit mode so the user can immediately add versions
      setEditing(newPlayer);
      setEntries([]);
    }
    setSaving(false);
  }

  async function addVersion() {
    if (!editing || !verClub || !verSeason || verPos.length === 0) return;
    setVerSaving(true);
    await fetch('/api/squads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        club_id: +verClub, season_id: +verSeason,
        player_id: editing.id, rating: verRating, positions: verPos,
      }),
    });
    await loadEntries(editing.id);
    resetVersionForm();
    setVerSaving(false);
  }

  function startEditEntry(e: Entry) {
    setEditEntryId(e.id);
    setEditRating(e.rating);
    setEditPos(JSON.parse(e.positions) as Position[]);
    setEditRoles(JSON.parse(e.roles ?? '[]') as PlayerRole[]);
  }

  async function saveEntry() {
    if (!editEntryId) return;
    setVerSaving(true);
    await fetch(`/api/squads/${editEntryId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: editRating, positions: editPos, roles: editRoles }),
    });
    setEditEntryId(null);
    await loadEntries(editing!.id);
    setVerSaving(false);
  }

  async function deleteEntry(id: number) {
    if (!confirm('Remove this version?')) return;
    await fetch(`/api/squads/${id}`, { method: 'DELETE' });
    await loadEntries(editing!.id);
  }

  async function deletePlayer(id: number) {
    if (!confirm('Delete this player and all their squad entries?')) return;
    await fetch(`/api/players/${id}`, { method: 'DELETE' });
    if (editing?.id === id) cancelEdit();
    await loadPlayers();
  }

  const seasons34 = [...seasons].sort((a, b) => b.year_start - a.year_start);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-black">Players</h1>

      <div className="flex flex-col md:flex-row gap-6 items-start">

        {/* Left: search + player list */}
        <div className="flex-1 min-w-0 space-y-3">
          <input
            className="w-full bg-[#111] rounded-xl px-4 py-3 text-sm border border-[#1a1a1a] focus:border-[#00c896] outline-none"
            placeholder={`Search ${players.length} players…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />

          <div className="space-y-1.5">
            {filtered.map(p => {
              const pos = JSON.parse(p.base_positions) as Position[];
              const isActive = editing?.id === p.id;
              return (
                <div key={p.id}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors
                    ${isActive ? 'bg-[#0d1a14] border-[#00c896]/30' : 'bg-[#111] border-[#1a1a1a]'}`}
                >
                  <span className="font-bold text-sm flex-1 min-w-0 truncate">{p.name}</span>
                  {p.nationality && <span className="text-[#555] text-xs shrink-0">{p.nationality}</span>}
                  <div className="flex gap-1 shrink-0">
                    {pos.map(pos => <PositionBadge key={pos} pos={pos} size="xs" />)}
                  </div>
                  <span className="text-[#00c896] font-black text-sm w-6 text-right shrink-0">{p.base_rating}</span>
                  <button onClick={() => isActive ? cancelEdit() : startEdit(p)}
                    className={`text-xs transition-colors shrink-0 ${isActive ? 'text-[#00c896]' : 'text-[#555] hover:text-[#00c896]'}`}>
                    {isActive ? 'Editing' : 'Edit'}
                  </button>
                  <button onClick={() => deletePlayer(p.id)}
                    className="text-xs text-[#555] hover:text-red-400 transition-colors shrink-0">
                    Delete
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && query && (
              <div className="text-[#444] text-sm py-4 text-center">No players match &ldquo;{query}&rdquo;</div>
            )}
            {players.length === 0 && (
              <div className="text-[#444] text-sm py-4 text-center">No players yet.</div>
            )}
          </div>
        </div>

        {/* Right: sticky editing panel */}
        <div className="w-full md:w-96 shrink-0 sticky top-4 space-y-4">

          {/* Player base form */}
          <div className={`bg-[#111] rounded-xl p-5 border space-y-4 ${editing ? 'border-[#00c896]/30' : 'border-[#1a1a1a]'}`}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-[#888]">
                {editing ? `Editing: ${editing.name}` : 'Add Player'}
              </h2>
              {editing && (
                <button onClick={cancelEdit}
                  className="text-xs text-[#555] hover:text-white transition-colors px-2 py-1 rounded bg-[#1a1a1a]">
                  ✕ Done
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <input
                  className="w-full bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm border border-[#2a2a2a] focus:border-[#00c896] outline-none"
                  placeholder="Full name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Nationality</Label>
                <input
                  list="nat-list"
                  className={`w-full bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm border outline-none transition-colors
                    ${natWarn ? 'border-red-500' : 'border-[#2a2a2a] focus:border-[#00c896]'}`}
                  placeholder="e.g. England"
                  value={form.nationality}
                  onChange={e => { setNatWarn(false); setForm(f => ({ ...f, nationality: e.target.value })); }}
                />
                <datalist id="nat-list">
                  {NATIONALITIES.map(n => <option key={n} value={n} />)}
                </datalist>
                {natWarn && <p className="text-red-400 text-xs mt-1">Pick from the list.</p>}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label className="w-20">Base rating</Label>
              <input type="range" min={50} max={99} value={form.base_rating}
                onChange={e => setForm(f => ({ ...f, base_rating: +e.target.value }))}
                className="flex-1 accent-[#00c896]" />
              <span className="text-[#00c896] font-black w-7 text-right">{form.base_rating}</span>
            </div>

            <div>
              <Label>Base positions</Label>
              <PositionGrid selected={form.base_positions} onToggle={p => togglePos(p, 'base')} />
            </div>

            <button
              onClick={savePlayer} disabled={saving || !form.name.trim()}
              className="w-full px-4 py-2 rounded-lg bg-[#00c896] text-black text-sm font-bold hover:bg-[#00b385] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : editing ? 'Update Player' : 'Add Player'}
            </button>
          </div>

          {/* Season versions panel */}
          {editing && (
            <div className="bg-[#111] rounded-xl p-5 border border-[#1a1a1a] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#555] uppercase tracking-widest">
                  Season versions ({entries.length})
                </span>
                {!showAddVer && (
                  <button
                    onClick={() => { resetVersionForm(form.base_rating, form.base_positions); setShowAddVer(true); }}
                    className="text-xs text-[#00c896] hover:text-[#00b385] transition-colors font-bold"
                  >
                    + Add version
                  </button>
                )}
              </div>

              {entries.map(e => (
                <div key={e.id} className="bg-[#0d0d0d] rounded-lg border border-[#1a1a1a]">
                  {editEntryId === e.id ? (
                    <div className="p-3 space-y-3">
                      <div className="text-xs font-bold text-white">{e.club_name} · {e.season_label}</div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#555] w-12">Rating</span>
                        <input type="range" min={50} max={99} value={editRating}
                          onChange={ev => setEditRating(+ev.target.value)}
                          className="flex-1 accent-[#00c896]" />
                        <span className="text-[#00c896] font-black w-7 text-right">{editRating}</span>
                      </div>
                      <PositionGrid selected={editPos} onToggle={p => togglePos(p, 'edit')} />
                      <div>
                        <Label>Roles</Label>
                        <RoleGrid
                          roleOptions={roleOptions}
                          selected={editRoles}
                          onToggle={r => setEditRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEntry} disabled={verSaving}
                          className="px-3 py-1.5 rounded bg-[#00c896] text-black text-xs font-bold disabled:opacity-50">
                          Save
                        </button>
                        <button onClick={() => setEditEntryId(null)}
                          className="px-3 py-1.5 rounded bg-[#1a1a1a] text-xs hover:bg-[#222]">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold">{e.club_name}</span>
                        <span className="text-xs text-[#555] ml-2">{e.season_label}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {(JSON.parse(e.positions) as Position[]).map(p => (
                          <PositionBadge key={p} pos={p} size="xs" />
                        ))}
                      </div>
                      <span className="text-[#00c896] font-black text-sm w-6 text-right shrink-0">{e.rating}</span>
                      <button onClick={() => startEditEntry(e)}
                        className="text-xs text-[#555] hover:text-[#00c896] transition-colors ml-1">Edit</button>
                      <button onClick={() => deleteEntry(e.id)}
                        className="text-xs text-[#555] hover:text-red-400 transition-colors">Remove</button>
                    </div>
                  )}
                </div>
              ))}

              {entries.length === 0 && !showAddVer && (
                <p className="text-[#444] text-xs">No season entries yet — add a version above.</p>
              )}

              {showAddVer && (
                <div className="bg-[#0d0d0d] rounded-lg border border-[#2a2a2a] p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Club</Label>
                      <select
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm focus:border-[#00c896] outline-none"
                        value={verClub} onChange={e => setVerClub(e.target.value)}
                      >
                        <option value="">— Club —</option>
                        {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Season</Label>
                      <select
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm focus:border-[#00c896] outline-none"
                        value={verSeason} onChange={e => setVerSeason(e.target.value)}
                      >
                        <option value="">— Season —</option>
                        {seasons34.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#555] w-12">Rating</span>
                    <input type="range" min={50} max={99} value={verRating}
                      onChange={e => setVerRating(+e.target.value)}
                      className="flex-1 accent-[#00c896]" />
                    <span className="text-[#00c896] font-black w-7 text-right">{verRating}</span>
                  </div>
                  <PositionGrid selected={verPos} onToggle={p => togglePos(p, 'ver')} />
                  <div className="flex gap-2">
                    <button
                      onClick={addVersion}
                      disabled={verSaving || !verClub || !verSeason || verPos.length === 0}
                      className="px-3 py-1.5 rounded bg-[#00c896] text-black text-xs font-bold disabled:opacity-50 hover:bg-[#00b385] transition-colors"
                    >
                      {verSaving ? 'Adding…' : 'Add Version'}
                    </button>
                    <button onClick={() => setShowAddVer(false)}
                      className="px-3 py-1.5 rounded bg-[#1a1a1a] text-xs hover:bg-[#222] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
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
        <button
          key={pos}
          onClick={() => onToggle(pos)}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors
            ${selected.includes(pos) ? 'bg-[#00c896] text-black' : 'bg-[#1a1a1a] text-[#666] hover:bg-[#222]'}`}
        >
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
        <button
          key={r.name}
          onClick={() => onToggle(r.name)}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors
            ${selected.includes(r.name) ? 'bg-[#8b5cf6] text-white' : 'bg-[#1a1a1a] text-[#666] hover:bg-[#222]'}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
