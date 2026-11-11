# Season depth: a proposal, not yet built

The same eleven play all 38 games. Nobody is injured, suspended, tired or out
of form, and once the season starts the player makes no decisions. This
document records what adding that would take, so it is a design to argue with
rather than something to rediscover. Nothing here is implemented.

## Why it was left out

It is not an engine change. Every item below needs a twelfth man, and the game
drafts exactly eleven: the draft, `SquadPick`, the stored run, the pre-season
screen and `simulateSeason` all assume it. It also moves every calibrated
number, because the league's clubs would need benches too or the XI alone
would suffer for its absences.

## The smallest version worth building: suspensions

- A red card, or a fifth yellow, costs the player his side's next match.
- His place goes to a **stand-in**: the same position, rated a fixed amount
  below him (the gap between a first-choice and a squad player in the data is
  about 6 rating points; measure it before choosing).
- Applies to all twenty sides, so nothing is tilted against the XI.

What it touches: `simulateSeason` keeps a per-player ban count between rounds
and builds each side's `TeamSetup` per match instead of once (the defender
weight cache in `matchEngine.ts` is keyed by the players array and would need
keying by who is actually on the pitch). No draft or storage change.

What to measure before and after, with `npm run sim:spread`: points per
strength point, the champion's points, and the spread of a club's points across
seasons. Reds run at about one every ten matches a side, so expect a point or
so off the top sides and `SEASON_SD` up slightly; `preSeasonOdds` would need
re-fitting.

## The full version

| Addition | Needs | Main risk |
| --- | --- | --- |
| A bench of five to seven | Draft extended past eleven; `38-0-squad` gains bench picks; a pre-season screen to order them | A longer draft: eleven spins already take a while |
| Injuries | A per-match injury rate and a length distribution; the bench | Pure bad luck with no decision attached feels unfair unless the player chose the cover |
| Fatigue and rotation | A stamina ability (`docs/abilities.md` already pairs stamina with fatigue); a rule for when a side rotates | The opponents need the same rule, and their benches are not in the snapshot as lineups |
| Form | A slow-moving per-player offset fed by match ratings | Double-counts cohesion's weekly swing unless one replaces the other |
| In-season decisions | A screen between gameweeks | Changes what the game is: today a run is one draft and one decision |

The opponents are the hard part throughout. Stored lineups are elevens; a bench
for 680 club-seasons would have to be derived from the squads the snapshot
already holds (the next-best player per position by rating is a defensible
start, as `bestXI` once was).

## A suggested order

1. Suspensions, as above. Self-contained and measurable.
2. A bench in the draft, used only for suspensions at first.
3. Injuries, once the bench exists.
4. Fatigue and form together, with the stamina ability.
