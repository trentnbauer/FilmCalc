#!/usr/bin/env node
// Verifies every locale in js/i18n.js's STRINGS object has exactly the same
// keys as `en`, and that every key's {placeholder} tokens match exactly
// across locales — a locale missing a key silently falls back to English
// (see t() in js/i18n.js), but a mismatched placeholder set means
// t(key, params) either drops a value or leaves a raw "{token}" in the
// rendered string. Run this after adding or editing any locale, before
// opening a PR (the nightly translation tier in daily-claude-run.yml does
// this automatically).
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', '..', 'js', 'i18n.js');
const src = fs.readFileSync(srcPath, 'utf8');
const start = src.indexOf('const STRINGS');
const end = src.indexOf('let currentLocale');
if (start === -1 || end === -1) {
    console.error('Could not locate the STRINGS object in js/i18n.js — has its shape changed?');
    process.exit(1);
}

let STRINGS;
try {
    const objectLiteral = src.slice(start, end)
        .replace(/^const STRINGS\s*=\s*/, '')
        .replace(/;\s*$/, '');
    // eslint-disable-next-line no-eval
    STRINGS = (0, eval)(`(${objectLiteral})`);
} catch (e) {
    console.error('Failed to parse STRINGS as a JS object literal:', e.message);
    process.exit(1);
}

const placeholderSet = (str) => [...str.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const locales = Object.keys(STRINGS);
if (!locales.includes('en')) {
    console.error('No "en" locale found — nothing to compare against.');
    process.exit(1);
}
const enKeys = Object.keys(STRINGS.en).sort();
let ok = true;

for (const locale of locales) {
    if (locale === 'en') continue;
    const keys = Object.keys(STRINGS[locale]).sort();
    const missing = enKeys.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !enKeys.includes(k));
    if (missing.length) { ok = false; console.error(`${locale}: missing ${missing.length} key(s): ${missing.join(', ')}`); }
    if (extra.length) { ok = false; console.error(`${locale}: ${extra.length} extra key(s) not in en: ${extra.join(', ')}`); }
    for (const key of enKeys) {
        if (!STRINGS[locale][key]) continue;
        const enPh = placeholderSet(STRINGS.en[key]);
        const locPh = placeholderSet(STRINGS[locale][key]);
        if (enPh !== locPh) {
            ok = false;
            console.error(`${locale}.${key}: placeholder mismatch — en has {${enPh || 'none'}}, ${locale} has {${locPh || 'none'}}`);
        }
    }
}

if (ok) {
    console.log(`OK — ${locales.length} locale(s) (${locales.join(', ')}), ${enKeys.length} keys each, all placeholders match.`);
} else {
    process.exit(1);
}
