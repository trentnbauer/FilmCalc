// Dev Cost / Per ISO calculation engine — pure functions only.
//
// No DOM, no localStorage, no module-level mutable state: every dependency
// (film/lab data, active filters, sort mode, pinned lab names) is an
// explicit parameter. That's what makes this file loadable standalone in
// tests/dev-cost-calc.test.js (via Node's built-in test runner, no jsdom or
// localStorage mock needed) as well as via a plain <script src> in
// index.html — this repo has no bundler, so these are classic global
// function declarations, not an ES module. index.html's own script reads
// from localStorage/DOM and passes the results in; it never duplicates the
// calculation logic itself.
//
// Extracted from index.html as part of #61 (issue: single-file app had no
// isolated, testable calculation layer — several real bugs, #52/#55/#57,
// lived in exactly this logic and shipped without a test catching them).

const TURNAROUND_RANK = { next_day: 0, same_week: 1, longer: 2 };

// Films are keyed by name + box speed + format, so e.g. "Kodak Gold 200" in
// 35mm and 120 are distinct entries that don't overwrite each other.
function filmKey(name, boxSpeed, format) {
    return `${name}|${boxSpeed || 0}|${format || '35mm'}`;
}

// Bridges the current { bundles: [...] } schema with the older flat
// single-bundle schema so both keep working.
//
// camera120Exposures (optional): overrides every bundle's exposures for
// a 120-format film only — 120's actual frame count depends on the
// camera back, not the film stock, so a shared/community film catalog
// entry can't bake in one true value the way it can for 35mm (issue
// #168). This is a display/calculation-time override only — it never
// touches the film's own stored data, and every other format ignores it.
// Callers that must reflect the catalog's raw stored value (Library's
// own editing screens and exports) simply omit this argument.
function normalizeFilmBundles(film, camera120Exposures) {
    const override = (film.format === '120' && camera120Exposures) ? parseInt(camera120Exposures) || null : null;
    if (Array.isArray(film.bundles) && film.bundles.length > 0) {
        return film.bundles.map(b => ({
            rolls: parseInt(b.rolls) || 1,
            exposures: override || parseInt(b.exposures) || 36,
            filmCost: parseFloat(b.filmCost) || 0,
            storeName: b.storeName || '',
            buyLink: b.buyLink || '',
            availability: b.availability || 'national',
            state: b.state || '',
            city: b.city || ''
        }));
    }
    return [{
        rolls: parseInt(film.rolls) || 1,
        exposures: override || parseInt(film.exposures) || 36,
        filmCost: parseFloat(film.filmCost) || 0,
        storeName: film.storeName || '',
        buyLink: film.buyLink || '',
        availability: film.availability || 'national',
        state: film.state || '',
        city: film.city || ''
    }];
}

// Short "X only" label for a bundle/entry whose price isn't valid
// country-wide (issue #114) — e.g. a local shop's price baking in postage
// that doesn't apply elsewhere. Returns '' for national (or unset)
// availability, so callers can drop it in without an extra falsy check.
function bundleLocalityLabel(entry) {
    if (!entry || !entry.availability || entry.availability === 'national') return '';
    const place = entry.availability === 'city' ? entry.city : entry.state;
    return place ? `${place} only` : '';
}

// Bridges the current { name, services: [...] } schema with the older flat
// single-tier schema so both keep working.
function normalizeLabServices(lab) {
    if (Array.isArray(lab.services) && lab.services.length > 0) {
        return lab.services.map(s => ({
            devCost: parseFloat(s.devCost) || 0,
            pushPullCost: parseFloat(s.pushPullCost) || 0,
            pushPullType: s.pushPullType || 'per_stop',
            turnaroundTime: s.turnaroundTime || 'same_week',
            highResScan: !!s.highResScan,
            tiffScan: !!s.tiffScan,
            noPushPull: !!s.noPushPull,
            processes: Array.isArray(s.processes) && s.processes.length > 0 ? s.processes : [s.process || 'C41']
        }));
    }
    return [{
        devCost: parseFloat(lab.devCost) || 0,
        pushPullCost: parseFloat(lab.pushPullCost) || 0,
        pushPullType: lab.pushPullType || 'per_stop',
        turnaroundTime: lab.turnaroundTime || 'same_week',
        highResScan: !!lab.highResScan,
        tiffScan: !!lab.tiffScan,
        noPushPull: !!lab.noPushPull,
        processes: Array.isArray(lab.processes) && lab.processes.length > 0 ? lab.processes : [lab.process || 'C41']
    }];
}

