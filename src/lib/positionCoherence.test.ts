import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bestFormation, type FittablePlayer } from './lineupFit';
import type { Position } from './formations';
import { checkAssignment } from '../../scripts/lib/positions.mjs';

// Positions are looked up per player, which is far cheaper than per
// club-season — recurrence between seasons is about 70%. But nothing in a
// per-player lookup guarantees a *team* comes out coherent: assign four centre
// backs and no full-backs and every individual answer can be defensible while
// the eleven is impossible.
//
// So the formation matcher is used as the check. If the players who actually
// played the most cannot be arranged into any formation the game knows, the
// assignment is wrong somewhere, and CI says so.

const POSITIONS_DIR = path.join(process.cwd(), 'data', 'raw', 'positions');
const ROSTERS_DIR = path.join(process.cwd(), 'data', 'raw', 'rosters');

interface Assigned {
  fbrefId: string | null;
  name: string;
  fbrefPosition: string | null;
  positions: Position[];
  perSeason?: Record<string, Position[]>;
}

function loadAssignments(): Map<string, Assigned> {
  const byKey = new Map<string, Assigned>();
  if (!fs.existsSync(POSITIONS_DIR)) return byKey;
  for (const file of fs.readdirSync(POSITIONS_DIR).filter(f => /^batch-\d+\.json$/.test(f))) {
    const batch = JSON.parse(fs.readFileSync(path.join(POSITIONS_DIR, file), 'utf8'));
    for (const p of batch.players as Assigned[]) {
      if (Array.isArray(p.positions) && p.positions.length > 0) {
        byKey.set(p.fbrefId ?? p.name, p);
      }
    }
  }
  return byKey;
}

function loadRosters() {
  if (!fs.existsSync(ROSTERS_DIR)) return [];
  return fs.readdirSync(ROSTERS_DIR).flatMap(seasonDir => {
    const dir = path.join(ROSTERS_DIR, seasonDir);
    if (!fs.statSync(dir).isDirectory()) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  });
}

const assignments = loadAssignments();
const rosters = loadRosters();

describe('position assignments', () => {
  it('has a player list to work from', () => {
    expect(rosters.length).toBeGreaterThan(0);
  });

  if (assignments.size === 0) {
    // Nothing looked up yet. Not a failure — this suite starts guarding as
    // soon as the first batch is filled in.
    it.skip('no positions assigned yet', () => {});
  } else {
    it('never contradicts what FBref recorded', () => {
      const problems: string[] = [];
      for (const p of assignments.values()) {
        problems.push(...checkAssignment(p));
      }
      expect(problems).toEqual([]);
    });

    it('lets every club-season field a legal eleven', () => {
      const broken: string[] = [];
      for (const roster of rosters) {
        // The players who actually played, most minutes first.
        const eleven: FittablePlayer[] = roster.squad
          .map((s: { name: string; fbrefId: string | null; minutes: number }) => {
            const a = assignments.get(s.fbrefId ?? s.name);
            if (!a) return null;
            const positions = a.perSeason?.[roster.season] ?? a.positions;
            return { name: s.name, positions, minutes: s.minutes };
          })
          .filter((p: FittablePlayer | null): p is FittablePlayer => p !== null)
          .sort((a: FittablePlayer, b: FittablePlayer) => b.minutes - a.minutes)
          .slice(0, 16);

        // Only judge club-seasons where enough players have been looked up.
        if (eleven.length < 11) continue;

        const fit = bestFormation(eleven);
        if (fit.filled < 11) {
          const shape = eleven.slice(0, 11).map(p => p.positions[0]).sort().join(' ');
          broken.push(
            `${roster.season} ${roster.club}: best fit is ${fit.formation} with only ` +
            `${fit.filled}/11 slots filled — the regulars are ${shape}`
          );
        }
      }
      expect(broken).toEqual([]);
    });

    it('keeps a player consistent across their seasons', () => {
      // A genuine role change is fine, but it must be declared in perSeason
      // rather than left implicit.
      const problems: string[] = [];
      for (const p of assignments.values()) {
        if (!p.perSeason) continue;
        for (const [season, positions] of Object.entries(p.perSeason)) {
          const outside = positions.filter(x => !p.positions.includes(x));
          if (outside.length === 0) {
            problems.push(`${p.name}: perSeason ${season} repeats the default; drop it`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
