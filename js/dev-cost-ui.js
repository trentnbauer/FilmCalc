// Dev Cost tab: the four sub-views (Per ISO / Per Photo / Per Film /
// Per Lab) that browse and rank SAVED film/lab profiles, built on top
// of the pure calc functions in js/dev-cost-calc.js. Plain global
// functions (no bundler), same pattern as js/themes.js/js/modals.js/
// js/film-lookup.js -- shares index.html's global scope via
// <script src>, not an ES module. Depends on shared helpers left in
// index.html (escapeHtml, CUR, turnaroundLabels, isFavLab/isFavFilm/
// toggleFavLab/toggleFavFilm, labDirectionsUrl, the favouriteLabs/
// favouriteFilms Sets, setSubTabActive -- shared with the Library
// sub-nav -- and expandedIsoRows/expandAllIso, which Film Lookup's row
// expand/collapse also reuses) -- safe because every call happens
// from an event handler or after startup awaits resolve, never
// synchronously while this file itself is executing.
//
// Extracted from index.html as part of #61 (single-file app split).

// ---------- CSV export (issue #163) ----------
// Holds whatever rows the currently active Dev Cost sub-tab last
// rendered (same sort/filters already applied), so the shared "Export
// CSV" button (index.html, above the sub-nav) always exports exactly
// what's on screen without re-deriving anything itself. Each of the
// four sub-tab update() functions below calls setDevCostExportRows() at
// the end — with [] on their own "nothing to show yet" early-return
// paths, so the button disables itself rather than exporting stale or
// empty data.
let currentDevCostExportRows = [];
function setDevCostExportRows(rows) {
    currentDevCostExportRows = rows;
    const btn = document.getElementById('devCostExportCsvBtn');
    if (btn) btn.disabled = rows.length === 0;
}
function csvEscape(value) {
    const s = String(value ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function rowsToCsv(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    rows.forEach(row => lines.push(headers.map(h => csvEscape(row[h])).join(',')));
    return lines.join('\r\n');
}
document.getElementById('devCostExportCsvBtn').addEventListener('click', () => {
    if (!currentDevCostExportRows.length) return;
    const blob = new Blob([rowsToCsv(currentDevCostExportRows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `filmcalc-${activeCheapestSubTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
});
// Shared row shape for the three native-matrix views (Per Photo/Lab/Film) —
// see computeNativeFilmLabMatrix() in js/dev-cost-calc.js for the fields
// read here.
function matrixEntryToExportRow(entry) {
    return {
        Film: entry.filmName,
        'Box Speed (ISO)': entry.boxSpeed,
        Lab: entry.labName,
        'Hi-Res': entry.highResScan ? 'Yes' : 'No',
        TIFF: entry.tiffScan ? 'Yes' : 'No',
        Turnaround: turnaroundLabels[entry.turnaroundTime] || entry.turnaroundTime || '',
        'Film Cost / Photo': entry.filmCostPerPhoto.toFixed(2),
        'Dev Cost / Photo': entry.devCostPerPhoto.toFixed(2),
        'Total Cost / Photo': entry.totalCostPerPhoto.toFixed(2),
        'Total Cost / Roll': entry.totalCostPerRoll.toFixed(2)
    };
}
// Per ISO's own row shape — same core fields, plus which bucket (native/
// pushed/pulled) and by how many stops, which the matrix views don't have.
function isoEntryToExportRow(entry, bucketLabel) {
    return {
        Film: entry.filmName,
        Lab: entry.labName,
        Bucket: bucketLabel,
        Stops: entry.stops,
        'Over Push/Pull Limit': entry.overLimit ? 'Yes' : 'No',
        'Hi-Res': entry.highResScan ? 'Yes' : 'No',
        TIFF: entry.tiffScan ? 'Yes' : 'No',
        Turnaround: turnaroundLabels[entry.turnaroundTime] || entry.turnaroundTime || '',
        'Film Cost / Photo': entry.filmCostPerPhoto.toFixed(2),
        'Dev Cost / Photo': entry.devCostPerPhoto.toFixed(2),
        'Total Cost / Photo': entry.totalCostPerPhoto.toFixed(2),
        'Total Cost / Roll': entry.totalCostPerRoll.toFixed(2)
    };
}

// Renders the same "cheapest hi-res + fastest" recommendation Film Lookup
// shows as its own card, but as a single-line note attached under a row —
// the { pick, premium, baselineCostPerPhoto } shape computed by
// findHiResFastestUpgrade() (js/dev-cost-calc.js) for Per Film/Photo, or
// inlined directly in computeIsoPriceOptions() for Per ISO.
function renderUpgradeNote(upgrade) {
    if (!upgrade) return '';
    const { pick, premium, baselineCostPerPhoto } = upgrade;
    // A tie (or near-tie) in the underlying data is common enough — two
    // labs' dev + push/pull fees can land on the exact same total — that
    // "only 0.0% more" reads oddly; "costs the same" is the honest phrasing.
    const costPhrase = premium < 0.001
        ? t('upgradeNoteCostsSame', { amount: `${CUR()}${pick.totalCostPerPhoto.toFixed(2)}` })
        : t('upgradeNoteCostsMore', { percent: (premium * 100).toFixed(1), amount: `${CUR()}${pick.totalCostPerPhoto.toFixed(2)}`, baseline: `${CUR()}${baselineCostPerPhoto.toFixed(2)}` });
    return `<div class="text-xs theme-recommended-text text-amber-700 dark:text-amber-400 mt-0.5">${t('upgradeNoteText', { costPhrase, labName: escapeHtml(pick.labName) })}</div>`;
}

// ---------- Dev Cost tab's Per ISO / Per Photo / Per Film / Per Lab sub-nav ----------
const cheapestSubTabs = {
    iso: { btn: document.getElementById('cheapestSubIsoBtn'), content: document.getElementById('cheapestSubIsoContent'), update: () => updateIsoPriceCalculator() },
    photo: { btn: document.getElementById('cheapestSubPhotoBtn'), content: document.getElementById('cheapestSubPhotoContent'), update: () => updateCostPerPhotoTab() },
    film: { btn: document.getElementById('cheapestSubFilmBtn'), content: document.getElementById('cheapestSubFilmContent'), update: () => updateCostPerFilmTab() },
    lab: { btn: document.getElementById('cheapestSubLabBtn'), content: document.getElementById('cheapestSubLabContent'), update: () => updateCostPerLabTab() }
};
let activeCheapestSubTab = 'film';


function switchCheapestSubTab(sub) {
    activeCheapestSubTab = sub;
    Object.keys(cheapestSubTabs).forEach(key => {
        const active = key === sub;
        cheapestSubTabs[key].content.classList.toggle('hidden', !active);
        setSubTabActive(cheapestSubTabs[key].btn, active);
    });
    renderDevCostActiveFilters();
    cheapestSubTabs[sub].update();
}

function refreshActiveCheapestSubTab() {
    renderDevCostActiveFilters();
    cheapestSubTabs[activeCheapestSubTab].update();
}

Object.keys(cheapestSubTabs).forEach(key => cheapestSubTabs[key].btn.addEventListener('click', () => switchCheapestSubTab(key)));
document.getElementById('cheapestFilmSelect').addEventListener('change', () => updateCostPerFilmTab());

// Builds a link encoding the currently-selected film plus the active
// Format/Process filters, so opening it later (or sending it to someone
// else) reopens Lab Costs -> Per Film with the same comparison already
// showing — mirrors Film Lookup's own Share Link button (issue #160),
// just for a saved-library comparison instead of a manual one-off roll.
// See applyUrlParams()'s ?cheapestFilm= handling in index.html.
document.getElementById('cheapestFilmShareBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const filmValue = document.getElementById('cheapestFilmSelect').value;
    if (!filmValue) return;
    const params = new URLSearchParams();
    params.set('cheapestFilm', filmValue);
    params.set('format', cheapestFormat);
    if (cheapestProcess && cheapestProcess !== 'ALL') params.set('process', cheapestProcess);
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    const statusEl = document.getElementById('cheapestFilmShareStatus');
    try {
        await navigator.clipboard.writeText(url);
        statusEl.textContent = t('copyLinkStatus');
    } catch {
        statusEl.textContent = url;
    }
    clearTimeout(btn._shareStatusTimer);
    btn._shareStatusTimer = setTimeout(() => { statusEl.textContent = ''; }, 3000);
});

// ---------- ISO Price Calculator ----------
// For a given shooting ISO, lists every saved film that could reach
// it — shot natively at box speed, pushed up from a slower film, or
// pulled down from a faster one — each paired with its cheapest
// compatible lab. Every film stock is included regardless of whether
// it beats the film's own Max Push/Pull limit; entries that exceed
// that limit are flagged rather than hidden, since a film is still a
// valid (if inadvisable) option.
// Sort mode for the Cheapest Per ISO view. Persisted so a re-open keeps
// the last choice. 'price' | 'turnaround' | 'scan'.
let cheapestSort = localStorage.getItem('cheapestSort') || 'price';
// Dev Cost filters — Next Day / Same Week / Hi-Res, shared across all
// four sub-tabs (Per Film / Per Photo / Per Lab / Per ISO) via one
// filter bar shown above the sub-nav (issue #49 — this used to only
// apply to Per ISO). Same idea as Film Lookup's Next Day / Hi-Res
// filter pills, not persisted across reloads (matches that
// precedent). devCostFilterTurnaround is '' (all), 'next_day', or
// 'same_week' — mutually exclusive, so it's a single value rather
// than a set.
let devCostFilterTurnaround = '';
let devCostFilterHiRes = false;
let devCostFilterTiff = false;
// Per ISO only (issue: sorting a push/pull list by price alone let a
// cheap-but-over-limit option outrank film that's actually within its own
// Max Push/Pull range — see sortIsoEntries() in js/dev-cost-calc.js for
// the ranking fix; this toggle goes a step further and hides over-limit
// options entirely). Not persisted, matching the filter pills above.
let isoHideOverLimit = false;
// Mail-back shipping toggle (issue #179) — off by default: a saved lab's
// mailBackCost used to be baked unconditionally into every cost comparison,
// which overstated the true cost for a lab you normally drop off at /
// pick up from in person and only occasionally need to mail a return to.
// Opt in per browsing session (not persisted, matches the filter pills
// above), with a roll count so mailing several rolls back together splits
// one flat postage fee across them instead of charging it in full to
// each roll on its own. Unlike the filter pills, this isn't a row filter
// — it changes the cost itself — so it's threaded into baseOpts (see each
// sub-tab's update function below), not devCostFilters.
let devCostIncludeMailBack = false;
let devCostMailBackRollCount = 1;
// Manually-entered cost of mailing the film TO the lab (issue #190) — a
// saved lab profile only ever states return postage, never this outbound
// leg (that's priced by whatever courier the customer picks, not the
// lab), so it can't come from tier.mailBackCost. Blank/0 means drop-off.
// Split across the same roll count as the return fee, on the assumption
// rolls mailed together go both ways together.
let devCostMailToLabFee = 0;
// Spread into every opts object passed to the calc-layer compute
// functions below, so the mail-back toggle/roll count affect every Dev
// Cost sub-tab the same way process/format/camera120Exposures already do.
function mailBackOpts() {
    return { includeMailBack: devCostIncludeMailBack, mailBackRollCount: devCostMailBackRollCount, mailToLabFee: devCostMailToLabFee };
}
function renderDevCostFilterBar() {
    document.querySelectorAll('.dev-cost-filter-pill').forEach(btn => {
        const active = btn.dataset.filter === 'hires' ? devCostFilterHiRes
            : btn.dataset.filter === 'tiff' ? devCostFilterTiff
            : devCostFilterTurnaround === btn.dataset.filter;
        btn.classList.toggle('bg-indigo-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('bg-gray-100', !active);
        btn.classList.toggle('dark:bg-gray-700', !active);
        btn.classList.toggle('text-gray-600', !active);
        btn.classList.toggle('dark:text-gray-300', !active);
    });
}
document.querySelectorAll('.dev-cost-filter-pill').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.filter === 'hires') {
        devCostFilterHiRes = !devCostFilterHiRes;
    } else if (btn.dataset.filter === 'tiff') {
        devCostFilterTiff = !devCostFilterTiff;
    } else {
        devCostFilterTurnaround = devCostFilterTurnaround === btn.dataset.filter ? '' : btn.dataset.filter;
    }
    renderDevCostFilterBar();
    refreshActiveCheapestSubTab();
}));

// Mail-back shipping toggle + roll count (issue #179) — the roll count
// input only makes sense once the toggle is on, so it stays hidden until
// then. Both live in the same filter-bar area as the pills above, wired
// separately since the roll count needs its own 'input' listener.
const devCostMailBackToggle = document.getElementById('devCostIncludeMailBackToggle');
const devCostMailBackRollCountWrap = document.getElementById('devCostMailBackRollCountWrap');
const devCostMailBackRollCountInput = document.getElementById('devCostMailBackRollCount');
const devCostMailToLabFeeInput = document.getElementById('devCostMailToLabFee');
// Swaps hidden/flex rather than toggling 'hidden' alone — devCostMailBackRollCountWrap
// needs actual flex layout (items-center/gap-1.5) once shown, same pattern as
// index.html's #adSlot.
function setMailBackRollCountWrapVisible(visible) {
    if (!devCostMailBackRollCountWrap) return;
    devCostMailBackRollCountWrap.classList.toggle('hidden', !visible);
    devCostMailBackRollCountWrap.classList.toggle('flex', visible);
}
if (devCostMailBackToggle) {
    devCostMailBackToggle.addEventListener('change', () => {
        devCostIncludeMailBack = devCostMailBackToggle.checked;
        setMailBackRollCountWrapVisible(devCostIncludeMailBack);
        refreshActiveCheapestSubTab();
    });
}
if (devCostMailBackRollCountInput) {
    devCostMailBackRollCountInput.addEventListener('input', () => {
        devCostMailBackRollCount = Math.max(1, parseInt(devCostMailBackRollCountInput.value) || 1);
        refreshActiveCheapestSubTab();
    });
}
if (devCostMailToLabFeeInput) {
    devCostMailToLabFeeInput.addEventListener('input', () => {
        devCostMailToLabFee = parseFloat(devCostMailToLabFeeInput.value) || 0;
        refreshActiveCheapestSubTab();
    });
}

// Consolidated "what's narrowing these results" row (see #devCostActiveFilters
// in index.html) — the Process select and the filter pills above each show
// their own active state individually, but an empty results list otherwise
// gives no single place to see (or clear) everything that's currently
// filtering it out. Format is deliberately excluded: it isn't really an
// optional filter (a camera is always one format), and its own dropdown is
// already visible right above this row. Called from switchCheapestSubTab()/
// refreshActiveCheapestSubTab() (covers pill + sub-tab changes) and from
// index.html's applyGlobalFilterChange() (covers the Process dropdown).
function renderDevCostActiveFilters() {
    const el = document.getElementById('devCostActiveFilters');
    if (!el) return;
    const chips = [];
    if (typeof cheapestProcess !== 'undefined' && cheapestProcess && cheapestProcess !== 'ALL') {
        const label = (typeof PROCESS_OPTIONS !== 'undefined' && PROCESS_OPTIONS.find(o => o.value === cheapestProcess)?.label) || cheapestProcess;
        chips.push({
            label: t('processFilterChip', { label }),
            clear: () => {
                cheapestProcess = 'ALL';
                localStorage.setItem('globalProcess', cheapestProcess);
                const gp = document.getElementById('globalProcess');
                if (gp) gp.value = cheapestProcess;
                refreshActiveCheapestSubTab();
            }
        });
    }
    if (devCostFilterTurnaround) {
        chips.push({
            label: devCostFilterTurnaround === 'next_day' ? t('nextDayFilterChip') : t('sameWeekFilterChip'),
            clear: () => { devCostFilterTurnaround = ''; renderDevCostFilterBar(); refreshActiveCheapestSubTab(); }
        });
    }
    if (devCostFilterHiRes) chips.push({ label: t('hiResBadgeLabel'), clear: () => { devCostFilterHiRes = false; renderDevCostFilterBar(); refreshActiveCheapestSubTab(); } });
    if (devCostFilterTiff) chips.push({ label: t('tiffBadgeLabel'), clear: () => { devCostFilterTiff = false; renderDevCostFilterBar(); refreshActiveCheapestSubTab(); } });
    // Per ISO only — the toggle pill lives inside updateIsoPriceCalculator()'s
    // own controls row, not the shared filter bar above, since "over its
    // push/pull limit" is a concept only Per ISO's push/pull rows have.
    if (isoHideOverLimit && activeCheapestSubTab === 'iso') {
        chips.push({ label: t('hideOverLimitLabel'), clear: () => { isoHideOverLimit = false; refreshActiveCheapestSubTab(); } });
    }
    if (devCostIncludeMailBack) {
        const mailToLabSuffix = devCostMailToLabFee > 0 ? t('mailToLabSuffix', { amount: `${CUR()}${devCostMailToLabFee.toFixed(2)}` }) : '';
        chips.push({
            label: t('mailBackFilterChip', { count: devCostMailBackRollCount, suffix: mailToLabSuffix }),
            clear: () => {
                devCostIncludeMailBack = false;
                devCostMailToLabFee = 0;
                if (devCostMailBackToggle) devCostMailBackToggle.checked = false;
                if (devCostMailToLabFeeInput) devCostMailToLabFeeInput.value = '';
                setMailBackRollCountWrapVisible(false);
                refreshActiveCheapestSubTab();
            }
        });
    }

    if (!chips.length) {
        el.innerHTML = '';
        el.classList.add('hidden');
        return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `<span class="text-xs text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wide">${t('activeFiltersLabel')}</span>` +
        chips.map((c, i) => `<button type="button" data-chip-index="${i}" class="active-filter-chip inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/70 transition-colors" title="${t('clearFilterTitle')}">${escapeHtml(c.label)} <span aria-hidden="true">✕</span></button>`).join('');
    el.querySelectorAll('.active-filter-chip').forEach(btn => btn.addEventListener('click', () => chips[parseInt(btn.dataset.chipIndex)].clear()));
}
// sortIsoEntries(), pickIsoCandidate(), and computeIsoPriceOptions()
// now live in js/dev-cost-calc.js (loaded above, shared global
// scope) — see that file for the calculation logic and
// tests/dev-cost-calc.test.js for coverage.

// Tracks which ISO rows are expanded (by a stable key), so re-renders
// (sort changes, ISO tweaks) preserve open/closed state.

function isoRowKey(entry) {
    return `${entry.filmName}|${entry.labName}|${entry.stops}`;
}

// ---------- Shared row-rendering fragments (issue #93) ----------
// renderIsoRow (Per ISO) and renderMatrixRow (Per Film/Photo/Lab) build
// visually distinct rows — Per ISO has push/pull direction + an
// over-limit danger state; the matrix rows juggle three different
// star/pin roles depending on which view they're in — so they aren't
// unified into one shell, but the pieces that genuinely are identical
// (badges, footer links, and the expanded cost breakdown) are shared
// here instead of duplicated in both.

// Hi-res/TIFF/turnaround badges shown on every Dev Cost row.
function renderRowBadges(entry) {
    const hiResBadge = entry.highResScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 align-middle">${t('hiResBadgeLabel')}</span>` : '';
    const tiffBadge = entry.tiffScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 align-middle">${t('tiffBadgeLabel')}</span>` : '';
    const turnaroundBadge = entry.turnaroundTime ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 align-middle">${escapeHtml(turnaroundLabels[entry.turnaroundTime] || entry.turnaroundTime)}</span>` : '';
    return hiResBadge + tiffBadge + turnaroundBadge;
}

// "Scan" line shown in every Dev Cost row's expanded breakdown — a tier can
// be hi-res, TIFF, both, or neither, independently.
function scanLabel(entry) {
    const parts = [];
    if (entry.highResScan) parts.push(t('dcHiResScanLabel'));
    if (entry.tiffScan) parts.push(t('tiffBadgeLabel'));
    return parts.length ? parts.join(' + ') : t('standardScanLabel');
}

// Expand/collapse chevron shown on every Dev Cost row.
function renderRowChevron(isOpen) {
    return `<span class="text-gray-400 dark:text-gray-500 transition-transform inline-block ${isOpen ? 'rotate-90' : ''}">▸</span>`;
}

// "Buy film" / "Get directions" links shown in every row's expanded
// breakdown, when the entry has a buy link and/or a geocodable lab
// address.
function renderRowFooterLinks(entry) {
    const buyUrl = sanitizeUrl(entry.buyLink);
    const locality = bundleLocalityLabel(entry);
    const localityBadge = locality ? ` <span class="text-amber-600 dark:text-amber-400" title="${t('localityOnlyTitle', { locality: escapeHtml(locality.replace(/ only$/, '')) })}">(${escapeHtml(locality)})</span>` : '';
    const buyLink = buyUrl
        ? `<a href="${escapeHtml(buyUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:underline">${entry.storeName ? t('dcBuyFromLabel', { storeName: escapeHtml(entry.storeName) }) : t('buyFilmLabel')}</a>${localityBadge}`
        : '';
    const dirUrl = labDirectionsUrl(entry.labName);
    const directionsLink = dirUrl
        ? `<a href="${escapeHtml(dirUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-xs px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:underline">${t('directionsLinkLabel')}</a>`
        : '';
    return (buyLink || directionsLink)
        ? `<div class="pt-1.5 flex justify-between items-center gap-2"><span>${buyLink}</span><span>${directionsLink}</span></div>`
        : '';
}

// Expanded per-photo/per-roll cost breakdown shown on every Dev Cost row
// (Per ISO/Photo/Film/Lab) when it's tapped open.
function renderRowBreakdown(entry, isOpen) {
    if (!isOpen) return '';
    return `<div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-1">
            <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('filmPerPhotoLabel')}</span><span class="font-mono">${CUR()}${entry.filmCostPerPhoto.toFixed(2)}</span></div>
            <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('developmentPerPhotoLabel')} <span class="opacity-60">${t('devRollDivExpNote', { exposures: entry.exposures })}</span></span><span class="font-mono">${CUR()}${(entry.devCostBase / entry.exposures).toFixed(2)}</span></div>
            ${entry.pushPullFee > 0 ? `<div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('pushPullFeePerPhotoLabel')}</span><span class="font-mono">${CUR()}${(entry.pushPullFee / entry.exposures).toFixed(2)}</span></div>` : ''}
            ${entry.mailBackFee > 0 ? `<div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('mailShippingPerPhotoLabel')}</span><span class="font-mono">${CUR()}${(entry.mailBackFee / entry.exposures).toFixed(2)}</span></div>` : ''}
            <div class="flex justify-between text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>${t('filmCostPerRollLabel')}</span><span class="font-mono">${CUR()}${entry.filmCostPerRoll.toFixed(2)}</span></div>
            <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('developmentPerRollLabel')}</span><span class="font-mono">${CUR()}${entry.devCostPerRoll.toFixed(2)}</span></div>
            <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>${t('scanRowLabel')}</span><span>${scanLabel(entry)}</span></div>
            <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>${t('turnaroundRowLabel')}</span><span>${escapeHtml(turnaroundLabels[entry.turnaroundTime] || entry.turnaroundTime || '—')}</span></div>
            <div class="flex justify-between font-semibold text-gray-700 dark:text-gray-300 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>${t('totalPerRollLabel', { exposures: entry.exposures })}</span><span class="font-mono">${CUR()}${entry.totalCostPerRoll.toFixed(2)}</span></div>
            ${renderRowFooterLinks(entry)}
        </div>`;
}

function renderIsoRow(entry, rank, pinReason) {
    const badges = renderRowBadges(entry);
    const direction = entry.stops > 0 ? t('pushDirectionLabel') : t('pullDirectionLabel');
    const stopsLabel = entry.stops !== 0
        ? ` <span class="text-xs ${entry.overLimit ? 'theme-danger-text text-red-600 dark:text-red-400 font-semibold' : 'opacity-70'}">(${t('stopsSummary', { direction, n: Math.abs(entry.stops), plural: Math.abs(entry.stops) === 1 ? '' : 's' })}${entry.overLimit ? t('overLimitSuffix', { limit: entry.maxPushPull }) : ''})</span>`
        : '';
    const isCheapest = rank === 0;
    const semanticRowBg = entry.overLimit ? 'theme-danger-bg' : (isCheapest ? 'theme-cheapest-bg' : '');
    const semanticRowText = entry.overLimit ? 'theme-danger-text' : (isCheapest ? 'theme-cheapest-text' : '');
    const rowBg = entry.overLimit ? 'bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700' : (isCheapest ? 'bg-green-100 dark:bg-green-900/30' : (pinReason ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-white dark:bg-gray-800/50'));
    const textColor = entry.overLimit ? 'text-red-700 dark:text-red-400' : (isCheapest ? 'text-green-800 dark:text-green-400 font-semibold' : 'text-gray-700 dark:text-gray-300');
    const fav = isFavLab(entry.labName);
    const star = `<button type="button" class="fav-star text-sm leading-none" data-fav-lab="${escapeHtml(entry.labName)}" title="${fav ? t('unfavouriteLabTitle') : t('favouriteLabTitle')}" aria-label="${fav ? t('unfavouriteLabTitle') : t('favouriteLabTitle')}" onclick="event.stopPropagation()"><span class="${fav ? 'theme-favourite-text text-amber-400' : 'text-gray-300 dark:text-gray-600'}">${fav ? '★' : '☆'}</span></button>`;
    const pinnedFavNote = pinReason === 'default'
        ? `<div class="text-xs theme-default-lab-text text-indigo-600 dark:text-indigo-400 mt-0.5">${t('shownFirstDefaultLab')}</div>`
        : pinReason
            ? `<div class="text-xs theme-favourite-text text-indigo-600 dark:text-indigo-400 mt-0.5">${t('shownFirstFavouriteLabPin')}</div>`
            : '';
    const upgradeNote = renderUpgradeNote(entry.upgrade);

    const key = isoRowKey(entry);
    const isOpen = expandAllIso || expandedIsoRows.has(key);
    const chevron = renderRowChevron(isOpen);
    const breakdown = renderRowBreakdown(entry, isOpen);

    return `<div>
        <div class="iso-row cursor-pointer px-3 py-2 rounded-lg text-sm ${semanticRowBg} ${rowBg}" data-iso-key="${escapeHtml(key)}" title="${t('tapForBreakdownTitle')}">
            <div class="flex justify-between items-start gap-2">
                <span class="${semanticRowText} ${entry.overLimit ? 'font-semibold text-red-700 dark:text-red-400' : (isCheapest ? 'font-semibold text-green-800 dark:text-green-400' : 'text-gray-700 dark:text-gray-300')}">${star} ${isCheapest && !entry.overLimit ? '⭐ ' : ''}${escapeHtml(entry.filmName)} <span class="opacity-70 font-normal">@ ${escapeHtml(entry.labName)}</span>${stopsLabel}${badges}</span>
                <span class="font-mono text-right leading-tight ${semanticRowText} ${textColor} whitespace-nowrap flex items-center gap-1.5">
                    <span>
                        <span class="font-semibold block">${CUR()}${entry.totalCostPerPhoto.toFixed(2)}/photo</span>
                        <span class="text-xs opacity-70 font-normal block">${CUR()}${entry.devCostPerRoll.toFixed(2)}/roll dev</span>
                    </span>
                    ${chevron}
                </span>
            </div>
            ${pinnedFavNote}
            ${upgradeNote}
            ${breakdown}
        </div>
    </div>`;
}

function updateIsoPriceCalculator() {
    const container = document.getElementById('isoCalcResults');
    const targetIso = parseInt(document.getElementById('isoCalcTargetSpeed').value) || 0;
    if (!targetIso) {
        container.innerHTML = `<p class="text-sm text-gray-400 text-center">${t('enterIsoToCompareMessage')}</p>`;
        setDevCostExportRows([]);
        return;
    }

    const allFilms = getAllFilms();
    const allLabs = getAllLabs();
    const hasFilms = Object.values(allFilms).some(f => !f.hidden && (parseInt(f.boxSpeed) || 0) > 0);
    const hasLabs = Object.values(allLabs).some(l => !l.hidden);
    if (!hasFilms || !hasLabs) {
        container.innerHTML = `<p class="text-sm text-gray-400 text-center">${t('emptyLibraryMessage')}</p>`;
        setDevCostExportRows([]);
        return;
    }

    // The home (default) lab and any favourited labs are always
    // surfaced by computeIsoPriceOptions() even if beaten on price
    // (see pinnedLabNames in js/dev-cost-calc.js); upgradeThresholdPercent
    // drives the "recommended upgrade" badge. Both are read from
    // localStorage here (not inside the pure calc function) and
    // passed in explicitly.
    const pinnedLabNames = new Set([getDefaultLabPref()?.lab, ...favouriteLabs].filter(Boolean));
    const upgradeThresholdPercent = parseFloat(localStorage.getItem('upgradeThresholdPercent')) || 4;
    const baseOpts = { process: cheapestProcess, format: cheapestFormat, sortMode: cheapestSort, pinnedLabNames, upgradeThresholdPercent, camera120Exposures: camera120OverrideExposures(), ...mailBackOpts() };

    const { native: allNative, push: allPush, pull: allPull } = computeIsoPriceOptions(targetIso, allFilms, allLabs, baseOpts);
    // Next Day / Same Week / Hi-Res filters need to pick the cheapest
    // MATCHING tier per film (recomputed here), not just filter the
    // unfiltered cheapest-overall pick above — a film's cheapest lab
    // tier is rarely the hi-res one, so filtering after the fact would
    // wrongly drop films that do have a matching tier at another lab.
    // allNative/allPush/allPull (unfiltered) are kept only to tell
    // "no matches for this filter" apart from "no film at this ISO at
    // all" in the messaging below.
    const hasActiveDevCostFilter = devCostFilterTurnaround || devCostFilterHiRes || devCostFilterTiff;
    const { native: filteredNative, push: filteredPush, pull: filteredPull } = hasActiveDevCostFilter
        ? computeIsoPriceOptions(targetIso, allFilms, allLabs, { ...baseOpts, turnaround: devCostFilterTurnaround, hiRes: devCostFilterHiRes, tiff: devCostFilterTiff })
        : { native: allNative, push: allPush, pull: allPull };
    // "Hide over-limit" (issue: sorting alone still left over-limit push/pull
    // options visible, just lower down — some users want them gone entirely,
    // e.g. once they've confirmed nothing at this ISO is actually in range).
    // Applied after the turnaround/hi-res/tiff filter above, same as any
    // other narrowing step. native is never over-limit (0 stops), so this
    // only ever removes push/pull rows in practice.
    const native = isoHideOverLimit ? filteredNative.filter(e => !e.overLimit) : filteredNative;
    const push = isoHideOverLimit ? filteredPush.filter(e => !e.overLimit) : filteredPush;
    const pull = isoHideOverLimit ? filteredPull.filter(e => !e.overLimit) : filteredPull;
    const sortedNative = sortIsoEntries(native, cheapestSort);
    const sortedPush = sortIsoEntries(push, cheapestSort);
    const sortedPull = sortIsoEntries(pull, cheapestSort);

    // Rank for the ⭐ marker is always by price (cheapest), independent
    // of the chosen sort — so "cheapest" stays meaningful even when
    // sorting by turnaround or scan.
    const priceRank = (entries, entry) => entries.slice().sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto).indexOf(entry);
    // The configured default (home) lab's own CHEAPEST film at this ISO is
    // pinned first, ahead of favourited labs' own cheapest picks, the same
    // way Per Film pins it — so "my lab" always surfaces even when it's
    // neither the cheapest nor starred as a favourite. Only that single
    // row per lab is pinned/labelled (see reorderDefaultLabFirst /
    // reorderFavouriteLabsFirst in dev-cost-calc.js) — a lab can have a row
    // for every film it's shown for, and pinning + labelling ALL of them
    // used to bury the price-sorted list under a wall of "my home lab"
    // entries instead of surfacing just its best option.
    const defaultLabName = getDefaultLabPref()?.lab || null;
    const renderBucket = (sorted, all) => {
        const cheapestPerLab = new Map();
        all.slice().sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto)
            .forEach(e => { if (!cheapestPerLab.has(e.labName)) cheapestPerLab.set(e.labName, e); });
        return reorderDefaultLabFirst(reorderFavouriteLabsFirst(sorted, favouriteLabs), defaultLabName).map(e => {
            const rank = priceRank(all, e);
            const isLabsCheapest = cheapestPerLab.get(e.labName) === e;
            const pinReason = (isLabsCheapest && e.labName === defaultLabName && rank !== 0)
                ? 'default'
                : (isLabsCheapest && isFavLab(e.labName) && rank !== 0);
            return renderIsoRow(e, rank, pinReason);
        }).join('');
    };

    const noMatchMsg = (allBucket, emptyMsg) => `<p class="text-xs text-gray-400 text-center py-2">${allBucket.length ? t('noOptionsMatchFilters') : emptyMsg}</p>`;
    const nativeHtml = native.length
        ? renderBucket(sortedNative, native)
        : noMatchMsg(allNative, t('noNativeFilmAtIsoMessage'));
    const pushHtml = push.length
        ? renderBucket(sortedPush, push)
        : noMatchMsg(allPush, t('noFilmCanBePushedMessage'));
    const pullHtml = pull.length
        ? renderBucket(sortedPull, pull)
        : noMatchMsg(allPull, t('noFilmCanBePulledMessage'));

    const sortPill = (mode, label, title) => `<button type="button" data-sort="${mode}" title="${title}" class="cheapest-sort-pill px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${cheapestSort === mode ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}">${label}</button>`;
    const hideOverLimitPill = `<button type="button" id="isoHideOverLimitBtn" title="${t('hideOverLimitTitle')}" aria-pressed="${isoHideOverLimit}" class="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${isoHideOverLimit ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}">${t('hideOverLimitLabel')}</button>`;
    const controls = `<div class="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wide">${t('sortLabel')}</span>
            ${sortPill('price', t('sortByPriceLabel'), t('sortByPriceTitle'))}
            ${sortPill('turnaround', t('turnaroundRowLabel'), t('sortByTurnaroundTitle'))}
            ${sortPill('scan', t('scanRowLabel'), t('sortByScanTitle'))}
            ${hideOverLimitPill}
        </div>
        <button type="button" id="isoExpandAllBtn" class="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">${expandAllIso ? t('collapseAllLabel') : t('expandAllLabel')}</button>
    </div>`;

    container.innerHTML = controls + `<div class="space-y-4">
        <div>
            <h3 class="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-2">${t('nativeIsoHeading', { iso: targetIso })}</h3>
            <div class="space-y-1.5">${nativeHtml}</div>
        </div>
        <div>
            <h3 class="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">${t('pushedToIsoHeading', { iso: targetIso })}</h3>
            <div class="space-y-1.5">${pushHtml}</div>
        </div>
        <div>
            <h3 class="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-2">${t('pulledToIsoHeading', { iso: targetIso })}</h3>
            <div class="space-y-1.5">${pullHtml}</div>
        </div>
    </div>`;

    setDevCostExportRows([
        ...sortedNative.map(e => isoEntryToExportRow(e, 'Native')),
        ...sortedPush.map(e => isoEntryToExportRow(e, 'Pushed')),
        ...sortedPull.map(e => isoEntryToExportRow(e, 'Pulled'))
    ]);

    // Wire sort pills.
    container.querySelectorAll('.cheapest-sort-pill').forEach(btn => btn.addEventListener('click', () => {
        cheapestSort = btn.dataset.sort;
        localStorage.setItem('cheapestSort', cheapestSort);
        updateIsoPriceCalculator();
    }));
    // Hide-over-limit toggle.
    const hideOverLimitBtn = document.getElementById('isoHideOverLimitBtn');
    if (hideOverLimitBtn) hideOverLimitBtn.addEventListener('click', () => {
        isoHideOverLimit = !isoHideOverLimit;
        refreshActiveCheapestSubTab();
    });
    // Favourite-lab stars.
    container.querySelectorAll('.fav-star').forEach(star => star.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavLab(star.dataset.favLab);
        updateIsoPriceCalculator();
    }));
    // Expand-all toggle.
    const expandAllBtn = document.getElementById('isoExpandAllBtn');
    if (expandAllBtn) expandAllBtn.addEventListener('click', () => {
        expandAllIso = !expandAllIso;
        if (!expandAllIso) expandedIsoRows.clear();
        updateIsoPriceCalculator();
    });
    // Per-row expand/collapse.
    container.querySelectorAll('.iso-row').forEach(row => row.addEventListener('click', () => {
        const key = row.dataset.isoKey;
        if (expandAllIso) {
            // Leaving expand-all: seed the set with all currently-open rows,
            // then toggle this one closed.
            container.querySelectorAll('.iso-row').forEach(r => expandedIsoRows.add(r.dataset.isoKey));
            expandAllIso = false;
            expandedIsoRows.delete(key);
        } else if (expandedIsoRows.has(key)) {
            expandedIsoRows.delete(key);
        } else {
            expandedIsoRows.add(key);
        }
        updateIsoPriceCalculator();
    }));
}


// Debounced: each keystroke would otherwise re-parse localStorage and
// recompute the full film×lab×tier cross-product from scratch (#95).
let isoCalcTargetSpeedDebounce;
document.getElementById('isoCalcTargetSpeed').addEventListener('input', () => {
    clearTimeout(isoCalcTargetSpeedDebounce);
    isoCalcTargetSpeedDebounce = setTimeout(updateIsoPriceCalculator, 150);
});

// ---------- Cost Per Photo / Cost Per Lab (native, no push/pull) ----------
// computeNativeFilmLabMatrix() and computeOneStopFilmLabMatrix() now
// live in js/dev-cost-calc.js (loaded above, shared global scope) —
// the shared datasets behind the "Cost Per Photo" (grouped/ranked by
// film) and "Cost Per Lab" (grouped/ranked by lab) tabs below.
// computeOneStopFilmLabMatrix() is the same shape, but every pairing
// is priced with exactly 1 stop of push/pull applied.

// Issue #96: Per Film/Per Photo/Per Lab were re-deriving the full film×lab
// cross product from scratch on every render, even when only a row
// expand/collapse, a favourite toggle, or switching between these three
// tabs triggered it and the saved film/lab data hadn't actually changed.
// Wraps each pure compute function in a single-entry cache keyed on the
// raw filmProfiles/labProfiles localStorage strings — a save, delete, or
// import naturally changes that string, so there's no separate "dirty"
// flag to remember to set — plus process/format/turnaround/hiRes, the only
// opts that change what the matrix itself contains. Shared across every
// call site below, so switching sub-tabs at the same filter state reuses
// the same cached result, not just repeat calls to the same function.
// defaultFilms/defaultLabs (config.yaml) aren't part of the key since they
// only ever populate once, before startup's loadDefaults() resolves —
// invalidateFilmLabMatrixCache() (called there) covers that one edge case
// defensively rather than hashing their content on every call.
function memoizeFilmLabMatrix(computeFn) {
    let cache = null; // { filmsRaw, labsRaw, process, format, turnaround, hiRes, camera120Exposures, includeMailBack, mailBackRollCount, result }
    const memoized = (allFilms, allLabs, opts) => {
        opts = opts || {};
        const filmsRaw = localStorage.getItem('filmProfiles');
        const labsRaw = localStorage.getItem('labProfiles');
        const process = opts.process || '', format = opts.format || '', turnaround = opts.turnaround || '', hiRes = !!opts.hiRes;
        // 120's Camera Type override (issue #168 follow-up) changes what
        // the matrix itself contains for 120 films — same reason
        // process/format/turnaround/hiRes are part of this key.
        const camera120Exposures = opts.camera120Exposures || 0;
        // Mail-back toggle + roll count (issue #179) change every mailBackFee/
        // devCostPerPhoto in the result the same way process/format do, so
        // they're part of the key too — otherwise toggling the checkbox
        // would keep returning a cached result computed before the toggle.
        const includeMailBack = !!opts.includeMailBack, mailBackRollCount = opts.mailBackRollCount || 1;
        // Compared field-by-field, not joined into one string — the raw
        // localStorage JSON can contain arbitrary characters (a film/lab
        // name, address, etc.), so concatenating it with a fixed separator
        // risks two different underlying values producing the same key.
        if (cache && cache.filmsRaw === filmsRaw && cache.labsRaw === labsRaw &&
            cache.process === process && cache.format === format &&
            cache.turnaround === turnaround && cache.hiRes === hiRes &&
            cache.camera120Exposures === camera120Exposures &&
            cache.includeMailBack === includeMailBack && cache.mailBackRollCount === mailBackRollCount) {
            return cache.result;
        }
        const result = computeFn(allFilms, allLabs, opts);
        cache = { filmsRaw, labsRaw, process, format, turnaround, hiRes, camera120Exposures, includeMailBack, mailBackRollCount, result };
        return result;
    };
    memoized.invalidate = () => { cache = null; };
    return memoized;
}
const cachedNativeFilmLabMatrix = memoizeFilmLabMatrix(computeNativeFilmLabMatrix);
const cachedOneStopFilmLabMatrix = memoizeFilmLabMatrix(computeOneStopFilmLabMatrix);
function invalidateFilmLabMatrixCache() {
    cachedNativeFilmLabMatrix.invalidate();
    cachedOneStopFilmLabMatrix.invalidate();
}

// ---------- Pinned Dev Cost results (Per Film view) ----------
// Unlike the ★ favourite-lab reorder used elsewhere, this snapshots the
// actual numbers for one specific film+lab combo, so it survives
// switching which film is selected in the dropdown — several rolls,
// even from different films, can be pinned and compared side by side.
// (Favouriting a lab instead recomputes for whatever film is currently
// selected, which is what made it look like a pinned roll's numbers
// were "swapping" when the film changed.)
function pinnedDevCostKey(e) {
    return `${e.filmName}|${e.boxSpeed}|${e.format || '35mm'}|${e.labName}`;
}
function getPinnedDevCostResults() {
    return readJSON('pinnedDevCostResults', []);
}
function isDevCostPinned(entry) {
    const key = pinnedDevCostKey(entry);
    return getPinnedDevCostResults().some(p => pinnedDevCostKey(p) === key);
}
function toggleDevCostPin(entry) {
    const key = pinnedDevCostKey(entry);
    let pins = getPinnedDevCostResults();
    if (pins.some(p => pinnedDevCostKey(p) === key)) {
        pins = pins.filter(p => pinnedDevCostKey(p) !== key);
    } else {
        pins.push({
            pinId: Date.now() + Math.random(),
            filmName: entry.filmName, boxSpeed: entry.boxSpeed, format: entry.format, labName: entry.labName,
            filmCostPerPhoto: entry.filmCostPerPhoto, devCostPerPhoto: entry.devCostPerPhoto, totalCostPerPhoto: entry.totalCostPerPhoto,
            highResScan: entry.highResScan, tiffScan: entry.tiffScan, turnaroundTime: entry.turnaroundTime,
            devCostBase: entry.devCostBase, pushPullFee: entry.pushPullFee, mailBackFee: entry.mailBackFee, exposures: entry.exposures,
            filmCostPerRoll: entry.filmCostPerRoll, devCostPerRoll: entry.devCostPerRoll, totalCostPerRoll: entry.totalCostPerRoll,
            buyLink: entry.buyLink, storeName: entry.storeName,
            availability: entry.availability, state: entry.state, city: entry.city
        });
    }
    localStorage.setItem('pinnedDevCostResults', JSON.stringify(pins));
}
function unpinDevCostResult(pinId) {
    const pins = getPinnedDevCostResults().filter(p => p.pinId !== pinId);
    localStorage.setItem('pinnedDevCostResults', JSON.stringify(pins));
}

// Shared expandable row for the matrix-based Dev Cost views (Per Film /
// Per Photo / Per Lab). Matches the Per ISO row: collapsed by default,
// chevron, full breakdown when open, plus a favourite-lab star (Per
// Film uses a 📌 pin instead — see above).
// keyPrefix disambiguates rows across views so expand state doesn't leak.
function matrixRowKey(keyPrefix, entry) {
    return `${keyPrefix}|${entry.filmName}|${entry.boxSpeed}|${entry.format || '35mm'}|${entry.labName}`;
}

function renderMatrixRow(entry, rank, keyPrefix, pinReason, upgrade) {
    const upgradeNote = renderUpgradeNote(upgrade);
    const badges = renderRowBadges(entry);
    const isCheapest = rank === 0;
    const semanticRowBg = isCheapest ? 'theme-cheapest-bg' : '';
    const semanticRowText = isCheapest ? 'theme-cheapest-text' : '';
    const rowBg = isCheapest ? 'bg-green-100 dark:bg-green-900/30' : (pinReason ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-white dark:bg-gray-800/50');
    const textColor = isCheapest ? 'text-green-800 dark:text-green-400 font-semibold' : 'text-gray-600 dark:text-gray-400';
    const key = matrixRowKey(keyPrefix, entry);
    const isOpen = expandAllIso || expandedIsoRows.has(key);
    const chevron = renderRowChevron(isOpen);
    // Per Film swaps the ★ favourite-lab star for a 📌 pin toggle — see
    // the pinned-results block above updateCostPerFilmTab for why.
    const fav = isFavLab(entry.labName);
    const star = keyPrefix === 'film'
        ? ''
        : `<button type="button" class="fav-star text-sm leading-none ${fav ? 'theme-favourite-text text-amber-400' : 'text-gray-300 dark:text-gray-600'}" data-fav-lab="${escapeHtml(entry.labName)}" title="${fav ? t('unfavouriteLabTitle') : t('favouriteLabTitle')}" aria-label="${fav ? t('unfavouriteLabTitle') : t('favouriteLabTitle')}" onclick="event.stopPropagation()">${fav ? '★' : '☆'}</button>`;
    const pinned = keyPrefix === 'film' ? isDevCostPinned(entry) : false;
    const pinBtn = keyPrefix === 'film'
        ? `<button type="button" class="dev-cost-pin-btn text-sm leading-none ${pinned ? 'text-indigo-500' : 'text-gray-300 dark:text-gray-600'}" data-pin-row-key="${escapeHtml(matrixRowKey(keyPrefix, entry))}" title="${pinned ? t('unpinTitle') : t('pinForComparisonTitle')}" aria-label="${pinned ? t('unpinTitle') : t('pinForComparisonTitle')}" onclick="event.stopPropagation()">📌</button>`
        : '';
    // Per Photo is grouped one row per film, so it also gets a ♥ film
    // star — favouriting the lab shown wouldn't generalise across a
    // film's other possible lab pairings the way it does elsewhere.
    const filmFavKeyForRow = filmKey(entry.filmName, entry.boxSpeed, entry.format);
    const favFilm = isFavFilm(filmFavKeyForRow);
    const filmStar = keyPrefix === 'photo'
        ? `<button type="button" class="fav-film-star text-sm leading-none ${favFilm ? 'theme-favourite-text text-red-400' : 'text-gray-300 dark:text-gray-600'}" data-fav-film="${escapeHtml(filmFavKeyForRow)}" title="${favFilm ? t('unfavouriteFilmTitle') : t('favouriteFilmTitle')}" aria-label="${favFilm ? t('unfavouriteFilmTitle') : t('favouriteFilmTitle')}" onclick="event.stopPropagation()">${favFilm ? '♥' : '♡'}</button>`
        : '';
    const pinnedFavNote = pinReason === 'default'
        ? `<div class="text-xs theme-default-lab-text text-indigo-600 dark:text-indigo-400 mt-0.5">${t('shownFirstDefaultLab')}</div>`
        : pinReason === 'favFilm'
            ? `<div class="text-xs theme-favourite-text text-indigo-600 dark:text-indigo-400 mt-0.5">${t('shownFirstFavouriteFilm')}</div>`
            : pinReason
                ? `<div class="text-xs theme-favourite-text text-indigo-600 dark:text-indigo-400 mt-0.5">${t('shownFirstFavouriteLabStar')}</div>`
                : '';

    const breakdown = renderRowBreakdown(entry, isOpen);

    return `<div>
        <div class="matrix-row cursor-pointer px-3 py-2 rounded-lg text-sm ${semanticRowBg} ${rowBg}" data-row-key="${escapeHtml(key)}" title="${t('tapForBreakdownTitle')}">
            <div class="flex justify-between items-start gap-2">
                <span class="${semanticRowText} ${textColor}">${star}${filmStar}${pinBtn} ${isCheapest ? '⭐ ' : ''}${escapeHtml(entry.filmName)} <span class="opacity-70 font-normal">@ ${escapeHtml(entry.labName)}</span> <span class="text-xs opacity-70">(${entry.boxSpeed} ISO)</span>${badges}</span>
                <span class="font-mono text-right leading-tight ${semanticRowText} ${textColor} whitespace-nowrap flex items-center gap-1.5">
                    <span>
                        <span class="font-semibold block">${CUR()}${entry.totalCostPerPhoto.toFixed(2)}/photo</span>
                        <span class="text-xs opacity-70 font-normal block">${CUR()}${entry.devCostPerRoll.toFixed(2)}/roll dev</span>
                    </span>
                    ${chevron}
                </span>
            </div>
            ${pinnedFavNote}
            ${upgradeNote}
            ${breakdown}
        </div>
    </div>`;
}

// Wire favourite stars + row expand/collapse for a matrix-based view's
// container. Called after each render.
function wireMatrixRows(container, rerender) {
    container.querySelectorAll('.fav-star').forEach(star => star.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavLab(star.dataset.favLab);
        rerender();
    }));
    container.querySelectorAll('.fav-film-star').forEach(star => star.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavFilm(star.dataset.favFilm);
        rerender();
    }));
    container.querySelectorAll('.matrix-row').forEach(row => row.addEventListener('click', () => {
        const key = row.dataset.rowKey;
        if (expandAllIso) {
            container.querySelectorAll('.matrix-row').forEach(r => expandedIsoRows.add(r.dataset.rowKey));
            expandAllIso = false;
            expandedIsoRows.delete(key);
        } else if (expandedIsoRows.has(key)) {
            expandedIsoRows.delete(key);
        } else {
            expandedIsoRows.add(key);
        }
        rerender();
    }));
}

