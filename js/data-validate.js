// Client-side counterpart to the CI check in ".github/workflows/validate data.yml" —
// both read schema/film-lab-schema.json so required fields/enums can't drift apart.
// Runs against a custom-uploaded film/lab YAML BEFORE it's merged into localStorage,
// so a malformed file gets a specific field-level error instead of silently writing
// broken data the calculator then trips over later.
//
// A few rules (availability requiring state/city, rolls/exposures > 0) aren't in
// the shared schema — they're conditional logic, not field lists — so they're
// hand-duplicated here to match the Python version in "validate data.yml". If you
// add a rule like that to one, add it to the other too.
let dataSchema = null;
async function loadDataSchema() {
    if (dataSchema) return dataSchema;
    try { dataSchema = await (await fetch('schema/film-lab-schema.json')).json(); }
    catch { dataSchema = null; }
    return dataSchema;
}
loadDataSchema();

function validateFilmEntries(entries, schema) {
    const errors = [];
    const s = schema && schema.film;
    (entries || []).forEach((film, i) => {
        const where = `film #${i + 1} (${film.name || 'unnamed'})`;
        (s ? s.requiredFields : ['name', 'boxSpeed', 'process', 'bundles']).forEach(key => {
            if (!(key in film)) errors.push(`${where}: missing '${key}'`);
        });
        if (s && film.process && !s.enums.process.includes(film.process)) errors.push(`${where}: process '${film.process}' must be one of ${s.enums.process.join(', ')}`);
        if (s && film.colorType && !s.enums.colorType.includes(film.colorType)) errors.push(`${where}: colorType '${film.colorType}' must be one of ${s.enums.colorType.join(', ')}`);
        if (s && film.format && !s.enums.format.includes(film.format)) errors.push(`${where}: format '${film.format}' must be one of ${s.enums.format.join(', ')}`);
        (film.bundles || []).forEach((b, j) => {
            const bw = `${where}, price #${j + 1}`;
            (s ? s.requiredBundleFields : ['rolls', 'exposures', 'filmCost']).forEach(key => {
                if (!(key in b)) errors.push(`${bw}: missing '${key}'`);
            });
            if (typeof b.filmCost === 'string') errors.push(`${bw}: filmCost must be a number, not text`);
            if (b.rolls === 0 || b.exposures === 0) errors.push(`${bw}: rolls and exposures must be greater than 0`);
            const avail = b.availability || 'national';
            if (s && !s.enums.availability.includes(avail)) errors.push(`${bw}: availability '${avail}' must be one of ${s.enums.availability.join(', ')}`);
            if ((avail === 'state' || avail === 'city') && !b.state) errors.push(`${bw}: availability '${avail}' needs a 'state'`);
            if (avail === 'city' && !b.city) errors.push(`${bw}: availability 'city' needs a 'city'`);
        });
    });
    return errors;
}

function validateLabEntries(entries, schema) {
    const errors = [];
    const s = schema && schema.lab;
    (entries || []).forEach((lab, i) => {
        const where = `lab #${i + 1} (${lab.name || 'unnamed'})`;
        (s ? s.requiredFields : ['name']).forEach(key => {
            if (!(key in lab)) errors.push(`${where}: missing '${key}'`);
        });
        if (!lab.services || !lab.services.length) errors.push(`${where}: needs at least one service tier`);
        (lab.services || []).forEach((svc, j) => {
            const sw = `${where}, tier #${j + 1}`;
            (s ? s.requiredServiceFields : ['devCost']).forEach(key => {
                if (!(key in svc)) errors.push(`${sw}: missing '${key}'`);
            });
            if (typeof svc.devCost === 'string') errors.push(`${sw}: devCost must be a number, not text`);
            if (s && svc.turnaroundTime && !s.enums.turnaroundTime.includes(svc.turnaroundTime)) errors.push(`${sw}: turnaroundTime '${svc.turnaroundTime}' must be one of ${s.enums.turnaroundTime.join(', ')}`);
            if (s && svc.pushPullType && !s.enums.pushPullType.includes(svc.pushPullType)) errors.push(`${sw}: pushPullType '${svc.pushPullType}' must be 'per_stop' or 'flat'`);
        });
    });
    return errors;
}

// Builds a preview of what a parsed { films, labs } document would do to the
// current library — counts, names, which ones already exist (so an import
// that will overwrite something isn't a silent surprise) — without writing
// anything yet.
function buildImportPreview(parsed, existingFilmProfiles, existingLabProfiles) {
    const films = Array.isArray(parsed.films) ? parsed.films : [];
    const labs = Array.isArray(parsed.labs) ? parsed.labs : [];
    const errors = [
        ...validateFilmEntries(films, dataSchema),
        ...validateLabEntries(labs, dataSchema)
    ];
    const filmEntries = films.filter(f => f.name).map(f => ({
        name: f.name,
        exists: !!existingFilmProfiles[filmKey(f.name, f.boxSpeed, f.format)]
    }));
    const labEntries = labs.filter(l => l.name).map(l => ({
        name: l.name,
        exists: !!existingLabProfiles[l.name]
    }));
    return { films, labs, filmEntries, labEntries, errors };
}
