import { describe, expect, it } from 'vitest';
import { bestPossibleXI, type OfferedSquad } from './couldHaveBeen';
import { getFormation, effectiveRating, canFillSlot, type Position } from './formations';
import { gameData, type DataPlayer } from './gameData';
import { mulberry32 } from './matchEngine';

const formation = getFormation('4-4-2');

let nextId = 1;
const player = (name: string, rating: number, positions: Position[], id = nextId++): DataPlayer =>
  ({ playerId: id, name, nationality: 'England', rating, positions, roles: [] }) as DataPlayer;
const squad = (clubName: string, players: DataPlayer[]): OfferedSquad => ({ clubName, seasonLabel: '2003/04', players });

/** An ordinary squad: one of everything, all rated `r`. */
const ordinary = (club: string, r: number) => squad(club,
  (['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'ST', 'ST'] as Position[]).map((pos, i) => player(`${club} ${i}`, r, [pos])));

const total = (xi: { rating: number; positions: Position[]; position: Position }[]) =>
  xi.reduce((s, p) => s + effectiveRating(p.rating, p.positions, p.position), 0);

describe('what could have been', () => {
  it('takes one player from a pick, however good the rest of that squad is', () => {
    const stars = squad('Stars', [player('A', 95, ['ST']), player('B', 95, ['ST']), player('C', 95, ['CM'])]);
    const picks = [[stars], ...Array.from({ length: 10 }, (_, i) => [ordinary(`O${i}`, 70)])];
    const xi = bestPossibleXI(formation, picks);
    expect(xi.filter(p => p.clubName === 'Stars')).toHaveLength(1);
    expect(xi).toHaveLength(11);
  });

  it('treats a spin and the squads its rerolls moved away from as one pick', () => {
    const landed = squad('Landed', [player('L', 90, ['ST'])]);
    const rerolled = squad('Rerolled', [player('R', 92, ['ST'])]);
    const picks = [[rerolled, landed], ...Array.from({ length: 10 }, (_, i) => [ordinary(`O${i}`, 70)])];
    const fromThatPick = bestPossibleXI(formation, picks).filter(p => p.clubName === 'Landed' || p.clubName === 'Rerolled');
    expect(fromThatPick).toHaveLength(1);
    expect(fromThatPick[0].playerName).toBe('R');
  });

  it('uses a player offered at two picks only once', () => {
    const henry = player('Henry', 97, ['ST'], 9001);
    const picks = [[squad('Arsenal', [henry])], [squad('Arsenal', [{ ...henry, rating: 92 }])],
      ...Array.from({ length: 9 }, (_, i) => [ordinary(`O${i}`, 70)])];
    const xi = bestPossibleXI(formation, picks);
    expect(xi.filter(p => p.playerId === 9001)).toHaveLength(1);
    expect(xi.find(p => p.playerId === 9001)?.rating).toBe(97);
  });

  it('never comes out below the XI the draft actually made', () => {
    // Random drafts from the real data: eleven spins, and from each a random
    // player who fits an open slot. That XI is one the draft could have made,
    // so the best one is at least as good.
    const squads = gameData.squads.filter(s => s.players.length >= 11);
    for (let seed = 1; seed <= 25; seed++) {
      const rand = mulberry32(seed);
      const picks: OfferedSquad[][] = [];
      const open = new Set(formation.slots.map((_, i) => i));
      const drafted: { rating: number; positions: Position[]; position: Position }[] = [];
      const taken = new Set<number>();
      while (open.size > 0) {
        const s = squads[Math.floor(rand() * squads.length)];
        const offered = squad(`${s.clubId}`, s.players);
        picks.push([offered]);
        // As the draft does: no player twice.
        const choices = s.players.filter(p => !taken.has(p.playerId)).flatMap(p => [...open]
          .filter(i => canFillSlot(p.positions, formation.slots[i].position))
          .map(i => ({ p, i })));
        if (choices.length === 0) continue;
        const { p, i } = choices[Math.floor(rand() * choices.length)];
        open.delete(i);
        taken.add(p.playerId);
        drafted.push({ rating: p.rating, positions: p.positions as Position[], position: formation.slots[i].position });
      }
      const best = bestPossibleXI(formation, picks);
      expect(best).toHaveLength(11);
      expect(total(best)).toBeGreaterThanOrEqual(total(drafted));
    }
  });
});
