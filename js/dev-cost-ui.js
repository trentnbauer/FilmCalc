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
    cheapestSubTabs[sub].update();
}

function refreshActiveCheapestSubTab() {
    cheapestSubTabs[activeCheapestSubTab].update();
}

Object.keys(cheapestSubTabs).forEach(key => cheapestSubTabs[key].btn.addEventListener('click', () => switchCheapestSubTab(key)));
document.getElementById('cheapestFilmSelect').addEventListener('change', () => updateCostPerFilmTab());

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
function renderDevCostFilterBar() {
    document.querySelectorAll('.dev-cost-filter-pill').forEach(btn => {
        const active = btn.dataset.filter === 'hires' ? devCostFilterHiRes : devCostFilterTurnaround === btn.dataset.filter;
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
    } else {
        devCostFilterTurnaround = devCostFilterTurnaround === btn.dataset.filter ? '' : btn.dataset.filter;
    }
    renderDevCostFilterBar();
    refreshActiveCheapestSubTab();
}));
// sortIsoEntries(), pickIsoCandidate(), and computeIsoPriceOptions()
// now live in js/dev-cost-calc.js (loaded above, shared global
// scope) — see that file for the calculation logic and
// tests/dev-cost-calc.test.js for coverage.

// Tracks which ISO rows are expanded (by a stable key), so re-renders
// (sort changes, ISO tweaks) preserve open/closed state.

function isoRowKey(entry) {
    return `${entry.filmName}|${entry.labName}|${entry.stops}`;
}

