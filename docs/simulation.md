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

## Team strength

Each team gets three numbers — attack, midfield, defence — from the players
whose positions fall in that zone (`isAttPosition`, `isMidPosition`,
`isDefPosition`; `CM` counts as both attack and defence).

Ratings are averaged in exponential space by `scaledAvgRating`, so one elite
player lifts a side more than one poor player drags it down. Roles then add a
flat contribution on top via `roleStrBonus`.

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
| How much rating matters | `ratingScale` (0.032 per point) |
| Attack/defence split by position | `zoneWeight` |
| Home advantage, score spread | `simulateScore` |
| Role multipliers | **the database** (`role_config`), not the defaults in code |
| Pre-season projection | `preSeasonOdds` |

## Known calibration problems

These are real, measured, and not yet fixed. They are the highest-value work in
the codebase.

### 1. `scaledAvgRating` inverts with the wrong constant

```ts
function ratingScale(rating)  { return Math.exp(0.032 * (rating - 80)); }
function scaledAvgRating(ps)  { return Math.log(avgScale) / 0.055 + 80; }  // 0.055 ≠ 0.032
```

The two are meant to be a round trip. A squad of all-85s should score 85; it
scores 82.9. Every rating difference is compressed to **58%** of its true size,
and since all three strength numbers pass through it, the league collapses into
a narrow band where Poisson noise outweighs squad quality.

Measured over 20 seasons, an 82-rated XI against the real 2025/26 squads:

| | as shipped | with `0.032` |
| --- | --- | --- |
| Champion's points | 72.2 | 77.0 |
| Bottom club's points | 34.2 | 29.4 |
| Distinct title winners in 20 runs | 8, including Wolves twice | 4 |
| Liverpool (88 OVR), sample season | 6th, 56 pts | 2nd, 74 pts |

Real Premier League champions average about 88 points and the bottom club about
22, so even the corrected figure is compressed. The `0.38` and `0.30`
coefficients in `simulateScore` are the next thing to widen.

### 2. `preSeasonOdds` does not match the simulator

It is a hand-written linear formula that was never checked against the thing it
predicts. Measured over 30 seasons per rating:

| XI OVR | Odds promise | Actually happens |
| --- | --- | --- |
| 80 | 9th, 54 pts, 20% title | 11.7th, 49.7 pts, 0% |
| 85 | 2nd, 72 pts, 45% title | 5.9th, 59.7 pts, 13% |
| 88 | 1st, 83 pts, 60% title | 4.9th, 62.9 pts, 23% |
| 90 | 1st, 91 pts, 70% title | 3.3rd, 66.1 pts, 33% |

The player is told they will win the league, finishes fifth, and is labelled
UNDERPERFORMED. Some of this closes once (1) is fixed; the rest needs refitting
against measured output.

`src/lib/simulation.test.ts` deliberately tests only the *shape* of
`preSeasonOdds` — bounded probabilities, monotonic in rating — so that fixing
the calibration does not require rewriting the tests.

### 3. Two different projections are shown

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
