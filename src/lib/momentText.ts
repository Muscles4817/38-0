// ── How a moment is said ─────────────────────────────────
//
// keyMoments decides what happened; this decides how to say it. Every kind of
// moment has several ways of being said, and a goal is said for how it came
// and who scored it: a long-range specialist's winner from distance is a
// thunderbolt, a poacher's is a tap-in, a target man's is a header, a
// centre-back's is a surprise.
//
// The choice is a hash of the moment (its kind, week and player), not a
// random draw, so the same season reads the same in the live view and the
// final report, and on every render.

import type { Position } from './formations';
import type { ChanceType } from './matchEngine';

/** What the moments know about one of the XI's players. */
export interface PlayerNote {
  position?: Position;
  traits: readonly string[];
}

/** FNV-1a: a stable index for a key. */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One of the options, the same one every time for the same key. */
export function choose<T>(key: string, options: readonly T[]): T {
  return options[hash(key) % options.length];
}

const has = (p: PlayerNote | undefined, ...traits: string[]) => !!p && traits.some(t => p.traits.includes(t));
const isDefender = (p: PlayerNote | undefined) => !!p?.position && ['CB', 'LB', 'RB', 'LWB', 'RWB', 'GK'].includes(p.position);
const isCentreBack = (p: PlayerNote | undefined) => p?.position === 'CB';

// ── How a goal came ──────────────────────────────────────

export type GoalStyle =
  | 'screamer' | 'free-kick' | 'set-piece-header' | 'header' | 'poacher'
  | 'solo' | 'breakaway' | 'penalty' | 'cross' | 'through' | 'scramble';

/**
 * The kind of goal it reads as: the engine's kind of chance, coloured by who
 * took it. A cross met by a target man is a header; the same cross met by a
 * poacher is a finish from six yards.
 */
export function goalStyle(chance: ChanceType | undefined, scorer?: PlayerNote): GoalStyle {
  switch (chance) {
    case 'penalty': return 'penalty';
    case 'longShot': return 'screamer';
    case 'setPiece':
      if (has(scorer, 'SetPieceDeliverer') && !isDefender(scorer)) return 'free-kick';
      if (has(scorer, 'AerialThreat', 'TargetMan') || isCentreBack(scorer)) return 'set-piece-header';
      return 'scramble';
    case 'aerial': return 'header';
    case 'cross':
      if (has(scorer, 'TargetMan', 'AerialThreat')) return 'header';
      if (has(scorer, 'Poacher')) return 'poacher';
      return 'cross';
    case 'throughBall':
      if (has(scorer, 'Pacey', 'InsideForward')) return 'breakaway';
      if (has(scorer, 'Poacher')) return 'poacher';
      return 'through';
    case 'individual':
      if (has(scorer, 'Dribbler', 'Carrier', 'Winger', 'InsideForward')) return 'solo';
      if (has(scorer, 'Poacher')) return 'poacher';
      return 'scramble';
    default: return 'scramble';
  }
}

/**
 * The goal as a noun phrase: "a 30-yard thunderbolt", "a header from Beckham's
 * corner". The assist is named where it is part of the story.
 */
export function goalHow(style: GoalStyle, key: string, assist?: string, assister?: PlayerNote): string {
  const from = assist ? lastName(assist) : undefined;
  if (from && (style === 'header' || style === 'set-piece-header' || style === 'cross')) {
    const delivery = style === 'set-piece-header' ? 'corner' : 'cross';
    if (has(assister, 'CrossingSpecialist', 'SetPieceDeliverer') || style === 'set-piece-header') {
      return choose(key + 'a', style === 'cross'
        ? [`a first-time finish from ${from}'s ${delivery}`, `a finish at the far post from ${from}'s ${delivery}`]
        : [`a header from ${from}'s ${delivery}`, `a thumping header from ${from}'s ${delivery}`, `a glancing header from ${from}'s ${delivery}`]);
    }
  }
  if (from && (style === 'breakaway' || style === 'through') && has(assister, 'ChanceCreator', 'DeepLyingPlaymaker', 'Regista', 'Trequartista')) {
    return choose(key + 'a', [`a finish from ${from}'s defence-splitting pass`, `a cool finish after ${from}'s through ball`, `a run onto ${from}'s pass and a finish`]);
  }
  return choose(key, HOW[style]);
}

