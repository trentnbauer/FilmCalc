// FilmCalc app shell — rebuilt for the "FilmCalc Redesign" mockup, not
// retrofitted onto the old one. Plain global functions, no bundler, same
// pattern as the rest of js/*.js: shares index.html's global scope via
// <script src>. Wholly replaces the old tab-based UI (index.html's own
// inline script, js/film-lookup.js, js/dev-cost-ui.js, js/modals.js,
// js/themes.js, js/select-filter.js, js/i18n.js) with a single
// view-switching shell whose visual design and state machine come from
// that mockup. Reuses js/dev-cost-calc.js's pure calculation engine
// unchanged — this file is presentation + state only, no duplicated math.
//
// Deliberately dropped from the old app (none of these are depicted in
// the redesign mockup, and re-threading them through 1600+ lines of
// Tailwind-classed, DOM-ID-coupled modal markup would mean building a
// second, hidden UI behind this one just to host them):
//   - The 10-locale i18n system (js/i18n.js) — every string here is a
//     plain literal, matching the mockup, which is English-only itself.
//   - The 11 accessibility/colour theme YAML files (js/themes.js) — this
//     UI has one dark palette, fixed (no user-configurable accent picker;
//     each section heading gets its own fixed colour instead — see
//     SECTION_COLORS). Dark/light toggle exists in the header for parity
//     with the mockup, but (same as the mockup itself) no light palette
//     is defined yet.
//   - Changelog popup, "Add via AI" modal, generic YAML file-drop import.
// Still preserved, just re-implemented against this file's own state
// instead of the old DOM: JSON backup export/import, region-file preset
// import (films/labs index.json + per-region YAML), hide/edit/delete for
// saved films and labs, home lab + preferred tier + mail-back settings,
// and self-hosted config.yaml auto-load.

// ---------- Small shared helpers (moved from the old index.html) ----------
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// For a value embedded as a single-quoted JS-string argument inside an
// onclick="..." attribute (e.g. onclick="App.editFilm('${jsAttr(key)}')").
// escapeHtml() alone isn't enough there: the browser HTML-decodes the
// attribute (turning &#39; back into ') before handing it to the JS
// engine as the handler body, so a name/key containing a literal quote
// closes the string early — and a name like `x'); alert(1); //` becomes
// live, executing JS in the page. Backslash-escape quotes/backslashes for
// the JS-string layer first, then HTML-escape the result for the
// attribute layer, so both the browser's HTML parser and the JS parser
// see the value as inert data.
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
function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function CUR() { return escapeHtml(localStorage.getItem('currencySymbol') || '$'); }

// ---------- Built-in defaults (self-hosted config.yaml — empty on GitHub Pages) ----------
let defaultFilms = {};
let defaultLabs = {};
let configSettings = {};
function getAllFilms() { return { ...defaultFilms, ...readJSON('filmProfiles', {}) }; }
function getAllLabs() { return { ...defaultLabs, ...readJSON('labProfiles', {}) }; }

async function loadDefaults() {
    try {
        const res = await fetch('config.yaml');
        if (res.ok) {
            const parsed = jsyaml.load(await res.text()) || {};
            (parsed.films || []).forEach(f => { defaultFilms[filmKey(f.name, f.boxSpeed, f.format)] = f; });
            (parsed.labs || []).forEach(l => { defaultLabs[l.name] = l; });
            configSettings = parsed.settings || {};
        }
    } catch (e) { console.error('Error loading config.yaml', e); }
    if (localStorage.getItem('upgradeThresholdPercent') === null && configSettings.upgradeThresholdPercent !== undefined) {
        localStorage.setItem('upgradeThresholdPercent', configSettings.upgradeThresholdPercent);
    }
    render();
}

// ---------- Format / process option lists (options.yaml, with a fallback) ----------
let FORMAT_OPTIONS = [
    { value: '35mm', label: '35mm' }, { value: '120', label: '120' },
    { value: '110', label: '110' }, { value: '127', label: '127' },
    { value: '220', label: '220' }, { value: 'sheet', label: 'Sheet' }
];
let PROCESS_OPTIONS = [
    { value: 'C41', label: 'C-41' }, { value: 'BW', label: 'B&W' },
    { value: 'E6', label: 'E-6' }, { value: 'ECN2', label: 'ECN-2' }
];
// The everyday film-lookup dropdown — what the image looks like, not the
// development chemistry (see filmColorType() in js/dev-cost-calc.js). Kept
// separate from PROCESS_OPTIONS/state.process, which now lives under
// "Extra fees / Advanced" as Development Type and still drives actual lab
// tier matching, since that's genuinely chemistry-specific (a chromogenic
// B&W stock like Ilford XP2 Super develops in C-41, not BW chemistry).
const FILM_TYPE_OPTIONS = [{ value: 'color', label: 'Color' }, { value: 'bw', label: 'B&W' }, { value: 'speciality', label: 'Speciality' }];
// [code, native-name] — every locale in js/i18n.js's STRINGS object needs an
// entry here too, or it's translated but unreachable from either language
// picker (Settings and the first-run Setup wizard both read this same list).
const LANGUAGE_OPTIONS = [
    ['en', 'English'], ['es', 'Español'], ['ja', '日本語'], ['de', 'Deutsch'], ['pt', 'Português (BR)'],
    ['fr', 'Français'], ['ko', '한국어'], ['zh', '中文 (简体)'], ['it', 'Italiano'], ['ru', 'Русский']
];
// Speciality stocks (redscale, Harman Phoenix, Switch Azure, …) are
// virtually always C-41 in practice, same as plain color — still just a
// default, override-able same as the other two.
const DEV_TYPE_DEFAULT = { color: 'C41', bw: 'BW', speciality: 'C41' };
const PUSH_PULL_OPTIONS = [-3, -2, -1, 0, 1, 2, 3];
async function loadOptions() {
    try {
        const res = await fetch('options.yaml');
        if (res.ok) {
            const parsed = jsyaml.load(await res.text());
            if (Array.isArray(parsed?.formats) && parsed.formats.length) {
                FORMAT_OPTIONS = parsed.formats.map(o => ({ value: String(o.value), label: String(o.label ?? o.value) }));
            }
            if (Array.isArray(parsed?.processes) && parsed.processes.length) {
                PROCESS_OPTIONS = parsed.processes.map(o => ({ value: String(o.value), label: String(o.label ?? o.value) }));
            }
        }
    } catch { /* keep fallback defaults */ }
}

// ---------- 120 camera back / 35mm frame size ----------
// 120's frame count depends on the camera back, not the film stock; 35mm's
// depends on whether the camera is half-frame/full-frame/XPan. Both are a
// session preference (like the theme), never saved onto a film's own record.
const FRAME120 = { '6x4.5': 16, '6x6': 12, '6x7': 10, '6x8': 9, '6x9': 8, '6x12': 6, '6x17': 4 };
const FRAME35 = { full: { label: 'Full frame', factor: 1 }, half: { label: 'Half frame', factor: 2 }, xpan: { label: 'XPan', factor: 0.583 } };

// ---------- Favourites (used by the Setup wizard, kept from js/modals.js) ----------
let favouriteLabs = new Set(readJSON('favouriteLabs', []));
let favouriteFilms = new Set(readJSON('favouriteFilms', []));
function isFavLab(name) { return favouriteLabs.has(name); }
function isFavFilm(key) { return favouriteFilms.has(key); }
function toggleFavFilm(key) {
    if (favouriteFilms.has(key)) favouriteFilms.delete(key); else favouriteFilms.add(key);
    writeJSON('favouriteFilms', [...favouriteFilms]);
}
function toggleFavLab(name) {
    if (favouriteLabs.has(name)) favouriteLabs.delete(name); else favouriteLabs.add(name);
    writeJSON('favouriteLabs', [...favouriteLabs]);
}
function labDirectionsUrl(labName) {
    const lab = getAllLabs()[labName];
    if (!lab || !lab.address) return '';
    return 'https://maps.google.com/?q=' + encodeURIComponent(lab.address);
}

const turnaroundLabels = { next_day: 'Next day', same_week: 'Same week', longer: 'Longer' };
// Human label for a service tier that was never given one (older/community
// data has no `label` field) — used as its identity for "preferred tier"
// matching and shown wherever a tier needs a name.
function tierDescription(tier) {
    const parts = [];
    if (tier.highResScan) parts.push('Hi-res');
    if (tier.tiffScan) parts.push('TIFF');
    parts.push(turnaroundLabels[tier.turnaroundTime] || tier.turnaroundTime || 'Same week');
    return parts.join(' · ') || 'Service';
}

// ---------- Home lab / preferred tier (Settings + Setup) ----------
function getHomeLab() { return localStorage.getItem('homeLab') || ''; }
function setHomeLab(name) { localStorage.setItem('homeLab', name || ''); }
function getDefaultTierLabel() { return localStorage.getItem('defaultTierLabel') || ''; }
function setDefaultTierLabel(label) { localStorage.setItem('defaultTierLabel', label || ''); }
// Back-compat with the old { lab, tierIndex } pref the Setup modal wrote —
// migrated once into the new homeLab/defaultTierLabel keys.
function migrateLegacyDefaultLabPref() {
    if (localStorage.getItem('homeLab') !== null) return;
    const legacy = readJSON('defaultLabPref', null);
    if (!legacy || !legacy.lab) return;
    setHomeLab(legacy.lab);
    const lab = getAllLabs()[legacy.lab];
    if (lab) {
        const raw = Array.isArray(lab.services) && lab.services.length ? lab.services : [lab];
        const tiers = normalizeLabServices(lab);
        const t = tiers[legacy.tierIndex];
        const rawT = raw[legacy.tierIndex];
        if (t) setDefaultTierLabel((rawT && rawT.label) || tierDescription(t));
    }
}

// ---------- App state ----------
const state = {
    view: 'main', // main | expired | library | settings
    draft: null, draftKind: null, draftKey: null,
    setupOpen: false, setupStep: 0, // 0=language, 1=import presets, 2=home lab
    extrasOpen: false, expandedLab: null, expandedFilm: null,
    format: localStorage.getItem('globalFormat') || '35mm',
    process: localStorage.getItem('globalProcess') || 'C41',
    // Named filmColor, NOT filmType — state.filmType already exists below,
    // owned by the Expired Film calculator ('c41'/'bw'/'e6', a different
    // concept). Reusing that key here silently collided: the second
    // `filmType:` in this same object literal won the init value, and every
    // onchange/onclick sharing App.setField('filmType', …) fought over one
    // slot instead of two.
    filmColor: localStorage.getItem('globalFilmColor') || 'color',
    boxSpeed: '', pushPull: '0', packCost: '', postage: '', rolls: '1', exposures: '36',
    onceOff: '', perRoll: '',
    frame35: localStorage.getItem('globalCamera35Type') || 'full',
    frame120: localStorage.getItem('globalCamera120Type') || '6x7',
    fHiRes: readJSON('reqFilters', {}).hiRes || false,
    fTiff: readJSON('reqFilters', {}).tiff || false,
    fRush: readJSON('reqFilters', {}).rush || false,
    fMail: readJSON('reqFilters', {}).mail || false,
    fWeek: readJSON('reqFilters', {}).week || false,
    isoFilter: 'shoot',
    loadedFilmKey: '',
    mailRolls: localStorage.getItem('mailBackRollCount') || '1',
    upgradePct: localStorage.getItem('upgradeThresholdPercent') || '4',
    libProcess: 'all', libFormat: 'all', libTab: 'films', libSearch: '',
    dark: localStorage.getItem('lightMode') !== '1',
    expBox: '400', expiryMonth: String(new Date().getMonth() + 1), expiryYear: '', filmType: 'c41', storage: 'controlled',
    importNote: '',
    // Mobile-shell-only fields (harmless on desktop, which never reads them).
    menuOpen: false, toast: '', allowPushPull: true
};
let toastTimer = null;
function flash(msg) {
    state.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = ''; render(); }, 1800);
}
function persistFilters() {
    writeJSON('reqFilters', { hiRes: state.fHiRes, tiff: state.fTiff, rush: state.fRush, mail: state.fMail, week: state.fWeek });
}

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function money(n) { return (n || 0).toFixed(2); }

function pushPullStops(s) { return parseInt(s.pushPull) || 0; }
// The ISO the roll is actually shot at, derived from Box Speed + the
// push/pull stops selector — replaces the old free-text "Shooting at
// (Target ISO)" field, which this ISO is still shown/used as internally.
function effectiveShootIso(s) {
    const box = parseFloat(s.boxSpeed);
    if (!box) return 0;
    return Math.round(box * Math.pow(2, pushPullStops(s)));
}

function currentExposuresPerRoll(s) {
    if (s.format === '120') return FRAME120[s.frame120] || 12;
    const factor = (FRAME35[s.frame35] || FRAME35.full).factor;
    return Math.max(1, Math.round((Math.round(num(s.exposures)) || 36) * factor));
}

function camOverrideExposures(s) {
    return s.format === '120' ? (FRAME120[s.frame120] || null) : null;
}

function mailOpts(s) {
    return { includeMailBack: !!s.fMail, mailBackRollCount: Math.max(1, parseInt(s.mailRolls) || 1), mailToLabFee: 0 };
}

function tierWhy(t, s, stopsAbs) {
    if (!tierMatchesFilmProcess(t, { process: s.process })) return 'not ' + (PROCESS_OPTIONS.find(o => o.value === s.process)?.label || s.process);
    if (s.fHiRes && !t.highResScan) return 'not hi-res';
    if (s.fTiff && !t.tiffScan) return 'no TIFF';
    if (s.fRush && t.turnaroundTime !== 'next_day') return 'not next day';
    if (s.fWeek && t.turnaroundTime === 'longer') return 'slower than a week';
    if (s.fMail && t.mailBackCost === null) return 'no mail-back';
    if (stopsAbs > 0 && t.noPushPull) return 'no push/pull';
    return '';
}

function pushFeeFor(t, stopsAbs) {
    if (!stopsAbs || t.noPushPull) return 0;
    return t.pushPullType === 'flat' ? t.pushPullCost : t.pushPullCost * stopsAbs;
}

