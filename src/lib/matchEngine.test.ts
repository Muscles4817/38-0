import { describe, it, expect } from 'vitest';
import {
  lineRatings, phaseAbility, positionLine, simulateMatch, inferStyle, PLAYSTYLES,
  type TeamSetup, type MatchPlayer, type PlaystyleName,
} from './matchEngine';
import type { Position } from './formations';

/**
 * mulberry32.
 *
 * Not the LCG the old engine used. That one has a modulus of 233,280 and the
 * obvious 32-bit variant overflows JavaScript's safe integer range on the
 * multiply, which returns correlated draws. The first calibration run of this
 * engine reported a home/away goal ratio of 2.19 on identical squads purely
 * because of that, so the generator matters here: a match makes several hundred
 * draws where the old engine made two.
 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHAPE: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];

function team(
  name: string, rating: number, style: PlaystyleName = 'balanced', idBase = 0,
  roles: Record<number, string[]> = {},
): TeamSetup {
  const players: MatchPlayer[] = SHAPE.map((position, i) => ({
    playerId: idBase + i, name: `${name} ${i}`, position, rating, roles: roles[i] ?? [],
  }));
  return { name, players, formation: '4-4-2', style, focus: { L: 1, C: 1, R: 1 } };
}

describe('a match', () => {
  it('is reproducible for a seed, and different for another', () => {
    const h = team('H', 80, 'balanced', 0);
    const a = team('A', 80, 'balanced', 100);
    const one = simulateMatch(h, a, rng(7));
    const two = simulateMatch(h, a, rng(7));
    expect(two.home.goals).toBe(one.home.goals);
    expect(two.away.goals).toBe(one.away.goals);
    expect(two.events).toEqual(one.events);

    // Not an assertion that two seeds differ in score — they can agree — but
    // the whole event list agreeing would mean the seed is ignored.
    const other = simulateMatch(h, a, rng(8));
    expect(JSON.stringify(other.events)).not.toBe(JSON.stringify(one.events));
  });

  it('books goals to the players who scored them', () => {
    const rand = rng(11);
    const h = team('H', 84, 'balanced', 0);
    const a = team('A', 72, 'balanced', 100);
    for (let i = 0; i < 60; i++) {
      const m = simulateMatch(h, a, rand);
      for (const side of [m.home, m.away]) {
        const scored = side.players.reduce((n, p) => n + p.goals, 0);
        expect(scored).toBe(side.goals);
        // A goal cannot be assisted by its own scorer.
        for (const e of m.events.filter(e => e.type === 'goal')) {
          if (e.assistId !== undefined) expect(e.assistId).not.toBe(e.playerId);
        }
        // Nobody is on target more often than they shot.
        for (const p of side.players) expect(p.shotsOnTarget).toBeLessThanOrEqual(p.shots);
      }
    }
  });

  it('reaches wide scorelines without being told to', () => {
    // The point of the rewrite: no floor, no cap, no target. Given enough
    // matches between mismatched sides, football's whole range shows up.
    const rand = rng(2024);
    const strong = team('Strong', 88, 'balanced', 0);
    const weak = team('Weak', 68, 'balanced', 100);
    const seen = new Set<string>();
    let biggest = 0;
    for (let i = 0; i < 4000; i++) {
      const m = simulateMatch(strong, weak, rand);
      seen.add(`${m.home.goals}-${m.away.goals}`);
      biggest = Math.max(biggest, m.home.goals + m.away.goals);
    }
    expect(seen.has('0-0')).toBe(true);
    expect(seen.has('1-0')).toBe(true);
    expect(biggest).toBeGreaterThanOrEqual(7);
    expect(seen.size).toBeGreaterThan(25);
  });

  it('lets the better side win more often than not', () => {
    const rand = rng(99);
    const strong = team('Strong', 87, 'balanced', 0);
    const weak = team('Weak', 71, 'balanced', 100);
    let strongWins = 0, weakWins = 0;
    for (let i = 0; i < 600; i++) {
      const m = simulateMatch(strong, weak, rand);
      if (m.home.goals > m.away.goals) strongWins++;
      else if (m.away.goals > m.home.goals) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2);
    // But not every time. Football is not deterministic and neither is this.
    expect(weakWins).toBeGreaterThan(0);
  });
});

describe('playstyles are trade-offs', () => {
  const run = (styleA: PlaystyleName, styleB: PlaystyleName, n = 400) => {
    const rand = rng(555);
    let aGoals = 0, bGoals = 0, aShots = 0, bShots = 0, aPoss = 0;
    for (let i = 0; i < n; i++) {
      const m = simulateMatch(team('A', 80, styleA, 0), team('B', 80, styleB, 100), rand);
      aGoals += m.home.goals; bGoals += m.away.goals;
      aShots += m.home.shots; bShots += m.away.shots;
      aPoss += m.home.possession;
    }
    return { aGoals: aGoals / n, bGoals: bGoals / n, aShots: aShots / n, bShots: bShots / n, aPoss: aPoss / n };
  };

  it('gives a possession side the ball and a counter side fewer, better chances', () => {
    const poss = run('possession', 'counter');
    expect(poss.aPoss).toBeGreaterThan(60);
    expect(poss.aShots).toBeGreaterThan(poss.bShots);
    // Counter-attacking is paid in quality: fewer shots, more goals per shot.
    expect(poss.bGoals / poss.bShots).toBeGreaterThan(poss.aGoals / poss.aShots);
  });

  it('makes a low block hard to score against', () => {
    const vsLow = run('balanced', 'lowBlock');
    const vsPress = run('balanced', 'highPress');
    expect(vsLow.aGoals).toBeLessThan(vsPress.aGoals);
  });

  it('sends route one to the players who win headers', () => {
    const rand = rng(31);
    // Only the second striker is an aerial threat.
    const withTarget = team('Route', 80, 'routeOne', 0, { 10: ['AerialThreat'] });
    const plain = team('Plain', 80, 'routeOne', 0);
    const opp = team('Opp', 80, 'balanced', 100);
    const share = (t: TeamSetup) => {
      let target = 0, total = 0;
      for (let i = 0; i < 300; i++) {
        const m = simulateMatch(t, opp, rand);
        for (const p of m.home.players) { total += p.goals; if (p.playerId === 10) target += p.goals; }
      }
      return total === 0 ? 0 : target / total;
    };
    expect(share(withTarget)).toBeGreaterThan(share(plain));
  });

  it('describes every style it offers', () => {
    for (const [name, style] of Object.entries(PLAYSTYLES)) {
      expect(style.name).toBe(name);
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.possessionBias).toBeGreaterThan(0);
    }
  });
});

describe('discipline', () => {
  it('never books or sends off a player twice, and a red ends his match', () => {
    const rand = rng(404);
    for (let i = 0; i < 300; i++) {
      const m = simulateMatch(
        team('H', 80, 'highPress', 0), team('A', 80, 'highPress', 100), rand);
      for (const side of [m.home, m.away]) {
        // A player is booked at most once: a second offence is a red, and is
        // counted as one rather than as another yellow.
        expect(side.reds).toBe(side.players.filter(p => p.red).length);
        expect(side.yellows).toBe(side.players.filter(p => p.yellow).length);
        expect(side.fouls).toBe(side.players.reduce((n, p) => n + p.fouls, 0));
      }
      const reds = m.events.filter(e => e.type === 'red');
      const ids = reds.map(e => e.playerId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('takes a sent-off player out of the match: he neither scores nor assists afterwards', { timeout: 60_000 }, () => {
    const rand = rng(405);
    let redCards = 0;
    for (let i = 0; i < 2500; i++) {
      // Strikers who foul a great deal, so that the men most likely to score
      // are also the ones being sent off.
      const rash = { 9: ['Rash'], 10: ['Rash'] };
      const m = simulateMatch(
        team('H', 84, 'parkTheBus', 0, rash), team('A', 84, 'parkTheBus', 100, rash), rand,
        { goalMult: {}, assistMult: {}, qualities: { Rash: { discipline: -4 } } });
      for (const red of m.events.filter(e => e.type === 'red')) {
        redCards++;
        const after = m.events.filter(e => e.type === 'goal' && e.minute > red.minute);
        expect(after.filter(e => e.playerId === red.playerId || e.assistId === red.playerId)).toEqual([]);
      }
    }
    // Otherwise the loop above asserted nothing.
    expect(redCards).toBeGreaterThan(50);
  });
});

describe('inferStyle', () => {
  it('reads route one from two strikers and a target man with nobody creating', () => {
    const players = team('X', 78, 'balanced', 0, { 9: ['TargetMan'] }).players;
    expect(inferStyle(players).style).toBe('routeOne');
  });

  it('reads possession from a side full of creators', () => {
    const players = team('X', 82, 'balanced', 0, {
      6: ['DeepLyingPlaymaker'], 7: ['Regista'],
    }).players;
    expect(inferStyle(players).style).toBe('possession');
  });

  it('always returns usable focus weights', () => {
    const { focus } = inferStyle(team('X', 75).players);
    for (const z of ['L', 'C', 'R'] as const) expect(focus[z]).toBeGreaterThan(0);
  });
});

describe('defending, credited', () => {
  // Two centre-backs identical in everything but rating. The better one should
  // be the one making the tackles and winning the headers — and the defender
  // beaten for a goal should more often be the worse one.
  const back = (id: number, rating: number): MatchPlayer =>
    ({ playerId: id, name: `CB ${rating}`, position: 'CB', rating, roles: [] });
  const shape = (base: number, cbs: [number, number]): MatchPlayer[] => [
    { playerId: base, name: 'GK', position: 'GK', rating: 80 },
    back(base + 1, cbs[0]), back(base + 2, cbs[1]),
    { playerId: base + 3, name: 'LB', position: 'LB', rating: 80 },
    { playerId: base + 4, name: 'RB', position: 'RB', rating: 80 },
    { playerId: base + 5, name: 'CM1', position: 'CM', rating: 80 },
    { playerId: base + 6, name: 'CM2', position: 'CM', rating: 80 },
    { playerId: base + 7, name: 'LM', position: 'LM', rating: 80 },
    { playerId: base + 8, name: 'RM', position: 'RM', rating: 80 },
    { playerId: base + 9, name: 'ST1', position: 'ST', rating: 80 },
    { playerId: base + 10, name: 'ST2', position: 'ST', rating: 80 },
  ];
  const side = (name: string, players: MatchPlayer[]): TeamSetup =>
    ({ name, players, formation: '4-4-2', style: 'balanced', focus: { L: 1, C: 1, R: 1 } });

  it('gives the better defender more of the credit, and less of the blame', () => {
    const home = side('Home', shape(100, [90, 76]));
    const away = side('Away', shape(200, [80, 80]));
    // The file's mulberry32. This used a Park–Miller generator, whose
    // successive draws are correlated (a small one is followed by a small one),
    // over 300 matches: about sixty goals each way, too few to separate two
    // defenders reliably. Over 5,000 the worse one is beaten 1,199 times to
    // the better one's 892.
    const rand = rng(99);
    const good = { acts: 0, beaten: 0 };
    const poor = { acts: 0, beaten: 0 };
    for (let i = 0; i < 1500; i++) {
      const m = simulateMatch(home, away, rand);
      for (const p of m.home.players) {
        const tally = p.playerId === 101 ? good : p.playerId === 102 ? poor : null;
        if (!tally) continue;
        tally.acts += p.tackles + p.interceptions + p.clearances + p.blocks + p.aerialsWon;
        tally.beaten += p.beaten;
      }
    }
    expect(good.acts).toBeGreaterThan(poor.acts);
    expect(good.beaten).toBeLessThan(poor.beaten);
  });
});

describe('on the ball under a press, credited', () => {
  // A side that plays out, against one opponent pressing high and the same
  // opponent sitting deep. Who is in the game, and how often, should follow.
  const eleven = (base: number, rating: number, cbRoles: string[] = []): MatchPlayer[] => [
    { playerId: base, name: 'GK', position: 'GK', rating },
    { playerId: base + 1, name: 'CB1', position: 'CB', rating, roles: cbRoles },
    { playerId: base + 2, name: 'CB2', position: 'CB', rating, roles: cbRoles },
    { playerId: base + 3, name: 'LB', position: 'LB', rating },
    { playerId: base + 4, name: 'RB', position: 'RB', rating },
    { playerId: base + 5, name: 'CDM', position: 'CDM', rating },
    { playerId: base + 6, name: 'CM1', position: 'CM', rating },
    { playerId: base + 7, name: 'CM2', position: 'CM', rating },
    { playerId: base + 8, name: 'LW', position: 'LW', rating },
    { playerId: base + 9, name: 'RW', position: 'RW', rating },
    { playerId: base + 10, name: 'ST', position: 'ST', rating },
  ];
  const side = (name: string, players: MatchPlayer[], style: TeamSetup['style']): TeamSetup =>
    ({ name, players, formation: '4-3-3', style, focus: { L: 1, C: 1, R: 1 } });
  const roles = { goalMult: {}, assistMult: {}, qualities: { Passer: { pressResist: 3 } } };

  function underPress(home: TeamSetup, away: TeamSetup, matches = 200) {
    let seed = 41;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const t = { beaten: 0, lost: 0 };
    for (let i = 0; i < matches; i++) {
      const m = simulateMatch(home, away, rand, roles);
      for (const p of m.home.players) { t.beaten += p.pressBeaten; t.lost += p.lostToPress; }
    }
    return { beaten: t.beaten / matches, lost: t.lost / matches };
  }

  it('puts the build-up players in the game against a high press, and barely against a deep block', () => {
    const me = side('Me', eleven(100, 80), 'possession');
    const vsPress = underPress(me, side('Them', eleven(200, 84), 'gegenpress'));
    const vsBlock = underPress(me, side('Them', eleven(200, 84), 'lowBlock'));
    expect(vsPress.beaten + vsPress.lost).toBeGreaterThan(2 * (vsBlock.beaten + vsBlock.lost));
  });

  it('lets better passers lose the ball less to the same press', () => {
    const press = side('Them', eleven(200, 84), 'gegenpress');
    const plain = underPress(side('Me', eleven(100, 80), 'possession'), press);
    const passers = underPress(side('Me', eleven(100, 80, ['Passer']), 'possession'), press);
    expect(passers.lost).toBeLessThan(plain.lost);
  });

  it('barely presses a side that goes long', () => {
    const press = side('Them', eleven(200, 84), 'gegenpress');
    const long = underPress(side('Me', eleven(100, 80), 'routeOne'), press);
    const short = underPress(side('Me', eleven(100, 80), 'tikiTaka'), press);
    expect(long.beaten + long.lost).toBeLessThan((short.beaten + short.lost) / 3);
  });
});

describe('the lines the screens show', () => {
  it('puts each position in the line the engine counts it in', () => {
    expect(positionLine('GK')).toBe('gk');
    for (const p of ['CB', 'LB', 'RB', 'LWB', 'RWB'] as Position[]) expect(positionLine(p), p).toBe('def');
    for (const p of ['CDM', 'CM', 'CAM', 'LM', 'RM'] as Position[]) expect(positionLine(p), p).toBe('mid');
    for (const p of ['LW', 'RW', 'ST', 'CF'] as Position[]) expect(positionLine(p), p).toBe('att');
  });

  it('reads a side of one rating as that rating in every line', () => {
    const shape: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'LW', 'RW', 'ST'];
    const lines = lineRatings(shape.map(position => ({ position, rating: 83 })));
    expect(lines.att).toBeCloseTo(83, 6);
    expect(lines.mid).toBeCloseTo(83, 6);
    expect(lines.def).toBeCloseTo(83, 6);
  });

  // The rating curve goes out through exp and comes back through log. The two
  // once used different constants (0.032 out, 0.055 back), which pulled every
  // squad 58% of the way toward 80 and made the league close to a coin toss.
  it('preserves the gap between two sides rather than compressing it', () => {
    const of = (rating: number) => SHAPE.map(position => ({ position, rating }));
    for (const line of ['att', 'mid', 'def'] as const) {
      expect(lineRatings(of(77))[line] - lineRatings(of(71))[line]).toBeCloseTo(6, 6);
    }
  });

  it('lets the best players carry a line, so it sits above the plain mean', () => {
    const squad = SHAPE.map((position, i) => ({ position, rating: i >= 9 ? 95 : 75 }));
    expect(lineRatings(squad).att).toBeGreaterThan(75 + (2 * 20) / 11);
  });

  it('lets a better attack raise the attack line most', () => {
    const shape: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'LW', 'RW', 'ST'];
    const lines = lineRatings(shape.map(position => ({ position, rating: ['LW', 'RW', 'ST'].includes(position) ? 90 : 78 })));
    expect(lines.att).toBeGreaterThan(lines.mid);
    expect(lines.mid).toBeGreaterThan(lines.def);
  });
});

describe('who takes part in a phase', () => {
  // The positions you expect are not the only ones that play a phase. A
  // wing-back with nobody ahead of him is his flank's width, and a winger who
  // works back is part of a deep block.
  const QUALITIES = {
    goalMult: {}, assistMult: {},
    qualities: { Pacey: { pace: 3, recovery: 1 }, Workhorse: { pressing: 2 } },
  };
  const xi = (shape: [Position, string[]?][]): MatchPlayer[] =>
    shape.map(([position, roles], i) => ({ playerId: i, name: `P${i}`, position, rating: 78, roles: roles ?? [] }));

  it('counts a wing-back with no winger ahead in the counter', () => {
    // The same pacey wide defender, as a wing-back in a back three with nobody
    // ahead of him, and as a full-back behind a winger.
    const wingBack = xi([['GK'], ['CB'], ['CB'], ['CB'], ['LWB', ['Pacey']], ['CM'], ['CM'], ['CM'], ['RWB'], ['ST'], ['ST']]);
    const fullBack = xi([['GK'], ['CB'], ['CB'], ['RB'], ['LB', ['Pacey']], ['LM'], ['CM'], ['CM'], ['RM'], ['ST'], ['ST']]);
    expect(phaseAbility(wingBack, 'break', QUALITIES)).toBeGreaterThan(phaseAbility(fullBack, 'break', QUALITIES));
  });

  it('counts a winger who works back in the block', () => {
    const shape: [Position, string[]?][] = [['GK'], ['LB'], ['CB'], ['CB'], ['RB'], ['CDM'], ['CM'], ['CM'], ['LW'], ['RW'], ['ST']];
    const diligent = xi(shape.map(([p]) => [p, p === 'LW' || p === 'RW' ? ['Workhorse'] : []]));
    const plain = xi(shape);
    expect(phaseAbility(diligent, 'block', QUALITIES)).toBeGreaterThan(phaseAbility(plain, 'block', QUALITIES));
  });
});

describe('goalkeeping traits', () => {
  // The same keeper, with and without a trait, behind the same side.
  //
  // ShotStopper is positioning and handling: most against shots from
  // distance, least against a one-on-one. Measured over 40,000 matches: long
  // shots −19%, individual efforts −10%, headers −4%, crosses −2.7%, set
  // pieces −2%, through balls −1.2%, penalties unchanged; −5% in all.
  //
  // Reflexes is the save from close range: through balls −8.7%, crosses −8%,
  // headers −7.5%, individual efforts −5%, set pieces −4.6%, long shots −1.2%,
  // penalties unchanged; −5.3% in all.
  //
  // Claiming is coming for the ball in the air: a CommandingKeeper (3) takes
  // crosses −9.4%, headers −8.5%, set pieces −6.7%, −3.3% in all; a keeper who
  // FlapsAtCrosses (−2) turns them into better chances, +6.2%, +4.3%, +4.1%,
  // +1.9% in all (20,000 matches).
  const QUALITIES = {
    goalMult: {}, assistMult: {},
    qualities: {
      ShotStopper: { shotStopping: 3 }, Reflexes: { reflexes: 3 },
      CommandingKeeper: { claiming: 3 }, FlapsAtCrosses: { claiming: -2 },
    },
  };
  const shape: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];
  const side = (name: string, base: number, keeperRoles: string[]): TeamSetup => ({
    name, formation: '4-4-2', style: 'balanced', focus: { L: 1, C: 1, R: 1 },
    players: shape.map((position, i) => ({
      playerId: base + i, name: `${name} ${i}`, position, rating: 78,
      roles: position === 'GK' ? keeperRoles : [],
    })),
  });
  const CLOSE = new Set(['throughBall', 'cross', 'aerial']);
  const IN_THE_AIR = new Set(['cross', 'aerial', 'setPiece']);
  const conceded = (keeperRoles: string[], matches = 3000) => {
    const rand = rng(31);
    let goals = 0, fromDistance = 0, closeIn = 0, inTheAir = 0;
    for (let i = 0; i < matches; i++) {
      const m = simulateMatch(side('Opp', 100, []), side('Us', 200, keeperRoles), rand, QUALITIES);
      goals += m.home.goals;
      for (const e of m.events) {
        if (e.type !== 'goal' || e.team !== 'Opp') continue;
        if (e.chanceType === 'longShot') fromDistance++;
        else if (CLOSE.has(e.chanceType!)) closeIn++;
        if (IN_THE_AIR.has(e.chanceType!)) inTheAir++;
      }
    }
    return { goals, fromDistance, closeIn, inTheAir };
  };

  it('a shot-stopper concedes fewer', () => {
    const plain = conceded([]).goals;
    const stopper = conceded(['ShotStopper']).goals;
    expect(stopper, `${stopper} conceded with the trait, ${plain} without`).toBeLessThan(plain * 0.975);
  });

  it('a keeper with reflexes concedes fewer', () => {
    const plain = conceded([]).goals;
    const quick = conceded(['Reflexes']).goals;
    expect(quick, `${quick} conceded with the trait, ${plain} without`).toBeLessThan(plain * 0.975);
  });

  it('divide the shots between them: distance for one, close range for the other', { timeout: 60_000 }, () => {
    const plain = conceded([], 6000);
    const stopper = conceded(['ShotStopper'], 6000);
    const quick = conceded(['Reflexes'], 6000);
    const detail = `long shots ${plain.fromDistance}/${stopper.fromDistance}/${quick.fromDistance}, `
      + `close in ${plain.closeIn}/${stopper.closeIn}/${quick.closeIn} (plain/ShotStopper/Reflexes)`;
    expect(stopper.fromDistance, detail).toBeLessThan(quick.fromDistance);
    expect(quick.closeIn, detail).toBeLessThan(stopper.closeIn);
  });

  it('a commanding keeper claims the ball in the air, and one who flaps does not', { timeout: 60_000 }, () => {
    const plain = conceded([], 6000);
    const commanding = conceded(['CommandingKeeper'], 6000);
    const flaps = conceded(['FlapsAtCrosses'], 6000);
    const detail = `from the air ${plain.inTheAir}/${commanding.inTheAir}/${flaps.inTheAir} (plain/commanding/flaps)`;
    expect(commanding.inTheAir, detail).toBeLessThan(plain.inTheAir * 0.96);
    expect(flaps.inTheAir, detail).toBeGreaterThan(plain.inTheAir * 1.02);
  });
});

describe('a sweeper keeper', () => {
  // He is the last man behind a high line. He covers the space quick runners
  // go into, and he comes off his line to get to the ball played in behind
  // before whoever is chasing it. So he matters most when his side holds a
  // high line, and little behind a deep block where there is no space behind.
  // Measured over 20,000 matches against a quick counter-attacking side:
  // −10.4% conceded behind a gegenpress line, −4.7% behind a balanced one,
  // −1.6% behind a parked bus; against a possession side with no pace, −5.1%,
  // −2.3% and −0.4%.
  const SWEEPING = { pressResist: 2, claiming: 1, recovery: 3 };
  const STAYS_HOME = { pressResist: 2, claiming: 1 };
  const shape: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];
  const side = (name: string, base: number, style: PlaystyleName, roleOf: (p: Position) => string[]): TeamSetup => ({
    name, formation: '4-4-2', style, focus: { L: 1, C: 1, R: 1 },
    players: shape.map((position, i) => ({
      playerId: base + i, name: `${name} ${i}`, position, rating: 78, roles: roleOf(position),
    })),
  });
  const quick = (p: Position) => ['ST', 'LM', 'RM'].includes(p) ? ['Pacey'] : [];
  const keeper = (p: Position) => p === 'GK' ? ['SweeperKeeper'] : [];
  const conceded = (style: PlaystyleName, sweeper: Partial<Record<string, number>>, attackers = quick) => {
    const roles = {
      goalMult: {}, assistMult: {},
      qualities: { Pacey: { pace: 3, recovery: 1 }, SweeperKeeper: sweeper },
    };
    const rand = rng(17);
    let goals = 0;
    for (let i = 0; i < 4000; i++) {
      goals += simulateMatch(side('Opp', 100, 'counter', attackers), side('Us', 200, style, keeper), rand, roles).home.goals;
    }
    return goals;
  };

  it('counts in covering the space behind', () => {
    const us = side('Us', 200, 'balanced', keeper).players;
    const roles = (q: Partial<Record<string, number>>) => ({ goalMult: {}, assistMult: {}, qualities: { SweeperKeeper: q } });
    expect(phaseAbility(us, 'cover', roles(SWEEPING))).toBeGreaterThan(phaseAbility(us, 'cover', roles(STAYS_HOME)));
  });

  it('saves more behind a high line than behind a deep block', { timeout: 60_000 }, () => {
    const high = conceded('gegenpress', STAYS_HOME) - conceded('gegenpress', SWEEPING);
    const deep = conceded('parkTheBus', STAYS_HOME) - conceded('parkTheBus', SWEEPING);
    expect(high, `saved ${high} behind a high line, ${deep} behind a deep block`).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(deep);
  });

  it('gets to a ball in behind first, however quick the man chasing it', () => {
    const plain = () => [];
    const swept = conceded('gegenpress', SWEEPING, plain);
    const stays = conceded('gegenpress', STAYS_HOME, plain);
    expect(swept, `${swept} conceded sweeping, ${stays} staying home`).toBeLessThan(stays);
  });
});
