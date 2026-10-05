const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = __dirname;
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

for (const page of ['index.html', 'es/index.html']) {
    test(`${page}: the landing work title no longer includes SELECTED`, () => {
        const doc = new JSDOM(fs.readFileSync(path.join(root, page), 'utf8')).window.document;
        const title = doc.querySelector('#work .section-title');
        assert.equal(title.textContent.trim(), 'WORK');
        assert.doesNotMatch(title.textContent, /SELECTED/i);
    });

    test(`${page}: each selected work has a real hover image`, () => {
        const doc = new JSDOM(fs.readFileSync(path.join(root, page), 'utf8')).window.document;
        const rows = [...doc.querySelectorAll('#workList .work-row')];
        assert.equal(rows.length, 10);
        for (const row of rows) {
            assert.ok(row.dataset.img, `missing image on ${row.textContent.trim()}`);
            assert.ok(fs.existsSync(path.join(root, row.dataset.img)), row.dataset.img);
        }
        assert.match(doc.querySelector('link[href^="styles.css?"]').href, /v=\d+$/);
    });
}

test('all ten rows grow 15% plus 30px after photo and gradient begin, then close without delay', () => {
    assert.match(css, /--work-row-pad: clamp\(1\.4rem, 3\.2vw, 2\.4rem\)/);
    assert.match(css, /--work-row-content-h: clamp\(1\.98rem, 3\.96vw, 2\.97rem\)/);
    assert.match(css, /transition: padding-block 0\.55s[^;]*, padding-left 0\.5s[^;]*, background 0\.5s;/);
    assert.match(css, /\.work-row:hover, \.work-row:focus-visible\s*\{[^}]*transition-delay: 0\.3s, 0s, 0s;\s*padding-block: calc\(var\(--work-row-pad\) \+ \(2 \* var\(--work-row-pad\) \+ var\(--work-row-content-h\) \+ 1px\) \* 0\.075 \+ 22\.5px\)/);
    assert.match(css, /\.work-row::before\s*\{[^}]*inset: 0;/);
    assert.match(css, /\.work-row::after\s*\{[^}]*top: 0; right: 0; bottom: 0;/);
    assert.match(css, /\.work-row:hover::after, \.work-row:focus-visible::after\s*\{ opacity: 1; transform: scale\(1\); \}/,
        'the thumbnail expands to fill the expanded row');
});

