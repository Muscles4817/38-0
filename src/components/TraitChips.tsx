'use client';

import { useState } from 'react';
import type { TraitShown } from '@/lib/gameData';

/**
 * A player's traits, as small labels.
 *
 * Two forms. Inside a row that is itself a button (a draft pick), the chips
 * are plain labels that take no taps: nothing inert may look interactive, and
 * a tap there picks the player. Elsewhere (`explain`), each chip is a button
 * that opens a line saying what the trait means, at the height every control
 * on a phone needs.
 *
 * A weakness is amber. A trait whose goal and assist weights do not apply in
 * his slot is faint and marked, because its abilities still count: a
 * Trequartista played up front still creates, but is not weighted to score
 * as one.
 */
export default function TraitChips({ traits, explain = false }: {
  traits: TraitShown[];
  /** Chips open an explanation when tapped. */
  explain?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (traits.length === 0) return null;
  const tone = (t: TraitShown) =>
    t.weakness
      ? 'bg-[#f59e0b]/15 text-[var(--c-yellow)]'
      : t.weightsApply
        ? 'bg-[#8b5cf6]/15 text-[var(--c-violet)]'
        : 'bg-raised text-muted';
  const shown = open ? traits.find(t => t.name === open) : null;

  if (!explain) {
    return (
      <span className="flex flex-wrap gap-1 pointer-events-none" aria-label={`Traits: ${traits.map(t => t.label).join(', ')}`}>
        {traits.map(t => (
          <span key={t.name} className={`text-[11px] font-bold leading-none px-1.5 py-1 rounded ${tone(t)}`}>
            {t.label}{t.weightsApply ? '' : ' ·'}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {traits.map(t => (
          <button
            key={t.name}
            type="button"
            aria-expanded={open === t.name}
            onClick={() => setOpen(o => (o === t.name ? null : t.name))}
            className={`min-h-8 px-2.5 rounded-md text-[11px] font-bold touch-manipulation transition-colors
              ${tone(t)} ${open === t.name ? 'ring-1 ring-current' : ''}`}
          >
            {t.label}{t.weightsApply ? '' : ' ·'}
          </button>
        ))}
      </div>
      {shown && (
        <p className="text-xs text-muted mt-1.5 max-w-md">
          <span className="font-bold text-fg">{shown.label}.</span> {shown.description}.
          {!shown.weightsApply && ' In this slot his abilities still count, but the trait does not make him score or assist more.'}
          {shown.weakness && ' A weakness.'}
        </p>
      )}
    </div>
  );
}
