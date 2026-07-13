## Tailwind CSS build

`tailwind.css` is a prebuilt static file (issue #74) — it replaces the
`cdn.tailwindcss.com` Play CDN, which ships Tailwind's whole JIT compiler to
the browser and isn't meant for production.

It's regenerated automatically on every deploy by
`.github/workflows/build-github-page.yml`. The checked-in copy here is only
the fallback for offline/local Docker builds, which have no Node available to
rebuild it — after adding or removing Tailwind utility classes in
`index.html` **or any `js/*.js` file** (see `tailwind.config.js`'s
`content` — issue #87 was a class used only in a `js/*.js` file getting
silently purged because the config only scanned `index.html`), regenerate
and commit it:

```sh
npx tailwindcss@3.4.17 -i css/tailwind.src.css -o css/tailwind.css --minify
```
