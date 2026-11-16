'use client';

import { useMemo, useState } from 'react';
import { FORMATIONS, getFormation } from '@/lib/formations';
import { refitToFormation, swapPlayers } from '@/lib/bench';
import { computeOverall, ratingInSlot, type SquadPick } from '@/lib/simulation';
import { describeTraits, pickTraits } from '@/lib/gameData';
import PositionBadge from '@/components/PositionBadge';
import TraitChips from '@/components/TraitChips';
import { ratingColor } from '@/components/ratingColor';

export interface Lineup {
  formation: string;
  xi: SquadPick[];
  bench: SquadPick[];
}

/**
 * Choose the eleven from the squad, and the shape they play in.
 *
 * Tap a player, then another, to swap them: two starters swap slots, a
 * starter and a sub swap places. Changing the formation lays the current
 * eleven into the new shape (bench.ts, refitToFormation), filling any slot
 * none of them can play from the bench. Each starter shows his rating in his
 * slot, four lower out of position, as the season will play him.
 *
 * Used before kick-off and at half-time; the caller decides what a change
 * means.
 */
export default function LineupEditor({ lineup, onChange, showOverall = true }: {
  lineup: Lineup;
  onChange: (next: Lineup) => void;
  /** Off where the page already shows the XI's overall beside it. */
  showOverall?: boolean;
}) {
  const [held, setHeld] = useState<number | null>(null);
  const formation = getFormation(lineup.formation);
  const overall = computeOverall(lineup.xi);
  // Only shapes this squad can fill with eleven: a formation that needs a
  // third centre-back from a squad with two would leave a slot empty.
  const options = useMemo(
    () => Object.keys(FORMATIONS).filter(f => f === lineup.formation || refitToFormation(f, lineup.xi, lineup.bench).xi.length === 11),
    [lineup],
  );

  function tap(slotIndex: number) {
    if (held === null) { setHeld(slotIndex); return; }
    if (held === slotIndex) { setHeld(null); return; }
    const next = swapPlayers(formation, lineup.xi, lineup.bench, held, slotIndex);
    setHeld(null);
    onChange({ ...lineup, ...next });
  }

  function changeFormation(name: string) {
    setHeld(null);
    onChange({ formation: name, ...refitToFormation(name, lineup.xi, lineup.bench) });
  }

  const row = (p: SquadPick, onBench: boolean) => {
    const selected = held === p.slotIndex;
    const inSlot = ratingInSlot(p);
    const outOfPosition = !onBench && inSlot < p.rating;
    return (
      <li key={p.slotIndex}>
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => tap(p.slotIndex)}
          className={`w-full min-h-11 flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors touch-manipulation
            ${selected ? 'border-[#00c896] bg-[#00c896]/10' : held !== null ? 'border-line-strong hover:border-[#00c896]' : 'border-line hover:border-line-hover'}`}
        >
          <PositionBadge pos={onBench ? p.positions[0] : p.position} size="xs" />
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-sm truncate">{p.playerName}</span>
            <span className="block mt-1"><TraitChips traits={describeTraits(pickTraits(p), onBench ? undefined : p.position)} /></span>
          </span>
          {outOfPosition && <span className="text-[11px] text-muted shrink-0">out of position</span>}
          <span className="font-black text-sm w-6 text-right shrink-0" style={{ color: ratingColor(onBench ? p.rating : inSlot) }}>
            {onBench ? p.rating : inSlot}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="lineup-formation" className="text-[11px] text-muted uppercase tracking-widest font-bold">Formation</label>
        <select
          id="lineup-formation"
          value={lineup.formation}
          onChange={e => changeFormation(e.target.value)}
          className="min-h-9 bg-raised border border-line-strong rounded-lg px-2 text-sm font-bold"
        >
          {options.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {showOverall && (
          <span className="ml-auto text-xs text-muted">
            Overall <span className="font-black text-base" style={{ color: ratingColor(overall) }}>{overall}</span>
          </span>
        )}
      </div>
      <p className="text-xs text-muted">
        {held === null ? 'Tap a player, then another, to swap them.' : 'Now tap who to swap with, or the same player to cancel.'}
      </p>
      <ol className="space-y-1.5" aria-label="Starting eleven">
        {[...lineup.xi].sort((a, b) => b.slotIndex - a.slotIndex).map(p => row(p, false))}
      </ol>
      {lineup.bench.length > 0 && (
        <>
          <div className="text-[11px] text-muted uppercase tracking-widest font-bold pt-1">Bench</div>
          <ol className="space-y-1.5" aria-label="Bench">
            {lineup.bench.map(p => row(p, true))}
          </ol>
        </>
      )}
    </div>
  );
}
