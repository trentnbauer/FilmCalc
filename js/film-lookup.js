// Film Lookup tab: "cost out one specific roll by hand" -- Box
// Speed/Film Cost/Rolls/Exposures entered directly (not a saved film
// profile), ranked against every saved lab, with pin-to-compare and a
// cheaper-alternative callout. Plain global functions (no bundler),
// same pattern as js/dev-cost-calc.js/js/themes.js/js/modals.js --
// shares index.html's global scope via <script src>, not an ES
// module. Depends on shared helpers left in index.html (escapeHtml,
// CUR, turnaroundLabels, isFavLab/toggleFavLab, labDirectionsUrl, the
// favouriteLabs/favouriteFilms Sets, and expandedIsoRows/expandAllIso --
// that last pair is genuinely shared: this tab's row expand/collapse
// reuses the same state as the Dev Cost views in js/dev-cost-ui.js) --
// safe because every call happens from an event handler or after
// startup awaits resolve, never synchronously while this file itself
// is executing.
//
// Extracted from index.html as part of #61 (single-file app split).

// ---------- Labs for this roll ----------
// Compares every saved lab profile (built-in + custom) against the current
// Box Speed / Dev Speed, since push/pull cost — not just base dev price —
// can flip which lab is actually cheapest for a given roll. Sorted by
// cost per photo since that's the number that actually matters.
// ---------- Pinned lab results ----------
// Lets the person freeze one or more specific lab results on screen,
// then change film/lab details and see the new numbers compared
// directly against each pinned one — persists across reloads since
// it's a deliberate "keep this for comparison" action, not incidental
// state. Multiple pins are supported so you can line up several labs
// (e.g. a fast one vs. a cheap one) side by side.
function pinLabResult(r) {
    const pins = JSON.parse(localStorage.getItem('pinnedLabResults') || '[]');
    pins.push({
        pinId: Date.now() + Math.random(),
        name: r.name,
        costPerPhoto: r.costPerPhoto,
        devCostPerRoll: r.devCostPerRoll,
        costPerRoll: r.costPerRoll,
        highResScan: r.highResScan,
        turnaroundTime: r.turnaroundTime,
        stops: r.stops
    });
    localStorage.setItem('pinnedLabResults', JSON.stringify(pins));
    updateLabComparison();
}

function unpinLabResult(pinId) {
    let pins = JSON.parse(localStorage.getItem('pinnedLabResults') || '[]');
    pins = pins.filter(p => p.pinId !== pinId);
    localStorage.setItem('pinnedLabResults', JSON.stringify(pins));
    updateLabComparison();
}