function renderIsoRow(entry, rank, pinReason) {
    const hiResBadge = entry.highResScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 align-middle">HI-RES</span>` : '';
    const turnaroundBadge = entry.turnaroundTime ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 align-middle">${escapeHtml(turnaroundLabels[entry.turnaroundTime] || entry.turnaroundTime)}</span>` : '';
    const direction = entry.stops > 0 ? 'Push' : 'Pull';
    const stopsLabel = entry.stops !== 0
        ? ` <span class="text-xs ${entry.overLimit ? 'theme-danger-text text-red-600 dark:text-red-400 font-semibold' : 'opacity-70'}">(${direction} ${Math.abs(entry.stops)} stop${Math.abs(entry.stops) === 1 ? '' : 's'}${entry.overLimit ? ` — over its ${entry.maxPushPull}-stop limit` : ''})</span>`
        : '';
    const isCheapest = rank === 0;
    const semanticRowBg = entry.overLimit ? 'theme-danger-bg' : (isCheapest ? 'theme-cheapest-bg' : '');
    const semanticRowText = entry.overLimit ? 'theme-danger-text' : (isCheapest ? 'theme-cheapest-text' : '');
    const rowBg = entry.overLimit ? 'bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700' : (isCheapest ? 'bg-green-100 dark:bg-green-900/30' : (pinReason ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-white dark:bg-gray-800/50'));
    const textColor = entry.overLimit ? 'text-red-700 dark:text-red-400' : (isCheapest ? 'text-green-800 dark:text-green-400 font-semibold' : 'text-gray-700 dark:text-gray-300');
    const fav = isFavLab(entry.labName);
    const star = `<button type="button" class="fav-star text-sm leading-none" data-fav-lab="${escapeHtml(entry.labName)}" title="${fav ? 'Unfavourite lab' : 'Favourite lab'}" onclick="event.stopPropagation()"><span class="${fav ? 'theme-favourite-text text-amber-400' : 'text-gray-300 dark:text-gray-600'}">${fav ? '★' : '☆'}</span></button>`;
    const pinnedFavNote = pinReason === 'default'
        ? `<div class="text-[11px] theme-default-lab-text text-indigo-600 dark:text-indigo-400 mt-0.5">🏠 Shown first — this is your default lab</div>`
        : pinReason
            ? `<div class="text-[11px] theme-favourite-text text-indigo-600 dark:text-indigo-400 mt-0.5">📌 Shown first — this is your favourite lab</div>`
            : '';

    const key = isoRowKey(entry);
    const isOpen = expandAllIso || expandedIsoRows.has(key);
    const chevron = `<span class="text-gray-400 dark:text-gray-500 transition-transform inline-block ${isOpen ? 'rotate-90' : ''}">▸</span>`;

    // Expandable breakdown: full per-photo + per-roll cost line items.
    const buyUrl = sanitizeUrl(entry.buyLink);
    const buyLink = buyUrl
        ? `<a href="${escapeHtml(buyUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:underline">🛒 ${entry.storeName ? 'Buy from ' + escapeHtml(entry.storeName) : 'Buy film'} ↗</a>`
        : '';
    const dirUrl = labDirectionsUrl(entry.labName);
    const directionsLink = dirUrl
        ? `<a href="${escapeHtml(dirUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-[11px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:underline">📍 Directions ↗</a>`
        : '';
    const footer = (buyLink || directionsLink)
        ? `<div class="pt-1.5 flex justify-between items-center gap-2"><span>${buyLink}</span><span>${directionsLink}</span></div>`
        : '';
    const breakdown = isOpen
        ? `<div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-1">
                <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Film (per photo)</span><span class="font-mono">${CUR()}${entry.filmCostPerPhoto.toFixed(2)}</span></div>
                <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Development (per photo) <span class="opacity-60">= dev/roll ÷ ${entry.exposures} exp</span></span><span class="font-mono">${CUR()}${(entry.devCostBase / entry.exposures).toFixed(2)}</span></div>
                ${entry.pushPullFee > 0 ? `<div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Push/pull fee (per photo)</span><span class="font-mono">${CUR()}${(entry.pushPullFee / entry.exposures).toFixed(2)}</span></div>` : ''}
                <div class="flex justify-between text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>Film cost (per roll)</span><span class="font-mono">${CUR()}${entry.filmCostPerRoll.toFixed(2)}</span></div>
                <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Development (per roll)</span><span class="font-mono">${CUR()}${entry.devCostPerRoll.toFixed(2)}</span></div>
                <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>Scan</span><span>${entry.highResScan ? 'Hi-res' : 'Standard'}</span></div>
                <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>Turnaround</span><span>${escapeHtml(turnaroundLabels[entry.turnaroundTime] || entry.turnaroundTime || '—')}</span></div>
                <div class="flex justify-between font-semibold text-gray-700 dark:text-gray-300 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>Total per roll (${entry.exposures} exp)</span><span class="font-mono">${CUR()}${entry.totalCostPerRoll.toFixed(2)}</span></div>
                ${footer}
            </div>`
        : '';

    return `<div>
        <div class="iso-row cursor-pointer px-3 py-2 rounded-lg text-sm ${semanticRowBg} ${rowBg}" data-iso-key="${escapeHtml(key)}" title="Tap for cost breakdown">
            <div class="flex justify-between items-start gap-2">
                <span class="${semanticRowText} ${entry.overLimit ? 'font-semibold text-red-700 dark:text-red-400' : (isCheapest ? 'font-semibold text-green-800 dark:text-green-400' : 'text-gray-700 dark:text-gray-300')}">${star} ${isCheapest && !entry.overLimit ? '⭐ ' : ''}${escapeHtml(entry.filmName)} <span class="opacity-70 font-normal">@ ${escapeHtml(entry.labName)}</span>${stopsLabel}${hiResBadge}${turnaroundBadge}</span>
                <span class="font-mono text-right leading-tight ${semanticRowText} ${textColor} whitespace-nowrap flex items-center gap-1.5">
                    <span>
                        <span class="font-semibold block">${CUR()}${entry.totalCostPerPhoto.toFixed(2)}/photo</span>
                        <span class="text-[11px] opacity-70 font-normal block">${CUR()}${entry.devCostPerRoll.toFixed(2)}/roll dev</span>
                    </span>
                    ${chevron}
                </span>
            </div>
            ${pinnedFavNote}
            ${breakdown}
        </div>
    </div>`;
}

function updateIsoPriceCalculator() {
    const container = document.getElementById('isoCalcResults');
    const targetIso = parseInt(document.getElementById('isoCalcTargetSpeed').value) || 0;
    if (!targetIso) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center">Enter a shooting ISO to compare</p>';
        return;
    }

    const allFilms = { ...defaultFilms, ...JSON.parse(localStorage.getItem('filmProfiles') || '{}') };
    const allLabs = { ...defaultLabs, ...JSON.parse(localStorage.getItem('labProfiles') || '{}') };
    const hasFilms = Object.values(allFilms).some(f => !f.hidden && (parseInt(f.boxSpeed) || 0) > 0);
    const hasLabs = Object.values(allLabs).some(l => !l.hidden);
    if (!hasFilms || !hasLabs) {
        container.innerHTML = `<p class="text-sm text-gray-400 text-center">Save at least one film and one lab profile to compare</p>`;
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
    const baseOpts = { process: cheapestProcess, format: cheapestFormat, sortMode: cheapestSort, pinnedLabNames, upgradeThresholdPercent };

    const { native: allNative, push: allPush, pull: allPull } = computeIsoPriceOptions(targetIso, allFilms, allLabs, baseOpts);
    // Next Day / Same Week / Hi-Res filters need to pick the cheapest
    // MATCHING tier per film (recomputed here), not just filter the
    // unfiltered cheapest-overall pick above — a film's cheapest lab
    // tier is rarely the hi-res one, so filtering after the fact would
    // wrongly drop films that do have a matching tier at another lab.
    // allNative/allPush/allPull (unfiltered) are kept only to tell
    // "no matches for this filter" apart from "no film at this ISO at
    // all" in the messaging below.
    const hasActiveDevCostFilter = devCostFilterTurnaround || devCostFilterHiRes;
    const { native, push, pull } = hasActiveDevCostFilter
        ? computeIsoPriceOptions(targetIso, allFilms, allLabs, { ...baseOpts, turnaround: devCostFilterTurnaround, hiRes: devCostFilterHiRes })
        : { native: allNative, push: allPush, pull: allPull };
    const sortedNative = sortIsoEntries(native, cheapestSort);
    const sortedPush = sortIsoEntries(push, cheapestSort);
    const sortedPull = sortIsoEntries(pull, cheapestSort);

    // Rank for the ⭐ marker is always by price (cheapest), independent
    // of the chosen sort — so "cheapest" stays meaningful even when
    // sorting by turnaround or scan.
    const priceRank = (entries, entry) => entries.slice().sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto).indexOf(entry);
    // The configured default (home) lab is pinned first, ahead of
    // favourited labs, the same way Per Film pins it — so "my lab"
    // always surfaces even when it's neither the cheapest nor
    // starred as a favourite. Favourited labs are pinned next, ahead
    // of whatever sort is active, without disturbing the true price
    // rank used for the ⭐ "cheapest" marker.
    const defaultLabName = getDefaultLabPref()?.lab || null;
    const renderBucket = (sorted, all) => reorderDefaultLabFirst(reorderFavouriteLabsFirst(sorted, favouriteLabs), defaultLabName).map(e => {
        const rank = priceRank(all, e);
        const pinReason = (e.labName === defaultLabName && rank !== 0)
            ? 'default'
            : (isFavLab(e.labName) && rank !== 0);
        return renderIsoRow(e, rank, pinReason);
    }).join('');

    const noMatchMsg = (allBucket, emptyMsg) => `<p class="text-xs text-gray-400 text-center py-2">${allBucket.length ? 'No options match the current filters' : emptyMsg}</p>`;
    const nativeHtml = native.length
        ? renderBucket(sortedNative, native)
        : noMatchMsg(allNative, 'No film natively rated at this ISO');
    const pushHtml = push.length
        ? renderBucket(sortedPush, push)
        : noMatchMsg(allPush, 'No film can be pushed to this ISO');
    const pullHtml = pull.length
        ? renderBucket(sortedPull, pull)
        : noMatchMsg(allPull, 'No film can be pulled to this ISO');

    const sortPill = (mode, label, title) => `<button type="button" data-sort="${mode}" title="${title}" class="cheapest-sort-pill px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${cheapestSort === mode ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}">${label}</button>`;
    const controls = `<div class="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wide">Sort</span>
            ${sortPill('price', 'Price', 'Cheapest first (the ⭐ marker always reflects this, regardless of sort)')}
            ${sortPill('turnaround', 'Turnaround', 'Next Day first, then Same Week, then Longer')}
            ${sortPill('scan', 'Scan', 'Hi-Res scans first, then by price')}
        </div>
        <button type="button" id="isoExpandAllBtn" class="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">${expandAllIso ? 'Collapse all' : 'Expand all'}</button>
    </div>`;

    container.innerHTML = controls + `<div class="space-y-4">
        <div>
            <h3 class="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-2">Native (${targetIso} ISO)</h3>
            <div class="space-y-1.5">${nativeHtml}</div>
        </div>
        <div>
            <h3 class="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2">Pushed to ${targetIso} ISO</h3>
            <div class="space-y-1.5">${pushHtml}</div>
        </div>
        <div>
            <h3 class="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-2">Pulled to ${targetIso} ISO</h3>
            <div class="space-y-1.5">${pullHtml}</div>
        </div>
    </div>`;

    // Wire sort pills.
    container.querySelectorAll('.cheapest-sort-pill').forEach(btn => btn.addEventListener('click', () => {
        cheapestSort = btn.dataset.sort;
        localStorage.setItem('cheapestSort', cheapestSort);
        updateIsoPriceCalculator();
    }));
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


document.getElementById('isoCalcTargetSpeed').addEventListener('input', updateIsoPriceCalculator);

// ---------- Cost Per Photo / Cost Per Lab (native, no push/pull) ----------
// computeNativeFilmLabMatrix() and computeOneStopFilmLabMatrix() now
// live in js/dev-cost-calc.js (loaded above, shared global scope) —
// the shared datasets behind the "Cost Per Photo" (grouped/ranked by
// film) and "Cost Per Lab" (grouped/ranked by lab) tabs below.
// computeOneStopFilmLabMatrix() is the same shape, but every pairing
// is priced with exactly 1 stop of push/pull applied.

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
    try { return JSON.parse(localStorage.getItem('pinnedDevCostResults') || '[]'); } catch { return []; }
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
            highResScan: entry.highResScan, turnaroundTime: entry.turnaroundTime,
            devCostBase: entry.devCostBase, pushPullFee: entry.pushPullFee, exposures: entry.exposures,
            filmCostPerRoll: entry.filmCostPerRoll, devCostPerRoll: entry.devCostPerRoll, totalCostPerRoll: entry.totalCostPerRoll,
            buyLink: entry.buyLink, storeName: entry.storeName
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

function renderMatrixRow(entry, rank, keyPrefix, pinReason) {
    const hiResBadge = entry.highResScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 align-middle">HI-RES</span>` : '';
    const turnaroundBadge = entry.turnaroundTime ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 align-middle">${escapeHtml(turnaroundLabels[entry.turnaroundTime] || entry.turnaroundTime)}</span>` : '';
    const isCheapest = rank === 0;
    const semanticRowBg = isCheapest ? 'theme-cheapest-bg' : '';
    const semanticRowText = isCheapest ? 'theme-cheapest-text' : '';
    const rowBg = isCheapest ? 'bg-green-100 dark:bg-green-900/30' : (pinReason ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-white dark:bg-gray-800/50');
    const textColor = isCheapest ? 'text-green-800 dark:text-green-400 font-semibold' : 'text-gray-600 dark:text-gray-400';
    const key = matrixRowKey(keyPrefix, entry);
    const isOpen = expandAllIso || expandedIsoRows.has(key);
    const chevron = `<span class="text-gray-400 dark:text-gray-500 transition-transform inline-block ${isOpen ? 'rotate-90' : ''}">▸</span>`;
    // Per Film swaps the ★ favourite-lab star for a 📌 pin toggle — see
    // the pinned-results block above updateCostPerFilmTab for why.
    const fav = isFavLab(entry.labName);
    const star = keyPrefix === 'film'
        ? ''
        : `<button type="button" class="fav-star text-sm leading-none ${fav ? 'theme-favourite-text text-amber-400' : 'text-gray-300 dark:text-gray-600'}" data-fav-lab="${escapeHtml(entry.labName)}" title="${fav ? 'Unfavourite lab' : 'Favourite lab'}" onclick="event.stopPropagation()">${fav ? '★' : '☆'}</button>`;
    const pinned = keyPrefix === 'film' ? isDevCostPinned(entry) : false;
    const pinBtn = keyPrefix === 'film'
        ? `<button type="button" class="dev-cost-pin-btn text-sm leading-none ${pinned ? 'text-indigo-500' : 'text-gray-300 dark:text-gray-600'}" data-pin-row-key="${escapeHtml(matrixRowKey(keyPrefix, entry))}" title="${pinned ? 'Unpin' : 'Pin for comparison'}" onclick="event.stopPropagation()">📌</button>`
        : '';
    // Per Photo is grouped one row per film, so it also gets a ♥ film
    // star — favouriting the lab shown wouldn't generalise across a
    // film's other possible lab pairings the way it does elsewhere.
    const filmFavKeyForRow = filmKey(entry.filmName, entry.boxSpeed, entry.format);
    const favFilm = isFavFilm(filmFavKeyForRow);
    const filmStar = keyPrefix === 'photo'
        ? `<button type="button" class="fav-film-star text-sm leading-none ${favFilm ? 'theme-favourite-text text-red-400' : 'text-gray-300 dark:text-gray-600'}" data-fav-film="${escapeHtml(filmFavKeyForRow)}" title="${favFilm ? 'Unfavourite film' : 'Favourite film'}" onclick="event.stopPropagation()">${favFilm ? '♥' : '♡'}</button>`
        : '';
    const pinnedFavNote = pinReason === 'default'
        ? `<div class="text-[11px] theme-default-lab-text text-indigo-600 dark:text-indigo-400 mt-0.5">🏠 Shown first — this is your default lab</div>`
        : pinReason === 'favFilm'
            ? `<div class="text-[11px] theme-favourite-text text-indigo-600 dark:text-indigo-400 mt-0.5">📌 Shown first — this is a favourite film</div>`
            : pinReason
                ? `<div class="text-[11px] theme-favourite-text text-indigo-600 dark:text-indigo-400 mt-0.5">★ Shown first — this is your favourite lab</div>`
                : '';

    const buyUrl = sanitizeUrl(entry.buyLink);
    const buyLink = buyUrl
        ? `<a href="${escapeHtml(buyUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:underline">🛒 ${entry.storeName ? 'Buy from ' + escapeHtml(entry.storeName) : 'Buy film'} ↗</a>`
        : '';
    const dirUrl = labDirectionsUrl(entry.labName);
    const directionsLink = dirUrl
        ? `<a href="${escapeHtml(dirUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-[11px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:underline">📍 Directions ↗</a>`
        : '';
    const footer = (buyLink || directionsLink)
        ? `<div class="pt-1.5 flex justify-between items-center gap-2"><span>${buyLink}</span><span>${directionsLink}</span></div>`
        : '';
    const breakdown = isOpen
        ? `<div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-1">
                <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Film (per photo)</span><span class="font-mono">${CUR()}${entry.filmCostPerPhoto.toFixed(2)}</span></div>
                <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Development (per photo) <span class="opacity-60">= dev/roll ÷ ${entry.exposures} exp</span></span><span class="font-mono">${CUR()}${(entry.devCostBase / entry.exposures).toFixed(2)}</span></div>
                ${entry.pushPullFee > 0 ? `<div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Push/pull fee (per photo)</span><span class="font-mono">${CUR()}${(entry.pushPullFee / entry.exposures).toFixed(2)}</span></div>` : ''}
                <div class="flex justify-between text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>Film cost (per roll)</span><span class="font-mono">${CUR()}${entry.filmCostPerRoll.toFixed(2)}</span></div>
                <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Development (per roll)</span><span class="font-mono">${CUR()}${entry.devCostPerRoll.toFixed(2)}</span></div>
                <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>Scan</span><span>${entry.highResScan ? 'Hi-res' : 'Standard'}</span></div>
                <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>Turnaround</span><span>${escapeHtml(turnaroundLabels[entry.turnaroundTime] || entry.turnaroundTime || '—')}</span></div>
                <div class="flex justify-between font-semibold text-gray-700 dark:text-gray-300 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>Total per roll (${entry.exposures} exp)</span><span class="font-mono">${CUR()}${entry.totalCostPerRoll.toFixed(2)}</span></div>
                ${footer}
            </div>`
        : '';

    return `<div>
        <div class="matrix-row cursor-pointer px-3 py-2 rounded-lg text-sm ${semanticRowBg} ${rowBg}" data-row-key="${escapeHtml(key)}" title="Tap for cost breakdown">
            <div class="flex justify-between items-start gap-2">
                <span class="${semanticRowText} ${textColor}">${star}${filmStar}${pinBtn} ${isCheapest ? '⭐ ' : ''}${escapeHtml(entry.filmName)} <span class="opacity-70 font-normal">@ ${escapeHtml(entry.labName)}</span> <span class="text-xs opacity-70">(${entry.boxSpeed} ISO)</span>${hiResBadge}${turnaroundBadge}</span>
                <span class="font-mono text-right leading-tight ${semanticRowText} ${textColor} whitespace-nowrap flex items-center gap-1.5">
                    <span>
                        <span class="font-semibold block">${CUR()}${entry.totalCostPerPhoto.toFixed(2)}/photo</span>
                        <span class="text-[11px] opacity-70 font-normal block">${CUR()}${entry.devCostPerRoll.toFixed(2)}/roll dev</span>
                    </span>
                    ${chevron}
                </span>
            </div>
            ${pinnedFavNote}
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
    return `<div class="flex justify-end mb-2"><button type="button" class="matrix-expand-all text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">${expandAllIso ? 'Collapse all' : 'Expand all'}</button></div>`;
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
    const hiResBadge = entry.highResScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 align-middle">HI-RES</span>` : '';
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
        <span class="text-gray-500 dark:text-gray-400">↕ Push/pull 1 stop <span class="opacity-70">@ ${escapeHtml(contextLabel)}</span></span>
        <span class="font-mono text-gray-500 dark:text-gray-400">${CUR()}${entry.totalCostPerPhoto.toFixed(2)}/photo</span>
    </div>`;
}

// Cheapest lab pairing for every film, ranked film-first (which film
// stock gives the best value overall) — box speed (native) only. Rows
// are grouped one-per-film, so favourite FILMS (not labs) pin a row to
// the top here — the ♥ star on each row, not the ★ one.
function updateCostPerPhotoTab() {
    const container = document.getElementById('costPerPhotoResults');
    const allFilms = { ...defaultFilms, ...JSON.parse(localStorage.getItem('filmProfiles') || '{}') };
    const allLabs = { ...defaultLabs, ...JSON.parse(localStorage.getItem('labProfiles') || '{}') };
    const baseOpts = { process: cheapestProcess, format: cheapestFormat };
    const allNativeMatrix = computeNativeFilmLabMatrix(allFilms, allLabs, baseOpts);
    if (allNativeMatrix.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center">Save at least one film and one lab profile to compare</p>';
        return;
    }
    const devCostFilters = { ...baseOpts, turnaround: devCostFilterTurnaround, hiRes: devCostFilterHiRes };
    const hasActiveDevCostFilter = devCostFilterTurnaround || devCostFilterHiRes;
    const nativeMatrix = hasActiveDevCostFilter ? computeNativeFilmLabMatrix(allFilms, allLabs, devCostFilters) : allNativeMatrix;
    if (nativeMatrix.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center">No options match the current filters</p>';
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
    const oneStopMatrix = hasActiveDevCostFilter ? computeOneStopFilmLabMatrix(allFilms, allLabs, devCostFilters) : computeOneStopFilmLabMatrix(allFilms, allLabs, baseOpts);
    container.innerHTML = expandAllControl() + rows.map(e => {
        const rank = priceSortedRows.indexOf(e);
        const isFav = isFavFilm(filmKey(e.filmName, e.boxSpeed, e.format));
        const rowHtml = renderMatrixRow(e, rank, 'photo', isFav && rank !== 0 ? 'favFilm' : null);
        const bestOneStop = oneStopMatrix.filter(o => o.filmName === e.filmName).sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto)[0];
        return rowHtml + renderPushPullSubLine(bestOneStop, bestOneStop ? bestOneStop.labName : '');
    }).join('');
    wireExpandAll(container, updateCostPerPhotoTab);
    wireMatrixRows(container, updateCostPerPhotoTab);
}

// Cheapest film pairing for every lab, ranked lab-first (which lab
// gives the best value overall). Every lab appears; favourites are
// starred. Rows expand to a full cost breakdown.
function updateCostPerLabTab() {
    const container = document.getElementById('costPerLabResults');
    const allFilms = { ...defaultFilms, ...JSON.parse(localStorage.getItem('filmProfiles') || '{}') };
    const allLabs = { ...defaultLabs, ...JSON.parse(localStorage.getItem('labProfiles') || '{}') };
    const baseOpts = { process: cheapestProcess, format: cheapestFormat };
    const allNativeMatrix = computeNativeFilmLabMatrix(allFilms, allLabs, baseOpts);
    if (allNativeMatrix.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center">Save at least one film and one lab profile to compare</p>';
        return;
    }
    const devCostFilters = { ...baseOpts, turnaround: devCostFilterTurnaround, hiRes: devCostFilterHiRes };
    const hasActiveDevCostFilter = devCostFilterTurnaround || devCostFilterHiRes;
    const nativeMatrix = hasActiveDevCostFilter ? computeNativeFilmLabMatrix(allFilms, allLabs, devCostFilters) : allNativeMatrix;
    if (nativeMatrix.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center">No options match the current filters</p>';
        return;
    }
    const byLabNative = new Map();
    nativeMatrix.forEach(e => {
        const existing = byLabNative.get(e.labName);
        if (!existing || e.totalCostPerPhoto < existing.totalCostPerPhoto) byLabNative.set(e.labName, e);
    });
    const priceSortedRows = [...byLabNative.values()].sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto);
    const rows = reorderFavouriteLabsFirst(priceSortedRows, favouriteLabs);
    const oneStopMatrix = hasActiveDevCostFilter ? computeOneStopFilmLabMatrix(allFilms, allLabs, devCostFilters) : computeOneStopFilmLabMatrix(allFilms, allLabs, baseOpts);
    container.innerHTML = expandAllControl() + rows.map(e => {
        const rank = priceSortedRows.indexOf(e);
        const rowHtml = renderMatrixRow(e, rank, 'lab', isFavLab(e.labName) && rank !== 0);
        const bestOneStop = oneStopMatrix.filter(o => o.labName === e.labName).sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto)[0];
        return rowHtml + renderPushPullSubLine(bestOneStop, bestOneStop ? bestOneStop.filmName : '');
    }).join('');
    wireExpandAll(container, updateCostPerLabTab);
    wireMatrixRows(container, updateCostPerLabTab);
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
    const allFilms = { ...defaultFilms, ...JSON.parse(localStorage.getItem('filmProfiles') || '{}') };
    const films = Object.values(allFilms)
        .filter(f => !f.hidden && filmPassesProcessFilter(f) && (parseInt(f.boxSpeed) || 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name) || (parseInt(a.boxSpeed) || 0) - (parseInt(b.boxSpeed) || 0));
    select.innerHTML = '<option value="">-- Pick a film --</option>' + films.map(f => {
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
        const hiResBadge = p.highResScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 align-middle">HI-RES</span>` : '';
        const turnaroundBadge = p.turnaroundTime ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 align-middle">${escapeHtml(turnaroundLabels[p.turnaroundTime] || p.turnaroundTime)}</span>` : '';
        const buyUrl = sanitizeUrl(p.buyLink);
        const buyLink = buyUrl
            ? `<a href="${escapeHtml(buyUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:underline">🛒 ${p.storeName ? 'Buy from ' + escapeHtml(p.storeName) : 'Buy film'} ↗</a>`
            : '';
        const dirUrl = labDirectionsUrl(p.labName);
        const directionsLink = dirUrl
            ? `<a href="${escapeHtml(dirUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-[11px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:underline">📍 Directions ↗</a>`
            : '';
        const footer = (buyLink || directionsLink)
            ? `<div class="pt-1.5 flex justify-between items-center gap-2"><span>${buyLink}</span><span>${directionsLink}</span></div>`
            : '';
        const breakdown = isOpen
            ? `<div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-1">
                    <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Film (per photo)</span><span class="font-mono">${CUR()}${p.filmCostPerPhoto.toFixed(2)}</span></div>
                    <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Development (per photo) <span class="opacity-60">= dev/roll ÷ ${p.exposures} exp</span></span><span class="font-mono">${CUR()}${(p.devCostBase / p.exposures).toFixed(2)}</span></div>
                    ${p.pushPullFee > 0 ? `<div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Push/pull fee (per photo)</span><span class="font-mono">${CUR()}${(p.pushPullFee / p.exposures).toFixed(2)}</span></div>` : ''}
                    <div class="flex justify-between text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>Film cost (per roll)</span><span class="font-mono">${CUR()}${p.filmCostPerRoll.toFixed(2)}</span></div>
                    <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Development (per roll)</span><span class="font-mono">${CUR()}${p.devCostPerRoll.toFixed(2)}</span></div>
                    <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>Scan</span><span>${p.highResScan ? 'Hi-res' : 'Standard'}</span></div>
                    <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>Turnaround</span><span>${escapeHtml(turnaroundLabels[p.turnaroundTime] || p.turnaroundTime || '—')}</span></div>
                    <div class="flex justify-between font-semibold text-gray-700 dark:text-gray-300 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>Total per roll (${p.exposures} exp)</span><span class="font-mono">${CUR()}${p.totalCostPerRoll.toFixed(2)}</span></div>
                    ${footer}
                </div>`
            : '';
        return `<div>
            <div class="matrix-row cursor-pointer px-3 py-2 rounded-lg text-sm bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800" data-row-key="${escapeHtml(key)}" title="Tap for cost breakdown">
                <div class="flex justify-between items-start gap-2">
                    <span class="text-indigo-800 dark:text-indigo-300"><button type="button" class="unpin-dev-cost-btn text-red-400 hover:text-red-600 text-xs font-bold mr-1" data-unpin-id="${p.pinId}" title="Unpin" onclick="event.stopPropagation()">✕</button>${escapeHtml(p.filmName)} <span class="opacity-70 font-normal">@ ${escapeHtml(p.labName)}</span> <span class="text-xs opacity-70">(${p.boxSpeed} ISO)</span>${hiResBadge}${turnaroundBadge}</span>
                    <span class="font-mono text-right leading-tight text-indigo-800 dark:text-indigo-300 whitespace-nowrap flex items-center gap-1.5">
                        <span>
                            <span class="font-semibold block">${CUR()}${p.totalCostPerPhoto.toFixed(2)}/photo</span>
                            <span class="text-[11px] opacity-70 font-normal block">${CUR()}${p.devCostPerRoll.toFixed(2)}/roll dev</span>
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
            <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">📌 Pinned for Comparison</span>
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
    const pinnedBlock = renderPinnedDevCostBlock();

    if (!selectedKey) {
        container.innerHTML = pinnedBlock + '<p class="text-sm text-gray-400 text-center">Pick a film to compare labs</p>';
        wireMatrixRows(container, updateCostPerFilmTab);
        wirePinnedDevCostBlock(container);
        return;
    }

    const allFilms = { ...defaultFilms, ...JSON.parse(localStorage.getItem('filmProfiles') || '{}') };
    const allLabs = { ...defaultLabs, ...JSON.parse(localStorage.getItem('labProfiles') || '{}') };
    const film = allFilms[selectedKey];
    if (!film) {
        container.innerHTML = pinnedBlock + '<p class="text-sm text-gray-400 text-center">Pick a film to compare labs</p>';
        wireMatrixRows(container, updateCostPerFilmTab);
        wirePinnedDevCostBlock(container);
        return;
    }

    const priceSortedRows = computeNativeFilmLabMatrix(allFilms, allLabs, { process: cheapestProcess, format: cheapestFormat, turnaround: devCostFilterTurnaround, hiRes: devCostFilterHiRes })
        .filter(e => filmKey(e.filmName, e.boxSpeed, e.format) === selectedKey)
        .sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto);

    if (priceSortedRows.length === 0) {
        container.innerHTML = pinnedBlock + `<p class="text-sm text-gray-400 text-center">No lab matches ${escapeHtml(film.name)} with the current filters</p>`;
        wireMatrixRows(container, updateCostPerFilmTab);
        wirePinnedDevCostBlock(container);
        return;
    }

    const defaultLabName = getDefaultLabPref()?.lab || null;
    const rows = reorderDefaultLabFirst(priceSortedRows, defaultLabName);
    const entriesByPinKey = new Map(priceSortedRows.map(e => [matrixRowKey('film', e), e]));
    container.innerHTML = pinnedBlock + expandAllControl() + rows.map(e => {
        const rank = priceSortedRows.indexOf(e);
        const pinReason = (e.labName === defaultLabName && rank !== 0) ? 'default' : null;
        return renderMatrixRow(e, rank, 'film', pinReason);
    }).join('');
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


