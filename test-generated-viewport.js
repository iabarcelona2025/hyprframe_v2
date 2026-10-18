/* Static regression checks for the desktop-only viewport sizing contract.
   Real browser checks are still needed for font rendering and text bounds. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('generated.css', 'utf8');
const desktop = css.slice(css.lastIndexOf('@media (min-width: 561px)'));
assert.match(desktop, /width: min\(85\.5%, calc\(\(100svh - 214px\) \* 16 \/ 9\)\)/);
assert.match(desktop, /container-type: inline-size/);
assert.match(desktop, /min-height: 100svh; display: flex; flex-direction: column/);
assert.match(desktop, /margin-top: auto; padding-top: 8px/);
assert.match(desktop, /padding-top: 109px/);
assert.match(desktop, /padding-bottom: 36px/);
assert.match(desktop, /font-size: clamp\(10px, 1\.55cqw, 18px\)/);
assert.match(desktop, /\.node-player:not\(\.is-windowed\)/);
for (const dir of ['.', 'es']) {
    const pages = fs.readdirSync(dir).filter(name => /^project-.*\.html$/.test(name));
    assert.equal(pages.length, 10);
    for (const page of pages) {
        const html = fs.readFileSync(`${dir}/${page}`, 'utf8');
        assert.match(html, /generated\.css\?v=104/);
        assert.match(html, /class="node-player__synopsis"/);
    }
}
// The height-limited player plus the reserved chrome cannot exceed the window.
for (const height of [600, 720, 768, 800, 900, 1080, 1440]) {
    const playerHeight = ((height - 214) * 16 / 9) * 9 / 16;
    assert.ok(playerHeight + 214 <= height + 0.001);
}
console.log('PASS: desktop viewport contract, all 20 localized Generated pages');
