// Theme system: dark/light toggle + custom colour themes (YAML files in
// themes/). DOM-driven (reads/writes localStorage and the page's
// <select> elements directly), unlike the pure calc engine in
// js/dev-cost-calc.js — this is UI wiring, not something unit-testable
// without a DOM. Loaded via a plain <script src> (no bundler); depends on
// js-yaml (loaded in <head>) and runs after the theme-related DOM
// elements (#themeToggle, #themeSelect, #setupThemeSelect) exist.
//
// Extracted from index.html as part of #61 (single-file app split).

const themeToggle = document.getElementById('themeToggle');
const lightIcon = document.getElementById('themeToggleLightIcon');
const darkIcon = document.getElementById('themeToggleDarkIcon');

function updateThemeIcons() {
    const isDark = document.documentElement.classList.contains('dark');
    // Sun icon shows when in dark mode (click it to go light)
    lightIcon.classList.toggle('hidden', !isDark);
    // Moon icon shows when in light mode (click it to go dark)
    darkIcon.classList.toggle('hidden', isDark);
}

themeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    updateThemeIcons();
    applyActiveTheme(); // re-apply so theme picks the right light/dark colours
});

updateThemeIcons();

// ---------- Custom themes (YAML files in themes/) ----------
// A theme file: { label, light: {pageBg,cardBg,accent,...}, dark: {...} }.
// We set CSS variables from whichever block matches the current mode, so
// the light/dark toggle keeps working inside any theme. Default = no
// theme (base Tailwind colours).
let loadedThemes = {}; // file -> parsed theme
let activeThemeFile = localStorage.getItem('activeTheme') || '';

// Optional per-result colors a theme can override — cheapest/
// recommended picks, favourited rows, your default lab, warnings,
// and over-limit/danger flags. Every one of these is always set to
// *something* whenever a theme is active (the theme's own color if
// it defines that slot, otherwise this app's normal default for the
// current light/dark mode) so a theme only needs to specify the
// slots it actually wants to change.
const SEMANTIC_THEME_DEFAULTS = {
    light: {
        cheapestBg: '#dcfce7', cheapestText: '#15803d',
        recommendedBg: '#fef3c7', recommendedText: '#b45309',
        favourite: '#f59e0b',
        defaultLab: '#4f46e5',
        warningBg: '#ffedd5', warningText: '#9a3412',
        dangerBg: '#fef2f2', dangerText: '#b91c1c',
        sectionBg: '#f1f5f9', sectionText: '#334155'
    },
    dark: {
        cheapestBg: '#052e16', cheapestText: '#4ade80',
        recommendedBg: '#451a03', recommendedText: '#fcd34d',
        favourite: '#fbbf24',
        defaultLab: '#818cf8',
        warningBg: '#431407', warningText: '#fdba74',
        dangerBg: '#450a0a', dangerText: '#f87171',
        sectionBg: '#1e293b80', sectionText: '#cbd5e1'
    }
};
const SEMANTIC_THEME_KEYS = Object.keys(SEMANTIC_THEME_DEFAULTS.light);
function semanticCssVar(key) {
    return `--theme-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`;
}

function applyThemeVars(theme) {
    const root = document.documentElement;
    if (!theme) {
        document.body.removeAttribute('data-theme-active');
        document.querySelector('.themed-card')?.removeAttribute('data-theme-active');
        root.style.removeProperty('--theme-page-bg');
        root.style.removeProperty('--theme-card-bg');
        root.style.removeProperty('--theme-accent');
        SEMANTIC_THEME_KEYS.forEach(key => root.style.removeProperty(semanticCssVar(key)));
        return;
    }
    const isDark = root.classList.contains('dark');
    const v = (isDark ? theme.dark : theme.light) || theme.light || theme.dark || {};
    if (v.pageBg) root.style.setProperty('--theme-page-bg', v.pageBg);
    if (v.cardBg) root.style.setProperty('--theme-card-bg', v.cardBg);
    if (v.accent) root.style.setProperty('--theme-accent', v.accent);
    const semanticDefaults = isDark ? SEMANTIC_THEME_DEFAULTS.dark : SEMANTIC_THEME_DEFAULTS.light;
    SEMANTIC_THEME_KEYS.forEach(key => {
        root.style.setProperty(semanticCssVar(key), v[key] || semanticDefaults[key]);
    });
    document.body.setAttribute('data-theme-active', '1');
    document.querySelector('.themed-card')?.setAttribute('data-theme-active', '1');
}

function applyActiveTheme() {
    applyThemeVars(activeThemeFile ? loadedThemes[activeThemeFile] : null);
}

// Settings and the first-run setup modal each have their own <select>
// over the same theme list, kept in sync so picking one updates the
// other (issue #43 — setup previously had no theme picker at all).
const themeSelects = () => [document.getElementById('themeSelect'), document.getElementById('setupThemeSelect')];

async function loadThemeList() {
    const selects = themeSelects();
    let manifest = [];
    try {
        const res = await fetch('themes/index.json');
        if (res.ok) manifest = await res.json();
    } catch { /* no themes folder / offline — default only */ }
    for (const entry of (Array.isArray(manifest) ? manifest : [])) {
        try {
            const r = await fetch(`themes/${entry.file}`);
            if (!r.ok) continue;
            const parsed = jsyaml.load(await r.text());
            if (!parsed || (!parsed.light && !parsed.dark)) continue;
            loadedThemes[entry.file] = parsed;
            for (const select of selects) {
                const opt = document.createElement('option');
                opt.value = entry.file;
                opt.textContent = parsed.label || entry.label || entry.file;
                select.appendChild(opt);
            }
        } catch { /* skip bad theme file */ }
    }
    // Restore saved selection if it loaded.
    if (activeThemeFile && loadedThemes[activeThemeFile]) {
        selects.forEach(select => select.value = activeThemeFile);
    } else {
        activeThemeFile = '';
    }
    applyActiveTheme();
}

themeSelects().forEach(select => select.addEventListener('change', (e) => {
    activeThemeFile = e.target.value;
    localStorage.setItem('activeTheme', activeThemeFile);
    themeSelects().forEach(other => { if (other !== e.target) other.value = activeThemeFile; });
    applyActiveTheme();
}));

loadThemeList();
