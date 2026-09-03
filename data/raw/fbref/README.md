# FBref exports — how to fill these in

686 empty files, one per Premier League club-season from 1992/93 to 2025/26.
Open one, paste, save. Nothing else to do.

## What to paste

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
