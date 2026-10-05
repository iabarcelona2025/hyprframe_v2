const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = __dirname;
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const startMarker = '    /* ── 2a. WORK: el scroll vertical recorre la galería horizontal ── */';
const endMarker = '    /* ── 2b. Nav activo: el apartado en el que estás se ilumina ── */';
const horizontalSetup = script.slice(script.indexOf(startMarker), script.indexOf(endMarker));

for (const page of ['index.html', 'es/index.html']) {
    test(`${page}: projects are inside the pinned work panel`, () => {
        const doc = new JSDOM(fs.readFileSync(path.join(root, page), 'utf8')).window.document;
        const work = doc.querySelector('#work');
        const pin = work.querySelector(':scope > .work-pin');
        assert.ok(pin, 'the work section has a pin panel');
        assert.ok(pin.querySelector('.section-head'));
        assert.ok(pin.querySelector('#workList'));
        assert.equal(work.querySelectorAll('.work-row').length, 10);
    });
}

test('desktop work CSS pins the panel and lays project cards out horizontally', () => {
    assert.match(css, /@media \(min-width: 1025px\)\s*\{[\s\S]*?\.work\.work-horizontal-ready\s*\{[^}]*--work-scroll-distance/);
    assert.match(css, /\.work\.work-horizontal-ready \.work-pin\s*\{[^}]*position: sticky; top: 0;[\s\S]*?overflow: hidden;/);
    assert.match(css, /\.work\.work-horizontal-ready \.work-list\s*\{[^}]*display: flex;[\s\S]*?width: max-content/);
    assert.match(css, /\.work\.work-horizontal-ready \.work-row\s*\{[^}]*flex: 0 0 clamp\(18rem, 34vw, 32rem\)/);
});

function boot({ desktop = true, reduced = false, viewportWidth = 1200, contentWidth = 4200, sectionTop = 2000 } = {}) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
        url: 'https://hyprframe.com/', pretendToBeVisual: true, runScripts: 'outside-only',
    });
    const { window } = dom;
    const doc = window.document;
    const state = { y: 0, viewportWidth, contentWidth };
    const frames = [];

    window.matchMedia = query => ({
        matches: query.includes('min-width: 1025px') ? desktop : false,
        media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    window.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} };
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => state.y });
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => state.viewportWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 900 });
    window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    window.scrollTo = (x, y) => {
        state.y = typeof x === 'object' && x !== null ? x.top : y;
        window.dispatchEvent(new window.Event('scroll'));
    };

    const section = doc.querySelector('#work');
    const pin = section.querySelector('.work-pin');
    const list = section.querySelector('#workList');
    Object.defineProperty(pin, 'clientWidth', { configurable: true, get: () => state.viewportWidth });
    Object.defineProperty(list, 'scrollWidth', { configurable: true, get: () => state.contentWidth });
    section.getBoundingClientRect = () => ({ top: sectionTop - state.y, left: 0, right: state.viewportWidth, width: state.viewportWidth });
    pin.getBoundingClientRect = () => ({ top: 0, left: 0, right: state.viewportWidth, width: state.viewportWidth });

    window.eval(`(() => { const reduced = ${reduced}; ${horizontalSetup} })()`);

    const flushFrames = () => {
        while (frames.length) frames.splice(0).forEach(callback => callback());
    };
    const scrollTo = y => {
        state.y = y;
        window.dispatchEvent(new window.Event('scroll'));
        flushFrames();
    };
    return { dom, window, doc, state, section, pin, list, flushFrames, scrollTo };
}

test('desktop downward scroll advances the rail rightward, then reverses naturally', () => {
    const page = boot();
    try {
        const { state, section, list, scrollTo } = page;
        assert.ok(section.classList.contains('work-horizontal-ready'));
        assert.equal(section.style.getPropertyValue('--work-scroll-distance'), '3000px');

        scrollTo(2000);
        assert.match(list.style.transform, /translate3d\(0px, 0, 0\)/);
        scrollTo(3500);
        assert.match(list.style.transform, /translate3d\(-1500px, 0, 0\)/);
        scrollTo(5000);
        assert.match(list.style.transform, /translate3d\(-3000px, 0, 0\)/);
        scrollTo(3500);
        assert.match(list.style.transform, /translate3d\(-1500px, 0, 0\)/);
        assert.equal(state.y, 3500);
    } finally { page.dom.window.close(); }
});

test('resizing recalculates the horizontal travel distance', () => {
    const page = boot();
    try {
        page.state.y = 2300;
        page.state.viewportWidth = 1400;
        page.window.dispatchEvent(new page.window.Event('resize'));
        assert.equal(page.section.style.getPropertyValue('--work-scroll-distance'), '2800px');
        assert.match(page.list.style.transform, /translate3d\(-300px, 0, 0\)/);
    } finally { page.dom.window.close(); }
});

test('mobile and reduced-motion layouts keep the original vertical work list', () => {
    for (const options of [{ desktop: false }, { desktop: true, reduced: true }]) {
        const page = boot(options);
        try {
            assert.ok(!page.section.classList.contains('work-horizontal-ready'));
            assert.equal(page.section.style.getPropertyValue('--work-scroll-distance'), '');
            assert.equal(page.list.style.transform, '');
        } finally { page.dom.window.close(); }
    }
});

test('keyboard focus scrolls an offscreen project into view', () => {
    const page = boot();
    try {
        const row = page.list.querySelectorAll('.work-row')[4];
        const staticLeft = 1500;
        page.list.getBoundingClientRect = () => ({ left: -currentX(), right: page.state.contentWidth - currentX() });
        row.getBoundingClientRect = () => ({
            left: staticLeft - currentX(), right: staticLeft - currentX() + 500,
        });
        function currentX() {
            const match = page.list.style.transform.match(/translate3d\((-?[\d.]+)px/);
            return match ? -Number(match[1]) : 0;
        }

        row.dispatchEvent(new page.window.FocusEvent('focusin', { bubbles: true }));
        page.flushFrames();
        assert.equal(page.state.y, 3476);
        assert.match(page.list.style.transform, /translate3d\(-1476px, 0, 0\)/);
        assert.ok(staticLeft - currentX() >= 0 && staticLeft - currentX() < page.state.viewportWidth);
    } finally { page.dom.window.close(); }
});
