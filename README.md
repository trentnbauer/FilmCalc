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

```yaml
services:
  filmcalc:
    image: ghcr.io/trentnbauer/filmcalc:latest
    ports:
      - "8080:80"
    # Optional: bind-mount your own films.yaml / labs.yaml so you can edit your
    # default film stocks and labs without needing to rebuild or republish the image.
    # volumes:
    #   - ./films.yaml:/usr/share/nginx/html/films.yaml:ro
    #   - ./labs.yaml:/usr/share/nginx/html/labs.yaml:ro
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

The app will be available at `http://localhost:8080`.

### Adding default profiles (optional)

This app doesn't ship with any default film stocks or labs baked in — it just starts empty and lets you build up profiles via the UI, which are saved in your browser's `localStorage`.

If you'd rather seed it with defaults (e.g. for a shared/self-hosted instance), you can add your own `films.yaml` and `labs.yaml` on top of the container using the bind-mount lines in the `docker-compose.yml` above. Format:

**`films.yaml`**
```yaml
- name: "Kodak Gold"
  boxSpeed: 400
  rolls: 1
  exposures: 36
  filmCost: 25
```

**`labs.yaml`**
```yaml
- name: "Irohas Melbourne"
  devCost: 17
  pushPullCost: 5
  pushPullType: "per_stop"    # or "flat"
  turnaroundTime: "next_day"  # "next_day" | "same_week" | "longer"
  highResScan: true           # marks this lab as offering high-res scans
```

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
