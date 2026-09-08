#!/usr/bin/env python3
"""Open this month's price-audit issues, one per films/*.yaml or labs/*.yaml file.

Run monthly by monthly-price-audit.yml. Each issue is a checklist — one box per film
bundle or lab service tier — that Tier 5 of daily-claude-run.yml works through a few
items at a time over the following nights, verifying each price/link against its live
source. The full per-item procedure is written into the issue body itself (not just this
script or the nightly prompt), so the two stay in sync automatically and a human skimming
the issue can see exactly what Claude is meant to do with it.

One issue per file, not one giant issue, because a single combined checklist across all
~15 files comfortably exceeds GitHub's issue body size limit. monthly-price-audit.yml
already checks that no `price-audit` issue is still open before invoking this script, so
these only ever get created once the previous batch is fully worked through.
"""
import glob
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

import yaml

REPO = os.environ["GITHUB_REPOSITORY"]

INSTRUCTIONS = """\
Automated monthly price audit for `{path}`, generated {date}.

For each unchecked item below:

1. If it has no link to check (`no buy link` / `no website`), just tick the box — there's
   nothing to verify.
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

**Once every box below is checked:** collect every `PRICE-AUDIT-FINDING` comment on this
issue (`gh issue view <number> --json comments`), apply each one to `{path}` following
`DATA_SPEC.md`'s formatting rules, and commit them all together on a branch named
`claude/price-audit-<number>`. If there was at least one finding, open a single PR titled
"Price audit corrections: {path} — {month}" with a table of every change (entry, field,
old → new, source) in the body, referencing `Refs #<number>` — do not auto-merge it, this
bundles a month of externally-sourced price checks and is worth a human glance. If there
were zero findings, skip the PR. Either way, close this issue
(`gh issue close <number> --comment "..."`) summarizing what changed and linking any
`price-audit-flag` issues opened along the way, then reference the PR if one was opened.

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


def main():
    now = datetime.now(timezone.utc)
    created = []
    files = sorted(glob.glob("films/*.yaml") + glob.glob("films/*.yml"))
    files += sorted(glob.glob("labs/*.yaml") + glob.glob("labs/*.yml"))
    for path in files:
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