// An "Expand all / Collapse all" control row for the matrix views.
function expandAllControl() {
    return `<div class="flex justify-end mb-2"><button type="button" class="matrix-expand-all text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">${expandAllIso ? t('collapseAllLabel') : t('expandAllLabel')}</button></div>`;
}
function wireExpandAll(container, rerender) {
    const btn = container.querySelector('.matrix-expand-all');
    if (btn) btn.addEventListener('click', () => {
        expandAllIso = !expandAllIso;
        if (!expandAllIso) expandedIsoRows.clear();
        rerender();
    });
}

function renderNativeMatchRow(entry, rank) {
    const hiResBadge = entry.highResScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 align-middle">${t('hiResBadgeLabel')}</span>` : '';
    const turnaroundBadge = entry.turnaroundTime ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 align-middle">${escapeHtml(turnaroundLabels[entry.turnaroundTime] || entry.turnaroundTime)}</span>` : '';
    const isCheapest = rank === 0;
    const semanticRowBg = isCheapest ? 'theme-cheapest-bg' : '';
    const semanticRowText = isCheapest ? 'theme-cheapest-text' : '';
    return `<div class="flex justify-between items-start px-3 py-2 rounded-lg text-sm ${semanticRowBg} ${isCheapest ? 'bg-green-100 dark:bg-green-900/30' : 'bg-white dark:bg-gray-800/50'}">
        <span class="${semanticRowText} ${isCheapest ? 'font-semibold text-green-800 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}">${isCheapest ? '⭐ ' : ''}${escapeHtml(entry.filmName)} <span class="opacity-70 font-normal">@ ${escapeHtml(entry.labName)}</span> <span class="text-xs opacity-70">(${entry.boxSpeed} ISO)</span>${hiResBadge}${turnaroundBadge}</span>
        <span class="font-mono text-right leading-tight ${semanticRowText} ${isCheapest ? 'text-green-800 dark:text-green-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}">
            <div class="font-semibold">${CUR()}${entry.totalCostPerPhoto.toFixed(2)}/photo</div>
            <div class="text-xs opacity-80">${CUR()}${entry.filmCostPerPhoto.toFixed(2)} film + ${CUR()}${entry.devCostPerPhoto.toFixed(2)} dev</div>
        </span>
    </div>`;
}

