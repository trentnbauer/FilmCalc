# Commit & PR title convention

Every commit message and PR title Claude creates in this repo starts with one of these prefixes,
lowercase, followed by a colon and a space — `type: short imperative summary`.

| Prefix | For |
|---|---|
| `feat:` | A new user-facing feature or capability |
| `fix:` | A bug fix |
| `data:` | Adding or correcting film/lab preset YAML (`films/`, `labs/`) |
| `refactor:` | Internal code change with no behavior change |
| `chore:` | Tooling, CI, config, dependency, or repo-maintenance changes |
| `docs:` | Documentation only |

Examples: `fix: reset push/pull when loading a film`, `data: add Los Angeles lab and retailer
presets`, `feat: add report-inaccurate-data button`.

Keep the summary imperative and under ~70 characters where possible. Put detail in the commit body
or PR description, not the title.
