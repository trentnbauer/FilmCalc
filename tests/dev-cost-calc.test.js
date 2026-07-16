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
    effectiveMailBackFee,
    bundleCostForRolls,
    computeBundleBreakEven,
    tierMatchesFilmProcess,
    filmMatchesProcessAndFormat,
    sortIsoEntries,
    pickIsoCandidate,
    computeIsoPriceOptions,
    computeNativeFilmLabMatrix,
    computeOneStopFilmLabMatrix,
    computeFormatComparisonForFilm,
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

// ---------- normalizeFilmBundles: 120 Camera Type override (issue #168
// follow-up — the override is session/calculation-time only, never
// written back onto the film, and only ever applies to 120-format films) ----------

test('normalizeFilmBundles: camera120Exposures overrides every bundle of a 120 film', () => {
    const film = { format: '120', bundles: [{ rolls: 1, exposures: 12, filmCost: 8 }, { rolls: 5, exposures: 12, filmCost: 35 }] };
    const bundles = normalizeFilmBundles(film, 10); // e.g. a 6x7 back
    assert.deepEqual(bundles.map(b => b.exposures), [10, 10]);
});

test('normalizeFilmBundles: camera120Exposures is ignored for non-120 formats', () => {
    const film = { format: '35mm', bundles: [{ rolls: 1, exposures: 36, filmCost: 8 }] };
    const bundles = normalizeFilmBundles(film, 10);
    assert.equal(bundles[0].exposures, 36);
});

test('normalizeFilmBundles: no override falls back to the film\'s own stored exposures', () => {
    const film = { format: '120', bundles: [{ rolls: 1, exposures: 12, filmCost: 8 }] };
    assert.equal(normalizeFilmBundles(film)[0].exposures, 12);
});

test('normalizeLabServices falls back to the legacy flat schema', () => {
    const tiers = normalizeLabServices({ devCost: '20', pushPullCost: '5' });
    assert.equal(tiers.length, 1);
    assert.equal(tiers[0].devCost, 20);
    assert.equal(tiers[0].turnaroundTime, 'same_week'); // default
    assert.equal(tiers[0].highResScan, false); // default
    assert.equal(tiers[0].tiffScan, false); // default
    assert.equal(tiers[0].mailBackCost, null); // unset -- unknown whether mail-back is offered (issue #200)
});

// ---------- mailBackCost (issue #159: fold a mail-in lab's return postage
// into the per-roll dev cost, the same way pushPullCost already is) ----------
// null means "unknown/can't mail back", distinct from an explicit 0 meaning
// "confirmed free" (issue #200) -- everything used to default to 0, which
// silently implied every lab offered free mail-back.