// contextLabel is the lab name (Per Photo tab) or film name (Per Lab
// tab) that achieves this 1-stop push/pull price — whichever wasn't
// already the grouping key for the row above it.
function renderPushPullSubLine(entry, contextLabel) {
    if (!entry) return '';
    return `<div class="flex justify-between items-center px-3 py-1.5 rounded-lg text-xs bg-gray-50 dark:bg-gray-800/30 ml-3">
        <span class="text-gray-500 dark:text-gray-400">${t('pushPull1StopLabel')} <span class="opacity-70">@ ${escapeHtml(contextLabel)}</span></span>
        <span class="font-mono text-gray-500 dark:text-gray-400">${CUR()}${entry.totalCostPerPhoto.toFixed(2)}/photo</span>
    </div>`;
}

// Cheapest lab pairing for every film, ranked film-first (which film
// stock gives the best value overall) — box speed (native) only. Rows
// are grouped one-per-film, so favourite FILMS (not labs) pin a row to
// the top here — the ♥ star on each row, not the ★ one.
function updateCostPerPhotoTab() {
    const container = document.getElementById('costPerPhotoResults');
    const allFilms = getAllFilms();
    const allLabs = getAllLabs();
    const baseOpts = { process: cheapestProcess, format: cheapestFormat, camera120Exposures: camera120OverrideExposures(), ...mailBackOpts() };
    const allNativeMatrix = cachedNativeFilmLabMatrix(allFilms, allLabs, baseOpts);
    if (allNativeMatrix.length === 0) {
        container.innerHTML = `<p class="text-sm text-gray-400 text-center">${t('emptyLibraryMessage')}</p>`;
        setDevCostExportRows([]);
        return;
    }
    const devCostFilters = { ...baseOpts, turnaround: devCostFilterTurnaround, hiRes: devCostFilterHiRes, tiff: devCostFilterTiff };
    const hasActiveDevCostFilter = devCostFilterTurnaround || devCostFilterHiRes || devCostFilterTiff;
    // Filtered as a client-side subset of allNativeMatrix's own objects
    // (not a second computeNativeFilmLabMatrix() call) so the upgrade
    // recommendation below — computed from the unfiltered per-film
    // candidates — can identity-match "is this row already the cheapest?"
    // even while a turnaround/hi-res filter pill is narrowing what's shown.
    const nativeMatrix = hasActiveDevCostFilter
        ? allNativeMatrix.filter(e => (!devCostFilterTurnaround || e.turnaroundTime === devCostFilterTurnaround) && (!devCostFilterHiRes || e.highResScan) && (!devCostFilterTiff || e.tiffScan))
        : allNativeMatrix;
    if (nativeMatrix.length === 0) {
        container.innerHTML = `<p class="text-sm text-gray-400 text-center">${t('noOptionsMatchFilters')}</p>`;
        setDevCostExportRows([]);
        return;
    }
    const byFilmNative = new Map();
    nativeMatrix.forEach(e => {
        const key = `${e.filmName}__${e.boxSpeed}__${e.format}`;
        const existing = byFilmNative.get(key);
        if (!existing || e.totalCostPerPhoto < existing.totalCostPerPhoto) byFilmNative.set(key, e);
    });
    const priceSortedRows = [...byFilmNative.values()].sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto);
    const rows = reorderFavouriteFilmsFirst(priceSortedRows, favouriteFilms);
    const oneStopMatrix = hasActiveDevCostFilter ? cachedOneStopFilmLabMatrix(allFilms, allLabs, devCostFilters) : cachedOneStopFilmLabMatrix(allFilms, allLabs, baseOpts);

    const upgradeThresholdPercent = parseFloat(localStorage.getItem('upgradeThresholdPercent')) || 4;
    const allCandidatesByFilm = new Map();
    allNativeMatrix.forEach(e => {
        const key = `${e.filmName}__${e.boxSpeed}__${e.format}`;
        if (!allCandidatesByFilm.has(key)) allCandidatesByFilm.set(key, []);
        allCandidatesByFilm.get(key).push(e);
    });

    container.innerHTML = expandAllControl() + rows.map(e => {
        const rank = priceSortedRows.indexOf(e);
        const isFav = isFavFilm(filmKey(e.filmName, e.boxSpeed, e.format));
        const key = `${e.filmName}__${e.boxSpeed}__${e.format}`;
        const upgrade = findHiResFastestUpgrade(allCandidatesByFilm.get(key) || [e], e, upgradeThresholdPercent);
        const rowHtml = renderMatrixRow(e, rank, 'photo', isFav && rank !== 0 ? 'favFilm' : null, upgrade);
        const bestOneStop = oneStopMatrix.filter(o => o.filmName === e.filmName).sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto)[0];
        return rowHtml + renderPushPullSubLine(bestOneStop, bestOneStop ? bestOneStop.labName : '');
    }).join('');
    setDevCostExportRows(rows.map(matrixEntryToExportRow));
    wireExpandAll(container, updateCostPerPhotoTab);
    wireMatrixRows(container, updateCostPerPhotoTab);
}

