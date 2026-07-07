# Film Cost Calculator

A lightweight, responsive, mobile-friendly web app for analog photographers to work out the true cost per photo of shooting film — and to figure out which of their labs is actually cheapest for a given roll, once push/pull fees are factored in.

## Features

- **Cost breakdown** — Calculates cost per photo, dev-only cost per roll, and total cost per roll (film stock + developing), based on film cost, dev/scan/print pricing, push/pull fees, and once-off or per-roll surcharges.
- **Cheapest lab comparison** — Every saved lab profile is automatically compared against your current film and push/pull settings, sorted by cost per photo. A lab that's cheaper at box speed isn't always cheaper once you push 2 stops — this handles that.
- **Push/pull aware** — Automatically works out stops pushed or pulled from Box Speed vs. Dev Speed (using log2 of the ratio), and applies each lab's push/pull fee — either a flat fee or a per-stop rate.
- **Profile management** — Save your own film stocks and lab pricing as reusable profiles, stored locally in your browser. Built-in defaults come from `films.yaml` and `labs.yml`, which ship with the repo and can be edited directly.
- **YAML export/import** — Export your saved profiles as `films.yaml` / `labs.yml` — the exact format the app reads on load — so they can be committed straight back into a self-hosted instance with no manual editing. Import supports loading one or both files back in.
- **Dark mode** — Toggle in the top corner, respects system preference by default.
- **Mobile-first design** — Scales from phone screens to desktop.

## Getting Started

### Live version

The live calculator is hosted at: **https://filmcalc.trentbauer.com**

### Self-hosting with Docker

This repo includes a `Dockerfile`, `docker-compose.yml`, and a GitHub Action that builds and publishes an image to GitHub Container Registry (GHCR) on every push to `main`.

**Option 1 — build locally:**

```bash
git clone https://github.com/trentnbauer/FilmCalc.git
cd FilmCalc
docker compose up -d --build
```

**Option 2 — use the published image:**

Edit `docker-compose.yml` and swap the `build: .` line for:

```yaml
image: ghcr.io/trentnbauer/filmcalc:latest
```

Then run:

```bash
docker compose up -d
```

The app will be available at `http://localhost:8080`.

### Customizing default profiles

Edit `films.yaml` and `labs.yml` in the project root to change the film stocks and labs that ship as defaults. Format:

**`films.yaml`**
```yaml
- name: "Kodak Gold"
  boxSpeed: 400
  rolls: 1
  exposures: 36
  filmCost: 25
```

**`labs.yml`**
```yaml
- name: "Irohas Melbourne"
  devCost: 17
  scanCost: 0
  printCost: 0
  pushPullCost: 5
  pushPullType: "per_stop"   # or "flat"
```

If you're bind-mounting these files instead of rebuilding the image, uncomment the `volumes:` section in `docker-compose.yml`.

## Built With

- [Tailwind CSS](https://tailwindcss.com/) — styling and responsive layout
- [js-yaml](https://github.com/nodeca/js-yaml) — reading and writing the YAML profile files client-side
- Vanilla JavaScript — application logic, `localStorage` for saved profiles
- nginx (Alpine) — serves the static app in the Docker image

Originally vibe coded by Google Gemini, with further features (push/pull-aware lab comparison, YAML import/export, dark mode fixes, tabs, settings, Docker self-hosting) built by Claude (Anthropic).

## Author

**Trent Bauer**
- Portfolio: [trentbauer.com](https://trentbauer.com)

---
*Created with passion for analog photography and community infrastructure.*
