// FilmCalc "3.0" preview — built against the Claude Design mockup
// "FilmCalc Lookup 4b.dc.html" (see new/README.md), lives at /new/ so it
// can be iterated on without touching the shipped UI at /. Same
// architecture as the root app (js/app.js): plain global functions, no
// bundler, whole-view innerHTML re-render on every state change, onclick/
// onchange strings calling into the global `App` object below.
//
// Data layer is shared with root, not duplicated: this reads/writes the
// exact same localStorage keys (filmProfiles, labProfiles, homeLab,
// globalFormat, globalProcess, globalFilmColor, defaultTierLabel,
// upgradeThresholdPercent, mailBackRollCount, analyticsConsent, locale,
// setupSeen) and calls the same pure calculation engine (js/dev-cost-
// calc.js, loaded before this file — see index.html). A film or lab saved
// here shows up on root, and vice versa.
//
// What's deliberately simplified vs. root, and vs. the mockup itself —
// noted here once instead of at every call site:
//   - No i18n: the mockup's own Settings/Setup language picker is
//     presentational only (it never actually translates the mockup's UI
//     either) — picking a language here still writes the shared `locale`
//     key, which DOES change root's language, just not this page's own
//     copy. Real i18n for this UI is future work.
//   - No geolocation-based preset pre-check (the mockup doesn't have one
//     either — PRESET_REGIONS was a flat hardcoded list in the source
//     file). Region checkboxes are built from the real films/labs
//     index.json instead of that hardcoded demo list, so the presets you
//     import are real, but nothing is pre-ticked for you.
//   - Custom YAML/JSON file import and CSV export are stubbed to a toast,
//     matching the mockup's own stub behaviour (importFile/exportJson were
//     no-ops in the source file too).
//   - The format switcher only offers the 4 formats the mockup designed
//     UI for (35mm/120/110/Sheet) — 127 and 220 exist in options.yaml but
//     have no slot in this design; they're unreachable here (still fully
//     supported at root).
//   - The lab/film edit modals expose the fields the mockup designed a
//     control for. Fields the mockup's edit form never asks about
//     (per-tier pushPullCost/tiffScan/noPushPull/processes, per-bundle
//     state/city) are preserved unchanged from the existing record when
//     editing, and given sensible defaults when creating a brand new
//     tier/bundle.

(function () {
'use strict';

// ---------- Small shared helpers (same behaviour as js/app.js's own) ----------
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function jsAttr(str) {
    return escapeHtml(String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n'));
}
function sanitizeUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(url, window.location.href);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
    } catch { return ''; }
}
function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
}
function writeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function money(n) { return (n || 0).toFixed(2); }
function CUR() { return escapeHtml(localStorage.getItem('currencySymbol') || '$'); }
function getAllFilms() { return readJSON('filmProfiles', {}); }
function getAllLabs() { return readJSON('labProfiles', {}); }
function setAllFilms(v) { writeJSON('filmProfiles', v); }
function setAllLabs(v) { writeJSON('labProfiles', v); }
function getHomeLab() { return localStorage.getItem('homeLab') || ''; }
function setHomeLab(name) { try { localStorage.setItem('homeLab', name || ''); } catch {} }
function getDefaultTierLabel() { return localStorage.getItem('defaultTierLabel') || ''; }
function setDefaultTierLabel(label) { try { localStorage.setItem('defaultTierLabel', label || ''); } catch {} }
const turnaroundLabels = { next_day: 'Next day', same_week: 'Same week', longer: 'Longer' };
const turnaroundValues = { 'Next day': 'next_day', 'Same week': 'same_week', 'Longer': 'longer' };
function tierDescription(tier) {
    const parts = [];
    if (tier.highResScan) parts.push('Hi-res');
    if (tier.tiffScan) parts.push('TIFF');
    parts.push(turnaroundLabels[tier.turnaroundTime] || tier.turnaroundTime || 'Same week');
    return parts.join(' · ') || 'Service';
}
function labDirectionsUrl(lab) {
    if (!lab || !lab.address) return '';
    const ios = /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent || '');
    const q = encodeURIComponent(lab.address);
    return ios ? 'https://maps.apple.com/?q=' + q : 'https://www.google.com/maps/search/?api=1&query=' + q;
}
function filmKeyOf(f) { return filmKey(f.name, f.boxSpeed, f.format); }

// ---------- Option lists (fixed set the mockup designed UI for) ----------
const FORMATS = ['35mm', '120', '110', 'Sheet'];
const FORMAT_VALUE = { '35mm': '35mm', '120': '120', '110': '110', 'Sheet': 'sheet' };
const FORMAT_LABEL = { '35mm': '35mm', '120': '120', '110': '110', 'sheet': 'Sheet' };
const FILM_COLORS = ['Colour', 'B&W', 'Speciality'];
const FILM_COLOR_VALUE = { 'Colour': 'color', 'B&W': 'bw', 'Speciality': 'speciality' };
const FILM_COLOR_LABEL = { color: 'Colour', bw: 'B&W', speciality: 'Speciality' };
const PROCESSES = ['C41', 'B&W', 'E6', 'ECN-2'];
const PROCESS_VALUE = { 'C41': 'C41', 'B&W': 'BW', 'E6': 'E6', 'ECN-2': 'ECN2' };
const PROCESS_LABEL = { C41: 'C41', BW: 'B&W', E6: 'E6', ECN2: 'ECN-2' };
const FRAME120 = { '6x4.5': 16, '6x6': 12, '6x7': 10, '6x8': 9, '6x9': 8, '6x12': 6, '6x17': 4 };
const FRAME35 = { full: { label: 'Full frame', factor: 1 }, half: { label: 'Half frame', factor: 2 }, xpan: { label: 'XPan', factor: 0.583 } };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LANGUAGE_OPTIONS = [
    ['en', 'English'], ['es', 'Español'], ['ja', '日本語'], ['de', 'Deutsch'], ['pt', 'Português (BR)'],
    ['fr', 'Français'], ['ko', '한국어'], ['zh', '中文 (简体)'], ['it', 'Italiano'], ['ru', 'Русский']
];
const SETUP_STEPS = ['Language', 'Starter presets', 'Home lab'];
const YEARS_PER_STOP = { c41: { cold: 15, controlled: 10, uncontrolled: 5 }, bw: { cold: 20, controlled: 13, uncontrolled: 7 }, e6: { cold: 10, controlled: 7, uncontrolled: 3 } };
const EXPIRED_PROCESSES = [['C-41 colour', 'c41'], ['B&W', 'bw'], ['E-6 slide', 'e6']];
const STORAGE_OPTIONS = [
    ['Cold stored', 'cold', 'Fridge or freezer since new; ages slowest.'],
    ['Climate controlled', 'controlled', 'Indoors at steady room temperature, out of sunlight; the normal rate.'],
    ['Uncontrolled', 'uncontrolled', 'Shed, garage, roof space or a hot car; ages fastest.']
];

// ---------- App state ----------
const state = {
    view: 'lookup', desktop: false, menu: false, modal: false,
    format: localStorage.getItem('globalFormat') || '35mm',
    filmColor: localStorage.getItem('globalFilmColor') || 'color',
    process: localStorage.getItem('globalProcess') || 'C41',
    boxSpeed: '', packCost: '', postage: '', rolls: '1', exposures: '36',
    frame120: localStorage.getItem('globalCamera120Type') || '6x7',
    frame35: localStorage.getItem('globalCamera35Type') || 'full',
    pushPull: '0',
    tab: 'labs', fHiRes: (readJSON('reqFilters', {}) || {}).hiRes || false, fRush: (readJSON('reqFilters', {}) || {}).rush || false,
    includePush: true,
    postModal: false, postTo: '', postRolls: localStorage.getItem('mailBackRollCount') || '1', mailBack: false,
    shareModal: false, copied: false, shareKind: 'roll',
    libTab: 'films', libSearch: '', libFilter: 'All', libProcess: 'All', libFormat: 'All', libIso: 'All', libOpen: null, libFilterModal: false,
    draft: null, draftKind: null, draftKey: null, subIndex: null, confirm: null, toast: '',
    desktopMq: null, installable: false,
    changelogOpen: false, changelog: null,
    menuInstalled: false,
    setupOpen: !localStorage.getItem('setupSeen'), setupStep: 0, presetChecked: new Set(), presetRegions: null, setupBusy: false,
    consent: localStorage.getItem('analyticsConsent'),
    language: localStorage.getItem('locale') || 'en',
    homeLab: getHomeLab(), tier: getDefaultTierLabel(),
    upgradePct: localStorage.getItem('upgradeThresholdPercent') || '4',
    theme: localStorage.getItem('newUiTheme') || 'system',
    expBox: '400', expMonth: MONTHS[new Date().getMonth()], expYear: '', expProcess: 'c41', storage: 'controlled'
};
let toastTimer = null;
function say(text) {
    clearTimeout(toastTimer);
    state.toast = text;
    render();
    toastTimer = setTimeout(() => { state.toast = ''; render(); }, 2400);
}

// ---------- Calculation adapters over js/dev-cost-calc.js ----------
// Mirrors js/app.js's rankLabs()/computeFilmRows()/computeCheaperFilm()/
// computeExpired(), against this file's own state field names, and using
// the exact same pure functions (normalizeLabServices, normalizeFilmBundles,
// computeCostPerPhoto, effectiveMailBackFee, tierMatchesFilmProcess) from
// js/dev-cost-calc.js so the math can never drift from root's.
function pushStops() { return parseInt(state.pushPull, 10) || 0; }
function shootIso() {
    const box = parseFloat(state.boxSpeed);
    if (!box) return 0;
    return Math.round(box * Math.pow(2, pushStops()));
}
function exposuresPerRoll() {
    if (state.format === '120') return FRAME120[state.frame120] || 12;
    if (state.format === '110') return 24;
    if (state.format === 'Sheet') return 1;
    return Math.max(1, parseInt(state.exposures, 10) || 36);
}
// Frames actually taken — half frame doubles a 35mm roll, XPan halves it
// (roughly), 120/110/Sheet already return an exact frame count above.
function framesShot() {
    const exp = exposuresPerRoll();
    if (state.format !== '35mm') return exp;
    const factor = (FRAME35[state.frame35] || FRAME35.full).factor;
    return Math.max(1, Math.round(exp * factor));
}
function camOverride() { return state.format === '120' ? (FRAME120[state.frame120] || null) : null; }
function mailOpts() {
    return { includeMailBack: !!state.mailBack, mailBackRollCount: Math.max(1, parseInt(state.postRolls, 10) || 1), mailToLabFee: num(state.postTo) };
}
function tierWhy(t, stopsAbs) {
    if (!tierMatchesFilmProcess(t, { process: state.process })) return 'not ' + (PROCESS_LABEL[state.process] || state.process);
    if (state.fHiRes && !t.highResScan) return 'not hi-res';
    if (state.fRush && t.turnaroundTime !== 'next_day') return 'not next day';
    if (stopsAbs > 0 && t.noPushPull) return 'no push/pull';
    return '';
}
function pushFeeFor(t, stopsAbs) {
    if (!stopsAbs || t.noPushPull) return 0;
    return t.pushPullType === 'flat' ? t.pushPullCost : t.pushPullCost * stopsAbs;
}

// Ranks every saved, non-hidden lab for the roll currently entered.
function rankLabs() {
    const rolls = Math.max(1, Math.round(num(state.rolls)) || 1);
    const stopsSigned = pushStops();
    const stopsAbs = Math.abs(stopsSigned);
    const filmPerRoll = num(state.packCost) / rolls + num(state.postage) / rolls;
    const exp = framesShot();
    const allLabs = getAllLabs();
    const opts = mailOpts();
    const preferredLabel = state.tier;

    const ranked = Object.keys(allLabs).filter(n => !allLabs[n].hidden).map(name => {
        const lab = allLabs[name];
        const rawTiers = Array.isArray(lab.services) && lab.services.length ? lab.services : [lab];
        const tiers = normalizeLabServices(lab).map((t, i) => {
            const label = (rawTiers[i] && rawTiers[i].label) || tierDescription(t);
            const why = tierWhy(t, stopsAbs);
            const pushFee = pushFeeFor(t, stopsAbs);
            const mailFee = effectiveMailBackFee(t, opts);
            return { ...t, label, why, ok: !why, pushFee, mailFee, cost: t.devCost + pushFee + mailFee };
        });
        const okTiers = tiers.filter(t => t.ok).sort((a, b) => a.cost - b.cost);
        const pick = (preferredLabel && okTiers.find(t => t.label === preferredLabel)) || okTiers[0];
        if (!pick) return null;
        const roll = pick.cost + filmPerRoll;
        return { name, lab, tiers, pick, roll, cpp: roll / exp, filmPerRoll };
    }).filter(Boolean).sort((a, b) => a.cpp - b.cpp);

    return { ranked, filmPerRoll, exp, stopsSigned, stopsAbs };
}

// Every saved film able to shoot in the active format/colour, priced at
// the home lab (falling back to cheapest) including whatever push/pull it
// takes to reach the box speed actually entered.
function computeFilmRows(home) {
    const allFilms = getAllFilms();
    const iso = shootIso() || num(state.boxSpeed);
    const override = camOverride();
    const rows = Object.values(allFilms).filter(f => !f.hidden && (f.format || '35mm') === FORMAT_VALUE[state.format] && filmColorType(f) === state.filmColor).map(f => {
        const boxSpeed = parseFloat(f.boxSpeed) || 0;
        if (!boxSpeed) return null;
        const stopsSigned = iso ? Math.round(Math.log2(iso / boxSpeed)) : 0;
        const stopsAbs = Math.abs(stopsSigned);
        const limit = parseFloat(f.maxPushPull ?? 1);
        const overLimit = iso ? stopsAbs > limit : false;
        if (iso && stopsAbs > 2 && !state.includePush) return null;
        if (!state.includePush && iso && stopsAbs > 0) return null;

        let bestBundle = null, bestCpp = null;
        normalizeFilmBundles(f, override).forEach(b => {
            const cpp = computeCostPerPhoto(b.filmCost, b.rolls, b.exposures);
            if (cpp !== null && cpp > 0 && (bestCpp === null || cpp < bestCpp)) { bestCpp = cpp; bestBundle = b; }
        });
        if (!bestBundle) return null;

        const pushRate = home ? home.pick.pushPullType : null;
        const fee = (home && stopsAbs) ? pushFeeFor(home.pick, stopsAbs) : 0;
        const feeBlocked = home && stopsAbs > 0 && home.pick.noPushPull;
        const devPerRoll = home ? home.pick.devCost + fee + home.pick.mailFee : 0;
        const perRoll = bestBundle.filmCost / bestBundle.rolls;
        const perFrame = (perRoll + devPerRoll) / bestBundle.exposures;
        return { f, bundle: bestBundle, stopsAbs, overLimit, feeBlocked, dir: stopsSigned > 0 ? 'push' : 'pull', perRoll, perFrame, exposures: bestBundle.exposures };
    }).filter(Boolean).sort((a, b) => a.perRoll - b.perRoll);
    return rows;
}

// The cheapest saved film, re-costed at the home lab, that beats the roll
// currently entered by more than the configured upgrade threshold.
function computeCheaperFilm(home) {
    const target = shootIso() || num(state.boxSpeed);
    const curCpp = home ? home.cpp : null;
    if (!target || !home || !(curCpp > 0)) {
        return { has: false, headline: 'Cheaper film', note: 'Enter a box speed and pack price to compare against your library.', tone: 'grey' };
    }
    const override = camOverride();
    let bestNative = null, bestPushPull = null;
    Object.values(getAllFilms()).filter(f => !f.hidden && (f.format || '35mm') === FORMAT_VALUE[state.format] && filmColorType(f) === state.filmColor).forEach(f => {
        const boxSpeed = parseFloat(f.boxSpeed) || 0;
        if (!boxSpeed) return;
        const stopsSigned = Math.round(Math.log2(target / boxSpeed));
        const stopsAbs = Math.abs(stopsSigned);
        const maxPushPull = parseFloat(f.maxPushPull ?? 1);
        if (stopsAbs > maxPushPull) return;
        if (stopsAbs > 0 && home.pick.noPushPull) return;
        let bestBundle = null, bestCpp = null;
        normalizeFilmBundles(f, override).forEach(b => {
            const cpp = computeCostPerPhoto(b.filmCost, b.rolls, b.exposures);
            if (cpp !== null && cpp > 0 && (bestCpp === null || cpp < bestCpp)) { bestCpp = cpp; bestBundle = b; }
        });
        if (!bestBundle) return;
        const fee = pushFeeFor(home.pick, stopsAbs);
        const dev = home.pick.devCost + fee + home.pick.mailFee;
        const cpp = (bestBundle.filmCost / bestBundle.rolls + dev) / bestBundle.exposures;
        const cand = { f, bundle: bestBundle, stopsSigned, stopsAbs, cpp };
        if (stopsAbs === 0) { if (!bestNative || cpp < bestNative.cpp) bestNative = cand; }
        else if (!bestPushPull || cpp < bestPushPull.cpp) bestPushPull = cand;
    });
    const minPct = Math.max(0, num(state.upgradePct));
    const pick = [bestNative, bestPushPull]
        .filter(c => c && (1 - c.cpp / curCpp) * 100 > minPct)
        .sort((a, b) => a.cpp - b.cpp)[0];
    if (pick) {
        const pct = Math.round((1 - pick.cpp / curCpp) * 100);
        const how = pick.stopsSigned === 0 ? 'at box speed' : (pick.stopsSigned > 0 ? '+' + pick.stopsAbs + ' push' : '-' + pick.stopsAbs + ' pull');
        return {
            has: true, tone: 'warn', headline: 'Cheaper at ISO ' + target,
            note: pick.f.name + ' ' + how + ' is ' + CUR() + money(pick.cpp) + ' a frame at ' + home.name + ' — ' + pct + '% less than this roll.',
            buyLabel: pick.bundle.storeName ? 'Buy at ' + pick.bundle.storeName + ' ↗' : 'Find this stock ↗',
            buyLink: pick.bundle.buyLink,
            loadLabel: 'Load ' + pick.f.name,
            pick: pick.f, pickStops: pick.stopsSigned,
            overpay: 'Paying ' + CUR() + money(curCpp - pick.cpp) + ' more a frame — ' + Math.round((curCpp / pick.cpp - 1) * 100) + '% over your cheapest option'
        };
    }
    return {
        has: false, tone: 'grey', headline: 'Nothing cheaper at ISO ' + target,
        note: 'No saved stock comes in more than ' + minPct + '% under this roll once dev' + (home.pick.pushPullCost ? ' and push fees' : '') + ' are added.'
    };
}

