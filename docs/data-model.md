# Data model

Data lives in two forms: a SQLite database you edit, and a JSON snapshot the
game ships with. The database is the source of truth; the snapshot is generated
from it and committed.

## SQLite (authoring)

`data/38-0.db`, gitignored. Created and seeded on first use by
`src/lib/db.ts`, which also runs forward migrations from earlier schemas.

### Three-level player model

```
players ──< player_versions ──< squad_entries >── clubs
                                      │
                                      └────────── seasons
```

- **`players`** — the person. Name and nationality. One row per human.
- **`player_versions`** — the person *at a point in their career*: a rating, a
  set of positions, a set of roles. Thierry Henry has several.
- **`squad_entries`** — a version placed at a club in a season.

The middle level is the whole point. It is why 2003/04 Henry can be rated 97 as
an Arsenal striker while 1999/00 Henry is a different, weaker version, and why
drafting "Henry" is meaningless without also saying which season. Anything that
resolves a player must carry `clubId` and `seasonId` alongside `playerId`.

### Lineups

- **`team_lineups`** — one formation per club-season.
- **`lineup_slots`** — which player fills slot 0–10 of that formation.

A stored lineup is what the simulation fields for an opponent, and what Classic
mode loads. Without one, the fallback is "best keeper plus the ten highest-rated
outfielders", which ignores shape and can produce a back four of centre-backs.
Storing a lineup is how you fix that for a club.

### Roles

**`role_config`** holds the 24 roles and their tuning: goal and assist
multipliers, the positions each role is valid at, and team-strength
contributions. It is editable at `/editor/roles`, and the stored values override
the defaults compiled into `src/lib/simulation.ts`. The database is
authoritative — several roles have been tuned away from the code defaults, so do
not read `ROLE_GOAL_MULT` in `simulation.ts` and assume that is what the game
uses.

### Known schema weakness

`lineup_slots.player_id` references `players(id)`, **not** squad membership. If
you remove a player from a squad, their lineup slot survives, pointing at
someone who is no longer in that club-season.

`npm run export:data` detects this, drops the affected slots, and prints them.
If you see that warning, open `/editor/lineups` for the club named and refill
the empty slot. A proper fix would add a constraint tying a slot to a squad
entry rather than a player.

## JSON snapshot (the game)

`src/data/game-data.json`, committed, ~268 KB pretty-printed. Currently 22
clubs, 34 seasons, 52 club-seasons, 906 squad entries, 36 lineups, 24 roles.

```jsonc
{
  "clubs":   [{ "id", "name", "shortName", "color", "league" }],
  "seasons": [{ "id", "label", "yearStart" }],
  "squads":  [{ "clubId", "seasonId",
                "players": [{ "playerId", "name", "nationality",
                              "rating", "positions": [], "roles": [] }] }],
  "lineups": [{ "clubId", "seasonId", "formation",
                "slots": [{ "slotIndex", "playerId" }] }],
  "roles":   [{ "name", "label", "goalMult", "assistMult",
                "validPositions": [], "description",
                "attContrib", "midContrib", "defContrib" }]
}
```

Differences from the database, on purpose:

- `positions` and `roles` are **arrays**, not JSON strings. Nothing in the game
  parses them.
- Squad players are pre-sorted by rating, best first.
- `player_versions` is flattened away; a squad entry carries its version's
  rating, positions and roles directly.
- Lineup slots that name a player outside the squad are dropped.

It is written pretty-printed so that a data change produces a readable diff. The
bundler minifies it, so this costs nothing at runtime.

`src/lib/gameData.ts` is the only module that reads it. Everything else goes
through the functions there.

## The editing workflow

```bash
npm run dev            # open http://localhost:3000/editor
# ... make changes in the editor UI ...
npm run export:data    # regenerate the snapshot
npm test               # the snapshot integrity tests run here
git add src/data/game-data.json && git commit
```

**Forgetting the export is the most likely data mistake.** The editor writes to
SQLite; the game reads the snapshot. Until you export, the game still shows the
old data, and CI has no way to notice — the database is gitignored, so CI cannot
compare the two.

## Snapshot invariants

`src/lib/gameData.test.ts` enforces these against the committed file. If one
fails after an export, fix the database rather than the test:

- every squad names a club and season that exist
- one squad per club-season; no player listed twice within it
- every player has at least one valid position and a rating in 1–99
- squads are sorted by rating, descending
- every role a player is given exists in `role_config`
- every lineup names a formation the app knows, uses slot indices 0–10 at most
  once each, and only names players who are in that squad

## Current data gaps

Recorded in more detail in [known-issues.md](known-issues.md):

- 2025/26 is roughly 43% of all squad entries; several older seasons have a
  single club, and 2002/03 has one player.
- Five players appear at two clubs in the same 2025/26 season (real transfers
  entered at the destination without removing the origin), so they can appear
  twice on a league leaderboard.
- Only 52 club-seasons exist to draft from, which is the real ceiling on the
  variety of a run.
