# Filling in the squads

Getting from 52 club-seasons to all 680 means about 15,000 player-seasons. The
hard part is not producing them; it is producing them *correctly*, because
nobody can eyeball 15,000 rows to find the invented ones.

The pipeline exists to separate **fact** from **judgement**, and to make sure
the facts are collected once.

```
  1. appearances   manual   -> data/raw/fbref/<comp>/<season>/<club>.csv
                   script   -> data/raw/rosters/<season>/<club>.json
  2. positions     agents   -> data/raw/positions/<season>/<club>.json
  3. canonical     script   -> data/raw/players.json
  4. ratings       agents   -> data/squads/<season>/<club>.json
  5. verify        agents   -> corrections to the above
  6. lineups       agents   -> most-used XI + formation
  7. import        script   -> data/38-0.db -> npm run export:data
```

**Every network request happens in phases 1 and 2.** After that the whole
dataset is local. Nothing downstream ever polls a website, so the expensive,
rate-limited part is paid once and the judgement work can be re-run freely when
the rating scale changes.

## Phase 1 — appearances

The source is **FBref standard-stats exports, supplied by hand**. fbref.com sits
behind a Cloudflare challenge that refuses automated requests, including for
`robots.txt`; that is a deliberate access control and not something to work
around.

It is also the best data available. Compared with what can be scraped, it gives
league-only appearances rather than all-competitions, minutes played, starts
separated from substitute outings, age, nationality — and a stable per-player
FBref id, which makes player identity exact across thirty years instead of a
name-matching guess.

```bash
node scripts/scaffold-fbref-files.mjs            # create the empty files
node scripts/scaffold-fbref-files.mjs --status   # how much is pasted in
node scripts/ingest-fbref.mjs                    # exports -> roster files
```

686 empty CSVs sit under `data/raw/fbref/premier-league/<season>/<club>.csv`,
one per club-season from 1992/93 to 2025/26. The club list for each season comes
from that season's real league table, so the 22-club seasons up to 1994/95 and
every promotion are correct. An empty file means "not collected yet", which is
what `--status` reports on.

`ingest-fbref.mjs` parses those into `data/raw/rosters/<season>/<club>.json`,
keeping both the squad and everyone excluded, with the reason.

### Squad inclusion is by minutes

**270 minutes — three full matches.** Not an appearance count: three substitute
cameos of four minutes each is not a squad member, whereas a rotation player who
started six games is.

Checked against real squads:

- Manchester United 1993/94 keeps all fourteen of the double-winning side and
  drops Gary Neville (90 minutes, his debut season) and Nicky Butt (11).
- Arsenal 2003/04 keeps nineteen, including Clichy and Reyes, dropping only
  Bentley and Hoyte.
- Liverpool 2025/26 drops nine academy players on zero minutes.

Fourteen for United is correct rather than thin — squads were small and Ferguson
rarely rotated. Adjust with `--min-minutes` if a case appears where it is wrong;
Jérémie Aliadière at 260 minutes for the 2003/04 Arsenal side is the closest
call in the sample.

## Phase 2 — positions and formations

The game matches positions literally: an `LB` cannot fill an `LWB` slot. FBref
gives `DF`. Closing that gap is the only judgement in the factual half of the
pipeline, and judgement is where invented data comes from — so it is fenced in
two ways.

### The label is a constraint, not a hint

Whoever assigns positions never decides *whether* someone is a defender, only
*which kind*. `scripts/lib/positions.mjs` maps each FBref bucket to the
positions it permits, and `checkAssignment` rejects anything outside it. A
centre-back can no longer be recorded as a winger, structurally.

| FBref label | Share of players | Allowed |
| --- | --- | --- |
| `GK` | 8% | `GK` — nothing to decide |
| `FW` | 15% | `LW RW ST CF` |
| `DF` | 30% | `LB CB RB LWB RWB` |
| `MF` | 29% | `CDM CM CAM LM RM` |
| combined | 16% | both buckets, 9–10 options |

FBref orders a combined label by primacy — `DFMF` is a defender who also played
midfield, `MFDF` the reverse — so the **first** position assigned must come from
the **first** bucket. That is enforced too.

Three quarters of players are therefore a choice between four or five
candidates, and 8% need no choice at all.

### Positions are assigned per player, not per club-season

