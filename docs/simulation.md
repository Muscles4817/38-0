# The simulation

`src/lib/simulation.ts` turns eleven players into a 38-game season. It is pure:
same inputs and seed, same season. It imports nothing but a type.

## The pipeline

```
picks (11 SquadPick)                 opponents (19 OpponentSquad)
        │                                     │
        ├──────── team strength ──────────────┤   attack / midfield / defence,
        │                                     │   from scaledAvgRating + role
        ▼                                     ▼   contributions
              buildSchedule(20) → 38 rounds × 10 fixtures
                              │
                              ▼
              simulateScore(): two Poisson draws per fixture
                              │
                   ┌──────────┴──────────┐
                   ▼                     ▼
            standings, table      goal / assist attribution
                                  (position weight × role
                                   multipliers × rating scale)
                                         │
                                         ▼
                              player stats, awards, leaderboards
```

## The plan

`simulateSeason` takes two things the player decides after the draft: the
opponents it is handed (nineteen clubs from whichever season was chosen) and a
playstyle. The style moves the same three team-strength numbers the players do,
and scales the chances the player's own matches produce. `balanced` is the
origin of all three axes and changes nothing, so every measurement in this
document still describes a balanced season.

The rules, the constants and the measured effect are in
[pre-season.md](pre-season.md). What matters here is the shape of the seam:
tactics are a handful of rating points and a tempo multiplier, not a second
engine.

## Team strength

Each team gets three numbers — attack, midfield, defence — from the players
whose positions fall in that zone (`isAttPosition`, `isMidPosition`,
`isDefPosition`; `CM` counts as both attack and defence).

Ratings are averaged in curve space by `scaledAvgRating`, so one elite player
lifts a side more than one poor player drags it down. It and `ratingScale` are
inverses sharing one `RATING_CURVE` constant — they must, or squads get pulled
toward 80 and the league loses its shape. Roles then add a flat contribution on
top via `roleStrBonus`.

## Match result

`simulateScore` builds two Poisson rates:

- Attack minus opposing defence sets the base rate; the home side gets `+3`.
- Midfield difference multiplies both rates, clamped to 0.7–1.35, so winning the
  midfield creates chances for both sides rather than only for you.

Measured over 20 seasons against the real 2025/26 squads: 2.48 goals per game,
48% home wins, 25% draws, 26% away wins. Real Premier League figures are roughly
2.8 and 45/25/30.

## Attribution

Who scores is a weighted random draw over the XI. A player's weight is

```
posGoalWeight(position) × role multipliers × ratingScale(rating)
```

Role multipliers stack by a deliberate rule in `applyRoleMults`: **suppressors
(<1) multiply together, boosters (>1) compete and the highest wins.** Two
scoring roles therefore do not compound absurdly, while a genuinely low-scoring
combination (Anchor × Deep-Lying Playmaker) still stacks down. Keep that rule if
you add roles.

A role only applies if the player's slot position is in its `validPositions`.
Roles with an empty list apply anywhere.

An assist is drawn 75% of the time, from the same XI excluding the scorer.

Match ratings start at 6.5 and move with the result, goals, assists, and how the
player's zone performed against its expected goals.

## Randomness

`rng(seed)` is a linear congruential generator with modulus 233,280. It is
adequate for a game and makes seasons reproducible, but it is a weak generator:
short period, poor low-order bits. Anything statistical — calibration work,
Monte Carlo over many seasons — should replace it first.

When no seed is passed, `Date.now() % 999983` is used.

## Tuning knobs

| What | Where |
| --- | --- |
| Goal / assist weight by position | `posGoalWeight`, `posAssistWeight` |
| How much rating matters | `RATING_CURVE` — shared by `ratingScale` and `scaledAvgRating`, which are inverses |
| Attack/defence split by position | `zoneWeight` |
| Home advantage, score spread | `simulateScore` |
| Role multipliers | **the database** (`role_config`), not the defaults in code |
| Pre-season projection | `preSeasonOdds` |
| What a style is worth | `LINE_ATT`, `LINE_DEF`, `BUILD_MID`, `BUILD_ATT`, `TEMPO_WEIGHT` — see [pre-season.md](pre-season.md) |

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

### 1. The scoring coefficients are too gentle (open)

`simulateScore` turns a 10-point strength advantage into only +0.38 expected
goals. Raising `0.38 → 0.62` and `0.30 → 0.52` moves the champion to 81.5 points
and concentrates titles among four clubs across 30 seasons.

That is tuning rather than a bug, so it wants its own change and its own look at
the resulting tables. Be wary of chasing the last few points: real leagues are
spread partly by things this model does not have at all — injuries, form,
fixture congestion, a manager sacked in November — and forcing the table to look
right by inflating goal difference buys a realistic league with unrealistic
scorelines.

### 2. `preSeasonOdds` does not match the simulator (open)

It is a hand-written linear formula that was never checked against the thing it
predicts. Measured over 30 seasons per rating, **before the curve fix** — the
gap narrows with it but does not close:

| XI OVR | Odds promise | Actually happens |
| --- | --- | --- |
| 80 | 9th, 54 pts, 20% title | 11.7th, 49.7 pts, 0% |
| 85 | 2nd, 72 pts, 45% title | 5.9th, 59.7 pts, 13% |
| 88 | 1st, 83 pts, 60% title | 4.9th, 62.9 pts, 23% |
| 90 | 1st, 91 pts, 70% title | 3.3rd, 66.1 pts, 33% |

The player is told they will win the league, finishes fifth, and is labelled
UNDERPERFORMED. The curve fix moves an 88-rated XI from 4.9th to 2.6th, so some
of this is already recovered; the rest needs refitting against measured output.

`src/lib/simulation.test.ts` deliberately tests only the *shape* of
`preSeasonOdds` — bounded probabilities, monotonic in rating — so that fixing
the calibration does not require rewriting the tests.

### 3. Two different projections are shown (open)

The pre-season card ranks the user's OVR against the real opponents; the final
banner and the OVERPERFORMED/UNDERPERFORMED verdict use `odds.projectedPosition`
from the formula. The same run reports two different "Projected" finishes on two
screens. See `src/app/results/page.tsx`.

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
