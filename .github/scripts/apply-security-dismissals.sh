#!/usr/bin/env bash
# Applies Tier 1's false-positive dismissals from daily-claude-run.yml.
# Claude's own token can't call the code-scanning API (see
# prepare-security-alerts.sh for why), so when it judges an alert a false
# positive it writes its verdict to a plain file instead of dismissing it
# directly. This step, running with GITHUB_TOKEN, does the actual dismissal.
set -uo pipefail

REPO="${GITHUB_REPOSITORY:?}"
FILE="${RUNNER_TEMP:?}/security-alerts/dismissals.json"

if [ ! -f "$FILE" ]; then
  echo "No dismissals file, nothing to do."
  exit 0
fi

count=$(jq 'length' "$FILE")
echo "Dismissals requested: $count"

for i in $(seq 0 $((count - 1))); do
  entry=$(jq ".[$i]" "$FILE")
  number=$(echo "$entry" | jq -r '.number')
  comment=$(echo "$entry" | jq -r '.comment')
  # GitHub caps dismissed_comment at 280 characters -- truncate defensively
  # in case Claude's explanation ran long.
  comment="${comment:0:280}"

  if gh api "repos/$REPO/code-scanning/alerts/$number" -X PATCH \
       -f state=dismissed -f dismissed_reason="false positive" -f dismissed_comment="$comment" >/dev/null 2>&1; then
    echo "Alert #$number: dismissed"
  else
    echo "Alert #$number: dismissal call failed (already dismissed? bad comment? check manually)"
  fi
done