// Cheapest film pairing for every lab, ranked lab-first (which lab
// gives the best value overall). Every lab appears; favourites are
// starred. Rows expand to a full cost breakdown.
function updateCostPerLabTab() {
    const container = document.getElementById('costPerLabResults');
    const allFilms = getAllFilms();
    const allLabs = getAllLabs();
    const baseOpts = { process: cheapestProcess, format: cheapestFormat, camera120Exposures: camera120OverrideExposures(), ...mailBackOpts() };
    const allNativeMatrix = cachedNativeFilmLabMatrix(allFilms, allLabs, baseOpts);
    if (allNativeMatrix.length === 0) {
        container.innerHTML = `<p class="text-sm text-gray-400 text-center">${t('emptyLibraryMessage')}</p>`;
        setDevCostExportRows([]);
        return;
    }
    const devCostFilters = { ...baseOpts, turnaround: devCostFilterTurnaround, hiRes: devCostFilterHiRes, tiff: devCostFilterTiff };
    const hasActiveDevCostFilter = devCostFilterTurnaround || devCostFilterHiRes || devCostFilterTiff;
    const nativeMatrix = hasActiveDevCostFilter ? cachedNativeFilmLabMatrix(allFilms, allLabs, devCostFilters) : allNativeMatrix;
    if (nativeMatrix.length === 0) {
        container.innerHTML = `<p class="text-sm text-gray-400 text-center">${t('noOptionsMatchFilters')}</p>`;
        setDevCostExportRows([]);
        return;
    }
    const byLabNative = new Map();
    nativeMatrix.forEach(e => {
        const existing = byLabNative.get(e.labName);
        if (!existing || e.totalCostPerPhoto < existing.totalCostPerPhoto) byLabNative.set(e.labName, e);
    });
    const priceSortedRows = [...byLabNative.values()].sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto);
    const rows = reorderFavouriteLabsFirst(priceSortedRows, favouriteLabs);
    const oneStopMatrix = hasActiveDevCostFilter ? cachedOneStopFilmLabMatrix(allFilms, allLabs, devCostFilters) : cachedOneStopFilmLabMatrix(allFilms, allLabs, baseOpts);
    container.innerHTML = expandAllControl() + rows.map(e => {
        const rank = priceSortedRows.indexOf(e);
        const rowHtml = renderMatrixRow(e, rank, 'lab', isFavLab(e.labName) && rank !== 0);
        const bestOneStop = oneStopMatrix.filter(o => o.labName === e.labName).sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto)[0];
        return rowHtml + renderPushPullSubLine(bestOneStop, bestOneStop ? bestOneStop.filmName : '');
    }).join('');
    setDevCostExportRows(rows.map(matrixEntryToExportRow));
    wireExpandAll(container, updateCostPerLabTab);
    wireMatrixRows(container, updateCostPerLabTab);
}

