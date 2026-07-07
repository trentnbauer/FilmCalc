# Film Cost Calculator

A lightweight, responsive, mobile-friendly web app for analog photographers to work out the true cost per photo of shooting film — and to figure out which of their labs is actually cheapest for a given roll, once push/pull fees are factored in.

## Features

- **Cost breakdown** — Calculates cost per photo, dev-only cost per roll, and total cost per roll (film stock + developing), based on film cost, dev/scan/print pricing, push/pull fees, and once-off or per-roll surcharges.
- **Multiple bundles per film** — The same film stock can be saved multiple times with different pack sizes, exposure counts, prices, or stores (e.g. a 3-pack vs. a bulk 10-pack of Kodak Gold) without one overwriting the other. An optional Bundle Label distinguishes two bundles that happen to share the exact same rolls/exposures.
- **Buy links** — Save a store name and purchase link against a film profile; a "🛒 Buy from {store}" link appears in Film Setup, and shows up again in the Cheapest Films tab.
- **Cheapest Films tab** — Every saved film profile, grouped by Box Speed, with the cheapest cost-per-photo bundle at each ISO highlighted (buy link included), and everything else listed below.
- **Labs for this roll** — Every saved lab profile is automatically compared against your current film and push/pull settings, sorted by cost per photo. A lab that's cheaper at box speed isn't always cheaper once you push 2 stops — this handles that. Each lab shows its turnaround time (Next Day / Same Week / Longer), and labs offering high-res scans get a "HI-RES" badge. Filter toggles let you narrow the list to Next Day and/or Hi-Res labs only. If the cheapest Hi-Res + Fastest option is within a configurable percentage of the absolute cheapest, it's promoted to "Cheapest Total" and highlighted in gold as the recommended pick.
- **Push/pull aware** — Automatically works out stops pushed or pulled from Box Speed vs. Dev Speed (using log2 of the ratio), and applies each lab's push/pull fee — either a flat fee or a per-stop rate.
- **Profile management** — Save your own film stocks and lab pricing as reusable profiles, stored locally in your browser. Optionally seed the app with defaults via `config.yaml` (see below) — if it isn't present, the app just starts with no saved profiles.
- **YAML export/import** — Export your saved profiles and settings as a single `config.yaml` — the exact format the app reads on load — so it can be dropped straight into a self-hosted instance with no manual editing.
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
    rolls: 1
    exposures: 36
    filmCost: 25
    storeName: "Example Camera Store"                      # optional; shown in the buy link
    buyLink: "https://www.example.com/kodak-gold-200"       # optional; shows a "Buy this film" link
  - name: "Kodak Gold"
    bundleLabel: "Bulk 10-Pack"                             # optional; only needed to tell apart two
    boxSpeed: 400                                           # bundles with the exact same rolls/exposures —
    rolls: 10                                               # different rolls or exposures (e.g. 24 vs 36exp)
    exposures: 36                                           # are always kept separate automatically
    filmCost: 210
    storeName: "Example Bulk Store"
    buyLink: "https://www.example.com/kodak-gold-200-bulk"

labs:
  - name: "Irohas Melbourne"
    services:
      - devCost: 17
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
