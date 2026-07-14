// Tests for js/dev-cost-calc.js — the extracted, pure Dev Cost / Per ISO
// calculation engine (see that file for why it's pure: no DOM, no
// localStorage, no module-level mutable state).
//
// Run with: node --test tests/
//
// Fixtures below are deliberately small and hand-computable rather than
// realistic film/lab data — every assertion's expected value is derived by
// hand in a comment next to it, so a failure is easy to diagnose without
// re-deriving the math.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    filmKey,
    normalizeFilmBundles,
    normalizeLabServices,
    computeCostPerPhoto,
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
} = require('../js/dev-cost-calc.js');

// ---------- Shared fixtures ----------
// One film, native at 400 ISO, one roll of 36 exposures for $10 —
// filmCostPerPhoto = 10/36.
const FILM_400 = {
    name: 'Test Film 400',
    boxSpeed: 400,
    process: 'C41',
    format: '35mm',
    maxPushPull: 2,
    bundles: [{ rolls: 1, exposures: 36, filmCost: 10 }]
};
const ALL_FILMS = { filmA: FILM_400 };

// Labs are keyed by their own name (this app's storage convention — see
// e.g. defaultLabs/labProfiles in index.html), not a separate id + .name
// field like films are. computeIsoPriceOptions() etc. use the object key
// as the candidate's labName, so the fixture keys ARE the display names.
//
// Cheap Lab: same-week, standard scan, devCost 15 -> devCostPerPhoto 15/36
//   total = 25/36 ≈ 0.694
// Fast Lab: next-day, hi-res, devCost 25 -> devCostPerPhoto 25/36
//   total = 35/36 ≈ 0.972 (pricier, but faster + hi-res)
const ALL_LABS = {
    'Cheap Lab': {
        hidden: false,
        services: [{ devCost: 15, pushPullCost: 3, pushPullType: 'per_stop', turnaroundTime: 'same_week', highResScan: false, noPushPull: false, processes: ['C41'] }]
    },
    'Fast Lab': {
        hidden: false,
        services: [{ devCost: 25, pushPullCost: 3, pushPullType: 'per_stop', turnaroundTime: 'next_day', highResScan: true, noPushPull: false, processes: ['C41'] }]
    }
};

// ---------- Pure helpers ----------

test('filmKey distinguishes same name at different box speeds/formats', () => {
    assert.notEqual(filmKey('Kodak Gold', 200, '35mm'), filmKey('Kodak Gold', 400, '35mm'));
    assert.notEqual(filmKey('Kodak Gold', 200, '35mm'), filmKey('Kodak Gold', 200, '120'));
    assert.equal(filmKey('Kodak Gold', 200, '35mm'), filmKey('Kodak Gold', 200, '35mm'));
});

test('normalizeFilmBundles falls back to the legacy flat schema', () => {
    const bundles = normalizeFilmBundles({ rolls: '3', exposures: '24', filmCost: '9.5' });
    assert.deepEqual(bundles, [{ rolls: 3, exposures: 24, filmCost: 9.5, storeName: '', buyLink: '', availability: 'national', state: '', city: '' }]);
});

test('normalizeLabServices falls back to the legacy flat schema', () => {
    const tiers = normalizeLabServices({ devCost: '20', pushPullCost: '5' });
    assert.equal(tiers.length, 1);
    assert.equal(tiers[0].devCost, 20);
    assert.equal(tiers[0].turnaroundTime, 'same_week'); // default
    assert.equal(tiers[0].highResScan, false); // default
    assert.equal(tiers[0].tiffScan, false); // default
});

test('computeCostPerPhoto divides cost across rolls*exposures, null when zero photos', () => {
    assert.equal(computeCostPerPhoto(36, 1, 36), 1);
    assert.equal(computeCostPerPhoto(10, 0, 36), null);
});

test('tierMatchesFilmProcess checks the tier processes list', () => {
    assert.equal(tierMatchesFilmProcess({ processes: ['C41', 'E6'] }, { process: 'E6' }), true);
    assert.equal(tierMatchesFilmProcess({ processes: ['C41'] }, { process: 'E6' }), false);
});

test('filmMatchesProcessAndFormat treats ALL process and empty format as no-op', () => {
    const film = { process: 'BW', format: '120' };
    assert.equal(filmMatchesProcessAndFormat(film, 'ALL', ''), true);
    assert.equal(filmMatchesProcessAndFormat(film, 'C41', ''), false);
    assert.equal(filmMatchesProcessAndFormat(film, 'BW', '35mm'), false);
    assert.equal(filmMatchesProcessAndFormat(film, 'BW', '120'), true);
});

// ---------- sortIsoEntries / pickIsoCandidate ----------
// Regression coverage for #55: the sort pills used to have no visible
// effect, because the entry representing a film never changed with the
// active sort — see computeIsoPriceOptions tests below for the full
// end-to-end version of this bug.

