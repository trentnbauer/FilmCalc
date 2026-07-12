# Film Cost Calculator

A lightweight, responsive, mobile-friendly web app for analog photographers to work out the true cost per photo of shooting film — and to figure out which of their labs is actually cheapest for a given roll, once push/pull fees are factored in.

## Features

- **Cost breakdown** — Calculates cost per photo, dev-only cost per roll, and total cost per roll (film stock + developing), based on film cost, dev/scan/print pricing, push/pull fees, and once-off or per-roll surcharges.
- **One film, many bundles** — Each film stock is saved once, with a list of bundles underneath it (e.g. a 3-pack vs. a bulk 10-pack, or 24exp vs. 36exp), each with its own price, store, and buy link — managed entirely in the Film Library tab. The Calculator tab stays a quick lookup: pick a saved bundle from the dropdown, or just type in Box Speed / Total Cost / Rolls / Exposures for a one-off calculation.
- **Buy links** — Save a store name and purchase link against a bundle; a "🛒 Buy from {store}" link shows up when that bundle is loaded in the Calculator, and again in the Film Library.
- **Film Library tab** — Manage every film stock and its bundles (add, edit, delete), and see every saved bundle grouped by Box Speed, with the cheapest cost-per-photo bundle at each ISO highlighted, and the single cheapest bundle overall highlighted in gold.
- **Labs for this roll** — Every saved lab profile is automatically compared against your current film and push/pull settings, sorted by cost per photo. A lab that's cheaper at box speed isn't always cheaper once you push 2 stops — this handles that. Each lab shows its turnaround time (Next Day / Same Week / Longer), and labs offering high-res scans get a "HI-RES" badge. Filter toggles let you narrow the list to Next Day and/or Hi-Res labs only. "Cheapest Total" always shows the actual cheapest option; if the cheapest Hi-Res + Fastest option is within a configurable percentage of that, its own card is highlighted gold as the recommended pick instead.
- **Target Speed first** — Enter the ISO you're shooting at right at the top of the Calculator tab. If you leave Box Speed blank, the app automatically loads the cheapest saved film for that speed — no need to expand Quick Calculate or click anything.
- **Push/pull aware** — Automatically works out stops pushed or pulled from Box Speed vs. Target Speed (using log2 of the ratio), and applies each lab's push/pull fee — either a flat fee or a per-stop rate.
- **Max push/pull limits** — Set a max push/pull (in stops) per film stock in the Film Library — defaults to 1. A warning shows next to Target Speed if a loaded film is pushed/pulled beyond its own limit; manual entries with no film loaded use the same 1-stop default.
- **Film stocks are identified by name + Box Speed together** — the same name can exist at more than one Box Speed (e.g. a reformulated stock), and each is treated as a separate saved film. Changing a film's Box Speed and saving asks whether that's correcting the same entry or creating a new, separate one.
- **Process (C41 / B&W / E6)** — Every film stock and every lab service tier has a Process — C41 (color negative), B&W, or E6, defaulting to C41. A film is only ever paired with a lab tier of the same process — a B&W film won't be compared against a lab's C41-only tier, anywhere in the app. The Cheapest tab has C41/B&W/E6 checkboxes to further narrow its lists to specific processes.
- **No-push/pull service tiers** — Mark an individual lab service tier as not offering push/pull at all (e.g. a same-day mini-lab); it's automatically excluded from comparisons whenever the roll actually needs pushing or pulling, but still shows up normally for box-speed rolls.
- **Hide from Calculator** — Mark individual labs or film stocks as hidden from the Calculator (in Lab Setup / Film Setup) to exclude them from Labs For This Roll and film recommendations, while keeping them manageable in their own tab.
- **Lab contact details** — Optionally save a lab's address, phone, email, and website. The address gets a one-tap "📍 Directions" link straight to your phone's maps app.
- **Pinned comparison** — Pin any lab result to freeze it on screen, then change film or lab details and see the new cheapest result compared directly against the pinned one — persists across reloads until unpinned.
- **Expired film recommendation** — Mark a film as expired in the Calculator's quick lookup, set its storage condition and expiry date, and get a rule-of-thumb recommended shooting speed (EI) to compensate for lost sensitivity — shown as a camera/meter setting, separate from the lab's development instructions.
- **Currency switcher** — Pick your currency symbol in Settings (defaults to `$`) — it's a display label only, not a live conversion.
- **Install as an app** — Add it to your home screen or app list from Settings for quicker access, like a native app.
- **Profile management** — Save your own film stocks and lab pricing as reusable profiles, stored locally in your browser. Optionally seed the app with defaults via `config.yaml` (see below) — if it isn't present, the app just starts with no saved profiles.
- **YAML export/import** — Export your saved profiles and settings as a single `config.yaml` — the exact format the app reads on load — so it can be dropped straight into a self-hosted instance with no manual editing.
- **Write live config to server (self-hosted only)** — On the Docker/self-hosted build, Settings has a "Write Live Config to Server" button that saves your current films, labs, and settings straight to `config.yaml` on the server, no download/upload round-trip needed. This isn't available on the GitHub Pages build, which is static-only and has nowhere to write to — the app detects this automatically and hides the button there.
- **Dark mode** — Toggle in the top corner, respects system preference by default.
- **Mobile-first design** — Scales from phone screens to desktop.

