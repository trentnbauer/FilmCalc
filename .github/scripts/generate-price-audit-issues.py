#!/usr/bin/env python3
"""Open this month's price-audit issues, one per films/*.yaml or labs/*.yaml file.

Run monthly by monthly-price-audit.yml. Each issue is a checklist — one box per film
bundle or lab service tier — that Tier 5 of daily-claude-run.yml works through a few
items at a time over the following nights, verifying each price/link against its live
source. The full per-item procedure is written into the issue body itself (not just this
script or the nightly prompt), so the two stay in sync automatically and a human skimming
the issue can see exactly what Claude is meant to do with it.

One issue per file, not one giant issue, because a single combined checklist across all
~15 files comfortably exceeds GitHub's issue body size limit. Safe to run anytime, not
just on the monthly schedule — `open_audit_paths()` skips any file that already has an
open price-audit issue, so a manual `workflow_dispatch` re-run mid-month (e.g. to pick up
files added since the last run) only opens issues for what's actually missing, never a
duplicate checklist for a file still being worked through.

No PR exists for a file until its whole checklist is done and there's a real, complete
changeset to open — findings are collected as issue comments while the checklist is
worked through, then applied in one batch at the end. This deliberately avoids a
placeholder/draft PR sitting open (and looking like clutter) for however many nights it
takes Tier 5 — the lowest-priority tier — to get through a file's items.
"""
import glob
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

import yaml

REPO = os.environ["GITHUB_REPOSITORY"]

INSTRUCTIONS = """\
Automated monthly price audit for `{path}`, generated {date}.

For each unchecked item below:

1. If it has no link to check (`no buy link` for a film bundle, or `no link` for a lab
   with neither `source` nor `website` set), see if you can find one first:
   - **Film bundle with no buy link:** just tick the box — there's nothing to search for
     here, `storeName` alone isn't enough to reliably find the right product page.
   - **Lab with no link:** `WebSearch` for the lab's own current official pricing page
     (e.g. `"<lab name>" <city> film developing prices`). If you find one you're
     confident is genuinely that lab's own live page (not a directory listing, forum
     post, or a different lab), leave a comment on *this* issue in this form:
     ```
     PRICE-AUDIT-FINDING
     file: {path}
     entry: <lab name>
     field: source
     old: <empty, or the current value>
     new: <the URL you found>
     source: <the same URL>
     ```
     then continue straight to step 2 using that newly-found page for every unchecked
     service tier under this same lab. If you can't find a confident match, just tick the
     box and move on — don't guess a URL, and don't spend more than one or two searches
     per lab.
2. Otherwise, `WebFetch` the link and compare the live price (and, for films, that the
   product is still sold) to what's listed here.
   - **Matches** → tick the box.
   - **Confidently differs** (you can clearly read the current price off the live page) →
     tick the box, then leave a comment on *this* issue in exactly this form so it can be
     found and applied later:
     ```
     PRICE-AUDIT-FINDING
     file: {path}
     entry: <name / spec / bundle-or-service description>
     field: <the YAML field that changed, e.g. filmCost, devCost, mailBackCost>
     old: <value currently in the YAML>
     new: <value read off the live page>
     source: <the URL you checked>
     ```
   - **Blocked, not ambiguous** (403/CAPTCHA/robot-check, a JS-rendered page that returns
     no price to WebFetch, a timeout, or any other case where the page simply won't render
     for you) → just tick the box and move on to the next item, same as "no link to check".
     Don't open an issue for this — a page Claude can't fetch isn't a data problem, and
     these should never cost the repo owner any review effort. (Tier 5b in
     `daily-claude-run.yml` retries genuinely-flagged issues periodically in case a block
     was temporary; a page that was merely inaccessible tonight doesn't need tracking at
     all — next month's audit will just try it again.)
   - **Genuinely ambiguous** (the page loads and shows content, but the value is unclear
     for a reason a fresh fetch won't fix — discontinued product, a price that doesn't
     match the linked product at all, conflicting numbers on the same page, a big
     unexplained swing, or a mapping that doesn't fit this repo's data schema) → first
     check whether an open issue labelled `price-audit-flag` already references this same
     entry (search its key comment, `<!-- price-audit-key: {path}#... -->`); if one
     exists, don't duplicate it. Otherwise open a new issue labelled `price-audit-flag`
     explaining what's unclear, including that same key comment, and asking the repo
     owner to reply with the correct value and mention @claude to have it applied. Then
     leave a comment on *this* issue: `PRICE-AUDIT-FLAGGED: <key> -> #<new issue number>`.
     Still tick the box either way — ticked means "audited", not "confirmed unchanged".
     Reserve this for cases a human actually needs to weigh in on — never for a page that
     merely failed to load.

Save progress after every single item — tick the box (and post any comment) immediately,
then rewrite this issue's body with `gh issue edit <number> --body-file <file>` before
moving to the next item. Don't batch several items' worth of changes into one save.

**Once every box below is checked:**

0. First check whether a PR already exists for this issue (`gh pr list --search "Closes #<number>" --state all` — also check for a branch named `claude/price-audit-<number>` directly, `git ls-remote --heads origin`), in case a previous run got this far and was interrupted before merging. If one exists and is still open, skip straight to step 3 (below) with that PR instead of creating a new one. If one exists and already merged, this issue should have auto-closed with it — something's wrong (re-opened issue?); just close it yourself with a comment noting the PR already merged, and stop.

1. Collect every `PRICE-AUDIT-FINDING` comment on this issue (`gh issue view <number> --json comments`). If there are none, there's nothing to open a PR for — close this issue yourself (`gh issue close <number> --comment "..."`) summarizing that nothing needed changing, mention any `price-audit-flag` issues opened along the way, and stop here.

2. Apply each finding to `{path}` following `DATA_SPEC.md`'s formatting rules (a `field: source` finding adds/updates that lab's top-level `source:`, same as any other field), and commit them all together on a branch named `claude/price-audit-<number>`. Open a PR titled "Price audit corrections: {path} — {month}" with a table of every change (entry, field, old → new, source) in the body, and include the literal line `Closes #<number>` so the issue closes automatically the moment this merges. Mention any `price-audit-flag` issues opened along the way.

3. Decide whether to auto-merge or leave it for review: for every finding whose `field` is a price-like number (not `source`, not a field going from empty to a value), compute the absolute percent change between `old` and `new` (skip any finding where `old` is empty/zero — nothing to divide by, treat it as a review-worthy addition instead of a swing).
   - If every one of those is **within 30%**, this is within the same confidence bar Tier 2 already auto-merges under — merge it yourself, `gh pr merge --squash --auto --delete-branch`.
   - If **any single finding swings by more than 30%**, don't auto-merge — leave the PR open for human review instead, and say explicitly in the PR body which finding(s) triggered the hold and why (e.g. "Kodak Portra 400 devCost $12 → $19, a 58% jump — flagging for a human glance instead of auto-merging"). A swing that large is more likely a misread (wrong pack size, wrong tier, a stray digit) than a genuine price move, and this is the one mechanical backstop against that — independent of how confident the per-item read felt at the time.

---

"""


