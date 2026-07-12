# Adding a film stock or a lab

Yes — new films and labs are added by opening a **pull request** on this repo. That sounds
technical, but you don't need to install anything, use the command line, or know what git is.
**Everything below happens in your web browser**, and GitHub does the complicated parts for you.

You will need a free GitHub account. That's the only prerequisite.

There are two routes. Pick whichever suits you:

- **[Route A: Let the app write it for you](#route-a-let-the-app-write-it-for-you)** — easiest.
  You build the film or lab inside FilmCalc, export it, and paste the result in. **Recommended.**
- **[Route B: Type it in by hand](#route-b-type-it-in-by-hand)** — fine if you're adding one small
  entry and don't want to fiddle with the app.

Don't want to do either? **[Just open an issue](https://github.com/trentnbauer/FilmCalc/issues/new/choose)**
with the details and a link, and it can be added for you. That's a completely acceptable option.

---

## Before you start: what gets accepted

Presets are meant to cover **mainstream, reliably available** stocks and labs. To keep the lists
useful, these are generally **not** added:

- Rare, limited-run, or novelty stocks (special-edition Lomochrome, small-batch films, etc.)
- Films that are usually out of stock
- Expired-stock-only listings
- **Sale prices** — always use the regular price, since sales end

If a film doesn't qualify, that's not a problem — you can still add it privately in FilmCalc's
**Library** tab on your own device. It just won't ship with the project.

---

## Route A: Let the app write it for you

This is the easy way. You never have to write YAML by hand — FilmCalc generates it.

### 1. Build it in the app

- Open FilmCalc and go to the **Library** tab.
- Add your film stock (or lab) exactly as you want it — name, box speed, price, buy link, and so on.
- Double-check the numbers. What you type here is what ends up in the file.

### 2. Export it

- Go to **Settings → Export Data**.
- Click **Export Films Only** (or **Export Labs Only**).
- When it asks for a preset name, type something descriptive, e.g. `Australian Retailers`.
- A `.yaml` file downloads to your computer.

### 3. Open that file and copy your entry

Open the downloaded file in any text editor (Notepad, TextEdit, VS Code — anything).

Inside you'll see a `films:` list. Find **your** film — it'll look something like this:

```yaml
- name: Kodak Gold
  boxSpeed: 200
  maxPushPull: 1
  process: C41
  format: 35mm
  hidden: false
  bundles:
  - rolls: 1
    exposures: 36
    filmCost: 24.95
    storeName: JB HiFi
    buyLink: https://example.com/kodak-gold-200
```

Copy that block — from the `- name:` line down to the end of its `bundles`. **Only copy the entries
you're actually adding**, not the whole file (it'll contain every film you have saved, most of which
are already in the project).

Now jump to **[Step 4: Put it into the project](#step-4-put-it-into-the-project)**.

---

## Route B: Type it in by hand

If you'd rather just type it, here's the shape.

### A film

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

| Field | What it means |
|---|---|
| `name` | The stock's name, without the ISO. e.g. `Kodak Portra 400` |
| `boxSpeed` | The rated ISO on the box. A number, no quotes. |
| `maxPushPull` | How many stops it can be pushed or pulled. Usually `1` or `2`; `0` for stocks that shouldn't be pushed (e.g. Ektar). |
| `process` | One of `C41`, `BW`, `E6`, `ECN2`. |
| `format` | One of `35mm`, `120`, `110`, `127`, `220`, `sheet`. |
| `hidden` | Always `false` for a new entry. |
| `bundles` | One entry per way you can buy it — a single roll, a 3-pack, a 5-pack. Add as many as you like. |
| `rolls` | How many rolls in this bundle. |
| `exposures` | Frames per roll. `36` or `24` for 35mm. For 120 use `12` (6x6). |
| `filmCost` | Price for the **whole bundle**, including postage if there is any. Regular price, not sale. |
| `storeName` | Where it's from, e.g. `Walkens`. |
| `buyLink` | Link to the product page. Use `''` if there isn't one. |

### A lab

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

| Field | What it means |
|---|---|
| `name` | The lab's name. |
| `address` | Full street address — this powers the **Directions** link, so make it something Google Maps can find. |
| `services` | One entry per **service tier** the lab offers. A lab with next-day and same-week options gets two entries. |
| `devCost` | What they charge to develop one roll, in dollars. |
| `pushPullCost` | What they charge to push or pull. |
| `pushPullType` | `per_stop` if they charge per stop, or `flat` for one fee regardless. |
| `turnaroundTime` | One of `next_day`, `same_week`, `longer`. |
| `highResScan` | `true` if this tier includes hi-res scans, otherwise `false`. |
| `noPushPull` | `true` only if this tier can't push/pull at all. Usually `false`. |
| `processes` | Which processes this tier handles — a list of `C41`, `BW`, `E6`, `ECN2`. |

> **Careful with indentation.** YAML uses spaces (never tabs), and the indentation is what gives it
> meaning. The safest approach is to copy an existing entry in the file and edit it, rather than
> typing a new one from scratch. If you get it wrong, don't panic — a check runs automatically on
> your pull request and will tell you.

---

## Step 4: Put it into the project

This is the bit that sounds scary and isn't. **You will not need git, a terminal, or a fork.**
GitHub handles all of that when you click the pencil icon.

### 1. Open the right file

- **Films:** [`films/australian-retailers.yaml`](https://github.com/trentnbauer/FilmCalc/blob/main/films/australian-retailers.yaml)
- **Labs:** [`labs/melbourne.yaml`](https://github.com/trentnbauer/FilmCalc/blob/main/labs/melbourne.yaml)

If you're adding a stock or lab from a **different country or region**, it may be better to create a
new file (e.g. `films/uk-retailers.yaml`). Use the **Add file → Create new file** button in the
`films/` folder instead, and give it a `label:` at the top like the existing files have. If you're
unsure, just add to the existing file and it can be moved later.

### 2. Click the pencil ✏️

Near the top right of the file, click the **pencil icon** ("Edit this file").

The first time you do this, GitHub will say something like *"You need to fork this repository to
propose changes."* Click the button to continue — GitHub makes your own copy automatically. This is
normal and takes one click.

### 3. Paste your entry in

Scroll to the bottom of the `films:` (or `labs:`) list and paste your block on the end, matching the
indentation of the entries above it.

Keep the list alphabetical if you can, but it isn't essential.

### 4. Describe your change

Scroll to the bottom of the page to the **Propose changes** box.

- **Title:** something short, e.g. `Add Kodak Portra 400 (120)` or `Add Example Photo Lab`
- **Description:** paste the **link to the shop or lab page** you got the price from. This is the
  single most helpful thing you can include — it's how the price gets verified.

Click the green **Propose changes** button.

### 5. Open the pull request

GitHub takes you to a new page. Click the green **Create pull request** button, then **Create pull
request** again on the screen after it.

**That's it. You've opened a pull request.** You didn't clone anything, install anything, or use a
command line.

---

## What happens next

- An automatic check runs on your pull request to confirm the file is still valid YAML. If something's
  off — usually indentation — it'll show a red ✗ and say so. You can fix it by clicking the pencil
  again on your own branch; the pull request updates itself.
- Your entry gets a quick sanity check: is it a mainstream stock, is the price the regular one, does
  the buy link work.
- Once it's merged, the site rebuilds automatically and your film or lab is available to everyone.

If you get stuck at any point, **leave a comment on your pull request and say so.** Half-finished
pull requests from people who tried are genuinely welcome — they're much easier to fix than to write
from scratch. Nobody minds.

---

## A quick summary

1. Build the film/lab in FilmCalc's **Library** tab, then **Settings → Export Films Only**.
2. Open the downloaded file and copy your entry.
3. On GitHub, open `films/australian-retailers.yaml` and click the **pencil ✏️**.
4. Paste your entry at the end of the list.
5. Fill in the title, **paste the shop link in the description**, and click **Propose changes**.
6. Click **Create pull request**.

No git. No terminal. Six steps in a browser.
