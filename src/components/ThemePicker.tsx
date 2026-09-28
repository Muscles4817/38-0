'use client';

import { useEffect } from 'react';
import { useStoredJson, writeStored } from '@/lib/clientStorage';
import { applyTheme, THEME_KEY, THEME_PREFS, type ThemePref } from '@/lib/theme';

/**
 * Auto / Light / Dark. Auto follows the phone or computer's own setting and is
 * what a player gets until they choose.
 */
export default function ThemePicker() {
  const stored = useStoredJson<ThemePref>(THEME_KEY);
  const pref = stored ?? 'system';

  // Picks up a choice made in another tab. Nothing is applied while the value
  // is still unread (null), so the theme the head script set is left alone.
  useEffect(() => {
    if (stored !== null) applyTheme(stored);
  }, [stored]);

  function choose(next: ThemePref) {
    writeStored(THEME_KEY, next);
    applyTheme(next);
  }

  return (
    <div role="group" aria-label="Theme" className="inline-flex rounded-lg border border-line p-0.5">
      {THEME_PREFS.map(option => {
        const selected = option.value === pref;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => choose(option.value)}
            className={`px-3.5 py-2.5 rounded-md text-xs font-bold transition-colors touch-manipulation
              ${selected ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
