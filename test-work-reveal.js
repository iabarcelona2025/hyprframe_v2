const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = __dirname;
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

for (const page of ['index.html', 'es/index.html']) {
    test(`${page}: each selected work has a real hover image`, () => {
        const doc = new JSDOM(fs.readFileSync(path.join(root, page), 'utf8')).window.document;
        const rows = [...doc.querySelectorAll('#workList .work-row')];
        assert.equal(rows.length, 10);
        for (const row of rows) {
            assert.ok(row.dataset.img, `missing image on ${row.textContent.trim()}`);
            assert.ok(fs.existsSync(path.join(root, row.dataset.img)), row.dataset.img);
        }
        assert.match(doc.querySelector('link[href^="styles.css?"]').href, /v=117$/);
    });
}

test('all ten rows grow 15% after the photo and gradient begin, then close without delay', () => {
    assert.match(css, /--work-row-pad: clamp\(1\.4rem, 3\.2vw, 2\.4rem\)/);
    assert.match(css, /--work-row-content-h: clamp\(1\.98rem, 3\.96vw, 2\.97rem\)/);
    assert.match(css, /transition: padding-block 0\.55s[^;]*, padding-left 0\.5s[^;]*, background 0\.5s;/);
    assert.match(css, /\.work-row:hover, \.work-row:focus-visible\s*\{[^}]*transition-delay: 0\.3s, 0s, 0s;\s*padding-block: calc\(var\(--work-row-pad\) \+ \(2 \* var\(--work-row-pad\) \+ var\(--work-row-content-h\) \+ 1px\) \* 0\.075\)/);
    assert.match(css, /\.work-row::before\s*\{[^}]*inset: 0;/);
    assert.match(css, /\.work-row::after\s*\{[^}]*top: 0; right: 0; bottom: 0;/);
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
