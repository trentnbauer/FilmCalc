# Film Cost Calculator

A lightweight, responsive, mobile-friendly web app for analog photographers to work out the true cost per photo of shooting film — and to figure out which of their labs is actually cheapest for a given roll, once push/pull fees are factored in.

## Features

- **Cost breakdown** — Calculates cost per photo, dev-only cost per roll, and total cost per roll (film stock + developing), based on film cost, dev/scan/print pricing, push/pull fees, and once-off or per-roll surcharges.
- **Labs for this roll** — Every saved lab profile is automatically compared against your current film and push/pull settings, sorted by cost per photo. A lab that's cheaper at box speed isn't always cheaper once you push 2 stops — this handles that. Each lab shows its turnaround time (Next Day / Same Week / Longer), and labs offering high-res scans get a "HI-RES" badge. Filter toggles let you narrow the list to Next Day and/or Hi-Res labs only.
- **Push/pull aware** — Automatically works out stops pushed or pulled from Box Speed vs. Dev Speed (using log2 of the ratio), and applies each lab's push/pull fee — either a flat fee or a per-stop rate.
- **Profile management** — Save your own film stocks and lab pricing as reusable profiles, stored locally in your browser. Optionally seed the app with defaults via `films.yaml` and `labs.yaml` (see below) — if these aren't present, the app just starts with no saved profiles.
- **YAML export/import** — Export your saved profiles as `films.yaml` / `labs.yaml` — the exact format the app reads on load — so they can be dropped straight into a self-hosted instance with no manual editing. Import supports loading one or both files back in.
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

This app doesn't ship with any default film stocks or labs baked in — it just starts empty and lets you build up profiles via the UI, which are saved in your browser's `localStorage`.

If you'd rather seed it with defaults (e.g. for a shared/self-hosted instance), you can copy your own `films.yaml` and `labs.yaml` straight into the running container using `docker compose cp`:

```bash
docker compose cp films.yaml app:/usr/share/nginx/html/films.yaml
docker compose cp labs.yaml app:/usr/share/nginx/html/labs.yaml
```

Refresh the page and the app will pick them up automatically — no restart or rebuild needed. Format:

**`films.yaml`**
```yaml
- name: "Kodak Gold"
  boxSpeed: 400
  rolls: 1
  exposures: 36
  filmCost: 25
```

**`labs.yaml`**

Each lab is one entry with a `services` list underneath it — one item per service tier the lab offers (e.g. standard vs. hi-res scan, or next-day vs. same-week turnaround), rather than a separate top-level lab entry for every combination:

```yaml
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

Every service tier shows up as its own row in the "Labs For This Roll" comparison, labelled with the parent lab's name plus its turnaround/hi-res badges.

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
