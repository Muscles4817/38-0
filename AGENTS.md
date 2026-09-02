<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 38-0

A football draft game: spin for random club-seasons from English top-flight
history, build an XI, simulate a 38-game season against the real current squads.

## Read before changing anything

The design documentation in [`docs/`](docs/) exists so a fresh session can make
a change that fits how this codebase already works. At minimum, read
[`docs/README.md`](docs/README.md) — it is short and says which of the others
apply to what you are doing.

- [`docs/architecture.md`](docs/architecture.md) — the static/authoring split
- [`docs/conventions.md`](docs/conventions.md) — React, TypeScript, tests, commits
- [`docs/data-model.md`](docs/data-model.md) — squads, lineups, roles, the snapshot
- [`docs/simulation.md`](docs/simulation.md) — how a season is produced
- [`docs/known-issues.md`](docs/known-issues.md) — measured problems, already triaged
- [`docs/ci-and-deployment.md`](docs/ci-and-deployment.md) — workflows and Pages

## The constraint that shapes everything

**The game must run with no server.** It reads the committed JSON snapshot in
`src/data/` and does everything else in the browser, because it is deployed as a
static site and is headed for mobile.

SQLite, `/editor` and `/api` are authoring tools. They only exist under
`npm run dev`, are named `*.dev.ts` / `*.dev.tsx`, and are excluded from the
build by `next.config.ts`.

**If the game needs to `fetch('/api/...')` at runtime, the change is wrong.**
Add the function to `src/lib/gameData.ts` instead.

## Before you finish

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

These four are exactly what CI runs, and the `Verify` job is a required check
on pull requests. Run them.

If you changed data in the editor, also run `npm run export:data` and commit
`src/data/game-data.json` — nothing else propagates a data change to the game,
and CI cannot detect that you forgot.

## Keep the docs true

If a change makes something in `docs/` wrong, fix it in the same commit. If you
measure something about the simulation, record the numbers there.
