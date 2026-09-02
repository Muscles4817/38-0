# 38-0 — design documentation

38-0 is a football draft game. You pick an era and a formation, spin for random
club-seasons from English top-flight history, build an XI out of the players you
are offered, and drop that XI into a simulated 38-game Premier League season
against the current real squads.

These documents exist so that anyone — including an AI agent starting a fresh
session with no memory of previous ones — can make a change that fits the way
the codebase already works.

## Read these first

| Document | Read it when |
| --- | --- |
| [architecture.md](architecture.md) | Before adding a file, a route or a dependency. Explains the static/authoring split, which is the single most important constraint here. |
| [conventions.md](conventions.md) | Before writing React, tests or commits. |
| [data-model.md](data-model.md) | Before touching squads, lineups, roles or the JSON snapshot. |
| [simulation.md](simulation.md) | Before changing anything that affects match results, ratings or awards. |
| [ci-and-deployment.md](ci-and-deployment.md) | Before changing the build, the workflows, or how the site is published. |
| [known-issues.md](known-issues.md) | Before starting work — the thing you are about to fix may already be recorded, measured and prioritised here. |

## The one rule that matters most

**The game must keep running with no server.** It reads a committed JSON
snapshot and does everything else in the browser. The SQLite database and the
`/editor` UI are authoring tools that only exist on a developer machine.

If you find yourself adding an API route that the game calls at runtime, stop:
that breaks the deploy and the eventual move to mobile. See
[architecture.md](architecture.md).

## Commands

```bash
npm run dev          # game + editor, backed by the local SQLite database
npm run build        # static export of the game only, into ./out
npm test             # vitest, no watch
npm run test:watch   # vitest in watch mode
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run export:data  # regenerate src/data/game-data.json from the database
```

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` are exactly
what CI runs. Run all four before opening a pull request.

## Keeping these documents true

A document that has drifted from the code is worse than no document. If a change
makes something here wrong, fix it in the same commit. Prefer deleting a stale
paragraph over leaving it.

Where a number appears (line counts, measured simulation output, snapshot
sizes), it was measured at the time of writing and is there to give a sense of
scale, not as something to assert against.
