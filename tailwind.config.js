// Drives the prebuilt css/tailwind.css (issue #61/#74 — replaces the
// cdn.tailwindcss.com Play CDN, which ships Tailwind's whole JIT compiler to
// the browser and isn't meant for production). Only used at build time (see
// .github/workflows/build-github-page.yml and css/README.md) — never loaded
// by the app itself, so this doesn't reintroduce a bundler for the shipped
// site.
//
// #87: content used to be just index.html. That was fine when #74 was
// written, but the #61 module-split epic (landed after #74) moved most of
// the app's own rendering — and the Tailwind classes it generates in
// template strings — out into js/*.js. Any class that only ever appears in
// one of those files is invisible to this scanner and gets silently purged
// from the compiled CSS with no error: e.g. dark:bg-gray-800/30 on the Per
// Photo/Film push-pull sub-line (js/dev-cost-ui.js), which rendered plain
// white in dark mode once index.html itself stopped containing that class
// literally. content must cover every file that can render Tailwind
// classes into the DOM, not just index.html.
module.exports = {
    content: ['./index.html', './js/*.js'],
    darkMode: 'class',
};