// Human-readable label for a format value (e.g. '120' -> '120'), same
// lookup pattern used for the Process filter chip in
// renderDevCostActiveFilters() above.
function formatLabel(value) {
    return (typeof FORMAT_OPTIONS !== 'undefined' && FORMAT_OPTIONS.find(o => o.value === value)?.label) || value;
}

// Renders the "compare across formats" block for the currently selected
// film's cost-per-photo in every OTHER format that same stock name is also
// saved in (issue #162) — e.g. "Portra 400" saved as both a 35mm and a 120
// entry. Returns '' when the stock is only saved in one format, so there's
// nothing to compare.
function renderFormatComparisonBlock(comparison, currentFormat) {
    if (!comparison || comparison.length < 2) return '';
    const cheapestCostPerPhoto = comparison[0].totalCostPerPhoto;
    const rows = comparison.map(e => {
        const fmt = e.format || '35mm';
        const isCurrent = fmt === currentFormat;
        const isCheapest = e.totalCostPerPhoto === cheapestCostPerPhoto;
        return `<div class="flex justify-between items-center gap-2 px-2 py-1.5 rounded ${isCurrent ? 'bg-indigo-100 dark:bg-indigo-900/30' : ''}">
            <span class="text-sm ${isCurrent ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-300'}">${escapeHtml(formatLabel(fmt))}${isCurrent ? ` <span class="text-xs opacity-70 font-normal">${t('currentSuffixLabel')}</span>` : ''}${isCheapest ? ' 🏆' : ''}</span>
            <span class="font-mono text-sm text-right ${isCurrent ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-300'}"><span class="font-semibold">${CUR()}${e.totalCostPerPhoto.toFixed(2)}</span>/photo <span class="text-xs opacity-60">@ ${escapeHtml(e.labName)}</span></span>
        </div>`;
    }).join('');
    return `<div class="mb-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
        <div class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5" title="${t('compareAcrossFormatsTitle')}">${t('compareAcrossFormatsHeading')}</div>
        <div class="space-y-0.5">${rows}</div>
    </div>`;
}

