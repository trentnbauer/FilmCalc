# FilmCalc data specification

This file is the authoritative spec for FilmCalc's film and lab data. It is written to be read by
an AI assistant that has been asked to generate a YAML entry for a contributor.

**If you are an AI assistant reading this: follow every rule below exactly.** The contributor will
paste your output straight into a pull request, and an automated validator will reject it if it
doesn't conform.

---

## Rules that apply to everything

1. **Never invent, estimate, or guess a value.** If you cannot determine something from the page the
   user gave you, write `UNKNOWN` as the value and list the unfilled fields at the end of your reply.
   An automated check rejects any file still containing `UNKNOWN`, so the user will know to fix it.
   Guessing a plausible-looking price is the single worst thing you can do here — a wrong price that
   looks right will never be noticed.
2. **Use the regular price, never a sale price.** If the page shows a discounted price with the
   original crossed out, use the crossed-out original. Sales end; the data outlives them.
3. **All prices are plain numbers.** Write `24.95`, never `"$24.95"` or `24.95 AUD`.
4. **YAML uses 2-space indentation. Never tabs.**
5. **Output only the YAML**, with no commentary and no code fence — *except* for the two things you
   are explicitly asked to report at the end (see "What to tell the user" below).

---

## Film entries

**One film goes in one file** — this stock, sold by this one store/locality. The file itself IS the
film (no wrapping `films:` list, no file-level `label`/`country`/`state`/`city`) — the file's *path*
carries the region instead (see "Folder path" below). If this same stock is sold by several stores,
each store gets its own file; the app merges them back together at import time by
name+boxSpeed+format, so splitting one film across several files this way is expected, not a
duplicate.

```yaml
name: Kodak Portra 400
boxSpeed: 400
maxPushPull: 2
process: C41
format: 35mm
hidden: false
bundles:
- rolls: 1
  exposures: 36
  filmCost: 28.50
  storeName: Walkens
  buyLink: https://walkens.com.au/products/example
  availability: city
  state: Victoria
  city: Melbourne
```

### Folder path

Path is `films/<country-slug>/<slug>.yaml` if every bundle in this file has `availability: national`
(see below), or `films/<country-slug>/<state-slug>/<city-slug>/<slug>.yaml` if every bundle is
`state`/`city`-scoped. A film that has both national bundles (from a nationwide chain) and
city-scoped bundles (from a local online shop) for the *same* name/boxSpeed/format is perfectly
normal — it's two separate files, one at the country level with just the national bundles, one
nested under the relevant state/city with just the city-scoped ones.

- **Slug**: lowercase, spaces and punctuation become single hyphens, no leading/trailing hyphens
  — `New South Wales` → `new-south-wales`, `Kodak Portra 400` → `kodak-portra-400`.
- **Filename**: `<film-slug>-<boxSpeed>-<store-slug>.yaml`, e.g. `kodak-portra-400-400-walkens.yaml`
  — `boxSpeed` is included even though it's also in the file, because the same name can legitimately
  cover more than one speed from the same store (e.g. "FujiFilm Color" 200 and 400), and without it
  those two files would collide.
