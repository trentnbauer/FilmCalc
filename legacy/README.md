# Archived: pre-redesign UI

This is the FilmCalc UI that shipped at `/` before the "FilmCalc 3.0" redesign
(developed at `/new/`) was promoted to replace it. Kept here for reference and
recoverability rather than deleted outright — the same history is also in
`git log`/`git show` for the commits before the swap, but a live copy in the
tree is easier to diff against or resurrect from than digging through commit
history.

Not wired into the build (`.github/workflows/build-github-page.yml` doesn't
stage this directory), so it isn't served — these files reference other
`js/*.js` files by root-relative paths (`js/i18n.js`, `js/dev-cost-calc.js`,
etc.) that assume they're loaded from `/`, not from `/legacy/`, and those
paths were deliberately left unchanged to keep this an exact snapshot rather
than a "fixed up" copy.
