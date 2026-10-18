/* Regresión del menú burger: el overlay conserva el blur y la apertura circular,
   se rasteriza en un layer propio, bloquea el scroll raíz y pausa/reanuda el
   vídeo del hero únicamente mientras está cubierto. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const estilos = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

/* Sin los comentarios de CSS: dentro de la hoja se explica el porqué de
   cada ajuste y esas palabras no son declaraciones. */
function sinComentarios(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/* Devuelve el cuerpo de la primera regla con ese selector, contando llaves
   para no cortar el bloque por la mitad. */
function regla(selector, css = estilos) {
    const patron = new RegExp(
        `(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm');
    const m = patron.exec(css);
    assert.ok(m, `no aparece la regla ${selector} en styles.css`);
    const abre = css.indexOf('{', m.index);
    let nivel = 0;
    for (let j = abre; j < css.length; j++) {
        if (css[j] === '{') nivel++;
        else if (css[j] === '}') {
            nivel--;
            if (nivel === 0) return sinComentarios(css.slice(abre + 1, j));
        }
    }
    assert.fail(`la regla ${selector} no cierra`);
}

/* Todos los bloques de un mismo selector (el menú reparte el selector ES/EN
   en dos reglas). */
function reglas(selector, css = estilos) {
    const patron = new RegExp(
        `(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'gm');
    const salida = [];
    let m;
    while ((m = patron.exec(css)) !== null) {
        const abre = css.indexOf('{', m.index);
        let nivel = 0;
        for (let j = abre; j < css.length; j++) {
            if (css[j] === '{') nivel++;
            else if (css[j] === '}') {
                nivel--;
                if (nivel === 0) { salida.push(sinComentarios(css.slice(abre + 1, j))); break; }
            }
        }
    }
    assert.ok(salida.length, `no aparece la regla ${selector} en styles.css`);
    return salida;
}

/* Los segundos de un valor CSS con unidades s. */
function segundos(valor) {
    const m = /([0-9]*\.?[0-9]+)s/.exec(valor);
    return m ? Number(m[1]) : 0;
}

/* Los HTML del repo que enlazan styles.css (los symlinks de es/ apuntan al
   mismo archivo, así que sólo se recorre la raíz y la carpeta es/). */
function paginasConStyles() {
    const salida = [];
    const recorrer = (dir) => {
        for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entrada.name === 'node_modules' || entrada.name === '.git') continue;
            const completa = path.join(dir, entrada.name);
            if (entrada.isDirectory()) recorrer(completa);
            else if (entrada.name.endsWith('.html')) salida.push(completa);
        }
    };
    recorrer(root);
    return salida.filter((f) => /styles\.css\?v=\d+/.test(fs.readFileSync(f, 'utf8')));
}

test('la plancha del menú arranca sin difuminado y se abre difuminada', () => {
    const cerrada = regla('.menu-overlay');
    assert.match(cerrada, /backdrop-filter:\s*blur\(0\)/,
        'la plancha cerrada no difumina nada');
    assert.match(cerrada, /-webkit-backdrop-filter:\s*blur\(0\)/,
        'y tampoco en Safari');
    const abierta = regla('body.menu-open .menu-overlay');
    assert.match(abierta, /backdrop-filter:\s*blur\(14px\)/,
        'con el menú abierto la plancha se difumina');
    assert.match(abierta, /-webkit-backdrop-filter:\s*blur\(14px\)/,
        'y también en Safari');
});

test('el difuminado dura 0,12 s y acaba antes de que entre el primer enlace', () => {
    const transicion = /transition:\s*([^;]+);/.exec(regla('.menu-overlay'))[1];
    const blur = /backdrop-filter\s+([0-9]*\.?[0-9]+s)/.exec(transicion);
    assert.ok(blur, 'la plancha tiene que animar el backdrop-filter');
    const duracion = segundos(blur[1]);
    assert.equal(duracion, 0.12, 'el difuminado dura 0,12 s');

    const retraso = segundos(
        /transition-delay:\s*([0-9]*\.?[0-9]+s)/
            .exec(regla('body.menu-open .menu-links a:nth-child(1)'))[1]);
    assert.equal(retraso, 0.15, 'el primer enlace sigue entrando a los 0,15 s');
    assert.ok(duracion <= retraso,
        `el velo (${duracion}s) tiene que estar puesto antes del primer enlace (${retraso}s)`);
    // Y la plancha no puede retrasar su propio difuminado.
    assert.doesNotMatch(regla('.menu-overlay'), /transition-delay/);
});

test('la apertura circular de clip-path se conserva en 0,8 s', () => {
    const cerrada = regla('.menu-overlay');
    assert.match(cerrada, /clip-path:\s*circle\(0% at calc\(100% - 3rem\) 2\.5rem\)/);
    assert.match(/transition:\s*([^;]+);/.exec(cerrada)[1], /clip-path\s+0\.8s/);
    assert.match(regla('body.menu-open .menu-overlay'),
        /clip-path:\s*circle\(150% at calc\(100% - 3rem\) 2\.5rem\)/);
});

