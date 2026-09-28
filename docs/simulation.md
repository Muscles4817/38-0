# The simulation

`simulateSeason` in `src/lib/simulation.ts` turns eleven players into a 38-game
season. Every fixture is played out by `simulateMatch` in
`src/lib/matchEngine.ts`, possession by possession, and the season adds up what
happened. It is pure: same inputs and seed, same season.

## The pipeline

```
picks (11 SquadPick)                 opponents (19 OpponentSquad)
        │                            eleven in its lineup slots, recorded
        │                            style / focus / cohesion where known
        ▼                                     ▼
   TeamSetup: players in their slots, roles active in that slot, a style,
   a focus (inferred from the shape where not recorded), a cohesion
                              │
                              ▼
              buildSchedule(20) → 38 rounds × 10 fixtures
                              │
                              ▼
              simulateMatch(): 200 possessions per fixture
                              │
          goals, assists, shots, saves, cards and a rating for every player
                              │
                   ┌──────────┴──────────┐
                   ▼                     ▼
            standings, table      season totals, leaderboards, awards
```

Nothing in `simulation.ts` decides a score or a scorer any more. Until the
change recorded below, a season drew a scoreline from two Poisson rates and
then held a separate weighted lottery for the scorer and the assister, so the
scoreline and the scorers were unrelated and the lottery's weights had to carry
everything. The engine had been written to replace that and never been wired
in; it was.

## A match

The engine is documented in the file itself. In short: possession goes to the
side that controls midfield; each possession attacks down a flank or the
middle and may become a chance of a type (through ball, cross, header, long
shot, set piece, penalty); the shooter is picked for that kind of chance, with
role multipliers damped (`ROLE_SELECTION_POWER`) so a Poacher does not take half
his side's shots; and the chance is finished against a keeper for an xG. The
four interaction rules — press, congestion, space in behind, recovery — are
where the styles meet. `matchEngine.calibration.test.ts` asserts the rates
(shots, conversion, cards, assisted share) against the Premier League.

Match ratings are built from what the player did in the match, not from his
rating: goals, assists, shots on target, chances created, saves, cards, the
result, the goals conceded weighted by how defensive his position is, and his
defensive actions.

### On the ball, by phase

Two of the engine's interaction rules are contests on the ball, and who takes
part in them depends on where the opponent contests it:

| Rule | Reads, for the side in possession | Against, for the other side |
| --- | --- | --- |
| **the press** | build-up ability: keeper, centre-backs, full-backs, holding midfielder | pressing ability: forwards and midfielders |
| **the deep block** | creation: attacking midfielders, wingers, forwards, central midfielders | blocking ability: centre-backs, holding midfielder, full-backs |

Each player's ability is his trait (`pressResist`, `pressing`, `creation`) plus
`0.1 × (rating − 77)`: ten rating points above an ordinary player are worth one
point of a trait, and 77 is the mean rating of everyone in a stored XI. Most
players carry no trait (71% of centre-backs), so without the baseline a quality
was zero for most sides — the median stored XI had no pressing ability at all,
and most presses pressed nobody.

Both rules are **contests**: the chance the better side wins is logistic in the
gap (`CONTEST_SCALE`). A press only bites when the pressers are better than the
passers, scaled by how high and complete the press is and by how much the
victim insists on playing out; a deep block congests in proportion to how much
better its defenders are than the side's creators. Between equals both give
what they gave an ordinary side before, which is why league goals and shots per
match did not move (1.40 and 12.6).

Before, every one of these qualities was averaged over all eleven players, so
one ball-playing centre-back was a tenth of the number and counted the same as a
ball-playing striker. Measured with two identical 80-rated XIs playing
Possession against the 2025/26 field, 60 seasons each:

| Opponents play | no traits at centre-back | two ball-playing centre-backs |
| --- | ---: | ---: |
| Gegenpress | 44.7 pts, 48.9 goals | 50.7 pts, 55.6 goals |
| Low block | 46.2 pts, 39.0 goals | 46.6 pts, 39.3 goals |

