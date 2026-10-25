#!/usr/bin/env python3
"""Tick the easy price-audit boxes before Claude runs, so the nightly run only spends turns on
items that actually need judgment.

For every unchecked box in every open price-audit issue:
- a film bundle with no buy link is ticked (the checklist says to just tick those);
- otherwise the linked page is fetched once (cached per URL) and the box is ticked if the
  listed price appears on it as a price: next to a currency sign/code, or written with
  decimals (16.00 / 16,00).
Anything else (price not found, page blocked, lab with no link) is left for Claude.
An issue whose boxes are then all ticked, with no PRICE-AUDIT-FINDING or PRICE-AUDIT-FLAGGED
comment, is closed as audited with no changes — the same thing the checklist tells Claude to do.

shortcut: "the price appears on the page" can match another tier's identical price, so a real
change is missed only when the old price still shows up elsewhere on the same page; next
month's audit checks it again.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from html import unescape

REPO = os.environ.get("GITHUB_REPOSITORY", "")
DEADLINE = time.monotonic() + 15 * 60  # stop fetching new pages after 15 minutes

ITEM_RE = re.compile(r"^- \[ \] .* — (?:devCost )?(?P<price>[\d.]+) — (?P<link>\S+) <!-- price-audit-key: (?P<key>[^ ]+.*?) -->$")
CURRENCY = (r"[$€£¥₩₹฿₺₱]|kr\.?|zł|kč|ft|lei|лв|chf|eur|usd|gbp|aud|nzd|cad|sgd|hkd|jpy|krw"
            r"|thb|sek|nok|dkk|isk|pln|czk|huf|ron|bgn|mxn|r\$")


def price_patterns(price):
    value = float(price)
    whole = str(int(value)) if value == int(value) else None
    decimals = f"{value:.2f}"
    forms = {re.escape(decimals), re.escape(decimals.replace(".", ","))}
    plain = {re.escape(price)} | ({re.escape(whole)} if whole else set())
    num = r"(?<![\d.,])(?:%s)(?![\d])"
    # decimals alone are distinctive enough; a bare whole number needs a currency beside it
    return [
        re.compile(num % "|".join(forms)),
        re.compile(r"(?:%s)\s?%s" % (CURRENCY, num % "|".join(plain | forms)), re.I),
        re.compile(r"%s\s?(?:,-|\.-)?\s?(?:%s)" % (num % "|".join(plain | forms), CURRENCY), re.I),
    ]


def price_on_page(price, text):
    return any(p.search(text) for p in price_patterns(price))


def page_text(url, cache):
    if url not in cache:
        if time.monotonic() > DEADLINE:
            return None
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 FilmCalc price audit"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                html = resp.read(3_000_000).decode("utf-8", "replace")
            text = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", html, flags=re.S | re.I)
            cache[url] = re.sub(r"\s+", " ", unescape(text)).replace(" ", " ")
        except Exception as e:  # blocked, timeout, dead link: Claude looks at it
            print(f"  fetch failed {url}: {e}", file=sys.stderr)
            cache[url] = None
    return cache[url]


def gh(*args, input=None):
    return subprocess.run(["gh", *args, "--repo", REPO], input=input, capture_output=True,
                          text=True, check=True).stdout


def precheck(body, cache):
    """Return (new_body, ticked_count)."""
    lines, ticked = body.split("\n"), 0
    for i, line in enumerate(lines):
        if not line.startswith("- [ ] "):
            continue
        no_link = " — no buy link <!--" in line
        m = ITEM_RE.match(line)
        if no_link or (m and m["link"].startswith("http") and
                       (text := page_text(m["link"], cache)) and price_on_page(m["price"], text)):
            lines[i] = "- [x] " + line[6:]
            ticked += 1
    return "\n".join(lines), ticked


def main():
    issues = json.loads(gh("issue", "list", "--label", "price-audit", "--state", "open",
                           "--json", "number,body,comments", "--limit", "500"))
    cache = {}
    for issue in issues:
        n = issue["number"]
        body, ticked = precheck(issue["body"], cache)
        if ticked:
            gh("issue", "edit", str(n), "--body-file", "-", input=body)
            print(f"#{n}: ticked {ticked} item(s)")
        comments = " ".join(c["body"] for c in issue["comments"])
        if "- [ ] " not in body and "PRICE-AUDIT-FINDING" not in comments and "PRICE-AUDIT-FLAGGED" not in comments:
            gh("issue", "close", str(n), "--reason", "completed", "--comment",
               "Audit complete: every box is ticked and there are no findings or flags, so nothing "
               "needed changing. (Closed by price-audit-precheck.py.)")
            print(f"#{n}: closed, all items matched")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        assert price_on_page("16", "C-41 revelado 16 € por carrete")
        assert price_on_page("16", "Price: €16")
        assert price_on_page("12.5", "dev £12.50 per roll")
        assert price_on_page("99", "Fremkaldelse 99 kr.")
        assert price_on_page("99", "Fremkaldelse 99,- kr")
        assert price_on_page("14", "ECO 14,00")
        assert not price_on_page("16", "open 16 hours a day")
        assert not price_on_page("6", "16 €")
        assert not price_on_page("16", "116 €")
        line = ("- [ ] Contado Pierde — service #1 (C41, ?) — devCost 16 — https://x.test/p "
                "<!-- price-audit-key: labs/madrid.yaml#Contado Pierde#0 -->")
        film = ("- [ ] Portra 400 — 400 ISO, 35mm — bundle: 1 roll(s) x 36 exp @ Shop — 20 — no buy link "
                "<!-- price-audit-key: films/x.yaml#Portra 400#400#35mm#0 -->")
        out, n = precheck(f"{line}\n{film}", {"https://x.test/p": "C-41 16 € each"})
        assert n == 2 and "- [ ]" not in out, out
        out, n = precheck(line, {"https://x.test/p": "C-41 18 € each"})
        assert n == 0
        print("self-test OK")
    else:
        main()
