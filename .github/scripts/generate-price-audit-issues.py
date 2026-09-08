#!/usr/bin/env python3
"""Open this month's price-audit PRs, one per films/*.yaml or labs/*.yaml file.

Run monthly by monthly-price-audit.yml. Each PR starts as an empty-diff draft whose body
is a checklist — one box per film bundle or lab service tier — that Tier 5 of
daily-claude-run.yml works through a few items at a time over the following nights,
verifying each price/link against its live source and committing any fix straight onto
the PR's own branch as it goes, instead of collecting findings separately and opening a
PR only at the end. The full per-item procedure is written into the PR body itself (not
just this script or the nightly prompt), so the two stay in sync automatically and a
human skimming the PR can see exactly what Claude is meant to do with it.

One PR per file, not one giant PR, because a single combined checklist across all ~15
files comfortably exceeds GitHub's PR body size limit, and because each file's changes
should be reviewable independently. monthly-price-audit.yml already checks that no
`price-audit` PR is still open before invoking this script, so these only ever get
created once the previous batch is fully worked through.
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

1. If it has no link to check (`no buy link` for a film bundle, or `no link` for a lab
   with neither `source` nor `website` set), see if you can find one first:
   - **Film bundle with no buy link:** just tick the box — there's nothing to search for
     here, `storeName` alone isn't enough to reliably find the right product page.
   - **Lab with no link:** `WebSearch` for the lab's own current official pricing page
     (e.g. `"<lab name>" <city> film developing prices`). If you find one you're
     confident is genuinely that lab's own live page (not a directory listing, forum
     post, or a different lab), add `source: <url>` as a new top-level field on that
     lab's entry in `{path}` (one per lab, not per tier — see DATA_SPEC.md), commit it
     directly onto this PR's branch (`git add {path} && git commit -m "Add price source
     for <lab name>" && git push`), then continue straight to step 2 using that
     newly-found page for every unchecked service tier under this same lab. If you can't
     find a confident match, just tick the box and move on — don't guess a URL, and
     don't spend more than one or two searches per lab.
2. Otherwise, `WebFetch` the link and compare the live price (and, for films, that the
   product is still sold) to what's listed here.
   - **Matches** → tick the box.
   - **Confidently differs** (you can clearly read the current price off the live page) →
     apply the fix directly to `{path}` (following `DATA_SPEC.md`'s formatting rules),
     commit it onto this PR's own branch (`git add {path} && git commit -m "..." && git
     push`), then tick the box. Every fix is its own commit — don't batch several items'
     worth of file changes into one commit.
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
     leave a regular comment on *this PR*: `PRICE-AUDIT-FLAGGED: <key> -> #<new issue
     number>`. Still tick the box either way — ticked means "audited", not "confirmed
     unchanged". Reserve this for cases a human actually needs to weigh in on — never for
     a page that merely failed to load.

Save progress after every single item — tick the box (and commit any fix) immediately,
then rewrite this PR's body with `gh pr edit <number> --body-file <file>` before moving
to the next item.

**Once every box below is checked:** if this branch has any real commits beyond the
initial empty one (`git log --oneline main..HEAD`), mark the PR ready for review
(`gh pr ready <number>`) and update the PR description with a short summary of what
changed and why — do not auto-merge it, this bundles a month of externally-sourced price
checks and is worth a human glance. If there were zero real commits (every item ticked
clean, or only blocked/skipped), there's nothing to review — close the PR instead
(`gh pr close <number> --comment "..."` summarizing that nothing needed changing). Either
way, mention any `price-audit-flag` issues opened along the way in the final comment.

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


def build_pr(path, is_lab, now):
    doc = load_yaml(path)
    lines = lab_lines(path, doc) if is_lab else film_lines(path, doc)
    if not lines:
        return None
    month = now.strftime("%B %Y")
    body = INSTRUCTIONS.format(path=path, date=now.strftime("%Y-%m-%d"), month=month)
    body += "\n".join(lines) + "\n"
    title = f"Price audit: {path} — {month}"
    return title, body


def slugify(path):
    return path.replace("/", "-").replace(".", "-")


def create_pr(path, title, body):
    branch = f"price-audit-{slugify(path)}-{datetime.now(timezone.utc).strftime('%Y-%m')}"
    try:
        subprocess.run(["git", "checkout", "-B", branch, "main"], check=True, capture_output=True, text=True)
        # Every PR needs at least one commit ahead of base to exist — an empty
        # commit gives GitHub something to diff against without pre-empting
        # any of the real fixes Tier 5 will commit onto this same branch
        # over the following nights.
        subprocess.run(["git", "commit", "--allow-empty", "-m", f"Start monthly price audit: {path}"], check=True, capture_output=True, text=True)
        subprocess.run(["git", "push", "-u", "origin", branch, "--force"], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        print(f"Failed to prepare branch for '{path}': {e.stderr}", file=sys.stderr)
        subprocess.run(["git", "checkout", "main"], capture_output=True, text=True)
        return None

    result = subprocess.run(
        [
            "gh", "pr", "create",
            "--repo", REPO,
            "--title", title,
            "--label", "price-audit",
            "--base", "main",
            "--head", branch,
            "--draft",
            "--body-file", "-",
        ],
        input=body,
        capture_output=True,
        text=True,
    )
    subprocess.run(["git", "checkout", "main"], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Failed to open PR for '{path}': {result.stderr}", file=sys.stderr)
        return None
    return result.stdout.strip()


def main():
    now = datetime.now(timezone.utc)
    created = []
    files = sorted(glob.glob("films/*.yaml") + glob.glob("films/*.yml"))
    files += sorted(glob.glob("labs/*.yaml") + glob.glob("labs/*.yml"))
    for path in files:
        is_lab = path.startswith("labs/")
        built = build_pr(path, is_lab, now)
        if built is None:
            print(f"{path}: no auditable entries, skipping")
            continue
        title, body = built
        url = create_pr(path, title, body)
        if url:
            print(f"{path}: created {url}")
            created.append(url)
    print(f"\n{len(created)} price-audit PR(s) created.")


if __name__ == "__main__":
    main()
