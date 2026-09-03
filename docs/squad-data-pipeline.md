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

Phase 1 cannot supply these. Position labels are too coarse, and formation is
not in an appearance table at all.

This phase takes the phase 1 roster as given — it does **not** re-derive who was
in the squad — and resolves, per club-season:

- the formation the side actually used, and any second shape they switched to
- each player's specific positions that season, from the fifteen the game knows

```jsonc
{
  "club": "Manchester United",
  "season": "1993/94",
  "formation": "4-4-2",
  "alternativeFormations": ["4-3-2-1"],
  "formationNote": "Ferguson's standard shape; Cantona often withdrawn behind Hughes",
  "source": "https://...",
  "players": [
    { "name": "Denis Irwin", "positions": ["LB", "RB"], "note": "played both flanks" }
  ]
}
```

Splitting this from ratings matters: positions are checkable facts, ratings are
not, and mixing them means a rating dispute forces you to re-litigate positions
too.

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
