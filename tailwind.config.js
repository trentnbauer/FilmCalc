// Drives the prebuilt css/tailwind.css (issue #61/#74 — replaces the
// cdn.tailwindcss.com Play CDN, which ships Tailwind's whole JIT compiler to
// the browser and isn't meant for production). Only used at build time (see
// .github/workflows/build-github-page.yml and css/README.md) — never loaded
// by the app itself, so this doesn't reintroduce a bundler for the shipped
// site.
module.exports = {
    content: ['./index.html'],
    darkMode: 'class',
};
