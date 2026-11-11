'use client';

import { Formation } from '@/lib/formations';
import { lineRatings, positionLine, type Line } from '@/lib/matchEngine';
import { SquadPick } from '@/lib/simulation';

// Which slots belong to a line, and the line's number, both come from the match
// engine: a winger is in attack because that is where the engine counts him,
// and the number is the line's quality as the engine weighs it, every player
// counting toward it by his position's weight.
const LINES: { key: Line; label: string; color: string }[] = [
  { key: 'gk',  label: 'GK',  color: 'var(--c-yellow)' },
  { key: 'def', label: 'DEF', color: 'var(--c-blue)' },
  { key: 'mid', label: 'MID', color: 'var(--c-accent)' },
  { key: 'att', label: 'ATT', color: 'var(--c-red)' },
];

interface Props {
  formation: Formation;
  picks: SquadPick[];
}

export default function LineRatings({ formation, picks }: Props) {
  return (
    <div className="w-full space-y-2">
      {LINES.map(line => {
        const totalSlots = formation.slots.filter(s => positionLine(s.position) === line.key).length;
        if (totalSlots === 0) return null;

        const linePicks = picks.filter(p => positionLine(p.position) === line.key);
        const filled = linePicks.length;
        const avg = filled === 0 ? null
          : line.key === 'gk' ? linePicks[0].rating
          : Math.round(lineRatings(picks)[line.key]);

        // Bar width: normalised from 60–99 range so differences are visible
        const barPct = avg !== null ? Math.max(0, Math.min(100, ((avg - 60) / 39) * 100)) : 0;

        return (
          <div key={line.key} className="flex items-center gap-3">
            <span className="text-[11px] font-black tracking-widest w-7 flex-shrink-0"
              style={{ color: line.color }}>
              {line.label}
            </span>

            {/* Bar track */}
            <div className="flex-1 h-1.5 bg-raised rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${barPct}%`, background: line.color, opacity: filled === 0 ? 0 : 1 }}
              />
            </div>

            {/* Rating */}
            <span className="text-xs font-black w-6 text-right"
              style={{ color: avg !== null ? line.color : 'var(--t-subtle)' }}>
              {avg ?? '—'}
            </span>

            {/* Fill count */}
            <span className="text-[11px] text-muted w-6 text-right flex-shrink-0">
              {filled}/{totalSlots}
            </span>
          </div>
        );
      })}
    </div>
  );
}
