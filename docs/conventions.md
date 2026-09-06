# Conventions

Match the surrounding code. Where this document and the code disagree, the code
is probably right and this document needs fixing.

## TypeScript

- `strict` is on. Do not add `any`; if a type is genuinely unknown, use
  `unknown` and narrow it.
- Prefer `type`/`interface` definitions near the top of the file that uses them.
  Types shared across modules live with the module that owns the concept —
  `Position` in `formations.ts`, `SquadPick` in `simulation.ts`, the `Data*`
  types in `gameData.ts`.
- Import types with `import type` or an inline `type` specifier when the import
  is types-only. `src/lib/formations.ts` must stay importable from a runtime
  that has no bundler.

## React

Next 16 ships the React Compiler lint rules and they are treated as errors.
Three patterns come up constantly:

### Do not call `setState` synchronously inside an effect

```ts
// no — flagged, and makes the store and component state two sources of truth
useEffect(() => { setThing(compute()); }, [dep]);

// yes — derive it
const thing = useMemo(() => compute(), [dep]);
```

`setState` inside a `.then()` callback is fine. Calling an `async` function from
an effect body is **not** — the rule cannot see past it. Write the fetch as a
promise chain:

```ts
// no
useEffect(() => { loadClubs(); }, []);

// yes
useEffect(() => { fetch('/api/clubs').then(r => r.json()).then(setClubs); }, []);
```

### Derive dependent data; do not clear it in an effect

When a selection changes and dependent data must go away, store the fetched
value **with the selection it belongs to** and derive the visible value:

```ts
const [loaded, setLoaded] = useState<{ clubId: number; players: Player[] } | null>(null);

useEffect(() => {
  if (!clubId) return;                       // no setState here
  const id = clubId;
  fetch(`/api/squads?clubId=${id}`).then(r => r.json())
    .then(players => setLoaded({ clubId: id, players }));
}, [clubId]);

const players = useMemo(
  () => (loaded?.clubId === clubId ? loaded.players : NO_PLAYERS),
  [loaded, clubId],
);
```

This also stops a previous selection's data showing while a new request is in
flight. Resetting a *choice* that a selection invalidates belongs in the change
handler, not an effect — see `changeClub` in `src/app/editor/squads/page.dev.tsx`.

Derived empty values use a module-level constant (`const NO_PLAYERS: Player[] = []`)
so they do not hand out a fresh reference every render.

### Read `localStorage` through `clientStorage`

Never call `localStorage` directly in a component. `src/lib/clientStorage.ts`
exposes it through `useSyncExternalStore`:

```ts
const picks = useStoredJson<SquadPick[]>('38-0-draft') ?? NO_PICKS;
writeStored('38-0-draft', next);   // re-renders every reader
clearStored('38-0-draft', '38-0-squad');
```

Server rendering gets `null`, so there is no hydration mismatch, and a write
from anywhere updates every component reading that key. A direct
`localStorage.getItem` in an effect is acceptable only for a one-shot check with
no `setState`, such as redirecting when a run has not been started.

### Refs

Do not read `ref.current` during render — it is a lint error. If a value needs
to appear in the output, it is state.

## Layout

This is headed for a phone, so a layout that only works on a desktop is a bug,
not a later refinement. Design for 360px first and add breakpoints upward
(`sm:` 640px, `md:` 768px, `lg:` 1024px, `xl:` 1280px).

The rules below are not phone rules. Every one of them is as true at 1920 as at
360, and two of the worst problems this codebase has had were a desktop
breakpoint quietly switching one of them off — a primary action released from
the bottom of the viewport at `sm:`, and the live simulation pushed below the
fold by an `lg:order` reversal. What a wide screen buys is **adjacency**: things
that were stacked can sit beside each other, so there is less scrolling and one
decision is visible at once. It does not buy bigger type, a bigger pitch or a
wider reading column. See [desktop-ux.md](desktop-ux.md) for the full argument
and the measurements behind it.

Rules that the current layouts hold to:

- **Nothing scrolls sideways.** `document.scrollWidth` must equal
  `window.innerWidth` at 360px. No fixed pixel widths that exceed a phone; use
  a preferred width with `maxWidth: '100%'` rather than `w-full`, which
  collapses to zero inside a shrink-to-fit flex parent (`items-center`,
  `items-start`) — `PitchView` is the worked example.
- **Every control is at least 32px tall**, ideally 44px. `py-2.5` on a
  `text-xs` button gets there; `py-1.5` does not. Add `touch-manipulation` to
  remove the 300ms tap delay.