function computeExpired() {
    const boxSpeed = num(state.expBox) || 400;
    const month = MONTHS.indexOf(state.expMonth) + 1;
    const year = parseInt(state.expYear, 10);
    if (!year) return { rated: 'ISO —', note: 'Enter an expiry year', age: 'enter a year' };
    const now = new Date();
    const years = Math.max(0, (now.getFullYear() - year) + (now.getMonth() + 1 - month) / 12);
    const per = (YEARS_PER_STOP[state.expProcess] || YEARS_PER_STOP.c41)[state.storage] || YEARS_PER_STOP.c41.controlled;
    const high = boxSpeed > 400 ? Math.floor(Math.log2(boxSpeed / 400)) * 0.5 : 0;
    const stops = Math.round((years / per + high) * 2) / 2;
    return {
        rated: 'ISO ' + Math.max(1, Math.round(boxSpeed / Math.pow(2, stops))),
        note: stops.toFixed(1) + ' stops of compensation',
        age: years.toFixed(1) + ' yrs past expiry'
    };
}

// ---------- Preset regions (real films/index.json + labs/index.json) ----------
// Builds one checkbox row per region that has a film file, a lab file, or
// both, keyed on country/state/city so a region present in only one index
// still gets a row (e.g. a labs-only or retailers-only file).
async function loadPresetRegions() {
    if (state.presetRegions) return state.presetRegions;
    try {
        const [filmsIdx, labsIdx] = await Promise.all([
            fetch('../films/index.json').then(r => r.ok ? r.json() : []),
            fetch('../labs/index.json').then(r => r.ok ? r.json() : [])
        ]);
        const byKey = new Map();
        const keyOf = e => [e.country || '', e.state || '', e.city || e.label].join('|');
        const add = (entry, kind) => {
            const key = keyOf(entry);
            const row = byKey.get(key) || { label: entry.city || entry.state || entry.country || entry.label, country: entry.country };
            row[kind] = entry.file;
            byKey.set(key, row);
        };
        (filmsIdx || []).forEach(e => add(e, 'filmsFile'));
        (labsIdx || []).forEach(e => add(e, 'labsFile'));
        state.presetRegions = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
    } catch { state.presetRegions = []; }
    return state.presetRegions;
}

function mergeFilmsInto(all, incoming) {
    incoming.forEach(f => {
        const key = filmKeyOf(f);
        if (all[key]) {
            const existingLinks = new Set((all[key].bundles || []).map(b => b.buyLink));
            const newBundles = (f.bundles || []).filter(b => !existingLinks.has(b.buyLink));
            all[key] = { ...all[key], bundles: (all[key].bundles || []).concat(newBundles) };
        } else {
            all[key] = { ...f, key };
        }
    });
}
function mergeLabsInto(all, incoming) {
    incoming.forEach(l => { if (!all[l.name]) all[l.name] = l; });
}

async function importPresetRegions(regions) {
    const allFilms = getAllFilms();
    const allLabs = getAllLabs();
    let filmsAdded = 0, labsAdded = 0;
    for (const r of regions) {
        try {
            if (r.filmsFile) {
                const doc = jsyaml.load(await (await fetch('../films/' + r.filmsFile)).text());
                if (Array.isArray(doc?.films)) { mergeFilmsInto(allFilms, doc.films); filmsAdded += doc.films.length; }
            }
            if (r.labsFile) {
                const doc = jsyaml.load(await (await fetch('../labs/' + r.labsFile)).text());
                if (Array.isArray(doc?.labs)) { mergeLabsInto(allLabs, doc.labs); labsAdded += doc.labs.length; }
            }
        } catch { /* one bad region file shouldn't block the rest */ }
    }
    setAllFilms(allFilms);
    setAllLabs(allLabs);
    return { filmsAdded, labsAdded };
}

// ---------- Rendering ----------
// Visual language ported from the "FilmCalc Lookup 4b" Claude Design
// mockup — same colours, spacing, copy. Whole-view innerHTML re-render on
// every state change, same pattern as root's js/app.js.
const C = {
    bg: '#08090a', shell: '#0e0f11', panel: '#16181b', panel2: '#131518', field: '#0e0f11',
    border: '#26292e', border2: '#2f333a', border3: '#3a3e45',
    text: '#eceef1', text2: '#c8ccd2', sub: '#9aa0a8', faint: '#6a7078',
    acc: '#ff7a2f', accBg: '#241a13', accBorder: '#5a3a1c',
    blue: '#5fa8d3', green: '#8fbf6a', red: '#ef6a54', redBg: '#1c1210', redBorder: '#5a2420'
};
// Light mode isn't a second palette (every colour in C/this file is a
// literal hex) — invert+hue-rotate the whole app instead, same trick
// root's js/app.js uses. Own localStorage key ('newUiTheme', tri-state
// system/light/dark) rather than reusing root's binary 'lightMode', since
// root has no "system" concept — keeps this preview's toggle independent.
function systemPrefersDark() {
    try { return !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return true; }
}
function isDarkNow() {
    if (state.theme === 'light') return false;
    if (state.theme === 'dark') return true;
    return systemPrefersDark();
}
function themeLabel() {
    return state.theme === 'light' ? 'Light' : state.theme === 'dark' ? 'Dark' : 'System';
}
function render() {
    const el = document.getElementById('app');
    if (!el) return;
    el.style.filter = isDarkNow() ? '' : 'invert(1) hue-rotate(180deg)';
    el.innerHTML = viewShell();
}

function fmtDate(iso) {
    try {
        const d = new Date(iso);
        return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    } catch { return ''; }
}

function seg(list, current, onPick) {
    return list.map(label => {
        const on = label === current;
        return `<button type="button" onclick="${onPick(label)}" style="flex:1;height:38px;border-radius:6px;font:inherit;font-size:13px;cursor:pointer;background:${on ? '#1f2228' : 'transparent'};border:${on ? '1px solid #3a3e45' : '0'};color:${on ? C.text : C.sub};font-weight:${on ? 600 : 400}">${escapeHtml(label)}</button>`;
    }).join('');
}

function shellW() {
    return state.desktop ? '1080px' : '430px';
}

function viewShell() {
    const desktop = state.desktop;
    const shellWidth = shellW();
    return `<div style="position:relative;max-width:${shellWidth};margin:0 auto;min-height:100vh;background:${C.shell};padding-bottom:28px;overflow:hidden">
${desktop ? viewDesktopHeader() : viewMobileHeader()}
${viewBody()}
${state.modal || desktop ? viewRollDetails() : ''}
${state.postModal ? viewPostModal() : ''}
${state.shareModal ? viewShareModal() : ''}
${state.libFilterModal ? viewLibFilterModal() : ''}
${state.libOpen ? viewLibDetail() : ''}
${state.menu && !desktop ? viewMenu() : ''}
${state.setupOpen ? viewSetup() : ''}
${!state.setupOpen && state.consent === null ? viewConsent() : ''}
${state.changelogOpen ? viewChangelog() : ''}
${state.confirm ? viewConfirm() : ''}
${state.draft ? viewEditor() : ''}
${state.draft && state.subIndex !== null ? viewSubEditor() : ''}
${state.toast ? `<div style="position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:70;width:100%;max-width:${shellW()};padding:0 16px;box-sizing:border-box"><div style="padding:13px 16px;border-radius:10px;background:#1f2228;border:1px solid #3a3e45;box-shadow:0 14px 30px rgba(0,0,0,.5);font-size:13px;color:${C.text};text-align:center">${escapeHtml(state.toast)}</div></div>` : ''}
</div>`;
}

