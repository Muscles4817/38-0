'use client';

import { useMemo } from 'react';
import { useStoredJson } from '@/lib/clientStorage';
import { PLAYSTYLES } from '@/lib/matchEngine';
import { bestRuns, parseRunHistory, RUN_HISTORY_KEY } from '@/lib/runHistory';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * The seasons this browser has played: how many, how many titles, and the
 * best of them. Until this existed a finished run left nothing behind, so
 * there was no record to beat and no reason to come back with a better XI.
 * Renders nothing before the first season.
 */
export default function RunRecordPanel() {
  const stored = useStoredJson<unknown>(RUN_HISTORY_KEY);
  const runs = useMemo(() => parseRunHistory(stored), [stored]);
  if (runs.length === 0) return null;

  const titles = runs.filter(r => r.position === 1).length;
  const best = bestRuns(runs, 3);

  return (
    <section className="bg-card rounded-2xl px-5 py-4" aria-label="Your record">
      <div className="flex items-baseline gap-3 mb-2">
        <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Your record</div>
        <div className="text-[11px] text-muted">
          {runs.length} season{runs.length === 1 ? '' : 's'} · {titles} title{titles === 1 ? '' : 's'}
        </div>
      </div>
      <ol className="space-y-1.5">
        {best.map(run => (
          <li key={`${run.playedAt}-${run.seed}`} className="flex items-baseline gap-3 text-xs">
            <span className={`w-9 shrink-0 font-black ${run.position === 1 ? 'text-accent' : 'text-fg'}`}>
              {ordinal(run.position)}
            </span>
            <span className="w-12 shrink-0 font-bold text-fg">{run.points} pts</span>
            <span className="flex-1 min-w-0 truncate text-muted">
              {PLAYSTYLES[run.style as keyof typeof PLAYSTYLES]?.label ?? run.style} · {run.seasonLabel} · XI {run.overall}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
