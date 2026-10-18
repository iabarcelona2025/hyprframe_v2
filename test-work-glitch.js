const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = __dirname;
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

/* Extrae el bloque de una @media: desde su llave de apertura hasta la llave
   que la cierra, contando llaves para no cortar antes de tiempo. */
function bloqueMedia(cond) {
    const i = css.indexOf(cond);
    assert.ok(i >= 0, `falta la media query ${cond}`);
    const abre = css.indexOf('{', i);
    let nivel = 0;
    for (let j = abre; j < css.length; j++) {
        if (css[j] === '{') nivel++;
        else if (css[j] === '}') {
            nivel--;
            if (nivel === 0) return css.slice(abre + 1, j);
        }
    }
    assert.fail(`la media query ${cond} no cierra`);
}

for (const page of ['index.html', 'es/index.html']) {
    test(`${page}: cada número de la sección de proyectos lleva su copia para el glitch`, () => {
        const doc = new JSDOM(fs.readFileSync(path.join(root, page), 'utf8')).window.document;
        const nums = [...doc.querySelectorAll('#workList .work-num')];
        assert.equal(nums.length, 10, 'los diez proyectos siguen numerados');
        for (const num of nums) {
            assert.equal(num.dataset.num, num.textContent,
                `data-num debe repetir el número visible (${num.textContent})`);
        }
    });
}

test('la sección de la landing que se Glitchea es la de los mundos generados', () => {
    const doc = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).window.document;
    assert.match(doc.querySelector('#work .section-side').textContent, /Generated worlds/i);
});

test('el glitch sólo existe en escritorio, con puntero fino y con movimiento permitido', () => {
    const bloque = bloqueMedia('@media (min-width: 1025px) and (hover: hover) and (prefers-reduced-motion: no-preference)');
    assert.match(bloque, /\.work-num::before,\s*\.work-num::after \{[^}]*content: attr\(data-num\)/s,
        'las copias del glitch se pintan con el número leído del atributo');
    assert.match(bloque, /\.work-row:hover \.work-num::before/);
    assert.match(bloque, /\.work-row:hover \.work-num::after/);
    assert.doesNotMatch(bloque, /text-shadow/,
        'la cifra no lleva sombra propia: el efecto son las franjas de detrás');
});

test('fuera del bloque de escritorio no queda ninguna regla del glitch', () => {
    const fuera = css.replace(bloqueMedia('@media (min-width: 1025px) and (hover: hover) and (prefers-reduced-motion: no-preference)'), '');
    assert.doesNotMatch(fuera, /\.work-num::(before|after)/,
        'el glitch no puede colarse en móvil o en táctil');
});

test('el glitch se dispara a la vez que el número se pone lila', () => {
    assert.match(css, /\.work-row:hover \.work-num \{ color: var\(--violet\); \}/,
        'el número sigue poniéndose lila al pasar el cursor');
    const bloque = bloqueMedia('@media (min-width: 1025px) and (hover: hover) and (prefers-reduced-motion: no-preference)');
    assert.match(bloque, /\.work-row:hover \.work-num::before,[\s\S]*?animation: work-num-slice-a/);
    assert.match(bloque, /\.work-row:hover \.work-num::after,[\s\S]*?animation: work-num-slice-b/);
});

test('el glitch es el de casa: franjas de la 404, no una tele mal sintonizada', () => {
    const bloque = bloqueMedia('@media (min-width: 1025px) and (hover: hover) and (prefers-reduced-motion: no-preference)');
    // Las copias van detrás de la cifra y se recortan en franjas, como en la 404.
    assert.match(bloque, /\.work-row:hover \.work-num::before,[\s\S]*?z-index: -1;/);
    assert.match(bloque, /\.work-row:hover \.work-num::after,[\s\S]*?z-index: -2;/);
    assert.match(css, /@keyframes work-num-slice-a \{[\s\S]*?clip-path: inset\(10% 0 80% 0\)/,
        'las franjas son las de la 404');
    assert.match(css, /@keyframes work-num-slice-b \{[\s\S]*?clip-path: inset\(65% 0 15% 0\)/);
    // Los dos colores del glitch de casa: blanco roto y lima.
    assert.match(bloque, /color: var\(--fg\);/);
    assert.match(bloque, /color: var\(--lime\);/);
    // Ni una gota de la aberración cromática que parecía una tele.
    assert.doesNotMatch(bloque, /rgba\(255, 36, 95/, 'sin franja roja');
    assert.doesNotMatch(bloque, /rgba\(0, 214, 255/, 'ni franja cian');
    assert.doesNotMatch(bloque, /#00d6ff/, 'ni cian puro');
    assert.doesNotMatch(css, /work-num-pixel-/, 'ni el glitch de píxeles');
    assert.doesNotMatch(css, /work-num-glitch-/, 'ni el glitch de franjas anterior');
});

test('el glitch dura 2 s y después la cifra se queda quieta en lila', () => {
    const bloque = bloqueMedia('@media (min-width: 1025px) and (hover: hover) and (prefers-reduced-motion: no-preference)');
    for (const name of ['work-num-slice-a', 'work-num-slice-b']) {
        assert.match(bloque, new RegExp(`animation: ${name} 2s steps\\(1, end\\) 1 forwards;`),
            `${name} dura 2 s, una sola vez y se queda en su último fotograma`);
        const kf = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css);
        assert.ok(kf, `falta @keyframes ${name}`);
        const ultimo = kf[1].trim().split('\n').pop();
        assert.match(ultimo, /opacity: 0;/, 'el último fotograma apaga la copia: el efecto se acaba');
    }
    // Y la cifra se queda en lila: el color del hover no vuelve al gris.
    assert.match(css, /\.work-row:hover \.work-num \{ color: var\(--violet\); \}/);
});
