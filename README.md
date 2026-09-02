# 38-0

Draft your greatest all-time English top-flight XI, then find out how it does
over a season.

Pick an era and a formation, spin for a random club-season, take one player from
the squad you are offered, and choose where they play. Repeat eleven times, with
a limited number of rerolls, then drop the XI into a simulated 38-game Premier
League campaign against the real current squads — gameweek by gameweek, with a
live table, scorers, awards and a season report.

**Classic mode** skips the draft and lets you take a finished side — the 2003/04
Invincibles, the 1999 treble winners — into the same season.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

The first run creates and seeds `data/38-0.db`, a local SQLite database used by
the data editor at http://localhost:3000/editor.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Game and editor, backed by SQLite |
| `npm run build` | Static export of the game into `./out` |
| `npm test` | Run the test suite |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run export:data` | Regenerate `src/data/game-data.json` from the database |

## How it is put together

The deployed game is **fully static**. It reads a committed JSON snapshot and
runs the simulation in your browser — no server, no database. The SQLite
database and the editor are authoring tools that only run locally; they are
excluded from the build.

Edit data in the editor, run `npm run export:data`, commit the snapshot.

```
Next.js 16 · React 19 · TypeScript · Tailwind 4 · SQLite (authoring) · Vitest
```

## Documentation

Design documentation lives in [`docs/`](docs/):

- [Architecture](docs/architecture.md) — the static/authoring split and why
- [Conventions](docs/conventions.md) — how to write code that fits
- [Data model](docs/data-model.md) — squads, lineups, roles, the snapshot
- [Simulation](docs/simulation.md) — how a season is produced, and its known
  calibration problems
- [CI and deployment](docs/ci-and-deployment.md) — workflows, Pages, branch rules
- [Known issues](docs/known-issues.md) — measured and triaged

## Deploying

Pushing to `main` publishes to GitHub Pages. One-time setup — enabling Pages and
applying the branch rules — is in
[docs/ci-and-deployment.md](docs/ci-and-deployment.md#one-time-setup).