const ENTRIES = [
    { labName: 'A', turnaroundTime: 'same_week', highResScan: false, totalCostPerPhoto: 0.5 },
    { labName: 'B', turnaroundTime: 'next_day', highResScan: true, totalCostPerPhoto: 0.9 },
    { labName: 'C', turnaroundTime: 'longer', highResScan: false, totalCostPerPhoto: 0.3 }
];

test('sortIsoEntries: price mode sorts by totalCostPerPhoto ascending', () => {
    const sorted = sortIsoEntries(ENTRIES, 'price');
    assert.deepEqual(sorted.map(e => e.labName), ['C', 'A', 'B']);
});

test('sortIsoEntries: turnaround mode ranks next_day > same_week > longer, price tie-break', () => {
    const sorted = sortIsoEntries(ENTRIES, 'turnaround');
    assert.deepEqual(sorted.map(e => e.labName), ['B', 'A', 'C']);
});

test('sortIsoEntries: scan mode ranks hi-res first, price tie-break', () => {
    const sorted = sortIsoEntries(ENTRIES, 'scan');
    assert.deepEqual(sorted.map(e => e.labName), ['B', 'C', 'A']);
});

test('pickIsoCandidate: price mode picks the cheapest candidate', () => {
    const picked = pickIsoCandidate(ENTRIES, 'price');
    assert.equal(picked.labName, 'C');
});

test('pickIsoCandidate: turnaround mode picks next_day even though pricier', () => {
    const picked = pickIsoCandidate(ENTRIES, 'turnaround');
    assert.equal(picked.labName, 'B');
});

test('pickIsoCandidate: scan mode picks hi-res even though pricier', () => {
    const picked = pickIsoCandidate(ENTRIES, 'scan');
    assert.equal(picked.labName, 'B');
});

// ---------- computeIsoPriceOptions ----------

test('computeIsoPriceOptions: price mode (default) picks the cheapest lab per film', () => {
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, ALL_LABS, {});
    assert.equal(native.length, 1);
    assert.equal(native[0].labName, 'Cheap Lab');
});

test('#55 regression: turnaround mode picks the next-day lab even though it is pricier', () => {
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, ALL_LABS, { sortMode: 'turnaround' });
    assert.equal(native.length, 1);
    assert.equal(native[0].labName, 'Fast Lab');
});

test('#55 regression: scan mode picks the hi-res lab even though it is pricier', () => {
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, ALL_LABS, { sortMode: 'scan' });
    assert.equal(native.length, 1);
    assert.equal(native[0].labName, 'Fast Lab');
});

test('#49 regression: turnaround filter drops labs whose tier does not match', () => {
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, ALL_LABS, { turnaround: 'next_day' });
    assert.equal(native.length, 1);
    assert.equal(native[0].labName, 'Fast Lab');
});

test('#49 regression: hiRes filter drops labs whose tier does not match', () => {
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, ALL_LABS, { hiRes: true });
    assert.equal(native.length, 1);
    assert.equal(native[0].labName, 'Fast Lab');
});

test('#144: tiff filter drops labs whose tier does not match', () => {
    const labsWithTiff = {
        ...ALL_LABS,
        'TIFF Lab': {
            hidden: false,
            services: [{ devCost: 20, pushPullCost: 3, pushPullType: 'per_stop', turnaroundTime: 'same_week', highResScan: false, tiffScan: true, noPushPull: false, processes: ['C41'] }]
        }
    };
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, labsWithTiff, { tiff: true });
    assert.equal(native.length, 1);
    assert.equal(native[0].labName, 'TIFF Lab');
});

test('#144: hiRes and tiff filters are independent -- a tier can match one, both, or neither', () => {
    const labs = {
        'Hi-Res Only': {
            hidden: false,
            services: [{ devCost: 15, pushPullCost: 0, pushPullType: 'flat', turnaroundTime: 'same_week', highResScan: true, tiffScan: false, noPushPull: false, processes: ['C41'] }]
        },
        'TIFF Only': {
            hidden: false,
            services: [{ devCost: 16, pushPullCost: 0, pushPullType: 'flat', turnaroundTime: 'same_week', highResScan: false, tiffScan: true, noPushPull: false, processes: ['C41'] }]
        },
        'Both': {
            hidden: false,
            services: [{ devCost: 17, pushPullCost: 0, pushPullType: 'flat', turnaroundTime: 'same_week', highResScan: true, tiffScan: true, noPushPull: false, processes: ['C41'] }]
        },
        'Neither': {
            hidden: false,
            services: [{ devCost: 14, pushPullCost: 0, pushPullType: 'flat', turnaroundTime: 'same_week', highResScan: false, tiffScan: false, noPushPull: false, processes: ['C41'] }]
        }
    };
    // computeNativeFilmLabMatrix (not computeIsoPriceOptions, which collapses
    // to one winning lab per film) so every matching lab is visible at once.
    const bothFilters = computeNativeFilmLabMatrix(ALL_FILMS, labs, { hiRes: true, tiff: true });
    assert.deepEqual(bothFilters.map(e => e.labName), ['Both']);

    const tiffOnlyFilter = computeNativeFilmLabMatrix(ALL_FILMS, labs, { tiff: true });
    assert.deepEqual(tiffOnlyFilter.map(e => e.labName).sort(), ['Both', 'TIFF Only']);
});