Before the change, swapping Matip's ball-playing trait in or out of Liverpool
2019/20 moved nothing against a pressing league (74.3 and 74.4 points).

It also spread the table: the champion averages 80.5 points, from 76.4, and a
flat 90-rated XI in 2025/26 takes 73, from 67. Liverpool 2019/20's best styles
are now High press (77.8) and Positional play (77.3), and Park the bus its worst
(69.1).

### Defending, credited

Whether an attack becomes a chance is decided by the two sides' qualities in
the zone, not by any one defender. Defensive events do not change that. They
decide who gets the credit when something that already happens happens:

| Event | When | Who, weighted by |
| --- | --- | --- |
| tackle / interception / clearance | half the attacks that come to nothing (36% / 23% / 41%) | defending position, zone, rating, `recovery` (tackles) or `aerial` (clearances) |
| block | 43% of shots that miss the target | defending position, zone, rating |
| header won | 80% of headed chances that do not score | height × how defensive the position is, rating, `aerial` |
| beaten | every goal but a penalty | defending position, zone, and the *weaker* defender |

Rating is damped as it is for a shooter (`RATING_SELECTION_POWER`). The draws
come from a stream of their own, seeded once per match, so crediting a tackle
never shifts what happens next. Per team per match that gives 15.8 tackles,
10.0 interceptions, 18.0 clearances and 3.6 blocks, against a real 16, 10, 18
and 3.5; `matchEngine.calibration.test.ts` asserts them.

In the rating a tackle or interception is +0.07, a clearance +0.03, a block
+0.1, a header won +0.05, and being beaten for a goal −0.3. The share of the
goals conceded that every defender carries was cut from 0.22 to 0.12, because
most of that blame now has a name.

Measured over 60 real XIs: a centre-back averages 6.28 and a striker 6.44
(5.73 and 6.40 before), and of two centre-backs in one XI the better-rated is
the better-rated in the season 70% of the time (they were indistinguishable
before). Van Dijk rates 7.01 to Matip's 6.50 — his `AerialThreat` wins him
far more headers and clearances — and is Liverpool 2019/20's Player of the
Season in 85% of seasons. Across the 2008/09 league the award goes most often
to Nemanja Vidić, who won it in reality.

## The plan

The player's style is the engine's style for the XI: it is played, not
converted into a bonus. The opponents play their recorded style where the data
has one and an inferred one otherwise. `tacticEffect` only describes a style
for the pre-season screen, with the eleven's fit for it. See
[pre-season.md](pre-season.md).

The XI plays at the engine's default cohesion, because nothing yet says how well
drilled a drafted side is.

## Awards

Player of the Season, for the XI and for the league, is the best average match
rating. Golden Boot, top assister and Golden Glove are counts. The awards are
exactly as good as the ratings: see the open issue in
[known-issues.md](known-issues.md).

## Randomness

`rng(seed)` is mulberry32. The linear congruential generator it replaced had a
period of 233,280, and a season through the engine draws about that many
numbers, so seasons would have begun to repeat themselves.

When no seed is passed, `Date.now() % 999983` is used.

## Tuning knobs

| What | Where |
| --- | --- |
| Shots, conversion, home advantage | `BASE_SHOT_RATE`, `CHANCE_QUALITY`, `HOME_*` in `matchEngine.ts` |
| How far quality carries | `EDGE_TO_CHANCES`, `FINISHING_EXPONENT`, `KEEPING_EXPONENT` |
| Who gets on the end of a chance | `ATTACK_WEIGHT`, `ROLE_CHANCE_AFFINITY`, `ROLE_SELECTION_POWER`, `RATING_SELECTION_POWER` |
| Set pieces | `SET_PIECE_*`, `AERIAL_*` |
| Match ratings | the `finish` step at the end of `simulateMatch` |
| Role multipliers and qualities | **the database** (`role_config`), not the defaults in code |
| Styles and their interactions | `PLAYSTYLES`, `PRESS_EFFECT`, `CONGESTION_EFFECT`, `SPACE_EFFECT`, `FIT_REFERENCE` |
| Pre-season projection | `POINTS_STEEPNESS`, `POINTS_MIDPOINT`, `SEASON_SD`, `OPPONENT_SD` in `simulation.ts` — measured, not chosen; see below |

