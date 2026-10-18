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
    assert.match(bloque, /\.work-row:hover \.work-num,\s*\.work-row:focus-visible \.work-num \{[^}]*text-shadow/s,
        'la cifra recibe su corte cromático al volver lila');
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
    assert.match(bloque, /\.work-row:hover \.work-num::before,[\s\S]*?animation: work-num-glitch-a/);
    assert.match(bloque, /\.work-row:hover \.work-num::after,[\s\S]*?animation: work-num-glitch-b/);
});

test('el glitch es el de franjas con deriva cromática', () => {
    const bloque = bloqueMedia('@media (min-width: 1025px) and (hover: hover) and (prefers-reduced-motion: no-preference)');
    // La cifra se corta en dos colores y las copias van en lima y cian.
    assert.match(bloque, /text-shadow:\s*-0\.08em 0 0 rgba\(255, 36, 95, 0\.55\),\s*0\.08em 0 0 rgba\(0, 214, 255, 0\.55\);/s,
        'la cifra recibe el corte cromático rojo/cian');
    assert.match(bloque, /color: var\(--lime\);/);
    assert.match(bloque, /color: #00d6ff;/);
    // Cada copia muestra una franja distinta y se desplaza lateralmente.
    for (const name of ['work-num-glitch-a', 'work-num-glitch-b']) {
        const kf = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css);
        assert.ok(kf, `falta @keyframes ${name}`);
        assert.match(kf[1], /clip-path: inset\(/, 'las copias muestran una franja del número');
        assert.match(kf[1], /transform: translate\(-?[0-9]px, 0\)/, 'y se desplazan lateralmente');
    }
    // Y la cifra original tiembla 1px.
    assert.match(css, /@keyframes work-num-jitter \{[\s\S]*?transform: translate\(-1px, 0\)/,
        'el número original tiembla 1px, como una señal que se descuadra');
    assert.match(bloque, /animation: work-num-jitter 0\.26s steps\(2, end\) infinite/);
    // El glitch es continuo: no dura 2 s ni se apaga.
    assert.match(bloque, /animation: work-num-glitch-a 0\.36s steps\(3, end\) infinite/);
    assert.doesNotMatch(css, /work-num-slice-|work-num-pixel-/,
        'no quedan restos de los otros dos efectos probados');
});
