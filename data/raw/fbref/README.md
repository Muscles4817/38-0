# FBref exports — how to fill these in

686 empty files, one per Premier League club-season from 1992/93 to 2025/26.
Open one, paste, save. Nothing else to do.

## The fast way: one paste per league-season

Every league season on FBref has a stats page listing **every player in the
league** with a `Squad` column — e.g.
<https://fbref.com/en/comps/11/1997-1998/stats/1997-1998-Serie-A-Stats>
(Competition page → *Player Stats* → *Standard Stats*).

1. Scroll to the **Player Standard Stats** table (the big one, not *Squad
   Standard Stats* at the top).
2. *Share & Export* → *Get table as CSV (for Excel)*, copy it.
3. Paste into any file, say `~/serie-a-1997-98.csv`, and run:

```bash
npm run data:split -- ~/serie-a-1997-98.csv --competition serie-a --season 1997-98
```

That writes one file per club into `data/raw/fbref/serie-a/1997-98/`, in the
same shape as a club-page export, so `ingest-fbref.mjs` reads it unchanged.
Players who moved mid-season appear once per club, as they would on the club
pages. Files that already have content are skipped unless you pass `--force`.

- `--only juventus,internazionale` — just the sides you want in the game.
- `--dry-run` — show which files would be written.

- `--rename "Milan=ac-milan"` — force a club into a given file.

**How clubs are matched to files.** The league table uses FBref's short names
("Tottenham", "Manchester Utd", "Milan"). Each goes, in order, to: a
`--rename`; an exact existing file via the `_aliases` map in `data/clubs.json`;
then the one existing file the short name sits inside (`Tottenham` →
`tottenham-hotspur.csv`, `Bournemouth` → `afc-bournemouth.csv`). For Serie A,
La Liga and the rest, files from *other seasons* of that competition count too,
so `Milan` lands in `ac-milan.csv` if that is the slug already in use.

The script writes nothing for a club that is ambiguous, or that would share a
file with another club, and lists it under *not written* with a non-zero exit.
For the Premier League it also never creates a file: every club-season is
already scaffolded, so a club with no match means the name is wrong. Outside
the Premier League an unknown club gets a new file, marked `written (new
club)` — check that slug title-cases into the right name, or add an alias.

The FBref id stays in the last column, which is what positions and ratings are
carried forward by.

Competition ids for the URL: Premier League 9, Serie A 11, La Liga 12,
Bundesliga 20.

## What to paste (one club at a time)

The **Standard Stats** table from that club's FBref season page, exported as
CSV. Paste it whole — the two header rows and the `Squad Total` /
`Opponent Total` lines at the bottom are expected and get stripped on import.

The file it goes in is named for the club and sits under its season:

```
data/raw/fbref/premier-league/1993-94/manchester-united.csv
data/raw/fbref/premier-league/2023-24/luton-town.csv
```

An empty file means "not done yet", so leave the ones you have not filled in
alone rather than deleting them.

## Progress

```bash
node scripts/scaffold-fbref-files.mjs --status
```

Shows a per-season table of how many are filled in, the overall percentage, and
which files to do next.

If a season is missing entirely — a new one, say — re-run the scaffolder without
`--status`. It never overwrites a file that already has content.

## Why by hand

fbref.com sits behind a Cloudflare challenge that refuses automated requests,
including for `robots.txt`. That is a deliberate access control and not
something to engineer around, so the exports are supplied manually.

It is also simply better data than anything reachable: league-only appearances,
minutes played, starts separated from substitute outings, age, nationality, and
a stable per-player FBref id. That id is what makes player identity exact across
30 years instead of a name-matching guess.

## Club naming

The filenames use one slug per club, and `data/clubs.json` carries an `_aliases`
map for the spellings that differ between sources — `AFC Bournemouth` and
`Bournemouth`, `Brighton and Hove Albion` and `Brighton`. If you hit a club name
that does not resolve, add it there rather than renaming a file.

## What happens next

Nothing in this directory is read by the game. It is the raw factual layer:

1. these exports — rosters, appearances, minutes
2. positions and formations — a separate research pass over the same rosters
3. the canonical player list, derived from the FBref ids
4. ratings
5. verification
6. lineups
7. import into SQLite, then `npm run export:data`

See [../../docs/squad-data-pipeline.md](../../docs/squad-data-pipeline.md).
