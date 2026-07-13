// Modal wiring: Changelog, Add-with-AI, Import, and the Favourites
// setup modal (issue #61/#73). Plain global functions (no bundler), same
// pattern as js/dev-cost-calc.js and js/themes.js -- shares index.html's
// global scope via <script src>, not an ES module. Depends on shared
// helpers defined in index.html's own script (escapeHtml, sanitizeUrl,
// filmKey, updateFilmDropdowns, detectConfigWritable, etc.) -- safe
// because every call into them happens from an event handler or an
// awaited fetch, never synchronously while this file itself is
// executing, so index.html's own script has always finished defining
// them by the time they're actually called.
//
// Extracted from index.html as part of #61 (single-file app split).

// ---------- Changelog ("What's New") ----------
// Footer version is a clickable button (issue #53) that pops up
// recent changes, generated at build time into changelog.json from
// merged PR titles — see .github/workflows/build-github-page.yml.
// #53 asked for the popup to appear automatically when new entries
// have landed since this browser last saw the changelog; #66 was
// that auto-popup never actually happened — only the unread dot did.
// First-ever visitors don't get the whole project history flagged as
// "new" — their baseline is set quietly on first load, with no popup.
// #78: the auto-popup was showing the ENTIRE project history, not
// just what's landed since last time.
//
// #83: tracking only the highest PR number seen breaks when PRs merge
// out of order — a user who saw up through #63, then #62 merges
// later (its number is lower than the already-seen #63), would never
// get a popup for #62 since "highest seen" never moved backwards. Now
// tracks the actual SET of seen PR numbers in localStorage, so "new"
// means "not in that set", regardless of merge order.
let changelogEntries = [];

async function loadChangelog() {
    try {
        const res = await fetch('changelog.json');
        if (res.ok) changelogEntries = await res.json();
    } catch { /* offline / no changelog.json — nothing to show */ }
    if (!Array.isArray(changelogEntries) || changelogEntries.length === 0) return;

    // A true first-ever visit has neither key. A pre-#83 returning visitor
    // has the old single-number key but not the new set — migrate them by
    // treating everything up through their old high-watermark as seen
    // (same coverage as before, just in the new per-PR-number format).
    const isFirstEverVisit = localStorage.getItem('changelogSeenPRs') === null && localStorage.getItem('changelogLastSeenPR') === null;
    if (localStorage.getItem('changelogSeenPRs') === null) {
        const oldLastSeen = parseInt(localStorage.getItem('changelogLastSeenPR') || '0', 10);
        const migrated = oldLastSeen > 0 ? changelogEntries.filter(e => e.number <= oldLastSeen).map(e => e.number) : [];
        localStorage.setItem('changelogSeenPRs', JSON.stringify(migrated));
        localStorage.removeItem('changelogLastSeenPR');
    }

    const seen = new Set(readJSON('changelogSeenPRs', []));
    const newEntries = changelogEntries.filter(e => !seen.has(e.number));
    if (newEntries.length === 0) return;
    if (isFirstEverVisit) {
        markChangelogSeen(changelogEntries.map(e => e.number)); // quiet baseline, no popup
    } else {
        openChangelogModal(newEntries.map(e => e.number));
    }
}

function markChangelogSeen(numbers) {
    const seen = new Set(readJSON('changelogSeenPRs', []));
    numbers.forEach(n => seen.add(n));
    localStorage.setItem('changelogSeenPRs', JSON.stringify([...seen]));
}

