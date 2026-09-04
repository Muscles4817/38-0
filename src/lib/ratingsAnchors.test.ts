// The anchors in docs/ratings.md must be true.
//
// Every rating agent calibrates against that table. An anchor that disagrees
// with the data does not just fail to help — it actively drags every judgement
// made against it, and nothing else in the pipeline can detect that, because
// the resulting ratings are internally consistent with each other.
//
// This is not hypothetical. Two goalkeeper anchors were wrong for a whole
// batch run: Gunn was quoted at 76 against a recorded 73, and Flowers was
// attributed to 1994/95, a season that had never been rated at all. Mid-tier
// keepers were being pulled up by it, and it was caught by an agent noticing
// the discrepancy rather than by anything here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC = path.join(ROOT, 'docs', 'ratings.md');
const RATINGS_DIR = path.join(ROOT, 'data', 'raw', 'ratings');

interface Anchor {
  name: string;
  season: string;
  rating: number;
}

/** Rows of the form: | Player Name, 1993/94 | 84 | Why | */
function anchorsFromDoc(): Anchor[] {
  const rows = fs.readFileSync(DOC, 'utf8').split('\n');
  const out: Anchor[] = [];
  for (const line of rows) {
    const m = /^\|\s*([^|,]+?),\s*((?:19|20)\d{2}\/\d{2})\s*\|\s*(\d{2})\s*\|/.exec(line);
    if (m) out.push({ name: m[1].trim(), season: m[2], rating: Number(m[3]) });
  }
  return out;
}

/** Every rating recorded for a player-season, keyed "name|season". */
function recordedRatings(): Map<string, number[]> {
  const found = new Map<string, number[]>();
  if (!fs.existsSync(RATINGS_DIR)) return found;
  for (const file of fs.readdirSync(RATINGS_DIR).filter(f => /^batch-\d+\.json$/.test(f))) {
    let batch: { players?: { name: string; seasons?: { season: string; rating: number | null }[] }[] };
    try {
      batch = JSON.parse(fs.readFileSync(path.join(RATINGS_DIR, file), 'utf8'));
    } catch {
      // A batch being written by an agent right now is not this test's problem.
      continue;
    }
    for (const p of batch.players ?? []) {
      for (const s of p.seasons ?? []) {
        if (typeof s.rating !== 'number') continue;
        const key = `${p.name}|${s.season}`;
        if (!found.has(key)) found.set(key, []);
        found.get(key)!.push(s.rating);
      }
    }
  }
  return found;
}

const anchors = anchorsFromDoc();
const recorded = recordedRatings();

describe('the anchors in docs/ratings.md', () => {
  it('are actually parsed out of the document', () => {
    // Guards against the table being reformatted into invisibility, which would
    // make every assertion below vacuously pass.
    expect(anchors.length).toBeGreaterThanOrEqual(10);
    expect(anchors.some(a => a.name === 'Peter Schmeichel')).toBe(true);
  });

  it('agree with the ratings actually recorded', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const a of anchors) {
      const got = recorded.get(`${a.name}|${a.season}`);
      // An anchor may legitimately name a season not yet collected — De Bruyne
      // 2019/20 is a scale reference, not a row in the data. Only rows that
      // exist are checked.
      if (!got || got.length === 0) continue;
      checked++;
      const distinct = [...new Set(got)];
      if (distinct.length !== 1 || distinct[0] !== a.rating) {
        wrong.push(
          `${a.name} ${a.season}: the doc says ${a.rating}, the data says ` +
          `${distinct.join(' and ')}`
        );
      }
    }
    expect(checked, 'no anchor matched any rated player-season').toBeGreaterThan(0);
    expect(wrong, wrong.join('\n')).toEqual([]);
  });

  it('name a season in the form the data uses', () => {
    for (const a of anchors) expect(a.season).toMatch(/^(19|20)\d{2}\/\d{2}$/);
  });
});
