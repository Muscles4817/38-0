import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_KEY, THEME_SCRIPT } from './theme';

const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');

/** The declarations inside the first `{ … }` after `selector`, whitespace-normalised. */
function block(selector: string): string[] {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const open  = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map(d => d.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

describe('light palette', () => {
  it('is the same whether chosen explicitly or followed from the system', () => {
    expect(block(":root:not([data-theme='dark'])")).toEqual(block(":root[data-theme='light']"));
  });

  it('overrides every token the dark palette defines', () => {
    const names = (decls: string[]) => decls.map(d => d.split(':')[0]).filter(n => n.startsWith('--t-') || n.startsWith('--c-'));
    expect(names(block(":root[data-theme='light']")).sort()).toEqual(names(block(':root {')).sort());
  });
});

describe('THEME_SCRIPT', () => {
  function run(stored: string | null) {
    const attrs = new Map<string, string>();
    const metas = [
      { media: '(prefers-color-scheme: light)', content: '' },
      { media: '(prefers-color-scheme: dark)',  content: '' },
    ].map(m => ({
      ...m,
      getAttribute: (n: string) => (n === 'media' ? m.media : null),
      setAttribute(n: string, v: string) { if (n === 'content') this.content = v; },
    }));
    const document = {
      documentElement: {
        setAttribute: (n: string, v: string) => attrs.set(n, v),
        removeAttribute: (n: string) => attrs.delete(n),
      },
      querySelectorAll: () => metas,
    };
    const localStorage = { getItem: (k: string) => (k === THEME_KEY ? stored : null) };
    new Function('document', 'localStorage', THEME_SCRIPT)(document, localStorage);
    return { theme: attrs.get('data-theme'), metas: metas.map(m => m.content) };
  }

  it('leaves the system in charge when nothing is stored', () => {
    const { theme, metas } = run(null);
    expect(theme).toBeUndefined();
    expect(metas).toEqual(['#f3f3f0', '#0a0a0a']);
  });

  it('applies a stored choice and points the browser chrome at it', () => {
    expect(run('"light"')).toEqual({ theme: 'light', metas: ['#f3f3f0', '#f3f3f0'] });
    expect(run('"dark"')).toEqual({ theme: 'dark', metas: ['#0a0a0a', '#0a0a0a'] });
  });

  it('ignores a stored value it does not recognise', () => {
    expect(run('"sepia"').theme).toBeUndefined();
    expect(run('not json').theme).toBeUndefined();
  });
});
