# Architecture

## The split

The repository holds two things that look like one application:

**The game.** Fully static. No server, no database at runtime. It reads a
committed JSON snapshot and runs the simulation in the browser. This is what
gets deployed.

**The authoring tools.** The SQLite database, the `/editor` UI and the `/api`
routes behind it. These only run under `npm run dev`, on a machine that has the
database. They are never deployed.

```
  AUTHORING (developer machine only)          GAME (deployed)

  data/38-0.db  ── gitignored                 src/data/game-data.json
        ▲                                            │  committed
        │ read/write                                 │
  src/lib/db.ts                                      ▼
        ▲                                     src/lib/gameData.ts
        │                                            │
  src/app/api/**/route.dev.ts                        ▼
        ▲                              src/lib/simulation.ts  formations.ts
        │ fetch                                      │
  src/app/editor/**/page.dev.tsx                     ▼
                                       app/page.tsx  draft  results  classic
        │                                            │
        └────── npm run export:data ─────────────────┘
```

The bridge between the two halves is one command:

```bash
npm run export:data
```

It dumps the database into `src/data/game-data.json`, which is committed. Edit
data in the editor, run the export, commit the snapshot. Nothing else moves
data between the halves.

## Why it is built this way

Two reasons, and they point the same direction:

1. **Static hosting.** GitHub Pages serves files. It cannot run a Node process
   or open a SQLite file, so anything the game needs at runtime has to be in the
   bundle.
2. **Mobile.** The long-term aim is a mobile game. A phone should not seed a
   database from a 1,900-line seed file on first launch; it should ship with a
   read-only dataset and compute locally. That is the same architecture.

So the static-export constraint is not a limitation being worked around. It is
the target architecture, arrived at early.

## Layers

| Layer | Files | ~Lines | Depends on |
| --- | --- | --- | --- |
| Game logic | `src/lib/formations.ts`, `simulation.ts`, `nationalities.ts` | 1,140 | nothing |
| Data access | `src/lib/gameData.ts`, `src/data/game-data.json` | 330 | game logic |
| Game UI | `src/app/{page,draft,results,classic}`, `src/components/*` | 2,300 | data access, game logic |
| Authoring | `src/lib/db.ts`, `src/app/api/**`, `src/app/editor/**`, `scripts/export-game-data.mjs` | 4,600 | SQLite |
| Tests | `src/lib/*.test.ts` | 865 | everything above |

### Dependency rules

- **`src/lib/formations.ts` and `src/lib/simulation.ts` import nothing.** Not
  React, not Next, not Node built-ins, not the DOM. They are the part that
  survives a move to React Native unchanged. Keep them that way.
- **`src/lib/gameData.ts` imports only the JSON snapshot and the game logic.**
  Same reasoning; it is the data API a mobile client would also use.
- **Nothing outside `src/app/api/**`, `src/lib/db.ts` and `scripts/` may import
  `better-sqlite3` or `src/lib/db.ts`.** It is a devDependency and does not
  exist in a deployed build.
- **The game UI must not `fetch('/api/...')`.** Those routes are absent from the
  static build. Call `src/lib/gameData.ts` instead.

## How dev-only code is excluded

Files that must not reach the deployed build are named `*.dev.ts` /
`*.dev.tsx`. `next.config.ts` registers those page extensions only when the dev
server is the caller:

```ts
export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return { pageExtensions: ['tsx', 'ts', 'dev.tsx', 'dev.ts'] };
  }
  return { pageExtensions: ['tsx', 'ts'], output: 'export', /* ... */ };
}
```

Next only treats a file as a route when its name matches `page.<ext>`,
`route.<ext>` or `layout.<ext>` for a registered extension. `page.dev.tsx` is
invisible to a build that has not registered `dev.tsx`.

To add a new editor page or API route, name it `page.dev.tsx` /
`route.dev.ts`. To confirm something is excluded, `npm run build` and check that
it is not in the route list or in `./out`.

## State and navigation

A run in progress lives in `localStorage`, not in a server session:

| Key | Written by | Read by |
| --- | --- | --- |
| `38-0-setup` | setup page, classic page | draft, results |
| `38-0-draft` | draft page | draft |
| `38-0-squad` | draft page, classic page | results |
| `38-0-seen-squads` | draft page | results ("What Could Have Been") |

Those keys are read through `src/lib/clientStorage.ts`, which wraps them in
`useSyncExternalStore` so a write anywhere re-renders every reader and server
rendering gets a defined empty snapshot. Do not call `localStorage` directly in
a component; see [conventions.md](conventions.md).

## Where mobile goes from here

Nothing below needs the architecture to change:

- **PWA** — a manifest and a service worker on top of the existing static build.
- **Capacitor** — wraps the same `./out` as an iOS/Android app.
- **React Native / Expo** — `src/lib/` ports as-is; the UI layer is rewritten,
  since Tailwind classes and `<div>` do not exist there.

The UI is currently desktop-first and merely stacks on narrow screens
(`flex-col lg:flex-row`). A real touch and layout pass is outstanding work
whichever route is taken.