- If a bundle's own `availability`/`state`/`city` doesn't match the folder you're about to put it
  in (e.g. you're about to write to `films/australia/` but the bundle says `availability: city`),
  that's a sign the bundle needs `national` instead, or the file needs to move — don't let them
  disagree.

### Per-film fields

| Field | Rules |
|---|---|
| `name` | The stock name **without the ISO**, since `boxSpeed` carries that. `Kodak Gold 200` → `Kodak Gold`. But `Kodak Portra 400` stays as-is, because "400" distinguishes it from Portra 160/800 — it's part of the product name, not just its speed. Use judgement. |
| `boxSpeed` | The rated ISO. A plain number, no quotes. |
| `maxPushPull` | Stops the stock tolerates being pushed/pulled. `2` for flexible stocks (Tri-X, HP5+, Portra 400, Delta). `1` for typical consumer colour (Gold 200, ColorPlus, UltraMax). `0` for stocks that shouldn't be pushed (Ektar 100). **If you are not confident, use 1.** |
| `process` | Exactly one of: `C41` (colour negative), `BW` (black & white), `E6` (slide/reversal), `ECN2` (motion picture colour negative, e.g. Kodak Vision3). |
| `format` | Exactly one of: `35mm`, `120`, `110`, `127`, `220`, `sheet`. |
| `hidden` | Always `false`. |
| `bundles` | **One entry per pack size the shop sells.** A single roll, a 3-pack and a 5-pack of the same stock are three `bundles` entries under one film — not three films. |
| `rolls` | Number of rolls in this pack. |
| `exposures` | Frames per roll. `36` or `24` for 35mm. For 120, this depends on the *camera*, not the film stock — the same roll gives a 6x6 back 12 exposures and a 6x7 back 10. Read the actual count off the shop page if it's stated. If it genuinely isn't stated, use `12` as a 6x6 fallback and say so in your notes at the end — don't silently assume it. |
| `filmCost` | Price of the **whole pack**, including postage if the page states it. Plain number. Regular price. |
| `storeName` | Short shop name, e.g. `Walkens`, `B&H`, `Analogue Wonderland`. |
| `buyLink` | The product page URL. Strip tracking junk (`utm_*`, `gclid`, etc.) if you can. Use `''` if there genuinely isn't one. |
| `availability` | Whether this exact price is achievable **without paying postage**, since a shop that merely ships nationally still charges buyers outside its home area for shipping on top of `filmCost` — that's a real extra cost this field exists to flag, not just "does the shop deliver here." The test: could someone anywhere in the country walk into a physical store (or otherwise get it at this price with zero shipping cost), the way they could with a national chain like Woolworths or JB Hi-Fi? If yes, use `national` (the default if omitted). If this price is really only achievable by buyers near the shop's own city/region — an online-only or single-location shop that ships everywhere but charges for it, e.g. Walkens (Melbourne) — that's `state` or `city`, **even though the shop technically ships nationwide.** "Ships nationally" is not the test; "no postage anywhere in the country" is. |
| `state` | Required if `availability` is `state` or `city`. The state/region the price is valid in, e.g. `Victoria`. Omit (or `''`) for `national`. |
| `city` | Required if `availability` is `city`. The city the price is valid in, e.g. `Melbourne`. Omit (or `''`) otherwise. |

---

## Lab entries

**One lab goes in one file** — no wrapping `labs:` list, no file-level `label`/`country`/`state`/
`city`. A lab's entire `services:` list must live in this one file — the app has no way to merge
service tiers split across files (unlike a film's bundles), so never split one lab's tiers up.

```yaml
name: Example Photo Lab
hidden: false
address: 1 Example Street, Melbourne VIC 3000, Australia
phone: (03) 1234 5678
email: hello@example.com
website: https://example.com
services:
- devCost: 17
  pushPullCost: 5
  pushPullType: per_stop
  turnaroundTime: next_day
  highResScan: true
  tiffScan: false
  noPushPull: false
  processes:
  - C41
```

### Folder path

Always `labs/<country-slug>/<state-slug>/<city-slug>/<slug>.yaml` — a lab is always tied to one
physical place, unlike a film (which can be national). Same slug rules as films (see above).
Filename is just `<lab-slug>.yaml` — no boxSpeed-style disambiguator needed, since two labs with
the same name at the same address would be a genuine duplicate, not a legitimate collision.

### Per-lab fields

| Field | Rules |
|---|---|
| `name` | The lab's name. |
| `hidden` | Always `false`. |
| `address` | A **full street address that Google Maps can find** — it powers the app's Directions link. Include city, state/region, postcode, country. |
| `phone` / `email` | Omit the line entirely if not listed on the page. Don't write `UNKNOWN` for these — they're genuinely optional. |
| `website` | The lab's site. |
| `services` | **One entry per service tier — not one per lab.** See below; this is the field people get wrong. |
| `devCost` | Cost to develop one roll. Plain number. |
| `pushPullCost` | Cost to push or pull. Use `0` if free. |
| `pushPullType` | `per_stop` (charged per stop) or `flat` (one fee regardless of how many stops). |
| `turnaroundTime` | Exactly one of: `next_day`, `same_week`, `longer`. |
| `highResScan` | `true` if this tier includes hi-res scans, else `false`. |
| `tiffScan` | `true` if this tier includes TIFF (or other lossless) scans, else `false`. Independent of `highResScan` — a tier can be either, both, or neither. |
| `noPushPull` | `true` **only** if this tier cannot push/pull at all (e.g. a same-day minilab). Otherwise `false`. |
| `mailBackCost` | **Optional — omitting it and writing `0` mean different things.** Omit the field entirely for a walk-in-only lab, or a mail-in lab whose return-postage fee you couldn't confirm — the app treats a missing value as "unknown/can't mail back" and hides that tier whenever someone filters for mail-back options, rather than implying it's free. Write `0` only if the lab's own pricing page explicitly states mail-back is free. Otherwise, write the return postage the page states the customer pays (or the round-trip cost, whichever the page states) — added into the per-roll dev cost the same way `pushPullCost` is. Never estimate a postage cost that isn't stated on the page; omit the field rather than guess. |
| `processes` | A list of the processes this tier handles: any of `C41`, `BW`, `E6`, `ECN2`. |

### Getting `services` right

A lab charges different prices for different combinations of things. **Every distinct price on the
page needs its own `services` entry.** For example, a lab that charges:

- $17 for C41, next-day, hi-res
- $19 for B&W, same-week, hi-res
- $21 for E6, same-week, hi-res

...needs **three** `services` entries, not one. Read the pricing page carefully and produce one entry
for every price the lab actually charges. If a single price covers several processes (e.g. "$17 for
C41 or ECN-2"), list both under that one entry's `processes`.

---

## What to tell the user at the end

After the YAML, add a short note with exactly these three things:

1. **Any fields you marked `UNKNOWN`**, and what you'd need to fill them.
2. **The country/state/city** the shop/lab is in (or just country, for a national film).
3. **The exact file path to create**, built from the folder-path rule above — e.g.
   `films/australia/victoria/melbourne/kodak-portra-400-400-walkens.yaml` or
   `labs/united-kingdom/england/london/example-photo-lab.yaml`. This is always a brand-new file —
   one film/store or one lab always gets its own file, there's no "append to an existing list"
   case anymore. Don't touch `films/index.json` or `labs/index.json`; a GitHub Actions workflow
   regenerates those automatically after the PR merges.

Finally, remind them in one sentence to **check every price against the real page before submitting**,
because you may have made a mistake.