// Ranks every saved (non-hidden) lab for the roll currently entered on the
// main view. Mirrors js/film-lookup.js's updateLabComparison() math, but
// picks each lab's *preferred* tier (Settings > Preferred service tier,
// matched by label) ahead of its cheapest qualifying one, and returns
// structured data for the new template instead of building HTML strings.
function rankLabs(s) {
    const rolls = Math.max(1, Math.round(num(s.rolls)) || 1);
    const stopsSigned = pushPullStops(s);
    const stopsAbs = Math.abs(stopsSigned);
    const filmPerRoll = num(s.packCost) / rolls + num(s.postage) / rolls + num(s.perRoll) + num(s.onceOff) / rolls;
    const exp = currentExposuresPerRoll(s);
    const allLabs = getAllLabs();
    const opts = mailOpts(s);
    const preferredLabel = getDefaultTierLabel();

    const ranked = Object.keys(allLabs).filter(n => !allLabs[n].hidden).map(name => {
        const lab = allLabs[name];
        const rawTiers = Array.isArray(lab.services) && lab.services.length ? lab.services : [lab];
        const tiers = normalizeLabServices(lab).map((t, i) => {
            const label = (rawTiers[i] && rawTiers[i].label) || tierDescription(t);
            const why = tierWhy(t, s, stopsAbs);
            const pushFee = pushFeeFor(t, stopsAbs);
            const mailFee = effectiveMailBackFee(t, opts);
            return { ...t, label, why, ok: !why, pushFee, mailFee, cost: t.devCost + pushFee + mailFee };
        });
        const okTiers = tiers.filter(t => t.ok).sort((a, b) => a.cost - b.cost);
        const pick = (preferredLabel && okTiers.find(t => t.label === preferredLabel)) || okTiers[0];
        if (!pick) return null;
        const roll = pick.cost + filmPerRoll;
        return { name, lab, tiers, pick, cheapestTier: okTiers[0], roll, cpp: roll / exp, devCpp: pick.cost / exp, filmPerRoll };
    }).filter(Boolean).sort((a, b) => a.cpp - b.cpp);

    return { ranked, filmPerRoll, exp, stopsSigned, stopsAbs };
}

// Every saved film stock able to shoot at the current target ISO, priced at
// the home lab (falling back to cheapest) including whatever push/pull fee
// it takes to get there. Mirrors js/dev-cost-calc.js's
// computeIsoPriceOptions(), simplified to one lab at a time (the home lab)
// instead of "best lab per film" — the new design shows one ranked list
// under one lab context, not a per-film lab search.
function computeFilmRows(s, home) {
    const allFilms = getAllFilms();
    const shootIso = effectiveShootIso(s) || num(s.boxSpeed);
    const camOverride = camOverrideExposures(s);
    const rows = Object.values(allFilms).filter(f => !f.hidden && (f.format || '35mm') === s.format && filmColorType(f) === s.filmColor).map(f => {
        const boxSpeed = parseFloat(f.boxSpeed) || 0;
        if (!boxSpeed) return null;
        const stopsSigned = shootIso ? Math.round(Math.log2(shootIso / boxSpeed)) : 0;
        const stopsAbs = s.isoFilter === 'shoot' ? Math.abs(stopsSigned) : 0;
        if (s.isoFilter === 'shoot' && Math.abs(stopsSigned) > 2) return null;
        if (s.isoFilter !== 'shoot' && s.isoFilter !== 'all' && String(boxSpeed) !== s.isoFilter) return null;

        let bestBundle = null, bestCpp = null;
        const bundles = normalizeFilmBundles(f, camOverride);
        bundles.forEach(b => {
            const cpp = computeCostPerPhoto(b.filmCost, b.rolls, b.exposures);
            if (cpp !== null && cpp > 0 && (bestCpp === null || cpp < bestCpp)) { bestCpp = cpp; bestBundle = b; }
        });
        if (!bestBundle) return null;

        const devPerRoll = home ? home.pick.devCost + pushFeeFor(home.pick, stopsAbs) + home.pick.mailFee : 0;
        const perFrame = (bestBundle.filmCost / bestBundle.rolls + devPerRoll) / bestBundle.exposures;
        return { f, bundle: bestBundle, bundles, stopsAbs, dir: stopsSigned > 0 ? 'push' : 'pull', packPrice: bestBundle.filmCost, perRoll: bestBundle.filmCost / bestBundle.rolls, perFrame, exposures: bestBundle.exposures };
    }).filter(Boolean).sort((a, b) => (a.stopsAbs === 0 ? 0 : 1) - (b.stopsAbs === 0 ? 0 : 1) || a.stopsAbs - b.stopsAbs || a.perRoll - b.perRoll);
    return rows;
}

// The cheapest saved film stock, re-costed at the home lab (+ whatever
// push/pull it needs) to reach the current shooting ISO — a "you could pay
// less" nudge. Mirrors js/film-lookup.js's updateCheaperAlternative().
// Returns up to two options: the cheapest at native box speed, and the
// cheapest reachable by pushing/pulling (within that stock's own
// maxPushPull), so a box-speed option doesn't get hidden behind a
// marginally-cheaper push/pull one or vice versa.
function computeCheaperFilm(s, home) {
    const target = effectiveShootIso(s) || num(s.boxSpeed);
    const loaded = getAllFilms()[s.loadedFilmKey];
    const curCpp = home ? home.cpp : null;
    if (!target || !home) return { has: false, label: `Cheapest film at ISO ${target || '—'}`, text: 'Enter a box speed to compare.', options: [] };

    const camOverride = camOverrideExposures(s);
    let bestNative = null, bestPushPull = null;
    Object.values(getAllFilms()).filter(f => !f.hidden && (f.format || '35mm') === s.format && filmColorType(f) === s.filmColor).forEach(f => {
        const boxSpeed = parseFloat(f.boxSpeed) || 0;
        if (!boxSpeed) return;
        const stopsSigned = Math.round(Math.log2(target / boxSpeed));
        const stopsAbs = Math.abs(stopsSigned);
        const maxPushPull = parseFloat(f.maxPushPull ?? 1);
        if (stopsAbs > maxPushPull) return;
        let bestBundle = null, bestCpp = null;
        normalizeFilmBundles(f, camOverride).forEach(b => {
            const cpp = computeCostPerPhoto(b.filmCost, b.rolls, b.exposures);
            if (cpp !== null && cpp > 0 && (bestCpp === null || cpp < bestCpp)) { bestCpp = cpp; bestBundle = b; }
        });
        if (!bestBundle) return;
        const dev = home.pick.devCost + pushFeeFor(home.pick, stopsAbs) + home.pick.mailFee;
        const cpp = (bestBundle.filmCost / bestBundle.rolls + dev) / bestBundle.exposures;
        const cand = { f, bundle: bestBundle, stopsSigned, stopsAbs, cpp };
        if (stopsAbs === 0) { if (!bestNative || cpp < bestNative.cpp) bestNative = cand; }
        else if (!bestPushPull || cpp < bestPushPull.cpp) bestPushPull = cand;
    });

    const mk = (key, cand) => {
        if (!cand || curCpp === null || !(cand.cpp < curCpp - 0.005)) return null;
        return {
            key,
            text: `${cand.f.name} — ${CUR()}${money(cand.cpp)}/frame from ${cand.bundle.storeName || 'saved library'}, saves ${((curCpp - cand.cpp) * 100).toFixed(0)}c a frame${cand.stopsAbs ? ` (${cand.stopsAbs} stop ${cand.stopsSigned > 0 ? 'push' : 'pull'})` : ''}`,
            url: sanitizeUrl(cand.bundle.buyLink), load: () => App.loadFilm(filmKey(cand.f.name, cand.f.boxSpeed, cand.f.format))
        };
    };
    const options = [mk('native', bestNative), mk('pushPull', bestPushPull)].filter(Boolean);
    if (options.length) return { has: true, label: `Cheaper film at ISO ${target}`, options };
    return { has: false, label: `Cheapest film at ISO ${target}`, text: loaded ? 'Nothing in your library beats what you have loaded.' : 'Nothing in your library beats what you have entered.', options: [] };
}

function computeExpired(s) {
    const boxSpeed = num(s.expBox) || 400;
    const month = Math.min(12, Math.max(1, parseInt(s.expiryMonth) || 1));
    const year = parseInt(s.expiryYear, 10);
    if (!year) return { rated: 'ISO —', note: 'Enter an expiry year', ageNote: 'enter a year' };
    const now = new Date();
    const yearsExpired = Math.max(0, (now.getFullYear() - year) + (now.getMonth() + 1 - month) / 12);
    const YEARS_PER_STOP = { c41: { cold: 15, controlled: 10, uncontrolled: 5 }, bw: { cold: 20, controlled: 13, uncontrolled: 7 }, e6: { cold: 10, controlled: 7, uncontrolled: 3 } };
    const yearsPerStop = (YEARS_PER_STOP[s.filmType] || YEARS_PER_STOP.c41)[s.storage] || YEARS_PER_STOP.c41.controlled;
    const ageStopsLoss = yearsExpired / yearsPerStop;
    const highSpeedStops = boxSpeed > 400 ? Math.floor(Math.log2(boxSpeed / 400)) * 0.5 : 0;
    const stopsLoss = Math.round((ageStopsLoss + highSpeedStops) * 2) / 2;
    const rated = Math.max(1, Math.round(boxSpeed / Math.pow(2, stopsLoss)));
    return { rated: 'ISO ' + rated, note: `${stopsLoss.toFixed(1)} stops of compensation`, ageNote: `${yearsExpired.toFixed(1)} yrs past expiry` };
}

// ==================== Rendering ====================
// Visual language ported from "FilmCalc Redesign.dc.html" — same colors,
// type, spacing. Whole-view re-render on every state change (innerHTML
// replace), same as the source mockup; interactivity is wired via
// onclick/oninput/onchange strings calling into the global `App` object
// below, since there's no framework here to bind real closures.
const MONO = "font-family:'IBM Plex Mono',monospace";
const NARROW = "font-family:'Archivo Narrow',Archivo,sans-serif";
// Each of the three main section headings gets its own fixed colour
// (heading text + the dot beside it) instead of the shared --acc, so
// which section you're in stays legible while scrolling past one long
// page — a companion to making the headings themselves bigger.
const SECTION_COLORS = { lookup: '#ff7a2f', labs: '#5fa8d3', films: '#8fbf6a' };
function btnTone(on, color) { return on ? { bg: '#1c1512', border: '#5a3a1c', color: color || 'var(--acc)' } : { bg: '#141416', border: '#2c2c30', color: '#8b8781' }; }
function pill(label, on, onclick, color) {
    const b = btnTone(on, color);
    return `<button type="button" onclick="${onclick}" style="background:${b.bg};border:1px solid ${b.border};border-radius:20px;padding:5px 11px;color:${b.color};font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">${escapeHtml(label)}</button>`;
}


// The 5 "Requires" filter chips map 1:1 onto tierWhy()'s checks above — a
// tier only qualifies when it satisfies every filter that's on.
function requireFilters() {
    return [
        { key: 'fHiRes', label: t('v2FilterHiRes') },
        { key: 'fTiff', label: t('v2FilterTiff') },
        { key: 'fRush', label: t('v2FilterNextDay') },
        { key: 'fWeek', label: t('v2FilterSameWeek') },
        { key: 'fMail', label: t('v2LabelMailBack') }
    ];
}

function procLabel(v) { return (PROCESS_OPTIONS.find(o => o.value === v) || {}).label || v; }
function formatLabel(v) { return (FORMAT_OPTIONS.find(o => o.value === v) || {}).label || v; }
function filmTypeLabel(v) { return (FILM_TYPE_OPTIONS.find(o => o.value === v) || {}).label || v; }

const FIELD_INPUT = "width:100%;box-sizing:border-box;background:#1a1a1d;border:1px solid #33333a;border-radius:4px;padding:7px 9px;color:#eae7e1;font-size:13px";
const TURNAROUND_OPTIONS = [{ value: 'next_day', label: 'Next day' }, { value: 'same_week', label: 'Same week' }, { value: 'longer', label: 'Longer' }];

// ---------- Starter presets (films/index.json + labs/index.json) ----------
// The region YAML files under films/ and labs/ are community-contributed
// retailer/lab price lists — opt-in reference data, not global defaults,
// since a Melbourne lab is meaningless to a US visitor. Fetched lazily the
// first time Settings → Data is opened, cached for the session.
let presetFilmIndex = null, presetLabIndex = null;
async function loadPresetIndexes() {
    if (presetFilmIndex && presetLabIndex) return;
    try { presetFilmIndex = await (await fetch('films/index.json')).json(); } catch { presetFilmIndex = []; }
    try { presetLabIndex = await (await fetch('labs/index.json')).json(); } catch { presetLabIndex = []; }
    render();
}

const SECTION_STYLE = "border-top:1px solid #212125;background:#131315;padding:12px 14px";
function settingsSection(title, body) {
    return `<div style="${SECTION_STYLE}"><div style="font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#8b8781;margin-bottom:10px">${title}</div>${body}</div>`;
}

