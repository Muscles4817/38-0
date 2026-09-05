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

## Derived team qualities

Alongside the existing `attackZone`, `defendZone`, `midfield` and `aerial`,
computed from the eleven's ratings, positions and roles:

- **pressResistance** — ball-players in defence and deep midfield
- **pressIntensity** — mobile, aggressive midfielders and a pressing forward
- **runningThreat** — pace and runs in behind
- **creation** — the ability to unpick a deep block
- **versatility** — players who genuinely cover more than one position

## Style fit, and the asymmetry that makes it bite

Each style scores 0–1 for how well the actual eleven can execute it.

**The cost is always paid. The benefit is collected × fit.**

Play tiki-taka without technicians and you get the low tempo and the high line
and none of the control. That single rule is what stops a style being a free
label, and it is what makes drafting a squad *for* a style meaningful.

## Interactions — four rules, not a 196-cell table

1. **Space in behind** — chance quality rises with `runningThreat` × the
   attacker's directness × the opponent's line height.
2. **Press disruption** — the opponent's `pressIntensity` × their line cuts your
   chance rate, scaled by how short your build-up is and reduced by your
   `pressResistance`. Going long immunises you.
3. **Congestion** — a deep opponent cuts your chance rate, offset by your
   `creation`.
4. **Aerial route** — route one and wing play resolve chance quality as an
   aerial contest, extending what set pieces already do.

Press beats short build-up, long ball beats press, possession beats long ball.
That triangle falls out of rules 2 and 3; nobody writes it down.

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
top of the table. Each side's chance rate is now normalised by its share of the
ball, which means possession buys patience rather than volume — what patient
build-up against a set defence actually looks like. That single change took the
spread from 9.1 points per 10 games to about 2.

**The rules are pure functions, because measuring them through matches did not
work.** Three attempts confounded them with something else: a pressing side and
a low block differ in tempo by half again; a squad stripped of its traits is
weaker everywhere rather than only at pressing; and giving each style the squad
it wants compares squads, since a route-one eleven is built from roles with 0.1x
goal multipliers and can barely score whatever it does. Measured through shot
counts the press came out backwards, showing short build-up *gaining* 24%
against a press. `pressFactor`, `congestionFactor` and `spaceFactor` are
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
