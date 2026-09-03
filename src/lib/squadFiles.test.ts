import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain JS helper shared with scripts/import-squads.mjs
import { validateSquadFile, validateAcrossFiles, playerKey } from '../../scripts/lib/squad-file.mjs';

// Guards the committed squad staging files. CI runs this, so a squad that
// breaks the rules in docs/ratings.md cannot reach main.

const SQUADS_DIR = path.join(process.cwd(), 'data', 'squads');

function squadFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return squadFiles(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });
}

const files = squadFiles(SQUADS_DIR);
const parsed = files.map(f => ({
  path: path.relative(process.cwd(), f),
  data: JSON.parse(fs.readFileSync(f, 'utf8')),
}));

describe('squad staging files', () => {
  it('parse as JSON', () => {
    // Reaching here means every file above parsed.
    expect(files.length).toBe(parsed.length);
  });

  if (parsed.length > 0) {
    it.each(parsed.map(p => [p.path, p.data] as const))('%s is valid', (label, data) => {
      const { errors } = validateSquadFile(data, { label });
      expect(errors).toEqual([]);
    });

    it('never puts one player in two clubs in the same season', () => {
      expect(validateAcrossFiles(parsed)).toEqual([]);
    });

    it('cites a source for every squad', () => {
      for (const { path: p, data } of parsed) {
        expect(data.source, `${p} has no source URL`).toMatch(/^https?:\/\//);
      }
    });
  }
});

describe('squad validation rules', () => {
  const ok = {
    club: 'Test FC',
    season: '2024/25',
    source: 'https://example.com/season',
    players: [
      { name: 'A Keeper', nationality: 'England', positions: ['GK'], rating: 80, appearances: 38 },
      ...Array.from({ length: 10 }, (_, i) => ({
        name: `Player ${i}`, nationality: 'England', positions: ['CM'], rating: 78, appearances: 20,
      })),
    ],
  };

  it('accepts a well-formed squad', () => {
    expect(validateSquadFile(ok).errors).toEqual([]);
  });

  it('rejects a squad with no goalkeeper', () => {
    const bad = { ...ok, players: ok.players.filter(p => !p.positions.includes('GK')) };
    expect(validateSquadFile(bad).errors.join(' ')).toMatch(/no goalkeeper/);
  });

  it('rejects an unknown position', () => {
    const bad = { ...ok, players: [{ ...ok.players[1], positions: ['SW'] }, ...ok.players] };
    expect(validateSquadFile(bad).errors.join(' ')).toMatch(/unknown position "SW"/);
  });

  it('rejects a rating outside the scale', () => {
    const bad = { ...ok, players: [{ ...ok.players[1], name: 'Too Good', rating: 120 }, ...ok.players] };
    expect(validateSquadFile(bad).errors.join(' ')).toMatch(/outside 40-99/);
  });

  it('rejects someone who barely played', () => {
    const bad = { ...ok, players: [{ ...ok.players[1], name: 'Cameo', appearances: 1 }, ...ok.players] };
    expect(validateSquadFile(bad).errors.join(' ')).toMatch(/below the 3 needed/);
  });

  it('rejects the same player listed twice', () => {
    const bad = { ...ok, players: [...ok.players, { ...ok.players[1] }] };
    expect(validateSquadFile(bad).errors.join(' ')).toMatch(/listed twice/);
  });

  it('rejects a squad that cannot field a team', () => {
    const bad = { ...ok, players: ok.players.slice(0, 5) };
    expect(validateSquadFile(bad).errors.join(' ')).toMatch(/at least 11/);
  });

  it('requires a source URL', () => {
    const bad = { ...ok, source: 'my memory' };
    expect(validateSquadFile(bad).errors.join(' ')).toMatch(/must be a URL/);
  });

  it('warns when a squad is stacked with world-class players', () => {
    const stacked = {
      ...ok,
      players: ok.players.map((p, i) => (i < 6 ? { ...p, rating: 92 } : p)),
    };
    expect(validateSquadFile(stacked).warnings.join(' ')).toMatch(/90\+/);
  });

  it('catches a player in two clubs in one season', () => {
    const a = { ...ok, club: 'Club A' };
    const b = { ...ok, club: 'Club B' };
    const errors = validateAcrossFiles([{ path: 'a.json', data: a }, { path: 'b.json', data: b }]);
    expect(errors.join(' ')).toMatch(/appears in 2 squads/);
  });
});

describe('player identity', () => {
  it('treats accented and unaccented spellings as the same person', () => {
    expect(playerKey('Pavel Srníček')).toBe(playerKey('Pavel Srnicek'));
    expect(playerKey("Shay O'Neill")).toBe(playerKey('Shay ONeill'));
    expect(playerKey('  Jan  Mucha ')).toBe(playerKey('Ján Mucha'));
  });

  it('keeps genuinely different players apart', () => {
    expect(playerKey('Gary Neville')).not.toBe(playerKey('Phil Neville'));
  });

  it('rejects two spellings of one player across files', () => {
    const base = {
      season: '1996/97', source: 'https://example.com',
      players: [
        { name: 'A Keeper', nationality: 'England', positions: ['GK'], rating: 80, appearances: 38 },
        ...Array.from({ length: 10 }, (_, i) => ({
          name: `Player ${i}`, nationality: 'England', positions: ['CM'], rating: 74, appearances: 20,
        })),
      ],
    };
    const a = { ...base, club: 'Club A', players: [...base.players,
      { name: 'Pavel Srníček', nationality: 'Czech Republic', positions: ['GK'], rating: 74, appearances: 20 }] };
    const b = { ...base, club: 'Club B', season: '1997/98', players: [...base.players,
      { name: 'Pavel Srnicek', nationality: 'Czech Republic', positions: ['GK'], rating: 74, appearances: 20 }] };
    const errors = validateAcrossFiles([{ path: 'a.json', data: a }, { path: 'b.json', data: b }]);
    expect(errors.join(' ')).toMatch(/same player is spelled/);
  });
});