// onlyNumbers (optional): a list of PR numbers to show, used for the
// auto-popup so it only lists what's actually new. Omitted for the
// manual button click, which always shows the full history.
function renderChangelogList(onlyNumbers) {
    const container = document.getElementById('changelogList');
    const all = Array.isArray(changelogEntries) ? changelogEntries : [];
    const entries = onlyNumbers ? all.filter(e => onlyNumbers.includes(e.number)) : all;
    if (entries.length === 0) {
        const msg = onlyNumbers ? 'No new changes.' : 'No changelog available.';
        container.innerHTML = `<p class="text-xs text-gray-400 text-center py-2">${msg}</p>`;
        return;
    }
    container.innerHTML = entries.map(e => {
        const date = new Date(e.mergedAt);
        const dateLabel = isNaN(date) ? '' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const safeUrl = sanitizeUrl(e.url);
        const titleHtml = safeUrl
            ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="hover:underline">${escapeHtml(e.title)}</a>`
            : escapeHtml(e.title);
        return `<div class="px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-gray-700/40">
            <div class="text-gray-800 dark:text-gray-200">${titleHtml}</div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">${dateLabel}${dateLabel ? ' · ' : ''}#${e.number}</div>
        </div>`;
    }).join('');
}

const changelogModal = document.getElementById('changelogModal');
function openChangelogModal(onlyNumbers) {
    renderChangelogList(onlyNumbers);
    changelogModal.classList.remove('hidden');
    if (changelogEntries.length) {
        markChangelogSeen(changelogEntries.map(e => e.number));
    }
}
function closeChangelogModal() { changelogModal.classList.add('hidden'); }
document.getElementById('changelogBtn').addEventListener('click', () => openChangelogModal());
document.getElementById('changelogModalCloseBtn').addEventListener('click', closeChangelogModal);
changelogModal.addEventListener('click', (e) => { if (e.target === changelogModal) closeChangelogModal(); });

loadChangelog();

// ---------- Confirm modal + toast (issue #92) ----------
// Replaces window.confirm()/window.alert() with the app's own styling —
// native dialogs block the main thread and look jarring next to the app's
// own modal system, especially on mobile. showConfirm() is Promise-based so
// callers just `if (!(await showConfirm(...))) return;` in place of the old
// `if (!confirm(...)) return;`. showToast() is for transient success/error
// feedback that has no single natural inline spot to live in (e.g. a result
// shown after the modal that triggered it has already closed).
const confirmModal = document.getElementById('confirmModal');
let confirmResolve = null;
function showConfirm(message, confirmLabel) {
    document.getElementById('confirmModalMessage').textContent = message;
    document.getElementById('confirmModalConfirmBtn').textContent = confirmLabel || 'Confirm';
    confirmModal.classList.remove('hidden');
    return new Promise(resolve => { confirmResolve = resolve; });
}
function resolveConfirm(result) {
    confirmModal.classList.add('hidden');
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}
document.getElementById('confirmModalCancelBtn').addEventListener('click', () => resolveConfirm(false));
document.getElementById('confirmModalConfirmBtn').addEventListener('click', () => resolveConfirm(true));
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) resolveConfirm(false); });

let toastTimer;
function showToast(message, isError) {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = message;
    el.classList.toggle('bg-red-600', !!isError);
    el.classList.toggle('bg-gray-900', !isError);
    el.classList.toggle('dark:bg-gray-700', !isError);
    el.classList.remove('hidden');
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ---------- Add with AI ----------
// Bring-your-own-key. The key lives ONLY in this variable, never in
// localStorage — closing the modal wipes it. The one exception is a
// self-hosted instance (detected via detectConfigWritable()), where the
// user owns the box and can opt in to remembering it.
let aiApiKey = '';
let aiSelfHosted = false;
let aiPendingEntries = null; // parsed YAML awaiting user confirmation
let aiMode = 'paste';

const AI_PROVIDERS = {
    anthropic:  { label: 'Claude (Anthropic)', defaultModel: 'claude-sonnet-4-6', webSearch: true },
    openai:     { label: 'ChatGPT (OpenAI)',   defaultModel: 'gpt-4o',            webSearch: false },
    gemini:     { label: 'Gemini (Google)',    defaultModel: 'gemini-2.0-flash',  webSearch: true },
    compatible: { label: 'OpenAI-compatible',  defaultModel: 'local-model',       webSearch: false }
};

function aiKeyStorageKey(provider) { return `aiKey_${provider}`; }

// Build the instruction prompt. Mirrors DATA_SPEC.md, inlined because a
// static app can't rely on fetching the spec at runtime.
function buildAiPrompt(kind, source, isUrl) {
    const formats = FORMAT_OPTIONS.map(o => o.value).join(' | ');
    const processes = PROCESS_OPTIONS.map(o => o.value).join(' | ');
    const common = `You generate YAML for FilmCalc, a film photography cost calculator.

CRITICAL RULES:
- Output ONLY valid YAML. No commentary, no markdown code fences.
- NEVER invent, estimate or guess a value. If you cannot determine it from the source, use the string UNKNOWN. A wrong-but-plausible price is the worst possible outcome.
- Use the REGULAR price, never a sale price. If a sale price is shown, use the crossed-out original.
- All prices are plain numbers: 24.95 — never "$24.95".
- Use 2-space indentation, never tabs.`;

    const filmSpec = `${common}

Output a top-level key "films:" containing a list. Each film:
- name: stock name WITHOUT the ISO if the ISO is merely the speed (e.g. "Kodak Gold 200" -> "Kodak Gold"). Keep it if it distinguishes products (e.g. "Kodak Portra 400").
  boxSpeed: <plain number, the rated ISO>
  maxPushPull: <stops it tolerates: 2 for flexible stocks like Tri-X/HP5+/Portra, 1 for typical consumer colour, 0 for stocks that must not be pushed like Ektar. If unsure use 1.>
  process: <one of: ${processes}>
  format: <one of: ${formats}>
  hidden: false
  bundles:   # ONE ENTRY PER PACK SIZE THE SHOP SELLS (single roll, 3-pack, 5-pack...)
  - rolls: <rolls in this pack>
    exposures: <frames per roll: 36 or 24 for 35mm; 12 for 120>
    filmCost: <price of the WHOLE pack, plain number>
    storeName: <short shop name>
    buyLink: <product URL, tracking params stripped>`;

    const labSpec = `${common}

Output a top-level key "labs:" containing a list. Each lab:
- name: <lab name>
  hidden: false
  address: <full street address Google Maps can find — powers the Directions link>
  phone: <omit this line entirely if not listed>
  email: <omit this line entirely if not listed>
  website: <lab website>
  services:   # ONE ENTRY PER SERVICE TIER — NOT ONE PER LAB.
  - devCost: <cost to develop one roll, plain number>
    pushPullCost: <cost to push/pull, 0 if free>
    pushPullType: <per_stop | flat>
    turnaroundTime: <next_day | same_week | longer>
    highResScan: <true|false>
    noPushPull: <true only if this tier cannot push/pull at all, else false>
    processes:
    - <any of: ${processes}>

A lab charging different prices for C41 vs B&W vs E6, or for next-day vs same-week, or standard vs hi-res scans, needs a SEPARATE services entry for EVERY distinct price it charges. Read the pricing carefully.`;

    const spec = kind === 'film' ? filmSpec : labSpec;
    const task = isUrl
        ? `Look up this page and extract the data from it. If you cannot access it, reply with exactly: ERROR_CANNOT_ACCESS\n\n${source}`
        : `Here is the text of the page. Extract the data from it.\n\n---\n${source}\n---`;
    return `${spec}\n\n${task}`;
}

async function callAiProvider(provider, model, key, prompt, useWebSearch) {
    if (provider === 'anthropic') {
        const body = {
            model,
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }]
        };
        if (useWebSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                // Required by Anthropic for direct browser (CORS) calls.
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    }

    if (provider === 'gemini') {
        const body = { contents: [{ parts: [{ text: prompt }] }] };
        if (useWebSearch) body.tools = [{ google_search: {} }];
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
        return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
    }

    // openai + any OpenAI-compatible server (LM Studio, OpenRouter, Ollama)
    const base = provider === 'openai'
        ? 'https://api.openai.com/v1'
        : (document.getElementById('aiBaseUrl').value.trim().replace(/\/+$/, '') || 'http://localhost:1234/v1');
    const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(key ? { 'Authorization': `Bearer ${key}` } : {})
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data.choices?.[0]?.message?.content || '';
}

// Strip code fences and any stray prose the model added around the YAML.
function extractYaml(text) {
    let t = String(text || '').trim();
    const fence = t.match(/```(?:yaml|yml)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const idx = t.search(/^(films|labs):/m);
    if (idx > 0) t = t.slice(idx);
    return t.trim();
}

// Validate what the model produced before it can touch the library.
function validateAiEntries(kind, doc) {
    const errs = [];
    const key = kind === 'film' ? 'films' : 'labs';
    const list = doc && doc[key];
    if (!Array.isArray(list) || list.length === 0) return { errs: [`No "${key}:" list found in the AI's reply.`], list: [] };
    const validProcesses = PROCESS_OPTIONS.map(o => o.value);
    const validFormats = FORMAT_OPTIONS.map(o => o.value);
    const hasUnknown = (v) => typeof v === 'string' && /UNKNOWN/i.test(v);

    list.forEach((e, i) => {
        const at = `#${i + 1} (${e.name || 'unnamed'})`;
        if (!e.name || hasUnknown(e.name)) errs.push(`${at}: missing name`);
        Object.entries(e).forEach(([k, v]) => { if (hasUnknown(v)) errs.push(`${at}: "${k}" came back as UNKNOWN — the AI couldn't find it, so fill it in yourself.`); });
        if (kind === 'film') {
            if (!Number.isFinite(parseInt(e.boxSpeed))) errs.push(`${at}: boxSpeed must be a number`);
            if (e.process && !validProcesses.includes(e.process)) errs.push(`${at}: process "${e.process}" is not one of ${validProcesses.join(', ')}`);
            if (e.format && !validFormats.includes(e.format)) errs.push(`${at}: format "${e.format}" is not one of ${validFormats.join(', ')}`);
            if (!Array.isArray(e.bundles) || !e.bundles.length) errs.push(`${at}: needs at least one bundle`);
            (e.bundles || []).forEach((b, j) => {
                Object.entries(b).forEach(([k, v]) => { if (hasUnknown(v)) errs.push(`${at} bundle ${j + 1}: "${k}" came back as UNKNOWN.`); });
                if (!Number.isFinite(parseFloat(b.filmCost))) errs.push(`${at} bundle ${j + 1}: filmCost must be a number`);
                if (!parseInt(b.exposures)) errs.push(`${at} bundle ${j + 1}: exposures must be a number`);
            });
        } else {
            if (!Array.isArray(e.services) || !e.services.length) errs.push(`${at}: needs at least one service tier`);
            (e.services || []).forEach((s, j) => {
                Object.entries(s).forEach(([k, v]) => { if (hasUnknown(v)) errs.push(`${at} service ${j + 1}: "${k}" came back as UNKNOWN.`); });
                if (!Number.isFinite(parseFloat(s.devCost))) errs.push(`${at} service ${j + 1}: devCost must be a number`);
                (s.processes || []).forEach(p => { if (!validProcesses.includes(p)) errs.push(`${at} service ${j + 1}: process "${p}" is invalid`); });
            });
        }
    });
    return { errs, list };
}

function renderAiPreview(kind, list) {
    const el = document.getElementById('aiPreview');
    el.innerHTML = list.map(e => {
        if (kind === 'film') {
            const bundles = (e.bundles || []).map(b =>
                `<div class="flex justify-between text-xs text-gray-500 dark:text-gray-400"><span>${escapeHtml(b.rolls)}× roll${b.rolls > 1 ? 's' : ''} · ${escapeHtml(b.exposures)} exp · ${escapeHtml(b.storeName || '—')}</span><span class="font-mono">${CUR()}${(parseFloat(b.filmCost) || 0).toFixed(2)}</span></div>`
            ).join('');
            return `<div class="border border-gray-200 dark:border-gray-600 rounded-lg p-2">
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(e.name)} <span class="opacity-70 font-normal">(${escapeHtml(e.boxSpeed)} ISO · ${escapeHtml(e.format || '35mm')} · ${escapeHtml(e.process || 'C41')} · ±${escapeHtml(e.maxPushPull ?? 1)} stop)</span></p>
                <div class="mt-1 space-y-0.5">${bundles}</div>
            </div>`;
        }
        const tiers = (e.services || []).map(s =>
            `<div class="flex justify-between text-xs text-gray-500 dark:text-gray-400"><span>${escapeHtml(turnaroundLabels[s.turnaroundTime] || s.turnaroundTime || '—')} · ${s.highResScan ? 'Hi-Res' : 'Standard'} · ${escapeHtml((s.processes || []).join('/'))}</span><span class="font-mono">${CUR()}${(parseFloat(s.devCost) || 0).toFixed(2)}/roll</span></div>`
        ).join('');
        return `<div class="border border-gray-200 dark:border-gray-600 rounded-lg p-2">
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(e.name)}</p>
            <p class="text-[11px] text-gray-400 dark:text-gray-500">${escapeHtml(e.address || 'No address')}</p>
            <div class="mt-1 space-y-0.5">${tiers}</div>
        </div>`;
    }).join('');
}

// ----- modal plumbing -----
const aiModal = document.getElementById('aiModal');
function aiSetStatus(msg, tone) {
    const el = document.getElementById('aiStatus');
    el.textContent = msg || '';
    el.className = 'text-xs text-center ' + (tone === 'error'
        ? 'text-red-600 dark:text-red-400'
        : tone === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400');
}
function aiApplyProvider() {
    const provider = document.getElementById('aiProvider').value;
    const cfg = AI_PROVIDERS[provider];
    document.getElementById('aiModel').value = cfg.defaultModel;
    document.getElementById('aiBaseUrlWrap').classList.toggle('hidden', provider !== 'compatible');
    // A local model needs no key.
    document.getElementById('aiKey').placeholder = provider === 'compatible' ? '(often not needed for local models)' : 'sk-…';
    if (aiSelfHosted) {
        const saved = localStorage.getItem(aiKeyStorageKey(provider));
        document.getElementById('aiKey').value = saved || '';
        document.getElementById('aiRememberKey').checked = !!saved;
    }
    aiUpdateUrlWarning();
}
function aiUpdateUrlWarning() {
    const provider = document.getElementById('aiProvider').value;
    const warn = document.getElementById('aiUrlWarning');
    if (aiMode === 'url' && !AI_PROVIDERS[provider].webSearch) {
        warn.textContent = `⚠️ ${AI_PROVIDERS[provider].label} usually can't browse the web, so it may guess the prices instead of reading them. Pasting the page text is far more reliable.`;
        warn.classList.remove('hidden');
    } else {
        warn.classList.add('hidden');
    }
}
function aiSetMode(mode) {
    aiMode = mode;
    const on = 'flex-1 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-400 shadow-sm transition-colors';
    const off = 'flex-1 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 transition-colors';
    document.getElementById('aiModePasteBtn').className = mode === 'paste' ? on : off;
    document.getElementById('aiModeUrlBtn').className = mode === 'url' ? on : off;
    document.getElementById('aiPasteWrap').classList.toggle('hidden', mode !== 'paste');
    document.getElementById('aiUrlWrap').classList.toggle('hidden', mode !== 'url');
    aiUpdateUrlWarning();
}
// prefill is optional: { url, kind } — used by the bookmarklet deep
// link (?addWithAiUrl=...) to open straight into URL mode with the
// shop/lab page already filled in, instead of the normal blank paste
// form.
async function openAiModal(prefill) {
    aiSelfHosted = await detectConfigWritable();
    document.getElementById('aiRememberWrap').classList.toggle('hidden', !aiSelfHosted);
    document.getElementById('aiKeyNotice').classList.toggle('hidden', aiSelfHosted);
    aiApplyProvider();
    if (prefill && prefill.url) {
        aiSetMode('url');
        document.getElementById('aiPageUrl').value = prefill.url;
        if (prefill.kind === 'film' || prefill.kind === 'lab') {
            document.getElementById('aiKind').value = prefill.kind;
        }
    } else {
        aiSetMode('paste');
    }
    aiSetStatus('');
    document.getElementById('aiResultWrap').classList.add('hidden');
    aiPendingEntries = null;
    aiModal.classList.remove('hidden');
}
function closeAiModal() {
    // Wipe the key from memory and from the DOM on every close.
    aiApiKey = '';
    document.getElementById('aiKey').value = '';
    document.getElementById('aiPageText').value = '';
    document.getElementById('aiPageUrl').value = '';
    aiPendingEntries = null;
    document.getElementById('aiResultWrap').classList.add('hidden');
    aiModal.classList.add('hidden');
}
document.getElementById('aiModalCloseBtn').addEventListener('click', closeAiModal);
aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeAiModal(); });
document.getElementById('aiProvider').addEventListener('change', aiApplyProvider);
document.getElementById('aiModePasteBtn').addEventListener('click', () => aiSetMode('paste'));
document.getElementById('aiModeUrlBtn').addEventListener('click', () => aiSetMode('url'));
document.getElementById('aiDiscardBtn').addEventListener('click', () => {
    aiPendingEntries = null;
    document.getElementById('aiResultWrap').classList.add('hidden');
    aiSetStatus('Discarded.');
});

document.getElementById('aiGenerateBtn').addEventListener('click', async () => {
    const provider = document.getElementById('aiProvider').value;
    const kind = document.getElementById('aiKind').value;
    const model = document.getElementById('aiModel').value.trim();
    const key = document.getElementById('aiKey').value.trim();
    const source = aiMode === 'paste'
        ? document.getElementById('aiPageText').value.trim()
        : document.getElementById('aiPageUrl').value.trim();

    if (!model) { aiSetStatus('Enter a model name.', 'error'); return; }
    if (provider !== 'compatible' && !key) { aiSetStatus('Enter your API key.', 'error'); return; }
    if (!source) { aiSetStatus(aiMode === 'paste' ? 'Paste the page text first.' : 'Enter the page URL.', 'error'); return; }

    aiApiKey = key; // memory only
    if (aiSelfHosted && document.getElementById('aiRememberKey').checked) {
        localStorage.setItem(aiKeyStorageKey(provider), key);
    } else if (aiSelfHosted) {
        localStorage.removeItem(aiKeyStorageKey(provider));
    }

    const btn = document.getElementById('aiGenerateBtn');
    btn.disabled = true;
    aiSetStatus('Asking the AI… this can take a few seconds.');
    document.getElementById('aiResultWrap').classList.add('hidden');
    try {
        const useWebSearch = aiMode === 'url' && AI_PROVIDERS[provider].webSearch;
        const prompt = buildAiPrompt(kind, source, aiMode === 'url');
        const reply = await callAiProvider(provider, model, aiApiKey, prompt, useWebSearch);
        if (/ERROR_CANNOT_ACCESS/.test(reply)) throw new Error("The AI couldn't open that page. Switch to \"Paste page\" and paste the text instead.");
        const yamlText = extractYaml(reply);
        if (!yamlText) throw new Error('The AI did not return any YAML.');
        let doc;
        try { doc = jsyaml.load(yamlText); }
        catch (e) { throw new Error('The AI returned something that isn\'t valid YAML.'); }
        const { errs, list } = validateAiEntries(kind, doc);
        document.getElementById('aiRawYaml').textContent = yamlText;
        if (errs.length) {
            aiPendingEntries = null;
            document.getElementById('aiPreview').innerHTML =
                `<div class="text-xs text-red-600 dark:text-red-400 space-y-1">${errs.map(e => `<p>• ${escapeHtml(e)}</p>`).join('')}</div>`;
            document.getElementById('aiAddBtn').disabled = true;
            document.getElementById('aiAddBtn').classList.add('opacity-50', 'cursor-not-allowed');
            document.getElementById('aiResultWrap').classList.remove('hidden');
            aiSetStatus('The AI\'s answer had problems — see below.', 'error');
        } else {
            aiPendingEntries = { kind, list };
            renderAiPreview(kind, list);
            document.getElementById('aiAddBtn').disabled = false;
            document.getElementById('aiAddBtn').classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('aiResultWrap').classList.remove('hidden');
            aiSetStatus(`Got ${list.length} ${kind === 'film' ? 'film' : 'lab'}(s). Check the numbers below.`, 'ok');
        }
    } catch (e) {
        aiSetStatus(e.message || 'Something went wrong talking to the AI.', 'error');
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('aiAddBtn').addEventListener('click', () => {
    if (!aiPendingEntries) return;
    const { kind, list } = aiPendingEntries;
    if (kind === 'film') {
        const saved = readJSON('filmProfiles', {});
        list.forEach(f => {
            const key = filmKey(f.name, parseInt(f.boxSpeed) || 0, f.format || '35mm');
            saved[key] = {
                name: f.name,
                boxSpeed: parseInt(f.boxSpeed) || 0,
                maxPushPull: parseFloat(f.maxPushPull ?? 1),
                process: f.process || 'C41',
                format: f.format || '35mm',
                hidden: false,
                bundles: (f.bundles || []).map(b => ({
                    rolls: parseInt(b.rolls) || 1,
                    exposures: parseInt(b.exposures) || 36,
                    filmCost: parseFloat(b.filmCost) || 0,
                    storeName: b.storeName || '',
                    buyLink: sanitizeUrl(b.buyLink) || ''
                }))
            };
        });
        localStorage.setItem('filmProfiles', JSON.stringify(saved));
        updateFilmDropdowns();
    } else {
        const saved = readJSON('labProfiles', {});
        list.forEach(l => {
            saved[l.name] = {
                name: l.name,
                hidden: false,
                address: l.address || '',
                phone: l.phone || '',
                email: l.email || '',
                website: sanitizeUrl(l.website) || '',
                services: (l.services || []).map(s => ({
                    devCost: parseFloat(s.devCost) || 0,
                    pushPullCost: parseFloat(s.pushPullCost) || 0,
                    pushPullType: s.pushPullType === 'flat' ? 'flat' : 'per_stop',
                    turnaroundTime: s.turnaroundTime || 'same_week',
                    highResScan: !!s.highResScan,
                    noPushPull: !!s.noPushPull,
                    processes: Array.isArray(s.processes) && s.processes.length ? s.processes : ['C41']
                }))
            };
        });
        localStorage.setItem('labProfiles', JSON.stringify(saved));
        updateLabDropdown();
    }
    refreshActiveCheapestSubTab();
    updateLabComparison();
    updateCheaperAlternative();
    const n = list.length;
    closeAiModal();
    showToast(`Added ${n} ${kind === 'film' ? 'film stock' : 'lab'}(s) to your Library. Double-check the prices against the shop page.`);
});

document.getElementById('addWithAiBtn').addEventListener('click', openAiModal);

// ---------- Add with AI bookmarklet ----------
// Generated from window.location.origin at render time, so a
// self-hosted instance produces a bookmarklet pointing at itself,
// not the public site — no hardcoded URL, nothing to configure.
// Dragging it to the bookmarks bar and clicking it from a shop/lab
// page opens FilmCalc in a new tab with that page's URL already
// filled into Add with AI's "Use a link" mode (see applyUrlParams'
// addWithAiUrl handling).
(function initBookmarklet() {
    const origin = window.location.origin;
    const code = `(function(){window.open(${JSON.stringify(origin)}+'/?addWithAiUrl='+encodeURIComponent(location.href),'_blank');})();`;
    const link = document.getElementById('addWithAiBookmarklet');
    link.href = 'javascript:' + encodeURIComponent(code);
    document.getElementById('bookmarkletOrigin').textContent = origin;
})();

// ---------- Import modal ----------
// Two ways in: pick from preset films/labs shipped in this project's
// films/ and labs/ folders (listed via a small index.json manifest,
// since static hosting has no real directory listing), or upload your
// own file(s) — both end up going through the same parsing/merge path.
const importModal = document.getElementById('importModal');
const importModalCloseBtn = document.getElementById('importModalCloseBtn');
const importPresetList = document.getElementById('importPresetList');
const importSelectedPresetsBtn = document.getElementById('importSelectedPresetsBtn');

function openImportModal() {
    importModal.classList.remove('hidden');
    loadPresetList();
}
function closeImportModal() { importModal.classList.add('hidden'); }

// ---------- Favourites setup modal ----------
// Step 2 of first-run onboarding (after import), and re-runnable from
// Settings. Sets the default lab + tier, and lets the user ♥ favourite
// or ✕ ignore (hide) each film stock.
const setupModal = document.getElementById('setupModal');
function openSetupModal() {
    populateSetupLabSelect();
    renderSetupFilmList();
    setupModal.classList.remove('hidden');
}
function closeSetupModal() { setupModal.classList.add('hidden'); }
document.getElementById('setupModalCloseBtn').addEventListener('click', closeSetupModal);
document.getElementById('setupDoneBtn').addEventListener('click', closeSetupModal);
setupModal.addEventListener('click', (e) => { if (e.target === setupModal) closeSetupModal(); });

// Escape closes whichever modal is currently open.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!confirmModal.classList.contains('hidden')) resolveConfirm(false);
    else if (!importModal.classList.contains('hidden')) closeImportModal();
    else if (!document.getElementById('aiModal').classList.contains('hidden')) closeAiModal();
    else if (!setupModal.classList.contains('hidden')) closeSetupModal();
    else if (!changelogModal.classList.contains('hidden')) closeChangelogModal();
});

function populateSetupTierSelect(labName, selectedIndex) {
    const tierSel = document.getElementById('setupTierSelect');
    if (!labName) { tierSel.classList.add('hidden'); tierSel.innerHTML = ''; return; }
    const allLabs = { ...defaultLabs, ...readJSON('labProfiles', {}) };
    const lab = allLabs[labName];
    if (!lab) { tierSel.classList.add('hidden'); tierSel.innerHTML = ''; return; }
    const tiers = normalizeLabServices(lab);
    tierSel.innerHTML = tiers.map((t, i) => `<option value="${i}">${escapeHtml(tierDescription(t))}</option>`).join('');
    if (selectedIndex != null && tiers[selectedIndex]) tierSel.value = String(selectedIndex);
    tierSel.classList.remove('hidden');
}
function populateSetupLabSelect() {
    const labSel = document.getElementById('setupLabSelect');
    const pref = getDefaultLabPref();
    const allLabs = { ...defaultLabs, ...readJSON('labProfiles', {}) };
    const names = Object.keys(allLabs).filter(n => !allLabs[n].hidden);
    labSel.innerHTML = '<option value="">None (always show cheapest)</option>' + names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if (pref && pref.lab && names.includes(pref.lab)) {
        labSel.value = pref.lab;
        populateSetupTierSelect(pref.lab, pref.tierIndex);
    } else {
        document.getElementById('setupTierSelect').classList.add('hidden');
    }
}
function saveSetupLabPref() {
    const lab = document.getElementById('setupLabSelect').value;
    const tierSel = document.getElementById('setupTierSelect');
    if (!lab) {
        localStorage.removeItem('defaultLabPref');
    } else {
        localStorage.setItem('defaultLabPref', JSON.stringify({ lab, tierIndex: parseInt(tierSel.value) || 0 }));
    }
    populateDefaultLabSelect(); // keep the Settings copy in sync
    updateLabComparison();
    updateCheaperAlternative();
}
document.getElementById('setupLabSelect').addEventListener('change', (e) => {
    const lab = e.target.value;
    if (lab) populateSetupTierSelect(lab, 0); else document.getElementById('setupTierSelect').classList.add('hidden');
    saveSetupLabPref();
});
document.getElementById('setupTierSelect').addEventListener('change', saveSetupLabPref);
document.getElementById('redoFavouritesBtn').addEventListener('click', openSetupModal);

// Film list with ♥ (favourite) and ✕ (ignore/hide) toggles.
function renderSetupFilmList() {
    const listEl = document.getElementById('setupFilmList');
    const saved = readJSON('filmProfiles', {});
    const all = { ...defaultFilms, ...saved };
    const keys = Object.keys(all);
    if (keys.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">No films saved yet — import some first.</p>';
        return;
    }
    listEl.innerHTML = keys.map(key => {
        const f = all[key];
        const fav = isFavFilm(key);
        const ignored = !!f.hidden;
        return `<div class="flex items-center justify-between gap-2 px-2 py-1.5 rounded ${ignored ? 'opacity-50' : ''}">
            <span class="text-sm text-gray-700 dark:text-gray-300 truncate">${escapeHtml(f.name)} <span class="text-xs opacity-70">(${escapeHtml(f.boxSpeed || '?')} ISO · ${escapeHtml(f.format || '35mm')})</span></span>
            <span class="flex items-center gap-1 shrink-0">
                <button type="button" class="setup-fav-btn text-base leading-none px-1 ${fav ? 'text-red-500' : 'text-gray-300 dark:text-gray-600'}" data-key="${escapeHtml(key)}" title="${fav ? 'Unfavourite' : 'Favourite'}" aria-label="${fav ? 'Unfavourite' : 'Favourite'}">${fav ? '♥' : '♡'}</button>
                <button type="button" class="setup-ignore-btn text-base leading-none px-1 ${ignored ? 'text-red-600 font-bold' : 'text-gray-300 dark:text-gray-600'}" data-key="${escapeHtml(key)}" title="${ignored ? 'Un-ignore' : 'Ignore this film'}" aria-label="${ignored ? 'Un-ignore' : 'Ignore this film'}">✕</button>
            </span>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.setup-fav-btn').forEach(btn => btn.addEventListener('click', () => {
        toggleFavFilm(btn.dataset.key);
        renderSetupFilmList();
    }));
    listEl.querySelectorAll('.setup-ignore-btn').forEach(btn => btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const savedNow = readJSON('filmProfiles', {});
        // Ignoring a preset film needs it materialised into saved profiles
        // first, since defaults themselves aren't editable.
        const base = savedNow[key] || { ...(defaultFilms[key] || {}) };
        if (!base.name) return;
        base.hidden = !base.hidden;
        savedNow[key] = base;
        localStorage.setItem('filmProfiles', JSON.stringify(savedNow));
        renderSetupFilmList();
        updateFilmDropdowns();
        refreshActiveCheapestSubTab();
    }));
}

document.getElementById('importBtn').addEventListener('click', openImportModal);
importModalCloseBtn.addEventListener('click', closeImportModal);
importModal.addEventListener('click', (e) => { if (e.target === importModal) closeImportModal(); });

// { file: "australian-retailers.yaml", label: "Australian Retailers" }
// entries per folder — label is optional and falls back to the
// filename if the manifest doesn't provide one.
async function fetchManifest(folder) {
    try {
        const res = await fetch(`${folder}/index.json`);
        if (!res.ok) return [];
        const list = await res.json();
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

// Pull a human label out of a parsed preset file. New self-describing
// files carry a top-level `label:`; older bare-array files don't, so we
// fall back to the manifest-provided label, then the filename.
function labelFromParsed(parsed) {
    if (parsed && !Array.isArray(parsed) && typeof parsed.label === 'string' && parsed.label.trim()) {
        return parsed.label.trim();
    }
    return null;
}

let presetEntries = [];
let presetListLoaded = false;
async function loadPresetList() {
    if (presetListLoaded) return;
    presetListLoaded = true;
    const [films, labs] = await Promise.all([fetchManifest('films'), fetchManifest('labs')]);
    const rawEntries = [
        ...films.map(f => ({ folder: 'films', file: f.file, label: f.label || f.file, type: 'Film' })),
        ...labs.map(l => ({ folder: 'labs', file: l.file, label: l.label || l.file, type: 'Lab' }))
    ];
    // Prefer the label embedded inside each file over the manifest's, so
    // renaming a preset only means editing its own YAML.
    presetEntries = await Promise.all(rawEntries.map(async (e) => {
        const fetched = await fetchYamlPreset(e.folder, e.file);
        const embedded = fetched.ok ? labelFromParsed(fetched.parsed) : null;
        return { ...e, label: embedded || e.label };
    }));
    if (presetEntries.length === 0) {
        importPresetList.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">No presets found — upload a file instead.</p>';
        return;
    }
    importPresetList.innerHTML = presetEntries.map((e, i) => `
        <label class="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
            <input type="checkbox" class="import-preset-checkbox rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" data-index="${i}">
            <span class="flex-1 text-gray-700 dark:text-gray-300">${escapeHtml(e.label)}</span>
            <span class="text-xs px-1.5 py-0.5 rounded font-semibold uppercase ${e.type === 'Film' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'}">${e.type}</span>
        </label>`).join('');
    importPresetList.querySelectorAll('.import-preset-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const anyChecked = [...importPresetList.querySelectorAll('.import-preset-checkbox')].some(c => c.checked);
            importSelectedPresetsBtn.disabled = !anyChecked;
        });
    });
}

// Builds a { name -> film } map from an imported array of film entries.
// If entries already use the nested { bundles: [...] } schema, each is
// kept as its own profile (like labs). If they're the older flat schema
// (pre-bundles), entries sharing the same name are merged into one
// profile's bundles list, since that's how multiple pack sizes used to
// be represented as separate top-level entries.
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
            if (result[key]) {
                result[key].bundles.push(bundle);
            } else {
                result[key] = { name: f.name, boxSpeed: f.boxSpeed, maxPushPull: f.maxPushPull ?? 1, process: f.process || 'C41', format: f.format || '35mm', bundles: [bundle] };
            }
        });
    }
    return result;
}

// Merges one parsed YAML document (combined config.yaml shape, or a
// standalone films.yaml/labs.yaml array) into localStorage. Shared by
// both the preset-picker and file-upload import paths below.
function applyParsedImport(parsed) {
    const result = { films: 0, labs: 0, settings: false, ok: true };
    if (parsed && !Array.isArray(parsed) && (parsed.films || parsed.labs || parsed.settings)) {
        // Combined config.yaml shape
        if (Array.isArray(parsed.films)) {
            let saved = readJSON('filmProfiles', {});
            const incoming = buildFilmProfilesFromEntries(parsed.films);
            Object.assign(saved, incoming);
            result.films += Object.keys(incoming).length;
            localStorage.setItem('filmProfiles', JSON.stringify(saved));
        }
        if (Array.isArray(parsed.labs)) {
            let saved = readJSON('labProfiles', {});
            parsed.labs.forEach(l => { if (l.name) { saved[l.name] = l; result.labs++; } });
            localStorage.setItem('labProfiles', JSON.stringify(saved));
        }
        if (parsed.settings && parsed.settings.upgradeThresholdPercent !== undefined) {
            localStorage.setItem('upgradeThresholdPercent', parsed.settings.upgradeThresholdPercent);
            result.settings = true;
        }
    } else if (Array.isArray(parsed)) {
        // Standalone films.yaml / labs.yaml — an empty array/file is
        // valid (just nothing to import), not an error.
        if (parsed.length > 0) {
            const isLabFile = 'services' in parsed[0] || 'devCost' in parsed[0];
            const isFilmFile = 'boxSpeed' in parsed[0] || 'filmCost' in parsed[0] || 'bundles' in parsed[0];
            if (isLabFile) {
                let saved = readJSON('labProfiles', {});
                parsed.forEach(l => { if (l.name) { saved[l.name] = l; result.labs++; } });
                localStorage.setItem('labProfiles', JSON.stringify(saved));
            } else if (isFilmFile) {
                let saved = readJSON('filmProfiles', {});
                const incoming = buildFilmProfilesFromEntries(parsed);
                Object.assign(saved, incoming);
                result.films += Object.keys(incoming).length;
                localStorage.setItem('filmProfiles', JSON.stringify(saved));
            } else {
                result.ok = false;
            }
        }
    } else if (parsed != null) {
        result.ok = false;
    }
    // parsed == null (empty file/document) — nothing to import, not an error.
    return result;
}

function readYamlFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try { resolve({ ok: true, parsed: jsyaml.load(event.target.result) }); }
            catch { resolve({ ok: false }); }
        };
        reader.onerror = () => resolve({ ok: false });
        reader.readAsText(file);
    });
}

async function fetchYamlPreset(folder, file) {
    try {
        const res = await fetch(`${folder}/${file}`);
        if (!res.ok) return { ok: false };
        return { ok: true, parsed: jsyaml.load(await res.text()) };
    } catch {
        return { ok: false };
    }
}

function finishImport(results) {
    let filmsImported = 0, labsImported = 0, settingsImported = false, errors = 0;
    results.forEach(r => {
        if (!r.ok) { errors++; return; }
        const applied = applyParsedImport(r.parsed);
        if (!applied.ok) { errors++; return; }
        filmsImported += applied.films;
        labsImported += applied.labs;
        if (applied.settings) settingsImported = true;
    });
    updateFilmDropdowns();
    updateLabDropdown();
    if (settingsImported) upgradeThresholdInput.value = localStorage.getItem('upgradeThresholdPercent');
    updateLabComparison();
    if (errors > 0 && filmsImported === 0 && labsImported === 0 && !settingsImported) {
        showToast('Could not read the selected file(s) — are they valid YAML?', true);
        closeImportModal();
    } else {
        showToast(`Imported ${filmsImported} film profile(s), ${labsImported} lab profile(s)${settingsImported ? ', and settings' : ''}.`);
        closeImportModal();
        // Step 2: let them pick a home lab and favourite/ignore stocks.
        openSetupModal();
    }
}

const importDropzone = document.getElementById('importDropzone');
importDropzone.addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    Promise.all(files.map(readYamlFile)).then(results => {
        finishImport(results);
        e.target.value = '';
    });
});
// Drag-and-drop: highlight on dragover, import on drop. Only YAML files
// are read; anything else is ignored.
['dragenter', 'dragover'].forEach(evt => importDropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    importDropzone.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
}));
['dragleave', 'drop'].forEach(evt => importDropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    importDropzone.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
}));
importDropzone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter(f => /\.ya?ml$/i.test(f.name));
    if (!files.length) { showToast('Please drop .yaml or .yml files.', true); return; }
    Promise.all(files.map(readYamlFile)).then(finishImport);
});

importSelectedPresetsBtn.addEventListener('click', async () => {
    const checked = [...importPresetList.querySelectorAll('.import-preset-checkbox:checked')];
    if (!checked.length) return;
    const chosen = checked.map(cb => presetEntries[parseInt(cb.dataset.index)]);
    importSelectedPresetsBtn.disabled = true;
    importSelectedPresetsBtn.textContent = 'Importing…';
    const results = await Promise.all(chosen.map(e => fetchYamlPreset(e.folder, e.file)));
    finishImport(results);
    importSelectedPresetsBtn.textContent = 'Import Selected';
});

// ---------- First-launch import prompt ----------
// Shown once, only if the person has never saved a film or lab
// profile and hasn't already dismissed it — offers a shortcut
// straight into the Import modal's preset picker instead of leaving
// new visitors to find Settings → Import on their own. Dismissing
// either way (import or "Not now") marks it seen for good, even if
// they later delete all their data.
(function initFirstLaunchImportBanner() {
    const alreadySeen = localStorage.getItem('hasSeenImportPrompt') === 'true';
    const hasFilmProfiles = localStorage.getItem('filmProfiles') !== null;
    const hasLabProfiles = localStorage.getItem('labProfiles') !== null;
    if (alreadySeen || hasFilmProfiles || hasLabProfiles) return;

    const banner = document.getElementById('firstLaunchImportBanner');
    if (!banner) return;
    banner.classList.remove('hidden');

    function dismiss() {
        localStorage.setItem('hasSeenImportPrompt', 'true');
        banner.classList.add('hidden');
    }

    document.getElementById('firstLaunchImportBtn').addEventListener('click', () => {
        dismiss();
        openImportModal();
    });
    document.getElementById('firstLaunchDismissBtn').addEventListener('click', dismiss);
})();