function renderSettingsView(s) {
    const labNames = Object.keys(getAllLabs());
    const tierLabels = [...new Set(Object.values(getAllLabs()).flatMap(l => normalizeLabServices(l).map((t, i) => ((Array.isArray(l.services) ? l.services : [l])[i] || {}).label || tierDescription(t))))];
    const hidden = [
        ...Object.entries(getAllFilms()).filter(([, f]) => f.hidden).map(([key, f]) => ({ kind: 'film', key, name: f.name })),
        ...Object.entries(getAllLabs()).filter(([, l]) => l.hidden).map(([key, l]) => ({ kind: 'lab', key, name: l.name }))
    ];
    return `<div style="padding:16px 18px 20px;display:flex;flex-direction:column;gap:1px;border:1px solid #26262a;border-radius:8px;overflow:hidden">
${settingsSection(t('v2SettingsLanguage'), `
<select onchange="App.setLanguage(this.value)" style="${FIELD_INPUT};max-width:280px;margin-bottom:8px">
${LANGUAGE_OPTIONS.map(([code, label]) => `<option value="${code}" ${currentLocale === code ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
</select>
<div style="font-size:10px;color:#5f5c57">${escapeHtml(t('translationDisclaimer'))}</div>
`)}
${settingsSection(t('v2SettingsHomeLab'), `
<select onchange="App.setHomeLab(this.value)" style="${FIELD_INPUT};max-width:280px;margin-bottom:10px">
<option value="">No home lab set</option>
${labNames.map(n => `<option value="${escapeHtml(n)}" ${s.homeLab === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
</select>
<div style="font-size:10px;color:#5f5c57;margin-bottom:8px">The lab whose price is shown as the headline cost per frame on every lookup.</div>
<select onchange="App.setDefaultTier(this.value)" style="${FIELD_INPUT};max-width:280px">
<option value="">Cheapest that qualifies</option>
${tierLabels.map(l => `<option value="${escapeHtml(l)}" ${s.defaultTier === l ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
</select>
<div style="font-size:10px;color:#5f5c57;margin-top:6px">Preferred service tier — used whenever a lab offers it, otherwise its cheapest qualifying tier.</div>
`)}
${settingsSection(t('v2SettingsCalculator'), `
<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
<div><div style="font-size:10px;color:#8b8781;margin-bottom:5px">${t('v2SettingsMailRolls')}</div><input value="${s.mailRolls}" oninput="App.setSetting('mailRolls',this.value)" data-fkey="mailRolls" inputmode="numeric" style="${FIELD_INPUT};width:80px;${MONO}"></div>
<div><div style="font-size:10px;color:#8b8781;margin-bottom:5px">${t('v2SettingsUpgradePct')}</div><input value="${s.upgradePct}" oninput="App.setSetting('upgradePct',this.value)" data-fkey="upgradePct" inputmode="decimal" style="${FIELD_INPUT};width:80px;${MONO}"></div>
</div>
`)}
${settingsSection(t('v2SettingsHiddenPresets'), `
<div style="font-size:10px;color:#5f5c57;margin-bottom:8px">${hidden.length} hidden</div>
${hidden.length ? hidden.map(h => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #212125">
<span style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#5f5c57;width:36px">${h.kind === 'film' ? t('v2SectionFilms') : t('v2SectionLabs')}</span>
<span style="flex:1;font-size:12px;color:#c9c5bd">${escapeHtml(h.name)}</span>
<button type="button" onclick="App.toggleHidden('${h.kind}','${jsAttr(h.key)}')" style="background:#1a1a1d;border:1px solid #33333a;border-radius:4px;padding:4px 9px;color:#8b8781;font-size:9px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">${t('v2ButtonShow')}</button>
</div>`).join('') : `<div style="font-size:11px;color:#5f5c57">Nothing hidden. Hide a film or lab in the library to keep it out of lookups without deleting it.</div>`}
`)}
${settingsSection(t('v2SettingsStarterPresets'), renderPresetImport())}
${settingsSection(t('v2SettingsData'), `
<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
<button type="button" onclick="App.exportBackup()" style="background:#141416;border:1px solid #2c2c30;border-radius:5px;padding:6px 11px;color:#8b8781;font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">${t('v2ButtonExportBackup')}</button>
<label style="background:#141416;border:1px solid #2c2c30;border-radius:5px;padding:6px 11px;color:#8b8781;font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">${t('v2ButtonImportBackup')}<input type="file" accept="application/json" onchange="App.importBackup(this.files[0])" style="display:none"></label>
<label style="background:#141416;border:1px solid #2c2c30;border-radius:5px;padding:6px 11px;color:#8b8781;font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">${t('v2ButtonImportYaml')}<input type="file" accept=".yaml,.yml,text/yaml" onchange="App.importYamlFile(this.files[0])" style="display:none"></label>
<button type="button" onclick="App.openSetup()" style="background:#141416;border:1px solid #2c2c30;border-radius:5px;padding:6px 11px;color:#8b8781;font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">${t('v2ButtonRerunSetup')}</button>
<button type="button" onclick="App.deleteAllData()" style="background:transparent;border:1px solid #5a2420;border-radius:5px;padding:6px 11px;color:#e2564a;font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">${t('v2ButtonDeleteAllData')}</button>
</div>
<div style="font-size:10px;color:#8b8781;min-height:12px">${escapeHtml(s.importNote)}</div>
<div style="margin-top:10px;font-size:10px;color:#5f5c57">Drag <a href="javascript:void(window.open('https://filmcalc.app/?add='+encodeURIComponent(location.href)))" style="cursor:move">↗ Add to FilmCalc</a> to your bookmarks bar — click it from any shop or lab page to jump back here with that page's link ready to paste in.</div>
`)}
</div>`;
}

// First-run onboarding, also reachable from Settings → Data → "Re-run
// setup". Kept deliberately small — home lab, preferred tier, language —
// everything else already has its own home in Settings.
// Three steps, in this order because each depends on the previous one
// having happened: presets need to import BEFORE the home-lab step so
// that dropdown actually has labs in it (it used to sit next to the
// import controls on one page, so a brand new user always saw it blank —
// nothing had been imported yet at the point it rendered).
const SETUP_STEPS = ['language', 'presets', 'homeLab'];
function renderSetupModal(s) {
    const step = SETUP_STEPS[s.setupStep] || 'language';
    const labNames = Object.keys(getAllLabs());
    const tierLabels = [...new Set(Object.values(getAllLabs()).flatMap(l => normalizeLabServices(l).map((t, i) => ((Array.isArray(l.services) ? l.services : [l])[i] || {}).label || tierDescription(t))))];
    const dots = SETUP_STEPS.map((_, i) => `<span style="width:6px;height:6px;border-radius:50%;background:${i === s.setupStep ? 'var(--acc)' : '#33333a'}"></span>`).join('');
    let stepTitle, stepBody;
    if (step === 'language') {
        stepTitle = t('v2SetupStepLanguage');
        stepBody = `<select onchange="App.setLanguage(this.value)" style="${FIELD_INPUT}">
${LANGUAGE_OPTIONS.map(([code, label]) => `<option value="${code}" ${currentLocale === code ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
</select>`;
    } else if (step === 'presets') {
        stepTitle = t('v2SetupStepImport');
        stepBody = `<div style="border:1px solid #26262a;border-radius:8px;background:#131315;padding:12px">
${renderPresetImport(false)}
<div style="margin-top:10px;padding-top:10px;border-top:1px solid #212125">
<label style="display:inline-flex;align-items:center;background:#141416;border:1px solid #2c2c30;border-radius:5px;padding:6px 11px;color:#8b8781;font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">${t('v2ButtonImportYaml')}<input type="file" accept=".yaml,.yml,text/yaml" onchange="App.importYamlFile(this.files[0])" style="display:none"></label>
</div>
${s.importNote ? `<div style="margin-top:8px;font-size:10px;color:#8b8781">${escapeHtml(s.importNote)}</div>` : ''}
</div>`;
    } else {
        stepTitle = t('v2SetupStepHomeLab');
        stepBody = `<div style="display:flex;flex-direction:column;gap:14px">
<div>
<div style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#8b8781;margin-bottom:6px">${t('v2SettingsHomeLab')}</div>
<select onchange="App.setHomeLab(this.value)" style="${FIELD_INPUT}">
<option value="">—</option>
${labNames.map(n => `<option value="${escapeHtml(n)}" ${s.homeLab === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
</select>
${!labNames.length ? `<div style="margin-top:6px;font-size:10px;color:#5f5c57">${t('v2SetupNoLabsYet')}</div>` : ''}
</div>
<div>
<div style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#8b8781;margin-bottom:6px">${t('v2SetupPreferredTier')}</div>
<select onchange="App.setDefaultTier(this.value)" style="${FIELD_INPUT}">
<option value="">Cheapest that qualifies</option>
${tierLabels.map(l => `<option value="${escapeHtml(l)}" ${s.defaultTier === l ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
</select>
</div>
</div>`;
    }
    const backBtn = s.setupStep > 0 ? `<button type="button" onclick="App.setupGoto(${s.setupStep - 1})" style="flex:1;background:#141416;border:1px solid #2c2c30;border-radius:5px;padding:9px 16px;color:#8b8781;font-size:11px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">${t('v2ButtonBack')}</button>` : '';
    // On the presets step, Next both imports whatever's ticked AND
    // advances — no separate "Import selected" click needed first.
    const nextAction = step === 'presets' ? 'App.setupNextFromPresets()' : `App.setupGoto(${s.setupStep + 1})`;
    const nextBtn = s.setupStep < SETUP_STEPS.length - 1
        ? `<button type="button" onclick="${nextAction}" style="flex:2;background:#1c1512;border:1px solid #5a3a1c;border-radius:5px;padding:9px 16px;color:var(--acc);font-size:11px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">${t('v2ButtonNext')}</button>`
        : `<button type="button" onclick="App.closeSetup()" style="flex:2;background:#1c1512;border:1px solid #5a3a1c;border-radius:5px;padding:9px 16px;color:var(--acc);font-size:11px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">${t('v2ButtonDone')}</button>`;
    return `<div style="position:fixed;inset:0;z-index:70;background:rgba(6,6,7,.74);display:flex;align-items:flex-start;justify-content:center;padding:64px 16px;overflow:auto"><div style="width:100%;max-width:460px;background:linear-gradient(180deg,#151517,#111113);border:1px solid #33333a;border-radius:10px;box-shadow:0 30px 80px -20px #000;padding:18px 20px 20px">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
<div style="${NARROW};font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#eae7e1">${t('v2SetupTitle')}</div>
<div style="display:flex;align-items:center;gap:5px">${dots}</div>
</div>
<p style="margin:0 0 14px;font-size:12px;color:#6d6a64">${t('v2SetupIntro')}</p>
<div style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#8b8781;margin-bottom:8px">${stepTitle}</div>
${stepBody}
<div style="display:flex;gap:10px;margin-top:18px">${backBtn}${nextBtn}</div>
</div></div>`;
}

// Checkboxes rather than a single-choice <select> — a user setting up
// FilmCalc for, say, Melbourne wants both the Melbourne AND the
// Australia-wide retailer files in one go, not one picked-import-repick
// cycle per file (issue: the old single-select forced exactly one region
// at a time).
function presetCheckList(kind, entries) {
    return entries.map(f => `<label style="display:flex;align-items:center;gap:8px;padding:6px 2px;font-size:12px;color:#c9c5bd;cursor:pointer"><input type="checkbox" class="preset-check" data-kind="${kind}" value="${escapeHtml(f.file)}" style="width:16px;height:16px;accent-color:var(--acc);cursor:pointer">${escapeHtml(f.label)}</label>`).join('');
}
// showImportButton: false on the Setup wizard's presets step, where Next
// itself imports whatever's ticked (see App.setupNextFromPresets) — a
// separate button there would just be a redundant extra click. Settings'
// own Starter Presets section has no such Next button, so it keeps one.
function renderPresetImport(showImportButton = true) {
    if (!presetFilmIndex || !presetLabIndex) { loadPresetIndexes(); return `<div style="font-size:11px;color:#5f5c57">Loading…</div>`; }
    // One combined "Import selected" button for both lists, not one per
    // list — importing re-renders the whole page, which would otherwise
    // wipe the checked state of whichever list's checkboxes weren't just
    // submitted (they're plain uncontrolled checkboxes, not tied to
    // state) — ticking films and labs, then importing once, is the only
    // way both actually make it in.
    return `<div style="font-size:10px;color:#5f5c57;margin-bottom:8px">Community-contributed regional film/lab price lists shipped with FilmCalc — tick any that apply to you (more than one is fine) to add real data instead of typing it all by hand.</div>
<div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#8b8781;margin-bottom:4px">Films</div>
<div style="display:flex;flex-direction:column;max-height:160px;overflow:auto;border:1px solid #26262a;border-radius:6px;padding:4px 8px;margin-bottom:10px">${presetCheckList('films', presetFilmIndex)}</div>
<div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#8b8781;margin-bottom:4px">Labs</div>
<div style="display:flex;flex-direction:column;max-height:160px;overflow:auto;border:1px solid #26262a;border-radius:6px;padding:4px 8px;margin-bottom:10px">${presetCheckList('labs', presetLabIndex)}</div>
${showImportButton ? `<button type="button" onclick="App.importPresetSelected()" style="background:#141416;border:1px solid #2c2c30;border-radius:5px;padding:6px 11px;color:#8b8781;font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">Import selected</button>` : ''}`;
}

// ---------- Merge helpers (ported from the old js/modals.js import path —
// pure data functions, no DOM, safe to duplicate in this presentation-only
// file rather than pull in the rest of that DOM-coupled module) ----------
function mergeFilmBundles(existing, incoming) {
    const keyOf = b => `${b.storeName || ''}|${b.rolls}|${b.exposures}`;
    const byKey = new Map((existing || []).map(b => [keyOf(b), b]));
    (incoming || []).forEach(b => byKey.set(keyOf(b), b));
    return [...byKey.values()];
}
function mergeFilmProfiles(saved, incoming) {
    Object.keys(incoming).forEach(key => {
        const existing = saved[key];
        saved[key] = (existing && Array.isArray(existing.bundles) && Array.isArray(incoming[key].bundles))
            ? { ...incoming[key], bundles: mergeFilmBundles(existing.bundles, incoming[key].bundles) }
            : incoming[key];
    });
    return saved;
}
function migrateFilmProfileKeys() {
    const saved = readJSON('filmProfiles', {});
    const remapped = {};
    let changed = false;
    Object.keys(saved).forEach(oldKey => {
        const film = saved[oldKey];
        if (!film || !film.name) return;
        const newKey = filmKey(film.name, film.boxSpeed, film.format);
        if (newKey !== oldKey) changed = true;
        if (remapped[newKey]) {
            remapped[newKey] = { ...film, bundles: mergeFilmBundles(remapped[newKey].bundles, film.bundles) };
            changed = true;
        } else {
            remapped[newKey] = film;
        }
    });
    if (changed) writeJSON('filmProfiles', remapped);
}

function renderFooter(s) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding:0 2px;flex-wrap:wrap">
<span style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#4a4844">FilmCalc</span>
<span style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#4a4844;${MONO}">${formatLabel(s.format)} · ${procLabel(s.process)}</span>
</div>`;
}
// ==================== Top-level render ====================
// Every state change does a full innerHTML replace (no framework, no
// virtual DOM) — the simplest thing that works for a form this size, but
// it destroys and recreates the currently-focused <input> on every single
// keystroke. On mobile that reads as "the keyboard closes as you type"
// (the OS dismisses the keyboard the instant the focused element is
// removed from the DOM), and on desktop it silently drops cursor
// position. Fix: every input/select this file renders that fires
// App.set*() on input/change carries a stable data-fkey identifying which
// field it is; capture the focused element's fkey + text selection right
// before the innerHTML swap, then refocus the matching element (by the
// same fkey) afterwards, restoring the caret. Deterministic because
// render() is a pure function of state — the field with a given fkey
// lands in the same place in the new markup as long as its position in
// state hasn't changed shape (e.g. a draft's bundle/tier array order).
function captureFocus(root) {
    const el = document.activeElement;
    if (!el || !root.contains(el) || !el.hasAttribute('data-fkey')) return null;
    const focus = { key: el.getAttribute('data-fkey') };
    if (typeof el.selectionStart === 'number') { focus.start = el.selectionStart; focus.end = el.selectionEnd; }
    return focus;
}
function restoreFocus(root, focus) {
    if (!focus) return;
    const el = root.querySelector(`[data-fkey="${focus.key}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (focus.start !== undefined && typeof el.setSelectionRange === 'function') {
        try { el.setSelectionRange(focus.start, focus.end); } catch { /* not a text-selectable input */ }
    }
}

// One markup tree (renderMobile()) for every viewport — desktop used to
// get a second, hand-written layout below this width, but a feature added
// to one tree routinely never made it to the other (e.g. push/pull).
// Centering the mobile shell in a capped-width column, rather than
// stretching it, is the "desktop" experience now. This column used to be
// `contain:layout`, on the theory that it'd scope position:fixed
// descendants (menu drawer, toast) to the column instead of the raw
// viewport — but `contain:layout` makes an element the *containing block*
// for those descendants, which redefines "fixed" as "fixed to this box",
// not just the box's left/right edges: the toast's `bottom:16px` measured
// from the bottom of the (content-height, not viewport-height) column
// instead of the screen, landing off-screen on any page taller than one
// viewport, and every such element scrolled away with the page instead of
// staying put. Dropped; the toast and menu drawer now do their own
// column-width clamping (see renderMobileToast/renderMobileMenu) while
// staying genuinely `position:fixed` to the viewport.
function render() {
    const root = document.getElementById('app');
    if (!root) return;
    const focus = captureFocus(root);
    // Light mode isn't a real second palette (every colour in this file is a
    // literal hex, not a CSS variable) — invert+hue-rotate the whole app
    // instead of re-deriving 350+ colours by hand. Filter lives on #app
    // itself (outside innerHTML) so it survives the re-render below.
    root.style.filter = state.dark ? '' : 'invert(1) hue-rotate(180deg)';
    root.innerHTML = `
<div style="min-height:100vh;display:flex;justify-content:center;background:#0b0b0c">
<div style="width:100%;max-width:960px;min-height:100vh">
${renderMobile(state)}
</div>
</div>`;
    restoreFocus(root, focus);
}

// ==================== Controller ====================
const App = {
    toggleDark() { state.dark = !state.dark; localStorage.setItem('lightMode', state.dark ? '0' : '1'); render(); },

    setField(key, value) {
        state[key] = value;
        // Switching Color/B&W resets Development Type to that type's usual
        // chemistry (C-41 for Color, BW for B&W) — the common case for
        // both. A chromogenic B&W stock like Ilford XP2 Super still needs
        // Development Type overridden to C-41 by hand afterwards, in Extra
        // fees / Advanced.
        if (key === 'filmColor') state.process = DEV_TYPE_DEFAULT[value] || 'C41';
        if (key === 'format' || key === 'process' || key === 'filmColor') persistScope();
        if (key === 'frame35') localStorage.setItem('globalCamera35Type', value);
        if (key === 'frame120') localStorage.setItem('globalCamera120Type', value);
        render();
    },
    toggleExtras() { state.extrasOpen = !state.extrasOpen; render(); },
    toggleMenu() { state.menuOpen = !state.menuOpen; render(); },
    closeMenu() { state.menuOpen = false; render(); },
    goView(name) { state.view = name; state.menuOpen = false; render(); },
    togglePushPull() { state.allowPushPull = !state.allowPushPull; render(); },
    toggleFlag(key) {
        state[key] = !state[key];
        if (key.startsWith('f')) persistFilters();
        render();
    },
    toggleLab(name) { state.expandedLab = state.expandedLab === name ? null : name; render(); },
    toggleFilm(key) { state.expandedFilm = state.expandedFilm === key ? null : key; render(); },

    loadFilm(key) {
        const f = getAllFilms()[key];
        if (!f) return;
        const bundles = normalizeFilmBundles(f);
        const best = bundles.slice().sort((a, b) => a.filmCost / a.rolls - b.filmCost / b.rolls)[0];
        this._applyFilm(f, best);
    },
    loadFilmBundle(key, storeName, rolls, exposures) {
        const f = getAllFilms()[key];
        if (!f) return;
        const bundle = normalizeFilmBundles(f).find(b => b.storeName === storeName && b.rolls === rolls && b.exposures === exposures) || normalizeFilmBundles(f)[0];
        this._applyFilm(f, bundle);
    },
    _applyFilm(f, bundle) {
        state.format = f.format || '35mm';
        state.process = f.process || 'C41';
        state.filmColor = filmColorType(f);
        state.boxSpeed = String(f.boxSpeed || '');
        state.packCost = String(bundle.filmCost || '');
        state.rolls = String(bundle.rolls || 1);
        state.exposures = String(bundle.exposures || 36);
        state.loadedFilmKey = filmKey(f.name, f.boxSpeed, f.format);
        persistScope();
        flash('Loaded ' + f.name);
        render();
    },
    loadCheaperFilm(key) {
        const r = rankLabs(state);
        const home = r.ranked.find(l => l.name === state.homeLab) || r.ranked[0];
        const cheaper = computeCheaperFilm(state, home);
        const opt = (cheaper.options || []).find(o => o.key === key) || (cheaper.options || [])[0];
        if (opt) opt.load();
    },

    saveToLibrary() {
        const rolls = Math.max(1, parseInt(state.rolls) || 1);
        state.draft = {
            name: '', boxSpeed: state.boxSpeed || '', process: state.process, colorType: state.filmColor, format: state.format,
            maxPushPull: '2', hidden: false,
            bundles: [{ storeName: '', rolls, exposures: parseInt(state.exposures) || 36, filmCost: parseFloat(state.packCost) || 0, buyLink: '' }]
        };
        state.draftKind = 'film'; state.draftKey = null;
        render();
    },
    shareLink() {
        const p = new URLSearchParams({
            format: state.format, process: state.process, filmColor: state.filmColor, boxSpeed: state.boxSpeed, pushPull: state.pushPull,
            packCost: state.packCost, postage: state.postage, rolls: state.rolls, exposures: state.exposures
        });
        const url = `${location.origin}${location.pathname}?${p.toString()}`;
        if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => { });
        flash('Link copied');
        render();
    },
    clearForm() {
        Object.assign(state, { boxSpeed: '', pushPull: '0', packCost: '', postage: '', rolls: '1', exposures: '36', onceOff: '', perRoll: '', loadedFilmKey: '' });
        render();
    },

    newFilm() {
        state.draft = { name: '', boxSpeed: '', process: state.process, colorType: state.filmColor, format: state.format, maxPushPull: '2', hidden: false, bundles: [{ storeName: '', rolls: 1, exposures: 36, filmCost: 0, buyLink: '' }] };
        state.draftKind = 'film'; state.draftKey = null;
        render();
    },
    newLab() {
        state.draft = { name: '', address: '', website: '', phone: '', email: '', hidden: false, services: [{ devCost: '', pushPullCost: '', pushPullType: 'per_stop', turnaroundTime: 'same_week', highResScan: false, tiffScan: false, noPushPull: false, mailBackCost: null, processes: ['C41'] }] };
        state.draftKind = 'lab'; state.draftKey = null;
        render();
    },
    editFilm(key) {
        const f = getAllFilms()[key];
        if (!f) return;
        state.draft = { ...f, bundles: normalizeFilmBundles(f).map(b => ({ ...b })), maxPushPull: String(f.maxPushPull ?? 1) };
        state.draftKind = 'film'; state.draftKey = key;
        render();
    },
    editLab(name) {
        const l = getAllLabs()[name];
        if (!l) return;
        const rawTiers = Array.isArray(l.services) && l.services.length ? l.services : [l];
        state.draft = { ...l, name, services: normalizeLabServices(l).map((t, i) => ({ ...t, label: (rawTiers[i] && rawTiers[i].label) || tierDescription(t) })) };
        state.draftKind = 'lab'; state.draftKey = name;
        render();
    },
    setDraftField(field, value) { state.draft[field] = value; render(); },
    setBundleField(i, field, value) {
        const b = state.draft.bundles[i];
        b[field] = (field === 'rolls' || field === 'exposures') ? parseInt(value) || 0 : (field === 'filmCost' ? value : value);
        render();
    },
    addBundle() { state.draft.bundles.push({ storeName: '', rolls: 1, exposures: parseInt(state.draft.bundles[0]?.exposures) || 36, filmCost: 0, buyLink: '' }); render(); },
    removeBundle(i) { state.draft.bundles.splice(i, 1); render(); },
    setTierField(i, field, value) { state.draft.services[i][field] = value; render(); },
    toggleTierFlag(i, flag) { state.draft.services[i][flag] = !state.draft.services[i][flag]; render(); },
    toggleTierProcess(i, proc) {
        const t = state.draft.services[i];
        t.processes = t.processes.includes(proc) ? t.processes.filter(p => p !== proc) : [...t.processes, proc];
        render();
    },
    addTier() { state.draft.services.push({ label: '', devCost: '', pushPullCost: '', pushPullType: 'per_stop', turnaroundTime: 'same_week', highResScan: false, tiffScan: false, noPushPull: false, mailBackCost: null, processes: ['C41'] }); render(); },
    removeTier(i) { state.draft.services.splice(i, 1); render(); },

    saveDraft() {
        const d = state.draft;
        if (state.draftKind === 'film') {
            if (!d.name.trim()) return;
            const saved = readJSON('filmProfiles', {});
            const newKey = filmKey(d.name, d.boxSpeed, d.format);
            if (state.draftKey && state.draftKey !== newKey) delete saved[state.draftKey];
            saved[newKey] = {
                name: d.name.trim(), boxSpeed: parseFloat(d.boxSpeed) || 0, process: d.process, colorType: d.colorType, format: d.format,
                maxPushPull: parseFloat(d.maxPushPull), hidden: !!d.hidden,
                bundles: d.bundles.map(b => ({ storeName: b.storeName || '', rolls: parseInt(b.rolls) || 1, exposures: parseInt(b.exposures) || 36, filmCost: parseFloat(b.filmCost) || 0, buyLink: b.buyLink || '' }))
            };
            writeJSON('filmProfiles', saved);
            state.loadedFilmKey = newKey;
        } else {
            if (!d.name.trim()) return;
            const saved = readJSON('labProfiles', {});
            if (state.draftKey && state.draftKey !== d.name.trim()) delete saved[state.draftKey];
            saved[d.name.trim()] = {
                name: d.name.trim(), address: d.address || '', website: d.website || '', phone: d.phone || '', email: d.email || '', hidden: !!d.hidden,
                services: d.services.map(t => ({
                    label: t.label || '', devCost: parseFloat(t.devCost) || 0, pushPullCost: parseFloat(t.pushPullCost) || 0, pushPullType: t.pushPullType || 'per_stop',
                    turnaroundTime: t.turnaroundTime || 'same_week', highResScan: !!t.highResScan, tiffScan: !!t.tiffScan, noPushPull: !!t.noPushPull,
                    mailBackCost: (t.mailBackCost === '' || t.mailBackCost === null || t.mailBackCost === undefined) ? null : parseFloat(t.mailBackCost),
                    processes: t.processes && t.processes.length ? t.processes : ['C41']
                }))
            };
            writeJSON('labProfiles', saved);
            if (state.draftKey && state.homeLab === state.draftKey) state.homeLab = d.name.trim();
        }
        state.draft = null; state.draftKind = null; state.draftKey = null;
        flash('Saved');
        render();
    },
    cancelDraft() { state.draft = null; state.draftKind = null; state.draftKey = null; render(); },

    toggleHidden(kind, key) {
        if (kind === 'film') {
            const saved = readJSON('filmProfiles', {});
            const f = getAllFilms()[key];
            if (!f) return;
            saved[key] = { ...f, hidden: !f.hidden };
            writeJSON('filmProfiles', saved);
        } else {
            const saved = readJSON('labProfiles', {});
            const l = getAllLabs()[key];
            if (!l) return;
            saved[key] = { ...l, hidden: !l.hidden };
            writeJSON('labProfiles', saved);
        }
        render();
    },
    removeItem(kind, key) {
        if (!window.confirm('Delete this permanently? This cannot be undone.')) return;
        if (kind === 'film') {
            const saved = readJSON('filmProfiles', {});
            delete saved[key];
            writeJSON('filmProfiles', saved);
        } else {
            const saved = readJSON('labProfiles', {});
            delete saved[key];
            writeJSON('labProfiles', saved);
        }
        render();
    },

    setHomeLab(name) { state.homeLab = name; setHomeLab(name); render(); },
    setDefaultTier(label) { state.defaultTier = label; setDefaultTierLabel(label); render(); },
    setLanguage(code) {
        setLocale(code);
        localStorage.setItem('locale', code);
        render();
    },
    openSetup() { state.setupOpen = true; state.setupStep = 0; render(); },
    closeSetup() { state.setupOpen = false; state.setupStep = 0; localStorage.setItem('setupSeen', '1'); render(); },
    setupGoto(step) { state.setupStep = step; render(); },
    // Next on the presets step used to require a separate "Import
    // selected" click first. Now Next itself imports whatever's ticked
    // (if anything) and only then advances, so there's one action instead
    // of two. Nothing ticked just advances immediately — presets are
    // optional, so Next shouldn't block on an empty selection.
    setupNextFromPresets() {
        const hasChecked = document.querySelectorAll('.preset-check:checked').length > 0;
        if (!hasChecked) { state.setupStep += 1; render(); return; }
        Promise.resolve(App.importPresetSelected()).then(() => {
            state.setupStep += 1;
            render();
        });
    },
    setSetting(key, value) {
        state[key] = value;
        if (key === 'mailRolls') localStorage.setItem('mailBackRollCount', value);
        if (key === 'upgradePct') localStorage.setItem('upgradeThresholdPercent', value);
        render();
    },

    exportBackup() {
        const data = { films: getAllFilms(), labs: getAllLabs(), homeLab: getHomeLab(), defaultTierLabel: getDefaultTierLabel() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'filmcalc-backup.json';
        a.click();
        URL.revokeObjectURL(a.href);
    },
    importBackup(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (parsed.films && typeof parsed.films === 'object') writeJSON('filmProfiles', mergeFilmProfiles(readJSON('filmProfiles', {}), parsed.films));
                if (parsed.labs && typeof parsed.labs === 'object') writeJSON('labProfiles', { ...readJSON('labProfiles', {}), ...parsed.labs });
                if (parsed.homeLab) setHomeLab(parsed.homeLab);
                if (parsed.defaultTierLabel) setDefaultTierLabel(parsed.defaultTierLabel);
                state.homeLab = getHomeLab(); state.defaultTier = getDefaultTierLabel();
                state.importNote = 'Backup imported.';
            } catch {
                state.importNote = 'That file isn\'t a valid FilmCalc backup.';
            }
            render();
        };
        reader.readAsText(file);
    },
    deleteAllData() {
        if (!window.confirm('Delete every saved film, lab, and home-lab preference from this browser? This cannot be undone.')) return;
        ['filmProfiles', 'labProfiles', 'homeLab', 'defaultTierLabel', 'favouriteFilms', 'favouriteLabs'].forEach(k => localStorage.removeItem(k));
        state.homeLab = ''; state.defaultTier = ''; state.expandedLab = null; state.expandedFilm = null; state.loadedFilmKey = '';
        state.importNote = 'All saved data deleted.';
        render();
    },
    // Imports every checked region file — films AND labs together in one
    // pass, not one button per kind, since importing triggers a
    // full re-render that would otherwise wipe the checked state of
    // whichever list wasn't just submitted (plain uncontrolled
    // checkboxes, not tied to state). Fetched in parallel, merged one
    // after another so a film/lab shared across two chosen files (e.g. a
    // national + a city retailer file) combines instead of the second
    // overwriting the first.
    importPresetSelected() {
        const filmFiles = [...document.querySelectorAll('.preset-check[data-kind="films"]:checked')].map(el => el.value);
        const labFiles = [...document.querySelectorAll('.preset-check[data-kind="labs"]:checked')].map(el => el.value);
        if (!filmFiles.length && !labFiles.length) { state.importNote = 'Tick at least one region first.'; render(); return; }
        const fetchAll = (kind, files) => Promise.all(files.map(file => fetch(`${kind}/${file}`).then(r => r.text()).then(text => ({ file, parsed: jsyaml.load(text) || {} })).catch(() => ({ file, parsed: null }))));
        return Promise.all([fetchAll('films', filmFiles), fetchAll('labs', labFiles)]).then(([filmResults, labResults]) => {
            let filmCount = 0, labCount = 0;
            const failed = [];
            filmResults.forEach(({ file, parsed }) => {
                if (!parsed) { failed.push(file); return; }
                const entries = Array.isArray(parsed.films) ? parsed.films : [];
                writeJSON('filmProfiles', mergeFilmProfiles(readJSON('filmProfiles', {}), buildFilmProfilesFromEntries(entries)));
                filmCount += entries.length;
            });
            labResults.forEach(({ file, parsed }) => {
                if (!parsed) { failed.push(file); return; }
                const entries = Array.isArray(parsed.labs) ? parsed.labs : [];
                const saved = readJSON('labProfiles', {});
                entries.forEach(l => { if (l.name) saved[l.name] = l; });
                writeJSON('labProfiles', saved);
                labCount += entries.length;
            });
            const parts = [];
            if (filmCount) parts.push(`${filmCount} film entr${filmCount === 1 ? 'y' : 'ies'}`);
            if (labCount) parts.push(`${labCount} lab${labCount === 1 ? '' : 's'}`);
            const total = filmFiles.length + labFiles.length;
            state.importNote = (parts.length ? `Imported ${parts.join(' and ')}` : 'Nothing to import') + ` from ${total} region file${total === 1 ? '' : 's'}.` + (failed.length ? ` Couldn't load ${failed.join(', ')}.` : '');
            render();
        });
    },

    // Restores the generic "drop a config.yaml / films.yaml / labs.yaml"
    // import path — accepts any of the three shapes: a combined config.yaml
    // ({ films, labs, settings }) or a standalone films.yaml/labs.yaml
    // (a bare films: [...] or labs: [...] list).
    importYamlFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            let filmCount = 0, labCount = 0;
            try {
                const parsed = jsyaml.load(reader.result) || {};
                if (Array.isArray(parsed.films)) {
                    const incoming = buildFilmProfilesFromEntries(parsed.films);
                    filmCount = parsed.films.length;
                    writeJSON('filmProfiles', mergeFilmProfiles(readJSON('filmProfiles', {}), incoming));
                }
                if (Array.isArray(parsed.labs)) {
                    const saved = readJSON('labProfiles', {});
                    parsed.labs.forEach(l => { if (l.name) saved[l.name] = l; });
                    labCount = parsed.labs.length;
                    writeJSON('labProfiles', saved);
                }
                if (parsed.settings && typeof parsed.settings === 'object') {
                    if (parsed.settings.homeLab) setHomeLab(parsed.settings.homeLab);
                    if (parsed.settings.upgradeThresholdPercent !== undefined) localStorage.setItem('upgradeThresholdPercent', parsed.settings.upgradeThresholdPercent);
                    state.homeLab = getHomeLab();
                }
                state.importNote = (filmCount || labCount) ? `Imported ${filmCount} film entr${filmCount === 1 ? 'y' : 'ies'} and ${labCount} lab${labCount === 1 ? '' : 's'} from ${file.name}.` : `${file.name} had no films or labs to import.`;
            } catch {
                state.importNote = `${file.name} isn't valid YAML.`;
            }
            render();
        };
        reader.readAsText(file);
    }
};
// buildFilmProfilesFromEntries: bridges the current { bundles: [...] }
// schema with the older flat single-bundle schema, same as js/modals.js's
// version — every film in films/*.yaml already uses the nested schema per
// DATA_SPEC.md, but this keeps older community files working too.
function buildFilmProfilesFromEntries(entries) {
    const hasNestedBundles = entries.some(f => Array.isArray(f.bundles));
    const result = {};
    if (hasNestedBundles) {
        entries.forEach(f => { if (f.name) result[filmKey(f.name, f.boxSpeed, f.format)] = f; });
    } else {
        entries.forEach(f => {
            if (!f.name) return;
            const key = filmKey(f.name, f.boxSpeed, f.format);
            const bundle = { rolls: f.rolls, exposures: f.exposures, filmCost: f.filmCost, storeName: f.storeName, buyLink: f.buyLink };
            if (result[key]) result[key].bundles.push(bundle);
            else result[key] = { name: f.name, boxSpeed: f.boxSpeed, maxPushPull: f.maxPushPull ?? 1, process: f.process || 'C41', format: f.format || '35mm', bundles: [bundle] };
        });
    }
    return result;
}

function persistScope() {
    localStorage.setItem('globalFormat', state.format);
    localStorage.setItem('globalProcess', state.process);
    localStorage.setItem('globalFilmColor', state.filmColor);
}

// ==================== Init ====================
function restoreFromShareLink() {
    const p = new URLSearchParams(location.search);
    if (![...p.keys()].length) return;
    ['format', 'process', 'filmColor', 'boxSpeed', 'pushPull', 'packCost', 'postage', 'rolls', 'exposures'].forEach(k => {
        if (p.has(k)) state[k] = p.get(k);
    });
    history.replaceState(null, '', location.pathname);
}

// ==================== Mobile shell ====================
// A structurally different layout, not a CSS-narrowed version of the
// desktop one — sticky header with a live cost summary, hamburger nav,
// full-screen edit takeovers, a bottom toast. Built from the "FilmCalc
// Mobile 1b" mockup. Shares `state`, the App.* handlers, and the real
// calc engine (rankLabs/computeFilmRows/computeExpired/computeCheaperFilm)
// with the desktop render path — only the markup differs.
const M_LABEL = "font-family:'Archivo Narrow',Archivo,sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#a9a59e";
const M_INPUT = "box-sizing:border-box;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 10px;color:#eae7e1;font-size:16px;" + MONO;
const M_ROW = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border-top:1px solid #212125";
const M_CARD = "border:1px solid #26262a;border-radius:10px;background:#131315;overflow:hidden";

function mRow(label, controlHtml, first, wide) {
    return `<div class="m-row${wide ? ' m-row-wide' : ''}" style="${first ? M_ROW.replace(';border-top:1px solid #212125', '') : M_ROW}">
<label class="narrow" style="${M_LABEL}">${label}</label>
<div style="display:flex;align-items:center;gap:8px">${controlHtml}</div>
</div>`;
}

function mSectionHead(label, trailing, color) {
    color = color || 'var(--acc)';
    return `<div style="display:flex;align-items:center;gap:10px;margin:36px 0 14px">
<div style="width:6px;height:6px;background:${color};border-radius:50%"></div>
<div style="${NARROW};font-size:16px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${color}">${label}</div>
<div style="flex:1;height:1px;background:#26262a"></div>
${trailing || ''}
</div>`;
}

function renderMobileHeader(s) {
    const viewLabel = { library: 'Library', expired: 'Expired', settings: 'Settings' }[s.view] || '';
    const eb = btnTone(s.view === 'expired'), lb = btnTone(s.view === 'library'), sb = btnTone(s.view === 'settings');
    const desktopNav = `
<button type="button" onclick="App.goView('expired')" style="background:${eb.bg};border:1px solid ${eb.border};border-radius:5px;padding:6px 10px;color:${eb.color};font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">${t('v2NavExpiredCalc')}</button>
<button type="button" onclick="App.goView('library')" style="background:${lb.bg};border:1px solid ${lb.border};border-radius:5px;padding:6px 10px;color:${lb.color};font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">${t('v2NavLibrary')}</button>
<a href="https://github.com/trentnbauer/FilmCalc/wiki" target="_blank" rel="noopener noreferrer" title="${t('v2NavWiki')}" style="display:flex;align-items:center;justify-content:center;width:29px;height:29px;background:#141416;border:1px solid #2c2c30;border-radius:5px;color:#8b8781;box-sizing:border-box">
<svg style="width:15px;height:15px" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.5c-1.5-1.4-3.6-2-5.5-2A5.5 5.5 0 003 5v13a5.5 5.5 0 013.5-1.5c1.9 0 4 .6 5.5 2m0-12c1.5-1.4 3.6-2 5.5-2A5.5 5.5 0 0121 5v13a5.5 5.5 0 00-3.5-1.5c-1.9 0-4 .6-5.5 2m0-12v12"></path></svg>
</a>
<button type="button" onclick="App.toggleDark()" title="${t('v2NavToggleDark')}" style="display:flex;align-items:center;justify-content:center;width:29px;height:29px;background:#141416;border:1px solid #2c2c30;border-radius:5px;color:#ffb020;cursor:pointer;padding:0;box-sizing:border-box">
<svg style="width:15px;height:15px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"></circle><path stroke-linecap="round" d="M12 2.5v2.25M12 19.25v2.25M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.25M19.25 12h2.25M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"></path></svg>
</button>
<button type="button" onclick="App.goView('settings')" title="${t('v2NavSettings')}" style="display:flex;align-items:center;justify-content:center;width:29px;height:29px;background:${sb.bg};border:1px solid ${sb.border};border-radius:5px;color:${sb.color};cursor:pointer;padding:0;box-sizing:border-box">
<svg style="width:15px;height:15px" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
</button>`;
    return `<div style="position:sticky;top:0;z-index:20;background:#0e0e10;border-bottom:1px solid #26262a">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px">
<button type="button" onclick="App.goView('main')" style="display:flex;align-items:center;gap:9px;background:transparent;border:0;padding:0;cursor:pointer">
<span style="width:26px;height:26px;border-radius:50%;background:linear-gradient(160deg,#2b2b2f,#131315);border:1px solid #3a3a3f;display:flex;align-items:center;justify-content:center"><span style="width:9px;height:9px;border-radius:50%;border:2px solid var(--acc)"></span></span>
<span style="${NARROW};font-weight:700;font-size:15px;letter-spacing:.2em;color:#c9c5bd;text-transform:uppercase">Filmcalc</span>
</button>
<nav class="desktop-nav" style="display:none;align-items:center;gap:6px;flex-wrap:wrap">${desktopNav}</nav>
<div style="display:flex;align-items:center;gap:8px">
<span class="mobile-view-label" style="${MONO};font-size:12px;color:#7a7770">${escapeHtml(viewLabel)}</span>
<button type="button" class="hamburger-btn" onclick="App.toggleMenu()" aria-label="Menu" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:#8b8781;padding:0;cursor:pointer">
<svg style="width:20px;height:20px" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"></path></svg>
</button>
</div>
</div>
${renderMobileSummary(s)}
</div>`;
}

function renderMobileSummary(s) {
    if (s.view !== 'main') return '';
    const r = rankLabs(s);
    const cheapest = r.ranked[0] || null;
    const home = r.ranked.find(l => l.name === s.homeLab) || cheapest;
    const formatLabel = FORMAT_OPTIONS.find(o => o.value === s.format)?.label || s.format;
    const colorLabel = FILM_TYPE_OPTIONS.find(o => o.value === s.filmColor)?.label || '';
    const loadedFilm = getAllFilms()[s.loadedFilmKey];
    const filmLine = `${loadedFilm ? escapeHtml(loadedFilm.name) + ' · ' : ''}${escapeHtml(formatLabel)} · ${escapeHtml(colorLabel)}`;
    if (!home) {
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px 11px;border-top:1px solid #1c1c20;background:#131315">
<div>
<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a7770">${filmLine}</div>
<div style="${MONO};font-size:13px;color:#5f5c57;margin-top:4px">No lab or film stock data for this process</div>
</div>
<div style="${MONO};font-size:14px;color:#5f5c57">N/A</div>
</div>`;
    }
    const homeLine = home.name === s.homeLab ? `${escapeHtml(home.name)} · home` : escapeHtml(home.name);
    const filmPct = Math.max(6, Math.min(100, (home.filmPerRoll / home.roll) * 100));
    const pushText = home.pick.pushFee > 0
        ? `+ ${CUR()}${money(home.pick.pushFee)} ${r.stopsSigned < 0 ? 'pull' : 'push'}`
        : (home.pick.mailFee > 0 ? `+ ${CUR()}${money(home.pick.mailFee)} mail` : '');
    return `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 12px 11px;border-top:1px solid #1c1c20;background:#131315">
<div>
<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a7770">${homeLine}</div>
<div style="font-size:10px;color:#5f5c57;margin-top:1px">${filmLine}</div>
<div style="display:flex;align-items:baseline;gap:3px;margin-top:2px"><span style="${MONO};font-size:14px;color:#6d6a64">${CUR()}</span><span style="${MONO};font-size:26px;line-height:1;color:#eae7e1">${money(home.cpp)}</span><span style="font-size:12px;color:#7a7770">/frame</span></div>
<div style="${MONO};display:flex;flex-direction:column;gap:2px;margin-top:6px;font-size:12px;color:#8b8781">
<span>Roll <span style="color:#c9c5bd">${CUR()}${money(home.filmPerRoll)}</span></span>
<span>Dev <span style="color:#c9c5bd">${CUR()}${money(home.pick.devCost)}</span> <span style="color:var(--acc)">${pushText}</span></span>
</div>
</div>
<div style="text-align:right">
<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a7770">Cheapest</div>
<div style="display:flex;align-items:baseline;gap:6px;justify-content:flex-end;margin-top:2px"><span style="${MONO};font-size:18px;color:var(--acc)">${CUR()}${money(cheapest.cpp)}</span></div>
<div style="font-size:12px;color:#8b8781;margin-top:2px">${escapeHtml(cheapest.name)}</div>
<div style="${MONO};margin-top:6px;font-size:12px;color:#7a7770">Roll total<br><span style="color:#c9c5bd;font-size:14px">${CUR()}${money(home.roll)}</span></div>
</div>
</div>
<div style="height:3px;background:#0f0f11;display:flex"><div style="background:var(--acc);width:${filmPct}%"></div></div>`;
}

function renderMobileMenu(s) {
    if (!s.menuOpen) return '';
    const items = [
        ['main', 'Film lookup'], ['library', 'Library'], ['expired', 'Expired calc'], ['settings', 'Settings']
    ].map(([view, label]) => {
        const on = s.view === view;
        return `<button type="button" onclick="App.goView('${view}')" style="height:52px;display:flex;align-items:center;padding:0 14px;border-radius:8px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;text-align:left;cursor:pointer;${on ? 'background:#1c1512;border:1px solid #5a3a1c;color:var(--acc)' : 'background:#1a1a1d;border:1px solid #2c2c30;color:#c9c5bd'}">${label}</button>`;
    }).join('');
    return `<div onclick="App.closeMenu()" style="position:fixed;top:0;left:50%;transform:translateX(-50%);width:min(960px,100%);height:100%;z-index:40;background:rgba(6,6,7,.66);display:flex;justify-content:flex-end">
<div onclick="event.stopPropagation()" style="width:264px;height:100%;background:#131315;border-left:1px solid #2c2c30;padding:14px 12px;display:flex;flex-direction:column;gap:8px;box-sizing:border-box">
<div style="${NARROW};font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#7a7770;padding:4px 8px 8px">Menu</div>
${items}
<a href="https://github.com/trentnbauer/FilmCalc/wiki" target="_blank" rel="noopener noreferrer" style="height:52px;display:flex;align-items:center;padding:0 14px;background:#1a1a1d;border:1px solid #2c2c30;border-radius:8px;color:#c9c5bd;font-size:15px;letter-spacing:.08em;text-transform:uppercase">Wiki ↗</a>
</div>
</div>`;
}

function renderMobileToast(s) {
    if (!s.toast) return '';
    return `<div style="position:fixed;left:50%;transform:translateX(-50%);bottom:16px;width:calc(100% - 24px);max-width:936px;z-index:60;padding:14px;background:#1c1512;border:1px solid #5a3a1c;border-radius:10px;color:var(--acc);font-size:14px;text-align:center;box-sizing:border-box">${escapeHtml(s.toast)}</div>`;
}

function renderMobileFooter(s) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px;padding:0 14px">
<span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#4a4844">FilmCalc</span>
<span style="${MONO};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#4a4844">${formatLabel(s.format)} · ${procLabel(s.process)}</span>
</div>`;
}

function renderMobileLookup(s) {
    const is120 = s.format === '120', is35 = s.format === '35mm';
    const r = rankLabs(s);
    const home = r.ranked.find(l => l.name === s.homeLab) || r.ranked[0];
    const filmRows = computeFilmRows(s, home);
    const rolls = Math.max(1, Math.round(num(s.rolls)) || 1);
    const stopsAbs = r.stopsAbs;
    const loaded = getAllFilms()[s.loadedFilmKey];
    const limit = loaded ? parseFloat(loaded.maxPushPull ?? 1) : 2;
    const pushWarn = stopsAbs > limit;
    const cheaper = computeCheaperFilm(s, home);

    const expShown = is120 ? String(FRAME120[s.frame120] || '') : s.exposures;
    const cameraControl = is120
        ? `<select onchange="App.setField('frame120',this.value)" style="width:96px;${M_INPUT};height:44px;font-family:'IBM Plex Mono',monospace;font-size:15px">${Object.keys(FRAME120).map(k => `<option value="${k}" ${s.frame120 === k ? 'selected' : ''}>${k}</option>`).join('')}</select>`
        : `<span style="width:26px"></span>`;

    // Requires chips
    const chips = requireFilters().map(f => {
        const on = s[f.key];
        return `<button type="button" onclick="App.toggleFlag('${f.key}')" style="flex:none;height:36px;border-radius:20px;padding:0 14px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;${on ? `background:#1c1512;border:1px solid #5a3a1c;color:${SECTION_COLORS.labs}` : 'background:#141416;border:1px solid #2c2c30;color:#8b8781'}">${f.label}</button>`;
    }).join('');
    const totalLabs = Object.keys(getAllLabs()).filter(n => !getAllLabs()[n].hidden).length;
    const filterNote = r.ranked.length < totalLabs
        ? `${totalLabs - r.ranked.length} lab${totalLabs - r.ranked.length === 1 ? '' : 's'} hidden by these filters`
        : `All saved labs qualify`;

    const labRows = r.ranked.map((l, i) => {
        const cheapest = r.ranked[0];
        const isHome = l.name === s.homeLab;
        const open = s.expandedLab === l.name;
        const tag = i === 0 ? 'Cheapest' : `+${((l.cpp - cheapest.cpp) * 100).toFixed(0)}c`;
        const cardBorder = i === 0 ? '#5a3a1c' : '#26262a', cardBg = i === 0 ? '#17140f' : '#131315';
        const priceColor = i === 0 ? SECTION_COLORS.labs : '#c9c5bd';
        const tagColor = (i === 0 || isHome) ? SECTION_COLORS.labs : '#7a7770';
        const detail = `${escapeHtml(l.pick.label)} · ${CUR()}${money(l.pick.devCost)}` +
            (l.pick.pushFee ? ` + ${CUR()}${money(l.pick.pushFee)} ${r.stopsSigned < 0 ? 'pull' : 'push'}` : '') +
            (l.pick.mailFee ? ` + ${CUR()}${money(l.pick.mailFee)} mail` : '');
        const tierRows = l.tiers.map(t => {
            const picked = t === l.pick;
            const color = picked ? SECTION_COLORS.labs : (t.ok ? '#c9c5bd' : '#55534e');
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border:1px solid #26262a;border-radius:8px;background:#0f0f11">
<span><span style="display:block;font-size:14px;color:${color}">${escapeHtml(t.label)}</span><span style="${MONO};display:block;font-size:12px;color:#7a7770;margin-top:3px">${t.ok ? (picked ? 'used here' : 'qualifies') : escapeHtml(t.why)}</span></span>
<span style="${MONO};font-size:15px;color:${color}">${CUR()}${money(t.cost)}</span>
</div>`;
        }).join('');
        return `<div style="border-radius:10px;overflow:hidden;border:1px solid ${cardBorder};background:${cardBg}">
<button type="button" onclick="App.toggleLab('${jsAttr(l.name)}')" style="width:100%;background:transparent;border:0;padding:14px;text-align:left;cursor:pointer">
<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
<span style="font-size:16px;color:#eae7e1">${escapeHtml(l.name)}</span>
<span style="${MONO};font-size:20px;color:${priceColor}">${CUR()}${money(l.cpp)}</span>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:6px">
<span style="${MONO};font-size:12px;color:#8b8781">${detail}</span>
<span style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${tagColor}">${tag}</span>
</div>
</button>
${open ? `<div style="padding:0 14px 14px">
<div style="${MONO};font-size:12px;color:#7a7770;margin-bottom:8px">${escapeHtml(l.lab.address || 'address not saved')}</div>
<div style="display:flex;flex-direction:column;gap:6px">${tierRows}</div>
<div style="display:flex;gap:8px;margin-top:10px">
<button type="button" onclick="App.editLab('${jsAttr(l.name)}')" style="flex:1;height:44px;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:#8b8781;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Edit lab</button>
${labDirectionsUrl(l.name) ? `<a href="${labDirectionsUrl(l.name)}" target="_blank" rel="noopener noreferrer" style="flex:1;height:44px;display:flex;align-items:center;justify-content:center;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:${SECTION_COLORS.labs};font-size:12px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none">Directions ↗</a>` : ''}
</div>
</div>` : ''}
</div>`;
    }).join('');

    const isoValues = [...new Set(Object.values(getAllFilms()).filter(f => !f.hidden && (f.format || '35mm') === s.format && filmColorType(f) === s.filmColor).map(f => parseFloat(f.boxSpeed) || 0))].sort((a, b) => a - b);
    const shownFilmRows = s.isoFilter === 'shoot' && !s.allowPushPull ? filmRows.filter(row => row.stopsAbs === 0) : filmRows;
    const cheapestFilmPerRoll = shownFilmRows.length ? Math.min(...shownFilmRows.map(row => row.perRoll)) : 0;
    const filmCards = shownFilmRows.map(row => {
        const f = row.f;
        const key = filmKey(f.name, f.boxSpeed, f.format);
        const open = s.expandedFilm === key;
        const cheap = row.perRoll <= cheapestFilmPerRoll + 0.001;
        const meta = `${f.boxSpeed} · ${procLabel(f.process)} · ${row.exposures}exp${row.stopsAbs ? ` · ${row.stopsAbs} stop ${row.dir}` : ''}`;
        const bundles = row.bundles.slice().sort((a, b) => a.filmCost / a.rolls - b.filmCost / b.rolls).map(b => `
<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;background:#0f0f11;border:1px solid #26262a;border-radius:8px">
<button type="button" onclick="App.loadFilmBundle('${jsAttr(key)}','${jsAttr(b.storeName)}',${b.rolls},${b.exposures})" style="flex:1;min-width:0;background:transparent;border:0;padding:0;text-align:left;cursor:pointer"><span style="display:block;font-size:14px;color:#c9c5bd">${escapeHtml(b.storeName || 'Unnamed store')}</span><span style="${MONO};display:block;font-size:12px;color:#7a7770;margin-top:3px">${b.rolls}×${b.exposures} · ${CUR()}${money(b.filmCost)} · ${CUR()}${money(b.filmCost / b.rolls)}/roll</span></button>
<a href="${sanitizeUrl(b.buyLink)}" target="_blank" rel="noopener noreferrer" style="height:40px;display:flex;align-items:center;padding:0 14px;background:#1c1512;border:1px solid #5a3a1c;border-radius:8px;color:${SECTION_COLORS.films};font-size:12px;letter-spacing:.14em;text-transform:uppercase">Buy ↗</a>
</div>`).join('');
        return `<div style="border-radius:10px;overflow:hidden;border:1px solid ${cheap ? '#5a3a1c' : '#26262a'};background:${cheap ? '#17140f' : '#131315'}">
<button type="button" onclick="App.toggleFilm('${jsAttr(key)}')" style="width:100%;background:transparent;border:0;padding:14px;text-align:left;cursor:pointer">
<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
<span><span style="display:block;font-size:16px;color:#eae7e1">${escapeHtml(f.name)}</span><span style="${MONO};display:block;font-size:12px;color:#7a7770;margin-top:4px">${meta}</span></span>
<span style="${MONO};font-size:20px;color:${cheap ? SECTION_COLORS.films : '#c9c5bd'}">${CUR()}${money(row.perRoll)}</span>
</div>
</button>
${open ? `<div style="padding:0 14px 14px;display:flex;flex-direction:column;gap:6px">
<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a7770">Where to buy</div>
${bundles}
<button type="button" onclick="App.editFilm('${jsAttr(key)}')" style="height:44px;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:#8b8781;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Edit film</button>
</div>` : ''}
</div>`;
    }).join('');

    const shootIso = effectiveShootIso(s) || num(s.boxSpeed);

    return `<div style="padding:16px 12px 0">
<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
<div style="width:6px;height:6px;background:${SECTION_COLORS.lookup};border-radius:50%"></div>
<div style="${NARROW};font-size:16px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${SECTION_COLORS.lookup}">Film lookup</div>
<div style="flex:1;height:1px;background:#26262a"></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
<select onchange="App.setField('format',this.value)" style="height:44px;${M_INPUT}">${FORMAT_OPTIONS.map(o => `<option value="${o.value}" ${s.format === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>
<select onchange="App.setField('filmColor',this.value)" style="height:44px;${M_INPUT}">${FILM_TYPE_OPTIONS.map(o => `<option value="${o.value}" ${s.filmColor === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>
</div>
<div class="field-grid" style="${M_CARD}">
${mRow('Box speed', `<input value="${escapeHtml(s.boxSpeed)}" oninput="App.setField('boxSpeed',this.value)" data-fkey="m-boxSpeed" inputmode="numeric" placeholder="400" style="width:96px;height:44px;text-align:right;${M_INPUT}"><span style="width:26px;font-size:12px;text-transform:uppercase;color:#7a7770">ISO</span>`, true)}
${mRow('Push/pull', `<select onchange="App.setField('pushPull',this.value)" style="width:96px;height:44px;text-align:right;${M_INPUT}">${PUSH_PULL_OPTIONS.map(n => `<option value="${n}" ${String(s.pushPull) === String(n) ? 'selected' : ''}>${n > 0 ? '+' + n : n}</option>`).join('')}</select><span style="width:26px;font-size:12px;text-transform:uppercase;color:#7a7770">stop</span>`)}
${mRow('Development type', `<select onchange="App.setField('process',this.value)" style="width:96px;height:44px;text-align:right;${M_INPUT}">${PROCESS_OPTIONS.map(o => `<option value="${o.value}" ${s.process === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select><span style="width:26px"></span>`)}
${!is120 ? mRow('Exposures', `<input value="${escapeHtml(expShown)}" oninput="App.setField('exposures',this.value)" data-fkey="m-exposures" inputmode="numeric" placeholder="36" style="width:96px;height:44px;text-align:right;${M_INPUT}"><span style="width:26px"></span>`) : ''}
${!is35 ? mRow('Camera', cameraControl) : ''}
${mRow('Pack price', `<div style="display:flex;align-items:center;width:96px;height:44px;box-sizing:border-box;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 10px"><span style="${MONO};font-size:15px;color:#6d6a64">${CUR()}</span><input value="${escapeHtml(s.packCost)}" oninput="App.setField('packCost',this.value)" data-fkey="m-packCost" inputmode="decimal" placeholder="50.00" style="width:100%;min-width:0;text-align:right;background:transparent;border:0;color:#eae7e1;font-size:16px;${MONO}"></div><span style="width:26px"></span>`)}
${mRow('Pack of', `<input value="${escapeHtml(s.rolls)}" oninput="App.setField('rolls',this.value)" data-fkey="m-rolls" inputmode="numeric" placeholder="1" style="width:96px;height:44px;text-align:right;${M_INPUT}"><span style="width:26px;font-size:12px;text-transform:uppercase;color:#7a7770">Rl</span>`)}
${mRow('Postage', `<div style="display:flex;align-items:center;width:96px;height:44px;box-sizing:border-box;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 10px"><span style="${MONO};font-size:15px;color:#6d6a64">${CUR()}</span><input value="${escapeHtml(s.postage)}" oninput="App.setField('postage',this.value)" data-fkey="m-postage" inputmode="decimal" placeholder="3.95" style="width:100%;min-width:0;text-align:right;background:transparent;border:0;color:#eae7e1;font-size:16px;${MONO}"></div><span style="width:26px"></span>`)}
<button type="button" onclick="App.toggleExtras()" style="width:100%;height:48px;display:flex;align-items:center;justify-content:space-between;background:#0f0f11;border:0;border-top:1px solid #212125;padding:0 14px;color:#8b8781;font-size:12px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer"><span>Extra fees / Advanced</span><span style="${MONO};font-size:16px">${s.extrasOpen ? '–' : '+'}</span></button>
${s.extrasOpen ? `<div style="background:#0f0f11;border-top:1px solid #212125">
${mRow('Mail-back', `<button type="button" onclick="App.toggleFlag('fMail')" style="width:56px;height:32px;border-radius:16px;border:1px solid #33333a;position:relative;cursor:pointer;padding:0;background:${s.fMail ? 'var(--acc)' : '#1a1a1d'}"><span style="position:absolute;top:3px;width:24px;height:24px;border-radius:50%;background:#eae7e1;transition:left .15s;left:${s.fMail ? '29px' : '3px'}"></span></button><span style="width:26px"></span>`, true)}
</div>` : ''}
</div>
<div style="${MONO};margin-top:8px;font-size:12px;color:#7a7770;line-height:1.5">${CUR()}${money(num(s.packCost) / rolls)} per roll · ${rolls} roll${rolls === 1 ? '' : 's'} · ${CUR()}${money(num(s.postage) / rolls)} postage · ${r.exp} shots</div>
${pushWarn ? `<div style="display:flex;align-items:center;gap:9px;margin-top:10px;padding:12px 14px;border:1px solid #5a3a1c;border-radius:10px;background:#17140f">
<span style="width:7px;height:7px;border-radius:50%;background:var(--acc);flex-shrink:0"></span>
<span style="font-size:13px;line-height:1.45;color:#ffa268">${stopsAbs} stops of ${r.stopsSigned > 0 ? 'push' : 'pull'} — ${loaded ? `${escapeHtml(loaded.name)} is rated for ${limit === 0 ? 'no push/pull' : '±' + limit}` : 'most stocks hold ±2'}, so expect heavy grain and contrast shift.</span>
</div>` : ''}
<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;padding:12px 14px;border:1px solid ${cheaper.has ? '#5a3a1c' : '#26262a'};border-radius:10px;background:${cheaper.has ? '#17140f' : '#131315'}">
<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${cheaper.has ? SECTION_COLORS.films : '#8b8781'}">${escapeHtml(cheaper.label)}</div>
${cheaper.has ? cheaper.options.map((o, i) => `
<div style="display:flex;flex-direction:column;gap:6px;${i > 0 ? 'padding-top:8px;border-top:1px solid #26262a' : ''}">
<div style="font-size:13px;line-height:1.45;color:#c9c5bd">${escapeHtml(o.text)}</div>
<div style="display:flex;gap:10px">
<button type="button" onclick="App.loadCheaperFilm('${o.key}')" style="flex:1;height:40px;background:transparent;border:1px solid #5a3a1c;border-radius:8px;color:${SECTION_COLORS.films};font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Load</button>
<a href="${escapeHtml(o.url)}" target="_blank" rel="noopener noreferrer" style="flex:1;height:40px;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid #5a3a1c;border-radius:8px;color:${SECTION_COLORS.films};font-size:12px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none">Buy ↗</a>
</div>
</div>`).join('') : `<div style="font-size:13px;line-height:1.45;color:#c9c5bd">${escapeHtml(cheaper.text)}</div>`}
</div>
<div style="display:flex;align-items:center;gap:10px;margin-top:14px">
<button type="button" onclick="App.saveToLibrary()" style="flex:1;height:44px;background:#1c1512;border:1px solid #5a3a1c;border-radius:8px;color:var(--acc);font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Save to library</button>
<button type="button" onclick="App.shareLink()" title="Copy a link that reopens this lookup with the same values" style="flex:1;height:44px;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:#8b8781;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Share</button>
<button type="button" onclick="App.clearForm()" style="flex:1;height:44px;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:#8b8781;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Clear</button>
</div>

${mSectionHead('Saved lab costs', `<span style="${MONO};font-size:12px;color:#7a7770">${r.ranked.length} of ${totalLabs}</span>`, SECTION_COLORS.labs)}
<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
<span style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7a7770;white-space:nowrap">Requires</span>
${chips}
</div>
<div style="${MONO};margin:-2px 0 10px;font-size:12px;color:#7a7770">${filterNote}</div>
<div style="display:flex;flex-direction:column;gap:8px">${labRows || `<div style="padding:14px;font-size:12px;color:#5f5c57;background:#131315;border:1px solid #26262a;border-radius:10px">No labs saved yet — add one.</div>`}</div>

${mSectionHead('Saved film stock', null, SECTION_COLORS.films)}
<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
<select onchange="App.setField('isoFilter',this.value)" style="height:36px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 8px;color:#c9c5bd;font-size:13px;${MONO}">
<option value="shoot" ${s.isoFilter === 'shoot' ? 'selected' : ''}>Shooting ${shootIso || '—'}</option>
<option value="all" ${s.isoFilter === 'all' ? 'selected' : ''}>All</option>
${isoValues.map(v => `<option value="${v}" ${s.isoFilter === String(v) ? 'selected' : ''}>${v}</option>`).join('')}
</select>
</div>
<button type="button" onclick="App.togglePushPull()" style="display:flex;align-items:center;gap:10px;width:100%;height:44px;padding:0 12px;margin-bottom:10px;border-radius:8px;cursor:pointer;text-align:left;${s.allowPushPull ? `background:#17140f;border:1px solid #5a3a1c;color:${SECTION_COLORS.films}` : 'background:#141416;border:1px solid #2c2c30;color:#8b8781'}">
<span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-size:13px;${s.allowPushPull ? `background:${SECTION_COLORS.films};border:1px solid ${SECTION_COLORS.films};color:#131315` : 'background:#1a1a1d;border:1px solid #33333a;color:transparent'}">✓</span>
<span style="font-size:13px;letter-spacing:.08em;text-transform:uppercase">Include push/pull stocks</span>
</button>
<div style="display:flex;flex-direction:column;gap:8px">${filmCards || `<div style="padding:14px;font-size:12px;color:#5f5c57;background:#131315;border:1px solid #26262a;border-radius:10px">No film stock saved for ${formatLabel(s.format)} · ${filmTypeLabel(s.filmColor)} yet.</div>`}</div>
<div style="${MONO};margin-top:10px;font-size:12px;line-height:1.5;color:#5f5c57">Per-roll price is the cheapest saved price for each stock, plus the push/pull stops needed to reach your shooting ISO.</div>
</div>`;
}

function mLibCard(kind, key, name, meta, price, hidden) {
    return `<div style="border:1px solid #26262a;border-radius:10px;background:#131315;padding:14px">
<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
<span><span style="display:block;font-size:16px;color:${hidden ? '#6d6a64' : '#eae7e1'}">${escapeHtml(name)}</span><span style="${MONO};display:block;font-size:12px;color:#7a7770;margin-top:4px">${meta}</span></span>
<span style="${MONO};font-size:17px;color:#c9c5bd">${price}</span>
</div>
<div style="display:flex;gap:8px;margin-top:12px">
<button type="button" onclick="App.toggleHidden('${kind}','${jsAttr(key)}')" style="flex:1;height:44px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;color:#8b8781;font-size:12px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">${hidden ? t('v2ButtonShow') : t('v2ButtonHide')}</button>
<button type="button" onclick="App.${kind === 'film' ? 'editFilm' : 'editLab'}('${jsAttr(key)}')" style="flex:1;height:44px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;color:#8b8781;font-size:12px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer">Edit</button>
<button type="button" onclick="App.removeItem('${kind}','${jsAttr(key)}')" style="width:52px;height:44px;display:flex;align-items:center;justify-content:center;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;color:#8b8781;cursor:pointer;padding:0"><svg style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6"></path></svg></button>
</div>
</div>`;
}

function renderMobileLibrary(s) {
    const allFilms = getAllFilms(), allLabs = getAllLabs();
    const filmCount = Object.keys(allFilms).length, labCount = Object.keys(allLabs).length;
    const tab = s.libTab === 'labs' ? 'labs' : 'films';
    const filmsTone = btnTone(tab === 'films'), labsTone = btnTone(tab === 'labs');
    const emptyCard = `<div style="padding:14px;font-size:12px;color:#5f5c57;background:#131315;border:1px solid #26262a;border-radius:10px">Nothing saved yet.</div>`;

    const search = s.libSearch.trim().toLowerCase();
    const filmSection = () => {
        const entries = Object.entries(allFilms).filter(([, f]) => !search || f.name.toLowerCase().includes(search));
        const filmCards = entries.map(([key, f]) => {
            const bundles = normalizeFilmBundles(f);
            const cheapest = bundles.slice().sort((a, b) => a.filmCost / a.rolls - b.filmCost / b.rolls)[0];
            const meta = `${f.boxSpeed} · ${procLabel(f.process)} · ${bundles.length} price${bundles.length === 1 ? '' : 's'}`;
            return mLibCard('film', key, f.name, meta, `${CUR()}${money(cheapest.filmCost / cheapest.rolls)}`, f.hidden);
        }).join('');
        const empty = search ? `<div style="padding:14px;font-size:12px;color:#5f5c57;background:#131315;border:1px solid #26262a;border-radius:10px">No film stock matches "${escapeHtml(s.libSearch.trim())}".</div>` : emptyCard;
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
<div style="width:6px;height:6px;background:var(--acc);border-radius:50%"></div>
<div style="${NARROW};font-size:16px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#eae7e1">Films</div>
<div style="flex:1;height:1px;background:#26262a"></div>
<button type="button" onclick="App.newFilm()" style="height:36px;background:#141416;border:1px solid #2c2c30;border-radius:8px;padding:0 12px;color:#8b8781;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">New</button>
</div>
<div class="lib-grid">${filmCards || empty}</div>`;
    };
    const labSection = () => {
        const entries = Object.entries(allLabs).filter(([name]) => !search || name.toLowerCase().includes(search));
        const labCards = entries.map(([name, l]) => {
            const tiers = normalizeLabServices(l);
            const cheapest = tiers.slice().sort((a, b) => a.devCost - b.devCost)[0];
            const meta = `${tiers.length} tier${tiers.length === 1 ? '' : 's'}`;
            return mLibCard('lab', name, name, meta, `${CUR()}${money(cheapest.devCost)}`, l.hidden);
        }).join('');
        const empty = search ? `<div style="padding:14px;font-size:12px;color:#5f5c57;background:#131315;border:1px solid #26262a;border-radius:10px">No lab matches "${escapeHtml(s.libSearch.trim())}".</div>` : emptyCard;
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
<div style="width:6px;height:6px;background:var(--acc);border-radius:50%"></div>
<div style="${NARROW};font-size:16px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#eae7e1">Labs</div>
<div style="flex:1;height:1px;background:#26262a"></div>
<button type="button" onclick="App.newLab()" style="height:36px;background:#141416;border:1px solid #2c2c30;border-radius:8px;padding:0 12px;color:#8b8781;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">New</button>
</div>
<div class="lib-grid">${labCards || empty}</div>`;
    };

    return `<div style="padding:16px 12px 0">
<div style="display:flex;gap:8px;margin-bottom:14px">
<button type="button" onclick="App.setField('libTab','films')" style="flex:1;height:44px;background:${filmsTone.bg};border:1px solid ${filmsTone.border};border-radius:8px;color:${filmsTone.color};font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Films (${filmCount})</button>
<button type="button" onclick="App.setField('libTab','labs')" style="flex:1;height:44px;background:${labsTone.bg};border:1px solid ${labsTone.border};border-radius:8px;color:${labsTone.color};font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Labs (${labCount})</button>
</div>
<input value="${escapeHtml(s.libSearch)}" oninput="App.setField('libSearch',this.value)" data-fkey="m-libSearch" placeholder="Search by name…" style="width:100%;box-sizing:border-box;height:44px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 12px;color:#eae7e1;font-size:15px;margin-bottom:20px">
${tab === 'films' ? filmSection() : labSection()}
</div>`;
}

function renderMobileExpired(s) {
    const c = computeExpired(s);
    const storageOptions = [
        ['cold', 'Cold stored', 'Fridge or freezer since new; ages slowest.'],
        ['controlled', 'Climate controlled', 'Indoors at steady room temperature, out of sunlight; the normal rate.'],
        ['uncontrolled', 'Uncontrolled', 'Shed, garage, roof space or a hot car; ages fastest.']
    ].map(([key, label, help]) => {
        const on = s.storage === key;
        return `<button type="button" onclick="App.setField('storage','${key}')" style="display:block;width:100%;text-align:left;border-radius:8px;padding:12px;cursor:pointer;${on ? 'background:#17140f;border:1px solid #5a3a1c' : 'background:#1a1a1d;border:1px solid #33333a'}">
<span style="display:block;font-size:15px;color:${on ? 'var(--acc)' : '#c9c5bd'}">${label}</span>
<span style="display:block;font-size:12px;line-height:1.45;color:#7a7770;margin-top:4px">${help}</span>
</button>`;
    }).join('');
    return `<div style="padding:16px 12px 0">
<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
<div style="width:6px;height:6px;background:var(--acc);border-radius:50%"></div>
<div style="${NARROW};font-size:16px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#eae7e1">Expired film</div>
<div style="flex:1;height:1px;background:#26262a"></div>
</div>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#8b8781">Old film loses speed as it ages. Enter the roll's box speed and expiry, and this gives you what to rate it at.</p>
<div class="field-grid" style="${M_CARD}">
${mRow('Expiry', `<select onchange="App.setField('expiryMonth',this.value)" style="width:88px;height:44px;${M_INPUT};font-size:15px">${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => `<option value="${i + 1}" ${String(s.expiryMonth) === String(i + 1) ? 'selected' : ''}>${m}</option>`).join('')}</select><input value="${escapeHtml(s.expiryYear)}" oninput="App.setField('expiryYear',this.value)" data-fkey="m-expiryYear" inputmode="numeric" placeholder="2006" style="width:96px;height:44px;text-align:right;${M_INPUT}">`, true, true)}
${mRow('Box speed', `<input value="${escapeHtml(s.expBox)}" oninput="App.setField('expBox',this.value)" data-fkey="m-expBox" inputmode="numeric" style="width:120px;height:44px;text-align:right;${M_INPUT}">`)}
${mRow('Development', `<select onchange="App.setField('filmType',this.value)" style="width:180px;height:44px;${M_INPUT};font-size:15px"><option value="c41" ${s.filmType === 'c41' ? 'selected' : ''}>C-41 colour</option><option value="bw" ${s.filmType === 'bw' ? 'selected' : ''}>B&amp;W</option><option value="e6" ${s.filmType === 'e6' ? 'selected' : ''}>E-6 slide</option></select>`)}
<div style="padding:11px 14px;border-top:1px solid #212125">
<label style="${M_LABEL};display:block;margin-bottom:8px">Storage</label>
<div style="display:flex;flex-direction:column;gap:6px">${storageOptions}</div>
</div>
<div style="display:flex;align-items:baseline;gap:12px;padding:14px;border-top:1px solid #212125;background:#0f0f11;flex-wrap:wrap">
<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a7770">Rate it at</div>
<div style="${MONO};font-size:30px;color:var(--acc)">${c.rated}</div>
<div style="font-size:13px;color:#a9a59e">${c.note}</div>
</div>
</div>
<div style="${MONO};margin-top:10px;font-size:12px;color:#7a7770">${c.ageNote}</div>
</div>`;
}

function mField(label, inputHtml) {
    return `<div><div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8b8781;margin-bottom:6px">${label}</div>${inputHtml}</div>`;
}
const M_FIELD_INPUT = "width:100%;box-sizing:border-box;height:48px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 12px;color:#eae7e1;font-size:16px";

function renderMobileEditFilm(s) {
    const d = s.draft;
    const bundleLabel = (text) => `<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#5f5c57;margin-bottom:4px">${text}</div>`;
    const bundles = d.bundles.map((b, i) => `
<div style="border:1px solid #26262a;border-radius:10px;background:#131315;padding:14px;display:flex;flex-direction:column;gap:10px">
<div style="display:flex;align-items:flex-end;gap:10px">
<div style="flex:1">${bundleLabel('Store')}<input value="${escapeHtml(b.storeName)}" oninput="App.setBundleField(${i},'storeName',this.value)" data-fkey="m-bundle-${i}-storeName" placeholder="Store" style="${M_FIELD_INPUT}"></div>
<button type="button" onclick="App.removeBundle(${i})" title="Remove" style="flex-shrink:0;width:44px;height:48px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;color:#8b8781;font-size:16px;cursor:pointer;padding:0">×</button>
</div>
<div style="display:flex;gap:10px">
<div style="flex:1;min-width:0">${bundleLabel('Rolls')}<input value="${b.rolls}" oninput="App.setBundleField(${i},'rolls',this.value)" data-fkey="m-bundle-${i}-rolls" inputmode="numeric" placeholder="Rolls" style="width:100%;${M_FIELD_INPUT};${MONO}"></div>
<div style="flex:1;min-width:0">${bundleLabel('Exposures')}<input value="${b.exposures}" oninput="App.setBundleField(${i},'exposures',this.value)" data-fkey="m-bundle-${i}-exposures" inputmode="numeric" placeholder="Exp" style="width:100%;${M_FIELD_INPUT};${MONO}"></div>
<div style="flex:1;min-width:0">${bundleLabel('Price')}<input value="${b.filmCost}" oninput="App.setBundleField(${i},'filmCost',this.value)" data-fkey="m-bundle-${i}-filmCost" inputmode="decimal" placeholder="Price" style="width:100%;${M_FIELD_INPUT};${MONO}"></div>
</div>
${bundleLabel('Buy link')}<input value="${escapeHtml(b.buyLink)}" oninput="App.setBundleField(${i},'buyLink',this.value)" data-fkey="m-bundle-${i}-buyLink" inputmode="url" placeholder="https://… buy link" style="${M_FIELD_INPUT}">
</div>`).join('');
    return `<div style="position:fixed;inset:0;z-index:50;background:#0b0b0c;display:flex;flex-direction:column">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-bottom:1px solid #26262a;background:#0e0e10">
<span style="${NARROW};font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#c9c5bd">Edit film stock</span>
<button type="button" onclick="App.cancelDraft()" style="width:44px;height:44px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;color:#8b8781;font-size:18px;cursor:pointer;padding:0">×</button>
</div>
<div style="flex:1;overflow:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px">
${mField('Name', `<input value="${escapeHtml(d.name)}" oninput="App.setDraftField('name',this.value)" data-fkey="m-draft-name" style="${M_FIELD_INPUT}">`)}
<div style="display:flex;gap:10px">
<div style="flex:1">${mField('Box speed', `<input value="${d.boxSpeed}" oninput="App.setDraftField('boxSpeed',this.value)" data-fkey="m-draft-boxSpeed" inputmode="numeric" style="${M_FIELD_INPUT};${MONO}">`)}</div>
<div style="flex:1">${mField('Max push/pull', `<input value="${d.maxPushPull}" oninput="App.setDraftField('maxPushPull',this.value)" data-fkey="m-draft-maxPushPull" inputmode="numeric" style="${M_FIELD_INPUT};${MONO}">`)}</div>
</div>
<div style="display:flex;gap:10px">
<div style="flex:1">${mField('Format', `<select onchange="App.setDraftField('format',this.value)" style="${M_FIELD_INPUT}">${FORMAT_OPTIONS.map(o => `<option value="${o.value}" ${d.format === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`)}</div>
<div style="flex:1">${mField('Process', `<select onchange="App.setDraftField('process',this.value)" style="${M_FIELD_INPUT}">${PROCESS_OPTIONS.map(o => `<option value="${o.value}" ${d.process === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`)}</div>
</div>
${mField('Type', `<select onchange="App.setDraftField('colorType',this.value)" style="${M_FIELD_INPUT}">${FILM_TYPE_OPTIONS.map(o => `<option value="${o.value}" ${(d.colorType || filmColorType(d)) === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`)}
<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8b8781;margin-top:6px">Where to buy</div>
<button type="button" onclick="App.addBundle()" style="height:48px;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:#8b8781;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">+ Add price</button>
${bundles}
</div>
<div style="display:flex;gap:10px;padding:12px;border-top:1px solid #26262a;background:#0e0e10">
<button type="button" onclick="App.saveDraft()" style="flex:1;height:50px;background:#1c1512;border:1px solid #5a3a1c;border-radius:8px;color:var(--acc);font-size:13px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Save film</button>
<button type="button" onclick="App.cancelDraft()" style="width:110px;height:50px;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:#8b8781;font-size:13px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Cancel</button>
</div>
</div>`;
}

function renderMobileEditLab(s) {
    const d = s.draft;
    const tiers = d.services.map((t, i) => `
<div style="border:1px solid #26262a;border-radius:10px;background:#131315;padding:14px">
<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px">
<span style="font-size:15px;color:#c9c5bd">${escapeHtml(tierDescription(t))}</span>
<button type="button" onclick="App.removeTier(${i})" style="width:40px;height:40px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;color:#8b8781;font-size:16px;cursor:pointer;padding:0">×</button>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0">
<label style="font-size:14px;color:#a9a59e">Cost / roll</label>
<div style="display:flex;align-items:center;width:120px;height:44px;box-sizing:border-box;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 10px"><span style="${MONO};font-size:15px;color:#6d6a64">${CUR()}</span><input value="${t.devCost}" oninput="App.setTierField(${i},'devCost',this.value)" data-fkey="m-tier-${i}-devCost" inputmode="decimal" style="width:100%;min-width:0;text-align:right;background:transparent;border:0;color:#eae7e1;font-size:16px;${MONO}"></div>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #212125">
<label style="font-size:14px;color:#a9a59e">Mail-back</label>
<div style="display:flex;align-items:center;width:120px;height:44px;box-sizing:border-box;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 10px"><span style="${MONO};font-size:15px;color:#6d6a64">${CUR()}</span><input value="${t.mailBackCost ?? ''}" oninput="App.setTierField(${i},'mailBackCost',this.value)" data-fkey="m-tier-${i}-mailBackCost" inputmode="decimal" placeholder="n/a" style="width:100%;min-width:0;text-align:right;background:transparent;border:0;color:#eae7e1;font-size:16px;${MONO}"></div>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #212125">
<label style="font-size:14px;color:#a9a59e">Push/pull fee</label>
<div style="display:flex;align-items:center;width:120px;height:44px;box-sizing:border-box;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 10px"><span style="${MONO};font-size:15px;color:#6d6a64">${CUR()}</span><input value="${t.pushPullCost}" oninput="App.setTierField(${i},'pushPullCost',this.value)" data-fkey="m-tier-${i}-pushPullCost" inputmode="decimal" style="width:100%;min-width:0;text-align:right;background:transparent;border:0;color:#eae7e1;font-size:16px;${MONO}"></div>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #212125">
<label style="font-size:14px;color:#a9a59e">Charged</label>
<select onchange="App.setTierField(${i},'pushPullType',this.value)" style="width:150px;height:44px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 10px;color:#eae7e1;font-size:15px"><option value="per_stop" ${t.pushPullType === 'per_stop' ? 'selected' : ''}>Per stop</option><option value="flat" ${t.pushPullType === 'flat' ? 'selected' : ''}>Flat fee</option></select>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #212125">
<label style="font-size:14px;color:#a9a59e">Turnaround</label>
<select onchange="App.setTierField(${i},'turnaroundTime',this.value)" style="width:150px;height:44px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;padding:0 10px;color:#eae7e1;font-size:15px">${TURNAROUND_OPTIONS.map(o => `<option value="${o.value}" ${t.turnaroundTime === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
</div>
<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid #212125">
${pill('Hi-res', t.highResScan, `App.toggleTierFlag(${i},'highResScan')`)}
${pill('TIFF', t.tiffScan, `App.toggleTierFlag(${i},'tiffScan')`)}
${pill('No push/pull', t.noPushPull, `App.toggleTierFlag(${i},'noPushPull')`)}
</div>
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:10px">
${PROCESS_OPTIONS.map(o => pill(o.label, t.processes.includes(o.value), `App.toggleTierProcess(${i},'${o.value}')`)).join('')}
</div>
</div>`).join('');
    return `<div style="position:fixed;inset:0;z-index:50;background:#0b0b0c;display:flex;flex-direction:column">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-bottom:1px solid #26262a;background:#0e0e10">
<span style="${NARROW};font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#c9c5bd">Edit lab</span>
<button type="button" onclick="App.cancelDraft()" style="width:44px;height:44px;background:#1a1a1d;border:1px solid #33333a;border-radius:8px;color:#8b8781;font-size:18px;cursor:pointer;padding:0">×</button>
</div>
<div style="flex:1;overflow:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px">
${mField('Name', `<input value="${escapeHtml(d.name)}" oninput="App.setDraftField('name',this.value)" data-fkey="m-draft-name" style="${M_FIELD_INPUT}">`)}
${mField('Address', `<input value="${escapeHtml(d.address || '')}" oninput="App.setDraftField('address',this.value)" data-fkey="m-draft-address" placeholder="Street, suburb, state" style="${M_FIELD_INPUT}">`)}
${mField('Website', `<input value="${escapeHtml(d.website || '')}" oninput="App.setDraftField('website',this.value)" data-fkey="m-draft-website" placeholder="https://…" style="${M_FIELD_INPUT}">`)}
${mField('Phone', `<input value="${escapeHtml(d.phone || '')}" oninput="App.setDraftField('phone',this.value)" data-fkey="m-draft-phone" style="${M_FIELD_INPUT}">`)}
${mField('Email', `<input value="${escapeHtml(d.email || '')}" oninput="App.setDraftField('email',this.value)" data-fkey="m-draft-email" style="${M_FIELD_INPUT}">`)}
<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8b8781;margin-top:6px">Service tiers</div>
<button type="button" onclick="App.addTier()" style="height:48px;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:#8b8781;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">+ Add tier</button>
${tiers}
</div>
<div style="display:flex;gap:10px;padding:12px;border-top:1px solid #26262a;background:#0e0e10">
<button type="button" onclick="App.saveDraft()" style="flex:1;height:50px;background:#1c1512;border:1px solid #5a3a1c;border-radius:8px;color:var(--acc);font-size:13px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Save lab</button>
<button type="button" onclick="App.cancelDraft()" style="width:110px;height:50px;background:#141416;border:1px solid #2c2c30;border-radius:8px;color:#8b8781;font-size:13px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Cancel</button>
</div>
</div>`;
}

// Top-level mobile composer — mirrors desktop render()'s dispatch (draft
// modal > view), but as a self-contained page (own header/menu/toast/
// footer) rather than desktop's card-in-a-frame.
function renderMobile(s) {
    let body;
    if (s.draft !== null) {
        return (s.draftKind === 'film' ? renderMobileEditFilm(s) : renderMobileEditLab(s)) + renderMobileToast(s);
    }
    if (s.view === 'library') body = renderMobileLibrary(s);
    else if (s.view === 'expired') body = renderMobileExpired(s);
    else if (s.view === 'settings') body = renderSettingsView(s);
    else body = renderMobileLookup(s);
    return `<div style="min-height:100vh;background:radial-gradient(120% 80% at 50% -10%,#17171a 0%,#0b0b0c 60%);padding-bottom:48px">
${renderMobileHeader(s)}
${body}
${renderMobileFooter(s)}
</div>
${renderMobileMenu(s)}
${s.setupOpen ? renderSetupModal(s) : ''}
${renderMobileToast(s)}`;
}

async function initApp() {
    migrateFilmProfileKeys();
    migrateLegacyDefaultLabPref();
    state.homeLab = getHomeLab();
    state.defaultTier = getDefaultTierLabel();
    restoreFromShareLink();
    await loadOptions();
    // First-ever visit: no saved films/labs and Setup has never been
    // dismissed. Runs after loadOptions() (format/process dropdowns need
    // real data) but before the first render, so Setup is what greets a
    // brand new user instead of an empty calculator.
    if (localStorage.getItem('setupSeen') === null && !Object.keys(getAllFilms()).length && !Object.keys(getAllLabs()).length) {
        state.setupOpen = true;
    }
    render();
    loadDefaults();
}

document.addEventListener('DOMContentLoaded', initApp);
