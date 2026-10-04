/* Mobile Captured playback follows Generated: inline Vimeo iframe, landscape fullscreen and poster restore. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('legacy.html', 'utf8');
const css = fs.readFileSync('legacy.css', 'utf8');
const script = fs.readFileSync('legacy.js', 'utf8');
const VIMEO_ORIGIN = 'https://player.vimeo.com';

function setup({ allowFullscreen = true, orientationLock = true, reducedMotion = false } = {}) {
    const dom = new JSDOM(html, {
        url: 'https://example.com/legacy.html', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const w = dom.window, d = w.document;
    const orientation = new w.EventTarget();
    orientation.type = 'portrait-primary';
    const locks = [], unlocks = [];
    if (orientationLock) {
        orientation.lock = value => { locks.push(value); return Promise.resolve(); };
        orientation.unlock = () => { unlocks.push(true); return Promise.resolve(); };
    }
    Object.defineProperty(w.screen, 'orientation', { configurable: true, value: orientation });

    const queries = new Map();
    w.matchMedia = query => {
        if (!queries.has(query)) {
            const listeners = new Set();
            const media = {
                media: query,
                get matches() {
                    if (query === '(max-width: 560px)') return true;
                    if (query === '(prefers-reduced-motion: reduce)') return reducedMotion;
                    if (query === '(orientation: portrait)') return orientation.type.startsWith('portrait');
                    if (query === '(orientation: landscape)') return orientation.type.startsWith('landscape');
                    return false;
                },
                addEventListener: (name, listener) => { if (name === 'change') listeners.add(listener); },
                removeEventListener: (name, listener) => { if (name === 'change') listeners.delete(listener); },
                dispatch: () => listeners.forEach(listener => listener({ matches: media.matches, media: query })),
            };
            queries.set(query, media);
        }
        return queries.get(query);
    };

    let fullscreen = null, requests = 0, exits = 0;
    Object.defineProperty(d, 'fullscreenElement', { configurable: true, get: () => fullscreen });
    Object.defineProperty(d, 'webkitFullscreenElement', { configurable: true, get: () => fullscreen });
    w.HTMLIFrameElement.prototype.requestFullscreen = function () {
        requests++;
        if (!allowFullscreen) return Promise.reject(new Error('NotAllowedError'));
        fullscreen = this;
        d.dispatchEvent(new w.Event('fullscreenchange'));
        return Promise.resolve();
    };
    d.exitFullscreen = () => {
        exits++;
        fullscreen = null;
        d.dispatchEvent(new w.Event('fullscreenchange'));
        return Promise.resolve();
    };

    // Let the test advance Generated's three-second portrait-exit timer deterministically.
    let nextTimer = 1;
    const timers = new Map();
    w.setTimeout = (callback, delay = 0) => {
        const id = nextTimer++;
        timers.set(id, { callback, delay });
        return id;
    };
    w.clearTimeout = id => timers.delete(id);

    w.eval(script);
    function rotate(type) {
        orientation.type = type;
        orientation.dispatchEvent(new w.Event('change'));
        w.dispatchEvent(new w.Event('orientationchange'));
        for (const media of queries.values()) media.dispatch();
    }
    function message(iframe, data, origin = VIMEO_ORIGIN) {
        w.dispatchEvent(new w.MessageEvent('message', {
            origin, source: iframe.contentWindow,
            data: typeof data === 'string' ? data : JSON.stringify(data),
        }));
    }
    function fireTimer(delay) {
        const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
        assert.ok(entry, `expected a ${delay}ms timer`);
        timers.delete(entry[0]);
        entry[1].callback();
    }
    return {
        dom, w, d, orientation, locks, unlocks, rotate, message, fireTimer, timers,
        get requests() { return requests; },
        get exits() { return exits; },
        get fullscreen() { return fullscreen; },
    };
}

async function runLandscapePlayback() {
    const app = setup();
    const { dom, w, d, locks, unlocks, rotate, message, fireTimer } = app;
    try {
        const card = d.querySelector('.film-card');
        const modal = d.getElementById('videoModal');
        card.click();

        const iframe = card.querySelector('.film-card__mobile-player');
        assert.ok(iframe, 'mobile tap inserts the player into that film card');
        assert.equal(iframe.parentElement, card.querySelector('.film-card__poster'));
        assert.equal(modal.hidden, true, 'mobile playback never opens the Captured pop-up');
        assert.ok(!d.body.classList.contains('modal-open'));
        assert.match(iframe.src, /player\.vimeo\.com\/video\/1131285757/);
        assert.equal(new URL(iframe.src).searchParams.get('playsinline'), '0');
        assert.ok(iframe.allow.includes('fullscreen'));
        assert.ok(iframe.hasAttribute('allowfullscreen'));
        assert.equal(app.requests, 1, 'play immediately requests iframe fullscreen');
        assert.deepEqual(locks, ['landscape'], 'portrait start requests landscape orientation');

        const playerMessages = [];
        iframe.contentWindow.postMessage = (data, origin) => playerMessages.push({ data, origin });
        message(iframe, { event: 'ready' });
        assert.ok(iframe.classList.contains('is-ready'));
        assert.deepEqual(playerMessages.map(item => item.data.value),
            ['ended', 'play', 'playing', 'timeupdate', 'fullscreenchange']);
        message(iframe, { event: 'play' });

        rotate('landscape-primary');
        assert.equal(app.requests, 1, 'the initial landscape rotation keeps the active fullscreen');
        rotate('portrait-primary');
        assert.equal(app.exits, 0, 'portrait cannot exit until playback has run for three seconds');
        fireTimer(3000);
        rotate('landscape-primary');
        rotate('portrait-primary');
        assert.equal(app.exits, 1, 'after playback, turning portrait exits fullscreen');
        assert.ok(unlocks.length > 0, 'orientation lock is released on exit');

        rotate('landscape-primary');
        assert.equal(app.requests, 2, 'turning back to landscape re-enters fullscreen');
        assert.ok(playerMessages.some(item => item.data.method === 'requestFullscreen'));

        message(iframe, { event: 'ended' });
        assert.ok(iframe.classList.contains('is-ending'), 'the last frame fades back to the poster');
        assert.equal(modal.hidden, true);
        // Cortinillas de salida (05/10/2026): en móvil el vídeo se despide con
        // las mismas bandas diagonales de 102° que GENERATED —la franja baja de
        // 32px a 0 y destapa el cartel de la tarjeta, que sigue montado debajo—,
        // y la opacidad mantiene la salida donde no se animan las propiedades.
        assert.ok(card.querySelector('.film-card__poster img'),
            'the card still is what the closing bands uncover');
        assert.match(css, /@property --film-stripe\s*\{[^}]*syntax: "<length>";[^}]*initial-value: 32px;/);
        assert.match(css, /repeating-linear-gradient\(102deg, #000 0 var\(--film-stripe\), transparent var\(--film-stripe\) 32px\)/);
        assert.match(css, /\.film-card__mobile-player\.is-ending\s*\{[^}]*--film-stripe: 0px;[^}]*opacity:\s*0[^}]*transition: --film-stripe 0\.7s var\(--ease-out\), opacity 0\.7s var\(--ease-out\);/);
        fireTimer(750);
        assert.equal(card.querySelector('.film-card__mobile-player'), null, 'ended video is unloaded');
        assert.ok(!card.classList.contains('is-mobile-playing'));
        assert.match(css, /\.film-card__mobile-player\.is-ending\s*\{[^}]*opacity:\s*0/);
        assert.doesNotMatch(css, /\.film-modal\.is-mobile-fullscreen/,
            'mobile no longer rotates a Captured modal');
    } finally {
        dom.window.close();
    }
}

async function runFullscreenDeniedFallback() {
    const app = setup({ allowFullscreen: false, orientationLock: false, reducedMotion: true });
    const { dom, d, message } = app;
    try {
        const card = d.querySelector('.film-card');
        card.click();
        await Promise.resolve(); // consume the simulated NotAllowedError
        const iframe = card.querySelector('.film-card__mobile-player');
        assert.ok(iframe, "denied Fullscreen API still leaves Vimeo's native-player fallback in place");
        assert.equal(new URL(iframe.src).searchParams.get('playsinline'), '0');
        assert.equal(d.getElementById('videoModal').hidden, true);
        message(iframe, { event: 'ended' });
        assert.equal(card.querySelector('.film-card__mobile-player'), null,
            'the inline fallback restores the poster when Vimeo ends');
    } finally {
        dom.window.close();
    }
}

(async () => {
    await runLandscapePlayback();
    await runFullscreenDeniedFallback();
    console.log('PASS Captured mobile: inline player, landscape fullscreen, rotation exit/reentry and fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
