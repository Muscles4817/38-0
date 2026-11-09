# Playstyles

How a side plays, and why choosing it is a real decision rather than a label.

## What was wrong with the old six

Measured with identical squads, identical ratings and identical cohesion, so
that style is the only difference between the teams:

| style | pts per 10 games | goals/game |
| ---------- | ---: | ---: |
| possession | 18.4 | 1.73 |
| highPress  | 16.1 | 1.90 |
| counter    | 13.8 | 1.64 |
| balanced   | 13.6 | 1.47 |
| lowBlock   | 11.9 | 1.13 |
| routeOne   |  9.3 | 1.13 |

Nine points over ten games — roughly 35 across a season — from the label alone.
That is a ladder, not a set of trade-offs, and picking a style matters more than
having good players. The head-to-head grid has no counters in it either:
possession beats everything, route one loses to everything. Football's most
basic tactical idea, that a counter-attacking side punishes a possession side,
does not exist.

They were written as plausible-sounding trade-offs and never played against each
other.

## The mechanism that already works

Signal grows with the number of chances in a match; noise grows with its square
root. So a low-scoring game is genuinely an underdog's game, and no rule has to
say so. Measured, same two squads, only the tempo differing:

| 84 v 72 | goals/game | underdog gets a result |
| --- | ---: | ---: |
| low block | 2.20 | 42.4% |
| balanced | 3.02 | 35.0% |
| high press | 4.70 | 26.8% |

| 84 v 66 | goals/game | underdog gets a result |
| --- | ---: | ---: |
| low block | 2.37 | 31.7% |
| balanced | 3.32 | 23.7% |
| high press | 5.12 | 15.2% |

A weak side roughly doubles its chances by slowing the game down, and the effect
grows as the gap widens — which is exactly why the worst teams are the most
defensive. This is arithmetic, not a thumb on the scale, and it is the reason
the plan below leans on tempo rather than on a matchup table.

## The taxonomy

Fourteen styles, each placed on three axes. `buildUp` runs long-ball to
short-and-patient, `line` runs deep to high, `tempo` scales the number of
chances the match produces.

| style | buildUp | line | tempo | needs to execute it |
| --- | ---: | ---: | ---: | --- |
| tikiTaka | 1.00 | 0.65 | 0.80 | technical CM, ball-playing CB |
| positionalPlay | 0.85 | 0.75 | 0.95 | technical CM **and** press |
| totalFootball | 0.80 | 0.80 | 1.05 | versatile players |
| possession | 0.80 | 0.55 | 0.90 | technical CM |
| gegenpress | 0.60 | 0.90 | 1.25 | mobile, aggressive mid/fwd |
| highPress | 0.55 | 0.85 | 1.15 | energy |
| balanced | 0.50 | 0.50 | 1.00 | — |
| wingPlay | 0.45 | 0.55 | 1.05 | wingers **and** an aerial target |
| direct | 0.30 | 0.55 | 1.05 | pace, runners |
| counter | 0.35 | 0.30 | 0.90 | pace **and** a defensive core |
| routeOne | 0.10 | 0.45 | 1.00 | target man, aerial support |
| catenaccio | 0.30 | 0.20 | 0.80 | sweeper-type CB **and** an outlet |
| lowBlock | 0.40 | 0.20 | 0.82 | disciplined defenders |
| parkTheBus | 0.25 | 0.10 | 0.68 | bodies; almost no attack |

Route one is not direct: direct is fast vertical passing to feet and into space,
route one is a long ball to a target man. Low block, parking the bus and
catenaccio are three different things — the last is an attacking plan wearing a
defensive shape, built to nullify and then break.

## Phases, and who takes part

A side's abilities are measured phase by phase, over the players who actually
play that phase (`PHASES`, `involvement` and `phaseAbility` in matchEngine.ts):

| phase | what it measures | who mostly plays it |
| --- | --- | --- |
| build | playing out under a press (`pressResist`) | GK, CB, FB, DM |
| press | winning it back high (`pressing`) | forwards, wide men, CM |
| block | holding a deep block (`defending`, work rate as `pressing`) | CB, DM, FB, CM |
| create | unpicking a block (`creation`) | CAM, wide men, CF, CM |
| break | running in behind (`pace`) | forwards, wide men |
| cover | getting back to cover the space (`recovery`) | CB, FB, DM |
| delivery | crosses and set pieces (`setPiece`) | wide men, full-backs |
| aerialAttack / aerialDefence | heading it in, heading it out (`aerial`) | ST / CB, DM |

Who takes part is not a fixed list of positions. Each player's part in a phase
is his position's share, adjusted for **the shape around him** — a flank with no
winger hands its attacking duty to the full-back or wing-back on it, a flank with
no full-back hands defending to the wide man — plus **his appetite for it**: a
trait that describes the work (pace for a break, pressing for a press and, as
work rate, for a block) draws him in beyond his position. So a wing-back with no
winger ahead runs the counter, and a winger who works back is part of the block.

A phase's ability is the weighted mean, over everyone involved, of its
qualities, plus a baseline from rating for a skill (build, press, block, create,
cover, delivery) but not for a physical gift (pace, height): a 90-rated striker
is not fast or tall because he is 90-rated.

## Style fit: a profile, not a total

Each style needs some phases (`needs`): Park the bus a block and aerial
defence; Counter-attack a break and a block; Tiki-taka build-up and creation.
Fit asks two things of the side's abilities in those phases:

- **can it do it** — the ability, against an ordinary side's zero;
- **is it them** — what the style leaves unused: a side whose real strengths are
  elsewhere, technicians asked to defend deep, gives them up to play it.

