# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.** A public issue discloses the
flaw to everyone before there's a fix available.

Instead, report it privately using **[GitHub's private vulnerability reporting](https://github.com/trentnbauer/FilmCalc/security/advisories/new)**
(the *Security* tab → *Report a vulnerability*). Only the maintainer can see it, and it can be
discussed and fixed before anything is made public.

If private reporting is unavailable to you for any reason, open a public issue containing **only**
the sentence "I'd like to report a security issue privately" — with no technical detail — and you'll
be contacted to arrange a private channel.

## What to include

The more of this you can provide, the faster it can be confirmed and fixed:

- **What kind of issue it is** — e.g. stored XSS, prototype pollution, supply-chain, exposed secret.
- **Where it is** — the file and, if you can, the line or function. FilmCalc is a single-file app,
  so `index.html` plus a function name is usually enough.
- **How to reproduce it** — exact steps, and the input that triggers it. A minimal payload is ideal.
- **What an attacker could achieve** — reading another user's data, executing script, defacing the
  page, exfiltrating something.
- **A screenshot or short recording**, if it helps demonstrate the impact.
- **Where you saw it** — the public GitHub Pages site, a self-hosted Docker deployment, or the raw
  HTML file opened locally.

## Scope

FilmCalc is a static, client-side single-page app. It has **no backend, no accounts, and no server-side
database** — all data lives in the browser's `localStorage` on the user's own device.

Things that are **in scope** and genuinely worth reporting:

- **Cross-site scripting (XSS)** — particularly via imported YAML. Film names, lab names, store names,
  buy links, and theme values all come from user-supplied or imported files and are rendered into the
  DOM. A crafted `config.yaml` that executes script when imported is the highest-value bug in this app.
- **Malicious URL injection** — a `buyLink` or directions link that produces a `javascript:` URL or
  otherwise escapes the URL sanitiser.
- **Prototype pollution** or similar via imported YAML/JSON parsing.
- **Supply-chain issues** — a compromised or typosquatted CDN dependency (Tailwind, js-yaml).
- **Vulnerabilities in the Docker image or its base image**, or in the GitHub Actions workflows
  (e.g. injection into a workflow, over-broad token permissions).
- **Content Security Policy** weaknesses that make the above meaningfully easier.

Things that are **out of scope**:

- Anything requiring the attacker to already have physical access to the victim's unlocked device.
  A person who can use your browser can already read your `localStorage`; that isn't a FilmCalc bug.
- The fact that data is stored unencrypted in `localStorage`. This is by design for a local-first,
  no-account app, and the data is film prices — not credentials.
- Missing security headers on a **self-hosted** deployment. That's a configuration choice for whoever
  deployed it. (Weak headers in the *shipped* nginx config or Dockerfile **are** in scope.)
- Social engineering, or "a user could import a config.yaml with wrong prices in it". Bad *data* isn't
  a vulnerability; bad data that *executes* is.
- Denial of service by importing an enormous file into your own browser.

## Response

You can expect an acknowledgement within about a week. This is a hobby project maintained by one
person in their spare time, so please be patient — but a genuine XSS or injection issue will be
treated as a priority.

Please give a reasonable window for a fix before disclosing publicly. Credit will gladly be given
in the release notes unless you'd rather stay anonymous.