function computeCostPerPhoto(cost, rolls, exposures) {
    const totalPhotos = (parseInt(rolls) || 0) * (parseInt(exposures) || 0);
    return totalPhotos > 0 ? (parseFloat(cost) || 0) / totalPhotos : null;
}

// Total cost of buying enough of one bundle (repeated) to cover a given
// roll count — a partially-used pack still costs its full price, so this
// rounds UP to the next whole pack, never fractional.
function bundleCostForRolls(bundle, rolls) {
    const packRolls = parseInt(bundle.rolls) || 1;
    const packCost = parseFloat(bundle.filmCost) || 0;
    return Math.ceil(rolls / packRolls) * packCost;
}

// For a film with more than one bundle size, the app already shows
// whichever bundle is cheapest per photo — usually the bulk pack, since
// it typically has the best per-roll rate. What that raw per-photo price
// doesn't reveal is that the bulk pack only pays off once you actually
// need that many rolls — someone shooting fewer is better off buying the
// smaller pack repeatedly, even though its per-photo price looks worse
// in isolation, because they're not paying up front for rolls they don't
// need yet (issue #161). This finds that crossover: the roll count at
// which repeatedly buying the smaller pack stops being the better deal.
//
// Only compares bundles that share the SAME exposures-per-roll as the
// cheapest-per-photo bundle — pack sizes of the same product almost
// always do, and without that a "roll count" isn't a fair unit to
// compare on (a 24exp roll and a 36exp roll cost different amounts of
// actual photography per roll, so cost-per-ROLL isn't comparable between
// them the way cost-per-PHOTO already is elsewhere in this file).
//
// Returns null when there's nothing to compare (fewer than two matching
// bundles, or the cheapest-per-photo bundle is already the smallest —
// nothing to buy up front to warn about) or no crossover exists within a
// sane roll count (MAX_ROLLS_TO_CHECK). Otherwise returns
// { breakEvenRolls, bulkBundle, smallerBundle }: below breakEvenRolls,
// smallerBundle (bought repeatedly) is the better deal; at or above it,
// bulkBundle is.
function computeBundleBreakEven(bundles) {
    if (!Array.isArray(bundles) || bundles.length < 2) return null;
    const valid = bundles
        .map(b => ({ ...b, rolls: parseInt(b.rolls) || 1, filmCost: parseFloat(b.filmCost) || 0, exposures: parseInt(b.exposures) || 0 }))
        .filter(b => b.rolls > 0 && b.filmCost > 0);
    if (valid.length < 2) return null;

    // Same as "cheapest per photo" — filmCost/rolls ranks identically to
    // filmCost/(rolls*exposures) whenever exposures match, without
    // needing exposures to compute.
    const bulkBundle = valid.reduce((best, b) => (b.filmCost / b.rolls < best.filmCost / best.rolls ? b : best));
    const smallerBundle = valid
        .filter(b => b !== bulkBundle && b.rolls < bulkBundle.rolls && b.exposures === bulkBundle.exposures)
        .sort((a, b) => b.rolls - a.rolls)[0]; // closest smaller pack size
    if (!smallerBundle) return null;

    const MAX_ROLLS_TO_CHECK = 500;
    for (let rolls = bulkBundle.rolls; rolls <= MAX_ROLLS_TO_CHECK; rolls++) {
        if (bundleCostForRolls(bulkBundle, rolls) <= bundleCostForRolls(smallerBundle, rolls)) {
            return { breakEvenRolls: rolls, bulkBundle, smallerBundle };
        }
    }
    return null;
}

