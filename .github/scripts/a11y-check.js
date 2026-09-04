// Runs axe-core (via @axe-core/playwright) against every top-level view
// reachable from App.goView() and fails on any WCAG 2 A/AA violation.
// Used by .github/workflows/a11y-check.yml, which serves the repo root
// over HTTP first (index.html loads js/*.js via relative <script src>, so
// this can't just open the file directly - file:// script loading is
// unreliable/CSP-restricted in a way http:// isn't).
//
// Only checks views reachable via a single App.goView() call from the
// initial state - it doesn't drive into nested flows like the setup
// wizard, the film/lab editor, or a lab's tier editor (those need
// specific state set up first, e.g. an edit index). Good enough to catch
// the class of bug this exists for (an unlabeled control, a link that
// only differs from surrounding text by color) without turning this
// script into a full end-to-end test suite.
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;

const VIEWS = ['main', 'settings', 'library', 'expired'];

const url = process.argv[2];
if (!url) {
    console.error('Usage: node a11y-check.js <url>');
    process.exit(2);
}

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    let violationCount = 0;
    for (const view of VIEWS) {
        await page.evaluate((v) => { App.goView(v); }, view);
        await page.waitForTimeout(200);

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        if (results.violations.length > 0) {
            console.error(`\n=== view: ${view} ===`);
            for (const v of results.violations) {
                violationCount++;
                console.error(`[${v.impact}] ${v.id}: ${v.help}`);
                console.error(`  ${v.helpUrl}`);
                for (const node of v.nodes) {
                    console.error(`  - ${node.target.join(' ')}`);
                }
            }
        }
    }
    await browser.close();

    if (violationCount > 0) {
        console.error(`\n${violationCount} WCAG 2 A/AA violation(s) found across ${VIEWS.length} view(s).`);
        process.exit(1);
    }

    console.log(`No WCAG 2 A/AA violations found across ${VIEWS.length} view(s) (${VIEWS.join(', ')}).`);
})();
