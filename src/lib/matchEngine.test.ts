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

  it('gets to a ball in behind first, however quick the man chasing it', { timeout: 60_000 }, () => {
    const plain = () => [];
    const swept = conceded('gegenpress', SWEEPING, plain);
    const stays = conceded('gegenpress', STAYS_HOME, plain);
    expect(swept, `${swept} conceded sweeping, ${stays} staying home`).toBeLessThan(stays);
  });
});

describe('movement decides who is on the end of it', () => {
  // docs/movement.md, step 1. Two identical sides; one player on the first
  // carries a movement ability. Measured over 20,000 matches:
  // - box movement (3) on one of two strikers: 30% of his side's goals against
  //   19% for the other, all of it through balls, crosses, headers and
  //   set-piece scrambles; long shots and solo efforts level;
  // - attacking the box (3) on a central midfielder: twice the crosses and
  //   headers of the other, and his side gets slightly more of them;
  // - late runs (3) on a central midfielder: twice the crosses, more of the
  //   set-piece scrambles.
  // Box movement and late runs leave the side's total exactly where it was.
  const QUALITIES = {
    goalMult: {}, assistMult: {},
    qualities: { Box: { boxMovement: 3 }, Crash: { attackingTheBox: 3 }, Late: { lateRuns: 3 } },
  };
  const shape: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];
  const side = (name: string, base: number, roleAt: Record<number, string[]>): TeamSetup => ({
    name, formation: '4-4-2', style: 'balanced', focus: { L: 1, C: 1, R: 1 },
    players: shape.map((position, i) => ({
      playerId: base + i, name: `${name} ${i}`, position, rating: 78, roles: roleAt[i] ?? [],
    })),
  });
  const IN_THE_BOX = new Set(['throughBall', 'cross', 'aerial', 'setPiece']);
  const FROM_HIS_OWN = new Set(['longShot', 'individual']);
  // The same eleven is played more than once across these tests; play it once.
  const played = new Map<string, ReturnType<typeof playGoals>>();
  const goals = (roleAt: Record<number, string[]>) => {
    const key = JSON.stringify(roleAt);
    if (!played.has(key)) played.set(key, playGoals(roleAt));
    return played.get(key)!;
  };
  function playGoals(roleAt: Record<number, string[]>) {
    const rand = rng(9);
    const bySlot = new Map<number, { inBox: number; own: number; crosses: number }>();
    let total = 0, crossesAndHeaders = 0;
    for (let i = 0; i < 4000; i++) {
      for (const e of simulateMatch(side('Us', 100, roleAt), side('Them', 200, {}), rand, QUALITIES).events) {
        if (e.type !== 'goal' || e.team !== 'Us') continue;
        total++;
        if (e.chanceType === 'cross' || e.chanceType === 'aerial') crossesAndHeaders++;
        const s = bySlot.get(e.playerId! - 100) ?? { inBox: 0, own: 0, crosses: 0 };
        if (IN_THE_BOX.has(e.chanceType!)) s.inBox++;
        if (FROM_HIS_OWN.has(e.chanceType!)) s.own++;
        if (e.chanceType === 'cross' || e.chanceType === 'aerial') s.crosses++;
        bySlot.set(e.playerId! - 100, s);
      }
    }
    return { total, crossesAndHeaders, slot: (i: number) => bySlot.get(i) ?? { inBox: 0, own: 0, crosses: 0 } };
  }

  it('puts a striker with box movement on the end of what arrives in the box, and nothing else', { timeout: 60_000 }, () => {
    const g = goals({ 9: ['Box'] });
    const mover = g.slot(9), other = g.slot(10);
    expect(mover.inBox, `in the box ${mover.inBox} against ${other.inBox}`).toBeGreaterThan(other.inBox * 1.4);
    // His long shots and solo efforts are his own, not his movement's.
    expect(Math.abs(mover.own - other.own), `own ${mover.own} against ${other.own}`).toBeLessThan(other.own * 0.2);
  });

  it('decides whose chance it is without adding any', { timeout: 60_000 }, () => {
    expect(goals({ 9: ['Box'] }).total).toBe(goals({}).total);
    expect(goals({ 6: ['Late'] }).total).toBe(goals({}).total);
  });

  it('gets a midfielder who attacks the box onto crosses, and the side more of them', { timeout: 60_000 }, () => {
    const g = goals({ 6: ['Crash'] });
    expect(g.slot(6).crosses).toBeGreaterThan(g.slot(7).crosses * 1.5);
    expect(g.crossesAndHeaders).toBeGreaterThan(goals({}).crossesAndHeaders);
  });

  it('gets a late runner onto the cut-back', { timeout: 60_000 }, () => {
    const g = goals({ 6: ['Late'] });
    expect(g.slot(6).crosses).toBeGreaterThan(g.slot(7).crosses * 1.5);
  });
});