## Getting Started

### Live version

The live calculator is hosted at: **https://filmcalc.trentbauer.com**

### Self-hosting with Docker

Since all your saved film and lab profiles live in your browser's `localStorage`, the live version works perfectly well for most people — there's nothing wrong with just using it. You might prefer self-hosting if you:

- Want to seed the app with a fixed set of default film stocks and labs (e.g. for a household, club, or team to share a common starting point)
- Don't want to depend on `filmcalc.trentbauer.com` staying online, or want a version you control the uptime of
- Run it on a local network / homelab alongside your other self-hosted tools, without needing internet access to use it
- Want to inspect or modify the source yourself with full control over the deployment

```yaml
services:
  app:
    image: ghcr.io/trentnbauer/filmcalc:latest
    ports:
      - ${WEBPORT:-8080}:80
    volumes:
      - data:/usr/share/nginx/html
    restart: unless-stopped
    labels:
      - autoheal=true
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://localhost/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  autoheal:
    image: willfarrell/autoheal:latest
    restart: unless-stopped
    environment:
      - AUTOHEAL_CONTAINER_LABEL=autoheal
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

volumes:
  data:
```

By default the app runs on port `8080` — set a `WEBPORT` environment variable (or a `.env` file) if you'd like a different port.

The `healthcheck` pings the app every 30 seconds and marks it unhealthy after 3 failed attempts. On its own, Docker's `restart` policy only restarts a container on a hard crash — it won't act on a failed healthcheck. The `autoheal` sidecar watches for any container labelled `autoheal=true` and force-restarts it if Docker marks it unhealthy, so a broken/unresponsive app container gets rebooted automatically.

### Adding default profiles (optional)

This app doesn't ship with any default film stocks, labs, or settings baked in — it just starts empty and lets you build up profiles via the UI, which are saved in your browser's `localStorage`.

If you'd rather seed it with defaults (e.g. for a shared/self-hosted instance), you can copy your own `config.yaml` straight into the running container using `docker compose cp`:

```bash
docker compose cp config.yaml app:/usr/share/nginx/html/config.yaml
```

Refresh the page and the app will pick it up automatically — no restart or rebuild needed. Format:

```yaml
settings:
  upgradeThresholdPercent: 10   # see "Labs For This Roll" below

films:
  - name: "Kodak Gold"
    boxSpeed: 400
    maxPushPull: 1                                            # optional; defaults to 1. Warns in the Calculator if pushed/pulled further than this
    process: "C41"                                            # optional; "C41" (default), "BW", or "E6" — only matched against lab tiers of the same process
    bundles:
      - rolls: 1
        exposures: 36
        filmCost: 25
        storeName: "Example Camera Store"                      # optional; shown in the buy link
        buyLink: "https://www.example.com/kodak-gold-200"       # optional
      - rolls: 10
        exposures: 36
        filmCost: 210
        storeName: "Example Bulk Store"
        buyLink: "https://www.example.com/kodak-gold-200-bulk"

labs:
  - name: "Irohas Melbourne"
    services:
      - devCost: 17
        process: "C41"               # optional; "C41" (default), "BW", or "E6" — only matched against films of the same process
        pushPullCost: 5
        pushPullType: "per_stop"    # or "flat"
        turnaroundTime: "next_day"  # "next_day" | "same_week" | "longer"
        highResScan: true           # marks this tier as offering high-res scans

  - name: "Walkens Melbourne"
    services:
      - devCost: 16
        pushPullCost: 10
        pushPullType: "flat"
        turnaroundTime: "same_week"
        highResScan: false
      - devCost: 23
        pushPullCost: 10
        pushPullType: "flat"
        turnaroundTime: "same_week"
        highResScan: true
      - devCost: 33
        pushPullCost: 10
        pushPullType: "flat"
        turnaroundTime: "next_day"
        highResScan: true
```