// Per Film view: user picks one film stock, then every lab is ranked
// cheapest-first for that film at box speed (film + dev). Mirrors the Per
// Lab tab but keyed on the chosen film. Honours the film-type + service
// filters via computeNativeFilmLabMatrix. Each lab row shows its cheapest
// 1-stop push/pull alternative underneath.
function populateCheapestFilmDropdown() {
    const select = document.getElementById('cheapestFilmSelect');
    if (!select) return;
    const prev = select.value;
    const allFilms = getAllFilms();
    const films = Object.values(allFilms)
        .filter(f => !f.hidden && filmPassesProcessFilter(f) && (parseInt(f.boxSpeed) || 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name) || (parseInt(a.boxSpeed) || 0) - (parseInt(b.boxSpeed) || 0));
    select.innerHTML = `<option value="">${t('pickFilmOption')}</option>` + films.map(f => {
        const key = filmKey(f.name, f.boxSpeed, f.format);
        return `<option value="${escapeHtml(key)}">${escapeHtml(f.name)} (${f.boxSpeed} ISO)</option>`;
    }).join('');
    // Keep the current selection if it still passes the filters.
    if (prev && [...select.options].some(o => o.value === prev)) select.value = prev;
}

// Renders every pinned film+lab snapshot in its own block, above the
// ranked list for whichever film is currently selected — pins are
// frozen numbers, so they stay put no matter what the dropdown does.
// Returns '' when nothing's pinned.
function renderPinnedDevCostBlock() {
    const pins = getPinnedDevCostResults();
    if (pins.length === 0) return '';
    const rows = pins.map(p => {
        const key = `pinned|${p.pinId}`;
        const isOpen = expandAllIso || expandedIsoRows.has(key);
        const chevron = `<span class="text-gray-400 dark:text-gray-500 transition-transform inline-block ${isOpen ? 'rotate-90' : ''}">▸</span>`;
        const hiResBadge = p.highResScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 align-middle">${t('hiResBadgeLabel')}</span>` : '';
        const tiffBadge = p.tiffScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 align-middle">${t('tiffBadgeLabel')}</span>` : '';
        const turnaroundBadge = p.turnaroundTime ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 align-middle">${escapeHtml(turnaroundLabels[p.turnaroundTime] || p.turnaroundTime)}</span>` : '';
        const buyUrl = sanitizeUrl(p.buyLink);
        const pinLocality = bundleLocalityLabel(p);
        const pinLocalityBadge = pinLocality ? ` <span class="text-amber-600 dark:text-amber-400" title="${t('localityOnlyTitle', { locality: escapeHtml(pinLocality.replace(/ only$/, '')) })}">(${escapeHtml(pinLocality)})</span>` : '';
        const buyLink = buyUrl
            ? `<a href="${escapeHtml(buyUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:underline">${p.storeName ? t('dcBuyFromLabel', { storeName: escapeHtml(p.storeName) }) : t('buyFilmLabel')}</a>${pinLocalityBadge}`
            : '';
        const dirUrl = labDirectionsUrl(p.labName);
        const directionsLink = dirUrl
            ? `<a href="${escapeHtml(dirUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-xs px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:underline">${t('directionsLinkLabel')}</a>`
            : '';
        const footer = (buyLink || directionsLink)
            ? `<div class="pt-1.5 flex justify-between items-center gap-2"><span>${buyLink}</span><span>${directionsLink}</span></div>`
            : '';
        const breakdown = isOpen
            ? `<div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-1">
                    <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('filmPerPhotoLabel')}</span><span class="font-mono">${CUR()}${p.filmCostPerPhoto.toFixed(2)}</span></div>
                    <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('developmentPerPhotoLabel')} <span class="opacity-60">${t('devRollDivExpNote', { exposures: p.exposures })}</span></span><span class="font-mono">${CUR()}${(p.devCostBase / p.exposures).toFixed(2)}</span></div>
                    ${p.pushPullFee > 0 ? `<div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('pushPullFeePerPhotoLabel')}</span><span class="font-mono">${CUR()}${(p.pushPullFee / p.exposures).toFixed(2)}</span></div>` : ''}
                    ${p.mailBackFee > 0 ? `<div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('mailShippingPerPhotoLabel')}</span><span class="font-mono">${CUR()}${(p.mailBackFee / p.exposures).toFixed(2)}</span></div>` : ''}
                    <div class="flex justify-between text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>${t('filmCostPerRollLabel')}</span><span class="font-mono">${CUR()}${p.filmCostPerRoll.toFixed(2)}</span></div>
                    <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>${t('developmentPerRollLabel')}</span><span class="font-mono">${CUR()}${p.devCostPerRoll.toFixed(2)}</span></div>
                    <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>${t('scanRowLabel')}</span><span>${scanLabel(p)}</span></div>
                    <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>${t('turnaroundRowLabel')}</span><span>${escapeHtml(turnaroundLabels[p.turnaroundTime] || p.turnaroundTime || '—')}</span></div>
                    <div class="flex justify-between font-semibold text-gray-700 dark:text-gray-300 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>${t('totalPerRollLabel', { exposures: p.exposures })}</span><span class="font-mono">${CUR()}${p.totalCostPerRoll.toFixed(2)}</span></div>
                    ${footer}
                </div>`
            : '';
        return `<div>
            <div class="matrix-row cursor-pointer px-3 py-2 rounded-lg text-sm bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800" data-row-key="${escapeHtml(key)}" title="${t('tapForBreakdownTitle')}">
                <div class="flex justify-between items-start gap-2">
                    <span class="text-indigo-800 dark:text-indigo-300"><button type="button" class="unpin-dev-cost-btn text-red-400 hover:text-red-600 text-xs font-bold mr-1" data-unpin-id="${p.pinId}" title="${t('unpinTitle')}" aria-label="${t('unpinTitle')}" onclick="event.stopPropagation()">✕</button>${escapeHtml(p.filmName)} <span class="opacity-70 font-normal">@ ${escapeHtml(p.labName)}</span> <span class="text-xs opacity-70">(${p.boxSpeed} ISO)</span>${hiResBadge}${tiffBadge}${turnaroundBadge}</span>
                    <span class="font-mono text-right leading-tight text-indigo-800 dark:text-indigo-300 whitespace-nowrap flex items-center gap-1.5">
                        <span>
                            <span class="font-semibold block">${CUR()}${p.totalCostPerPhoto.toFixed(2)}/photo</span>
                            <span class="text-xs opacity-70 font-normal block">${CUR()}${p.devCostPerRoll.toFixed(2)}/roll dev</span>
                        </span>
                        ${chevron}
                    </span>
                </div>
                ${breakdown}
            </div>
        </div>`;
    }).join('');
    return `<div class="mb-4">
        <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">${t('pinnedForComparisonHeading')}</span>
            <div class="flex-1 border-t border-indigo-200 dark:border-indigo-800"></div>
        </div>
        <div class="space-y-1.5">${rows}</div>
    </div>`;
}

