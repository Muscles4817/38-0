# CI and deployment

## Workflows

### `.github/workflows/ci.yml`

Runs on every pull request and every push to `main`. One job, **`Verify`**:

```
npm ci → npm run lint → npm run typecheck → npm test → npm run build
```

The build step is not redundant. It proves the static export still succeeds, so
`main` is always deployable.

### `.github/workflows/deploy.yml`

Runs on every push to `main`, and on demand via **Actions → Deploy to GitHub
Pages → Run workflow**.

`Build` repeats lint, typecheck and tests, then builds with the correct
`basePath` and uploads `./out`. `Deploy` publishes it.

The gates are repeated on purpose. This workflow is the last thing to run before
the live site changes, so it re-checks the merged result rather than trusting
that CI passed on the pull request before merge.

**If you change the steps in one workflow, change them in the other.**

## One-time setup

### 1. Push the repository

```bash
gh repo create 38-0 --private --source=. --remote=origin --push
```

The default branch must be `main`; both workflows key off it.

### 2. Enable Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

Until this is done, `actions/configure-pages` fails and every push to `main`
produces a failed deploy run.

### 3. Apply the branch rules

```bash
bash scripts/setup-branch-protection.sh
```

This creates a repository ruleset on the default branch that:

- refuses direct pushes — changes go through a pull request
- requires the CI job **`Verify`** to pass before a PR can merge
- requires a PR to be up to date with `main` before merging, so it is tested as
  it will actually exist after the merge — this is what stops two individually
  green PRs combining into a broken `main`
- blocks deletion and force-pushes

Reviews are not required, so you can merge your own PRs once CI is green. Raise
`required_approving_review_count` in the script to change that.

**GitHub only offers a status check as "required" once it has reported on the
repository at least once.** If the ruleset seems to have no effect, open a
throwaway PR so `Verify` runs, then re-run the script.

## Base path

A GitHub Pages *project* site is served from `https://<user>.github.io/<repo>/`,
so Next needs `basePath: '/<repo>'` — set at build time and baked into the
bundle.

The deploy workflow reads it from `actions/configure-pages`
(`steps.pages.outputs.base_path`) and maps `/` to empty, which is what a
user/organisation site (`<user>.github.io`) needs. Nothing has to be hard-coded,
and renaming the repository does not require a code change.

To reproduce a Pages build locally:

```bash
NEXT_PUBLIC_BASE_PATH=/38-0 npm run build     # bash
$env:NEXT_PUBLIC_BASE_PATH='/38-0'; npm run build   # PowerShell
npx serve out                                  # or any static server
```

In Git Bash, `NEXT_PUBLIC_BASE_PATH=/38-0` gets mangled into a Windows path by
MSYS. Prefix with `MSYS_NO_PATHCONV=1`, or use PowerShell.

## What is and is not deployed

Deployed: `/`, `/draft`, `/classic`, `/results`, and the bundled data snapshot.

Not deployed: `/editor/**`, `/api/**`, `data/38-0.db`. They are excluded by the
`*.dev.ts` naming convention described in [architecture.md](architecture.md).
The nav hides the Editor link outside development for the same reason.

`public/.nojekyll` is required: without it GitHub Pages runs Jekyll, which
ignores the `_next/` directory and the site loads with no JavaScript or CSS.

## Data and CI

The database is gitignored, so **CI cannot tell whether
`src/data/game-data.json` is up to date.** If you change data in the editor and
forget `npm run export:data`, CI stays green and the deployed game shows the old
data.

What CI does check is that whatever snapshot is committed is internally
consistent — see the integrity tests in `src/lib/gameData.test.ts`.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Deploy fails at "Configure Pages" | Pages not enabled, or source is not GitHub Actions |
| Site loads unstyled with no interactivity | `public/.nojekyll` missing |
| Assets 404 under `/<repo>/` | Built without `NEXT_PUBLIC_BASE_PATH` |
| `Verify` not offered as a required check | It has not run on the repository yet |
| Build fails on a route handler | An `/api` route was added without the `.dev.ts` suffix |
| `\r: command not found` in a workflow | Line endings; `.gitattributes` should be forcing LF |