test('#57 regression: a pinned lab that never wins on price still gets its own entry', () => {
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, ALL_LABS, {
        pinnedLabNames: new Set(['Fast Lab'])
    });
    // Cheap Lab wins on price (the default sort), but Fast Lab is pinned —
    // both should be present, not just the winner.
    const labNames = native.map(e => e.labName).sort();
    assert.deepEqual(labNames, ['Cheap Lab', 'Fast Lab']);
});

test('computeIsoPriceOptions: a pinned lab that already won is not duplicated', () => {
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, ALL_LABS, {
        pinnedLabNames: new Set(['Cheap Lab'])
    });
    assert.equal(native.length, 1);
    assert.equal(native[0].labName, 'Cheap Lab');
});

test('computeIsoPriceOptions: process/format filter excludes non-matching films', () => {
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, ALL_LABS, { process: 'E6' });
    assert.equal(native.length, 0);
});

test('computeIsoPriceOptions: pushed/pulled films land in the push/pull buckets', () => {
    // Pushing this film 1 stop to 800 ISO — same fixtures, different target.
    const { native, push } = computeIsoPriceOptions(800, ALL_FILMS, ALL_LABS, {});
    assert.equal(native.length, 0);
    assert.equal(push.length, 1);
});

test('computeIsoPriceOptions: recommended-upgrade badge appears within threshold, not beyond it', () => {
    // A hi-res+next-day tier only ~2% pricier than the cheapest — should
    // trigger the upgrade badge at the default-ish 4% threshold.
    const closeLabs = {
        'Cheap Lab': ALL_LABS['Cheap Lab'],
        'Fast Lab': {
            hidden: false,
            services: [{ devCost: 15.5, pushPullCost: 3, pushPullType: 'per_stop', turnaroundTime: 'next_day', highResScan: true, noPushPull: false, processes: ['C41'] }]
        }
    };
    const { native } = computeIsoPriceOptions(400, ALL_FILMS, closeLabs, { upgradeThresholdPercent: 4 });
    assert.equal(native[0].labName, 'Cheap Lab');
    assert.ok(native[0].upgrade, 'expected an upgrade suggestion within threshold');
    assert.equal(native[0].upgrade.pick.labName, 'Fast Lab');

    const { native: noUpgrade } = computeIsoPriceOptions(400, ALL_FILMS, ALL_LABS, { upgradeThresholdPercent: 4 });
    assert.equal(noUpgrade[0].upgrade, undefined, 'Fast Lab is ~40% pricier — well outside a 4% threshold');
});

test('computeIsoPriceOptions: no labs at all returns empty buckets', () => {
    const result = computeIsoPriceOptions(400, ALL_FILMS, {}, {});
    assert.deepEqual(result, { native: [], push: [], pull: [] });
});

// ---------- computeNativeFilmLabMatrix / computeOneStopFilmLabMatrix ----------

test('computeNativeFilmLabMatrix: one row per matching film+lab+tier', () => {
    const results = computeNativeFilmLabMatrix(ALL_FILMS, ALL_LABS, {});
    assert.equal(results.length, 2);
    assert.deepEqual(results.map(r => r.labName).sort(), ['Cheap Lab', 'Fast Lab']);
});

test('#49 regression: computeNativeFilmLabMatrix respects the turnaround/hiRes filter', () => {
    const results = computeNativeFilmLabMatrix(ALL_FILMS, ALL_LABS, { turnaround: 'next_day' });
    assert.equal(results.length, 1);
    assert.equal(results[0].labName, 'Fast Lab');
});

test('#144: computeNativeFilmLabMatrix respects the tiff filter', () => {
    const labsWithTiff = {
        ...ALL_LABS,
        'TIFF Lab': {
            hidden: false,
            services: [{ devCost: 20, pushPullCost: 3, pushPullType: 'per_stop', turnaroundTime: 'same_week', highResScan: false, tiffScan: true, noPushPull: false, processes: ['C41'] }]
        }
    };
    const results = computeNativeFilmLabMatrix(ALL_FILMS, labsWithTiff, { tiff: true });
    assert.equal(results.length, 1);
    assert.equal(results[0].labName, 'TIFF Lab');
    assert.equal(results[0].tiffScan, true);
});

