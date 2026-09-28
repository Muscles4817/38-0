// ── Theme preference ─────────────────────────────────
//
// The palettes themselves live in globals.css. This module only decides which
// one applies, by setting `data-theme` on <html>:
//
//   'system' → no attribute; the prefers-color-scheme media query decides
//   'light'  → data-theme="light"
//   'dark'   → data-theme="dark"
//
// The preference is stored through clientStorage (so as JSON), and the same
// logic runs twice: as THEME_SCRIPT, inline in <head> before first paint so a
// saved choice never flashes the other theme, and as applyTheme() when the
// player changes it.

export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = '38-0-theme';

export const THEME_PREFS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light',  label: 'Light' },
  { value: 'dark',   label: 'Dark' },
];

/** The page ground in each theme, for the browser chrome (theme-color). */
export const THEME_GROUND = { light: '#f3f3f0', dark: '#0a0a0a' } as const;

/**
 * Applies a preference to the document. Written without closures over module
 * state so its source can be inlined into THEME_SCRIPT verbatim.
 */
function apply(pref: string, ground: { light: string; dark: string }): void {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.setAttribute('data-theme', pref);
  else root.removeAttribute('data-theme');

  // The viewport metadata emits one theme-color per colour scheme. An explicit
  // choice overrides the OS, so point every one of them at the chosen ground;
  // 'system' restores each to the ground of the scheme its media query names.
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    const media = meta.getAttribute('media') || '';
    const scheme = pref === 'light' || pref === 'dark'
      ? pref
      : media.indexOf('light') >= 0 ? 'light' : 'dark';
    meta.setAttribute('content', ground[scheme]);
  }
}

export function applyTheme(pref: ThemePref): void {
  apply(pref, THEME_GROUND);
}

/**
 * Runs synchronously in <head>. Anything unexpected (no storage, bad JSON)
 * leaves the attribute off, which means "follow the system".
 */
export const THEME_SCRIPT =
  `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_KEY)})||'"system"');` +
  `(${apply.toString()})(p,${JSON.stringify(THEME_GROUND)})}catch(e){}})()`;