const HOW: Record<GoalStyle, readonly string[]> = {
  screamer: ['a 30-yard thunderbolt', 'a rocket from outside the box', 'a curler into the top corner', 'a dipping volley from distance', 'a strike from 25 yards that never stopped rising'],
  'free-kick': ['a free kick over the wall', 'a free kick into the top corner', 'a whipped free kick that beat everyone'],
  'set-piece-header': ['a header from a corner', 'a towering header at a set piece', 'a header at the near post from a corner'],
  header: ['a towering header', 'a bullet header', 'a diving header', 'a header into the corner'],
  poacher: ['a tap-in from six yards', 'a close-range finish', 'a finish from two yards out', 'a poacher\'s finish', 'a toe-poke in the six-yard box'],
  solo: ['a solo run and finish', 'a run past three defenders and a finish', 'a mazy dribble and a cool finish'],
  breakaway: ['a breakaway finish', 'a sprint clear of the defence and a finish', 'a one-on-one finish after a run in behind'],
  penalty: ['a penalty', 'a penalty into the corner', 'a spot kick sent down the middle'],
  cross: ['a finish from a cross', 'a sidefooted finish from a cutback', 'a volley from a cross'],
  through: ['a finish from a through ball', 'a low finish across the keeper', 'a cool finish one-on-one'],
  scramble: ['a scrappy finish', 'a finish through a crowd of bodies', 'a deflected effort', 'a shot that squirmed in'],
};

