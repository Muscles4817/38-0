'use client';

import { useState, useEffect } from 'react';

interface Club { id: number; name: string; short_name: string | null; color: string; }

export default function ClubsEditor() {
  const [clubs, setClubs]     = useState<Club[]>([]);
  const [name, setName]       = useState('');
  const [shortName, setShort] = useState('');
  const [color, setColor]     = useState('#ffffff');
  const [editing, setEditing] = useState<Club | null>(null);
  const [saving, setSaving]   = useState(false);

  async function load() {
    const r = await fetch('/api/clubs');
    setClubs(await r.json());
  }
  useEffect(() => { fetch('/api/clubs').then(r => r.json()).then(setClubs); }, []);

  function startEdit(c: Club) {
    setEditing(c);
    setName(c.name);
    setShort(c.short_name ?? '');
    setColor(c.color);
  }

  function cancelEdit() {
    setEditing(null); setName(''); setShort(''); setColor('#ffffff');
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    if (editing) {
      await fetch(`/api/clubs/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, short_name: shortName, color }),
      });
    } else {
      await fetch('/api/clubs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, short_name: shortName, color }),
      });
    }
    cancelEdit();
    await load();
    setSaving(false);
  }

  async function del(id: number) {
    if (!confirm('Delete this club and all its squad entries?')) return;
    await fetch(`/api/clubs/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-black">Clubs</h1>

      {/* Form */}
      <div className="bg-[#111] rounded-xl p-5 border border-[#1a1a1a] space-y-3">
        <h2 className="font-bold text-sm text-[#888]">{editing ? 'Edit Club' : 'Add Club'}</h2>
        <div className="grid grid-cols-3 gap-3">
          <input
            className="col-span-2 bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm border border-[#2a2a2a] focus:border-[#00c896] outline-none"
            placeholder="Club name (e.g. Manchester United)"
            value={name} onChange={e => setName(e.target.value)}
          />
          <input
            className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm border border-[#2a2a2a] focus:border-[#00c896] outline-none"
            placeholder="Short (e.g. MUN)"
            value={shortName} onChange={e => setShort(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-[#555]">Colour</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
          <span className="text-xs text-[#555]">{color}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={save} disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg bg-[#00c896] text-black text-sm font-bold hover:bg-[#00b385] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : editing ? 'Update' : 'Add Club'}
          </button>
          {editing && (
            <button onClick={cancelEdit} className="px-4 py-2 rounded-lg bg-[#1a1a1a] text-sm hover:bg-[#222] transition-colors">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {clubs.map(c => (
          <div key={c.id} className="flex items-center gap-3 bg-[#111] rounded-xl px-4 py-3 border border-[#1a1a1a]">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
            <span className="font-bold flex-1">{c.name}</span>
            {c.short_name && <span className="text-[#555] text-xs">{c.short_name}</span>}
            <button onClick={() => startEdit(c)} className="text-xs text-[#555] hover:text-[#00c896] transition-colors">Edit</button>
            <button onClick={() => del(c.id)}    className="text-xs text-[#555] hover:text-red-400 transition-colors">Delete</button>
          </div>
        ))}
        {clubs.length === 0 && <div className="text-[#444] text-sm">No clubs yet.</div>}
      </div>
    </div>
  );
}