def load_yaml(path):
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def film_lines(path, doc):
    lines = []
    for film in (doc or {}).get("films") or []:
        if film.get("hidden"):
            continue
        name = film.get("name", "unnamed")
        box_speed = film.get("boxSpeed", "?")
        fmt = film.get("format", "35mm")
        for j, bundle in enumerate(film.get("bundles") or []):
            key = f"{path}#{name}#{box_speed}#{fmt}#{j}"
            rolls = bundle.get("rolls", "?")
            exposures = bundle.get("exposures", "?")
            store = bundle.get("storeName", "unknown store")
            cost = bundle.get("filmCost", "?")
            link = bundle.get("buyLink") or ""
            link_note = link if link else "no buy link"
            lines.append(
                f"- [ ] {name} — {box_speed} ISO, {fmt} — bundle: {rolls} roll(s) x "
                f"{exposures} exp @ {store} — {cost} — {link_note} "
                f"<!-- price-audit-key: {key} -->"
            )
    return lines


def lab_lines(path, doc):
    lines = []
    for lab in (doc or {}).get("labs") or []:
        if lab.get("hidden"):
            continue
        name = lab.get("name", "unnamed")
        # `source` (the specific page/PDF the prices were actually read from)
        # is a much better link to re-check than `website` (the lab's
        # homepage, which may be several clicks from the real pricelist) —
        # prefer it whenever a contributor bothered to fill it in.
        link = lab.get("source") or lab.get("website") or ""
        link_note = link if link else "no link"
        for j, service in enumerate(lab.get("services") or []):
            key = f"{path}#{name}#{j}"
            processes = ", ".join(service.get("processes") or []) or "?"
            turnaround = service.get("turnaroundTime", "?")
            dev_cost = service.get("devCost", "?")
            lines.append(
                f"- [ ] {name} — service #{j + 1} ({processes}, {turnaround}) — "
                f"devCost {dev_cost} — {link_note} "
                f"<!-- price-audit-key: {key} -->"
            )
    return lines


def build_issue(path, is_lab, now):
    doc = load_yaml(path)
    lines = lab_lines(path, doc) if is_lab else film_lines(path, doc)
    if not lines:
        return None
    month = now.strftime("%B %Y")
    body = INSTRUCTIONS.format(path=path, date=now.strftime("%Y-%m-%d"), month=month)
    body += "\n".join(lines) + "\n"
    title = f"Price audit: {path} — {month}"
    return title, body


def create_issue(title, body):
    result = subprocess.run(
        [
            "gh", "issue", "create",
            "--repo", REPO,
            "--title", title,
            "--label", "price-audit",
            "--body-file", "-",
        ],
        input=body,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Failed to create issue '{title}': {result.stderr}", file=sys.stderr)
        return None
    return result.stdout.strip()


TITLE_RE = re.compile(r"^Price audit: (.+?) — ")


def open_audit_paths():
    """Every films/*.yaml or labs/*.yaml path that already has an open
    price-audit issue, so a re-run (whether the monthly schedule or a manual
    workflow_dispatch, possibly mid-month to pick up files added since the
    last run) never opens a second, duplicate checklist for a file whose
    first one is still being worked through — while still opening one for
    any file that doesn't have one yet."""
    result = subprocess.run(
        ["gh", "issue", "list", "--repo", REPO, "--label", "price-audit",
         "--state", "open", "--json", "title", "--limit", "200"],
        capture_output=True, text=True, check=True,
    )
    titles = (t["title"] for t in json.loads(result.stdout))
    return {m.group(1) for t in titles if (m := TITLE_RE.match(t))}


def main():
    now = datetime.now(timezone.utc)
    already_open = open_audit_paths()
    created = []
    files = sorted(glob.glob("films/*.yaml") + glob.glob("films/*.yml"))
    files += sorted(glob.glob("labs/*.yaml") + glob.glob("labs/*.yml"))
    for path in files:
        if path in already_open:
            print(f"{path}: already has an open price-audit issue, skipping")
            continue
        is_lab = path.startswith("labs/")
        built = build_issue(path, is_lab, now)
        if built is None:
            print(f"{path}: no auditable entries, skipping")
            continue
        title, body = built
        url = create_issue(title, body)
        if url:
            print(f"{path}: created {url}")
            created.append(url)
    print(f"\n{len(created)} price-audit issue(s) created.")


if __name__ == "__main__":
    main()