// A lab service tier can support more than one process (e.g. a tier that
// handles both C41 and E6 at the same price) — a film only pairs with tiers
// whose processes include the film's own.
function tierMatchesFilmProcess(tier, film) {
    const processes = Array.isArray(tier.processes) && tier.processes.length > 0 ? tier.processes : ['C41'];
    return processes.includes(film.process || 'C41');
}

// Pure equivalent of index.html's filmPassesProcessFilter(f), which reads
// the active process/format from module-level state — this takes them as
// explicit params instead. Format has no "All": a camera is always one
// format, so an empty/falsy format param means "don't filter by format".
function filmMatchesProcessAndFormat(f, process, format) {
    if (process && process !== 'ALL' && (f.process || 'C41') !== process) return false;
    if (format && (f.format || '35mm') !== format) return false;
    return true;
}

// Sorts already-computed Per ISO entries for display. Mirrors the
// comparator in pickIsoCandidate() so the picked entry and the list order
// always agree.
function sortIsoEntries(entries, sortMode) {
    return entries.slice().sort((a, b) => {
        if (sortMode === 'turnaround') {
            const ta = TURNAROUND_RANK[a.turnaroundTime] ?? 9, tb = TURNAROUND_RANK[b.turnaroundTime] ?? 9;
            if (ta !== tb) return ta - tb;
        } else if (sortMode === 'scan') {
            // Hi-res first, then by price.
            if (a.highResScan !== b.highResScan) return a.highResScan ? -1 : 1;
        }
        return a.totalCostPerPhoto - b.totalCostPerPhoto;
    });
}

// Picks which lab+tier candidate represents a film in the Per ISO list for
// a given sort mode — mirrors the comparator in sortIsoEntries so the
// picked entry and the list order agree. Regression coverage for #55: Price
// picks the true cheapest, but Turnaround/Scan pick the best match for that
// criterion (tie-broken by price) — otherwise every film would always be
// represented by its cheapest tier regardless of sort, making the
// Turnaround/Scan pills look like they do nothing.
function pickIsoCandidate(candidates, sortMode) {
    return candidates.reduce((best, c) => {
        if (!best) return c;
        if (sortMode === 'turnaround') {
            const rb = TURNAROUND_RANK[best.turnaroundTime] ?? 9, rc = TURNAROUND_RANK[c.turnaroundTime] ?? 9;
            if (rc !== rb) return rc < rb ? c : best;
        } else if (sortMode === 'scan') {
            if (c.highResScan !== best.highResScan) return c.highResScan ? c : best;
        }
        return c.totalCostPerPhoto < best.totalCostPerPhoto ? c : best;
    }, null);
}