The same reasoning as ratings: one agent takes a player and assigns positions
across their whole career in a single pass. In the data so far, **no player's
FBref bucket changed between seasons**, so position is largely a property of the
player rather than the player-season — which makes the per-player pass both
cheaper and more consistent than 686 club-season passes.

### Formation is derived, not researched

Once players have positions, the shape falls out of who played. `lineupFit.ts`
takes the squad, finds the maximum matching between players and each formation's
eleven slots, and ranks formations by slots filled, then by the minutes of the
players filling them. A side with one keeper, four defenders, four midfielders
and two forwards is a 4-4-2 whether or not anyone wrote that down.

This matters beyond tidiness: a derived formation is reproducible and auditable,
while one recalled by an agent is neither. It also means phase 6 is mostly this
same computation — most-used XI from minutes, shape from the matching — rather
than another research pass.

`equallyGoodFormations` reports ties, so a genuine ambiguity between, say,
4-4-2 and 4-4-1-1 is visible rather than silently resolved.

### What still needs a person or an agent

- The specific position within the allowed set, for the 92% who are not
  goalkeepers.
- Confirming a derived formation where the fit is poor or tied, which is a much
  smaller list than 686.

## Phase 3 — the canonical player list

A script aggregates every appearance file into one list of distinct humans and,
for each, the club-seasons they need rating for.

This is what makes the identity problem go away rather than get patched. Names
are reconciled once, here, instead of hoping 680 independently-written files
happen to spell Srníček the same way.

## Phase 4 — ratings

Agents work **player-centric**, not club-centric: one agent takes a player and
rates every season of their career in a single pass.

Rating Giggs' twenty seasons together produces a coherent arc — emergence, peak,
decline. Twenty agents each rating one season in isolation produce jitter with
no shape, and for a game where you draft a specific player-season, that arc is
the product.

The rules are in [ratings.md](ratings.md). The one that governs everything:
**a player is rated on the player.** There is no squad quota and no expected
distribution. If a side genuinely had seven world-class players, it gets seven
ratings in the 90s.

### Running batches in parallel

Ten rating agents run at once comfortably. One rule, learned the hard way: give
each agent a **unique filename** for any script it writes to the scratchpad.

The scratchpad is shared, not per-agent. On the 1992/93 run two agents both
wrote `apply.mjs`, and one executed the other's script — it happened to write a
valid batch, so nothing was corrupted and the checker stayed green, but that was
luck. A clobbered write here is silent: the file it produces is well-formed, and
no check can tell it apart from the batch that should have been there.

Tell each agent to name its script after its own batch.

### Watching for drift

The per-batch mean falling as the batch number rises is expected, not a warning:
`players.json` is ordered by minutes played, so batch 1 holds the stars and the
last batch the fringe. On 1992/93 the means ran 76.5 down to 66.1, correlating
0.98 with median minutes.

That gradient does **not** show the ratings are sound. It is equally what you
would see if the agents had rated playing time instead of ability, which the
spec forbids. The test that separates the two is the correlation of rating with
minutes *within* one batch, where the ordering is gone — it came out between
-0.03 and 0.17 across the ten, so they were reading ability. Two spot checks
that say the same thing more directly: Grobbelaar 77 on 396 minutes, against
Mick Stockwell 67 on 3780.

Check the within-batch figure when a season finishes, not the gradient.

## Phase 5 — verification

A second agent checks ratings and positions independently, with the phase 1
`raw` rows to hand. An author defends their own reasoning; a checker with fresh
eyes and the source data does not.

## Phase 6 — lineups

Most-used XI comes from the appearance counts, formation from phase 2. This is
what the simulation fields for opponents and what Classic mode loads, and it is
currently the weakest data in the game — five 2025/26 clubs have no stored
lineup and fall back to "best keeper plus the ten highest-rated outfielders",
which puts four centre-backs and no full-backs in West Ham's side.

## Phase 7 — import

```bash
node scripts/import-squads.mjs --dry-run   # validate everything, change nothing
node scripts/import-squads.mjs             # write to SQLite
npm run export:data                        # refresh the shipped snapshot
```

Only this script writes to the database. Agents write files; the files are
reviewable in git; the import is idempotent and replaces a club-season
wholesale. Validation rules are in `scripts/lib/squad-file.mjs` and run in CI,
so a squad that breaks them cannot reach main.

## Second passes

The design assumes one source at a time, all the way through, then another
source as a separate pass. Phase 1 output is namespaced by source precisely so
a second collection can be diffed against the first rather than merged blindly
into it.
