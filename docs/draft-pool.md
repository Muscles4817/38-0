# The draft pool: challenges and Prime mode

Read this before changing what the draft can offer: the era, Prime mode, a
challenge, or anything that decides which players are shown after a spin.

## One pool, read everywhere

`draftPool(rules)` in `src/lib/draftPool.ts` is everything a run can draft:
the club-seasons in the era, with each squad's players after Prime mode and any
challenge filter. The rules are saved in `38-0-setup` (`playerRating`,
`filter`), so a refresh resumes the same pool.

Two places read players, and both go through these rules:

- **the draft page** spins from `draftPool()` and places players through its
  feasibility check;
- **"What Could Have Been"** on the results page runs the squads it recorded
  through `applyRules()`, so its best XI is built from players this run could
  have picked, at the ratings it offered them at.

Anything new that shows a draftable player must do the same. A second path that
reads `gameData.squads` directly will disagree with the draft the first time a
challenge or Prime mode is on.

Opponents are never filtered: the league is always the real squads.

## Challenges

A challenge is a filter, not a different game. The draft runs unchanged on
whatever the filter leaves.

| Challenge | What it does |
| --- | --- |
| One Club | keeps one club's seasons in the era (`{ kind: 'club' }`) |
| One Nation | keeps players of one nationality; a squad left with nobody is dropped (`{ kind: 'nation' }`) |
| Budget XI | keeps players rated 78 or below, after Prime (`{ kind: 'max-rating' }`) |
| Golden Era | sets the era to 1992/93–2004/05; no filter |
| Modern Masters | sets the era to 2015/16 onwards; no filter |
| Pure Chaos | Hard difficulty (no rerolls, ratings hidden) and a formation drawn at Start; no filter |

The last three are shortcuts for settings the setup page already has. Changing
the setting afterwards drops the challenge back to None.

## Feasibility

A filter can leave a pool that cannot field an XI, or one that can only if the
right player goes in the right slot. Measured on the snapshot at the time of
writing, with a 4-4-2 over the whole era:

| Pool | Can field an XI | Random drafts that got stuck, unguarded |
| --- | --- | --- |
| everyone | yes | 0% |
| One Club | all 60 clubs | 0% (Chelsea; Swindon, one season) |
| One Nation | 27 of 109 nations | England, France, Brazil 0%; Ghana 4%; Finland 59% |
| Budget XI | yes, 422 of 427 squads left | 0% |

"Stuck" means an open slot that nobody left in the pool can fill, reached
because an earlier pick used the only player who could.

`feasibility(pool, formation)` answers "can this XI still be finished?" as a
bipartite matching of open slots to unpicked players. With k slots open, a slot
with at least k candidates can always be filled last, so only slots with fewer
are matched; in an unfiltered pool that is none of them and the check is a few
list scans. It is used three ways:

1. **Setup** lists only clubs and nations that can field the chosen formation
   in the chosen era, and disables Start when Budget XI cannot.
2. **Spinning** only lands on a squad with at least one player who has an
   allowed placement.
3. **Placing** refuses a slot that would leave another slot unfillable, and
   says so in the placement panel. `draftPool.test.ts` drafts Finland, Ghana and
   Slovakia at random through the guard and never gets stuck.

A player counts as a candidate for a slot if any version of them in the pool can
play it, because whichever squad they appear in next is the one offered.

## The bench

After the eleventh pick the draft can go on for five more, onto the bench. A
bench spin lands on any squad in the pool with a player not yet drafted, and
feasibility does not apply: a bench place has no position. See
[bench.md](bench.md).

## Prime mode

Prime rates every player at the best rating the snapshot holds for them, in any
season, whatever the era: drafted from Chelsea 2004/05, Drogba is still rated as
his best season. Only the rating changes. Positions stay those of the squad
being shown, so the list's "where they can play" is true of the row it is on;
110 players have different positions in different seasons. Budget XI is applied
after Prime, so in Prime mode it means "whose best was 78 or below".

## What a player row shows

Name, nationality, positions, and, when ratings are shown, the rating and the
player's traits. Traits follow the ratings setting rather than having one of
their own: a Poacher who is Pacey gives a player away almost as much as his
rating does, so blind and Hard drafts stay a test of knowledge. In a blind
draft, placing a player reveals his traits along with his rating. The
pre-season screen shows every pick's traits whatever the setting.

## What Could Have Been

The best XI this draft could have produced, not the best XI from every squad
it showed. A pick takes one player from one spin: the squad landed on, or one
a reroll moved away from at that pick. So `bestPossibleXI`
(`src/lib/couldHaveBeen.ts`) takes at most one player per pick, each in a slot
he can play at his rating there, and no player twice. Eleven picks and eleven
slots make it a small assignment problem, solved exactly over every subset of
slots. Your own XI is always one of the answers it weighs, so it never comes
out below what you drafted; `couldHaveBeen.test.ts` checks that on random
drafts from the real data.

It used to pool every player from every squad shown and choose freely: the
best side from all of them at once, which no draft could make.

The draft records which pick each squad was offered for (`pick` in
`38-0-seen-squads`). A list recorded before that has no picks, and each squad
in it counts as a pick of its own.