// For a target shooting ISO, lists every saved film stock able to reach
// it — shot natively at box speed, pushed up from a slower film, or pulled
// down from a faster one — each paired with its cheapest compatible lab.
// Every film stock is included regardless of whether it beats the film's
// own Max Push/Pull limit; entries that exceed that limit are flagged
// rather than hidden, since a film is still a valid (if inadvisable)
// option.
//
// opts:
//   turnaround, hiRes, tiff — Next Day/Same Week/Hi-Res/TIFF filter (issue #49, #144)
//   process, format         — global film-type filters
//   sortMode                — 'price' | 'turnaround' | 'scan' (default 'price')
//   pinnedLabNames           — Set of lab names to always surface per film,
//                              even if beaten on price (home lab + favourites)
//   upgradeThresholdPercent — max % premium for the "recommended upgrade" badge
//   camera120Exposures       — overrides Exposures for 120-format films only
//                              (issue #168 follow-up — see normalizeFilmBundles)
function computeIsoPriceOptions(targetIso, allFilms, allLabs, opts) {
    opts = opts || {};
    const sortMode = opts.sortMode || 'price';
    const pinnedLabNames = opts.pinnedLabNames || new Set();
    const upgradeThresholdPercent = opts.upgradeThresholdPercent ?? 4;
    const matchesFilters = tier => (!opts.turnaround || tier.turnaroundTime === opts.turnaround) && (!opts.hiRes || tier.highResScan) && (!opts.tiff || tier.tiffScan);
    const labNames = Object.keys(allLabs).filter(n => !allLabs[n].hidden);

    const native = [];
    const push = [];
    const pull = [];
    if (labNames.length === 0) return { native, push, pull };

    Object.values(allFilms).filter(f => !f.hidden && filmMatchesProcessAndFormat(f, opts.process, opts.format)).forEach(f => {
        const boxSpeed = parseInt(f.boxSpeed) || 0;
        if (!boxSpeed) return;

        const stopsSigned = Math.round(Math.log2(targetIso / boxSpeed) * 10) / 10;
        const stopsAbs = Math.abs(stopsSigned);
        const maxPushPull = parseFloat(f.maxPushPull) || 1;
        const overLimit = stopsAbs > maxPushPull;

        // Cheapest bundle for this film stock only — same "pick the best
        // pack size" approach used everywhere else in the app.
        let bestBundle = null, bestFilmCostPerPhoto = null;
        normalizeFilmBundles(f, opts.camera120Exposures).forEach(b => {
            const cpp = computeCostPerPhoto(b.filmCost, b.rolls, b.exposures);
            if (cpp !== null && cpp > 0 && (bestFilmCostPerPhoto === null || cpp < bestFilmCostPerPhoto)) {
                bestFilmCostPerPhoto = cpp;
                bestBundle = b;
            }
        });
        if (!bestBundle || !bestBundle.exposures) return;

        // Every compatible lab+tier combination for this film at this ISO —
        // kept as a full list (not collapsed to a single "cheapest" pick up
        // front) so the Turnaround/Scan sort pills have real data to choose
        // between, plus the cheapest hi-res + next-day tier, so the
        // Recommended Pick Threshold can suggest a service upgrade.
        const candidates = [];
        let bestHrNd = null;
        labNames.forEach(labName => {
            normalizeLabServices(allLabs[labName])
                .filter(tier => !(tier.noPushPull && stopsAbs > 0) && tierMatchesFilmProcess(tier, f))
                .forEach(tier => {
                    const pushPullFee = stopsAbs > 0
                        ? ((tier.pushPullType === 'per_stop') ? tier.pushPullCost * stopsAbs : tier.pushPullCost)
                        : 0;
                    const devCostPerPhoto = (tier.devCost + pushPullFee) / bestBundle.exposures;
                    const totalCostPerPhoto = bestFilmCostPerPhoto + devCostPerPhoto;
                    const candidate = {
                        filmName: f.name,
                        labName,
                        stops: stopsSigned,
                        overLimit,
                        maxPushPull,
                        filmCostPerPhoto: bestFilmCostPerPhoto,
                        devCostPerPhoto,
                        totalCostPerPhoto,
                        highResScan: tier.highResScan,
                        tiffScan: tier.tiffScan,
                        turnaroundTime: tier.turnaroundTime,
                        // Extra fields for the expandable breakdown row.
                        devCostBase: tier.devCost,
                        pushPullFee,
                        exposures: bestBundle.exposures,
                        filmCostPerRoll: bestFilmCostPerPhoto * bestBundle.exposures,
                        devCostPerRoll: tier.devCost + pushPullFee,
                        totalCostPerRoll: totalCostPerPhoto * bestBundle.exposures,
                        buyLink: bestBundle.buyLink,
                        storeName: bestBundle.storeName,
                        availability: bestBundle.availability,
                        state: bestBundle.state,
                        city: bestBundle.city
                    };
                    if (matchesFilters(tier)) candidates.push(candidate);
                    if (tier.highResScan && tier.turnaroundTime === 'next_day' &&
                        (!bestHrNd || totalCostPerPhoto < bestHrNd.totalCostPerPhoto)) {
                        bestHrNd = candidate;
                    }
                });
        });
        if (!candidates.length) return;
        // Which single lab+tier represents this film in the list depends on
        // the active sort: Price picks the true cheapest, but
        // Turnaround/Scan pick the best match for that criterion (tie-broken
        // by price) — otherwise every film would always be represented by
        // its cheapest tier regardless of sort, which is usually the
        // slowest/lowest-res one, making the Turnaround/Scan pills look like
        // they do nothing.
        const best = pickIsoCandidate(candidates, sortMode);
        const bestPrice = sortMode === 'price' ? best : pickIsoCandidate(candidates, 'price');
        // If a hi-res + next-day option exists and it's not already the
        // displayed pick, flag it as a recommended upgrade when it's within
        // the threshold of the cheapest — same rule as "Labs For This Roll".
        if (bestHrNd && bestHrNd !== best && bestPrice.totalCostPerPhoto > 0) {
            const premium = (bestHrNd.totalCostPerPhoto - bestPrice.totalCostPerPhoto) / bestPrice.totalCostPerPhoto;
            const threshold = upgradeThresholdPercent / 100;
            if (premium >= 0 && premium < threshold) {
                best.upgrade = { pick: bestHrNd, premium, baselineCostPerPhoto: bestPrice.totalCostPerPhoto };
            }
        }
        const bucket = stopsSigned === 0 ? native : (stopsSigned > 0 ? push : pull);
        bucket.push(best);
        // The home (default) lab and any favourited labs are pinned to the
        // top of every Dev Cost view "even if they'd otherwise be beaten on
        // price" — but Per ISO only ever kept the single best-across-all-labs
        // pick per film, so a pinned lab that never happened to win a film
        // outright would silently never appear at all (no row existed for
        // the pin logic to move). Add its own pick here whenever it differs
        // from the winner, so pinning has something to actually surface.
        pinnedLabNames.forEach(labName => {
            if (labName === best.labName) return;
            const pinnedPick = pickIsoCandidate(candidates.filter(c => c.labName === labName), sortMode);
            if (pinnedPick) bucket.push(pinnedPick);
        });
    });

    native.sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto);
    push.sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto);
    pull.sort((a, b) => a.totalCostPerPhoto - b.totalCostPerPhoto);
    return { native, push, pull };
}

