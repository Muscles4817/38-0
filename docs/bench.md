# The bench

Built. Five players drafted after the eleven, used by the player's own choice:
to pick the starting eleven and the formation before kick-off, and to change
both at half-time. It covers nothing: no injuries, no suspensions, no
rotation. It is a decision, not insurance. It is a narrower first step than the
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

## Next, if wanted

Suspensions, injuries and rotation can follow unchanged: they need this bench,
plus benches for the opponents, which `deriveBench` can provide from the
squads the snapshot already holds.
