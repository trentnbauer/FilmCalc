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

Goes in a file under `films/`, grouped **by country**.

```yaml
- name: Kodak Portra 400
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
```

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
| `exposures` | Frames per roll. `36` or `24` for 35mm. Use `12` for 120 (assumes 6x6). |
| `filmCost` | Price of the **whole pack**, including postage if the page states it. Plain number. Regular price. |
| `storeName` | Short shop name, e.g. `Walkens`, `B&H`, `Analogue Wonderland`. |
| `buyLink` | The product page URL. Strip tracking junk (`utm_*`, `gclid`, etc.) if you can. Use `''` if there genuinely isn't one. |

---

## Lab entries

Goes in a file under `labs/`, grouped **by city**.

```yaml
- name: Example Photo Lab
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
    noPushPull: false
    processes:
    - C41
```

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
| `noPushPull` | `true` **only** if this tier cannot push/pull at all (e.g. a same-day minilab). Otherwise `false`. |
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
2. **The country** (for a film) or **city** (for a lab) the shop/lab is in.
3. **A suggested filename and label**, following these conventions:

   | | Filename | Label |
   |---|---|---|
   | **Films** (by country) | `us-retailers.yaml`, `uk-retailers.yaml` | `US Retailers`, `UK Retailers` |
   | **Labs** (by city) | `london.yaml`, `new-york.yaml` | `London Labs`, `New York Labs` |

   Then check the existing files and tell the user which case applies:
   - **The file already exists** → they should open it and paste your entry at the bottom of the list.
   - **It doesn't exist** → they need to create it, and the file must start with a `label:` line, e.g.

     ```yaml
     label: US Retailers
     films:
     - name: Kodak Portra 400
       ...
     ```

Finally, remind them in one sentence to **check every price against the real page before submitting**,
because you may have made a mistake.