// Builds every saved film's cheapest bundle paired with every saved lab's
// every service tier, at native box speed (no push/pull fee involved) — the
// shared dataset behind both the "Cost Per Photo" (grouped/ranked by film)
// and "Cost Per Lab" (grouped/ranked by lab) tabs.
function computeNativeFilmLabMatrix(allFilms, allLabs, opts) {
    opts = opts || {};
    const matchesFilters = tier => (!opts.turnaround || tier.turnaroundTime === opts.turnaround) && (!opts.hiRes || tier.highResScan) && (!opts.tiff || tier.tiffScan);
    const labNames = Object.keys(allLabs).filter(n => !allLabs[n].hidden);

    const results = [];
    Object.values(allFilms).filter(f => !f.hidden && filmMatchesProcessAndFormat(f, opts.process, opts.format)).forEach(f => {
        const boxSpeed = parseInt(f.boxSpeed) || 0;
        if (!boxSpeed) return;

        let bestBundle = null, bestFilmCostPerPhoto = null;
        normalizeFilmBundles(f, opts.camera120Exposures).forEach(b => {
            const cpp = computeCostPerPhoto(b.filmCost, b.rolls, b.exposures);
            if (cpp !== null && cpp > 0 && (bestFilmCostPerPhoto === null || cpp < bestFilmCostPerPhoto)) {
                bestFilmCostPerPhoto = cpp;
                bestBundle = b;
            }
        });
        if (!bestBundle || !bestBundle.exposures) return;

        labNames.forEach(labName => {
            normalizeLabServices(allLabs[labName]).filter(tier => tierMatchesFilmProcess(tier, f) && matchesFilters(tier)).forEach(tier => {
                const devCostPerPhoto = tier.devCost / bestBundle.exposures;
                results.push({
                    filmName: f.name,
                    boxSpeed,
                    format: f.format,
                    labName,
                    filmCostPerPhoto: bestFilmCostPerPhoto,
                    devCostPerPhoto,
                    totalCostPerPhoto: bestFilmCostPerPhoto + devCostPerPhoto,
                    highResScan: tier.highResScan,
                    tiffScan: tier.tiffScan,
                    turnaroundTime: tier.turnaroundTime,
                    // Breakdown fields for the expandable row (native = no push/pull).
                    devCostBase: tier.devCost,
                    pushPullFee: 0,
                    exposures: bestBundle.exposures,
                    filmCostPerRoll: bestFilmCostPerPhoto * bestBundle.exposures,
                    devCostPerRoll: tier.devCost,
                    totalCostPerRoll: (bestFilmCostPerPhoto + devCostPerPhoto) * bestBundle.exposures,
                    buyLink: bestBundle.buyLink,
                    storeName: bestBundle.storeName,
                    availability: bestBundle.availability,
                    state: bestBundle.state,
                    city: bestBundle.city
                });
            });
        });
    });
    return results;
}