test('computeOneStopFilmLabMatrix: excludes noPushPull tiers and applies the filter', () => {
    const labsWithNoPushPull = {
        ...ALL_LABS,
        'Fixed Price Lab': {
            hidden: false,
            services: [{ devCost: 12, pushPullCost: 0, pushPullType: 'flat', turnaroundTime: 'same_week', highResScan: false, noPushPull: true, processes: ['C41'] }]
        }
    };
    const results = computeOneStopFilmLabMatrix(ALL_FILMS, labsWithNoPushPull, {});
    assert.ok(!results.some(r => r.labName === 'Fixed Price Lab'), 'noPushPull tiers must be excluded');
});

// ---------- reorder* pinning helpers ----------

test('reorderFavouriteLabsFirst pins favourited labs ahead, preserving relative order', () => {
    const rows = [{ labName: 'A' }, { labName: 'B' }, { labName: 'C' }];
    const reordered = reorderFavouriteLabsFirst(rows, new Set(['C']));
    assert.deepEqual(reordered.map(r => r.labName), ['C', 'A', 'B']);
});

test('reorderFavouriteFilmsFirst pins favourited films ahead by filmKey', () => {
    const rows = [
        { filmName: 'A', boxSpeed: 400, format: '35mm' },
        { filmName: 'B', boxSpeed: 200, format: '35mm' }
    ];
    const favKey = filmKey('B', 200, '35mm');
    const reordered = reorderFavouriteFilmsFirst(rows, new Set([favKey]));
    assert.deepEqual(reordered.map(r => r.filmName), ['B', 'A']);
});

test('reorderDefaultLabFirst pins the named lab ahead, others keep their order', () => {
    const rows = [{ labName: 'A' }, { labName: 'B' }, { labName: 'C' }];
    assert.deepEqual(reorderDefaultLabFirst(rows, 'B').map(r => r.labName), ['B', 'A', 'C']);
    // A null/unset default lab is a no-op.
    assert.deepEqual(reorderDefaultLabFirst(rows, null).map(r => r.labName), ['A', 'B', 'C']);
});

// ---------- findHiResFastestUpgrade (issue: apply the "cheapest hi-res +
// fastest" recommendation from Film Lookup to Lab Costs' Per Film/Photo) ----------

test('findHiResFastestUpgrade recommends a hi-res+next-day tier within threshold', () => {
    const cheapest = { labName: 'Cheap Lab', totalCostPerPhoto: 0.78, highResScan: false, turnaroundTime: 'same_week' };
    // 0.81 is (0.81-0.78)/0.78 = 3.85% more — within a 4% threshold.
    const hiResFastest = { labName: 'Fast Lab', totalCostPerPhoto: 0.81, highResScan: true, turnaroundTime: 'next_day' };
    const candidates = [cheapest, hiResFastest, { labName: 'Other', totalCostPerPhoto: 0.90, highResScan: false, turnaroundTime: 'same_week' }];
    const upgrade = findHiResFastestUpgrade(candidates, cheapest, 4);
    assert.ok(upgrade, 'expected an upgrade recommendation within threshold');
    assert.equal(upgrade.pick.labName, 'Fast Lab');
    assert.equal(upgrade.baselineCostPerPhoto, 0.78);
    assert.ok(Math.abs(upgrade.premium - (0.81 - 0.78) / 0.78) < 1e-9);
});

test('findHiResFastestUpgrade returns undefined beyond the threshold', () => {
    const cheapest = { labName: 'Cheap Lab', totalCostPerPhoto: 0.78, highResScan: false, turnaroundTime: 'same_week' };
    // 1.10 is ~41% more — well outside a 4% threshold.
    const hiResFastest = { labName: 'Fast Lab', totalCostPerPhoto: 1.10, highResScan: true, turnaroundTime: 'next_day' };
    const upgrade = findHiResFastestUpgrade([cheapest, hiResFastest], cheapest, 4);
    assert.equal(upgrade, undefined);
});

test('findHiResFastestUpgrade returns undefined when the cheapest is already hi-res+next-day', () => {
    const cheapest = { labName: 'Cheap Lab', totalCostPerPhoto: 0.78, highResScan: true, turnaroundTime: 'next_day' };
    const upgrade = findHiResFastestUpgrade([cheapest], cheapest, 4);
    assert.equal(upgrade, undefined);
});

test('findHiResFastestUpgrade returns undefined when no candidate is hi-res+next-day', () => {
    const cheapest = { labName: 'Cheap Lab', totalCostPerPhoto: 0.78, highResScan: false, turnaroundTime: 'same_week' };
    const other = { labName: 'Other', totalCostPerPhoto: 0.85, highResScan: true, turnaroundTime: 'same_week' };
    const upgrade = findHiResFastestUpgrade([cheapest, other], cheapest, 4);
    assert.equal(upgrade, undefined);
});
