// Live-filter search box for the film/lab picker <select>s (issue #167) —
// libraryFilmsDropdown, savedLabsDropdown, cheapestFilmSelect,
// defaultLabSelect, setupLabSelect all list every saved film/lab, which
// gets slow to scroll through as the community preset pipeline (Add with
// AI, the intake bot, per-city preset files) keeps growing the library.
//
// Deliberately doesn't replace the <select> with a custom combobox: every
// call site elsewhere in the app reads `.value` and listens for `change`
// on these exact elements, so rebuilding the picker as something else
// would mean touching every one of those call sites too. Instead this
// injects a plain text <input> right before the <select> that hides
// non-matching <option>s via the `hidden` attribute — supported on
// <option> in all current evergreen browsers — so the select keeps
// behaving exactly as before; only which options are visible in its
// popup changes.
//
// The options list gets rebuilt from scratch (via .innerHTML) by each
// select's own populate function (updateDropdown() in index.html,
// populateCheapestFilmDropdown() in js/dev-cost-ui.js, etc.) any time the
// underlying data changes — rather than hook every one of those, a
// MutationObserver on the <select> reapplies the current filter text
// whenever its childList changes, so a repopulate never silently clears
// the search.
function attachSelectFilter(selectId, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = placeholder || t('searchGenericPlaceholder');
    input.setAttribute('aria-label', placeholder || t('searchGenericAriaLabel'));
    input.autocomplete = 'off';
    input.className = 'select-filter-input hidden w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded p-2 text-sm mb-1';
    select.parentNode.insertBefore(input, select);

    // Only worth showing once there's enough options to actually need
    // searching — a handful of entries is faster to just glance through.
    const MIN_OPTIONS_TO_SHOW_SEARCH = 8;

    function applyFilter() {
        const q = input.value.trim().toLowerCase();
        [...select.options].forEach(opt => {
            // The leading placeholder option ("-- Load a saved film --",
            // "None (show cheapest)", etc.) has no value and always stays
            // visible — filtering it out would leave no way to deselect.
            opt.hidden = !!opt.value && q !== '' && !opt.textContent.toLowerCase().includes(q);
        });
    }

    function syncVisibility() {
        input.classList.toggle('hidden', select.options.length <= MIN_OPTIONS_TO_SHOW_SEARCH + 1);
        applyFilter();
    }

    input.addEventListener('input', applyFilter);
    // A repopulate (new save/delete/import, format/process filter change)
    // rewrites the <select>'s innerHTML wholesale — re-run the filter
    // against the fresh option list so a search term someone's already
    // typed keeps narrowing the new options instead of being silently
    // dropped, and so the input's own shown/hidden state stays correct
    // as the list grows past (or shrinks below) the threshold.
    new MutationObserver(syncVisibility).observe(select, { childList: true });
    syncVisibility();
}

[
    ['libraryFilmsDropdown', t('searchSavedFilmsPlaceholder')],
    ['savedLabsDropdown', t('searchSavedLabsPlaceholder')],
    ['cheapestFilmSelect', t('searchFilmsPlaceholder')],
    ['defaultLabSelect', t('searchLabsPlaceholder')],
    ['setupLabSelect', t('searchLabsPlaceholder')]
].forEach(([id, placeholder]) => attachSelectFilter(id, placeholder));
