const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync('generated.js', 'utf8');
const start = script.indexOf('    function buildPagerVeil(veil) {');
const end = script.indexOf('\n    // Llegada por el paginador', start);
for (const fontSize of [16, 24, 32]) {
    const panels = [];
    const context = {
        window: { innerWidth: 1440, innerHeight: 900 },
        header: { getBoundingClientRect: () => ({ height: 73 }) },
        document: {
            documentElement: {},
            querySelector: selector => ({ getBoundingClientRect: () => selector === '.site-footer'
                ? { top: 860 } : { left: 650, right: 790, top: 109, bottom: 127 } }),
            createElement: () => ({ style: {} }),
        },
        getComputedStyle: () => ({ fontSize: `${fontSize}px` }),
        veil: { appendChild: panel => panels.push(panel) },
    };
    vm.runInNewContext(script.slice(start, end) + '\nbuildPagerVeil(veil);', context);
    assert.equal(panels.length, 4);
    assert.ok(parseFloat(panels[2].style.width) <= 650 - fontSize * 0.3 - 3);
    assert.ok(parseFloat(panels[3].style.left) >= 790 + fontSize * 0.3 + 3);
    assert.equal(parseFloat(panels[0].style.height), 106 - 73);
    assert.equal(parseFloat(panels[1].style.top), 130);
}
console.log('PASS: pager veil clears animated arrows and shadows at multiple font sizes');