- **Keep what the player is acting on in view.** A long list plus a control
  panel above it means the panel is off-screen exactly when it is needed; the
  draft's placement panel is `sticky top-2` for that reason. Where a page has a
  primary action, it sticks to the bottom on small screens (setup's "Start
  Draft").
- **Order content by what is changing.** During the live simulation the results
  page promotes the match panel above the squad with `order-1 lg:order-2`, so
  the animation is not two screens down. Use `flex flex-col gap-*` rather than
  `space-y-*` when ordering, since `space-y` follows DOM order.
- **Fold away what is not actionable.** Disabled "coming soon" tiles and a
  thirty-card selection list belong behind a summary once they are not the
  current task.
- Grids: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` rather than a fixed
  `grid-cols-4`, which turns long labels like "4-3-3 (CDM-CAM)" into three
  wrapped lines at 360px.
- **Cap a reading column; do not stretch it.** A row with a name on the left and
  a number on the right stops reading as one fact somewhere past 480px — the eye
  has to cross the gap to pair them. Give the leftover width to a second column
  or back to the margin. `max-w-xl` on the XI lists is the worked example.
- **Text is `#888` or brighter.** Against the `#0a0a0a` ground, `#888` is 5.6:1
  and `#666` is 3.8:1; `#555` is 2.7:1 and fails, and `#333` is invisible.
  `#666` is for a label that only has to be noticed, and anything below it is
  decoration. Greys that read as quiet at arm's length read as absent across a
  desk.
- **One meaning per colour, per screen.** Selected is green. A ranked quantity —
  a rating band, an odds ladder — is one hue at varying intensity, not four
  hues. Ratings go through `src/components/ratingColor.ts` so there is one
  scale; `LineRatings`' four colours are the legitimate categorical exception,
  since GK/DEF/MID/ATT are four different things rather than four levels of one.
- **Nothing inert may look interactive.** A disabled-looking chip next to a real
  button gets clicked, and a click that does nothing reads as a broken app. If
  something is a label, make it plainly a label and `pointer-events-none` when
  it sits inside a clickable row. If an option is unavailable, prefer leaving it
  out over rendering it greyed next to the real ones.
- **Every page below the top level has a back control.** `BackLink` at the top
  left; the footer nav is a site map, not a way out of where you are.

### Verifying

There is no automated visual check in CI, and screenshots are not worth a
dependency in `package.json`. Install Playwright outside the repo when you need
to look:

```bash
cd "$(mktemp -d)" && npm init -y && npm i playwright && npx playwright install chromium
```

Then drive `npm run dev` (or a static server over `./out`) at 360×740 and
390×844, seeding `localStorage` with `38-0-setup`, `38-0-squad` and `38-0-plan`
to reach the draft, pre-season and results pages. Assert
`scrollWidth - innerWidth === 0` and collect any control under 32px tall; those
two measurements catch most regressions without having to eyeball anything.
Check the real static build too, not just the dev server — the dev overlay badge
is not present in production.

Take the same two measurements at **1440×900 and 820×1180**, plus four more
that only fail on a big screen:

- the primary action of the screen is visible without scrolling;
- the thing that is currently changing is in the top half of the viewport;
- `scrollHeight / innerHeight` — how many screens the page is. Setup, the
  pre-season screen and the live results were 2.5, 2.7 and 2.0 screens at
  1440×900, and classic mode was 13.1;
- no text below `#666` that a player is expected to read.

If 820px looks like 360px with wider margins, the middle has not been designed.

## Files and naming

- `page.tsx` / `route.ts` for the deployed game; **`page.dev.tsx` /
  `route.dev.ts` for anything that must not ship** (see
  [architecture.md](architecture.md)).
- Tests sit next to what they test: `src/lib/simulation.ts` →
  `src/lib/simulation.test.ts`.
- Scripts in `scripts/`, plain `.mjs`, run with `node`.

## Style

The existing code has habits worth keeping:

- Section headers in longer files:
  `// ── Standings helpers ─────────────────────────────────`
- Aligned assignments in blocks of related declarations.
- Comments explain **why**, not what. `simulation.ts` is the model to follow:
  every magic number has a sentence saying what it represents.
- 2-space indent, single quotes, semicolons, trailing commas in multi-line
  literals.

## Tests

`vitest`, `environment: 'node'`, files matched by `src/**/*.test.ts`.

- Test behaviour, not implementation. The simulation tests assert invariants
  (points equal `3W + D`, the schedule is a true double round robin) rather than
  specific scorelines, so tuning does not break them.
- Name tests as sentences about behaviour: `it('never has a team face itself')`.
- Anything random takes an explicit seed or an injected source of randomness.
  `pickRandomSquad` accepts a `random` parameter for exactly this reason.
- Where a value is known to be wrong but is not being fixed in this change, test
  the shape and record the problem in [known-issues.md](known-issues.md). Do not
  encode a bug as expected behaviour.
- The snapshot integrity tests in `gameData.test.ts` guard committed data. If
  one fails after `npm run export:data`, fix the database.

## Commits

Conventional-commit prefixes, already used throughout the history:
`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `style`, with
an optional scope (`feat(sim):`, `refactor(editor):`).

Subject in the imperative, under ~72 characters. Body explains why, and states
anything a reader would otherwise have to reverse-engineer. Group related
changes into one commit; do not mix a refactor with a behaviour change.

## Before opening a pull request

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

That is exactly what CI runs, and the `Verify` job must pass before a PR can
merge. See [ci-and-deployment.md](ci-and-deployment.md).