function viewMobileHeader() {
    const title = state.view === 'expired' ? 'Expired film' : state.view === 'settings' ? 'Settings' : state.view === 'library' ? 'Library' : 'FilmCalc';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px">
<span style="font-size:17px;font-weight:700;letter-spacing:-.01em;color:${C.text}">${escapeHtml(title)}</span>
<button type="button" onclick="App.openMenu()" aria-label="Menu" style="width:44px;height:44px;margin-right:-12px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;color:${C.sub};cursor:pointer"><svg style="width:20px;height:20px" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"></path></svg></button>
</div>`;
}

function viewDesktopHeader() {
    const labCount = Object.keys(getAllLabs()).length, filmCount = Object.keys(getAllFilms()).length;
    const tabs = [
        ['lookup', 'Lookup'], ['library', 'Library'], ['expired', 'Expired'], ['settings', 'Settings']
    ].map(([key, label]) => {
        const on = state.view === key;
        return `<button type="button" onclick="App.setView('${key}')" style="background:transparent;border:0;border-bottom:${on ? '2px solid #ff7a2f' : '2px solid transparent'};padding:0 0 4px;font:inherit;font-size:13px;cursor:pointer;color:${on ? C.text : C.sub};font-weight:${on ? 600 : 400}">${label}</button>`;
    }).join('');
    return `<div style="display:flex;align-items:center;gap:26px;padding:16px 28px;border-bottom:1px solid ${C.border}">
<span style="font-size:18px;font-weight:700;letter-spacing:-.01em;color:${C.text}">FilmCalc</span>
<div style="display:flex;gap:20px">${tabs}</div>
<span style="margin-left:auto;display:flex;align-items:center;gap:16px">
<span style="font-size:12px;color:${C.faint}">${state.homeLab || 'no home lab'} · ${labCount} labs · ${filmCount} stocks</span>
<button type="button" onclick="App.openChangelog()" style="background:transparent;border:0;padding:0;font:inherit;font-size:12px;color:${C.sub};cursor:pointer">What's new</button>
<button type="button" onclick="App.install()" style="height:34px;padding:0 12px;border-radius:8px;background:${C.accBg};border:1px solid ${C.accBorder};color:${C.acc};font:inherit;font-size:12px;font-weight:600;cursor:pointer">Install</button>
</span>
</div>`;
}

function viewLookup() {
    const desktop = state.desktop;
    const r = rankLabs();
    const home = r.ranked.find(l => l.name === state.homeLab) || r.ranked[0];
    const filmRows = computeFilmRows(home);
    const exp = r.exp;
    const perRoll = r.filmPerRoll;
    const homeDev = home ? home.pick.devCost : 0;
    const homePush = home ? home.pick.pushFee : 0;
    const homeFee = home ? home.pick.mailFee : 0;
    const rollTotal = (perRoll + homeDev + homePush + homeFee) || 1;
    const best = r.ranked[0];
    const homeCpp = home ? home.cpp : 0;
    const saveC = best ? (homeCpp - best.cpp) * 100 : 0;
    const cheaper = computeCheaperFilm(home);
    const pushStopsAbs = Math.abs(pushStops());
    const loadedFilm = Object.values(getAllFilms()).find(f => !f.hidden && parseInt(f.boxSpeed, 10) === (parseInt(state.boxSpeed, 10) || -1) && (f.format || '35mm') === FORMAT_VALUE[state.format]);
    const pushLimit = loadedFilm ? parseFloat(loadedFilm.maxPushPull ?? 1) : 1;
    const overPush = pushStopsAbs > pushLimit;

    const summaryCard = `<div style="margin:18px 20px 0;background:${C.panel};border:1px solid ${C.border};border-radius:10px;overflow:hidden">
<div style="padding:18px 20px">
<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
${home && home.lab.address ? `<button type="button" onclick="App.openMaps()" style="display:flex;align-items:center;gap:6px;background:transparent;border:0;padding:0;font:inherit;font-size:12px;color:${C.sub};cursor:pointer">
<svg style="width:13px;height:13px;flex:none" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>
<span>${escapeHtml(home.name)} <span style="color:${C.acc}">· home</span></span>
</button>` : `<span style="font-size:12px;color:${C.sub}">${home ? escapeHtml(home.name) + ' · home' : 'No home lab set'}</span>`}
<span style="font-size:12px;color:${C.blue}">${best && saveC > 0.05 ? escapeHtml(best.name.split(' ')[0]) + ' −' + saveC.toFixed(1) + 'c ›' : (home ? 'Cheapest already ›' : '')}</span>
</div>
<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-top:8px">
<div style="display:flex;align-items:baseline;gap:5px"><span style="font-size:24px;font-weight:500;color:${C.sub}">${CUR()}</span><span style="font-size:66px;font-weight:700;line-height:.84;color:${cheaper.tone === 'warn' ? C.red : C.text};letter-spacing:-.035em">${home ? money(homeCpp) : '—'}</span><span style="font-size:12px;color:${C.sub}">/frame</span></div>
<div style="text-align:right;padding-bottom:6px"><div style="font-size:11px;color:${C.sub}">Total Cost</div><div style="font-size:24px;font-weight:600;color:${C.text}">${CUR()}${home ? money(perRoll + homeDev + homePush + homeFee) : '0.00'}</div></div>
</div>
${cheaper.tone === 'warn' ? `<div style="display:flex;align-items:center;gap:7px;margin-top:10px;padding:7px 10px;border-radius:8px;background:${C.redBg};border:1px solid ${C.redBorder}">
<svg style="width:13px;height:13px;flex:none;color:${C.red}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5L2.8 20h18.4L12 4.5z"></path><path stroke-linecap="round" d="M12 10v4.2"></path><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"></circle></svg>
<span style="font-size:12px;color:${C.red}">${escapeHtml(cheaper.overpay || '')}</span>
</div>` : ''}
<div style="display:flex;height:4px;margin-top:16px;border-radius:2px;overflow:hidden;background:${C.field}"><div style="background:${cheaper.tone === 'warn' ? C.red : C.green};width:${Math.round((perRoll / rollTotal) * 100)}%"></div><div style="background:${C.blue};width:${Math.round((homeDev / rollTotal) * 100)}%"></div><div style="background:#b3541a;width:${Math.round((homePush / rollTotal) * 100)}%"></div><div style="flex:1;background:#ff9a5c"></div></div>
<div style="display:flex;gap:12px;margin-top:10px">
<div style="flex:1"><div style="display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:2px;background:${cheaper.tone === 'warn' ? C.red : C.green}"></span><span style="font-size:11px;color:${C.sub}">Film</span></div><div style="font-size:15px;font-weight:600;color:${cheaper.tone === 'warn' ? C.red : C.text};margin-top:3px">${CUR()}${money(perRoll)}</div></div>
<div style="flex:1"><div style="display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:2px;background:${C.blue}"></span><span style="font-size:11px;color:${C.sub}">Dev</span></div><div style="font-size:15px;font-weight:600;color:${C.text};margin-top:3px">${CUR()}${money(homeDev)}</div></div>
<div style="flex:1.2;min-width:0">
<div style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;flex:none;border-radius:2px;background:#ff9a5c"></span><span style="font-size:11px;color:${C.sub}">Fees</span></div>
${(homePush <= 0 && homeFee <= 0) ? `<div style="font-size:15px;font-weight:600;color:${C.faint};margin-top:3px">None</div>` : `<div style="display:flex;gap:10px;margin-top:3px">
${homePush > 0 ? `<span style="min-width:0"><span style="display:block;font-size:15px;font-weight:600;color:${C.text}">${CUR()}${money(homePush)}</span><span style="display:flex;align-items:center;gap:4px;margin-top:2px"><span style="width:6px;height:6px;flex:none;border-radius:2px;background:#b3541a"></span><span style="font-size:10px;color:${C.faint}">push</span></span></span>` : ''}
${homeFee > 0 ? `<span style="min-width:0"><span style="display:block;font-size:15px;font-weight:600;color:${C.text}">${CUR()}${money(homeFee)}</span><span style="display:flex;align-items:center;gap:4px;margin-top:2px"><span style="width:6px;height:6px;flex:none;border-radius:2px;background:#ff9a5c"></span><span style="font-size:10px;color:${C.faint}">post</span></span></span>` : ''}
</div>`}
</div>
</div>
</div>
<div style="padding:13px 20px 15px;background:${overPush ? C.redBg : (cheaper.tone === 'warn' ? C.redBg : C.panel)};border-top:1px solid ${overPush || cheaper.tone === 'warn' ? C.redBorder : C.border}">
<div style="display:flex;align-items:center;gap:7px">
${overPush || cheaper.tone === 'warn' ? `<svg style="width:15px;height:15px;flex:none;color:${C.red}" fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5L2.8 20h18.4L12 4.5z"></path><path stroke-linecap="round" d="M12 10v4.2"></path><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"></circle></svg>` : ''}
<span style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${overPush || cheaper.tone === 'warn' ? C.red : C.sub}">${overPush ? 'Pushed past ' + pushLimit + ' stop' + (pushLimit === 1 ? '' : 's') : escapeHtml(cheaper.headline)}</span>
</div>
<div style="font-size:14px;line-height:1.5;color:${C.text2};margin-top:5px">${overPush ? 'Expect heavy grain, crushed shadows and colour shifts — and most labs will not guarantee the result.' : escapeHtml(cheaper.note)}</div>
${(cheaper.has && !overPush) ? `<div style="display:flex;gap:8px;margin-top:12px">
<button type="button" onclick="App.loadCheaper()" style="flex:1;min-width:0;height:42px;border-radius:8px;background:transparent;border:1px solid ${C.redBorder};color:${C.red};font:inherit;font-size:13px;font-weight:600;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 12px">${escapeHtml(cheaper.loadLabel)}</button>
${cheaper.buyLink ? `<a href="${sanitizeUrl(cheaper.buyLink)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(cheaper.buyLabel)}" title="${escapeHtml(cheaper.buyLabel)}" style="flex:none;width:46px;height:42px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid ${C.border2};color:${C.text2};text-decoration:none">
<svg style="width:18px;height:18px" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h2.2l2.1 10.4a1.5 1.5 0 001.5 1.2h8.4a1.5 1.5 0 001.5-1.2L20.5 7H6"></path><circle cx="10" cy="19.5" r="1.4"></circle><circle cx="17" cy="19.5" r="1.4"></circle></svg>
</a>` : ''}
</div>` : ''}
</div>
</div>`;

    const chips = state.tab === 'labs'
        ? [chip('Hi-res', state.fHiRes, () => `App.toggleFlag('fHiRes')`), chip('Next day', state.fRush, () => `App.toggleFlag('fRush')`)]
        : [
            `<button type="button" style="height:32px;padding:0 11px;display:flex;align-items:center;gap:6px;border-radius:8px;font:inherit;font-size:12px;background:${C.panel};border:1px solid ${C.border2};color:${C.sub}">${shootIso() ? 'ISO ' + shootIso() : 'Any ISO · cheapest first'}</button>`,
            chip('± push/pull', state.includePush, () => `App.toggleFlag('includePush')`)
        ];

    const totalLabs = Object.keys(getAllLabs()).filter(n => !getAllLabs()[n].hidden).length;
    const rows = state.tab === 'labs'
        ? r.ranked.map((x, i) => `<button type="button" onclick="App.openLibDetail(App.labDetail('${jsAttr(x.name)}'))" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 0;background:transparent;border:0;border-top:${i === 0 ? '2px solid ' + C.blue : '1px solid ' + C.border};font:inherit;text-align:left;cursor:pointer">
<span style="flex:1;min-width:0"><span style="display:block;font-size:16px;color:${C.text}">${escapeHtml(x.name)}${x.name === state.homeLab ? ' · home' : ''}</span><span style="display:block;font-size:12px;color:${C.faint};margin-top:3px">${CUR()}${money(x.pick.devCost)} · ${escapeHtml(x.pick.label.toLowerCase())} · ${(turnaroundLabels[x.pick.turnaroundTime] || '').toLowerCase()}</span></span>
<span style="text-align:right;flex:none"><span style="display:block;font-size:24px;font-weight:600;color:${i === 0 ? C.blue : C.text2}">${money(x.cpp)}</span><span style="display:block;font-size:11px;color:${i === 0 ? C.blue : C.faint};margin-top:2px">${i === 0 ? 'cheapest' : '+' + ((x.cpp - best.cpp) * 100).toFixed(1) + 'c'}</span></span>
<span style="color:${C.border3};font-size:18px;flex:none">›</span>
</button>`).join('')
        : filmRows.map((row, i) => {
            const st = row.f;
            const meta = row.overLimit
                ? 'ISO ' + st.boxSpeed + ' · ' + PROCESS_LABEL[st.process] + ' · past its ' + parseFloat(st.maxPushPull ?? 1) + '-stop limit'
                : row.feeBlocked
                    ? 'ISO ' + st.boxSpeed + ' · ' + PROCESS_LABEL[st.process] + ' · ' + (home ? home.name.split(' ')[0] : 'lab') + ' will not push'
                    : 'ISO ' + st.boxSpeed + ' · ' + PROCESS_LABEL[st.process] + (row.stopsAbs ? ' · ' + (row.dir === 'push' ? '+' : '-') + row.stopsAbs + ' stop' : ' · native') + ' · ' + CUR() + money(row.perFrame) + '/frame';
            return `<button type="button" onclick="App.openLibDetail(App.filmDetail('${jsAttr(filmKeyOf(st))}'))" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 0;background:transparent;border:0;border-top:${i === 0 ? '2px solid ' + C.green : '1px solid ' + C.border};font:inherit;text-align:left;cursor:pointer">
<span style="flex:1;min-width:0"><span style="display:block;font-size:16px;color:${row.overLimit ? C.sub : C.text}">${escapeHtml(st.name)}</span><span style="display:block;font-size:12px;color:${C.faint};margin-top:3px">${meta}</span></span>
<span style="text-align:right;flex:none"><span style="display:block;font-size:24px;font-weight:600;color:${row.overLimit ? '#8a5c50' : (i === 0 ? C.green : C.text2)}">${money(row.perRoll)}</span><span style="display:block;font-size:11px;color:${C.faint};margin-top:2px">${CUR()}/roll</span></span>
<span style="color:${C.border3};font-size:18px;flex:none">›</span>
</button>`;
        }).join('');

    const labsList = `<div>
<div style="margin:14px 20px 0">
<div style="display:flex;gap:4px;padding:4px;background:${C.panel};border:1px solid ${C.border};border-radius:10px">
<button type="button" onclick="App.setField('tab','labs')" style="flex:1;height:40px;border-radius:7px;border:0;display:flex;align-items:center;justify-content:center;gap:7px;font:inherit;font-size:13px;cursor:pointer;background:${state.tab === 'labs' ? '#1f2228' : 'transparent'};color:${state.tab === 'labs' ? C.text : C.sub};font-weight:${state.tab === 'labs' ? 600 : 400}">Labs <span style="font-size:11px;font-weight:400;color:${C.faint}">${r.ranked.length}</span></button>
<button type="button" onclick="App.setField('tab','stock')" style="flex:1;height:40px;border-radius:7px;border:0;display:flex;align-items:center;justify-content:center;gap:7px;font:inherit;font-size:13px;cursor:pointer;background:${state.tab === 'stock' ? '#1f2228' : 'transparent'};color:${state.tab === 'stock' ? C.text : C.sub};font-weight:${state.tab === 'stock' ? 600 : 400}">Stock <span style="font-size:11px;font-weight:400;color:${C.faint}">${filmRows.length}</span></button>
</div>
<div style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
${chips.join('')}
<span style="margin-left:auto;font-size:11px;color:${C.faint}">${state.tab === 'labs' ? r.ranked.length + ' of ' + totalLabs + ' shown' : filmRows.length + ' stocks'}</span>
</div>
<div style="margin-top:6px">
${rows || `<div style="margin-top:10px;padding:22px 18px;border:1px dashed ${C.border2};border-radius:10px;text-align:center">
<div style="font-size:14px;font-weight:600;color:${C.text2}">${state.tab === 'labs' ? 'No labs match these filters' : 'No saved stock matches this combination'}</div>
<div style="font-size:12px;line-height:1.5;color:${C.faint};margin-top:6px">${state.tab === 'labs' ? 'Clear a filter above, or add a lab in the Library.' : escapeHtml(state.format) + ' · ' + escapeHtml(FILM_COLOR_LABEL[state.filmColor]) + ' has nothing in your library yet.'}</div>
<button type="button" onclick="App.setView('library')" style="height:42px;padding:0 16px;margin-top:14px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text};font:inherit;font-size:13px;cursor:pointer">${state.tab === 'labs' ? '+ Add a lab' : '+ Add a film stock'}</button>
</div>`}
</div>
</div>
</div>`;

    const actions = `<div style="padding:10px 20px 0">
<div style="display:flex;gap:8px;margin-top:10px">
<button type="button" onclick="App.openPost()" aria-label="Postage" title="Postage" style="flex:1;height:46px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;font:inherit;background:${state.mailBack ? C.accBg : 'transparent'};border:1px solid ${state.mailBack ? C.accBorder : C.border2};color:${state.mailBack ? C.acc : C.text2}">
<svg style="width:18px;height:18px" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"></rect><path stroke-linecap="round" stroke-linejoin="round" d="M3.5 7.5l8.5 6 8.5-6"></path></svg>
<span style="font-size:10px;letter-spacing:.04em">${state.mailBack ? CUR() + money(homeFee) : 'Postage'}</span>
</button>
<button type="button" onclick="App.say('Saved to your library')" aria-label="Save to library" title="Save to library" style="flex:1;height:46px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;cursor:pointer">
<svg style="width:18px;height:18px" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 4h11l3 3v13a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"></path><path stroke-linecap="round" d="M8 4v5h7M8 16h8"></path></svg>
<span style="font-size:10px;letter-spacing:.04em">Save</span>
</button>
<button type="button" onclick="App.openShare()" aria-label="Share link" title="Share link" style="flex:1;height:46px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;cursor:pointer">
<svg style="width:18px;height:18px" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4"></path></svg>
<span style="font-size:10px;letter-spacing:.04em">Share</span>
</button>
<button type="button" onclick="App.clearAll()" aria-label="Clear" title="Clear" style="flex:1;height:46px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;cursor:pointer">
<svg style="width:18px;height:18px" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"></path></svg>
<span style="font-size:10px;letter-spacing:.04em">Clear</span>
</button>
</div>
</div>`;

    const left = `<div>
<div style="padding:4px 20px 0;display:flex;gap:10px">
<label style="flex:1;display:block">
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Box speed</div>
<div style="height:56px;background:${C.panel};border:1px solid ${C.border};border-radius:8px;display:flex;align-items:center;justify-content:flex-end;padding:0 12px">
<input type="text" inputmode="numeric" value="${escapeHtml(state.boxSpeed)}" onchange="App.setField('boxSpeed',this.value)" aria-label="Box speed" style="width:100%;background:transparent;border:0;outline:none;text-align:right;font:inherit;font-size:28px;font-weight:600;color:${C.text}">
</div>
</label>
<label style="flex:1.25;display:block">
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Pack price</div>
<div style="height:56px;background:${C.panel};border:1px solid ${C.acc};border-radius:8px;display:flex;align-items:center;gap:3px;padding:0 12px">
<span style="font-size:17px;color:${C.sub}">${CUR()}</span>
<input type="text" inputmode="decimal" value="${escapeHtml(state.packCost)}" onchange="App.setField('packCost',this.value)" aria-label="Pack price" style="width:100%;background:transparent;border:0;outline:none;text-align:right;font:inherit;font-size:28px;font-weight:600;color:${C.text}">
</div>
</label>
</div>
${!desktop ? `<div style="padding:10px 20px 0">
<button type="button" onclick="App.openModal()" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;padding:9px 14px;background:${C.panel};border:1px solid ${C.border};border-radius:10px;font:inherit;text-align:left;cursor:pointer">
<span style="display:flex;flex-direction:column;gap:3px;min-width:0">
<span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
<span style="font-size:13px;color:${C.text}">${escapeHtml(state.format)}</span><span style="color:${C.border3}">·</span><span style="font-size:13px;color:${C.text}">${escapeHtml(FILM_COLOR_LABEL[state.filmColor])}</span><span style="color:${C.border3}">·</span><span style="font-size:13px;color:${C.acc}">${escapeHtml(PROCESS_LABEL[state.process])}</span>
</span>
<span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
<span style="font-size:12px;color:${C.sub}">${state.rolls} roll${state.rolls === '1' ? '' : 's'}</span><span style="color:${C.border3}">·</span><span style="font-size:12px;color:${C.sub}">${exposuresPerRoll()} exp</span>
</span>
</span>
<span style="font-size:12px;color:${C.sub};white-space:nowrap">Change ›</span>
</button>
</div>` : ''}
${actions}
</div>`;

    return `<div style="display:grid;grid-template-columns:${desktop ? '380px minmax(0,1fr)' : '1fr'};gap:20px;align-items:start;padding-top:4px">
${left}
<div>
${summaryCard}
${labsList}
</div>
</div>`;
}

function chip(label, on, onClickExpr) {
    return `<button type="button" onclick="${onClickExpr()}" style="height:32px;padding:0 11px;display:flex;align-items:center;gap:6px;border-radius:8px;font:inherit;font-size:12px;cursor:pointer;background:${on ? C.panel : 'transparent'};border:1px ${on ? 'solid' : 'dashed'} ${on ? C.border2 : C.border3};color:${on ? C.blue : C.sub}">${label} <span style="color:${C.faint}">${on ? '✕' : ''}</span></button>`;
}

function viewBody() {
    if (state.view === 'expired') return viewExpired();
    if (state.view === 'settings') return viewSettings();
    if (state.view === 'library') return viewLibrary();
    return viewLookup();
}

// The "Roll details" bottom sheet on mobile; the same markup renders
// inline (no sheet chrome) as the left column on desktop.
function viewRollDetails() {
    const desktop = state.desktop;
    const loadedFilm = Object.values(getAllFilms()).find(f => !f.hidden && parseInt(f.boxSpeed, 10) === (parseInt(state.boxSpeed, 10) || -1) && (f.format || '35mm') === FORMAT_VALUE[state.format]);
    const pushLimit = loadedFilm ? parseFloat(loadedFilm.maxPushPull ?? 1) : 1;
    const stops = pushStops();
    const overLimit = Math.abs(stops) > pushLimit;
    const shotIso = Math.round((parseInt(state.boxSpeed, 10) || 0) * Math.pow(2, stops));
    const cameraDisabled = state.format !== '35mm';
    const exp = exposuresPerRoll();

    const body = `<div style="display:flex;flex-direction:column;gap:14px">
<div>
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Format</div>
<div style="display:flex;gap:4px;padding:4px;background:${C.field};border:1px solid ${C.border};border-radius:9px">${seg(FORMATS, state.format, l => `App.setFormat('${l}')`)}</div>
</div>
<div>
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Film type</div>
<div style="display:flex;gap:4px;padding:4px;background:${C.field};border:1px solid ${C.border};border-radius:9px">${seg(FILM_COLORS, FILM_COLOR_LABEL[state.filmColor], l => `App.setFilmColor('${l}')`)}</div>
</div>
<div>
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Development</div>
<div style="display:flex;gap:4px;padding:4px;background:${C.field};border:1px solid ${C.border};border-radius:9px">${seg(PROCESSES, PROCESS_LABEL[state.process], l => `App.setField('process','${PROCESS_VALUE[l]}')`)}</div>
</div>
<div style="display:flex;gap:10px">
<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:5px;margin-bottom:6px">
${overLimit ? `<svg style="width:13px;height:13px;flex:none;color:${C.red}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5L2.8 20h18.4L12 4.5z"></path><path stroke-linecap="round" d="M12 10v4.2"></path><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"></circle></svg>` : ''}
<span style="font-size:11px;color:${overLimit ? C.red : C.sub}">Push / pull</span>
</div>
<div style="display:flex;align-items:center;gap:2px;height:44px;background:${C.field};border:1px solid ${overLimit ? C.redBorder : C.border};border-radius:8px;padding:3px;box-sizing:border-box">
<button type="button" onclick="App.incField('pushPull',-1,-3,3)" aria-label="One stop less" style="width:38px;height:36px;flex:none;border-radius:6px;background:transparent;border:0;color:${C.text};font:inherit;font-size:19px;font-weight:600;line-height:1;cursor:pointer">−</button>
<span style="flex:1;text-align:center;font-size:18px;font-weight:700;color:${overLimit ? C.red : C.text}">${stops > 0 ? '+' + stops : stops}</span>
<button type="button" onclick="App.incField('pushPull',1,-3,3)" aria-label="One stop more" style="width:38px;height:36px;flex:none;border-radius:6px;background:transparent;border:0;color:${C.text};font:inherit;font-size:19px;font-weight:600;line-height:1;cursor:pointer">+</button>
</div>
</div>
<label style="flex:1;display:block"><div style="font-size:11px;color:${C.sub};margin-bottom:6px">Camera</div><select onchange="App.setField('frame35',this.value)" ${cameraDisabled ? 'disabled' : ''} aria-label="Camera type" style="width:100%;box-sizing:border-box;height:44px;background:${C.field};border:1px solid ${C.border};border-radius:8px;padding:0 10px;font:inherit;font-size:15px;color:${C.text};opacity:${cameraDisabled ? '.45' : '1'};cursor:${cameraDisabled ? 'not-allowed' : 'pointer'}">${Object.keys(FRAME35).map(k => `<option value="${k}" ${state.frame35 === k ? 'selected' : ''}>${FRAME35[k].label}</option>`).join('')}</select></label>
</div>
<div style="font-size:12px;line-height:1.5;color:${overLimit ? C.red : C.faint}">${overLimit ? 'Shooting at ISO ' + shotIso + ' — beyond ' + pushLimit + ' stop' + (pushLimit === 1 ? '' : 's') + ', most labs will not guarantee the result.' : (stops === 0 ? 'Developed at box speed.' : 'Shooting at ISO ' + shotIso + ' — labs that do not push are hidden.')}</div>
<div style="height:1px;background:${C.border}"></div>
<div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
<span style="font-size:11px;color:${C.sub}">Rolls in the pack</span>
<span style="display:flex;align-items:center;gap:2px;background:${C.field};border:1px solid ${C.border};border-radius:9px;padding:3px">
<button type="button" onclick="App.incField('rolls',-1,1,99)" aria-label="One roll fewer" style="width:40px;height:38px;border-radius:6px;background:transparent;border:0;color:${C.text};font:inherit;font-size:20px;font-weight:600;line-height:1;cursor:pointer">−</button>
<input type="text" inputmode="numeric" value="${escapeHtml(state.rolls)}" onchange="App.setField('rolls',this.value)" aria-label="Rolls in the pack" style="width:46px;height:38px;background:transparent;border:0;outline:none;text-align:center;font:inherit;font-size:20px;font-weight:700;color:${C.text}">
<button type="button" onclick="App.incField('rolls',1,1,99)" aria-label="One roll more" style="width:40px;height:38px;border-radius:6px;background:transparent;border:0;color:${C.text};font:inherit;font-size:20px;font-weight:600;line-height:1;cursor:pointer">+</button>
</span>
</div>
</div>
<div>
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Postage</div>
<div style="height:44px;background:${C.field};border:1px solid ${C.border};border-radius:8px;display:flex;align-items:center;gap:3px;padding:0 12px">
<span style="font-size:15px;color:${C.sub}">$</span>
<input type="text" inputmode="decimal" value="${escapeHtml(state.postage)}" onchange="App.setField('postage',this.value)" aria-label="Postage" placeholder="3.95" style="width:100%;background:transparent;border:0;outline:none;text-align:right;font:inherit;font-size:17px;font-weight:600;color:${C.text}">
</div>
<div style="font-size:11px;line-height:1.5;color:${C.faint};margin-top:4px">Shipping to receive the pack, split across the rolls in it.</div>
</div>
<div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">
<span style="min-width:0"><span style="display:block;font-size:11px;color:${C.sub}">${state.format === '120' ? 'Camera back' : (state.format === 'Sheet' ? 'Frames per sheet' : 'Exposures on the roll')}</span><span style="display:block;font-size:11px;line-height:1.4;color:${C.faint};margin-top:2px">${state.format === '35mm' && state.frame35 !== 'full' ? '→ ' + framesShot() + ' frames' : ''}</span></span>
${state.format === '35mm' ? `<span style="display:flex;align-items:center;gap:2px;background:${C.field};border:1px solid ${C.border};border-radius:9px;padding:3px">
<button type="button" onclick="App.incField('exposures',-1,1,99)" aria-label="One exposure fewer" style="width:40px;height:38px;border-radius:6px;background:transparent;border:0;color:${C.text};font:inherit;font-size:20px;font-weight:600;line-height:1;cursor:pointer">−</button>
<input type="text" inputmode="numeric" value="${escapeHtml(state.exposures)}" onchange="App.setField('exposures',this.value)" aria-label="Exposures on the roll" style="width:46px;height:38px;background:transparent;border:0;outline:none;text-align:center;font:inherit;font-size:20px;font-weight:700;color:${C.text}">
<button type="button" onclick="App.incField('exposures',1,1,99)" aria-label="One exposure more" style="width:40px;height:38px;border-radius:6px;background:transparent;border:0;color:${C.text};font:inherit;font-size:20px;font-weight:600;line-height:1;cursor:pointer">+</button>
</span>` : `<span style="font-size:20px;font-weight:700;color:${C.text}">${exp}</span>`}
</div>
${state.format === '120' ? `<div style="display:flex;gap:4px;padding:4px;background:${C.field};border:1px solid ${C.border};border-radius:9px;flex-wrap:wrap">
${Object.keys(FRAME120).map(k => `<button type="button" onclick="App.setField('frame120','${k}')" style="flex:1;min-width:70px;height:44px;border-radius:6px;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:${state.frame120 === k ? '#1f2228' : 'transparent'};border:${state.frame120 === k ? '1px solid ' + C.border3 : '0'};color:${state.frame120 === k ? C.text : C.sub};font-weight:${state.frame120 === k ? 600 : 400}"><span style="font-size:13px">${k.replace('x', '×')}</span><span style="font-size:10px;font-weight:400;color:${C.faint}">${FRAME120[k]} exp</span></button>`).join('')}
</div>` : ''}
${state.format === '110' || state.format === 'Sheet' ? `<div style="font-size:12px;color:${C.faint};line-height:1.5">${state.format === '110' ? '110 cartridges are always 24 exposures.' : 'Sheet film is priced one frame per sheet.'}</div>` : ''}
</div>
</div>`;

    if (desktop) return body;
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:40;display:flex;flex-direction:column;justify-content:flex-end">
<div onclick="App.closeModal()" style="position:absolute;inset:0;background:rgba(4,5,6,.72);cursor:pointer"></div>
<div style="position:relative;background:#131518;border-top:1px solid #2f333a;border-radius:18px 18px 0 0;padding:8px 20px 22px;box-shadow:0 -18px 40px rgba(0,0,0,.45)">
<div style="width:38px;height:4px;border-radius:2px;background:${C.border3};margin:0 auto 14px"></div>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
<span style="font-size:16px;font-weight:700;color:${C.text}">Roll details</span>
<button type="button" onclick="App.closeModal()" aria-label="Close" style="width:32px;height:32px;border-radius:8px;background:#1f2228;border:0;color:${C.sub};font:inherit;font-size:15px;line-height:1;cursor:pointer">✕</button>
</div>
${body}
<button type="button" onclick="App.closeModal()" style="width:100%;height:48px;margin-top:18px;border-radius:10px;background:${C.text};border:0;color:${C.shell};font:inherit;font-size:13px;font-weight:700;cursor:pointer">Done</button>
</div>
</div>`;
}

