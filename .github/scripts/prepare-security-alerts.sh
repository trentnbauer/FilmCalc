#!/usr/bin/env bash
# Prefetches everything Tier 1 of daily-claude-run.yml needs from the
# code-scanning API, using GITHUB_TOKEN (which has security-events access
# from this job's `permissions:` block). The Claude GitHub App's own
# installation token doesn't have that scope at all -- requesting it via
# additional_permissions hard-fails the App's token exchange -- so Claude
# can't call these endpoints itself. This script does the scoped API work
# up front and hands Claude a plain manifest + SARIF files to read instead.
#
# Also does the Copilot Autofix generate+commit dance per alert, since
# that's also security-events-scoped. Claude's job is then just to review
# the resulting branch (if any), decide whether to keep/replace/drop it,
# and open/merge the PR -- all of which its own token can already do.
set -uo pipefail

REPO="${GITHUB_REPOSITORY:?}"
OUTDIR="${RUNNER_TEMP:?}/security-alerts"
SARIF_DIR="$OUTDIR/sarif"
MANIFEST="$OUTDIR/manifest.json"

mkdir -p "$SARIF_DIR"
echo "[]" > "$MANIFEST"

urlencode() {
  python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1"
}

# Compute each alert's effective severity up front (falling back to "low"
# for a plain `error`-severity rule with no security_severity_level, same
# rule the prompt uses), drop lint-level alerts entirely, and sort most
# severe first so critical/high get processed before low.
alerts_json=$(gh api "repos/$REPO/code-scanning/alerts" --paginate -q '
  [.[] | select(.state=="open")]
  | map(. + {severity: (.rule.security_severity_level // (if .rule.severity == "error" then "low" else null end))})
  | map(select(.severity != null))
  | sort_by(.severity as $s | ["critical","high","medium","low"] | index($s))
')
count=$(echo "$alerts_json" | jq 'length')
echo "Open, actionable code-scanning alerts: $count"

for i in $(seq 0 $((count - 1))); do
  alert=$(echo "$alerts_json" | jq ".[$i]")
  number=$(echo "$alert" | jq -r '.number')
  rule_id=$(echo "$alert" | jq -r '.rule.id')
  severity=$(echo "$alert" | jq -r '.severity')
  ref=$(echo "$alert" | jq -r '.most_recent_instance.ref')

  existing=$(gh pr list --repo "$REPO" --state open --search "$rule_id in:title" --json number -q 'length')
  if [ "$existing" -gt 0 ]; then
    echo "Alert #$number ($rule_id): PR already open, skipping"
    continue
  fi

  # Find the most recent analysis on this ref whose SARIF actually contains
  # this alert's rule -- there can be several analyses per ref (one per
  # CodeQL language/category), so take the first (most recent) match.
  encoded_ref=$(urlencode "$ref")
  sarif_file=""
  analysis_ids=$(gh api "repos/$REPO/code-scanning/analyses?ref=$encoded_ref" -q '.[].id' 2>/dev/null)
  for aid in $analysis_ids; do
    candidate="$SARIF_DIR/$aid.json"
    if gh api -H "Accept: application/sarif+json" "repos/$REPO/code-scanning/analyses/$aid" > "$candidate" 2>/dev/null; then
      if jq -e --arg rid "$rule_id" '.runs[].results[]? | select(.ruleId==$rid)' "$candidate" >/dev/null 2>&1; then
        sarif_file="$candidate"
        break
      fi
      rm -f "$candidate"
    fi
  done

  branch="security-${rule_id//\//-}-${number}-$(date -u +%Y-%m-%d)"
  autofix_status="unavailable"
  autofix_description=""

  fix_status=$(gh api "repos/$REPO/code-scanning/alerts/$number/autofix" -q '.status // empty' 2>/dev/null)
  if [ -z "$fix_status" ]; then
    gh api -X POST "repos/$REPO/code-scanning/alerts/$number/autofix" >/dev/null 2>&1
    fix_status=""
  fi
  for attempt in 1 2 3 4 5 6; do
    [ "$fix_status" = "success" ] || [ "$fix_status" = "error" ] || [ "$fix_status" = "outdated" ] && break
    sleep 10
    fix_status=$(gh api "repos/$REPO/code-scanning/alerts/$number/autofix" -q '.status // empty' 2>/dev/null)
  done

  if [ "$fix_status" = "success" ]; then
    autofix_description=$(gh api "repos/$REPO/code-scanning/alerts/$number/autofix" -q '.description // empty' 2>/dev/null)
    git branch "$branch" origin/main
    git push origin "$branch" 2>&1
    if gh api -X POST "repos/$REPO/code-scanning/alerts/$number/autofix/commits" -f target_ref="refs/heads/$branch" >/dev/null 2>&1; then
      autofix_status="committed"
    else
      autofix_status="commit_failed"
      echo "Alert #$number: autofix commit call failed, branch left empty"
    fi
  else
    echo "Alert #$number: no usable Autofix suggestion (status: ${fix_status:-none})"
  fi

  entry=$(jq -n \
    --argjson number "$number" \
    --arg rule_id "$rule_id" \
    --arg severity "$severity" \
    --arg branch "$branch" \
    --arg autofix_status "$autofix_status" \
    --arg autofix_description "$autofix_description" \
    --arg sarif_file "$sarif_file" \
    '{number: $number, rule_id: $rule_id, severity: $severity, branch: $branch, autofix_status: $autofix_status, autofix_description: $autofix_description, sarif_file: $sarif_file}')

  jq --argjson entry "$entry" '. + [$entry]' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
done

echo "Manifest written to $MANIFEST:"
cat "$MANIFEST"