function lastName(name: string): string {
  return name.split(' ').pop() ?? name;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

// ── Goals that decided a match ───────────────────────────

/** Everything a goal line can use. */
export interface GoalLine {
  name: string;
  opp: string;
  minute: number;
  chance?: ChanceType;
  scorer?: PlayerNote;
  assist?: string;
  assister?: PlayerNote;
  /** The score after it, the XI's goals first. */
  score?: string;
}

type Template = (g: GoalLine & { how: string; style: GoalStyle; m: string; o: string }) => string;

function goalLine(kind: string, week: number, g: GoalLine, pools: Partial<Record<GoalStyle | 'defender' | 'any', readonly Template[]>>): string {
  const key = `${kind}|${week}|${g.name}`;
  const style = goalStyle(g.chance, g.scorer);
  const how = goalHow(style, key + 'h', g.assist, g.assister);
  const ctx = { ...g, how, style, m: `${g.minute}′`, o: ordinal(g.minute) };
  // A defender's goal is a story in itself; then the kind of goal, if there
  // are lines for it; then the lines that fit any goal.
  const options = [
    ...(isDefender(g.scorer) && pools.defender ? pools.defender : []),
    ...(pools[style] ?? []),
  ];
  const pool = options.length > 0 && hash(key + 'p') % 4 !== 0 ? options : [...options, ...(pools.any ?? [])];
  return choose(key, pool.length > 0 ? pool : pools.any ?? [() => g.name])(ctx);
}

export function lateWinnerText(week: number, g: GoalLine): string {
  return goalLine('late-winner', week, g, {
    screamer: [
      c => `${c.name} lets fly from 30 yards in the ${c.o} minute, and ${c.opp} are beaten`,
      c => `${c.m}: ${c.name} picks out the top corner from distance. ${c.opp} have nothing left`,
      c => `Nobody closes ${c.name} down, so he shoots. ${c.m}, top corner, ${c.opp} beaten`,
    ],
    'free-kick': [
      c => `${c.name} bends a ${c.o}-minute free kick over the wall to beat ${c.opp}`,
      c => `A free kick, ${c.name}, the ${c.o} minute. ${c.opp} beaten by a dead ball`,
    ],
    'set-piece-header': [
      c => `${c.name} attacks a ${c.o}-minute corner and heads the winner against ${c.opp}`,
      c => `Last corner, last chance: ${c.name} heads home against ${c.opp}, ${c.m}`,
    ],
    header: [
      c => `${c.name} rises highest in the ${c.o} minute to beat ${c.opp}`,
      c => `${capitalise(c.how)} from ${c.name} wins it against ${c.opp}, ${c.m}`,
    ],
    poacher: [
      c => `${c.name}, six yards out, ${c.o} minute. Where else would he be? ${c.opp} beaten`,
      c => `Right place, right time: ${c.name} wins it against ${c.opp}, ${c.m}`,
      c => `The ball drops in the box in the ${c.o} minute and ${c.name} is the first to it. ${c.opp} beaten`,
    ],
    solo: [
      c => `${c.name} takes it on himself in the ${c.o} minute, beats his man and wins it against ${c.opp}`,
    ],
    breakaway: [
      c => `${c.name} is gone in the ${c.o} minute, clean through, and ${c.opp} are beaten`,
    ],
    penalty: [
      c => `${c.name} holds his nerve from the spot in the ${c.o} minute to beat ${c.opp}`,
      c => `A ${c.o}-minute penalty, and ${c.name} does not miss. ${c.opp} beaten`,
    ],
    defender: [
      c => `${c.name}, of all people, wins it against ${c.opp} in the ${c.o} minute`,
      c => `Up from the back, ${c.name} heads for the box in the ${c.o} minute and wins it against ${c.opp}`,
      c => `The centre-forward's job, done by ${c.name}: a ${c.o}-minute winner against ${c.opp}`,
    ],
    any: [
      c => `${c.name} wins it in the ${c.o} minute against ${c.opp}`,
      c => `${c.m}: ${c.name} breaks ${c.opp} hearts`,
      c => `${c.opp} hold out until the ${c.o} minute, then ${c.name} strikes`,
      c => `${c.name} has the last word against ${c.opp}, ${c.m}`,
      c => `${capitalise(c.how)} from ${c.name} in the ${c.o} minute sinks ${c.opp}`,
    ],
  });
}

export function lateEqualiserText(week: number, g: GoalLine): string {
  return goalLine('late-equaliser', week, g, {
    screamer: [c => `${c.name} rescues a point against ${c.opp} with ${c.how}, ${c.m}`],
    poacher: [c => `${c.name} pounces in the ${c.o} minute to rescue a point against ${c.opp}`],
    header: [c => `${c.name} heads a ${c.o}-minute equaliser against ${c.opp}`],
    penalty: [c => `${c.name} levels from the spot against ${c.opp} in the ${c.o} minute`],
    defender: [c => `${c.name} goes up front and gets the ${c.o}-minute equaliser against ${c.opp}`],
    any: [
      c => `${c.name} rescues a point against ${c.opp} in the ${c.o} minute`,
      c => `${c.m}: ${c.name} levels against ${c.opp}, and a defeat becomes a draw`,
      c => `${c.opp} thought they had it. ${c.name}, ${c.m}, thought otherwise`,
    ],
  });
}

export function lateDefeatText(week: number, g: GoalLine): string {
  return goalLine('late-defeat', week, g, {
    screamer: [c => `${c.name} wins it for ${c.opp} with ${c.how} in the ${c.o} minute`],
    penalty: [c => `${c.opp} win it from the spot in the ${c.o} minute through ${c.name}`],
    header: [c => `${c.name} heads a ${c.o}-minute winner for ${c.opp}`],
    any: [
      c => `${c.name} wins it late for ${c.opp}, ${c.m}`,
      c => `Undone in the ${c.o} minute: ${c.name} wins it for ${c.opp}`,
      c => `${c.opp} steal it at the death through ${c.name}, ${c.m}`,
    ],
  });
}

export function lateEqualiserAgainstText(week: number, g: GoalLine): string {
  return goalLine('late-equaliser-against', week, g, {
    screamer: [c => `${c.opp} snatch a point with ${c.how} from ${c.name}, ${c.m}`],
    penalty: [c => `${c.opp} level from the spot through ${c.name} in the ${c.o} minute`],
    any: [
      c => `${c.opp} snatch a late equaliser through ${c.name}, ${c.m}`,
      c => `Two points thrown away: ${c.name} levels for ${c.opp} in the ${c.o} minute`,
      c => `${c.name}, ${c.m}, and the win against ${c.opp} is gone`,
    ],
  });
}

/** A goal from distance that decided a match, said for itself. */
export function screamerText(week: number, g: GoalLine): string {
  return goalLine('screamer', week, g, {
    screamer: [
      c => `${c.name} beats ${c.opp} with a 30-yard thunderbolt`,
      c => `${c.name} from distance, and the net is still shaking. ${c.opp} beaten`,
      c => `Give ${c.name} a yard and this happens: top corner from 25 yards against ${c.opp}`,
      c => `${c.name} picks his spot from outside the box. ${c.opp} undone, ${c.score}`,
      c => `${c.opp} let ${c.name} shoot from distance. They will not do that again`,
    ],
  });
}

// ── A defender's only goal ───────────────────────────────

export function onlyGoalText(week: number, name: string, opp: string, decisive: boolean, chance?: ChanceType, note?: PlayerNote): string {
  const key = `only-goal|${week}|${name}`;
  const how = goalHow(goalStyle(chance, note), key + 'h');
  const lines: readonly string[] = decisive
    ? [
      `${name}'s one goal of the season, and it beat ${opp}`,
      `${name} scores once all season. It was the winner against ${opp}`,
      `${name} saves his goal of the season for when it matters: the winner against ${opp}`,
      `One goal all year from ${name}, ${how} against ${opp}, and it won the match`,
    ]
    : [
      `${name} scores! Against ${opp}. Enjoy it, it is the only one`,
      `A collector's item: ${name}'s only goal of the season, against ${opp}`,
      `${name} finds the net against ${opp}, for the first and last time this season`,
      `${capitalise(how)} from ${name} against ${opp}: his one goal of the year, framed`,
      `${name} gets his goal against ${opp}. The celebration suggested he knew it was his only one`,
    ];
  return choose(key, lines);
}

// ── Players, and the season around them ──────────────────

export function hatTrickText(week: number, name: string, opp: string, goals: number, note?: PlayerNote): string {
  const key = `hat-trick|${week}|${name}`;
  const what = goals === 3 ? 'hat-trick' : `${numberWord(goals)} goals`;
  const lines: string[] = [
    `${capitalise(what)} for ${name} against ${opp}`,
    `${name} takes the match ball home: ${what} against ${opp}`,
    `${opp} could not lay a glove on ${name}: ${what}`,
  ];
  if (has(note, 'Poacher')) lines.push(`A poacher's ${what}: ${name} lives in the six-yard box against ${opp}`, `${name} never left the box against ${opp} and did not need to: ${what}`);
  if (has(note, 'LongShot')) lines.push(`${name} against ${opp}: ${what}, and the keeper never got near any of them`);
  if (has(note, 'TargetMan', 'AerialThreat')) lines.push(`${opp} could not handle ${name} in the air: ${what}`);
  if (has(note, 'Pacey')) lines.push(`${opp} played a high line against ${name}. ${capitalise(what)}`);
  if (isDefender(note)) lines.push(`A ${what} for ${name}. A defender. Against ${opp}. Really`);
  return choose(key, lines);
}

export function hatTrickAgainstText(week: number, name: string, opp: string, goals: number): string {
  const what = goals === 3 ? 'hat-trick' : `${numberWord(goals)} goals`;
  return choose(`hat-trick-against|${week}|${name}`, [
    `${capitalise(what)} for ${opp}'s ${name}`,
    `${name} runs riot for ${opp}: ${what}`,
    `Nobody could pick up ${opp}'s ${name}, and he scored ${goals === 3 ? 'three' : numberWord(goals)}`,
  ]);
}

export function redCardText(week: number, name: string, opp: string, minute: number, note?: PlayerNote): string {
  const m = `${minute}′`;
  const lines = [
    `${name} sent off against ${opp}, ${m}`,
    `${name} sees red against ${opp}, ${m}`,
    `Down to ten: ${name} sent off against ${opp} in the ${ordinal(minute)} minute`,
  ];
  if (has(note, 'RashInTheTackle')) lines.push(`${name} flies in once too often against ${opp}: red card, ${m}`, `Nobody who has watched ${name} was surprised: sent off against ${opp}, ${m}`);
  if (has(note, 'Enforcer')) lines.push(`${name} sets the tone against ${opp}, and the referee sets him off: red card, ${m}`);
  if (note?.position === 'GK') lines.push(`${name}, the keeper, sent off against ${opp}, ${m}`);
  return choose(`red-card|${week}|${name}`, lines);
}

export function suspensionText(week: number, name: string, matches: string, note?: PlayerNote): string {
  const lines = [
    `${name} booked again: suspended for ${matches}`,
    `One yellow too many for ${name}: out for ${matches}`,
    `${name}'s card count catches up with him: banned for ${matches}`,
  ];
  if (has(note, 'RashInTheTackle', 'Enforcer')) lines.push(`${name} has been flirting with a ban all season, and now it is here. Out for ${matches}`);
  return choose(`suspension|${week}|${name}`, lines);
}

export function goalMilestoneText(week: number, name: string, n: number, opp: string, note?: PlayerNote): string {
  const lines = [
    `${name} reaches ${n} league goals`,
    `Number ${n} of the season for ${name}, against ${opp}`,
    `${name} brings up ${n} for the season`,
  ];
  if (n >= 20) lines.push(`${n} and counting: ${name} is having a season`, `${name}'s ${ordinal(n)} of the season, and the Golden Boot looks his`);
  if (n >= 30) lines.push(`${n} league goals for ${name}. Thirty. In a season`);
  if (has(note, 'Poacher')) lines.push(`${name}'s ${ordinal(n)} of the season. None of them from outside the box, probably`);
  if (has(note, 'LongShot') && n >= 10) lines.push(`${name} reaches ${n} for the season, and keepers have stopped standing on their line`);
  if (isDefender(note)) lines.push(`${n} league goals for ${name}, a defender. Strikers, take note`);
  return choose(`goal-milestone|${week}|${name}|${n}`, lines);
}

export function droughtOverText(week: number, name: string, games: number, opp: string, first: boolean): string {
  return choose(`drought-over|${week}|${name}`, first
    ? [
      `${name} is finally off the mark, at the ${ordinal(games + 1)} attempt, against ${opp}`,
      `${games} games without a goal, then ${name} scores against ${opp}. The relief`,
      `${name}'s first of the season, against ${opp}. It only took ${numberWord(games)} matches`,
    ]
    : [
      `${name} ends a run of ${numberWord(games)} games without a goal against ${opp}`,
      `${games} matches since his last. ${name} scores against ${opp}, and breathes out`,
      `The drought is over: ${name} scores against ${opp} after ${numberWord(games)} blank games`,
    ]);
}

// ── Results ──────────────────────────────────────────────

export function comebackText(week: number, deficit: string, opp: string, gf: number, ga: number): string {
  return choose(`comeback|${week}`, [
    `Comeback: ${deficit} down against ${opp}, won ${gf}–${ga}`,
    `${deficit} down to ${opp}, and won ${gf}–${ga}. What a turnaround`,
    `From ${deficit} down to a ${gf}–${ga} win over ${opp}`,
    `${opp} were ${deficit.split('–').reverse().join('–')} up. They lost ${gf}–${ga}`,
  ]);
}

export function thrashingText(week: number, opp: string, gf: number, ga: number): string {
  return choose(`thrashing|${week}`, [
    `${opp} beaten ${gf}–${ga}`,
    `${opp} taken apart, ${gf}–${ga}`,
    `A ${gf}–${ga} rout of ${opp}`,
    `${gf}–${ga}. ${opp} will want to forget this one`,
  ]);
}

export function hammeringText(week: number, opp: string, gf: number, ga: number): string {
  return choose(`hammering|${week}`, [
    `Beaten ${ga}–${gf} by ${opp}`,
    `Taken apart by ${opp}, ${ga}–${gf}`,
    `A ${ga}–${gf} hiding at the hands of ${opp}`,
    `${ga}–${gf} to ${opp}. Nobody is talking about this one`,
  ]);
}

export function topText(week: number, points: number, played: number): string {
  return choose(`top|${week}`, [
    `Top of the table, ${points} points from ${played}`,
    `Top of the league after ${played} games, on ${points} points`,
    `Look at the table: top, with ${points} from ${played}`,
  ]);
}

export function knockedOffTopText(week: number, by: string): string {
  return choose(`knocked-off-top|${week}`, [
    `Knocked off the top by ${by}`,
    `${by} go top, and the view from first is gone`,
    `Second now: ${by} take over at the top`,
  ]);
}

export function intoDropZoneText(week: number, place: number): string {
  return choose(`into-drop-zone|${week}`, [
    `Into the relegation places, ${ordinal(place)}`,
    `${capitalise(ordinal(place))}, and in the bottom three`,
    `The trapdoor opens: down to ${ordinal(place)}`,
  ]);
}

export function outOfDropZoneText(week: number, place: number): string {
  return choose(`out-of-drop-zone|${week}`, [
    `Out of the relegation places, up to ${ordinal(place)}`,
    `Up to ${ordinal(place)} and out of the bottom three`,
    `Breathing space: out of the drop zone, ${ordinal(place)}`,
  ]);
}

export function championsText(week: number, remaining: number): string {
  if (remaining === 0) return choose(`champions|${week}`, ['Champions on the final day', 'Champions, and it went all the way to the last day', 'The title, on the final afternoon']);
  return choose(`champions|${week}`, [
    `Champions with ${remaining} to play`,
    `Champions, with ${numberWord(remaining)} game${remaining === 1 ? '' : 's'} to spare`,
    `The title is won, ${remaining} game${remaining === 1 ? '' : 's'} early`,
  ]);
}

export function titleElsewhereText(week: number, leader: string, remaining: number): string {
  return remaining === 0
    ? choose(`title-elsewhere|${week}`, [`${leader} are champions on the final day`, `${leader} take the title on the last day`])
    : choose(`title-elsewhere|${week}`, [`${leader} are champions with ${remaining} to play`, `The title is ${leader}'s, with ${numberWord(remaining)} to play`]);
}

export function relegatedText(week: number, remaining: number): string {
  return remaining === 0
    ? choose(`relegated|${week}`, ['Relegated on the final day', 'Down, on the last day of the season'])
    : choose(`relegated|${week}`, [`Relegated, with ${remaining} to play`, `Down, with ${numberWord(remaining)} game${remaining === 1 ? '' : 's'} still to play`]);
}

export function safeText(week: number, remaining: number): string {
  return remaining === 0
    ? choose(`safe|${week}`, ['Survival on the final day', 'Safe, on the last day. Just'])
    : choose(`safe|${week}`, [`Safe, with ${remaining} to play`, `Survival secured with ${numberWord(remaining)} to spare`]);
}

export function winStreakText(week: number, n: number): string {
  return choose(`win-streak|${week}`, [
    `${capitalise(numberWord(n))} wins in a row`,
    `${capitalise(numberWord(n))} straight wins`,
    `That is ${numberWord(n)} wins on the bounce`,
  ]);
}

export function unbeatenRunText(week: number, n: number): string {
  return choose(`unbeaten-run|${week}`, [
    `${capitalise(numberWord(n))} games unbeaten`,
    `Unbeaten in ${n}`,
    `${n} league games without a defeat`,
  ]);
}

export function cleanSheetRunText(week: number, n: number, keeper?: string): string {
  return choose(`clean-sheet-run|${week}`, [
    `${capitalise(numberWord(n))} clean sheets in a row`,
    `${n} games without conceding`,
    keeper ? `${keeper} has not been beaten in ${numberWord(n)} games` : `Nobody has scored against this side in ${numberWord(n)} games`,
  ]);
}

export function losingRunText(week: number, n: number): string {
  return choose(`losing-run|${week}`, [
    `${capitalise(numberWord(n))} defeats in a row`,
    `${capitalise(numberWord(n))} straight defeats. Crisis talks`,
    `Beaten ${numberWord(n)} times running`,
  ]);
}

export function winlessRunText(week: number, n: number): string {
  return choose(`winless-run|${week}`, [
    `${capitalise(numberWord(n))} games without a win`,
    `No win in ${n}`,
    `The wins have dried up: ${numberWord(n)} games without one`,
  ]);
}

export function perfectText(week: number, n: number): string {
  return choose(`perfect|${week}`, [`${n} wins from ${n}. Perfect.`, `${n} played, ${n} won. 38-0.`]);
}

export function invincibleText(week: number): string {
  return choose(`invincible|${week}`, ['Unbeaten all season', 'Invincibles: not one defeat all season', 'A whole season without losing']);
}