describe('running: in behind and into the channel', () => {
  // docs/movement.md, step 2. Measured over 20,000 matches between identical
  // sides, one striker different:
  // - against a gegenpress line, a striker who plays on the shoulder adds 6.7%
  //   to his side's goals, a quick one 5.2%, one who is both 15.9%;
  // - behind a parked bus, all three under 1.5%.
  // Channel runs (3) on both wide midfielders: crosses 12.7% of the side's
  // goals to 8.9%; through balls and solo efforts up; the wide men's share of
  // the goals 21.5% to 27.3%.
  const QUALITIES = {
    goalMult: {}, assistMult: {},
    qualities: { Shoulder: { runsInBehind: 3 }, Pacey: { pace: 3 }, Channel: { channelRuns: 3 } },
  };
  const shape: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];
  const side = (name: string, base: number, style: PlaystyleName, roleAt: Record<number, string[]>): TeamSetup => ({
    name, formation: '4-4-2', style, focus: { L: 1, C: 1, R: 1 },
    players: shape.map((position, i) => ({
      playerId: base + i, name: `${name} ${i}`, position, rating: 78, roles: roleAt[i] ?? [],
    })),
  });
  // The same matchup is played more than once across these tests; play it once.
  const played = new Map<string, ReturnType<typeof playOnce>>();
  const play = (roleAt: Record<number, string[]>, against: PlaystyleName) => {
    const key = JSON.stringify(roleAt) + against;
    if (!played.has(key)) played.set(key, playOnce(roleAt, against));
    return played.get(key)!;
  };
  function playOnce(roleAt: Record<number, string[]>, against: PlaystyleName, matches = 4000) {
    const rand = rng(9);
    let goals = 0;
    const byType: Record<string, number> = {};
    const throughBallsBy: Record<number, number> = {};
    for (let i = 0; i < matches; i++) {
      for (const e of simulateMatch(side('Us', 100, 'balanced', roleAt), side('Them', 200, against, {}), rand, QUALITIES).events) {
        if (e.type !== 'goal' || e.team !== 'Us') continue;
        goals++;
        byType[e.chanceType!] = (byType[e.chanceType!] ?? 0) + 1;
        if (e.chanceType === 'throughBall') throughBallsBy[e.playerId! - 100] = (throughBallsBy[e.playerId! - 100] ?? 0) + 1;
      }
    }
    return { goals, byType, throughBallsBy };
  }

  it('counts the run and the pace of it together', () => {
    const roles = QUALITIES;
    const xi = (r: string[]) => side('Us', 100, 'balanced', { 9: r }).players;
    const quick = phaseAbility(xi(['Pacey']), 'break', roles);
    expect(phaseAbility(xi(['Shoulder']), 'break', roles)).toBeGreaterThan(phaseAbility(xi([]), 'break', roles));
    expect(phaseAbility(xi(['Pacey', 'Shoulder']), 'break', roles)).toBeGreaterThan(quick);
  });

  it('is worth far more against a high line than against a deep block', { timeout: 60_000 }, () => {
    const gain = (against: PlaystyleName) => play({ 9: ['Shoulder'] }, against).goals - play({}, against).goals;
    const high = gain('gegenpress');
    const deep = gain('parkTheBus');
    expect(high, `${high} more against a high line, ${deep} against a deep block`).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(deep * 3);
  });

  it('puts the runner on the end of the through ball', { timeout: 60_000 }, () => {
    const r = play({ 9: ['Shoulder'] }, 'gegenpress');
    expect(r.throughBallsBy[9] ?? 0).toBeGreaterThan((r.throughBallsBy[10] ?? 0) * 1.3);
  });

  it('turns a wide attack into the channel instead of a cross', { timeout: 60_000 }, () => {
    const plain = play({}, 'balanced');
    const inside = play({ 5: ['Channel'], 8: ['Channel'] }, 'balanced');
    const share = (r: typeof plain, t: string) => (r.byType[t] ?? 0) / r.goals;
    expect(share(inside, 'cross')).toBeLessThan(share(plain, 'cross'));
    expect(share(inside, 'throughBall') + share(inside, 'individual'))
      .toBeGreaterThan(share(plain, 'throughBall') + share(plain, 'individual'));
  });
});