test('diagonal slices reveal the existing image on hover and keyboard focus', () => {
    assert.match(script, /row\.style\.setProperty\("--img",/);
    assert.match(css, /@property --work-stripe\s*\{[^}]*syntax: "<length>"/);
    assert.match(css, /@supports \(mask-composite: intersect\)/);
    assert.match(css, /repeating-linear-gradient\(102deg, #000 0 var\(--work-stripe\), transparent var\(--work-stripe\) 32px\)/);
    assert.match(css, /mask-composite: intersect/);
    assert.match(css, /\.work-row:hover::after, \.work-row:focus-visible::after\s*\{ --work-stripe: 32px; \}/);
    assert.match(css, /transition: --work-stripe 0\.7s/);
});

test('3D entrance cascades on desktop and mobile, but respects reduced motion', () => {
    assert.match(script, /revealTimer = setTimeout\(revealNextRow, 105\)/); // quicker gap between rows
    assert.match(script, /if \(!reduced && workSection && workTitle\) \{/,
        'the entrance is no longer restricted to desktop pointer devices');
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{/);
    assert.match(css, /\.work\.work-3d-ready \.work-list\s*\{[^}]*perspective: 1100px/);
    assert.match(css, /\.work\.work-3d-ready \.work-row\s*\{[^}]*opacity: 0;[^}]*translate3d\(clamp\(-420px, -30vw, -160px\), 0, -240px\) rotateY\(-62deg\)/);
    assert.match(css, /\.work\.work-3d-ready \.work-row\.work-row-visible\s*\{[^}]*animation: work-row-enter/);
    assert.match(css, /@keyframes work-row-enter\s*\{[\s\S]*?from\s*\{[^}]*filter: url\(#work-blur-x6\)/);
    assert.match(css, /20%\s*\{ filter: url\(#work-blur-x4\); \}/);
    assert.match(css, /40%\s*\{ filter: url\(#work-blur-x2\); \}/);
    assert.match(css, /60%\s*\{ filter: none; \}[\s\S]*?to\s*\{[^}]*filter: none;/);
    assert.doesNotMatch(css.match(/@keyframes work-row-enter\s*\{[\s\S]*?\.work-row:hover/)[0], /filter: blur\(/,
        'the entrance must not use an omnidirectional CSS blur');
    for (const page of ['index.html', 'es/index.html']) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        const doc = new JSDOM(html).window.document;
        for (const [id, x] of [['work-blur-x6', 6], ['work-blur-x4', 4], ['work-blur-x2', 2]]) {
            const blur = doc.querySelector(`#work filter[id="${id}"] feGaussianBlur`);
            assert.equal(blur?.getAttribute('stdDeviation'), `${x} 0`, `${page}: ${id} must blur horizontally only`);
        }
        assert.match(html, /styles\.css\?v=213/);
        assert.match(html, /script\.js\?v=59/);
    }
});

// Exercise the real reveal setup with controlled scroll and title events:
// once the title finishes, every row plays immediately without more scroll.
const revealSetup = script.slice(script.indexOf('    /* ── 4. Reveal on scroll'), script.indexOf('    /* El anagrama vuelve'));
function setupWorkReveal(page, desktop, reduced) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, page), 'utf8'), {
        url: 'https://hyprframe.com/', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const { window } = dom;
    const observers = [];
    window.matchMedia = query => ({ matches: query.includes('prefers-reduced-motion') ? reduced : desktop });
    window.IntersectionObserver = class {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe() {} unobserve() {} disconnect() {}
        intersect(...targets) { this.callback(targets.map(target => ({ target, isIntersecting: true }))); }
    };
    const list = window.document.querySelector('#workList');
    let listTop = 1200;
    list.getBoundingClientRect = () => ({ top: listTop });
    window.eval(`(() => { const reduced = ${reduced}; ${revealSetup} })()`);
    function scrollListTo(top) {
        listTop = top;
        window.dispatchEvent(new window.Event('scroll'));
    }
    return { dom, window, observers, scrollListTo };
}

for (const page of ['index.html', 'es/index.html']) {
    test(`${page}: all rows cascade automatically after the WORK title`, async () => {
        const { dom, window, observers, scrollListTo } = setupWorkReveal(page, true, false);
        try {
            const title = window.document.querySelector('#work .section-title');
            const rows = [...window.document.querySelectorAll('#work .work-row')];
            const line = title.querySelector('.line:last-child .line-inner');
            assert.ok(window.document.querySelector('#work').classList.contains('work-3d-ready'));
            assert.equal(observers.length, 3); // rows are NOT observed while transformed offscreen
            // Reaching the first row while the title animates must not reveal anything yet.
            observers[2].intersect(title);
            scrollListTo(600);
            await new Promise(resolve => setTimeout(resolve, 25));
            assert.equal(rows.filter(row => row.classList.contains('work-row-visible')).length, 0);
            const end = new window.Event('transitionend', { bubbles: true });
            Object.defineProperty(end, 'propertyName', { value: 'transform' });
            line.dispatchEvent(end);
            assert.ok(rows[0].classList.contains('work-row-visible'));
            assert.ok(!rows[1].classList.contains('work-row-visible'));
            await new Promise(resolve => setTimeout(resolve, 130));
            assert.ok(rows[1].classList.contains('work-row-visible'));
            assert.ok(!rows[2].classList.contains('work-row-visible'));
            // No further scroll: the remaining eight rows must still appear in order.
            await new Promise(resolve => setTimeout(resolve, 930));
            assert.ok(rows.every(row => row.classList.contains('work-row-visible')));
        } finally { dom.window.close(); }
    });
}

test('the cascade starts immediately when the title finishes, without waiting for the list to reach the viewport', async () => {
    const { dom, window, observers } = setupWorkReveal('index.html', true, false);
    try {
        const title = window.document.querySelector('#work .section-title');
        const rows = [...window.document.querySelectorAll('#work .work-row')];
        observers[2].intersect(title);
        const end = new window.Event('transitionend', { bubbles: true });
        Object.defineProperty(end, 'propertyName', { value: 'transform' });
        title.querySelector('.line:last-child .line-inner').dispatchEvent(end);
        // The first row is visible right when the title animation ends.
        assert.ok(rows[0].classList.contains('work-row-visible'));
        assert.ok(!rows[1].classList.contains('work-row-visible'));
        await new Promise(resolve => setTimeout(resolve, 130));
        assert.ok(rows[1].classList.contains('work-row-visible'));
    } finally { dom.window.close(); }
});

test('rows do not stay hidden if the title misses its visibility threshold', async () => {
    const { dom, window, scrollListTo } = setupWorkReveal('index.html', true, false);
    try {
        const title = window.document.querySelector('#work .section-title');
        const row = window.document.querySelector('#work .work-row');
        title.getBoundingClientRect = () => ({ bottom: 300 });
        scrollListTo(600);
        await new Promise(resolve => setTimeout(resolve, 25));
        assert.ok(title.classList.contains('in'), 'the title starts when a row enters');
        assert.ok(!row.classList.contains('work-row-visible'), 'the row waits for the title');
        const end = new window.Event('transitionend', { bubbles: true });
        Object.defineProperty(end, 'propertyName', { value: 'transform' });
        title.querySelector('.line:last-child .line-inner').dispatchEvent(end);
        assert.ok(row.classList.contains('work-row-visible'));
    } finally { dom.window.close(); }
});

test('mobile cascades the work rows, while reduced motion leaves them static', async () => {
    const { dom, window, observers, scrollListTo } = setupWorkReveal('index.html', false, false);
    try {
        const title = window.document.querySelector('#work .section-title');
        const rows = [...window.document.querySelectorAll('#work .work-row')];
        const line = title.querySelector('.line:last-child .line-inner');
        assert.equal(observers.length, 3); // generic, late and title only
        assert.ok(window.document.querySelector('#work').classList.contains('work-3d-ready'));
        observers[2].intersect(title);
        scrollListTo(600);
        await new Promise(resolve => setTimeout(resolve, 25));
        assert.ok(!rows[0].classList.contains('work-row-visible'), 'the row waits for the title');
        const end = new window.Event('transitionend', { bubbles: true });
        Object.defineProperty(end, 'propertyName', { value: 'transform' });
        line.dispatchEvent(end);
        assert.ok(rows[0].classList.contains('work-row-visible'));
        assert.ok(!rows[1].classList.contains('work-row-visible'));
    } finally { dom.window.close(); }

    for (const desktop of [false, true]) {
        const reduced = setupWorkReveal('index.html', desktop, true);
        try {
            assert.equal(reduced.observers.length, 3);
            assert.ok(!reduced.window.document.querySelector('#work').classList.contains('work-3d-ready'));
        } finally { reduced.dom.window.close(); }
    }
});