// Same shape as computeNativeFilmLabMatrix(), but every pairing is priced
// with exactly 1 stop of push/pull applied. 1 stop is used as the
// representative "cheapest possible push or pull" distance since this
// app's fee model (flat fee, or per-stop fee that only grows with distance)
// never gets cheaper at a larger push/pull — and push vs. pull cost exactly
// the same here, since fees are keyed on stop magnitude only, not direction.
function computeOneStopFilmLabMatrix(allFilms, allLabs, opts) {
    opts = opts || {};
    const matchesFilters = tier => (!opts.turnaround || tier.turnaroundTime === opts.turnaround) && (!opts.hiRes || tier.highResScan) && (!opts.tiff || tier.tiffScan);
    const labNames = Object.keys(allLabs).filter(n => !allLabs[n].hidden);

    const results = [];
    Object.values(allFilms).filter(f => !f.hidden && filmMatchesProcessAndFormat(f, opts.process, opts.format)).forEach(f => {
        const boxSpeed = parseInt(f.boxSpeed) || 0;
        if (!boxSpeed) return;

        let bestBundle = null, bestFilmCostPerPhoto = null;
        normalizeFilmBundles(f, opts.camera120Exposures).forEach(b => {
            const cpp = computeCostPerPhoto(b.filmCost, b.rolls, b.exposures);
            if (cpp !== null && cpp > 0 && (bestFilmCostPerPhoto === null || cpp < bestFilmCostPerPhoto)) {
                bestFilmCostPerPhoto = cpp;
                bestBundle = b;
            }
        });
        if (!bestBundle || !bestBundle.exposures) return;

        labNames.forEach(labName => {
            normalizeLabServices(allLabs[labName])
                .filter(tier => !tier.noPushPull && tierMatchesFilmProcess(tier, f) && matchesFilters(tier))
                .forEach(tier => {
                    const devCostPerPhoto = (tier.devCost + tier.pushPullCost) / bestBundle.exposures;
                    results.push({
                        filmName: f.name,
                        labName,
                        filmCostPerPhoto: bestFilmCostPerPhoto,
                        devCostPerPhoto,
                        totalCostPerPhoto: bestFilmCostPerPhoto + devCostPerPhoto
                    });
                });
        });
    });
    return results;
}