test('el vídeo del hero conserva su animación y sólo se pausa mientras el menú lo tapa', () => {
    const video = regla('.hero-video');
    assert.match(video, /opacity:\s*0\.58/);
    assert.match(video, /animation:\s*heroBreath 18s ease-in-out infinite alternate/);
    assert.match(regla('body.menu-open .hero-video'), /animation-play-state:\s*paused/);
    const js = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    assert.match(js, /resumeHeroVideo = !heroVideo\.paused/);
    assert.match(js, /if \(resumeHeroVideo\) heroVideo\.pause\(\)/);
    assert.match(js, /heroVideo\.play\(\)\.catch/);
    for (const page of ['index.html', 'es/index.html']) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        assert.match(html, /<video class="hero-video" autoplay muted loop playsinline/,
            `${page} sigue con su vídeo`);
    }
});

test('el overlay permanece en su propio compositor layer y el scroll raíz se bloquea', () => {
    assert.match(regla('.menu-overlay'), /transform:\s*translateZ\(0\)/);
    assert.match(regla('html:has(body.menu-open)'), /overflow:\s*hidden/);
    assert.match(regla('html:has(.menu-overlay)'), /scrollbar-gutter:\s*stable/);
});

test('el terminal del hero no se toca', () => {
    const caret = regla('.log-caret');
    assert.match(caret, /animation:\s*logCaret 1\.1s steps\(1, end\) infinite/);
    assert.match(estilos, /body\.menu-open \.log-caret\s*\{\s*animation-play-state:\s*paused;\s*\}/,
        'el cursor del terminal se sigue parando con el menú abierto');
});

test('los puntos verdes del menú no se tocan', () => {
    assert.match(estilos, /\n\.pulse \{[^}]*background:\s*var\(--lime\)/s,
        'el punto verde sigue siendo lima');
    assert.match(estilos, /\n\.pulse \{[^}]*animation:\s*pulse 2s infinite/s);
    const enMenu = regla('.menu-links a .pulse');
    assert.match(enMenu, /display:\s*inline-block/);
    assert.match(enMenu, /margin-right:\s*0\.45em/);
    for (const [n, delay] of [[2, '0.33'], [3, '0.66'], [4, '1'], [5, '1.33'], [6, '1.66']]) {
        assert.match(estilos,
            new RegExp(`\\.menu-links a:nth-child\\(${n}\\) \\.pulse \\{ animation-delay: ${delay}s; \\}`),
            `el punto ${n} sigue con su retardo`);
    }
});

test('el selector ES/EN del menú no se toca', () => {
    const lang = reglas('.menu-lang').join('\n');
    assert.match(lang, /opacity:\s*0/);
    assert.match(lang, /transform:\s*translateY\(40px\)/);
    assert.match(lang, /padding-top:\s*1\.5rem/);
    assert.match(lang, /border-top:\s*1px solid var\(--line\)/);
    assert.match(lang, /max-width:\s*16rem/);
    assert.match(estilos, /\.menu-lang \.lang-switch \{ font-size: 0\.95rem; \}/);
    const abierto = regla('body.menu-open .menu-lang');
    assert.match(abierto, /opacity:\s*1/);
    assert.match(abierto, /transition-delay:\s*0\.57s/);
});

test('la animación del contenido del menú no se toca', () => {
    const enlace = regla('.menu-links a');
    assert.match(enlace, /opacity:\s*0/);
    assert.match(enlace, /transform:\s*translateY\(40px\)/);
    assert.match(enlace,
        /transition:\s*opacity 0\.6s var\(--ease-out\), transform 0\.6s var\(--ease-out\), color 0\.3s/);
    const abierto = regla('body.menu-open .menu-links a');
    assert.match(abierto, /opacity:\s*1/);
    assert.match(abierto, /transform:\s*translateY\(0\)/);
    for (const [n, delay] of [[1, '0.15'], [2, '0.22'], [3, '0.29'], [4, '0.36'], [5, '0.43'], [6, '0.5']]) {
        assert.match(estilos,
            new RegExp(`body\\.menu-open \\.menu-links a:nth-child\\(${n}\\) \\{ transition-delay: ${delay}s; \\}`),
            `el enlace ${n} sigue con su retardo`);
    }
});

test('las páginas EN/ES piden styles.css con la versión de caché nueva', () => {
    for (const page of ['index.html', 'es/index.html']) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        assert.match(html, /styles\.css\?v=226/, `${page} debe pedir styles.css?v=225`);
        assert.doesNotMatch(html, /styles\.css\?v=225/, `${page} no puede quedarse en la versión vieja`);
    }
    // EN y ES comparten la misma hoja (es/styles.css es un symlink).
    assert.equal(fs.realpathSync(path.join(root, 'es/styles.css')),
        fs.realpathSync(path.join(root, 'styles.css')));
});

test('ninguna página se queda atrás con la versión de caché', () => {
    const paginas = paginasConStyles();
    assert.ok(paginas.length >= 20, 'se han recorrido las páginas del repo');
    for (const pagina of paginas) {
        const html = fs.readFileSync(pagina, 'utf8');
        assert.doesNotMatch(html, /styles\.css\?v=(?!226)\d+/,
            `${path.relative(root, pagina)} pide una versión vieja de styles.css`);
    }
});
