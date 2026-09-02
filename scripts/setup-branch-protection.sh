#!/usr/bin/env bash
#
# Requires pull requests into the default branch, and requires the CI "Verify"
# job to pass before one can be merged.
#
# Run once, after the repository exists on GitHub and CI has run at least once:
#
#   bash scripts/setup-branch-protection.sh
#
# Re-running updates the existing ruleset rather than creating a second one.
# Needs the GitHub CLI, authenticated with admin rights on the repository:
#
#   gh auth login
#
set -euo pipefail

RULESET_NAME="Protect default branch"
# Must match the `name:` of the job in .github/workflows/ci.yml.
REQUIRED_CHECK="Verify"

if ! command -v gh >/dev/null 2>&1; then
  echo "The GitHub CLI (gh) is not installed: https://cli.github.com" >&2
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
echo "Repository: $REPO"

read -r -d '' PAYLOAD <<JSON || true
{
  "name": "$RULESET_NAME",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "$REQUIRED_CHECK" }
        ]
      }
    }
  ]
}
JSON

EXISTING_ID=$(gh api "repos/$REPO/rulesets" --jq \
  ".[] | select(.name == \"$RULESET_NAME\") | .id" 2>/dev/null || true)

if [ -n "$EXISTING_ID" ]; then
  echo "Updating ruleset $EXISTING_ID"
  printf '%s' "$PAYLOAD" | gh api --method PUT "repos/$REPO/rulesets/$EXISTING_ID" --input - >/dev/null
else
  echo "Creating ruleset"
  printf '%s' "$PAYLOAD" | gh api --method POST "repos/$REPO/rulesets" --input - >/dev/null
fi

cat <<EOF

Done. On the default branch of $REPO:

  - direct pushes are refused; changes go through a pull request
  - the CI job "$REQUIRED_CHECK" must pass before a PR can merge
  - a PR must be up to date with the base branch before merging, so main is
    tested as it will actually exist after the merge
  - the branch cannot be deleted or force-pushed

Notes:

  - Reviews are not required (required_approving_review_count is 0), so you can
    merge your own PRs once CI is green. Raise that number to require review.
  - "$REQUIRED_CHECK" must have reported on the repository at least once before
    GitHub will offer it as a required check. Open a throwaway PR first if the
    ruleset appears to have no effect.
  - To let yourself bypass the rules in an emergency, add a bypass actor:
    Settings -> Rules -> "$RULESET_NAME" -> Bypass list.
EOF