function wirePinnedDevCostBlock(container) {
    container.querySelectorAll('.unpin-dev-cost-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        unpinDevCostResult(parseFloat(btn.dataset.unpinId));
        updateCostPerFilmTab();
    }));
}

function updateCostPerFilmTab() {
    populateCheapestFilmDropdown();
    const container = document.getElementById('cheapestFilmResults');
    const select = document.getElementById('cheapestFilmSelect');
    const selectedKey = select.value;
    document.getElementById('cheapestFilmShareBtn').disabled = !selectedKey;
    const pinnedBlock = renderPinnedDevCostBlock();

    if (!selectedKey) {
        container.innerHTML = pinnedBlock + `<p class="text-sm text-gray-400 text-center">${t('pickFilmToCompareMessage')}</p>`;
        wireMatrixRows(container, updateCostPerFilmTab);
        wirePinnedDevCostBlock(container);
        setDevCostExportRows([]);
        return;
    }

    const allFilms = getAllFilms();
    const allLabs = getAllLabs();
    const film = allFilms[selectedKey];
    if (!film) {
        container.innerHTML = pinnedBlock + `<p class="text-sm text-gray-400 text-center">${t('pickFilmToCompareMessage')}</p>`;
        wireMatrixRows(container, updateCostPerFilmTab);
        wirePinnedDevCostBlock(container);
        setDevCostExportRows([]);
        return;
    }

    // Unfiltered (ignoring the Next Day/Same Week/Hi-Res filter pills) so
    // the upgrade recommendation below can surface a hi-res+fastest option
    // even while some other filter is narrowing the visible rows. The
    // filtered, displayed rows are a client-side subset of these SAME
    // objects (not a second computeNativeFilmLabMatrix() call) so
    // findHiResFastestUpgrade()'s "is this already the cheapest?" identity
    // check actually works.
    const allCandidatesForFilm = cachedNativeFilmLabMatrix(allFilms, allLabs, { process: cheapestProcess, format: cheapestFormat, camera120Exposures: camera120OverrideExposures(), ...mailBackOpts() })
        .filter(e => filmKey(e.filmName, e.boxSpeed, e.format) === selectedKey);
    const priceSortedRows = allCandidatesForFilm
        .filter(e => (!devCostFilterTurnaround || e.turnaroundTime === devCostFilterTurnaround) && (!devCostFilterHiRes || e.highResScan) && (!devCostFilterTiff || e.tiffScan))
        .sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto);
    // Compared across every format the stock is saved in — deliberately not
    // narrowed by the current Format filter (that's the whole point), so
    // this is a separate call rather than reusing allCandidatesForFilm.
    const formatComparisonBlock = renderFormatComparisonBlock(
        computeFormatComparisonForFilm(film.name, allFilms, allLabs, { process: cheapestProcess, camera120Exposures: camera120OverrideExposures(), ...mailBackOpts() }),
        cheapestFormat
    );

    if (priceSortedRows.length === 0) {
        container.innerHTML = pinnedBlock + formatComparisonBlock + `<p class="text-sm text-gray-400 text-center">${t('noLabMatchesFilm', { filmName: escapeHtml(film.name) })}</p>`;
        wireMatrixRows(container, updateCostPerFilmTab);
        wirePinnedDevCostBlock(container);
        setDevCostExportRows([]);
        return;
    }

    const upgradeThresholdPercent = parseFloat(localStorage.getItem('upgradeThresholdPercent')) || 4;
    const upgrade = findHiResFastestUpgrade(allCandidatesForFilm, priceSortedRows[0], upgradeThresholdPercent);
    const defaultLabName = getDefaultLabPref()?.lab || null;
    const rows = reorderDefaultLabFirst(priceSortedRows, defaultLabName);
    const entriesByPinKey = new Map(priceSortedRows.map(e => [matrixRowKey('film', e), e]));
    // The default lab can have more than one row here (one per matching
    // service tier) — only its own cheapest row is actually pinned to the
    // front by reorderDefaultLabFirst, so only that row should carry the
    // "shown first, default lab" label; a pricier tier at the same lab
    // stays in its normal price position and isn't pinned.
    const defaultLabCheapestRow = defaultLabName ? priceSortedRows.find(e => e.labName === defaultLabName) : null;
    container.innerHTML = pinnedBlock + formatComparisonBlock + expandAllControl() + rows.map(e => {
        const rank = priceSortedRows.indexOf(e);
        const pinReason = (e === defaultLabCheapestRow && rank !== 0) ? 'default' : null;
        return renderMatrixRow(e, rank, 'film', pinReason, rank === 0 ? upgrade : undefined);
    }).join('');
    setDevCostExportRows(rows.map(matrixEntryToExportRow));
    wireExpandAll(container, updateCostPerFilmTab);
    wireMatrixRows(container, updateCostPerFilmTab);
    wirePinnedDevCostBlock(container);
    container.querySelectorAll('.dev-cost-pin-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const entry = entriesByPinKey.get(btn.dataset.pinRowKey);
        if (entry) toggleDevCostPin(entry);
        updateCostPerFilmTab();
    }));
}


