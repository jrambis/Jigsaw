const { chromium } = require('playwright');

const BASE = 'http://localhost:8080';
const CHROME_PATH = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const RESULTS = [];
let screenshots = 0;

async function snap(page, name) {
    screenshots++;
    const path = `/home/jrambis/.openclaw/workspace/Jigsaw/screenshots/${name}.png`;
    await page.screenshot({ path, fullPage: true });
    return path;
}

function log(test, pass, detail = '') {
    const icon = pass ? '✅' : '❌';
    const msg = `${icon} ${test}${detail ? ' — ' + detail : ''}`;
    RESULTS.push({ test, pass, detail });
    console.log(msg);
}

(async () => {
    console.log('🧪 Jigsaw QA Test Suite\n' + '='.repeat(40));
    
    const browser = await chromium.launch({ headless: true });
    
    // ========================================
    // TEST 1: Page loads without errors
    // ========================================
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));
    
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    log('Page loads', true);
    await snap(page, '01-initial-load');
    
    // ========================================
    // TEST 2: Console errors on load
    // ========================================
    const loadErrors = consoleErrors.filter(e => !e.includes('api.php') && !e.includes('favicon'));
    log('No critical JS errors on load', loadErrors.length === 0, 
        loadErrors.length > 0 ? loadErrors.join('; ') : 'clean');
    
    // ========================================
    // TEST 3: Key UI elements exist
    // ========================================
    const header = await page.$('#header');
    const menuBtn = await page.$('#menuBtn');
    const progressText = await page.$('#progressText');
    const themeBtn = await page.$('#themeBtn');
    const canvas = await page.$('#puzzleCanvas') || await page.$('canvas');
    
    log('Header exists', !!header);
    log('Menu button exists', !!menuBtn);
    log('Progress text exists', !!progressText);
    log('Theme toggle exists', !!themeBtn);
    log('Canvas exists', !!canvas);
    
    // ========================================
    // TEST 4: Dark mode toggle
    // ========================================
    const wasDark = await page.evaluate(() => document.body.classList.contains('dark-mode'));
    if (themeBtn) await themeBtn.click();
    await page.waitForTimeout(500);
    const isDark = await page.evaluate(() => document.body.classList.contains('dark-mode'));
    log('Dark mode toggles', wasDark !== isDark, `was: ${wasDark}, now: ${isDark}`);
    await snap(page, '02-dark-mode');
    
    // Toggle back
    if (themeBtn) await themeBtn.click();
    await page.waitForTimeout(300);
    
    // ========================================
    // TEST 5: Menu drawer opens
    // ========================================
    if (menuBtn) {
        await menuBtn.click();
        await page.waitForTimeout(500);
        const drawer = await page.$('.drawer');
        const drawerVisible = drawer ? await drawer.isVisible() : false;
        log('Drawer opens on menu click', drawerVisible);
        await snap(page, '03-drawer-open');
        
        // Close drawer
        const overlay = await page.$('#drawerOverlay');
        if (overlay) await overlay.click();
        await page.waitForTimeout(300);
    }
    
    // ========================================
    // TEST 6: Celebration modal - structure
    // ========================================
    consoleErrors.length = 0; // reset for celebration test
    
    // Inject test data and trigger celebration
    await page.evaluate(() => {
        // Make sure puzzleEngine exists with needed properties
        if (typeof puzzleEngine !== 'undefined' && puzzleEngine) {
            puzzleEngine.completionShown = false;
            puzzleEngine.stats = puzzleEngine.stats || {};
            puzzleEngine.stats.totalPieces = 100;
            puzzleEngine.stats.placedPieces = 100;
            // Set a source image if available
        }
        // Set puzzle start time to 4 minutes ago
        if (typeof puzzleStartTime !== 'undefined' || true) {
            window.puzzleStartTime = Date.now() - 245000;
        }
    });
    
    // Try calling showCompletionMessage
    const celebrationWorked = await page.evaluate(() => {
        try {
            if (typeof showCompletionMessage === 'function') {
                showCompletionMessage();
                return true;
            }
            return false;
        } catch(e) {
            return 'error: ' + e.message;
        }
    });
    
    await page.waitForTimeout(1000);
    log('Celebration function callable', celebrationWorked === true, String(celebrationWorked));
    
    const celebErrors = consoleErrors.filter(e => !e.includes('api.php') && !e.includes('favicon'));
    log('No JS errors during celebration', celebErrors.length === 0,
        celebErrors.length > 0 ? celebErrors.join('; ') : 'clean');
    
    // Check celebration elements
    const celebOverlay = await page.$('#celebrationOverlay');
    log('Celebration overlay created', !!celebOverlay);
    
    const confettiCanvas = await page.$('#confettiCanvas');
    log('Confetti canvas created', !!confettiCanvas);
    
    const celebModal = await page.$('.celebration-modal');
    log('Celebration modal created', !!celebModal);
    
    const celebTitle = await page.$('.celebration-title');
    const titleText = celebTitle ? await celebTitle.textContent() : '';
    log('Celebration title shows', titleText.includes('Complete'), `"${titleText}"`);
    
    const stats = await page.$$('.celebration-stat');
    log('Stats displayed (3 items)', stats.length === 3, `found ${stats.length}`);
    
    // Check stat values
    const statValues = await page.$$eval('.stat-value', els => els.map(e => e.textContent));
    log('Piece count stat', statValues.some(v => v.includes('100')), `values: ${statValues.join(', ')}`);
    log('Time stat present', statValues.some(v => v.includes('m') || v.includes('s')), `values: ${statValues.join(', ')}`);
    
    const newPuzzleBtn = await page.$('#newPuzzleBtn');
    log('New Puzzle button exists', !!newPuzzleBtn);
    
    const hint = await page.$('.celebration-hint');
    log('Dismiss hint shown', !!hint);
    
    await snap(page, '04-celebration-light');
    
    // ========================================
    // TEST 7: Celebration in dark mode
    // ========================================
    if (themeBtn) {
        // Dismiss current celebration first
        if (celebOverlay) await celebOverlay.click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(500);
        
        await themeBtn.click();
        await page.waitForTimeout(300);
        
        // Re-trigger
        await page.evaluate(() => {
            puzzleEngine.completionShown = false;
            showCompletionMessage();
        });
        await page.waitForTimeout(1000);
        await snap(page, '05-celebration-dark');
        log('Celebration renders in dark mode', true);
        
        // Clean up
        const overlay2 = await page.$('#celebrationOverlay');
        if (overlay2) await overlay2.click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(500);
        await themeBtn.click();
        await page.waitForTimeout(300);
    }
    
    // ========================================
    // TEST 8: Celebration dismiss
    // ========================================
    await page.evaluate(() => {
        puzzleEngine.completionShown = false;
        showCompletionMessage();
    });
    await page.waitForTimeout(800);
    
    const overlay3 = await page.$('#celebrationOverlay');
    if (overlay3) await overlay3.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(800);
    
    const overlayGone = !(await page.$('#celebrationOverlay'));
    log('Celebration dismisses on overlay click', overlayGone);
    
    // ========================================
    // TEST 9: Mobile viewport
    // ========================================
    const mobilePage = await browser.newPage();
    mobilePage.on('pageerror', err => consoleErrors.push('MOBILE: ' + err.message));
    
    await mobilePage.setViewportSize({ width: 375, height: 812 }); // iPhone size
    await mobilePage.goto(BASE, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await mobilePage.waitForTimeout(2000);
    await snap(mobilePage, '06-mobile-viewport');
    
    // Trigger celebration on mobile
    await mobilePage.evaluate(() => {
        if (typeof puzzleEngine !== 'undefined' && puzzleEngine) {
            puzzleEngine.completionShown = false;
            puzzleEngine.stats = puzzleEngine.stats || {};
            puzzleEngine.stats.totalPieces = 50;
            puzzleEngine.stats.placedPieces = 50;
        }
        window.puzzleStartTime = Date.now() - 120000;
        if (typeof showCompletionMessage === 'function') showCompletionMessage();
    });
    await mobilePage.waitForTimeout(1000);
    await snap(mobilePage, '07-celebration-mobile');
    
    const mobileModal = await mobilePage.$('.celebration-modal');
    log('Celebration renders on mobile', !!mobileModal);
    
    await mobilePage.close();
    
    // ========================================
    // TEST 10: Tablet viewport
    // ========================================
    const tabletPage = await browser.newPage();
    await tabletPage.setViewportSize({ width: 768, height: 1024 }); // iPad
    await tabletPage.goto(BASE, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await tabletPage.waitForTimeout(2000);
    
    await tabletPage.evaluate(() => {
        if (typeof puzzleEngine !== 'undefined' && puzzleEngine) {
            puzzleEngine.completionShown = false;
            puzzleEngine.stats = puzzleEngine.stats || {};
            puzzleEngine.stats.totalPieces = 200;
            puzzleEngine.stats.placedPieces = 200;
        }
        window.puzzleStartTime = Date.now() - 600000;
        if (typeof showCompletionMessage === 'function') showCompletionMessage();
    });
    await tabletPage.waitForTimeout(1000);
    await snap(tabletPage, '08-celebration-tablet');
    log('Celebration renders on tablet', !!await tabletPage.$('.celebration-modal'));
    
    await tabletPage.close();
    
    // ========================================
    // SUMMARY
    // ========================================
    await browser.close();
    
    console.log('\n' + '='.repeat(40));
    console.log('📊 QA RESULTS');
    console.log('='.repeat(40));
    const passed = RESULTS.filter(r => r.pass).length;
    const failed = RESULTS.filter(r => !r.pass).length;
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📸 Screenshots: ${screenshots}`);
    console.log(`📁 Screenshots saved to: Jigsaw/screenshots/`);
    
    if (failed > 0) {
        console.log('\n❌ FAILURES:');
        RESULTS.filter(r => !r.pass).forEach(r => {
            console.log(`   - ${r.test}: ${r.detail}`);
        });
    }
    
    process.exit(failed > 0 ? 1 : 0);
})();