function viewExpired() {
    const desktop = state.desktop;
    const ex = computeExpired();
    const form = `<div style="max-width:${desktop ? '560px' : 'none'}">
<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:${C.sub}">Old film loses speed as it ages. Enter the roll's box speed and expiry date, and this gives you what to rate it at.</p>
<div style="display:flex;gap:10px">
<label style="flex:1;display:block">
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Box speed</div>
<div style="height:56px;background:${C.panel};border:1px solid ${C.border};border-radius:8px;display:flex;align-items:center;padding:0 12px">
<input type="text" inputmode="numeric" value="${escapeHtml(state.expBox)}" onchange="App.setField('expBox',this.value)" aria-label="Box speed" style="width:100%;background:transparent;border:0;outline:none;text-align:right;font:inherit;font-size:28px;font-weight:600;color:${C.text}">
</div>
</label>
<label style="flex:1.25;display:block">
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Expired</div>
<div style="height:56px;background:${C.panel};border:1px solid ${C.acc};border-radius:8px;display:flex;align-items:center;gap:6px;padding:0 10px 0 12px">
<select onchange="App.setField('expMonth',this.value)" aria-label="Expiry month" style="background:transparent;border:0;outline:none;font:inherit;font-size:15px;color:${C.text2};cursor:pointer">${MONTHS.map(m => `<option value="${m}" ${state.expMonth === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
<input type="text" inputmode="numeric" value="${escapeHtml(state.expYear)}" onchange="App.setField('expYear',this.value)" aria-label="Expiry year" placeholder="2006" style="width:100%;min-width:0;background:transparent;border:0;outline:none;text-align:right;font:inherit;font-size:28px;font-weight:600;color:${C.text}">
</div>
</label>
</div>
<div style="margin-top:14px">
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Development</div>
<div style="display:flex;gap:4px;padding:4px;background:${C.panel};border:1px solid ${C.border};border-radius:9px">${seg(EXPIRED_PROCESSES.map(p => p[0]), EXPIRED_PROCESSES.find(p => p[1] === state.expProcess)[0], l => `App.setField('expProcess','${EXPIRED_PROCESSES.find(p => p[0] === l)[1]}')`)}</div>
</div>
<div style="margin-top:14px">
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">How it was stored</div>
<div style="display:flex;flex-direction:column;gap:6px">
${STORAGE_OPTIONS.map(([label, value, help]) => {
    const on = state.storage === value;
    return `<button type="button" onclick="App.setField('storage','${value}')" style="width:100%;text-align:left;border-radius:10px;padding:12px 14px;cursor:pointer;font:inherit;background:${on ? C.accBg : C.panel};border:1px solid ${on ? C.accBorder : C.border}">
<span style="display:block;font-size:15px;color:${on ? C.acc : C.text2}">${label}</span>
<span style="display:block;font-size:12px;line-height:1.45;color:${C.faint};margin-top:4px">${help}</span>
</button>`;
}).join('')}
</div>
</div>
</div>`;
    const result = `<div style="max-width:${desktop ? '560px' : 'none'}">
<div style="margin-top:16px;padding:18px 20px;background:${C.panel};border:1px solid ${C.border};border-radius:10px">
<div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.acc}">Rate it at</div>
<div style="font-size:56px;font-weight:700;line-height:.9;color:${C.text};letter-spacing:-.03em;margin-top:8px">${ex.rated}</div>
<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid ${C.border}">
<span style="font-size:13px;color:${C.text2}">${ex.note}</span>
<span style="font-size:12px;color:${C.faint}">${ex.age}</span>
</div>
</div>
<p style="margin:12px 0 0;font-size:12px;line-height:1.55;color:${C.faint}">A guide, not a rule — bracket a frame either side if the roll matters.</p>
</div>`;
    return `<div style="padding:6px 20px 0;display:grid;grid-template-columns:${desktop ? '1fr 1fr' : '1fr'};gap:20px;align-items:start">${form}${result}</div>`;
}

function settingsCard(title, body) {
    return `<div style="padding:14px;background:${C.panel};border:1px solid ${C.border};border-radius:10px">
<div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.sub};margin-bottom:10px">${title}</div>
${body}
</div>`;
}

function viewSettings() {
    const desktop = state.desktop;
    const labNames = Object.keys(getAllLabs()).filter(n => !getAllLabs()[n].hidden);
    const home = rankLabs().ranked.find(l => l.name === state.homeLab) || rankLabs().ranked[0];
    const tierLabels = ['Cheapest that qualifies'].concat(
        [...new Set(Object.values(getAllLabs()).flatMap(l => normalizeLabServices(l).map((t, i) => ((Array.isArray(l.services) ? l.services : [l])[i] || {}).label || tierDescription(t))))]
    );
    const allFilms = getAllFilms(), allLabs = getAllLabs();
    const hiddenFilms = Object.values(allFilms).filter(f => f.hidden);
    const hiddenLabs = Object.values(allLabs).filter(l => l.hidden);

    const cards = [
        settingsCard('Appearance', `<div style="display:flex;gap:4px;padding:4px;background:${C.field};border:1px solid ${C.border};border-radius:9px">${seg(['System', 'Light', 'Dark'], themeLabel(), l => `App.setTheme('${l.toLowerCase()}')`)}</div>
