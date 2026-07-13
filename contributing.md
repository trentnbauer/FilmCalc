# Adding a film stock or a lab

**No git. No installing anything. Two clicks and a paste.**

---

## 🎬 Start here

### 1️⃣ Click your button

<table>
<tr>
<td align="center" width="50%">

### 🎞️ Adding a FILM?

**[▶ Open Claude for a film](https://claude.ai/new?q=I%20want%20to%20add%20a%20FILM%20STOCK%20to%20FilmCalc%20%28an%20open-source%20film%20photography%20cost%20calculator%29.%0A%0AFirst%2C%20read%20the%20data%20specification%20here%20and%20follow%20every%20rule%20in%20it%20exactly%3A%0Ahttps%3A//raw.githubusercontent.com/trentnbauer/FilmCalc/main/DATA_SPEC.md%0A%0AThen%20generate%20the%20YAML%20entry%20for%20the%20film%20on%20the%20product%20page%20I%20give%20you%20below.%0A%0AProduct%20page%3A%20%5BPASTE%20THE%20LINK%20HERE%5D)**

</td>
<td align="center" width="50%">

### 🏪 Adding a LAB?

**[▶ Open Claude for a lab](https://claude.ai/new?q=I%20want%20to%20add%20a%20PHOTO%20LAB%20to%20FilmCalc%20%28an%20open-source%20film%20photography%20cost%20calculator%29.%0A%0AFirst%2C%20read%20the%20data%20specification%20here%20and%20follow%20every%20rule%20in%20it%20exactly%3A%0Ahttps%3A//raw.githubusercontent.com/trentnbauer/FilmCalc/main/DATA_SPEC.md%0A%0AThen%20generate%20the%20YAML%20entry%20for%20the%20lab%20on%20the%20pricing%20page%20I%20give%20you%20below.%0A%0ALab%20pricing%20page%3A%20%5BPASTE%20THE%20LINK%20HERE%5D)**

</td>
</tr>
</table>

The prompt is already written for you. Claude reads the project's data rules automatically — you
don't need to know any of them.

### 2️⃣ Paste your shop link and send

Replace `[PASTE THE LINK HERE]` at the bottom of the prompt with the shop or lab page, and hit send.

Claude gives you back:

- ✅ the **YAML entry**, correctly formatted
- ✅ the **filename** to use (e.g. `us-retailers.yaml`)
- ✅ whether that file **already exists**, or you need to create it

### 3️⃣ Check the prices ⚠️

**AI invents prices that look completely convincing.** Open the shop page and compare every number.
If you see `UNKNOWN`, fill it in yourself.

> Not confident? **Stop here** and
> **[open an issue](https://github.com/trentnbauer/FilmCalc/issues/new/choose)** with the link
> instead — someone will add it for you. That's genuinely more useful than a pull request full of
> invented prices.

### 4️⃣ Upload it to GitHub

Claude told you which file to use. Pick your case:

| Claude said… | Do this |
|---|---|
| **"Create a new file"** *(most people)* | Go to **[films/](https://github.com/trentnbauer/FilmCalc/upload/main/films)** or **[labs/](https://github.com/trentnbauer/FilmCalc/upload/main/labs)** → **Create new file** → name it what Claude said → paste everything in |
| **"That file already exists"** | Open the file → click the **pencil ✏️** → paste your entry at the **bottom of the list** |

GitHub may say *"You need to fork this repository to propose changes"* — click the button. One click,
totally normal.

### 5️⃣ Send it

At the bottom of the page:

- **Title:** e.g. `Add Kodak Portra 400 (120)`
- **Description:** **paste the shop link.** This is how the price gets checked.

**Propose changes** → **Create pull request** → **Create pull request**.

**Done.** An automatic check runs and tells you in plain English if anything's wrong.

---

## Other ways to do it

<details>
<summary><b>🤖 Use a different AI (ChatGPT, Gemini, etc.)</b></summary>

<br>

Same idea — paste this into any AI assistant, swapping in your link:

```text
I want to add a film stock to FilmCalc (an open-source film photography cost calculator).

First, read the data specification here and follow every rule in it exactly:
https://raw.githubusercontent.com/trentnbauer/FilmCalc/main/DATA_SPEC.md

Then generate the YAML entry for the film on the product page I give you below.

Product page: [PASTE THE SHOP LINK HERE]
```

For a lab, swap "film stock"/"film"/"product page" for "photo lab"/"lab"/"pricing page".

> **If your AI can't browse the web**, open
> **[DATA_SPEC.md](https://github.com/trentnbauer/FilmCalc/blob/main/DATA_SPEC.md)**
> yourself, copy the whole thing, and paste it in along with your request.

Then carry on from **[step 3](#3️⃣-check-the-prices-️)**.

</details>

<details>
<summary><b>🎞️ Let the FilmCalc app write it (if you already use the app)</b></summary>

<br>

The app can generate the YAML for you — no AI needed.

1. In FilmCalc, go to the **Library** tab and add your film stock (or lab) exactly as you want it.
2. Go to **Settings → Export Data** → **Export Films Only** (or **Export Labs Only**).
3. Give it a preset name. A `.yaml` file downloads.
4. Open it in any text editor and copy **only your entry** — not the whole file, which contains every
   film you have saved:

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

Then carry on from **[step 4](#4️⃣-upload-it-to-github)**.

</details>

<details>
<summary><b>✍️ Write it by hand</b></summary>

<br>

The full field reference lives in **[DATA_SPEC.md](https://github.com/trentnbauer/FilmCalc/blob/main/DATA_SPEC.md)**
— every field, every allowed value, with examples.

**Safest approach:** copy an existing entry from the file and edit it. YAML uses spaces (never tabs),
and indentation is what gives it meaning.

Then carry on from **[step 4](#4️⃣-upload-it-to-github)**.

</details>

<details>
<summary><b>💬 Just open an issue and let someone else do it</b></summary>

<br>

Completely fine — and genuinely useful.

**[Open an issue](https://github.com/trentnbauer/FilmCalc/issues/new/choose)**, pick *"Add a film
stock"* or *"Add a lab"*, and paste the shop link with the details.

</details>

---

## Good to know

<details>
<summary><b>What gets accepted?</b></summary>

<br>

Presets aim to cover **mainstream, reliably available** stocks and labs. Generally **not** added:

- Rare, limited-run, or novelty stocks (special-edition Lomochrome, small-batch films)
- Films that are usually out of stock
- Expired-stock-only listings
- **Sale prices** — always the regular price, since sales end

If a film doesn't qualify, no problem — add it privately in FilmCalc's **Library** tab on your own
device. It just won't ship with the project.

</details>

<details>
<summary><b>Why are films grouped by country, but labs by city?</b></summary>

<br>

**Films** bought from a nationwide chain (Woolworths, JB Hi-Fi — walk in anywhere, no postage) are
broadly national — one `us-retailers.yaml` covers the whole US. But a film's price from an
online-only or single-location shop is only really valid near that shop, since buyers elsewhere pay
postage on top — that's what a bundle's `availability` field is for (see DATA_SPEC.md). Any bundle
that isn't `national` goes in a city file instead, e.g. `melbourne-retailers.yaml`, right alongside
that same film's national bundles from other files.

**Labs** are physical places you post film to or walk into, so they only matter locally. A Melbourne
shooter has no use for a London lab's pricing — hence `melbourne.yaml`, `london.yaml`, and so on.

Users choose which files to import in the app, so keeping them separate means nobody wades through
prices in a currency (or postage zone) they don't use.

</details>

<details>
<summary><b>What happens after I submit?</b></summary>

<br>

- An automatic check confirms your YAML is valid. If something's off — usually indentation, or an
  `UNKNOWN` you forgot to fill in — it shows a red ✗ and explains what's wrong in plain English.
  Click the pencil again on your own branch to fix it; the pull request updates itself.
- Your entry gets a sanity check: mainstream stock, regular price, working buy link.
- Once merged, the site rebuilds automatically and your film or lab is live for everyone.

**If you get stuck, leave a comment on your pull request and say so.** Half-finished pull requests
from people who tried are genuinely welcome — much easier to fix than to write from scratch. Nobody
minds.

</details>
