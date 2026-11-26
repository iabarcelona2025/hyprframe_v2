/* CONTACT: los iconos de LinkedIn, Instagram y WhatsApp usan en escritorio el
   mismo rollover que en móvil. El efecto magnético (.magnetic) sólo existía en
   escritorio (script.js lo desactiva en táctil): movía la fila con el cursor y,
   al escribir `transition` en línea, se saltaba las transiciones del :hover.
   Sin esa clase, web y móvil comparten la única regla .contact-link:hover de
   styles.css: color, sangría de 1rem y borde violeta, con sus transiciones. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = __dirname;
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

const REDES = ['LinkedIn', 'Instagram', 'WhatsApp'];

for (const page of ['index.html', 'es/index.html']) {
    test(`${page}: los tres iconos sociales ya no llevan .magnetic`, () => {
        const doc = new JSDOM(fs.readFileSync(path.join(root, page), 'utf8')).window.document;
        const enlaces = [...doc.querySelectorAll('#contact .contact-side .contact-link')];
        assert.equal(enlaces.length, 3, 'siguen siendo LinkedIn, Instagram y WhatsApp');
        assert.deepEqual(enlaces.map(a => a.getAttribute('aria-label')), REDES);
        for (const a of enlaces) {
            assert.ok(!a.classList.contains('magnetic'),
                `${a.getAttribute('aria-label')} no debe seguir al cursor en escritorio`);
            assert.ok(a.querySelector('svg.contact-icon'), 'el enlace conserva su icono SVG');
        }
    });

    test(`${page}: el efecto magnético sigue vivo en el resto de la landing`, () => {
        const doc = new JSDOM(fs.readFileSync(path.join(root, page), 'utf8')).window.document;
        assert.ok(doc.querySelector('.send-btn.magnetic'), 'SEND MESSAGE conserva .magnetic');
        assert.ok(doc.querySelector('.clb-cta.magnetic'), 'TEST NOW conserva .magnetic');
    });
}

test('el rollover de .contact-link es único y vale para web y móvil', () => {
    assert.equal((css.match(/\.contact-link:hover\s*\{/g) || []).length, 1,
        'una sola regla de hover, sin variante exclusiva de escritorio');
    const bloque = /\.contact-link:hover\s*\{([^}]*)\}/.exec(css);
    assert.ok(bloque, 'existe el bloque .contact-link:hover');
    assert.match(bloque[1], /color:\s*var\(--fg\)/);
    assert.match(bloque[1], /padding-left:\s*1rem/);
    assert.match(bloque[1], /border-color:\s*var\(--violet\)/);
});

test('las transiciones del rollover siguen en la regla base', () => {
    const bloque = /\.contact-link\s*\{([^}]*)\}/.exec(css);
    assert.ok(bloque, 'existe el bloque .contact-link');
    assert.match(bloque[1], /transition:\s*color 0\.4s, padding-left 0\.5s var\(--ease-out\), border-color 0\.4s/);
});

test('script.js sigue limitando el imán a los elementos .magnetic', () => {
    assert.match(js, /document\.querySelectorAll\("\.magnetic"\)/,
        'los enlaces de CONTACT quedan fuera por marcado, no por un caso especial en el JS');
    assert.match(js, /if \(!isTouch && !reduced\)/,
        'en móvil el imán ya estaba desactivado: era la diferencia entre versiones');
});