<div style="font-size:12px;line-height:1.5;color:${C.faint};margin-top:8px">System follows your device's light/dark setting automatically.</div>`),

        settingsCard('Language', `<select onchange="App.setLanguage(this.value)" aria-label="Language" style="width:100%;height:44px;background:${C.field};border:1px solid ${C.border};border-radius:8px;padding:0 10px;font:inherit;font-size:15px;color:${C.text};cursor:pointer">${LANGUAGE_OPTIONS.map(([code, label]) => `<option value="${code}" ${state.language === code ? 'selected' : ''}>${label}</option>`).join('')}</select>
<div style="font-size:12px;line-height:1.5;color:${C.faint};margin-top:8px">Translations are community-contributed and may lag behind English. This preview's own copy is English-only for now.</div>`),

        settingsCard('Home lab', `<select onchange="App.setField('homeLab',this.value)" aria-label="Home lab" style="width:100%;height:44px;background:${C.field};border:1px solid ${C.border};border-radius:8px;padding:0 10px;font:inherit;font-size:15px;color:${C.text};cursor:pointer"><option value="">— pick a lab —</option>${labNames.map(n => `<option value="${escapeHtml(n)}" ${state.homeLab === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select>
<div style="font-size:11px;color:${C.sub};margin:12px 0 6px">Preferred service tier</div>
<select onchange="App.setField('tier',this.value)" aria-label="Preferred service tier" style="width:100%;height:44px;background:${C.field};border:1px solid ${C.border};border-radius:8px;padding:0 10px;font:inherit;font-size:15px;color:${C.text};cursor:pointer">${tierLabels.map(l => `<option value="${escapeHtml(l === 'Cheapest that qualifies' ? '' : l)}" ${((state.tier || 'Cheapest that qualifies') === l) ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>
<div style="font-size:12px;line-height:1.5;color:${C.faint};margin-top:8px">${home && home.pick ? 'At ' + escapeHtml(home.name) + ' that is ' + escapeHtml(home.pick.label.toLowerCase()) + ', ' + CUR() + money(home.pick.devCost) + '.' : 'Used whenever a lab offers it, otherwise its cheapest qualifying tier.'}</div>`),

        settingsCard('Calculator', `<div style="display:flex;gap:10px">
<label style="flex:1;display:block"><div style="font-size:11px;color:${C.sub};margin-bottom:6px">Upgrade threshold</div><div style="height:44px;background:${C.field};border:1px solid ${C.border};border-radius:8px;display:flex;align-items:center;gap:4px;padding:0 12px"><input type="text" inputmode="numeric" value="${escapeHtml(state.upgradePct)}" onchange="App.setField('upgradePct',this.value)" aria-label="Upgrade threshold percent" style="width:100%;background:transparent;border:0;outline:none;text-align:right;font:inherit;font-size:17px;font-weight:600;color:${C.text}"><span style="font-size:13px;color:${C.faint}">%</span></div></label>
<label style="flex:1;display:block"><div style="font-size:11px;color:${C.sub};margin-bottom:6px">Mail-back rolls</div><div style="height:44px;background:${C.field};border:1px solid ${C.border};border-radius:8px;display:flex;align-items:center;padding:0 12px"><input type="text" inputmode="numeric" value="${escapeHtml(state.postRolls)}" onchange="App.setField('postRolls',this.value)" aria-label="Mail-back roll count" style="width:100%;background:transparent;border:0;outline:none;text-align:right;font:inherit;font-size:17px;font-weight:600;color:${C.text}"></div></label>
</div>`),

        settingsCard('Hidden presets', `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><span style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.sub}"></span><span style="font-size:12px;color:${C.faint}">${hiddenFilms.length + hiddenLabs.length ? hiddenFilms.length + hiddenLabs.length + ' hidden' : 'None hidden'}</span></div>
${!hiddenFilms.length && !hiddenLabs.length ? `<div style="font-size:12px;line-height:1.5;color:${C.faint};margin-top:8px">Nothing hidden. Hide a film or lab in the library to keep it out of lookups without deleting it.</div>` : `<div style="margin-top:8px">
${hiddenFilms.map(f => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid ${C.border}"><span style="font-size:13px;color:${C.text2}">${escapeHtml(f.name)}</span><button type="button" onclick="App.unhide('film','${jsAttr(filmKeyOf(f))}')" style="height:34px;padding:0 12px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:12px;cursor:pointer">Unhide</button></div>`).join('')}
${hiddenLabs.map(l => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid ${C.border}"><span style="font-size:13px;color:${C.text2}">${escapeHtml(l.name)}</span><button type="button" onclick="App.unhide('lab','${jsAttr(l.name)}')" style="height:34px;padding:0 12px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:12px;cursor:pointer">Unhide</button></div>`).join('')}
</div>`}`),

        settingsCard('Starter presets', `<div style="display:flex;flex-direction:column;gap:6px">${(state.presetRegions || []).slice(0, 8).map(r => {
            const on = state.presetChecked.has(r.label);
            return `<button type="button" onclick="App.togglePreset('${jsAttr(r.label)}')" style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;height:42px;padding:0 12px;border-radius:8px;font:inherit;font-size:13px;cursor:pointer;text-align:left;background:${on ? C.accBg : C.field};border:1px solid ${on ? C.accBorder : C.border};color:${on ? C.acc : C.text2}">${escapeHtml(r.label)} <span>${on ? '✓' : ''}</span></button>`;
        }).join('') || `<div style="font-size:12px;color:${C.faint}">Loading regions…</div>`}</div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px">
<span style="font-size:12px;color:${C.faint}">${state.presetChecked.size} region${state.presetChecked.size === 1 ? '' : 's'} selected</span>
<button type="button" onclick="App.importPresets()" style="height:40px;padding:0 14px;border-radius:8px;background:${C.accBg};border:1px solid ${C.accBorder};color:${C.acc};font:inherit;font-size:13px;font-weight:600;cursor:pointer">Import</button>
</div>`),

        settingsCard('Your data', `<div style="display:flex;flex-wrap:wrap;gap:8px">
<button type="button" onclick="App.shareLibrary()" style="height:40px;padding:0 13px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Share library link</button>
<button type="button" onclick="App.exportJson()" style="height:40px;padding:0 13px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Export JSON</button>
<button type="button" onclick="App.say('Choose a .yaml or .json file to import')" style="height:40px;padding:0 13px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Import file</button>
<button type="button" onclick="App.openSetup()" style="height:40px;padding:0 13px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Re-run setup</button>
</div>
<button type="button" onclick="App.confirmDeleteAll()" style="width:100%;height:42px;margin-top:10px;border-radius:8px;background:transparent;border:1px solid ${C.redBorder};color:#e07a6a;font:inherit;font-size:13px;cursor:pointer">Delete all data</button>`),

        settingsCard('Install app', `<div style="font-size:12px;line-height:1.5;color:${C.faint}">Add FilmCalc to your home screen so it opens full screen and works offline in the shop.</div>
<button type="button" onclick="App.install()" style="height:42px;padding:0 14px;margin-top:12px;border-radius:8px;background:${C.accBg};border:1px solid ${C.accBorder};color:${C.acc};font:inherit;font-size:13px;font-weight:600;cursor:pointer">Install</button>`),

        settingsCard('Privacy', `<div style="font-size:12px;color:${C.faint}">Analytics cookies: <span style="color:${C.text2}">${state.consent === 'granted' ? 'Allowed' : state.consent === 'denied' ? 'Declined' : 'Not set'}</span></div>
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center">
<button type="button" onclick="App.resetConsent()" style="height:40px;padding:0 13px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Change choice</button>
<a href="../privacy.html" style="font-size:13px">Privacy policy</a>
</div>`),

        settingsCard('Report bad data', `<div style="font-size:12px;line-height:1.5;color:${C.faint}">Found a lab price that has moved, or a stock that no longer exists? Send it through and it gets fixed for everyone.</div>
<button type="button" onclick="App.reportIssue()" style="height:42px;padding:0 14px;margin-top:12px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text};font:inherit;font-size:13px;cursor:pointer">Report an issue</button>`)
    ];
    return `<div style="padding:6px 20px 0;display:grid;grid-template-columns:${desktop ? '1fr 1fr' : '1fr'};gap:10px;align-items:start">${cards.join('')}</div>`;
}

// ---------- Library ----------
function App_filmDetail(key) {
    const f = getAllFilms()[key];
    if (!f) return null;
    const bundles = f.bundles || [];
    return {
        kind: 'film', key, name: f.name,
        meta: bundles.length + (bundles.length === 1 ? ' price · ' : ' prices · ') + (bundles[0] ? (bundles[0].storeName || 'Unnamed store') : '—'),
        facts: [
            { k: 'Speed', v: 'ISO ' + f.boxSpeed },
            { k: 'Process', v: PROCESS_LABEL[f.process] || f.process },
            { k: 'Category', v: FILM_COLOR_LABEL[filmColorType(f)] },
            { k: 'Format', v: FORMAT_LABEL[f.format || '35mm'] || f.format }
        ],
        rows: bundles.slice().sort((a, b) => (a.filmCost / (a.rolls || 1)) - (b.filmCost / (b.rolls || 1))).map((b, i) => ({
            name: b.storeName || 'Unnamed store', meta: (i === 0 ? 'cheapest saved price' : 'saved price'),
            price: CUR() + money(b.filmCost / (parseInt(b.rolls) || 1)), color: i === 0 ? C.green : C.text2,
            href: sanitizeUrl(b.buyLink), cta: '↗', isLink: !!b.buyLink
        }))
    };
}
function App_labDetail(name) {
    const l = getAllLabs()[name];
    if (!l) return null;
    const tiers = normalizeLabServices(l);
    const rawTiers = Array.isArray(l.services) && l.services.length ? l.services : [l];
    const sorted = tiers.map((t, i) => ({ ...t, label: (rawTiers[i] && rawTiers[i].label) || tierDescription(t) })).sort((a, b) => a.devCost - b.devCost);
    return {
        kind: 'lab', key: name, name: name + (name === state.homeLab ? ' · home' : ''),
        meta: l.address || '',
        facts: [
            { k: 'Tiers', v: String(tiers.length) },
            { k: 'Address', v: l.address || 'not saved' }
        ],
        rows: sorted.map(t => ({
            name: t.label, meta: (turnaroundLabels[t.turnaroundTime] || '') + (t.highResScan ? ' · hi-res' : ' · no scans'),
            price: CUR() + money(t.devCost), color: t.turnaroundTime === 'next_day' ? C.acc : C.text2,
            href: '', cta: '', isLink: false
        }))
    };
}

function viewLibrary() {
    const desktop = state.desktop;
    const allFilms = getAllFilms(), allLabs = getAllLabs();
    const films = Object.entries(allFilms).filter(([, f]) => !f.hidden);
    const labs = Object.entries(allLabs).filter(([, l]) => !l.hidden);
    const q = state.libSearch.trim().toLowerCase();

    let groups = [];
    if (state.libTab === 'films') {
        const list = films
            .filter(([, f]) => !q || f.name.toLowerCase().indexOf(q) > -1)
            .filter(([, f]) => state.libFilter === 'All' || FILM_COLOR_LABEL[filmColorType(f)] === state.libFilter)
            .filter(([, f]) => state.libFormat === 'All' || (FORMAT_LABEL[f.format || '35mm'] || f.format) === state.libFormat)
            .filter(([, f]) => state.libProcess === 'All' || (PROCESS_LABEL[f.process] || f.process) === state.libProcess)
            .filter(([, f]) => state.libIso === 'All' || String(f.boxSpeed) === state.libIso)
            .map(([key, f]) => ({ key, f }))
            .sort((a, b) => (parseInt(a.f.boxSpeed) || 0) - (parseInt(b.f.boxSpeed) || 0));
        const isos = [...new Set(list.map(x => parseInt(x.f.boxSpeed) || 0))];
        groups = isos.map(iso => {
            const items = list.filter(x => (parseInt(x.f.boxSpeed) || 0) === iso);
            return {
                title: 'ISO ' + iso, count: items.length + ' stock' + (items.length === 1 ? '' : 's'),
                items: items.map(({ key, f }) => {
                    const bundles = f.bundles || [];
                    const cheapest = bundles.length ? Math.min(...bundles.map(b => b.filmCost / (parseInt(b.rolls) || 1))) : 0;
                    return { key, kind: 'film', name: f.name, meta: (PROCESS_LABEL[f.process] || f.process) + ' · ' + (bundles.length || 0) + ' price' + (bundles.length === 1 ? '' : 's'), price: CUR() + money(cheapest), unit: '/roll', accent: String(f.boxSpeed) === state.boxSpeed ? C.acc : C.faint };
                })
            };
        });
    } else {
        const list = labs
            .filter(([name]) => !q || name.toLowerCase().indexOf(q) > -1)
            .filter(([, l]) => {
                if (state.libFilter === 'All') return true;
                const tiers = normalizeLabServices(l);
                if (state.libFilter === 'Hi-res') return tiers.some(t => t.highResScan);
                if (state.libFilter === 'Next day') return tiers.some(t => t.turnaroundTime === 'next_day');
                if (state.libFilter === 'Mail-back') return tiers.some(t => t.mailBackCost !== null);
                return true;
            });
        if (list.length) {
            groups = [{
                title: 'Saved labs', count: list.length + ' lab' + (list.length === 1 ? '' : 's'),
                items: list.map(([name, l]) => {
                    const tiers = normalizeLabServices(l).sort((a, b) => a.devCost - b.devCost);
                    return { key: name, kind: 'lab', name: name + (name === state.homeLab ? ' · home' : ''), meta: l.address || '', price: CUR() + money(tiers[0] ? tiers[0].devCost : 0), unit: 'from', accent: name === state.homeLab ? C.acc : C.faint };
                })
            }];
        }
    }

    const searchBar = `<div style="display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;background:${C.panel};border:1px solid ${C.border};border-radius:10px;flex:1;min-width:0">
<svg style="width:16px;height:16px;flex:none;color:${C.faint}" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"></circle><path stroke-linecap="round" d="M20 20l-4.2-4.2"></path></svg>
<input type="text" value="${escapeHtml(state.libSearch)}" onchange="App.setField('libSearch',this.value)" placeholder="Search ${state.libTab === 'films' ? films.length + ' stocks' : labs.length + ' labs'}…" aria-label="Search library" style="width:100%;background:transparent;border:0;outline:none;font:inherit;font-size:14px;color:${C.text}">
</div>`;

    const filterSummary = state.libTab === 'films'
        ? [state.libFilter, state.libFormat, state.libIso === 'All' ? 'All' : 'ISO ' + state.libIso, state.libProcess].filter(x => x !== 'All').join(' · ') || 'All films'
        : (state.libFilter === 'All' ? 'All labs' : state.libFilter);

    const filterBtn = `<button type="button" onclick="App.setField('libFilterModal',true)" style="width:${desktop ? '210px' : '100%'};flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;height:44px;padding:0 14px;background:${C.panel};border:1px solid ${C.border};border-radius:10px;font:inherit;cursor:pointer">
<span style="display:flex;align-items:center;gap:8px;min-width:0">
<svg style="width:14px;height:14px;flex:none;color:${C.faint}" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" d="M4 6h16M7 12h10M10 18h4"></path></svg>
<span style="font-size:13px;color:${C.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(filterSummary)}</span>
</span>
<span style="font-size:12px;color:${C.sub};white-space:nowrap">Filter ›</span>
</button>`;

    const list = groups.length === 0
        ? `<div style="margin-top:16px;padding:24px 18px;border:1px dashed ${C.border2};border-radius:10px;text-align:center">
<div style="font-size:14px;font-weight:600;color:${C.text2}">No matches</div>
<div style="font-size:12px;line-height:1.5;color:${C.faint};margin-top:6px">Nothing matches "${escapeHtml(state.libSearch)}".</div>
</div>`
        : groups.map(g => `<div style="margin-top:18px">
<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
<span style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.sub}">${g.title}</span>
<span style="font-size:11px;color:${C.faint}">${g.count}</span>
</div>
<div style="margin-top:6px;display:grid;grid-template-columns:${desktop ? 'repeat(auto-fill, minmax(300px, 1fr))' : '1fr'};gap:${desktop ? '10px' : '0'}">
${g.items.map(it => `<button type="button" onclick="App.openLibDetailByKey('${it.kind}','${jsAttr(it.key)}')" style="display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:${desktop ? '14px 16px' : '14px 0'};border:${desktop ? '1px solid ' + C.border : '0'};border-top:1px solid ${C.border};border-radius:${desktop ? '10px' : '0'};background:${desktop ? C.panel : 'transparent'};font:inherit;text-align:left;cursor:pointer">
<span style="width:3px;height:32px;border-radius:2px;flex:none;background:${it.accent}"></span>
<span style="flex:1;min-width:0"><span style="display:block;font-size:15px;color:${C.text}">${escapeHtml(it.name)}</span><span style="display:block;font-size:12px;color:${C.faint};margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(it.meta)}</span></span>
<span style="text-align:right;flex:none"><span style="display:block;font-size:19px;font-weight:600;color:${C.text}">${it.price}</span><span style="display:block;font-size:10px;color:${C.faint}">${it.unit}</span></span>
<span style="color:${C.border3};font-size:18px;flex:none">›</span>
</button>`).join('')}
</div>
</div>`).join('');

    return `<div style="padding:4px 20px 0">
<div style="display:flex;flex-direction:${desktop ? 'row' : 'column'};align-items:stretch;gap:10px">
<div style="display:flex;gap:4px;padding:4px;background:${C.panel};border:1px solid ${C.border};border-radius:10px;flex:${desktop ? '0 0 260px' : '1'}">
<button type="button" onclick="App.setLibTab('films')" style="flex:1;height:40px;border-radius:7px;border:0;display:flex;align-items:center;justify-content:center;gap:7px;font:inherit;font-size:13px;cursor:pointer;background:${state.libTab === 'films' ? '#1f2228' : 'transparent'};color:${state.libTab === 'films' ? C.text : C.sub};font-weight:${state.libTab === 'films' ? 600 : 400}">Films <span style="font-size:11px;font-weight:400;color:${C.faint}">${films.length}</span></button>
<button type="button" onclick="App.setLibTab('labs')" style="flex:1;height:40px;border-radius:7px;border:0;display:flex;align-items:center;justify-content:center;gap:7px;font:inherit;font-size:13px;cursor:pointer;background:${state.libTab === 'labs' ? '#1f2228' : 'transparent'};color:${state.libTab === 'labs' ? C.text : C.sub};font-weight:${state.libTab === 'labs' ? 600 : 400}">Labs <span style="font-size:11px;font-weight:400;color:${C.faint}">${labs.length}</span></button>
</div>
${searchBar}
${filterBtn}
</div>
${list}
<button type="button" onclick="App.addLibItem()" style="width:100%;height:48px;margin-top:20px;border-radius:10px;background:transparent;border:1px dashed ${C.border3};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">${state.libTab === 'films' ? '+ Add a film stock' : '+ Add a lab'}</button>
</div>`;
}

function viewLibFilterModal() {
    const filters = state.libTab === 'films' ? ['All', 'Colour', 'B&W', 'Speciality'] : ['All', 'Hi-res', 'Next day', 'Mail-back'];
    const chipRow = (label, current, onClickField) => filters.map(l => {
        const on = current === l;
        return `<button type="button" onclick="App.setField('${onClickField}','${l}')" style="height:38px;padding:0 14px;border-radius:9px;font:inherit;font-size:13px;cursor:pointer;background:${on ? C.text : 'transparent'};border:1px solid ${on ? C.text : C.border2};color:${on ? C.shell : C.sub}">${l}</button>`;
    }).join('');
    const allFilms = Object.values(getAllFilms());
    const formats = ['All', '35mm', '120', '110', 'Sheet'];
    const isos = ['All'].concat([...new Set(allFilms.map(f => String(f.boxSpeed)))].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)));
    const processes = ['All', 'C41', 'B&W', 'E6', 'ECN-2'];
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:46;display:flex;flex-direction:column;justify-content:flex-end">
<div onclick="App.setField('libFilterModal',false)" style="position:absolute;inset:0;background:rgba(4,5,6,.72);cursor:pointer"></div>
<div style="position:relative;background:#131518;border-top:1px solid #2f333a;border-radius:18px 18px 0 0;padding:8px 20px 22px;box-shadow:0 -18px 40px rgba(0,0,0,.45)">
<div style="width:38px;height:4px;border-radius:2px;background:${C.border3};margin:0 auto 14px"></div>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
<span style="font-size:16px;font-weight:700;color:${C.text}">${state.libTab === 'films' ? 'Filter films' : 'Filter labs'}</span>
<button type="button" onclick="App.setField('libFilterModal',false)" aria-label="Close" style="width:32px;height:32px;border-radius:8px;background:#1f2228;border:0;color:${C.sub};font:inherit;font-size:15px;line-height:1;cursor:pointer">✕</button>
</div>
<div style="display:flex;flex-direction:column;gap:14px">
<div>
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">${state.libTab === 'films' ? 'Film type' : 'Offers'}</div>
<div style="display:flex;gap:6px;flex-wrap:wrap">${chipRow(null, state.libFilter, 'libFilter')}</div>
</div>
${state.libTab === 'films' ? `<div>
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Format</div>
<div style="display:flex;gap:6px;flex-wrap:wrap">${formats.map(l => `<button type="button" onclick="App.setField('libFormat','${l}')" style="height:38px;padding:0 14px;border-radius:9px;font:inherit;font-size:13px;cursor:pointer;background:${state.libFormat === l ? C.text : 'transparent'};border:1px solid ${state.libFormat === l ? C.text : C.border2};color:${state.libFormat === l ? C.shell : C.sub}">${l}</button>`).join('')}</div>
</div>
<div>
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Box speed</div>
<div style="display:flex;gap:6px;flex-wrap:wrap">${isos.map(l => `<button type="button" onclick="App.setField('libIso','${l}')" style="height:38px;padding:0 14px;border-radius:9px;font:inherit;font-size:13px;cursor:pointer;background:${state.libIso === l ? '#16231a' : 'transparent'};border:1px solid ${state.libIso === l ? '#33422a' : C.border2};color:${state.libIso === l ? C.green : C.sub}">${l === 'All' ? 'All' : 'ISO ' + l}</button>`).join('')}</div>
</div>
<div>
<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Process</div>
<div style="display:flex;gap:6px;flex-wrap:wrap">${processes.map(l => `<button type="button" onclick="App.setField('libProcess','${l}')" style="height:38px;padding:0 14px;border-radius:9px;font:inherit;font-size:13px;cursor:pointer;background:${state.libProcess === l ? C.accBg : 'transparent'};border:1px solid ${state.libProcess === l ? C.accBorder : C.border2};color:${state.libProcess === l ? C.acc : C.sub}">${l}</button>`).join('')}</div>
</div>` : ''}
</div>
<div style="display:flex;gap:8px;margin-top:18px">
<button type="button" onclick="App.resetLibFilters()" style="flex:1;height:48px;border-radius:10px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Reset</button>
<button type="button" onclick="App.setField('libFilterModal',false)" style="flex:2;height:48px;border-radius:10px;background:${C.text};border:0;color:${C.shell};font:inherit;font-size:13px;font-weight:700;cursor:pointer">Show results</button>
</div>
</div>
</div>`;
}

function viewLibDetail() {
    const it = state.libOpen;
    if (!it) return '';
    const mapsHref = it.kind === 'lab' && it.meta
        ? (/iP(hone|ad|od)|Macintosh/.test(navigator.userAgent || '') ? 'https://maps.apple.com/?q=' + encodeURIComponent(it.meta) : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(it.meta))
        : '';
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:47;display:flex;flex-direction:column;justify-content:flex-end">
<div onclick="App.closeLibDetail()" style="position:absolute;inset:0;background:rgba(4,5,6,.72);cursor:pointer"></div>
<div style="position:relative;background:#131518;border-top:1px solid #2f333a;border-radius:18px 18px 0 0;padding:8px 20px 22px;box-shadow:0 -18px 40px rgba(0,0,0,.45);max-height:82vh;overflow:auto">
<div style="width:38px;height:4px;border-radius:2px;background:${C.border3};margin:0 auto 14px"></div>
<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
<span style="min-width:0">
<span style="display:block;font-size:18px;font-weight:700;color:${C.text}">${escapeHtml(it.name)}</span>
${mapsHref ? `<a href="${mapsHref}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:5px;margin-top:4px;font-size:12px;color:${C.blue};text-decoration:none"><svg style="width:12px;height:12px;flex:none" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"></path><circle cx="12" cy="10" r="2.5"></circle></svg><span>${escapeHtml(it.meta)}</span></a>` : (it.kind === 'film' ? `<span style="display:block;font-size:12px;color:${C.faint};margin-top:3px">${escapeHtml(it.meta)}</span>` : '')}
</span>
<button type="button" onclick="App.closeLibDetail()" aria-label="Close" style="width:32px;height:32px;flex:none;border-radius:8px;background:#1f2228;border:0;color:${C.sub};font:inherit;font-size:15px;line-height:1;cursor:pointer">✕</button>
</div>
<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px">${it.facts.map(f => `<span style="display:flex;align-items:baseline;gap:6px;padding:7px 11px;border-radius:8px;background:${C.field};border:1px solid ${C.border}"><span style="font-size:11px;color:${C.faint}">${f.k}</span><span style="font-size:13px;font-weight:600;color:${C.text}">${escapeHtml(f.v)}</span></span>`).join('')}</div>
<div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.sub};margin:18px 0 4px">${it.kind === 'film' ? 'Where to buy' : 'Service tiers'}</div>
<div>
${it.rows.length === 0 ? `<div style="padding:12px 0;border-top:1px solid ${C.border};font-size:12px;color:${C.faint}">${it.kind === 'film' ? 'No purchase links saved yet.' : 'No service tiers saved yet.'}</div>` : it.rows.map(r => it.kind === 'film' && r.isLink
        ? `<a href="${r.href}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid ${C.border};text-decoration:none"><span style="flex:1;min-width:0"><span style="display:block;font-size:14px;color:${C.text}">${escapeHtml(r.name)}</span><span style="display:block;font-size:11px;color:${C.faint};margin-top:2px">${escapeHtml(r.meta)}</span></span><span style="font-size:17px;font-weight:600;color:${r.color}">${r.price}</span><span style="font-size:14px;color:${C.faint};flex:none">${r.cta}</span></a>`
        : `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid ${C.border}"><span style="flex:1;min-width:0"><span style="display:block;font-size:14px;color:${C.text}">${escapeHtml(r.name)}</span><span style="display:block;font-size:11px;color:${C.faint};margin-top:2px">${escapeHtml(r.meta)}</span></span><span style="font-size:17px;font-weight:600;color:${r.color}">${r.price}</span></div>`
    ).join('')}
</div>
<div style="display:flex;gap:8px;margin-top:18px">
<button type="button" onclick="App.loadIntoLookup()" style="flex:2;height:46px;border-radius:10px;background:${C.accBg};border:1px solid ${C.accBorder};color:${C.acc};font:inherit;font-size:13px;font-weight:700;cursor:pointer">Load into lookup</button>
<button type="button" onclick="App.openEditorFor()" style="flex:1;height:46px;border-radius:10px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Edit</button>
</div>
<div style="display:flex;gap:8px;margin-top:8px">
<button type="button" onclick="App.hideItem()" style="flex:1;height:42px;border-radius:10px;background:transparent;border:1px solid ${C.border2};color:${C.sub};font:inherit;font-size:13px;cursor:pointer">Hide from lookups</button>
<button type="button" onclick="App.confirmDeleteItem()" style="flex:1;height:42px;border-radius:10px;background:transparent;border:1px solid ${C.redBorder};color:#e07a6a;font:inherit;font-size:13px;cursor:pointer">Delete</button>
</div>
</div>
</div>`;
}

function viewPostModal() {
    const r = rankLabs();
    const home = r.ranked.find(l => l.name === state.homeLab) || r.ranked[0];
    const shipRolls = Math.max(1, parseInt(state.postRolls, 10) || 1);
    const homeMailBack = home && home.pick ? (home.pick.mailBackCost || 0) : 0;
    const allLabs = getAllLabs();
    const rows = Object.keys(allLabs).filter(n => !allLabs[n].hidden).map(name => {
        const tiers = normalizeLabServices(allLabs[name]);
        const cheapestMail = tiers.length ? Math.min(...tiers.map(t => t.mailBackCost === null ? Infinity : t.mailBackCost)) : Infinity;
        return { name, price: isFinite(cheapestMail) ? CUR() + money(cheapestMail) : 'n/a' };
    });
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:45;display:flex;flex-direction:column;justify-content:flex-end">
<div onclick="App.closePost()" style="position:absolute;inset:0;background:rgba(4,5,6,.72);cursor:pointer"></div>
<div style="position:relative;background:#131518;border-top:1px solid #2f333a;border-radius:18px 18px 0 0;padding:8px 20px 22px;box-shadow:0 -18px 40px rgba(0,0,0,.45)">
<div style="width:38px;height:4px;border-radius:2px;background:${C.border3};margin:0 auto 14px"></div>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
<span style="font-size:16px;font-weight:700;color:${C.text}">Postage</span>
<button type="button" onclick="App.closePost()" aria-label="Close" style="width:32px;height:32px;border-radius:8px;background:#1f2228;border:0;color:${C.sub};font:inherit;font-size:15px;line-height:1;cursor:pointer">✕</button>
</div>
<p style="margin:0 0 16px;font-size:13px;line-height:1.55;color:${C.sub}">Mailing rolls in costs the same whether you send one or six, so the fee is split across everything in the satchel. Return postage comes from each lab's own saved price.</p>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:${C.field};border:1px solid ${C.border};border-radius:10px">
<span><span style="display:block;font-size:14px;color:${C.text}">Mailing it in</span><span style="display:block;font-size:12px;color:${C.faint};margin-top:2px">Off means dropping off in person</span></span>
<button type="button" onclick="App.toggleFlag('mailBack')" aria-pressed="${state.mailBack}" style="width:52px;height:30px;flex:none;border-radius:15px;border:0;padding:3px;cursor:pointer;display:flex;align-items:center;justify-content:${state.mailBack ? 'flex-end' : 'flex-start'};background:${state.mailBack ? C.accBorder : C.border}"><span style="width:24px;height:24px;border-radius:50%;background:${state.mailBack ? C.acc : C.faint}"></span></button>
</div>
${state.mailBack ? `<label style="display:block;margin-top:12px"><div style="font-size:11px;color:${C.sub};margin-bottom:6px">What it costs you to post it in</div><div style="height:52px;background:${C.field};border:1px solid ${C.border};border-radius:8px;display:flex;align-items:center;gap:3px;padding:0 12px"><span style="font-size:15px;color:${C.faint}">${CUR()}</span><input type="text" inputmode="decimal" value="${escapeHtml(state.postTo)}" onchange="App.setField('postTo',this.value)" aria-label="Post to lab" style="width:100%;background:transparent;border:0;outline:none;text-align:right;font:inherit;font-size:22px;font-weight:600;color:${C.text}"></div></label>
<div style="margin-top:12px;border:1px solid ${C.border};border-radius:10px;overflow:hidden">
<div style="padding:9px 12px;background:${C.field};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.faint}">Return postage · from each lab</div>
${rows.map(m => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-top:1px solid ${C.border}"><span style="font-size:13px;color:${C.text2}">${escapeHtml(m.name)}</span><span style="font-size:13px;font-weight:600;color:${C.text}">${m.price}</span></div>`).join('')}
</div>` : ''}
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px">
<span style="font-size:11px;color:${C.sub}">Rolls in the satchel</span>
<span style="display:flex;align-items:center;gap:2px;background:${C.field};border:1px solid ${C.border};border-radius:9px;padding:3px">
<button type="button" onclick="App.incField('postRolls',-1,1,99)" aria-label="One roll fewer" style="width:40px;height:38px;border-radius:6px;background:transparent;border:0;color:${C.text};font:inherit;font-size:20px;font-weight:600;line-height:1;cursor:pointer">−</button>
<input type="text" inputmode="numeric" value="${shipRolls}" onchange="App.setField('postRolls',this.value)" aria-label="Rolls in the satchel" style="width:46px;height:38px;background:transparent;border:0;outline:none;text-align:center;font:inherit;font-size:20px;font-weight:700;color:${C.text}">
<button type="button" onclick="App.incField('postRolls',1,1,99)" aria-label="One roll more" style="width:40px;height:38px;border-radius:6px;background:transparent;border:0;color:${C.text};font:inherit;font-size:20px;font-weight:600;line-height:1;cursor:pointer">+</button>
</span>
</div>
<div style="margin-top:14px;padding:12px 14px;border-radius:10px;background:#1a1410;border:1px solid #3a2a1c;font-size:13px;color:#ffb184">${state.mailBack ? CUR() + money(num(state.postTo)) + ' in + ' + CUR() + money(homeMailBack) + ' back, split across ' + shipRolls + ' roll' + (shipRolls === 1 ? '' : 's') + ' — ' + CUR() + money((num(state.postTo) + homeMailBack) / shipRolls) + ' each' : 'Dropping off and collecting in person — no postage.'}</div>
<button type="button" onclick="App.closePost()" style="width:100%;height:48px;margin-top:18px;border-radius:10px;background:${C.text};border:0;color:${C.shell};font:inherit;font-size:13px;font-weight:700;cursor:pointer">Done</button>
</div>
</div>`;
}

function viewShareModal() {
    const param = state.shareKind === 'library' ? 'lib' : 'roll';
    const url = location.origin + location.pathname + '?' + param + '=' + encodeURIComponent(b64EncodeShare());
    let qrHtml = `<div style="width:172px;height:172px;display:flex;align-items:center;justify-content:center;font-size:12px;color:${C.faint}">Generating…</div>`;
    if (typeof qrcode === 'function') {
        try {
            const qr = qrcode(0, 'M');
            qr.addData(url);
            qr.make();
            qrHtml = qr.createSvgTag({ cellSize: 4, margin: 2 });
        } catch { qrHtml = `<div style="font-size:11px;color:${C.faint};max-width:172px">Link too long for a QR code — use Copy link instead.</div>`; }
    }
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:46;display:flex;flex-direction:column;justify-content:flex-end">
<div onclick="App.setField('shareModal',false)" style="position:absolute;inset:0;background:rgba(4,5,6,.72);cursor:pointer"></div>
<div style="position:relative;background:#131518;border-top:1px solid #2f333a;border-radius:18px 18px 0 0;padding:8px 20px 22px;box-shadow:0 -18px 40px rgba(0,0,0,.45)">
<div style="width:38px;height:4px;border-radius:2px;background:${C.border3};margin:0 auto 14px"></div>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
<span style="font-size:16px;font-weight:700;color:${C.text}">${state.shareKind === 'library' ? 'Share your library' : 'Share this roll'}</span>
<button type="button" onclick="App.setField('shareModal',false)" aria-label="Close" style="width:32px;height:32px;border-radius:8px;background:#1f2228;border:0;color:${C.sub};font:inherit;font-size:15px;line-height:1;cursor:pointer">✕</button>
</div>
<p style="margin:0 0 16px;font-size:13px;line-height:1.55;color:${C.sub}">${state.shareKind === 'library' ? 'Scan it on another device, or send the link — it imports every saved film and lab.' : 'Scan it at the counter, or send the link — it opens FilmCalc with this exact roll loaded.'}</p>
<div style="display:flex;justify-content:center"><div style="padding:12px;background:#ffffff;border-radius:12px;line-height:0">${qrHtml}</div></div>
<div style="margin-top:16px;padding:12px 14px;border-radius:10px;background:${C.field};border:1px solid ${C.border};font-size:12px;line-height:1.5;color:${C.sub};word-break:break-all">${escapeHtml(url)}</div>
<div style="display:flex;gap:8px;margin-top:12px">
<button type="button" onclick="App.copyLink('${jsAttr(url)}')" style="flex:2;height:48px;border-radius:10px;background:${C.accBg};border:1px solid ${C.accBorder};color:${C.acc};font:inherit;font-size:13px;font-weight:700;cursor:pointer">${state.copied ? 'Copied ✓' : 'Copy link'}</button>
<button type="button" onclick="App.setField('shareModal',false)" style="flex:1;height:48px;border-radius:10px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Done</button>
</div>
</div>
</div>`;
}
function b64EncodeShare() {
    try {
        if (state.shareKind === 'library') {
            const films = Object.values(getAllFilms());
            const labs = Object.values(getAllLabs());
            return btoa(unescape(encodeURIComponent(JSON.stringify({ films, labs, settings: { homeLab: getHomeLab() } })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        return btoa(unescape(encodeURIComponent(JSON.stringify({
            format: state.format, filmColor: state.filmColor, process: state.process,
            boxSpeed: state.boxSpeed, packCost: state.packCost, postage: state.postage, rolls: state.rolls, exposures: state.exposures,
            frame120: state.frame120, frame35: state.frame35, pushPull: state.pushPull
        })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch { return ''; }
}
function b64DecodeShare(str) {
    try {
        const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=');
        return JSON.parse(decodeURIComponent(escape(atob(padded))));
    } catch { return null; }
}

function viewMenu() {
    const items = [
        ['lookup', 'Film lookup', 'Price a roll in your hand'],
        ['library', 'Library', 'Your saved stocks and labs'],
        ['expired', 'Expired film', 'What to rate an old roll at'],
        ['settings', 'Settings', 'Home lab, language, data']
    ];
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:50;display:flex;flex-direction:column;justify-content:flex-start">
<div onclick="App.closeMenu()" style="position:absolute;inset:0;background:rgba(4,5,6,.72);cursor:pointer"></div>
<div style="position:relative;margin:0;background:#131518;border-bottom:1px solid #2f333a;border-radius:0 0 18px 18px;padding:14px 20px 18px;box-shadow:0 18px 40px rgba(0,0,0,.45)">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
<span style="font-size:16px;font-weight:700;color:${C.text}">Menu</span>
<button type="button" onclick="App.closeMenu()" aria-label="Close" style="width:32px;height:32px;border-radius:8px;background:#1f2228;border:0;color:${C.sub};font:inherit;font-size:15px;line-height:1;cursor:pointer">✕</button>
</div>
<div style="display:flex;flex-direction:column;gap:6px">
${items.map(([key, label, meta]) => `<button type="button" onclick="App.setView('${key}')" style="width:100%;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid ${C.border};font:inherit;cursor:pointer;background:${state.view === key ? C.panel : 'transparent'}"><span style="display:block;font-size:15px;color:${state.view === key ? C.acc : C.text}">${label}</span><span style="display:block;font-size:12px;color:${C.faint};margin-top:3px">${meta}</span></button>`).join('')}
<button type="button" onclick="App.install()" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid ${C.accBorder};background:${C.accBg};font:inherit;cursor:pointer">
<svg style="width:18px;height:18px;flex:none;color:${C.acc}" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5M5 17v2a1 1 0 001 1h12a1 1 0 001-1v-2"></path></svg>
<span style="flex:1;min-width:0"><span style="display:block;font-size:15px;color:${C.acc}">${state.installable ? 'Install FilmCalc' : 'Add to home screen'}</span><span style="display:block;font-size:12px;color:#a87a52;margin-top:3px">${state.installable ? 'Works offline, opens full screen' : 'Share → Add to Home Screen on iPhone'}</span></span>
</button>
<button type="button" onclick="App.openChangelog()" style="width:100%;text-align:left;padding:12px 14px;border-radius:10px;border:1px solid ${C.border};background:transparent;font:inherit;cursor:pointer">
<span style="display:block;font-size:15px;color:${C.text}">What's new</span>
<span style="display:block;font-size:12px;color:${C.faint};margin-top:3px">Recent changes to FilmCalc</span>
</button>
<button type="button" onclick="App.openSetup()" style="width:100%;text-align:left;padding:12px 14px;border-radius:10px;border:1px dashed ${C.border3};background:transparent;font:inherit;cursor:pointer">
<span style="display:block;font-size:15px;color:${C.text}">Run setup again</span>
<span style="display:block;font-size:12px;color:${C.faint};margin-top:3px">Language, starter presets, home lab</span>
</button>
</div>
</div>
</div>`;
}

function viewSetup() {
    const step = state.setupStep;
    const labNames = Object.keys(getAllLabs()).filter(n => !getAllLabs()[n].hidden);
    const regions = state.presetRegions || [];
    return `<div style="position:fixed;inset:0;z-index:60;display:flex;align-items:flex-start;justify-content:center;padding:28px 16px;overflow:auto">
<div style="position:absolute;inset:0;background:rgba(4,5,6,.82)"></div>
<div style="position:relative;width:100%;max-width:480px;background:#131518;border:1px solid #2f333a;border-radius:14px;padding:18px 20px 20px;box-shadow:0 30px 80px -20px #000">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
<span style="font-size:16px;font-weight:700;color:${C.text}">Set up FilmCalc</span>
<span style="display:flex;align-items:center;gap:5px">${SETUP_STEPS.map((_, i) => `<span style="width:6px;height:6px;border-radius:50%;background:${i === step ? C.acc : '#33333a'}"></span>`).join('')}</span>
</div>
<p style="margin:8px 0 16px;font-size:13px;line-height:1.55;color:${C.sub}">Three quick questions. Everything here can be changed later in Settings.</p>
<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:8px">
<span style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.acc}">${SETUP_STEPS[step]}</span>
<span style="font-size:11px;color:${C.faint}">Step ${step + 1} of ${SETUP_STEPS.length}</span>
</div>
${step === 0 ? `<select onchange="App.setLanguage(this.value)" aria-label="Language" style="width:100%;height:46px;background:${C.field};border:1px solid ${C.border};border-radius:8px;padding:0 10px;font:inherit;font-size:15px;color:${C.text};cursor:pointer">${LANGUAGE_OPTIONS.map(([code, label]) => `<option value="${code}" ${state.language === code ? 'selected' : ''}>${label}</option>`).join('')}</select>
<div style="font-size:12px;line-height:1.5;color:${C.faint};margin-top:10px">Prices and dates follow your device's region regardless of this choice.</div>` : ''}
${step === 1 ? `<div style="font-size:12px;line-height:1.5;color:${C.faint};margin-bottom:10px">Pick the regions you buy and develop in. These fill your library with real lab and retailer prices — you can edit or hide any of them afterwards.</div>
<div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto">${regions.length ? regions.map(r => {
        const on = state.presetChecked.has(r.label);
        return `<button type="button" onclick="App.togglePreset('${jsAttr(r.label)}')" style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;height:44px;padding:0 12px;border-radius:8px;font:inherit;font-size:14px;cursor:pointer;text-align:left;background:${on ? C.accBg : C.field};border:1px solid ${on ? C.accBorder : C.border};color:${on ? C.acc : C.text2}">${escapeHtml(r.label)} <span>${on ? '✓' : ''}</span></button>`;
    }).join('') : `<div style="font-size:12px;color:${C.faint}">Loading regions…</div>`}</div>
<div style="font-size:12px;color:${C.faint};margin-top:10px">${state.presetChecked.size} region${state.presetChecked.size === 1 ? '' : 's'} selected · imports when you tap Next</div>` : ''}
${step === 2 ? `<div style="font-size:11px;color:${C.sub};margin-bottom:6px">Home lab</div>
<select onchange="App.setField('homeLab',this.value)" aria-label="Home lab" style="width:100%;height:46px;background:${C.field};border:1px solid ${C.border};border-radius:8px;padding:0 10px;font:inherit;font-size:15px;color:${C.text};cursor:pointer"><option value="">— pick a lab —</option>${labNames.map(n => `<option value="${escapeHtml(n)}" ${state.homeLab === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select>
<div style="font-size:11px;color:${C.sub};margin:14px 0 6px">Preferred service tier</div>
<select onchange="App.setField('tier',this.value)" aria-label="Preferred service tier" style="width:100%;height:46px;background:${C.field};border:1px solid ${C.border};border-radius:8px;padding:0 10px;font:inherit;font-size:15px;color:${C.text};cursor:pointer"><option value="">Cheapest that qualifies</option></select>
<div style="font-size:12px;line-height:1.5;color:${C.faint};margin-top:10px">Your home lab is the price shown as the big number on every lookup.</div>` : ''}
<div style="display:flex;gap:10px;margin-top:20px">
${step > 0 ? `<button type="button" onclick="App.setupBack()" style="flex:1;height:46px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Back</button>` : ''}
${step === SETUP_STEPS.length - 1
        ? `<button type="button" onclick="App.closeSetup()" style="flex:2;height:46px;border-radius:8px;background:${C.text};border:0;color:${C.shell};font:inherit;font-size:13px;font-weight:700;cursor:pointer">Done</button>`
        : `<button type="button" onclick="App.setupNext()" style="flex:2;height:46px;border-radius:8px;background:${C.accBg};border:1px solid ${C.accBorder};color:${C.acc};font:inherit;font-size:13px;font-weight:700;cursor:pointer">Next</button>`}
</div>
</div>
</div>`;
}

function viewConsent() {
    return `<div style="position:fixed;left:50%;transform:translateX(-50%);bottom:12px;z-index:55;width:100%;max-width:${shellW()};padding:0 12px;box-sizing:border-box">
<div style="background:${C.panel};border:1px solid ${C.border2};border-radius:12px;padding:14px 16px;box-shadow:0 18px 40px rgba(0,0,0,.5)">
<div style="font-size:13px;line-height:1.55;color:${C.text2}">FilmCalc uses one analytics cookie to count visits and see which screens get used. Nothing about your library ever leaves your device. <a href="../privacy.html">Privacy policy</a></div>
<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
<button type="button" onclick="App.declineConsent()" style="height:40px;padding:0 14px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Decline</button>
<button type="button" onclick="App.acceptConsent()" style="height:40px;padding:0 14px;border-radius:8px;background:${C.accBg};border:1px solid ${C.accBorder};color:${C.acc};font:inherit;font-size:13px;font-weight:600;cursor:pointer">Allow</button>
</div>
</div>
</div>`;
}

function viewChangelog() {
    const items = state.changelog || [];
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:62;display:flex;flex-direction:column;justify-content:flex-end">
<div onclick="App.closeChangelog()" style="position:absolute;inset:0;background:rgba(4,5,6,.72);cursor:pointer"></div>
<div style="position:relative;background:#131518;border-top:1px solid #2f333a;border-radius:18px 18px 0 0;padding:8px 20px 22px;box-shadow:0 -18px 40px rgba(0,0,0,.45)">
<div style="width:38px;height:4px;border-radius:2px;background:${C.border3};margin:0 auto 14px"></div>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
<span style="font-size:16px;font-weight:700;color:${C.text}">What's new</span>
<button type="button" onclick="App.closeChangelog()" aria-label="Close" style="width:32px;height:32px;border-radius:8px;background:#1f2228;border:0;color:${C.sub};font:inherit;font-size:15px;line-height:1;cursor:pointer">✕</button>
</div>
<p style="margin:0 0 8px;font-size:12px;color:${C.faint}">Every change since your last visit.</p>
<div style="max-height:320px;overflow:auto">
${items.length ? items.slice(0, 30).map(c => `<div style="padding:12px 0;border-top:1px solid ${C.border}"><div style="font-size:14px;line-height:1.45;color:${C.text2}">${escapeHtml(c.title)}</div><div style="font-size:11px;color:${C.faint};margin-top:3px">#${c.number} · ${fmtDate(c.mergedAt)}</div></div>`).join('') : `<div style="padding:12px 0;font-size:12px;color:${C.faint}">Loading…</div>`}
</div>
<button type="button" onclick="App.closeChangelog()" style="width:100%;height:48px;margin-top:16px;border-radius:10px;background:${C.text};border:0;color:${C.shell};font:inherit;font-size:13px;font-weight:700;cursor:pointer">Done</button>
</div>
</div>`;
}

function viewConfirm() {
    const c = state.confirm;
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:64;display:flex;flex-direction:column;justify-content:flex-end">
<div onclick="App.cancelConfirm()" style="position:absolute;inset:0;background:rgba(4,5,6,.78);cursor:pointer"></div>
<div style="position:relative;background:#131518;border-top:1px solid ${C.redBorder};border-radius:18px 18px 0 0;padding:20px 20px 22px;box-shadow:0 -18px 40px rgba(0,0,0,.5)">
<div style="font-size:17px;font-weight:700;color:${C.text}">${escapeHtml(c.title)}</div>
<p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:${C.sub}">${escapeHtml(c.body)}</p>
<div style="display:flex;gap:8px;margin-top:18px">
<button type="button" onclick="App.runConfirm()" style="flex:1;height:48px;border-radius:10px;background:#2a1513;border:1px solid ${C.redBorder};color:${C.red};font:inherit;font-size:13px;font-weight:700;cursor:pointer">${escapeHtml(c.cta)}</button>
<button type="button" onclick="App.cancelConfirm()" style="width:120px;height:48px;border-radius:10px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Cancel</button>
</div>
</div>
</div>`;
}

function fieldLabel(label, inner) {
    return `<label style="display:block"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.sub};margin-bottom:6px">${label}</div>${inner}</label>`;
}
function textInput(field, value, placeholder) {
    return `<input type="text" value="${escapeHtml(value)}" onchange="App.setDraft('${field}',this.value)" ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''} style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 12px;font:inherit;font-size:16px;color:${C.text};outline:none">`;
}
function selectInputHandler(onchangeAttr, value, options) {
    return `<select onchange="${onchangeAttr}" style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 10px;font:inherit;font-size:15px;color:${C.text};cursor:pointer">${options.map(o => `<option value="${escapeHtml(o)}" ${value === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
}
function selectInput(field, value, options) {
    return selectInputHandler(`App.setDraft('${field}',this.value)`, value, options);
}

function viewEditor() {
    const d = state.draft;
    const isFilm = state.draftKind === 'film';
    const subList = isFilm ? d.bundles : d.services;
    const subRows = subList.map((b, i) => ({
        title: isFilm ? (b.storeName || 'Unnamed store') : (b.label || 'Unnamed tier'),
        meta: isFilm ? `${b.rolls}×${b.exposures} · ${CUR()}${(parseFloat(b.filmCost) || 0).toFixed(2)} · ${b.availability}` : `${CUR()}${(parseFloat(b.devCost) || 0).toFixed(2)} dev · mail-back ${b.mailBackCost === '' ? 'n/a' : CUR() + (parseFloat(b.mailBackCost) || 0).toFixed(2)}`,
        i
    }));
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:58;background:${C.shell};display:flex;flex-direction:column">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid ${C.border};background:#131518">
<span style="font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.text}">${isFilm ? 'Edit film' : 'Edit lab'}</span>
<button type="button" onclick="App.cancelDraft()" aria-label="Close" style="width:36px;height:36px;border-radius:8px;background:#1f2228;border:1px solid ${C.border2};color:${C.sub};font:inherit;font-size:16px;line-height:1;cursor:pointer">✕</button>
</div>
<div style="flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
${fieldLabel('Name', textInput('name', d.name))}
${isFilm ? `<div style="display:flex;gap:10px">
<div style="flex:1;min-width:0">${fieldLabel('Box speed', textInput('boxSpeed', d.boxSpeed))}</div>
<div style="flex:1;min-width:0">${fieldLabel('Max push/pull', textInput('maxPushPull', d.maxPushPull))}</div>
</div>
<div style="display:flex;gap:10px">
<div style="flex:1;min-width:0">${fieldLabel('Format', selectInput('format', d.format, FORMATS))}</div>
<div style="flex:1;min-width:0">${fieldLabel('Process', selectInput('process', d.process, PROCESSES))}</div>
</div>
${fieldLabel('Type', selectInput('colorType', d.colorType, FILM_COLORS))}` : `
${fieldLabel('Address', textInput('address', d.address, 'Street, suburb, state postcode'))}
${fieldLabel('Website', textInput('website', d.website, 'https://…'))}
<div style="display:flex;gap:10px">
<div style="flex:1;min-width:0">${fieldLabel('Phone', textInput('phone', d.phone))}</div>
<div style="flex:1;min-width:0">${fieldLabel('Email', textInput('email', d.email))}</div>
</div>
${fieldLabel('Price source', textInput('source', d.source, 'https://…'))}`}
<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px">
<span style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.sub}">${isFilm ? 'Where to buy' : 'Service tiers'}</span>
<button type="button" onclick="App.addSub()" style="height:36px;padding:0 14px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:12px;cursor:pointer">${isFilm ? '+ Add price' : '+ Add tier'}</button>
</div>
${subRows.length === 0 ? `<div style="font-size:12px;color:${C.faint};padding:2px">${isFilm ? 'No purchase links saved yet.' : 'No service tiers saved yet.'}</div>` : ''}
${subRows.map(r => `<button type="button" onclick="App.openSub(${r.i})" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px;background:${C.panel};border:1px solid ${C.border};border-radius:10px;font:inherit;text-align:left;cursor:pointer">
<span style="flex:1;min-width:0"><span style="display:block;font-size:14px;color:${C.text}">${escapeHtml(r.title)}</span><span style="display:block;font-size:12px;color:${C.faint};margin-top:3px">${escapeHtml(r.meta)}</span></span>
<svg style="width:14px;height:14px;flex:none;color:${C.faint}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 4.5l3 3M4 20l4-1 10-10-3-3L5 16l-1 4z"></path></svg>
</button>`).join('')}
</div>
<div style="display:flex;gap:10px;padding:12px 16px;border-top:1px solid ${C.border};background:#131518">
<button type="button" onclick="App.saveDraft()" style="flex:1;height:50px;border-radius:8px;background:${C.accBg};border:1px solid ${C.accBorder};color:${C.acc};font:inherit;font-size:13px;font-weight:700;cursor:pointer">${isFilm ? 'Save film' : 'Save lab'}</button>
<button type="button" onclick="App.cancelDraft()" style="width:110px;height:50px;border-radius:8px;background:transparent;border:1px solid ${C.border2};color:${C.text2};font:inherit;font-size:13px;cursor:pointer">Cancel</button>
</div>
</div>`;
}

function viewSubEditor() {
    const d = state.draft;
    const isFilm = state.draftKind === 'film';
    const i = state.subIndex;
    const sub = (isFilm ? d.bundles : d.services)[i] || {};
    const setSub = (field) => `App.setSub('${field}',this.value)`;
    return `<div style="position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:${shellW()};z-index:59;background:${C.shell};display:flex;flex-direction:column">
<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid ${C.border};background:#131518">
<button type="button" onclick="App.closeSub()" aria-label="Back" style="width:36px;height:36px;flex:none;border-radius:8px;background:#1f2228;border:1px solid ${C.border2};color:${C.sub};font:inherit;font-size:16px;line-height:1;cursor:pointer">‹</button>
<span style="flex:1;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.text}">${isFilm ? 'Purchase link' : 'Service tier'}</span>
<button type="button" onclick="App.removeSub()" aria-label="Delete" style="width:36px;height:36px;flex:none;border-radius:8px;background:transparent;border:1px solid ${C.redBorder};color:#e07a6a;font:inherit;font-size:16px;line-height:1;cursor:pointer">✕</button>
</div>
<div style="flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
${isFilm ? `${fieldLabel('Store name', `<input type="text" value="${escapeHtml(sub.storeName || '')}" onchange="${setSub('storeName')}" placeholder="Where you buy it" style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 12px;font:inherit;font-size:16px;color:${C.text};outline:none">`)}
<div style="display:flex;gap:10px">
<div style="flex:1;min-width:0">${fieldLabel('Rolls', `<input type="text" inputmode="numeric" value="${escapeHtml(sub.rolls || '')}" onchange="${setSub('rolls')}" style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 12px;font:inherit;font-size:16px;color:${C.text};outline:none">`)}</div>
<div style="flex:1;min-width:0">${fieldLabel('Exposures', `<input type="text" inputmode="numeric" value="${escapeHtml(sub.exposures || '')}" onchange="${setSub('exposures')}" style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 12px;font:inherit;font-size:16px;color:${C.text};outline:none">`)}</div>
<div style="flex:1;min-width:0">${fieldLabel('Price', `<input type="text" inputmode="decimal" value="${escapeHtml(sub.filmCost || '')}" onchange="${setSub('filmCost')}" style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 12px;font:inherit;font-size:16px;color:${C.text};outline:none">`)}</div>
</div>
${fieldLabel('Purchase link', `<input type="text" value="${escapeHtml(sub.buyLink || '')}" onchange="${setSub('buyLink')}" placeholder="https://…" style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 12px;font:inherit;font-size:16px;color:${C.text};outline:none">`)}
${fieldLabel('Availability', selectInputHandler(setSub('availability'), sub.availability || 'national', ['national', 'state', 'city']))}` : `
${fieldLabel('Tier name', `<input type="text" value="${escapeHtml(sub.label || '')}" onchange="${setSub('label')}" placeholder="Develop + hi-res scan" style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 12px;font:inherit;font-size:16px;color:${C.text};outline:none">`)}
<div style="display:flex;gap:10px">
<div style="flex:1;min-width:0">${fieldLabel('Cost per roll', `<input type="text" inputmode="decimal" value="${escapeHtml(sub.devCost || '')}" onchange="${setSub('devCost')}" style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 12px;font:inherit;font-size:16px;color:${C.text};outline:none">`)}</div>
<div style="flex:1;min-width:0">${fieldLabel('Mail-back', `<input type="text" inputmode="decimal" value="${escapeHtml(sub.mailBackCost || '')}" onchange="${setSub('mailBackCost')}" placeholder="n/a" style="width:100%;box-sizing:border-box;height:48px;background:${C.panel};border:1px solid ${C.border2};border-radius:8px;padding:0 12px;font:inherit;font-size:16px;color:${C.text};outline:none">`)}</div>
</div>
${fieldLabel('Turnaround', selectInputHandler(setSub('turnaround'), sub.turnaround || 'Same week', ['Next day', 'Same week', 'Longer']))}
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:${C.panel};border:1px solid ${C.border};border-radius:10px">
<span style="font-size:14px;color:${C.text}">Includes hi-res scans</span>
<button type="button" onclick="App.toggleSubHiRes()" style="width:52px;height:30px;flex:none;border-radius:15px;border:0;padding:3px;cursor:pointer;display:flex;align-items:center;justify-content:${sub.hiRes ? 'flex-end' : 'flex-start'};background:${sub.hiRes ? C.accBorder : C.border}"><span style="width:24px;height:24px;border-radius:50%;background:${sub.hiRes ? C.acc : C.faint}"></span></button>
</div>`}
<button type="button" onclick="App.closeSub()" style="height:48px;margin-top:6px;border-radius:8px;background:${C.accBg};border:1px solid ${C.accBorder};color:${C.acc};font:inherit;font-size:13px;font-weight:700;cursor:pointer">Done</button>
</div>
</div>`;
}

// ---------- Handlers ----------
const App = {
    say,
    setField(key, val) {
        state[key] = val;
        if (key === 'homeLab') setHomeLab(val);
        if (key === 'tier') setDefaultTierLabel(val);
        if (key === 'upgradePct') try { localStorage.setItem('upgradeThresholdPercent', val); } catch {}
        if (key === 'rolls') state.rolls = String(Math.min(99, Math.max(1, parseInt(val, 10) || 1)));
        if (key === 'exposures') state.exposures = String(Math.min(99, Math.max(1, parseInt(val, 10) || 1)));
        if (key === 'postRolls') {
            state.postRolls = String(Math.min(99, Math.max(1, parseInt(val, 10) || 1)));
            try { localStorage.setItem('mailBackRollCount', state.postRolls); } catch {}
        }
        if (key === 'libFilterModal' && val === true) { /* keep current tab's filters */ }
        render();
    },
    setView(view) {
        state.view = view;
        state.menu = false;
        // Settings' "Starter presets" card reads state.presetRegions directly
        // with no fetch trigger of its own — without this, a returning user
        // (setupSeen already set, so openSetup()'s own load never ran this
        // session) hits Settings and the card is stuck on "Loading regions…"
        // forever. loadPresetRegions() short-circuits once already loaded.
        if (view === 'settings' && !state.presetRegions) loadPresetRegions().then(render);
        render();
    },
    setFormat(label) { state.format = label; try { localStorage.setItem('globalFormat', label); } catch {} render(); },
    setFilmColor(label) { state.filmColor = FILM_COLOR_VALUE[label]; try { localStorage.setItem('globalFilmColor', state.filmColor); } catch {} render(); },
    incField(key, delta, min, max) {
        const cur = parseInt(state[key], 10) || 0;
        state[key] = String(Math.min(max, Math.max(min, cur + delta)));
        if (key === 'frame120') {} // not used with incField
        render();
    },
    toggleFlag(key) {
        state[key] = !state[key];
        if (key === 'fHiRes' || key === 'fRush') {
            const cur = readJSON('reqFilters', {}) || {};
            writeJSON('reqFilters', Object.assign({}, cur, { hiRes: state.fHiRes, rush: state.fRush }));
        }
        render();
    },
    openModal() { state.modal = true; render(); },
    closeModal() { state.modal = false; render(); },
    openPost() { state.postModal = true; render(); },
    closePost() { state.postModal = false; render(); },
    openShare() { state.shareModal = true; state.shareKind = 'roll'; state.copied = false; render(); },
    shareLibrary() { state.shareModal = true; state.shareKind = 'library'; state.copied = false; render(); },
    copyLink(url) {
        try { navigator.clipboard.writeText(url); } catch {}
        state.copied = true;
        render();
    },
    openMaps() {
        const home = rankLabs().ranked.find(l => l.name === state.homeLab) || rankLabs().ranked[0];
        const href = home ? labDirectionsUrl(home.lab) : '';
        if (!href) { say('No address saved for this lab'); return; }
        window.open(href, '_blank', 'noopener');
    },
    loadCheaper() {
        const home = rankLabs().ranked.find(l => l.name === state.homeLab) || rankLabs().ranked[0];
        const cheaper = computeCheaperFilm(home);
        if (!cheaper.pick) return;
        state.boxSpeed = String(cheaper.pick.boxSpeed);
        state.pushPull = String(cheaper.pickStops);
        state.format = Object.keys(FORMAT_VALUE).find(k => FORMAT_VALUE[k] === (cheaper.pick.format || '35mm')) || state.format;
        state.filmColor = filmColorType(cheaper.pick);
        say(cheaper.pick.name + ' loaded');
    },
    labDetail: App_labDetail,
    filmDetail: App_filmDetail,
    openLibDetail(item) { if (item) { state.libOpen = item; render(); } },
    openLibDetailByKey(kind, key) { App.openLibDetail(kind === 'film' ? App_filmDetail(key) : App_labDetail(key)); },
    closeLibDetail() { state.libOpen = null; render(); },
    setLibTab(tab) { state.libTab = tab; state.libFilter = 'All'; state.libFormat = 'All'; state.libProcess = 'All'; state.libIso = 'All'; render(); },
    resetLibFilters() { state.libFilter = 'All'; state.libFormat = 'All'; state.libProcess = 'All'; state.libIso = 'All'; render(); },
    loadIntoLookup() {
        const it = state.libOpen;
        if (!it) return;
        if (it.kind === 'film') {
            const f = getAllFilms()[it.key];
            if (f) {
                state.boxSpeed = String(f.boxSpeed);
                state.format = Object.keys(FORMAT_VALUE).find(k => FORMAT_VALUE[k] === (f.format || '35mm')) || state.format;
                state.filmColor = filmColorType(f);
                state.process = f.process || state.process;
                const bundles = f.bundles || [];
                if (bundles.length) state.packCost = String(bundles.slice().sort((a, b) => a.filmCost / (a.rolls || 1) - b.filmCost / (b.rolls || 1))[0].filmCost);
            }
            say((f ? f.name : 'Stock') + ' loaded');
        } else {
            const name = it.key;
            App.setField('homeLab', name);
            say(name + ' set as your lab');
        }
        state.libOpen = null;
        state.view = 'lookup';
        render();
    },
    openEditorFor() {
        const it = state.libOpen;
        if (!it) return;
        if (it.kind === 'film') {
            const f = getAllFilms()[it.key];
            if (!f) return;
            state.draftKind = 'film'; state.draftKey = it.key;
            state.draft = {
                name: f.name, boxSpeed: String(f.boxSpeed), maxPushPull: String(f.maxPushPull ?? 1),
                format: Object.keys(FORMAT_VALUE).find(k => FORMAT_VALUE[k] === (f.format || '35mm')) || '35mm',
                process: Object.keys(PROCESS_VALUE).find(k => PROCESS_VALUE[k] === f.process) || 'C41',
                colorType: FILM_COLOR_LABEL[filmColorType(f)],
                bundles: (f.bundles || []).map(b => ({ ...b, rolls: String(b.rolls), exposures: String(b.exposures), filmCost: (parseFloat(b.filmCost) || 0).toFixed(2) }))
            };
        } else {
            const l = getAllLabs()[it.key];
            if (!l) return;
            const rawTiers = Array.isArray(l.services) && l.services.length ? l.services : [l];
            state.draftKind = 'lab'; state.draftKey = it.key;
            state.draft = {
                name: l.name, address: l.address || '', website: l.website || '', phone: l.phone || '', email: l.email || '', source: l.source || '',
                services: normalizeLabServices(l).map((t, idx) => ({
                    ...t, label: (rawTiers[idx] && rawTiers[idx].label) || tierDescription(t),
                    devCost: t.devCost.toFixed(2), mailBackCost: t.mailBackCost === null ? '' : t.mailBackCost.toFixed(2),
                    turnaround: turnaroundLabels[t.turnaroundTime] || 'Same week', hiRes: t.highResScan
                }))
            };
        }
        state.libOpen = null;
        render();
    },
    openEditor() { App.openEditorFor(); },
    hideItem() {
        const it = state.libOpen;
        if (!it) return;
        if (it.kind === 'film') {
            const all = getAllFilms();
            if (all[it.key]) { all[it.key] = { ...all[it.key], hidden: true }; setAllFilms(all); }
        } else {
            const all = getAllLabs();
            if (all[it.key]) { all[it.key] = { ...all[it.key], hidden: true }; setAllLabs(all); }
        }
        state.libOpen = null;
        say(it.name.replace(' · home', '') + ' hidden from lookups');
    },
    unhide(kind, key) {
        if (kind === 'film') {
            const all = getAllFilms();
            if (all[key]) { all[key] = { ...all[key], hidden: false }; setAllFilms(all); }
        } else {
            const all = getAllLabs();
            if (all[key]) { all[key] = { ...all[key], hidden: false }; setAllLabs(all); }
        }
        render();
    },
    confirmDeleteItem() {
        const it = state.libOpen;
        if (!it) return;
        const name = it.name.replace(' · home', '');
        state.confirm = {
            title: 'Delete ' + name + '?',
            body: it.kind === 'film' ? 'The stock and its saved prices are removed from your library.' : 'The lab and all of its service tiers are removed from your library.',
            cta: 'Delete',
            run: () => {
                if (it.kind === 'film') { const all = getAllFilms(); delete all[it.key]; setAllFilms(all); }
                else { const all = getAllLabs(); delete all[it.key]; setAllLabs(all); }
                state.confirm = null; state.libOpen = null;
                say(name + ' deleted');
            }
        };
        render();
    },
    confirmDeleteAll() {
        state.confirm = {
            title: 'Delete everything?',
            body: 'Every lab, film stock, saved roll and setting on this device is removed. This cannot be undone.',
            cta: 'Delete everything',
            run: () => {
                setAllFilms({}); setAllLabs({});
                setHomeLab(''); setDefaultTierLabel('');
                state.homeLab = ''; state.tier = '';
                state.confirm = null;
                say('Library deleted');
            }
        };
        render();
    },
    runConfirm() { if (state.confirm) state.confirm.run(); render(); },
    cancelConfirm() { state.confirm = null; render(); },
    addLibItem() {
        state.draftKind = state.libTab === 'films' ? 'film' : 'lab';
        state.draftKey = null;
        state.draft = state.libTab === 'films'
            ? { name: '', boxSpeed: '400', maxPushPull: '1', format: '35mm', process: 'C41', colorType: 'Colour', bundles: [] }
            : { name: '', address: '', website: '', phone: '', email: '', source: '', services: [] };
        render();
    },
    setDraft(key, val) { state.draft[key] = val; render(); },
    addSub() {
        const isFilm = state.draftKind === 'film';
        const list = isFilm ? state.draft.bundles : state.draft.services;
        const blank = isFilm
            ? { storeName: '', rolls: '1', exposures: '36', filmCost: '', buyLink: '', availability: 'national' }
            : { label: '', devCost: '', mailBackCost: '', turnaround: 'Same week', hiRes: true, pushPullCost: 0, pushPullType: 'per_stop', tiffScan: false, noPushPull: false, processes: [state.draft.process ? PROCESS_VALUE[state.draft.process] : 'C41'] };
        list.push(blank);
        state.subIndex = list.length - 1;
        render();
    },
    openSub(i) { state.subIndex = i; render(); },
    closeSub() { state.subIndex = null; render(); },
    removeSub() {
        const isFilm = state.draftKind === 'film';
        const list = isFilm ? state.draft.bundles : state.draft.services;
        list.splice(state.subIndex, 1);
        state.subIndex = null;
        render();
    },
    setSub(field, val) {
        const isFilm = state.draftKind === 'film';
        const list = isFilm ? state.draft.bundles : state.draft.services;
        list[state.subIndex][field] = val;
        render();
    },
    toggleSubHiRes() {
        const list = state.draft.services;
        list[state.subIndex].hiRes = !list[state.subIndex].hiRes;
        render();
    },
    saveDraft() {
        const d = state.draft;
        if (!d || !d.name) { say('Name it before saving'); return; }
        if (state.draftKind === 'film') {
            const format = FORMAT_VALUE[d.format] || '35mm';
            const filmObj = {
                name: d.name, boxSpeed: parseInt(d.boxSpeed, 10) || 400, maxPushPull: parseFloat(d.maxPushPull) || 1,
                process: PROCESS_VALUE[d.process] || 'C41', colorType: FILM_COLOR_VALUE[d.colorType] || 'color', format, hidden: false,
                bundles: d.bundles.map(b => ({ rolls: parseInt(b.rolls) || 1, exposures: parseInt(b.exposures) || 36, filmCost: parseFloat(b.filmCost) || 0, storeName: b.storeName || '', buyLink: b.buyLink || '', availability: b.availability || 'national', state: b.state || '', city: b.city || '' }))
            };
            const all = getAllFilms();
            const newKey = filmKeyOf(filmObj);
            if (state.draftKey && state.draftKey !== newKey) delete all[state.draftKey];
            all[newKey] = filmObj;
            setAllFilms(all);
        } else {
            const labObj = {
                name: d.name, address: d.address || '', website: d.website || '', phone: d.phone || '', email: d.email || '', source: d.source || '', hidden: false,
                services: d.services.map(t => ({
                    label: t.label || 'Unnamed tier', devCost: parseFloat(t.devCost) || 0,
                    pushPullCost: parseFloat(t.pushPullCost) || 0, pushPullType: t.pushPullType || 'per_stop',
                    turnaroundTime: turnaroundValues[t.turnaround] || 'same_week',
                    highResScan: !!t.hiRes, tiffScan: !!t.tiffScan, noPushPull: !!t.noPushPull,
                    mailBackCost: t.mailBackCost === '' || t.mailBackCost === undefined ? null : (parseFloat(t.mailBackCost) || 0),
                    processes: Array.isArray(t.processes) && t.processes.length ? t.processes : ['C41']
                }))
            };
            const all = getAllLabs();
            if (state.draftKey && state.draftKey !== d.name) delete all[state.draftKey];
            all[d.name] = labObj;
            setAllLabs(all);
        }
        const name = d.name;
        state.draft = null; state.draftKind = null; state.draftKey = null; state.subIndex = null;
        say(name + ' saved');
    },
    cancelDraft() { state.draft = null; state.draftKind = null; state.draftKey = null; state.subIndex = null; render(); },
    clearAll() {
        state.boxSpeed = ''; state.packCost = ''; state.postage = ''; state.rolls = '1'; state.exposures = '36';
        state.pushPull = '0'; state.postTo = ''; state.mailBack = false; state.tab = 'labs';
        state.fHiRes = false; state.fRush = false;
        render();
    },
    openMenu() { state.menu = true; render(); },
    closeMenu() { state.menu = false; render(); },
    openChangelog() {
        state.changelogOpen = true; state.menu = false;
        if (!state.changelog) {
            fetch('../changelog.json').then(r => r.ok ? r.json() : []).then(list => { state.changelog = list; render(); }).catch(() => { state.changelog = []; render(); });
        }
        render();
    },
    closeChangelog() { state.changelogOpen = false; render(); },
    openSetup() { state.setupOpen = true; state.setupStep = 0; state.menu = false; loadPresetRegions().then(render); render(); },
    closeSetup() { state.setupOpen = false; try { localStorage.setItem('setupSeen', '1'); } catch {} render(); },
    setupBack() { state.setupStep = Math.max(0, state.setupStep - 1); render(); },
    async setupNext() {
        if (state.setupStep === 1 && state.presetChecked.size && !state.setupBusy) {
            state.setupBusy = true; render();
            await App.importPresets();
            state.setupBusy = false;
        }
        state.setupStep = Math.min(SETUP_STEPS.length - 1, state.setupStep + 1);
        render();
    },
    togglePreset(label) {
        if (state.presetChecked.has(label)) state.presetChecked.delete(label); else state.presetChecked.add(label);
        render();
    },
    async importPresets() {
        const regions = (state.presetRegions || []).filter(r => state.presetChecked.has(r.label));
        if (!regions.length) { say('Pick at least one region'); return; }
        const { filmsAdded, labsAdded } = await importPresetRegions(regions);
        state.presetChecked = new Set();
        say(filmsAdded + labsAdded ? `Imported ${filmsAdded} films, ${labsAdded} labs` : 'Nothing new to import');
        render();
    },
    setLanguage(code) { state.language = code; try { localStorage.setItem('locale', code); } catch {} render(); },
    setTheme(value) { state.theme = value; try { localStorage.setItem('newUiTheme', value); } catch {} render(); },
    resetConsent() { state.consent = null; try { localStorage.removeItem('analyticsConsent'); } catch {} render(); },
    acceptConsent() {
        state.consent = 'granted';
        try { localStorage.setItem('analyticsConsent', 'granted'); } catch {}
        if (typeof window.__loadGAIfConsented === 'function') window.__loadGAIfConsented();
        render();
    },
    declineConsent() { state.consent = 'denied'; try { localStorage.setItem('analyticsConsent', 'denied'); } catch {} render(); },
    install() {
        if (state.deferredPrompt) { state.deferredPrompt.prompt(); state.deferredPrompt = null; return; }
        const ios = /iP(hone|ad|od)/.test(navigator.userAgent || '');
        say(ios ? 'Tap Share, then Add to Home Screen' : "Use your browser's Install app option");
    },
    exportJson() {
        try {
            const blob = new Blob([JSON.stringify({ films: getAllFilms(), labs: getAllLabs() }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'filmcalc-library.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            say('Library exported as JSON');
        } catch { say("Couldn't export — try again"); }
    },
    reportIssue() {
        const url = 'https://github.com/trentnbauer/FilmCalc/issues/new?labels=data&title=' + encodeURIComponent('Data report from /new preview');
        window.open(url, '_blank', 'noopener');
    }
};
window.App = App;

// ---------- Restore a shared roll/library link ----------
function restoreFromQuery() {
    try {
        const params = new URLSearchParams(location.search);
        if (params.has('roll')) {
            const data = b64DecodeShare(params.get('roll'));
            if (data) Object.assign(state, data);
        } else if (params.has('lib')) {
            const data = b64DecodeShare(params.get('lib'));
            if (data && (data.films || data.labs)) {
                const allFilms = getAllFilms(), allLabs = getAllLabs();
                mergeFilmsInto(allFilms, data.films || []);
                mergeLabsInto(allLabs, data.labs || []);
                setAllFilms(allFilms); setAllLabs(allLabs);
                if (data.settings && data.settings.homeLab) setHomeLab(data.settings.homeLab);
                state.homeLab = getHomeLab();
                say('Shared library imported');
            }
        }
        if (params.has('roll') || params.has('lib')) {
            history.replaceState(null, '', location.pathname);
        }
    } catch { /* malformed link — ignore, keep defaults */ }
}

// ---------- Init ----------
function init() {
    restoreFromQuery();
    const mq = window.matchMedia('(min-width: 900px)');
    state.desktop = mq.matches;
    const onMq = () => { state.desktop = mq.matches; render(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);

    const themeMq = window.matchMedia('(prefers-color-scheme: dark)');
    const onThemeMq = () => { if (state.theme === 'system') render(); };
    if (themeMq.addEventListener) themeMq.addEventListener('change', onThemeMq); else themeMq.addListener(onThemeMq);

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.deferredPrompt = e;
        state.installable = true;
        render();
    });

    if (state.setupOpen) loadPresetRegions().then(render);

    render();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();