test('normalizeLabServices: mailBackCost is null unless explicitly set, parses through numbers (incl. 0)', () => {
    const withDefault = normalizeLabServices({ services: [{ devCost: 15 }] });
    assert.equal(withDefault[0].mailBackCost, null);
    const blank = normalizeLabServices({ services: [{ devCost: 15, mailBackCost: '' }] });
    assert.equal(blank[0].mailBackCost, null);
    const withValue = normalizeLabServices({ services: [{ devCost: 15, mailBackCost: '4.5' }] });
    assert.equal(withValue[0].mailBackCost, 4.5);
    const explicitFree = normalizeLabServices({ services: [{ devCost: 15, mailBackCost: 0 }] });
    assert.equal(explicitFree[0].mailBackCost, 0);
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

test('computeNativeFilmLabMatrix: camera120Exposures overrides a 120 film\'s cost-per-photo, leaves 35mm alone', () => {
    const film120 = { name: 'Test 120 Film', boxSpeed: 400, process: 'C41', format: '120', maxPushPull: 1, bundles: [{ rolls: 1, exposures: 12, filmCost: 12 }] };
    const films = { filmA: FILM_400, film120 };
    const oneLab = { 'Cheap Lab': ALL_LABS['Cheap Lab'] };
    // Native (no override): 12/12 = 1.00/photo film cost.
    const native = computeNativeFilmLabMatrix(films, oneLab, {});
    const nativeRow = native.find(r => r.filmName === 'Test 120 Film');
    assert.ok(Math.abs(nativeRow.filmCostPerPhoto - 12 / 12) < 1e-9);
    // Overridden to a 6x7 back (10 exp): 12/10 = 1.20/photo film cost.
    const overridden = computeNativeFilmLabMatrix(films, oneLab, { camera120Exposures: 10 });
    const overriddenRow = overridden.find(r => r.filmName === 'Test 120 Film');
    assert.ok(Math.abs(overriddenRow.filmCostPerPhoto - 12 / 10) < 1e-9);
    // The 35mm film in the same call is untouched by the 120 override.
    const untouched35mm = overridden.find(r => r.filmName === FILM_400.name);
    assert.ok(Math.abs(untouched35mm.filmCostPerPhoto - 10 / 36) < 1e-9);
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

// ---------- computeFormatComparisonForFilm (issue #162: compare a stock's
// cost per photo across every format it's saved in) ----------

test('computeFormatComparisonForFilm: returns one cheapest entry per format, sorted cheapest-first', () => {
    // Same name saved as both 35mm (10/36 ~ 0.278/photo film cost) and 120
    // (6/12 = 0.5/photo film cost) -- 120 is pricier per photo here.
    const film120 = { name: 'Test Film 400', boxSpeed: 400, process: 'C41', format: '120', maxPushPull: 1, bundles: [{ rolls: 1, exposures: 12, filmCost: 6 }] };
    const films = { filmA: FILM_400, film120 };
    const comparison = computeFormatComparisonForFilm('Test Film 400', films, ALL_LABS, {});
    assert.equal(comparison.length, 2);
    assert.deepEqual(comparison.map(e => e.format), ['35mm', '120']); // cheapest (35mm) first
    assert.ok(comparison[0].totalCostPerPhoto < comparison[1].totalCostPerPhoto);
});

test('computeFormatComparisonForFilm: a stock saved in only one format returns a single entry', () => {
    const comparison = computeFormatComparisonForFilm('Test Film 400', ALL_FILMS, ALL_LABS, {});
    assert.equal(comparison.length, 1);
    assert.equal(comparison[0].format, '35mm');
});

test('computeFormatComparisonForFilm: an unknown film name returns no entries', () => {
    assert.deepEqual(computeFormatComparisonForFilm('Nonexistent Film', ALL_FILMS, ALL_LABS, {}), []);
});

test('computeFormatComparisonForFilm: camera120Exposures overrides the 120 entry\'s cost, not the 35mm one', () => {
    const film120 = { name: 'Test Film 400', boxSpeed: 400, process: 'C41', format: '120', maxPushPull: 1, bundles: [{ rolls: 1, exposures: 12, filmCost: 6 }] };
    const films = { filmA: FILM_400, film120 };
    // 6x7 back (10 exp) instead of the stored 12 -> 6/10 = 0.6/photo film cost.
    const comparison = computeFormatComparisonForFilm('Test Film 400', films, ALL_LABS, { camera120Exposures: 10 });
    const entry120 = comparison.find(e => e.format === '120');
    assert.ok(Math.abs(entry120.filmCostPerPhoto - 6 / 10) < 1e-9);
    const entry35 = comparison.find(e => e.format === '35mm');
    assert.ok(Math.abs(entry35.filmCostPerPhoto - 10 / 36) < 1e-9); // unchanged
});

// ---------- mailBackCost folded into totals (issue #159), opt-in (issue #179) ----------
// mailBackCost used to be added unconditionally, which overstated the true
// cost for a lab that's normally a drop-off/pickup and only occasionally
// needs a mail-in return. It's now opt-in per calculation via
// opts.includeMailBack (off by default), with opts.mailBackRollCount splitting
// the flat fee across however many rolls are mailed back together.
// Mail Lab: same-week, standard scan, devCost 10, mailBackCost 8. With
// includeMailBack: devCostPerPhoto = (10 + 8) / 36 = 0.5, total = (10/36) + 0.5
// ≈ 0.778. Without it (the default): devCostPerPhoto = 10/36, mailBackFee 0.
// A walk-in lab (Cheap Lab, no mailBackCost) stays exactly as before either way.

const MAIL_LAB = {
    hidden: false,
    services: [{ devCost: 10, pushPullCost: 0, pushPullType: 'flat', mailBackCost: 8, turnaroundTime: 'same_week', highResScan: false, noPushPull: false, processes: ['C41'] }]
};

test('effectiveMailBackFee: 0 unless includeMailBack is set, divided by mailBackRollCount when it is', () => {
    const tier = { mailBackCost: 8 };
    assert.equal(effectiveMailBackFee(tier, {}), 0);
    assert.equal(effectiveMailBackFee(tier, undefined), 0);
    assert.equal(effectiveMailBackFee(tier, { includeMailBack: true }), 8);
    assert.equal(effectiveMailBackFee(tier, { includeMailBack: true, mailBackRollCount: 4 }), 2);
    // A roll count of 0 (or otherwise invalid) floors to 1, not a divide-by-zero.
    assert.equal(effectiveMailBackFee(tier, { includeMailBack: true, mailBackRollCount: 0 }), 8);
});

test('effectiveMailBackFee: mailToLabFee (issue #190) folds in alongside the saved return postage', () => {
    const tier = { mailBackCost: 8 };
    // Manual outbound fee only counts once mail-back is opted in.
    assert.equal(effectiveMailBackFee(tier, { mailToLabFee: 5 }), 0);
    assert.equal(effectiveMailBackFee(tier, { includeMailBack: true, mailToLabFee: 5 }), 13);
    // Split across the same roll count as the return postage.
    assert.equal(effectiveMailBackFee(tier, { includeMailBack: true, mailToLabFee: 5, mailBackRollCount: 4 }), 3.25);
    // A walk-in lab (no saved mailBackCost) can still carry a manual outbound fee.
    assert.equal(effectiveMailBackFee({}, { includeMailBack: true, mailToLabFee: 6 }), 6);
});

test('computeNativeFilmLabMatrix: mailBackCost is excluded by default (issue #179)', () => {
    const results = computeNativeFilmLabMatrix(ALL_FILMS, { 'Mail Lab': MAIL_LAB, 'Cheap Lab': ALL_LABS['Cheap Lab'] }, {});
    const mailRow = results.find(r => r.labName === 'Mail Lab');
    assert.equal(mailRow.mailBackFee, 0);
    assert.ok(Math.abs(mailRow.devCostPerPhoto - 10 / 36) < 1e-9);
    const cheapRow = results.find(r => r.labName === 'Cheap Lab');
    assert.equal(cheapRow.mailBackFee, 0);
    assert.ok(Math.abs(cheapRow.devCostPerPhoto - 15 / 36) < 1e-9); // unchanged from the no-mailBackCost fixture
});

test('computeNativeFilmLabMatrix: includeMailBack adds mailBackCost into dev cost', () => {
    const results = computeNativeFilmLabMatrix(ALL_FILMS, { 'Mail Lab': MAIL_LAB }, { includeMailBack: true });
    const mailRow = results.find(r => r.labName === 'Mail Lab');
    assert.ok(Math.abs(mailRow.devCostPerPhoto - 18 / 36) < 1e-9);
    assert.ok(Math.abs(mailRow.mailBackFee - 8) < 1e-9);
});

// A lab with no mailBackCost stated at all (unknown, not confirmed free) --
// distinct from FREE_MAIL_LAB below, which explicitly states 0.
test('computeNativeFilmLabMatrix: includeMailBack excludes tiers with unset mailBackCost (issue #200)', () => {
    const results = computeNativeFilmLabMatrix(ALL_FILMS, { 'Mail Lab': MAIL_LAB, 'Cheap Lab': ALL_LABS['Cheap Lab'] }, { includeMailBack: true });
    assert.equal(results.length, 1);
    assert.equal(results[0].labName, 'Mail Lab');
    // Without the toggle, an unset mailBackCost doesn't exclude the tier --
    // mail-back just isn't being priced in at all.
    const withoutToggle = computeNativeFilmLabMatrix(ALL_FILMS, { 'Cheap Lab': ALL_LABS['Cheap Lab'] }, {});
    assert.equal(withoutToggle.length, 1);
});

const FREE_MAIL_LAB = {
    hidden: false,
    services: [{ devCost: 12, pushPullCost: 0, pushPullType: 'flat', mailBackCost: 0, turnaroundTime: 'same_week', highResScan: false, noPushPull: false, processes: ['C41'] }]
};

test('computeNativeFilmLabMatrix: an explicit 0 mailBackCost is confirmed-free, not excluded', () => {
    const results = computeNativeFilmLabMatrix(ALL_FILMS, { 'Free Mail Lab': FREE_MAIL_LAB }, { includeMailBack: true });
    assert.equal(results.length, 1);
    assert.equal(results[0].mailBackFee, 0);
});

test('computeNativeFilmLabMatrix: mailBackRollCount splits the flat fee across rolls mailed together', () => {
    const results = computeNativeFilmLabMatrix(ALL_FILMS, { 'Mail Lab': MAIL_LAB }, { includeMailBack: true, mailBackRollCount: 4 });
    // mailBackCost 8 / 4 rolls = 2 per roll's own cost.
    assert.ok(Math.abs(results[0].mailBackFee - 2) < 1e-9);
    assert.ok(Math.abs(results[0].devCostPerPhoto - 12 / 36) < 1e-9);
});

test('computeIsoPriceOptions: mailBackCost only raises total cost per photo when includeMailBack is set', () => {
    const { native: withoutMailBack } = computeIsoPriceOptions(400, ALL_FILMS, { 'Mail Lab': MAIL_LAB }, {});
    assert.equal(withoutMailBack[0].mailBackFee, 0);
    assert.ok(Math.abs(withoutMailBack[0].totalCostPerPhoto - ((10 / 36) + (10 / 36))) < 1e-9);

    const { native } = computeIsoPriceOptions(400, ALL_FILMS, { 'Mail Lab': MAIL_LAB }, { includeMailBack: true });
    assert.equal(native.length, 1);
    assert.ok(Math.abs(native[0].mailBackFee - 8) < 1e-9);
    assert.ok(Math.abs(native[0].totalCostPerPhoto - ((10 / 36) + (18 / 36))) < 1e-9);
});

test('computeOneStopFilmLabMatrix: includeMailBack adds mailBackCost alongside the push/pull fee', () => {
    const withoutMailBack = computeOneStopFilmLabMatrix(ALL_FILMS, { 'Mail Lab': MAIL_LAB }, {});
    // devCost 10 + pushPullCost 0 + mailBackFee 0 = 10, /36
    assert.ok(Math.abs(withoutMailBack[0].devCostPerPhoto - 10 / 36) < 1e-9);

    const results = computeOneStopFilmLabMatrix(ALL_FILMS, { 'Mail Lab': MAIL_LAB }, { includeMailBack: true });
    assert.equal(results.length, 1);
    // devCost 10 + pushPullCost 0 + mailBackCost 8 = 18, /36 = 0.5
    assert.ok(Math.abs(results[0].devCostPerPhoto - 0.5) < 1e-9);
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

// ---------- computeBundleBreakEven (issue #161: "buy the 5-pack once
// you're shooting N+ rolls" note for films with multiple bundle sizes) ----------

test('computeBundleBreakEven: finds the roll count where the bulk pack starts winning', () => {
    // Single roll: $10/roll. 5-pack: $45 flat ($9/roll average) — cheaper
    // per photo overall, so it's the bundle the app already shows as
    // "cheapest per photo". But buying it outright only pays off once you
    // need enough rolls: ceil(R/5)*45 vs ceil(R/1)*10 —
    //   R=4: 45 vs 40 (singles still cheaper)
    //   R=5: 45 vs 50 (5-pack now cheaper or equal) <- crossover
    const single = { rolls: 1, filmCost: 10, exposures: 36 };
    const fivePack = { rolls: 5, filmCost: 45, exposures: 36 };
    const result = computeBundleBreakEven([single, fivePack]);
    assert.ok(result, 'expected a break-even result');
    assert.equal(result.breakEvenRolls, 5);
    assert.equal(result.bulkBundle.rolls, 5);
    assert.equal(result.smallerBundle.rolls, 1);
});

test('computeBundleBreakEven: returns null for a single bundle', () => {
    assert.equal(computeBundleBreakEven([{ rolls: 1, filmCost: 10, exposures: 36 }]), null);
    assert.equal(computeBundleBreakEven([]), null);
    assert.equal(computeBundleBreakEven(null), null);
});

test('computeBundleBreakEven: returns null when the cheapest-per-photo bundle is already the smallest', () => {
    // Single roll is BOTH the smallest pack and the cheapest per photo
    // (a markup on the 5-pack, e.g. a "convenience" bulk price) — nothing
    // to warn about buying prematurely.
    const single = { rolls: 1, filmCost: 8, exposures: 36 }; // $8/roll
    const fivePack = { rolls: 5, filmCost: 50, exposures: 36 }; // $10/roll
    assert.equal(computeBundleBreakEven([single, fivePack]), null);
});

test('computeBundleBreakEven: ignores bundles with a different exposures count', () => {
    // The 5-pack has a better rate ($9/roll) but is 24exp, not 36exp like
    // the single roll — not a fair roll-for-roll comparison, so it's
    // excluded and no break-even is computed.
    const single = { rolls: 1, filmCost: 10, exposures: 36 };
    const fivePack24 = { rolls: 5, filmCost: 45, exposures: 24 };
    assert.equal(computeBundleBreakEven([single, fivePack24]), null);
});

test('computeBundleBreakEven: picks the closest smaller pack when there are 3+ sizes', () => {
    // 1-roll $10, 3-pack $27 ($9/roll), 5-pack $20 ($4/roll, clearly bulk
    // cheapest). Closest-smaller-than-bulk is the 3-pack, not the single.
    const single = { rolls: 1, filmCost: 10, exposures: 36 };
    const threePack = { rolls: 3, filmCost: 27, exposures: 36 };
    const fivePack = { rolls: 5, filmCost: 20, exposures: 36 };
    const result = computeBundleBreakEven([single, threePack, fivePack]);
    assert.ok(result);
    assert.equal(result.bulkBundle.rolls, 5);
    assert.equal(result.smallerBundle.rolls, 3);
});

test('bundleCostForRolls: rounds up to whole packs, never fractional', () => {
    const fivePack = { rolls: 5, filmCost: 45 };
    assert.equal(bundleCostForRolls(fivePack, 1), 45); // 1 roll still costs a whole pack
    assert.equal(bundleCostForRolls(fivePack, 5), 45);
    assert.equal(bundleCostForRolls(fivePack, 6), 90); // needs a second pack
});