## Moving the season onto the engine

Measured with `npm run sim:report`, same XI, same field, before and after.
Liverpool 2019/20 in the 2025/26 field, 40 seasons; real figures are from the
public record.

| | lottery | engine | real |
| --- | ---: | ---: | ---: |
| Golden Boot, average | 38.5 | 24.9 | 27 |
| Goal record (36) equalled or broken | 68% | 0% | — |
| Top assister, average | 30.9 | 14.8 | 21 |
| Assist record (20) equalled or broken | 100% | 0% | — |
| Salah / Mané / Firmino goals | 16.6 / 17.2 / 17.2 | 13.3 / 12.9 / 11.1 | 19 / 18 / 9 |
| Firmino assists | 4.1 | 10.2 | 8 |
| Liverpool points | 75.0 | 73.6 | 99 |

Liverpool 2008/09 in its own field: Golden Boot 22.1 (real 19), top assister
14.9, Torres 18.9 goals against a lottery 31.8 and a real 14.

The styles, for Liverpool 2019/20: 67.5 (park the bus) to 74.6 (total football)
points and 18% to 60% title odds, against 70.5–76.5 points under the lottery,
where most of the difference came from tempo.

A season takes about 0.07 seconds.

What the engine still gets wrong is recorded in
[known-issues.md](known-issues.md): centre-backs score too often from set
pieces, full-backs create too little, the best-rated player is always a
forward, and the top of the table is still flat.

## Calibration

### Fixed: `scaledAvgRating` inverted with the wrong constant

`ratingScale` and `scaledAvgRating` are inverses, but used different constants:
`0.032` forward and `0.055` back. A round trip through `exp(k·x)` and `log(y)/k`
only returns `x` when k is the same both ways, so every squad was dragged 58% of
the way toward 80 — a side of 90s was simulated as 85.8 — and Poisson noise
outweighed squad quality.

Both now share one `RATING_CURVE` constant, and `simulation.test.ts` asserts the
round trip, so the two can no longer drift apart unnoticed.

Measured over 30 seeded seasons against the real 2025/26 squads:

| | before | after |
| --- | --- | --- |
| Champion's points | 71.1 | 75.6 |
| Bottom club's points | 34.2 | 29.0 |
| Distinct title winners in 30 seasons | 9 | 7 |
| Where an 88-rated XI finishes | 4.9th | 2.6th |

Still flatter than the real thing, where champions average about 88 points and
the bottom club about 22. That remaining gap is the scoring coefficients, not
the curve — see below.

### 1. The scoring coefficients were too gentle (superseded)

This and the curve fix above describe the Poisson model the season used
before it moved onto the match engine; kept for the history. `simulateScore`
turned a 10-point strength advantage into only +0.38 expected
goals. Raising `0.38 → 0.62` and `0.30 → 0.52` moves the champion to 81.5 points
and concentrates titles among four clubs across 30 seasons.

That is tuning rather than a bug, so it wants its own change and its own look at
the resulting tables. Be wary of chasing the last few points: real leagues are
spread partly by things this model does not have at all — injuries, form,
fixture congestion, a manager sacked in November — and forcing the table to look
right by inflating goal difference buys a realistic league with unrealistic
scorelines.

### 2. `preSeasonOdds` did not match the simulator (fixed)

It was five straight lines in the squad's overall rating, fitted to nothing, and
it had never been checked against the thing it predicted:

| XI OVR | Old promise | What happened |
| --- | --- | --- |
| 80 | 9th, 54 pts, 20% title | 11.7th, 49.7 pts, 0% |
| 85 | 2nd, 72 pts, 45% title | 5.9th, 59.7 pts, 13% |
| 88 | 1st, 83 pts, 60% title | 4.9th, 62.9 pts, 23% |
| 90 | 1st, 91 pts, 70% title | 3.3rd, 66.1 pts, 33% |