An all-round side fits most styles; a specialist fits its own. Barcelona 2009/10
fits Possession 75% and Tiki-taka 71%, Park the bus 16%; Stoke 2008/09 fits
Route one 71%. The old measure added up traits over all eleven, scaled by
rating, against a fixed bar, and read Barcelona 100% for Park the bus.

Fit describes; it does not multiply anything. What a style is worth in a match
comes from the same phase abilities in the contests below, so the fit shown
before the season says what the engine will do.

## What was wrong as football

Measured between identical, traitless squads, where only the style differs:

| | before | now |
| --- | ---: | ---: |
| Tiki-taka shots for / against (63% of the ball) | 11.0 / 11.6 | 10.5 / 10.4 |
| Counter-attack shots for / against (40%) | 12.3 / 12.3 | 10.5 / 11.4 |
| xG a shot conceded, deep blocks / high lines | 0.106 / 0.106 | 0.099 / 0.115 |
| Gegenpress, points a game | 1.23 (last) | 1.32 |
| Counter-attack, points a game | 1.53 (first) | 1.41 |
| spread, points per 10 games | 3.2 | 1.4 |

- **Possession bought no chances.** Every side's chance rate was normalised by
  its share of the ball, so a side with 40% took as many shots as one with 60%
  — and Counter-attack, with better chance types on top, came first.
- **The defence did not shape what it conceded.** The attacker's style alone
  chose the chance type.
- **A press had no upside.** It only cut the opponent's chances, and only when
  the pressers were better, so between equals Gegenpress came last.
- **Fit was a total**, as above.

## Interactions

1. **The press** — how often it engages is the pressing side's line against how
   much the other plays out; whether it wins the ball is their pressers against
   these passers (`pressTurnover`). A ball won high is the pressing side's
   possession: a transition, a through ball or a run at a defence out of shape,
   which becomes a shot about one time in five. Going long immunises you.
2. **Possession** — about a third of an extra share of the ball becomes extra
   chances (`POSSESSION_TO_SHOTS`); the rest is the ball going round a set
   defence.
3. **The defending line shapes the chances conceded** — a deep block concedes
   shots from distance and balls into a crowded box; a high line concedes
   through balls and runs (`pickChanceType`).
4. **Congestion** — a deep block against a patient side: their `block` against
   your `create`.
5. **Space in behind** — a direct side's runners (`break`) against the
   defence's `cover`, scaled by the opponent's line height.
6. **Aerial route** — route one and wing play resolve chance quality as an
   aerial contest, as set pieces do.

## Where the styles are used today

`matchEngine.ts` plays every match of a season, possession by possession, and
uses all of this taxonomy — `chanceMix`, `aggression`, the four interaction
rules. `simulation.ts` hands it the player's style for the XI and each club's
recorded or inferred style, and reads nothing from a style itself except to
describe it on the pre-season screen.

Its measured effect is in [pre-season.md](pre-season.md): for Liverpool 2019/20,
67.5 to 74.6 points between the worst and best style, with the best style
differing by squad and by field. The 9.1-point ladder below is what the
taxonomy replaced.

## What must be true when it is finished

- the calibration rates are unchanged: shots, conversion, cards, ~2.8 goals
- **no dominant style**: identical squads round-robin, spread under about 2
  points per 10 games, against 9.1 today
- **counters exist**: each leg of the triangle asserted head to head
- **fit matters**: the same style with and without the players it needs is
  measurably different
- **the underdog effect survives**: low tempo still roughly doubles a weak
  side's chance of a result
- **the hindcast does not regress**: mean Spearman stays above 0.45 across the
  thirteen seasons

## What it took, beyond the plan

**Possession was a free advantage, and that was the whole ladder.** A side with
62% of the ball was taking 62% of the chances, so every patient style sat at the
top of the table. Each side's chance rate was then normalised by its share of
the ball, which took the spread from 9.1 points per 10 games to about 2 — and
went too far: possession bought nothing, and the side with less of the ball got
as many shots. About a third of an extra share now becomes chances (see *What
was wrong as football*).

**The rules are pure functions, because measuring them through matches did not
work.** Three attempts confounded them with something else: a pressing side and
a low block differ in tempo by half again; a squad stripped of its traits is
weaker everywhere rather than only at pressing; and giving each style the squad
it wants compares squads, since a route-one eleven is built from roles with 0.1x
goal multipliers and can barely score whatever it does. Measured through shot
counts the press came out backwards, showing short build-up *gaining* 24%
against a press. `pressTurnover`, `congestionFactor` and `spaceFactor` are
exported and unit-tested for what they claim.

**Two of the intended counters were wrong and are not asserted.** "Possession
beats a low block" and "keeping the ball beats going long" are claims about
quality, not about tactics. Between equal sides, parking the bus against a
possession team is a perfectly good plan — which is exactly why teams do it. The
quality version is tested instead: a better side playing positional play does
beat a low block.

**Interactions only ever suppress**, so the baseline drifts whenever they are
tuned and `BASE_SHOT_RATE` has to be re-centred against the calibration test.
It went 0.136 to 0.122 when the traits landed, then to 0.137 when these rules
went in.

## Order of work

Types and coordinates, derived qualities, fit, interactions, rebalance against
the tests above, migrate the stored tactics, re-tag 2025/26, hindcast.

Expect the first rebalance to fail the hindcast. Widening style effects changes
every historical table, and that is the point at which we learn whether style or
cohesion is the bigger lever for the sides the engine currently under-simulates.

## A dependency worth knowing about

The five derived qualities are only as good as the traits feeding them, and the
trait vocabulary is currently narrow: every role says something about goals,
assists and team strength, and nothing else. Nothing in the data expresses pace,
recovery pace, pressing from the front, or a goalkeeper who claims crosses. See
[roles.md](roles.md).