Each lab is one entry with a `services` list underneath it — one item per service tier the lab offers (e.g. standard vs. hi-res scan, or next-day vs. same-week turnaround), rather than a separate top-level lab entry for every combination. Every service tier shows up as its own row in the "Labs For This Roll" comparison, labelled with the parent lab's name plus its turnaround/hi-res badges.

All three top-level keys (`settings`, `films`, `labs`) are optional — include only what you want to seed. `settings.upgradeThresholdPercent` acts as a factory default for the "Cheapest Total" upgrade threshold (see Settings in the app) and only applies if the person hasn't already changed it themselves.

## Contributing a film stock or lab

**No git. No installing anything. Two clicks and a paste.**

Click a button — the prompt is already written, and Claude reads the project's data rules for you:

| | |
|---|---|
| 🎞️ **[Add a FILM stock →](https://claude.ai/new?q=I%20want%20to%20add%20a%20FILM%20STOCK%20to%20FilmCalc%20%28an%20open-source%20film%20photography%20cost%20calculator%29.%0A%0AFirst%2C%20read%20the%20data%20specification%20here%20and%20follow%20every%20rule%20in%20it%20exactly%3A%0Ahttps%3A//raw.githubusercontent.com/trentnbauer/FilmCalc/main/DATA_SPEC.md%0A%0AThen%20generate%20the%20YAML%20entry%20for%20the%20film%20on%20the%20product%20page%20I%20give%20you%20below.%0A%0AProduct%20page%3A%20%5BPASTE%20THE%20LINK%20HERE%5D)** | 🏪 **[Add a LAB →](https://claude.ai/new?q=I%20want%20to%20add%20a%20PHOTO%20LAB%20to%20FilmCalc%20%28an%20open-source%20film%20photography%20cost%20calculator%29.%0A%0AFirst%2C%20read%20the%20data%20specification%20here%20and%20follow%20every%20rule%20in%20it%20exactly%3A%0Ahttps%3A//raw.githubusercontent.com/trentnbauer/FilmCalc/main/DATA_SPEC.md%0A%0AThen%20generate%20the%20YAML%20entry%20for%20the%20lab%20on%20the%20pricing%20page%20I%20give%20you%20below.%0A%0ALab%20pricing%20page%3A%20%5BPASTE%20THE%20LINK%20HERE%5D)** |

Paste your shop link, send, **check the prices Claude gives you**, then upload the file it produces
to [`films/`](https://github.com/trentnbauer/FilmCalc/upload/main/films) or
[`labs/`](https://github.com/trentnbauer/FilmCalc/upload/main/labs).

👉 **[Full step-by-step guide (CONTRIBUTING.md)](CONTRIBUTING.md)** — also covers doing it by hand,
using the app's own export, or another AI.

Prefer not to? **[Open an issue](https://github.com/trentnbauer/FilmCalc/issues/new/choose)** with
the link and someone will add it for you.

Presets aim to cover **mainstream, reliably available** stocks and labs. Rare or limited-run films are
generally left out — but you can always add them privately in your own **Library** tab.

## Built With

- [Tailwind CSS](https://tailwindcss.com/) — styling and responsive layout
- [js-yaml](https://github.com/nodeca/js-yaml) — reading and writing the YAML profile files client-side
- Vanilla JavaScript — application logic, `localStorage` for saved profiles
- nginx (Alpine) — serves the static app in the Docker image
- A minimal service worker + web app manifest (`sw.js`, `manifest.json`) — makes the app installable to a home screen/app list on supported browsers

Originally vibe coded by Google Gemini, with further features (push/pull-aware lab comparison, YAML import/export, dark mode fixes, tabs, settings, Docker self-hosting) built by Claude (Anthropic).

## Author

**Trent Bauer**
- Portfolio: [trentbauer.com](https://trentbauer.com)

---
*Created with passion for analog photography and community infrastructure.*