It also could not have been right, because it never looked at the opposition.
Once the player could choose the season, the same 86-rated XI was a 20% title
shot against 2025/26 and a 67% one against 1992/93, and the formula gave both
the same answer.

It is now a measured model of the simulation, described in the pre-season odds
section of `simulation.ts`. The projection reads the field: everything follows
from how far the XI is above its league's average, on a curve that saturates at
both ends because a season cannot yield fewer than 0 or more than 114 points.

    expected points = 114 / (1 + exp(-0.113 * (edge - 1.56)))

A season lands about 7.6 points either side of that for the player and 7.5 for
an opponent, so the chance of finishing above any one opponent is a normal
comparison, and the chance of a top-`n` finish is the chance that at most
`n - 1` opponents finish above — a Poisson binomial over the whole field, exact
and cheap at nineteen opponents.

The one thing that cannot be treated as independent is the player's own season:
when it goes badly, *every* opponent passes them at once. Ignoring that made the
odds far too confident — a squad that went down 41% of the time was told 7% —
so the model integrates over the player's own points rather than taking a single
comparison.

Measured over 90,000 team-seasons across the 2025/26, 2003/04 and 1992/93
fields, at squad ratings from 62 to 98:

| | expected points | projected finish | any probability |
| --- | --- | --- | --- |
| worst error vs measured | ~1 pt | 0.7 places | 12 points |

Re-measured after every club-season gained a derived, minutes-based XI, which
changed what the field is made of. `OPPONENT_SD` was 8.6 and the simulation now
puts it at 7.5 — measured directly as the spread of each opponent's points over
120 seasons, 7.4 to 7.6 across three fields — so it is 7.5. Expected points stay
within 2.2 and projected finish within 0.9 across all nine cases.

### Re-fitted again, for on-ball contests

After the press and the deep block became contests between the players in each
phase (see *On the ball, by phase*), a weak side lost more than the odds knew:
a 74-rated XI in 2025/26 went down 74% of the time against 54% projected.
Re-measured on the same 900 seasons: `POINTS_STEEPNESS` 0.066 → 0.086,
`POINTS_MIDPOINT` 2.68 → 2.04, `SEASON_SD` 7.4 → 6.7, `OPPONENT_SD` 8.1
unchanged (√(7.8² + 2.0²)). Curve error 1.6 points for the XI, 2.8 for an
opponent.

### Re-fitted for the match engine

The constants above were fitted to the Poisson model. Re-measured on 900
seasons through the engine (flat-rated XIs from 62 to 98 in the 2025/26, 2003/04
and 1992/93 fields, 18,000 team-seasons):

| | Poisson model | engine |
| --- | ---: | ---: |
| `POINTS_STEEPNESS` | 0.113 | 0.066 |
| `POINTS_MIDPOINT` | 1.56 | 2.68 |
| `SEASON_SD` | 7.6 | 7.4 |
| `OPPONENT_SD` | 7.5 | 8.1 |
| curve error, XI / opponent | — | 1.7 / 2.6 pts |

The engine is flatter: a rating edge buys about 60% of the points it did.
`OPPONENT_SD` is the season-to-season spread (7.9) combined with the error in
judging a club by its rating at all (1.9, pooled across the three fields),
because the model is genuinely that unsure of a club's level.

Two things changed in the calibration test rather than the model:

- **It plays 120 seasons per case, not 60.** A season's finish varies more under
  the engine — 5.4 places for a mid-table XI in 1992/93 — so a 60-season mean
  carried ±0.7 places and the 1.5-place bound was two standard errors. It failed
  on an unlucky draw: 13.1th on its seeds, 11.3th over 200, 11th projected.