function renderPinnedResult(currentCheapest) {
    const container = document.getElementById('pinnedResultDisplay');
    if (!container) return;
    const pins = JSON.parse(localStorage.getItem('pinnedLabResults') || '[]');
    if (pins.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = pins.map(pinned => {
        const hiResBadge = pinned.highResScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 align-middle">HI-RES</span>` : '';
        const turnaroundBadge = pinned.turnaroundTime ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 align-middle">${escapeHtml(turnaroundLabels[pinned.turnaroundTime] || pinned.turnaroundTime)}</span>` : '';

        let diffHtml = '<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Change Film Setup or labs to compare against a new calculation</p>';
        if (currentCheapest) {
            const diff = currentCheapest.costPerPhoto - pinned.costPerPhoto;
            if (Math.abs(diff) < 0.005) {
                diffHtml = `<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Same as current cheapest (${CUR()}${currentCheapest.costPerPhoto.toFixed(2)}/photo)</p>`;
            } else if (diff > 0) {
                diffHtml = `<p class="text-xs text-green-600 dark:text-green-400 mt-1">Current cheapest is ${CUR()}${diff.toFixed(2)}/photo less (${escapeHtml(currentCheapest.name)} at ${CUR()}${currentCheapest.costPerPhoto.toFixed(2)}/photo)</p>`;
            } else {
                diffHtml = `<p class="text-xs text-red-600 dark:text-red-400 mt-1">Current cheapest is ${CUR()}${Math.abs(diff).toFixed(2)}/photo more (${escapeHtml(currentCheapest.name)} at ${CUR()}${currentCheapest.costPerPhoto.toFixed(2)}/photo)</p>`;
            }
        }

        return `<div class="px-3 py-3 rounded-lg text-sm bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 relative mb-3 text-left">
            <button type="button" data-unpin-id="${pinned.pinId}" class="unpinResultBtn absolute top-2 right-2 text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 text-xs font-bold" aria-label="Unpin">✕</button>
            <div class="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide mb-1">📌 Pinned Comparison</div>
            <div class="font-semibold text-indigo-800 dark:text-indigo-300">${escapeHtml(pinned.name)}${hiResBadge}${turnaroundBadge}</div>
            <div class="font-mono text-indigo-800 dark:text-indigo-300 mt-1">
                <span class="font-semibold">${CUR()}${pinned.costPerPhoto.toFixed(2)}/photo</span>
                <span class="text-xs opacity-80"> · ${CUR()}${pinned.devCostPerRoll.toFixed(2)}/dev · ${CUR()}${pinned.costPerRoll.toFixed(2)}/total</span>
            </div>
            ${diffHtml}
        </div>`;
    }).join('');

    container.querySelectorAll('.unpinResultBtn').forEach(btn => {
        btn.addEventListener('click', () => unpinLabResult(parseFloat(btn.dataset.unpinId)));
    });
}

function renderPinBtn(id) {
    return `<button type="button" data-pin-id="${id}" class="ml-2 text-indigo-400 hover:text-indigo-600 text-xs align-middle" aria-label="Pin for comparison" title="Pin for comparison">📌</button>`;
}

// Shows the camera setting (shooting ISO) and push/pull for this roll at
// the top of "Labs For This Roll", so it's clear at a glance what the
// comparison below is actually costing out.
function renderCameraSetting(boxSpeed, devSpeed, stops) {
    const el = document.getElementById('cameraSettingDisplay');
    if (!el) return;
    if (!devSpeed) { el.innerHTML = ''; return; }

    const devNoteHtml = stops > 0
        ? `<p class="text-sm text-blue-800 dark:text-blue-300 mt-1">Development note: ${devSpeed > boxSpeed ? 'Push' : 'Pull'} ${stops} stop${stops === 1 ? '' : 's'}</p>`
        : '';

    el.innerHTML = `<div class="flex items-start gap-2 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2 text-left">
        <span class="text-blue-500 dark:text-blue-400">📷</span>
        <div>
            <p class="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Camera Setting</p>
            <p class="text-sm text-blue-800 dark:text-blue-300">Set Camera or light meter to <span class="font-semibold">${devSpeed} ISO</span></p>
            ${devNoteHtml}
        </div>
    </div>`;
}

// Warns any time Box Speed and Target Speed are more than the
// effective Max Push/Pull limit apart. Defaults to 1 stop for manual
// entries, but uses the loaded film's own Max Push/Pull (set in Film
// Setup) whenever one's been loaded via Quick Calculate — a film with
// a wider or narrower tolerance overrides the default.
function renderPushPullWarning(stops) {
    const el = document.getElementById('pushPullWarning');
    if (!el) return;
    if (stops <= loadedFilmMaxPushPull) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `<div class="flex items-start gap-2 theme-warning-bg bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded-lg px-3 py-2">
        <span class="theme-warning-text text-orange-500 dark:text-orange-400">⚠️</span>
        <p class="text-sm theme-warning-text text-orange-800 dark:text-orange-300 font-medium">This pushes/pulls ${stops} stop${stops === 1 ? '' : 's'} — check the film can handle it (most stocks are rated for about 1).</p>
    </div>`;
}

// One-line recap of whatever film is currently costed out (from the
// dropdown, the Target Speed auto-load, or manual entry), so the
// manual fields can stay collapsed without hiding the numbers.
function renderLoadedFilmSummary() {
    const el = document.getElementById('loadedFilmSummary');
    if (!el) return;
    const boxSpeed = document.getElementById('boxSpeed').value;
    const filmCostRaw = document.getElementById('filmCost').value;
    const postageRaw = document.getElementById('postageCost').value;
    const rolls = document.getElementById('rolls').value;
    const exposures = document.getElementById('exposures').value;
    if (!boxSpeed && !filmCostRaw && !postageRaw) { el.innerHTML = ''; return; }
    const total = (parseFloat(filmCostRaw) || 0) + (parseFloat(postageRaw) || 0);
    const bits = [];
    if (boxSpeed) bits.push(`${escapeHtml(boxSpeed)} ISO`);
    if (filmCostRaw || postageRaw) {
        const totalLabel = postageRaw ? `${CUR()}${total.toFixed(2)} total incl. postage` : `${CUR()}${total.toFixed(2)} total`;
        bits.push(totalLabel);
    }
    if (rolls && exposures) bits.push(`${escapeHtml(rolls)} × ${escapeHtml(exposures)}exp`);
    el.innerHTML = `<span class="font-mono">${bits.join(' · ')}</span>`;
}

function updateLabComparison() {
    const bestPicksContainer = document.getElementById('labBestPicks');
    const container = document.getElementById('labComparison');
    renderLoadedFilmSummary();

    const devSpeedRaw = document.getElementById('devSpeed').value;
    const filmCostRaw = document.getElementById('filmCost').value;
    const rollsRaw = document.getElementById('rolls').value;
    const exposuresRaw = document.getElementById('exposures').value;
    const boxSpeedForWarning = parseInt(document.getElementById('boxSpeed').value) || 0;
    const devSpeedForWarning = parseInt(devSpeedRaw) || 0;

    let warningStops = 0;
    if (boxSpeedForWarning > 0 && devSpeedForWarning > 0 && boxSpeedForWarning !== devSpeedForWarning) {
        warningStops = Math.round(Math.abs(Math.log2(devSpeedForWarning / boxSpeedForWarning)) * 10) / 10;
    }

    const hasRequiredFields = [devSpeedRaw, filmCostRaw, rollsRaw, exposuresRaw].every(v => v !== '' && v !== null && parseFloat(v) > 0);
    if (!hasRequiredFields) {
        renderPushPullWarning(0);
        renderCameraSetting(boxSpeedForWarning, 0, warningStops);
        bestPicksContainer.innerHTML = '';
        container.innerHTML = '<p class="text-sm text-gray-400 text-center">Fill in Target Speed, Film Cost, Rolls & Exposures to compare labs</p>';
        renderPinnedResult(null);
        return;
    }

    renderPushPullWarning(warningStops);
    renderCameraSetting(boxSpeedForWarning, devSpeedForWarning, warningStops);

    const boxSpeed = boxSpeedForWarning;
    const devSpeed = devSpeedForWarning;
    const postageRaw = document.getElementById('postageCost').value;
    const filmCost = (parseFloat(filmCostRaw) || 0) + (parseFloat(postageRaw) || 0);
    const rolls = parseInt(rollsRaw) || 1;
    const exposures = parseInt(exposuresRaw) || 1;
    const totalPhotos = exposures * rolls;

    const onceOffFee = parseFloat(document.getElementById('onceOffFee').value) || 0;
    const perRollFee = parseFloat(document.getElementById('perRollFee').value) || 0;

    const stops = warningStops;
    const currentProcess = document.getElementById('processSelect').value || 'C41';

    const allLabs = { ...defaultLabs, ...JSON.parse(localStorage.getItem('labProfiles') || '{}') };
    const names = Object.keys(allLabs).filter(n => !allLabs[n].hidden);

    if (names.length === 0) {
        bestPicksContainer.innerHTML = '';
        container.innerHTML = '<p class="text-sm text-gray-400 text-center">Save a lab profile to compare prices</p>';
        renderPinnedResult(null);
        return;
    }

    let idCounter = 0;
    const allResults = names.flatMap(name => {
        const lab = allLabs[name];
        const services = normalizeLabServices(lab);

        return services
            .filter(tier => !(tier.noPushPull && stops > 0) && tierMatchesFilmProcess(tier, { process: currentProcess }))
            .map(tier => {
            let activePushPullCost = 0;
            if (stops > 0) {
                activePushPullCost = (tier.pushPullType === 'per_stop') ? (tier.pushPullCost * stops) : tier.pushPullCost;
            }

            const labCostPerRoll = tier.devCost + activePushPullCost + perRollFee;
            const grandTotal = filmCost + (labCostPerRoll * rolls) + onceOffFee;
            const costPerRoll = rolls > 0 ? grandTotal / rolls : 0;
            const costPerPhoto = totalPhotos > 0 ? grandTotal / totalPhotos : 0;
            const filmCostPerRoll = rolls > 0 ? filmCost / rolls : 0;

            return {
                id: idCounter++,
                name,
                stops,
                devCostPerRoll: labCostPerRoll,
                costPerRoll,
                costPerPhoto,
                highResScan: tier.highResScan,
                turnaroundTime: tier.turnaroundTime,
                // Breakdown fields for the expandable row.
                filmCostPerPhoto: totalPhotos > 0 ? filmCost / totalPhotos : 0,
                devCostPerPhoto: exposures > 0 ? (tier.devCost + activePushPullCost) / exposures : 0,
                pushPullFeePerPhoto: exposures > 0 ? activePushPullCost / exposures : 0,
                filmCostPerRoll,
                exposures
            };
        });
    }).sort((a, b) => a.costPerPhoto - b.costPerPhoto);

    if (allResults.length === 0) {
        bestPicksContainer.innerHTML = '';
        container.innerHTML = '<p class="text-sm text-gray-400 text-center">No saved lab has a service tier set to this film\'s process — check Lab Setup, or save a lab profile</p>';
        renderPinnedResult(null);
        return;
    }

    const currentLabName = document.getElementById('labName').value.trim();

    const cheapest = (arr) => arr.length ? arr[0] : null;
    const rawCheapestTotal = cheapest(allResults);
    const cheapestFastest = cheapest(allResults.filter(r => r.turnaroundTime === 'next_day'));
    const cheapestHiRes = cheapest(allResults.filter(r => r.highResScan));
    const cheapestHiResFastest = cheapest(allResults.filter(r => r.highResScan && r.turnaroundTime === 'next_day'));

    // If the fully-loaded option (hi-res + next day) is within the user's
    // configured threshold of the absolute cheapest, it's flagged as the
    // recommended pick (highlighted gold) — a few cents more for both
    // perks usually beats "technically cheapest" with worse service.
    // "Cheapest Total" always shows the actual cheapest, unchanged.
    // Adjustable in Settings, defaults to 4%.
    const UPGRADE_THRESHOLD = (parseFloat(localStorage.getItem('upgradeThresholdPercent')) || 4) / 100;
    let hiResFastestNote = '';
    let hiResFastestRecommended = false;
    if (rawCheapestTotal && cheapestHiResFastest && cheapestHiResFastest.id !== rawCheapestTotal.id) {
        const premium = (cheapestHiResFastest.costPerPhoto - rawCheapestTotal.costPerPhoto) / rawCheapestTotal.costPerPhoto;
        if (premium >= 0 && premium < UPGRADE_THRESHOLD) {
            hiResFastestRecommended = true;
            hiResFastestNote = `Only ${(premium * 100).toFixed(1)}% more than the absolute cheapest (${CUR()}${rawCheapestTotal.costPerPhoto.toFixed(2)}/photo) — this one includes hi-res + next day.`;
        }
    }

    const bestPicks = [
        { label: '🏆 Cheapest Total', pick: rawCheapestTotal },
        { label: '⚡ Cheapest Fastest', pick: cheapestFastest },
        { label: '🔍 Cheapest Hi-Res', pick: cheapestHiRes },
        { label: '⚡🔍 Cheapest Hi-Res + Fastest', pick: cheapestHiResFastest, note: hiResFastestNote, recommended: hiResFastestRecommended }
    ];

    // If several categories resolve to the exact same lab tier (e.g. the
    // cheapest overall also happens to be the cheapest hi-res + fastest),
    // show it once with combined labels instead of repeating the card.
    const groupedPicks = [];
    const groupByPickId = new Map();
    bestPicks.forEach(bp => {
        if (!bp.pick) { groupedPicks.push(bp); return; }
        const existing = groupByPickId.get(bp.pick.id);
        if (existing) {
            existing.label += ' / ' + bp.label;
            if (bp.note) existing.note = bp.note;
            if (bp.recommended) existing.recommended = true;
        } else {
            const merged = { label: bp.label, pick: bp.pick, note: bp.note, recommended: bp.recommended };
            groupByPickId.set(bp.pick.id, merged);
            groupedPicks.push(merged);
        }
    });

    const usedIds = new Set(bestPicks.map(bp => bp.pick && bp.pick.id).filter(id => id !== undefined && id !== null));

    function renderBadges(r) {
        const hiResBadge = r.highResScan ? ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 align-middle">HI-RES</span>` : '';
        const turnaroundBadge = ` <span class="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 align-middle">${escapeHtml(turnaroundLabels[r.turnaroundTime] || r.turnaroundTime)}</span>`;
        const stopsLabel = r.stops > 0 ? ` <span class="text-xs text-gray-400">(${r.stops} stop push/pull)</span>` : '';
        return hiResBadge + turnaroundBadge + stopsLabel;
    }

    renderPinnedResult(rawCheapestTotal);

    const resultsById = new Map(allResults.map(r => [r.id, r]));

    function wirePinButtons(container) {
        container.querySelectorAll('[data-pin-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const r = resultsById.get(parseInt(btn.dataset.pinId));
                if (r) pinLabResult(r);
            });
        });
    }

    bestPicksContainer.innerHTML = groupedPicks.map(({ label, pick, note, recommended }) => {
        if (!pick) {
            return `<div class="px-3 py-3 rounded-lg text-sm bg-white dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-600">
                <div class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">${label}</div>
                <div class="text-gray-400 dark:text-gray-500 text-sm">No matching lab</div>
            </div>`;
        }
        const isCurrent = pick.name === currentLabName;
        const semanticBg = recommended ? 'theme-recommended-bg' : 'theme-cheapest-bg';
        const semanticText = recommended ? 'theme-recommended-text' : 'theme-cheapest-text';
        const noteHtml = note ? `<div class="text-xs ${semanticText} ${recommended ? 'text-amber-800/80 dark:text-amber-300/80' : 'text-green-700/80 dark:text-green-400/80'} mt-1 italic">${note}</div>` : '';
        return `<div class="px-3 py-3 rounded-lg text-sm ${semanticBg} ${recommended ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'} ${isCurrent ? 'ring-2 ring-blue-400' : ''}">
            <div class="flex justify-between items-start">
                <div class="text-xs font-semibold ${semanticText} ${recommended ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'} uppercase tracking-wide mb-1">${label}</div>
                ${renderPinBtn(pick.id)}
            </div>
            <div class="font-semibold ${semanticText} ${recommended ? 'text-amber-800 dark:text-amber-300' : 'text-green-800 dark:text-green-400'}">${escapeHtml(pick.name)}${renderBadges(pick)}</div>
            <div class="font-mono ${semanticText} ${recommended ? 'text-amber-800 dark:text-amber-300' : 'text-green-800 dark:text-green-400'} mt-1">
                <span class="font-semibold">${CUR()}${pick.costPerPhoto.toFixed(2)}/photo</span>
                <span class="text-xs opacity-80"> · ${CUR()}${pick.devCostPerRoll.toFixed(2)}/dev · ${CUR()}${pick.costPerRoll.toFixed(2)}/total</span>
            </div>
            ${noteHtml}
        </div>`;
    }).join('');
    wirePinButtons(bestPicksContainer);

    let otherResults = allResults.filter(r => !usedIds.has(r.id));
    if (filterNextDay) otherResults = otherResults.filter(r => r.turnaroundTime === 'next_day');
    if (filterHiRes) otherResults = otherResults.filter(r => r.highResScan);

    if (otherResults.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center">No other labs match the selected filters</p>';
        return;
    }

    container.innerHTML = otherResults.map(r => {
        const isCurrent = r.name === currentLabName;
        const key = `lookup|${r.id}`;
        const isOpen = expandAllIso || expandedIsoRows.has(key);
        const chevron = `<span class="text-gray-400 dark:text-gray-500 transition-transform inline-block ${isOpen ? 'rotate-90' : ''}">▸</span>`;
        const dirUrl = labDirectionsUrl(r.name);
        const directionsLink = dirUrl
            ? `<a href="${escapeHtml(dirUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-[11px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:underline">📍 Directions ↗</a>`
            : '';
        const breakdown = isOpen
            ? `<div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-1">
                    <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Film (per photo)</span><span class="font-mono">${CUR()}${r.filmCostPerPhoto.toFixed(2)}</span></div>
                    <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Development (per photo) <span class="opacity-60">= dev/roll ÷ ${r.exposures} exp</span></span><span class="font-mono">${CUR()}${r.devCostPerPhoto.toFixed(2)}</span></div>
                    ${r.pushPullFeePerPhoto > 0 ? `<div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Push/pull fee (per photo)</span><span class="font-mono">${CUR()}${r.pushPullFeePerPhoto.toFixed(2)}</span></div>` : ''}
                    <div class="flex justify-between text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>Film cost (per roll)</span><span class="font-mono">${CUR()}${r.filmCostPerRoll.toFixed(2)}</span></div>
                    <div class="flex justify-between text-gray-500 dark:text-gray-400"><span>Development (per roll)</span><span class="font-mono">${CUR()}${r.devCostPerRoll.toFixed(2)}</span></div>
                    <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>Scan</span><span>${r.highResScan ? 'Hi-res' : 'Standard'}</span></div>
                    <div class="flex justify-between text-gray-400 dark:text-gray-500"><span>Turnaround</span><span>${escapeHtml(turnaroundLabels[r.turnaroundTime] || r.turnaroundTime || '—')}</span></div>
                    <div class="flex justify-between font-semibold text-gray-700 dark:text-gray-300 pt-1 border-t border-gray-100 dark:border-gray-700/50"><span>Total per roll (${r.exposures} exp)</span><span class="font-mono">${CUR()}${r.costPerRoll.toFixed(2)}</span></div>
                    ${directionsLink ? `<div class="pt-1.5 flex justify-end">${directionsLink}</div>` : ''}
                </div>`
            : '';
        return `<div>
            <div class="lookup-lab-row cursor-pointer px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-800/50 ${isCurrent ? 'ring-2 ring-blue-400' : ''} ${r.highResScan ? 'border border-indigo-300 dark:border-indigo-700' : ''}" data-lookup-key="${key}" title="Tap for cost breakdown">
                <div class="flex justify-between items-start gap-2">
                    <span class="text-gray-700 dark:text-gray-300">${escapeHtml(r.name)}${renderBadges(r)}${renderPinBtn(r.id)}</span>
                    <span class="font-mono text-right leading-tight text-gray-600 dark:text-gray-400 whitespace-nowrap flex items-center gap-1.5">
                        <span class="font-semibold">${CUR()}${r.costPerPhoto.toFixed(2)}/photo</span>
                        ${chevron}
                    </span>
                </div>
                ${breakdown}
            </div>
        </div>`;
    }).join('');
    wirePinButtons(container);
    // Row expand/collapse (shares the Dev Cost expand state).
    container.querySelectorAll('.lookup-lab-row').forEach(row => row.addEventListener('click', () => {
        const key = row.dataset.lookupKey;
        if (expandAllIso) {
            container.querySelectorAll('.lookup-lab-row').forEach(rr => expandedIsoRows.add(rr.dataset.lookupKey));
            expandAllIso = false;
            expandedIsoRows.delete(key);
        } else if (expandedIsoRows.has(key)) {
            expandedIsoRows.delete(key);
        } else {
            expandedIsoRows.add(key);
        }
        updateLabComparison();
    }));
}

