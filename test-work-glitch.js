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
        'el número original recibe su fantasma de píxel al volver lila');
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
    assert.match(bloque, /\.work-row:hover \.work-num::before,[\s\S]*?animation: work-num-pixel-a/);
    assert.match(bloque, /\.work-row:hover \.work-num::after,[\s\S]*?animation: work-num-pixel-b/);
});

test('el glitch es de píxeles, no una tele mal sintonizada', () => {
    const bloque = bloqueMedia('@media (min-width: 1025px) and (hover: hover) and (prefers-reduced-motion: no-preference)');
    // La rejilla que convierte las copias en cuadrados sueltos.
    assert.match(bloque, /repeating-linear-gradient\(90deg, #000 0 3px, transparent 3px 6px\)/,
        'las copias se recortan con una rejilla de 3px');
    assert.match(bloque, /repeating-linear-gradient\(0deg, #000 0 3px, transparent 3px 6px\)/,
        'en las dos direcciones, para que los restos sean cuadrados');
    assert.match(bloque, /mask-composite: intersect/);
    // Y va dentro de @supports: sin máscaras compuestas la copia saldría
    // entera (un fantasma de color, justo lo que se quiere evitar).
    assert.match(bloque, /@supports \(mask-composite: intersect\)/);
    // Ni una rastro de aberración cromática ni de temblor.
    assert.doesNotMatch(css, /rgba\(255, 36, 95, 0\.55\)/, 'sin franja roja');
    assert.doesNotMatch(css, /rgba\(0, 214, 255, 0\.55\)/, 'ni franja cian');
    assert.doesNotMatch(css, /work-num-jitter/, 'ni temblor de la cifra');
    assert.doesNotMatch(css, /work-num-glitch-/, 'ni el glitch de franjas anterior');
    // El único fantasma es duro y de 2px: un píxel de desplazamiento.
    assert.match(bloque, /text-shadow: 2px 0 rgba\(160, 100, 255, 0\.45\);/);
});

test('los píxeles saltan en pasos redondos de 3px', () => {
    for (const name of ['work-num-pixel-a', 'work-num-pixel-b']) {
        const kf = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css);
        assert.ok(kf, `falta @keyframes ${name}`);
        const saltos = [...kf[1].matchAll(/translate\((-?[0-9]+)px, (-?[0-9]+)px\)/g)];
        assert.ok(saltos.length >= 3, 'la animación tiene al menos tres posiciones');
        for (const [, x, y] of saltos) {
            assert.equal(Math.abs(Number(x) % 3), 0, `el salto horizontal ${x}px no es múltiplo del píxel`);
            assert.equal(Math.abs(Number(y) % 3), 0, `el salto vertical ${y}px no es múltiplo del píxel`);
        }
    }
    assert.match(css, /animation: work-num-pixel-a 0\.52s steps\(3, end\) infinite/,
        'y se mueven a saltos, no deslizando');
});
