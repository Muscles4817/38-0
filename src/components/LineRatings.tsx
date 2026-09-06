'use client';

import { Formation, Position } from '@/lib/formations';
import { SquadPick } from '@/lib/simulation';

const LINES: { key: string; label: string; positions: Position[]; color: string }[] = [
  { key: 'gk',  label: 'GK',  positions: ['GK'],                                     color: '#f59e0b' },
  { key: 'def', label: 'DEF', positions: ['LB','CB','RB','LWB','RWB'],               color: '#3b82f6' },
  { key: 'mid', label: 'MID', positions: ['CDM','CM','CAM','LM','RM','LW','RW'],     color: '#00c896' },
  { key: 'att', label: 'ATT', positions: ['ST','CF'],                                 color: '#ef4444' },
];

interface Props {
  formation: Formation;
  picks: SquadPick[];
}

export default function LineRatings({ formation, picks }: Props) {
  return (
    <div className="w-full space-y-2">
      {LINES.map(line => {
        const totalSlots = formation.slots.filter(s => line.positions.includes(s.position)).length;
        if (totalSlots === 0) return null;

        const linePicks = picks.filter(p => line.positions.includes(p.position));
        const filled = linePicks.length;
        const avg = filled > 0
          ? Math.round(linePicks.reduce((s, p) => s + p.rating, 0) / filled)
          : null;

        // Bar width: normalised from 60–99 range so differences are visible
        const barPct = avg !== null ? Math.max(0, Math.min(100, ((avg - 60) / 39) * 100)) : 0;

        return (
          <div key={line.key} className="flex items-center gap-3">
            <span className="text-[10px] font-black tracking-widest w-7 flex-shrink-0"
              style={{ color: line.color }}>
              {line.label}
            </span>

            {/* Bar track */}
            <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${barPct}%`, background: line.color, opacity: filled === 0 ? 0 : 1 }}
              />
            </div>

            {/* Rating */}
            <span className="text-xs font-black w-6 text-right"
              style={{ color: avg !== null ? line.color : '#666' }}>
              {avg ?? '—'}
            </span>

            {/* Fill count */}
            <span className="text-[10px] text-[#888] w-6 text-right flex-shrink-0">
              {filled}/{totalSlots}
            </span>
          </div>
        );
      })}
    </div>
  );
}