// ---------- Film-only cost per photo (used for film-library comparisons) ----------
// computeCostPerPhoto() now lives in js/dev-cost-calc.js (loaded
// above, shared global scope).

// On the manual Film Lookup tab: after the user enters a film by hand, check
// whether any saved film at the same box speed is cheaper per-photo on a
// full film + dev (+ push/pull) basis, and if so surface it with a buy
// link. Discovery/ranking lives in the Dev Cost tab; this is just a
// "you could save money" nudge for the specific roll being costed.
function updateCheaperAlternative() {
    const container = document.getElementById('cheaperAlternative');
    if (!container) return;
    const boxSpeed = parseInt(document.getElementById('boxSpeed').value) || 0;
    const devSpeed = parseInt(document.getElementById('devSpeed').value) || 0;
    const process = document.getElementById('processSelect').value || 'C41';

    const filmCostTotal = (parseFloat(document.getElementById('filmCost').value) || 0) + (parseFloat(document.getElementById('postageCost').value) || 0);
    const currentFilmCostPerPhoto = computeCostPerPhoto(
        filmCostTotal,
        document.getElementById('rolls').value,
        document.getElementById('exposures').value
    );

    // Needs a complete manual entry and a target speed to compare against.
    if (!boxSpeed || !devSpeed || currentFilmCostPerPhoto === null || currentFilmCostPerPhoto <= 0) {
        container.innerHTML = '';
        return;
    }

    const stopsAbs = Math.round(Math.abs(Math.log2(devSpeed / boxSpeed)) * 10) / 10;
    const allFilms = { ...defaultFilms, ...JSON.parse(localStorage.getItem('filmProfiles') || '{}') };
    const allLabs = { ...defaultLabs, ...JSON.parse(localStorage.getItem('labProfiles') || '{}') };
    const labNames = Object.keys(allLabs).filter(n => !allLabs[n].hidden);
    if (labNames.length === 0) { container.innerHTML = ''; return; }

    // Cheapest lab dev (+ push/pull) for a film of this process at this
    // target speed — shared between the current entry and alternatives,
    // since dev cost only depends on process + stops, not the film.
    function cheapestDevPerPhoto(exposures) {
        let best = null;
        labNames.forEach(labName => {
            normalizeLabServices(allLabs[labName])
                .filter(tier => !(tier.noPushPull && stopsAbs > 0) && tierMatchesFilmProcess(tier, { process }))
                .forEach(tier => {
                    const pushPullFee = stopsAbs > 0
                        ? ((tier.pushPullType === 'per_stop') ? tier.pushPullCost * stopsAbs : tier.pushPullCost)
                        : 0;
                    const devPerPhoto = (tier.devCost + pushPullFee) / exposures;
                    if (best === null || devPerPhoto < best) best = devPerPhoto;
                });
        });
        return best;
    }

    // The user's default lab + tier (Settings), if set and it can develop
    // this film's process at the required push/pull. Returns per-photo dev
    // cost, or null to fall back to cheapest.
    function preferredDevPerPhoto(exposures) {
        const pref = getDefaultLabPref();
        if (!pref || !pref.lab) return null;
        const lab = allLabs[pref.lab];
        if (!lab || lab.hidden) return null;
        const tiers = normalizeLabServices(lab);
        const tier = tiers[pref.tierIndex];
        if (!tier) return null;
        if (!tierMatchesFilmProcess(tier, { process })) return null;
        if (tier.noPushPull && stopsAbs > 0) return null;
        const pushPullFee = stopsAbs > 0
            ? ((tier.pushPullType === 'per_stop') ? tier.pushPullCost * stopsAbs : tier.pushPullCost)
            : 0;
        return (tier.devCost + pushPullFee) / exposures;
    }

    // Find the cheapest saved film (same box speed, same process, within
    // its own push/pull limit) on a full film + dev basis.
    let bestAlt = null;
    Object.values(allFilms).forEach(f => {
        if (f.hidden) return;
        if ((parseInt(f.boxSpeed) || 0) !== boxSpeed) return;
        if ((f.process || 'C41') !== process) return;
        // Match the global Format filter (above the tabs).
        if ((f.format || '35mm') !== cheapestFormat) return;
        const maxPushPull = parseFloat(f.maxPushPull) || 1;
        if (stopsAbs > maxPushPull) return;

        normalizeFilmBundles(f).forEach(b => {
            const filmCpp = computeCostPerPhoto(b.filmCost, b.rolls, b.exposures);
            if (filmCpp === null || filmCpp <= 0 || !b.exposures) return;
            const devCpp = cheapestDevPerPhoto(b.exposures);
            if (devCpp === null) return;
            const totalCpp = filmCpp + devCpp;
            if (bestAlt === null || totalCpp < bestAlt.totalCpp) {
                bestAlt = { name: f.name, storeName: b.storeName, buyLink: b.buyLink, filmCpp, devCpp, totalCpp, exposures: parseInt(b.exposures) || 0 };
            }
        });
    });

    // Current entry's own total. Uses the default lab from Settings when
    // one is set and it can handle this process/push; otherwise cheapest.
    const exposures = parseInt(document.getElementById('exposures').value) || 36;
    const cheapestDev = cheapestDevPerPhoto(exposures);
    const preferredDev = preferredDevPerPhoto(exposures);
    // Headline uses the preferred lab if set & applicable, else cheapest.
    const usingPreferred = preferredDev !== null;
    const currentDevCpp = usingPreferred ? preferredDev : cheapestDev;
    const currentTotal = currentDevCpp !== null ? currentFilmCostPerPhoto + currentDevCpp : null;
    const pref = getDefaultLabPref();
    const cheapestTotal = cheapestDev !== null ? currentFilmCostPerPhoto + cheapestDev : null;

    if (currentTotal === null) { container.innerHTML = ''; return; }

    // Is there a saved library film meaningfully cheaper (>1c/photo)?
    const cheaperExists = !!(bestAlt && bestAlt.totalCpp < currentTotal - 0.01);

    // Large primary block: this entry's cost per photo (film + dev).
    // Orange when a cheaper library film exists, green when this is the
    // cheapest (or tied) option at this speed.
    const c = cheaperExists
        ? { bg: 'bg-orange-100 dark:bg-orange-900/30', label: 'text-orange-700 dark:text-orange-400', big: 'text-orange-800 dark:text-orange-300', sub: 'text-orange-700/80 dark:text-orange-400/80', semanticBg: 'theme-warning-bg', semanticText: 'theme-warning-text' }
        : { bg: 'bg-green-100 dark:bg-green-900/30', label: 'text-green-700 dark:text-green-400', big: 'text-green-800 dark:text-green-300', sub: 'text-green-700/80 dark:text-green-400/80', semanticBg: 'theme-cheapest-bg', semanticText: 'theme-cheapest-text' };
    const headingLabel = usingPreferred ? `Total cost per photo <span class="normal-case opacity-80">· ${escapeHtml(pref.lab)}</span>` : 'Total cost per photo';
    // When using a preferred lab that isn't the cheapest, note the cheapest total underneath.
    const cheapestNote = (usingPreferred && cheapestTotal !== null && cheapestTotal < currentTotal - 0.001)
        ? `<p class="text-xs ${c.semanticText} ${c.sub} mt-1 pt-1 border-t border-current/10">Cheapest lab: ${CUR()}${cheapestTotal.toFixed(2)}/photo total</p>`
        : '';
    const costBlock = `<div class="mt-1 rounded-lg ${c.semanticBg} ${c.bg} px-4 py-3 text-center">
        <p class="text-xs font-semibold ${c.semanticText} ${c.label} uppercase tracking-wide">${headingLabel}</p>
        <p class="font-mono text-3xl font-bold ${c.semanticText} ${c.big} mt-0.5">${CUR()}${currentTotal.toFixed(2)}</p>
        <p class="text-xs ${c.semanticText} ${c.sub} mt-0.5">${CUR()}${currentFilmCostPerPhoto.toFixed(2)} film + ${CUR()}${currentDevCpp.toFixed(2)} dev${stopsAbs > 0 ? ` · at ${devSpeed} ISO` : ''}</p>
        ${cheapestNote}
    </div>`;

    // Smaller secondary block: a cheaper library alternative, if one is
    // meaningfully cheaper (>1c/photo). Otherwise, a quiet "cheapest" note.
    let altBlock = '';
    if (cheaperExists) {
        const saving = currentTotal - bestAlt.totalCpp;
        const buyUrl = sanitizeUrl(bestAlt.buyLink);
        const buyLabel = bestAlt.storeName ? `Buy from ${escapeHtml(bestAlt.storeName)}` : 'Buy this film';
        const buyLink = buyUrl
            ? ` · <a href="${escapeHtml(buyUrl)}" target="_blank" rel="noopener noreferrer" class="font-medium text-blue-600 dark:text-blue-400 hover:underline">🛒 ${buyLabel} ↗</a>`
            : '';
        // If the alternative wins mainly because it has more exposures
        // (dev is a flat per-roll fee spread over more frames), spell that
        // out — otherwise "$0.61 film beats $0.42 film" looks wrong.
        const exposureNote = (bestAlt.exposures && exposures && bestAlt.exposures !== exposures && bestAlt.devCpp < currentDevCpp - 0.001)
            ? `<p class="text-[11px] text-blue-700/70 dark:text-blue-400/70 mt-0.5">Its dev is cheaper per photo because it's ${bestAlt.exposures} exp vs your ${exposures} — the flat per-roll dev fee is spread over more frames.</p>`
            : '';
        altBlock = `<div class="mt-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 px-3 py-1.5">
            <p class="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">💡 Cheaper film in library <span class="normal-case opacity-70">(total film + dev)</span></p>
            <p class="text-xs text-blue-800 dark:text-blue-300 mt-0.5"><span class="font-semibold">${escapeHtml(bestAlt.name)}</span> — ${CUR()}${bestAlt.totalCpp.toFixed(2)}/photo total <span class="opacity-75">(${CUR()}${bestAlt.filmCpp.toFixed(2)} film + ${CUR()}${bestAlt.devCpp.toFixed(2)} dev · saves ${CUR()}${saving.toFixed(2)})</span>${buyLink}</p>
            ${exposureNote}
        </div>`;
    } else if (bestAlt) {
        altBlock = `<div class="mt-2 px-1">
            <p class="text-xs text-gray-500 dark:text-gray-400">🏆 Cheapest saved ${boxSpeed} ISO ${escapeHtml(process)} option at this speed.</p>
        </div>`;
    }

    container.innerHTML = costBlock + altBlock;
}