- **A second recorded exception, the style the odds cannot see.** In 2025/26
  the clubs that most outperform their rating all play Counter-attack (Aston
  Villa by 6.5 points), so the model underrates the top of that field and is
  too sure of a strong XI's finish there: 3.6th for a 90-rated XI projected 2nd,
  top four 44% for an 86 projected 60%. Cohesion explains none of it (r = 0.04
  against the club error). Recorded in [known-issues.md](known-issues.md).

### The one place the projection is genuinely out

**A two-horse race is projected as a one-horse race.** An 82-rated XI in
1992/93 is told it wins the title 32% of the time and actually wins 53%.
Everything else about that case is right — 76 points projected against 76.8
played, 2nd projected against 1.9th played.

The cause is not the curve, which is already near its best fit for this
functional form (re-fitting on 180 measured club-seasons moves RMSE from 3.14
to 3.12). It is that a club's `strength` is the **flat mean of its XI's
ratings**, while the match engine reads a team as three lines through
`scaledAvgRating`. Those disagree for a lopsided XI, and a minutes-based XI is
more lopsided than the rating-optimised `bestXI` that used to stand in for it.

1992/93 makes that visible because its top is a dead heat and its middle is far
back:

| | strength | model expects | actually plays |
| --- | ---: | ---: | ---: |
| the 82-rated XI | 82 | 76.0 | 77.0 |
| Manchester United | 83 | 78.3 | 76.9 |
| Arsenal | 80 | 69.5 | 63.3 |

The model has United 2.3 points clear of the XI; the simulation has them level.
At the top of a two-horse race that 2.3 is worth twenty points of title
probability, which is why this one number is out while the rest are not.

Fixing it means making `strength` line-based like the engine, and `strength`
also decides which clubs make way and what the pre-season screen shows — so it
is its own change, not a constant to re-fit. Recorded in
[known-issues.md](known-issues.md).

`preSeasonOdds.calibration.test.ts` plays real seasons and asserts the
projection still matches them. **If it fails after a deliberate change to the
simulation, the model is out of date, not the test**: re-fit the constants and
update the numbers here.

What it still cannot see: the tactic. `preSeasonOdds` takes the squad's overall
and the field, and a style is worth a few rating points either way on top of
that (see [pre-season.md](pre-season.md)), so a park-the-bus side and a
gegenpress side of the same overall are given the same odds.

### 3. Two different projections were shown (fixed)

The pre-season card ranked the user's OVR against the real opponents while the
final banner and the OVERPERFORMED/UNDERPERFORMED verdict used the formula's
`odds.projectedPosition`, so one run reported two different "Projected" finishes
on two screens. There is now one projection, `odds.projectedPosition`, computed
from the squad and the field it is actually playing, and both screens read it.

## Measuring a change

```bash
npm run sim:report -- --club Liverpool --season 2019/20 --runs 40
npm run sim:report -- --club Liverpool --season 2008/09 --tactic all
```

`scripts/sim-report.mjs` plays one club-season's stored XI through many
seeded seasons with `runSeasonSimulation`, the function the results page
calls, and prints: the team's points, finish and goals; each player's goals,
share, assists, match rating and how often he wins Player of the Season, next
to his real goals and assists where an FBref export exists; the league's Golden
Boot and top assister against the real season and the records; and who the
top-20 scorers and assisters are by position. `--tactic all` plays every style
on the same seeds, so the differences are the tactic and not luck. It takes
about a second for 40 seasons.

Run it before and after a change and compare. `--league` picks the field; it
defaults to the XI's own season when that season has one, else 2025/26.

## Changing the simulation safely

1. `src/lib/simulation.test.ts` covers the invariants that must hold whatever
   the tuning: a true double round robin, points equalling `3W + D`, league
   goals for equalling goals against, the table sorted correctly, goals
   attributed to the XI summing to the team total, determinism per seed, and
   stronger squads finishing higher. Those should keep passing.
2. Balance is not covered by unit tests, because "is this fun" is not an
   assertion. Measure it: run many seasons across a range of squad ratings and
   look at champion points, spread, and how often the best squad wins.
3. Record what you measured in this document. The tables above exist so the next
   person does not have to rediscover the numbers.