// Given every lab+tier candidate for a single film (unfiltered by any
// active turnaround/hi-res UI filter — the recommendation should surface
// options outside the current filter, same as computeIsoPriceOptions'
// own upgrade logic below), finds whether the cheapest hi-res + next-day
// tier is worth recommending as an upgrade over `cheapest`: it must
// exist, not already be the cheapest, and cost within thresholdPercent
// more. Returns { pick, premium, baselineCostPerPhoto } or undefined.
// Used by the Per Film / Per Photo views in js/dev-cost-ui.js — Per ISO
// has its own copy of this same rule inlined in computeIsoPriceOptions,
// since its candidate shape is built up differently.
function findHiResFastestUpgrade(candidates, cheapest, thresholdPercent) {
    if (!cheapest || cheapest.totalCostPerPhoto <= 0) return undefined;
    let bestHrNd = null;
    candidates.forEach(c => {
        if (c.highResScan && c.turnaroundTime === 'next_day' && (!bestHrNd || c.totalCostPerPhoto < bestHrNd.totalCostPerPhoto)) {
            bestHrNd = c;
        }
    });
    if (!bestHrNd || bestHrNd === cheapest) return undefined;
    const premium = (bestHrNd.totalCostPerPhoto - cheapest.totalCostPerPhoto) / cheapest.totalCostPerPhoto;
    const threshold = (thresholdPercent ?? 4) / 100;
    if (premium < 0 || premium >= threshold) return undefined;
    return { pick: bestHrNd, premium, baselineCostPerPhoto: cheapest.totalCostPerPhoto };
}

// Used by every Dev Cost view (Per Photo / Per Lab / Per Film / Per ISO) to
// pin any favourited lab(s) to the top of the displayed list ahead of price
// order, so "my lab" doesn't get buried below cheaper options. Rows stay
// price/sort-ordered within each group (favourites, then the rest); the
// true price rank comes from the caller's own price-sorted list, so the
// "cheapest" marker stays accurate even when a favourite is shown first.
function reorderFavouriteLabsFirst(priceSortedRows, favouriteLabNames) {
    const favs = priceSortedRows.filter(e => favouriteLabNames.has(e.labName));
    const rest = priceSortedRows.filter(e => !favouriteLabNames.has(e.labName));
    return [...favs, ...rest];
}

// Per Photo is grouped one row per FILM (not per lab), so it's the film
// favourite — not the lab favourite — that should pin a row to the top, the
// same way Per Lab pins by lab favourite. Mirrors reorderFavouriteLabsFirst
// exactly, just keyed on the film identity.
function reorderFavouriteFilmsFirst(priceSortedRows, favouriteFilmKeys) {
    const favs = priceSortedRows.filter(e => favouriteFilmKeys.has(filmKey(e.filmName, e.boxSpeed, e.format)));
    const rest = priceSortedRows.filter(e => !favouriteFilmKeys.has(filmKey(e.filmName, e.boxSpeed, e.format)));
    return [...favs, ...rest];
}

// Per Film specifically also has a single configured "default" (home) lab
// from the Favourites setup — pinned to the top since it's the lab every
// other part of the app (Film Lookup, pinned comparisons) already treats as
// "your" lab for cost purposes. Per Film uses real pinning (above) instead
// of favourite-lab reordering for everything else.
function reorderDefaultLabFirst(priceSortedRows, defaultLabName) {
    const def = defaultLabName ? priceSortedRows.filter(e => e.labName === defaultLabName) : [];
    const rest = priceSortedRows.filter(e => e.labName !== defaultLabName);
    return [...def, ...rest];
}

// UMD-lite: plain globals for the browser <script src> case, CommonJS
// export for node:test. `typeof module` is safe to check even when
// undeclared (browsers), so this never throws in either environment.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TURNAROUND_RANK,
        filmKey,
        normalizeFilmBundles,
        normalizeLabServices,
        computeCostPerPhoto,
        bundleCostForRolls,
        computeBundleBreakEven,
        tierMatchesFilmProcess,
        filmMatchesProcessAndFormat,
        sortIsoEntries,
        pickIsoCandidate,
        computeIsoPriceOptions,
        computeNativeFilmLabMatrix,
        computeOneStopFilmLabMatrix,
        findHiResFastestUpgrade,
        reorderFavouriteLabsFirst,
        reorderFavouriteFilmsFirst,
        reorderDefaultLabFirst
    };
}
