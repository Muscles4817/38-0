# The bench: a proposal

Not built. A design to approve, change or reject before any of it is written.
It is a narrower first step than the bench in
[season-depth.md](season-depth.md), and it is built so that step can follow.

## What it is

After the eleventh pick the draft carries on for **five more**: the bench. At
half-time of the season, where the game already stops to ask about the style,
the player can also **change the formation and bring bench players in**. The
second half is then played by the new eleven, in the new shape, in whatever
style was chosen.

That is all the bench does in this version. It covers nothing: no injuries, no
suspensions, no rotation. It is a decision, not insurance.

## Why this version first

Every other use of a bench needs the opponents to have one. If a drafted XI
can lose a player to a red card and call on a substitute, the nineteen real
clubs must be able to as well, or the comparison is unfair, and the bench data
for 680 club-seasons does not exist (season-depth.md, *The opponents are the
hard part*). A bench used only by the player's own choice at half-time touches
none of that: the opponents play exactly as they do today, and nothing that is
calibrated moves.

It also gives the half-time decision more to it. Today it is a choice among
fourteen styles. With a bench it is the decision a manager actually makes:
the shape is not working, so change it and change the personnel to fit.

## The draft

- **Five more picks, after the eleven.** Same wheel, same rerolls, same rules
  (era, challenge filter, Prime mode). A bench pick goes into any of five
  numbered bench places, not a formation slot, so there is no position to
  fit; the feasibility check that stops a draft getting stuck does not apply.
- **No positional requirement.** A second keeper is the player's choice. With
  no injuries in this version, a reserve keeper is only worth drafting to
  play him; requiring one would spend a fifth of the bench on nothing.
- **A one-tap "Skip the bench" after the eleventh pick**, for a quick run. The
  season then plays exactly as it does today.
- **The daily challenge** includes the bench: the day's spin order simply
  continues, so everyone still gets the same sixteen spins.
- **Classic mode** gets the club's real bench: the five best squad players
  not in its stored lineup.
- **What Could Have Been** keeps judging the starting eleven. The bench picks
  are recorded with their pick numbers like the rest, so a later version can
  include them.

The cost is length: sixteen spins instead of eleven, about 45% more drafting.
The skip keeps the short run available.

## Before kick-off

The pre-season screen shows the bench under the XI, with each player's
traits. Nothing to decide there in this version: the starting eleven is the
one drafted. Choosing the starting eleven from all sixteen before kick-off is
a natural next step (open question 3).

## At half-time

The half-time panel gains a second part beside the style:

- **Formation.** Any formation the game offers. The current eleven is laid
  into the new shape automatically (best fit by position, then rating), and
  the player adjusts it.
- **Lineup.** Tap a player on the pitch, then a bench player, to swap them;
  or tap two players on the pitch to swap their slots. Each slot shows the
  player's rating *in that slot* (out of position costs 4, as everywhere
  else), and the XI's overall updates as he goes.
- **Keep everything** stays one tap, as now.

The players taken off go to the bench. There is no limit on how many change:
it is half a season, not a match.

## What changes underneath

| Area | Change |
| --- | --- |
| `simulateSeason` | `change` grows from `{ afterWeek, style }` to also carry the second half's picks and formation. Rounds before `afterWeek` are untouched, so the first half replays identically on the same seed, exactly as the style change already does (`seasonEndToEnd.test.ts` holds it to the byte). |
| Player stats | A player who plays one half accumulates for the matches he played. The XI's season table lists all sixteen, with appearances. |
| Storage | A new `38-0-bench` key (five picks), so everything that reads `38-0-squad` keeps reading exactly eleven. |
| Run history | `changedTo` already marks a style change; it gains whether the lineup or formation changed. Such a season is left off the tactics board, as a style change already is. |
| Daily result | Records the second-half formation and lineup changes, and the share text says so. |
| Awards | Unchanged in kind: they read the season's stats, which now include whoever came on. |

Nothing changes for the opponents, the engine's weights, the pre-season
odds or the calibration tests. The odds are priced on the starting eleven,
as the style already is.

## Open questions

1. **Five?** Five matches the modern substitutes' bench and keeps the draft to
   sixteen spins. Three would keep it shorter; seven would allow a whole new
   midfield.
2. **Bench picks from any squad, or a narrower spin?** A bench pick could
   offer two squads at once to keep the extra spins quick. Simpler to keep one
   squad a spin.
3. **Choose the starting eleven before kick-off too?** It makes the pre-season
   screen a team selection, and makes drafting a bench useful before the
   season starts. It also raises the question of whether the odds should be
   priced on the chosen eleven (they would be: the same function, different
   picks).
4. **A cap on half-time changes?** None is proposed. A cap of three would
   echo a match's substitutions but has no reason in a season.

## Then, if wanted

This is step 2 of season-depth.md's suggested order brought forward and
given a job of its own. Suspensions, injuries and rotation can follow it
unchanged: they need the same bench, plus benches for the opponents.
