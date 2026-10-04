/* Mobile rotation lifecycle, including browsers denying native fullscreen. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const script = fs.readFileSync('legacy.js', 'utf8');
async function run(mobile, native) {
    const dom = new JSDOM(fs.readFileSync('legacy.html', 'utf8'), {
        url: 'https://example.com/legacy.html', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const w = dom.window, d = w.document;
    const orientation = new w.EventTarget();
    orientation.type = 'portrait-primary';
    Object.defineProperty(w.screen, 'orientation', { value: orientation });
    w.matchMedia = query => ({ matches: query.includes('pointer: coarse') && mobile, addEventListener() {} });
    const modal = d.getElementById('videoModal');
    let requests = 0;
    modal.requestFullscreen = () => {
        requests++;
        if (!native) return Promise.reject(new Error('NotAllowedError'));
        d.fullscreenElement = modal;
        d.dispatchEvent(new w.Event('fullscreenchange'));
        return Promise.resolve();
    };
    d.exitFullscreen = () => {
        d.fullscreenElement = null;
        d.dispatchEvent(new w.Event('fullscreenchange'));
        return Promise.resolve();
    };
    const rotate = type => {
        orientation.type = type;
        orientation.dispatchEvent(new w.Event('change'));
    };
    const immersive = () => modal.classList.contains('is-mobile-fullscreen');
    w.eval(script);
    rotate('landscape-primary');
    assert.equal(requests, 0, 'no fullscreen before opening a film');
    rotate('portrait-primary');
    d.querySelector('.film-card').click();
    await Promise.resolve();
    assert.equal(immersive(), mobile, 'tap enters horizontal mode only on mobile');
    for (let i = 0; i < 3; i++) {
        rotate('landscape-primary');
        assert.equal(immersive(), mobile);
        rotate('portrait-primary');
        assert.equal(immersive(), false, 'portrait exits every time');
        assert.ok(!d.fullscreenElement);
    }
    rotate('landscape-secondary');
    assert.equal(immersive(), mobile, 'rotation can reenter repeatedly');
    d.getElementById('modalClose').click();
    assert.equal(immersive(), false);
    const previousRequests = requests;
    rotate('portrait-primary');
    rotate('landscape-primary');
    assert.equal(requests, previousRequests, 'closing disarms rotation');
    assert.equal(modal.hidden, true);
    if (!mobile) assert.equal(requests, 0, 'desktop never requests fullscreen');
    await Promise.resolve();
    dom.window.close();
}
(async () => {
    await run(true, true);
    await run(true, false);
    await run(false, true);
    console.log('PASS Captured: mobile fullscreen, repeated rotation, denied API fallback, cleanup and desktop isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
