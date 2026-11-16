# The bench

Built. Five players drafted after the eleven: to pick the starting eleven and
the formation before kick-off, to change both at half-time, and to stand in
for a suspended player. It covers no injuries and no rotation. It is a narrower first step than the
bench in [season-depth.md](season-depth.md), built so that step can follow.

Code: `src/lib/bench.ts` (the rules), `src/components/LineupEditor.tsx` (the
one editor both screens use), and the `change.picks` path in `simulateSeason`.

## Why this version first

Every other use of a bench needs the opponents to have one. If a drafted XI
can lose a player to a red card and call on a substitute, the nineteen real
clubs must be able to as well, or the comparison is unfair. A bench used only
by the player's own choice touches none of that: the opponents play exactly as
before, and nothing that is calibrated moves.

## The draft

- **Five more picks, after the eleven** (`BENCH_SIZE`). Same wheel, same
  rerolls, same rules (era, challenge filter, Prime mode), **one squad a
  spin**. A bench pick goes into a numbered bench place, a `SquadPick` with
  `slotIndex` of `BENCH_SLOT_BASE` (100) or more, so it can never be read as a
  formation slot. Any player in the squad not already drafted can be taken;
  there is no position to fit, so the feasibility check does not apply. A
  bench spin lands on any squad with a player not yet drafted.
- **No positional requirement** on the player's own bench. A second keeper is
  their choice; with no injuries, one is only worth drafting to play him.
- **"Skip the bench"** after the eleventh pick, for a quick run, and **"Done
  with N subs"** once some are picked. With no bench the season plays as an
  XI alone, as it always did.
- **The daily challenge** includes the bench: the day's spin order simply
  continues, so everyone gets the same sixteen spins.
- **Storage.** While drafting, bench picks sit in `38-0-draft` with the eleven.
  When the draft finishes they are split: `38-0-squad` keeps exactly eleven, so
  everything that read it still reads eleven, and `38-0-bench` holds the rest.
- **What Could Have Been** still judges the starting eleven only. Bench picks
  are recorded in `38-0-seen-squads` with their pick numbers like the rest, so
  a later version can include them.

## The computer's bench

**Classic mode** gets the club's real bench, picked by `deriveBench`: **one
goalkeeper, then one defender, one midfielder and one forward, then the best
outfield player left**, each the best rated of its kind not in the stored
lineup. A line the squad cannot supply is filled by the best outfield player
left. The same rule is the one to give the opponents when they get benches;
they have none yet.

## Before kick-off

When there is a bench, the pre-season screen is a **team selection**: the
eleven and the bench, each player's traits, and a formation picker. Tap a
player, then another, to swap them: two starters swap slots, a starter and a
sub swap places. Each starter shows his rating *in his slot* (four lower out of
position, as everywhere else) and the XI's overall updates as you go.

Changing the formation lays the current eleven into the new shape with
`refitToFormation`: an exact search over every way of placing them, starters
kept wherever they can play, any slot none of them can play filled from the
bench, leftovers to the bench. The picker offers only shapes this squad can
fill with eleven.

The choice is written straight back to `38-0-squad`, `38-0-bench` and the
setup's formation, so the odds, the style history and the season all read the
chosen eleven: the odds are priced on it, as they are on the drafted one.

## At half-time

The half-time panel keeps the style choice and adds **"Change the shape or the
eleven"**, the same editor. There is **no limit** on changes: it is half a
season, not a match. Keeping everything stays one tap.

A change replays the season on the same seed with
`change: { afterWeek: 19, style, picks }`. At the top of round 20
`simulateSeason` swaps the XI's players: one who stays keeps his season record,
one who comes on is entered fresh, and the side's focus is re-inferred from the
new shape. Rounds before the change are untouched, so the first nineteen
gameweeks come out byte-identical (`seasonEndToEnd.test.ts`). An unchanged
eleven (`sameLineup`) is passed as no change at all.

`SimulationResult.lineupChangedFrom` marks the gameweek the new eleven started.
Every `PlayerStats` has `appearances`; the season table lists the starters,
then whoever came on, with an App column.

## What else reads it

| Area | Behaviour |
| --- | --- |
| Run history | `RunRecord.lineupChanged`. Such a season is left off the tactics board, as a style change is: it measures neither eleven. |
| Daily result | `DailyResult.lineupChanged`; the share text adds "reshaped at half-time". |
| Awards | Unchanged in kind: they read the season's stats, which include whoever came on. |
| Squad panel (results) | Lists the bench under the XI. |

Nothing changed for the opponents, the engine's weights, the pre-season odds
model or the calibration tests.

## Suspensions

Played only when the player has a bench, and then for **all twenty sides**:
skipping the bench is the quick run, and it plays exactly as a season did
before suspensions existed. Code: `src/lib/suspensions.ts` (the rules) and
`simulateSeason` (who lines up each round).

| Card | Ban |
| --- | --- |
| A second yellow in a match | 1 match |
| A straight red | 3 matches (the engine's straight reds are serious foul play) |
| A 5th yellow by the side's 19th match | 1 match |
| A 10th yellow by its 32nd | 2 matches |
| A 15th yellow | 3 matches |

The yellows that make a red do not count towards the totals, as in the
Premier League. A ban is served one match at a time as the side plays.

**Who stands in.** The bench player rated highest *in the slot* among those
who can play it, the goalkeeper's slot first, nobody twice. If nobody on the
bench can play the slot, the best-rated player left plays it at
`EMERGENCY_PENALTY` (20 rating points, so an outfielder in goal is as bad as
it should be). If the bench has run out altogether, the banned player plays:
only possible when more are banned at once than the bench holds.

**The opponents' benches** are `deriveBench` over each club-season's squad,
the same rule as Classic mode: a keeper, a defender, a midfielder, a forward
and the best outfield player left (`OpponentSquad.bench`).

**What the player sees.** A match lists who was suspended and who came in.
A red card's key moment says how long he is out for, and a ban for yellows is
a key moment of its own. The season table gains an appearances column once
anyone has missed a match. At half-time, the bench for the second half is the
whole squad less the new eleven, and bans carry over.

**Measured** (2003/04 and 2025/26, real leagues on their stored XIs): the
engine books about 2.0 yellows and 0.06 reds per side per match, close to the
real league. A side of Manchester United 1998/99 is banned about 6 times a
season and misses about 8 player-matches; it loses 1.8 points on average, but
so do its rivals, and over 300 seasons an XI's mean points, finish and title
chance are the same with suspensions as without (86-rated in 2025/26: 70.7 /
70.6 points, title 18% / 20%; 90-rated: 82.6 / 82.8, 74% / 72%). The pre-season
odds needed no re-fit.

## Next, if wanted

Injuries and rotation can follow: they need the same benches, which every
side now has.
