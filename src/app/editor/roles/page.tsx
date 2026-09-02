'use client';

import { useState, useEffect } from 'react';

const ALL_POSITIONS = ['GK','CB','LB','RB','LWB','RWB','CDM','CM','LM','RM','CAM','LW','RW','CF','ST'] as const;
type Pos = typeof ALL_POSITIONS[number];

interface RoleRow {
  name: string;
  label: string;
  goal_mult: number;
  assist_mult: number;
  valid_positions: string; // JSON string
  description: string;
  att_contrib: number;
  mid_contrib: number;
  def_contrib: number;
}

interface EditState {
  label: string;
  description: string;
  goal_mult: number;
  assist_mult: number;
  valid_positions: Pos[];
  att_contrib: number;
  mid_contrib: number;
  def_contrib: number;
}

function multColor(v: number) {
  if (v > 1) return 'text-green-400';
  if (v < 1) return 'text-red-400';
  return 'text-[#666]';
}

function multBg(v: number) {
  if (v > 1) return 'border-green-800/40 bg-green-900/10 text-green-400';
  if (v < 1) return 'border-red-900/40 bg-red-900/10 text-red-400';
  return 'border-[#2a2a2a] text-[#666]';
}

export default function RolesPage() {
  const [roles, setRoles]       = useState<RoleRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit]         = useState<EditState | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');

  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [createErr, setCreateErr] = useState('');

  const sortRoles = (rows: RoleRow[]) => [...rows].sort((a, b) => a.label.localeCompare(b.label));

  useEffect(() => {
    fetch('/api/roles').then(r => r.json()).then((rows: RoleRow[]) => setRoles(sortRoles(rows)));
  }, []);

  function selectRole(name: string) {
    const role = roles.find(r => r.name === name);
    if (!role) return;
    setSelected(name);
    setEdit({
      label:           role.label,
      description:     role.description,
      goal_mult:       role.goal_mult,
      assist_mult:     role.assist_mult,
      valid_positions: JSON.parse(role.valid_positions) as Pos[],
      att_contrib:     role.att_contrib,
      mid_contrib:     role.mid_contrib,
      def_contrib:     role.def_contrib,
    });
    setSaveMsg('');
  }

  async function handleCreate() {
    const name  = newName.trim();
    const label = newLabel.trim();
    if (!name || !label)  { setCreateErr('Name and label are required.'); return; }
    if (!/^\w+$/.test(name)) { setCreateErr('Name must be letters/numbers/underscores only.'); return; }
    if (roles.some(r => r.name === name)) { setCreateErr('A role with that name already exists.'); return; }
    setSaving(true);
    setCreateErr('');
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, label }),
      });
      if (!res.ok) {
        const { error } = await res.json() as { error: string };
        setCreateErr(error);
        return;
      }
      const created = await res.json() as RoleRow;
      setRoles(prev => sortRoles([...prev, created]));
      setCreating(false);
      setNewName('');
      setNewLabel('');
      selectRole(created.name);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!selected || !edit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selected, ...edit }),
      });
      if (res.ok) {
        const updated = await res.json() as RoleRow;
        setRoles(prev => sortRoles(prev.map(r => r.name === selected ? updated : r)));
        setSaveMsg('Saved');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  function togglePos(pos: Pos) {
    if (!edit) return;
    setEdit(prev => {
      if (!prev) return null;
      const has = prev.valid_positions.includes(pos);
      return {
        ...prev,
        valid_positions: has
          ? prev.valid_positions.filter(p => p !== pos)
          : [...prev.valid_positions, pos],
      };
    });
  }

  function setMult(field: 'goal_mult' | 'assist_mult', raw: string) {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return;
    setEdit(prev => prev ? { ...prev, [field]: Math.max(0, Math.min(10, v)) } : null);
  }

  function setContrib(field: 'att_contrib' | 'mid_contrib' | 'def_contrib', raw: string) {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return;
    setEdit(prev => prev ? { ...prev, [field]: Math.max(-10, Math.min(10, v)) } : null);
  }

  const selectedRole = roles.find(r => r.name === selected);

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Roles</h1>
          <button
            onClick={() => { setCreating(c => !c); setCreateErr(''); setNewName(''); setNewLabel(''); }}
            className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
              creating
                ? 'bg-[#1a1a1a] text-[#888] border border-[#2a2a2a]'
                : 'bg-[#00c896] text-black hover:bg-[#00b085]'
            }`}
          >
            {creating ? 'Cancel' : '+ New Role'}
          </button>
        </div>
        <p className="text-sm text-[#666]">
          Roles shape how goals and assists are attributed during simulation.
          Multipliers stack with the &quot;suppressors multiply, highest booster wins&quot; rule.
        </p>

        {creating && (
          <div className="mt-4 p-4 bg-[#0d0d0d] border border-[#00c896]/30 rounded-lg space-y-3 max-w-sm">
            <p className="text-xs text-[#888] font-semibold uppercase tracking-wide">New Role</p>
            <div className="space-y-1">
              <label className="text-xs text-[#666]">Identifier <span className="text-[#444]">(no spaces, e.g. MyRole)</span></label>
              <input
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:border-[#00c896]/50"
                placeholder="MyRole"
                value={newName}
                onChange={e => { setNewName(e.target.value); setCreateErr(''); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[#666]">Display Name</label>
              <input
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#00c896]/50"
                placeholder="My Role"
                value={newLabel}
                onChange={e => { setNewLabel(e.target.value); setCreateErr(''); }}
              />
            </div>
            {createErr && <p className="text-xs text-red-400">{createErr}</p>}
            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full py-1.5 bg-[#00c896] text-black font-semibold rounded text-sm hover:bg-[#00b085] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Role'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">

        {/* ── Left: role list ── */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 pb-1 text-xs text-[#555] uppercase tracking-wide">
            <span>Role</span>
            <span className="text-right w-16">Goal ×</span>
            <span className="text-right w-16">Assist ×</span>
            <span className="text-right w-16">Positions</span>
          </div>
          {roles.map(role => {
            const posList = JSON.parse(role.valid_positions) as string[];
            const isActive = selected === role.name;
            return (
              <div
                key={role.name}
                onClick={() => selectRole(role.name)}
                className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-3 py-2 rounded cursor-pointer border transition-colors ${
                  isActive
                    ? 'border-[#00c896]/40 bg-[#00c896]/5'
                    : 'border-transparent hover:border-[#222] hover:bg-[#0d0d0d]'
                }`}
              >
                <div>
                  <span className="text-sm font-medium">{role.label}</span>
                  <span className="ml-2 text-xs text-[#444] font-mono">{role.name}</span>
                </div>
                <span className={`text-xs font-mono w-16 text-right font-semibold ${multColor(role.goal_mult)}`}>
                  {role.goal_mult.toFixed(2)}
                </span>
                <span className={`text-xs font-mono w-16 text-right font-semibold ${multColor(role.assist_mult)}`}>
                  {role.assist_mult.toFixed(2)}
                </span>
                <span className="text-xs text-[#555] w-16 text-right">
                  {posList.length === 0 ? 'any' : posList.length === 1 ? posList[0] : `${posList.length} pos`}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Right: edit panel ── */}
        {edit && selectedRole ? (
          <div className="w-full md:w-[340px] shrink-0 sticky top-4 bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg p-5 space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{edit.label}</div>
                <div className="text-xs text-[#555] font-mono">{selected}</div>
              </div>
              {saveMsg && <span className="text-xs text-[#00c896] font-semibold">{saveMsg}</span>}
            </div>

            {/* Label */}
            <div className="space-y-1">
              <label className="text-xs text-[#666]">Display Name</label>
              <input
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#00c896]/50"
                value={edit.label}
                onChange={e => setEdit(prev => prev ? { ...prev, label: e.target.value } : null)}
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs text-[#666]">Description</label>
              <textarea
                rows={2}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#00c896]/50 resize-none"
                value={edit.description}
                onChange={e => setEdit(prev => prev ? { ...prev, description: e.target.value } : null)}
              />
            </div>

            {/* Goal mult */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#666]">Goal Multiplier</label>
                <span className={`text-sm font-mono font-bold ${multColor(edit.goal_mult)}`}>
                  ×{edit.goal_mult.toFixed(2)}
                </span>
              </div>
              <input
                type="range" min="0" max="5" step="0.05"
                value={edit.goal_mult}
                onChange={e => setMult('goal_mult', e.target.value)}
                className="w-full accent-[#00c896] cursor-pointer"
              />
              <div className="flex gap-2 items-center">
                <input
                  type="number" min="0" max="10" step="0.05"
                  value={edit.goal_mult}
                  onChange={e => setMult('goal_mult', e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-[#00c896]/50"
                />
                <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${multBg(edit.goal_mult)}`}>
                  {edit.goal_mult > 1 ? 'boost' : edit.goal_mult < 1 ? 'suppress' : 'neutral'}
                </span>
              </div>
            </div>

            {/* Assist mult */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#666]">Assist Multiplier</label>
                <span className={`text-sm font-mono font-bold ${multColor(edit.assist_mult)}`}>
                  ×{edit.assist_mult.toFixed(2)}
                </span>
              </div>
              <input
                type="range" min="0" max="5" step="0.05"
                value={edit.assist_mult}
                onChange={e => setMult('assist_mult', e.target.value)}
                className="w-full accent-[#00c896] cursor-pointer"
              />
              <div className="flex gap-2 items-center">
                <input
                  type="number" min="0" max="10" step="0.05"
                  value={edit.assist_mult}
                  onChange={e => setMult('assist_mult', e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-[#00c896]/50"
                />
                <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${multBg(edit.assist_mult)}`}>
                  {edit.assist_mult > 1 ? 'boost' : edit.assist_mult < 1 ? 'suppress' : 'neutral'}
                </span>
              </div>
            </div>

            {/* Valid positions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[#666]">Valid Positions</label>
                <span className="text-xs text-[#555]">
                  {edit.valid_positions.length === 0
                    ? 'unrestricted (any)'
                    : `${edit.valid_positions.length} selected`}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {ALL_POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => togglePos(pos)}
                    className={`py-1 text-xs rounded border transition-colors font-mono ${
                      edit.valid_positions.includes(pos)
                        ? 'border-[#00c896]/60 bg-[#00c896]/10 text-[#00c896]'
                        : 'border-[#2a2a2a] text-[#555] hover:text-[#888] hover:border-[#333]'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#444]">
                Clear all to make this role active at every position.
              </p>
            </div>

            {/* Team strength contributions */}
            <div className="space-y-3 border-t border-[#1a1a1a] pt-4">
              <div>
                <p className="text-xs text-[#666] font-semibold uppercase tracking-wide">Team Strength</p>
                <p className="text-xs text-[#444] mt-0.5">Added on top of the positional average when active.</p>
              </div>
              {([ ['att_contrib', 'Att', 'text-orange-400'], ['mid_contrib', 'Mid', 'text-purple-400'], ['def_contrib', 'Def', 'text-blue-400'] ] as const).map(
                ([field, label, color]) => {
                  const v = edit[field];
                  return (
                    <div key={field} className="flex items-center gap-2">
                      <span className={`text-xs font-mono w-7 shrink-0 ${color}`}>{label}</span>
                      <input
                        type="range" min="-5" max="5" step="0.5"
                        value={v}
                        onChange={e => setContrib(field, e.target.value)}
                        className="flex-1 accent-[#00c896] cursor-pointer"
                      />
                      <input
                        type="number" min="-10" max="10" step="0.5"
                        value={v}
                        onChange={e => setContrib(field, e.target.value)}
                        className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-[#00c896]/50"
                      />
                      <span className={`text-xs font-mono w-10 text-right ${v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-[#444]'}`}>
                        {v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)}
                      </span>
                    </div>
                  );
                }
              )}
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 bg-[#00c896] text-black font-semibold rounded text-sm hover:bg-[#00b085] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div className="w-full md:w-[340px] shrink-0 flex items-center justify-center h-32 border border-[#1a1a1a] rounded-lg text-[#444] text-sm">
            Select a role to edit
          </div>
        )}
      </div>
    </div>
  );
}
