/* Fondo metaballs: HTML real + motor real, sin navegador ni red.
   Ejecutar: node test-statement-background.js */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const js = fs.readFileSync(`${__dirname}/script.js`, "utf8");
const css = fs.readFileSync(`${__dirname}/styles.css`, "utf8");

for (const page of ["index.html", "es/index.html"]) {
    const html = fs.readFileSync(`${__dirname}/${page}`, "utf8");
    const dom = new JSDOM(html, {
        url: `https://hyprframe.com/${page}`,
        runScripts: "outside-only", pretendToBeVisual: true,
    });
    const w = dom.window;
    const doc = w.document;
    doc.documentElement.classList.add("hf-skip-intro");
    let hidden = false;
    let frameTime = 1000, nextRaf = 0;
    const frames = new Map();
    Object.defineProperty(doc, "hidden", { get: () => hidden });
    Object.defineProperty(w.performance, "now", { configurable: true, value: () => frameTime });
    const observers = [];
    const media = {
        matches: false,
        addEventListener(name, cb) { this.onchange = cb; },
    };
    w.matchMedia = (q) => q.includes("reduced-motion") ? media : { matches: false };
    w.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
        observe(target) { this.targets.push(target); }
        unobserve() {}
        disconnect() {}
    };
    w.ResizeObserver = class { observe() {} disconnect() {} };
    w.Image = class {};
    w.requestAnimationFrame = (callback) => {
        const id = ++nextRaf;
        frames.set(id, callback);
        return id;
    };
    w.cancelAnimationFrame = (id) => frames.delete(id);

    const section = doc.querySelector("#statement");
    const background = section.querySelector(".statement-background");
    const layoutRect = { left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 };
    background.getBoundingClientRect = () => ({ ...layoutRect });
    const tvChroma = background.querySelector(".statement-tv-chroma");
    const textBefore = doc.querySelector("#statementText").textContent;
    assert.ok(tvChroma, "El fallback de televisión está dentro del SVG de las bolas");
    assert.equal(tvChroma.closest("svg"), background.querySelector("svg"), "El fringe se limita al espacio de las bolas");
    assert.equal(tvChroma.querySelectorAll("circle").length, 4, "Los cuatro discos tienen canales cromáticos");
    assert.equal(tvChroma.getAttribute("filter"), "url(#statement-tv-fringe)");
    assert.equal(background.querySelectorAll(".statement-edge-tv").length, 0, "No hay overlay cromático sobre el fondo negro");
    const tvFilter = background.querySelector("#statement-tv-fringe");
    assert.equal(tvFilter.querySelectorAll("feComposite[operator='out']").length, 2, "Ambos canales se recortan al alfa original de las bolas");
    assert.deepEqual([...tvFilter.querySelectorAll("feOffset")].map((offset) => offset.getAttribute("dx")), ["-4", "4"]);
    assert.equal(tvFilter.querySelector("feGaussianBlur").getAttribute("stdDeviation"), "5", "La descomposición cromática queda difusa");
    assert.equal(background.getAttribute("aria-hidden"), "true");
    assert.equal(background.querySelector("svg").getAttribute("focusable"), "false");
    assert.equal(doc.querySelectorAll("#statement-goo").length, 1);
    assert.equal(doc.querySelectorAll("#statement-fluid-lines").length, 0, "Sin filtro de trama verde");
    assert.equal(doc.querySelectorAll("#statement-wet-edge").length, 0, "Sin filtro de deformación de la silueta verde");
    assert.ok(!background.contains(doc.querySelector("#statementText")));

    // Cuatro discos planos: dos lilas y dos verdes sólidos.
    const field = background.querySelector("g.statement-metaball-field");
    const body = background.querySelector("g.statement-body");
    const mesh = background.querySelector("g.statement-mesh");
    assert.equal(body.querySelectorAll("circle").length, 2, "2 discos lilas");
    assert.equal(mesh.querySelectorAll("circle").length, 2, "2 discos verdes rellenos");
    assert.equal(field.getAttribute("filter"), "url(#statement-goo)", "Una misma unión metaball fusiona todos los colores");
    assert.equal(field.contains(body), true);
    assert.equal(field.contains(mesh), true);
    assert.equal(body.getAttribute("filter"), null);
    assert.equal(mesh.getAttribute("filter"), null);
    assert.equal(mesh.getAttribute("mask"), null);
    assert.equal(background.querySelectorAll("pattern").length, 0, "No quedan tramas de líneas");
    assert.equal(background.querySelectorAll("#statement-violet-sphere, #statement-sphere-gloss, .statement-sphere-lights").length, 0,
        "No quedan gradientes ni reflejos de volumen 3D");

    // Reposición sincronizada: forma visible y máscaras de contacto.
    const violetUpperCenter = [body.querySelector('.statement-orb--1'),
        background.querySelector('#statement-violet-contact .statement-orb--1')];
    violetUpperCenter.forEach(circle => {
        assert.equal(circle.getAttribute('cx'), '790');
        assert.equal(circle.getAttribute('cy'), '350');
        assert.equal(circle.getAttribute('r'), '185');
    });
    const violetLowerRight = [body.querySelector('.statement-orb--2'),
        background.querySelector('#statement-violet-contact .statement-orb--2')];
    violetLowerRight.forEach(circle => {
        assert.equal(circle.getAttribute('cx'), '1190');
        assert.equal(circle.getAttribute('cy'), '640');
        assert.equal(circle.getAttribute('r'), '135');
    });
    const greenUpperRight = [mesh.querySelector('.statement-orb--3 circle'),
        background.querySelector('#statement-green-contact .statement-orb--3 circle')];
    greenUpperRight.forEach(circle => {
        assert.equal(circle.getAttribute('cx'), '1180');
        assert.equal(circle.getAttribute('cy'), '280');
        assert.equal(circle.getAttribute('r'), '110');
    });
    const greenLowerLeft = [mesh.querySelector('.statement-orb--4 circle'),
        background.querySelector('#statement-green-contact .statement-orb--4 circle')];
    greenLowerLeft.forEach(circle => {
        assert.equal(circle.getAttribute('cx'), '470');
        assert.equal(circle.getAttribute('cy'), '640');
        assert.equal(circle.getAttribute('r'), '145');
    });
    mesh.querySelectorAll('circle').forEach(circle => {
        assert.equal(circle.getAttribute('fill'), '#a3df02', 'Verde sólido');
        assert.equal(circle.getAttribute('filter'), null, 'Sin sombreado ni deformación');
        assert.equal(circle.parentElement.getAttribute('clip-path'), null, 'El perímetro lo define el círculo original');
    });
    assert.equal(mesh.querySelectorAll('g.statement-orb').length, 2, "Cada disco conserva su órbita");

    const gooFilter = background.querySelector("#statement-goo");
    assert.equal(gooFilter.querySelectorAll("feTurbulence").length, 1, "Grano sutil del fallback lila");
    assert.equal(gooFilter.querySelector("feGaussianBlur").getAttribute("stdDeviation"), "26", "La unión del fallback es más ancha para persistir al separarse");
    assert.equal(gooFilter.querySelectorAll("feDisplacementMap").length, 1, "Unión suave de los discos lilas");
    assert.equal(gooFilter.querySelector("feDisplacementMap").getAttribute("scale"), "6", "La deformación del fallback sigue siendo sutil para conservar discos circulares");

    // La aguada sigue limitada a la intersección de los discos, no a todo el fondo.
    const wash = background.querySelector(".statement-watercolor");
    const smear = background.querySelector("#statement-cross-smear");
    assert.equal(smear.querySelector("feGaussianBlur").getAttribute("stdDeviation"), "24");
    assert.equal(smear.querySelector("feDisplacementMap").getAttribute("scale"), "168");
    assert.equal(smear.querySelector("feTurbulence").getAttribute("type"), "fractalNoise");
    assert.equal(smear.querySelector("feTurbulence").getAttribute("baseFrequency"), "0.018 0.026");
    assert.equal(smear.querySelector("feTurbulence").getAttribute("numOctaves"), "3");
    assert.equal(smear.querySelectorAll("feColorMatrix").length, 2, "Teal and chartreuse ink frays add mottled fallback pigments");
    assert.equal(smear.querySelectorAll("feComposite[operator='in']").length, 3, "Fallback noise and pigment patches remain clipped to cross-color contact");
    assert.equal(smear.querySelectorAll("feBlend").length, 3, "Turbulence and mottled pigments layer over the displaced ink wash");
    assert.equal(smear.querySelectorAll("feGaussianBlur").length, 2, "Ink fragments stay softly feathered after displacement");
    assert.equal(smear.querySelectorAll("feGaussianBlur")[1].getAttribute("stdDeviation"), "1.5");
    assert.ok(wash.querySelector('g[filter="url(#statement-cross-smear)"]'), "A displaced ink cloud blurs across the shared overlap");
    assert.ok(wash.querySelector('g[mask="url(#statement-violet-contact)"] g[mask="url(#statement-green-contact)"]'),
        "The softened color transition is restricted to violet-green contacts");
    assert.equal(background.querySelectorAll("#statement-violet-contact circle").length, 2);
    const sources = [...background.querySelectorAll("#statement-green-contact circle")];
    assert.equal(sources.length, 2);
    assert.equal(sources[0].parentElement.parentElement.getAttribute("filter"), "url(#statement-goo)", "La máscara verde refleja la misma unión metaball");
    assert.equal(sources[0].parentElement.parentElement.getAttribute("fill"), "white", "Máscara blanca para los discos verdes");
    assert.deepEqual(sources.map(c => c.getAttribute("fill")), [null, null], "El líquido nace del contacto de los discos verdes sólidos");
    assert.equal(wash.querySelectorAll("circle").length, 0, "Sin manchas o remolinos independientes");
    assert.deepEqual([...background.querySelectorAll("#statement-pigment stop")]
        .map((stop) => stop.getAttribute("stop-color")),
        ["#3cc8bd", "#58bcd9", "#8d7de0", "#43bbbc", "#55c977", "#43bbbc"]);
    w.eval(js);
    assert.equal(doc.querySelector("#statementText").textContent, textBefore);
    const observer = observers.find((o) => o.targets.includes(section));
    assert.ok(observer, "Se observa la sección después de la intro");
    const running = () => background.classList.contains("is-animating");
    const edgeStrength = () => Number(background.style.getPropertyValue("--statement-edge-tv"));
    const tickEdge = (timestamp) => {
        const id = Math.max(...frames.keys());
        const callback = frames.get(id);
        assert.equal(typeof callback, "function", "Hay un frame pendiente para actualizar la proximidad al borde");
        frames.delete(id);
        frameTime = timestamp;
        callback(timestamp);
    };
    assert.equal(running(), false, "En pausa por defecto");
    const nearEdge = edgeStrength();
    assert.ok(nearEdge > 0.98, "El fringe sube cuando una bola empieza cerca del borde");
    observer.cb([{ isIntersecting: true }]);
    assert.equal(running(), true, "En marcha al entrar en pantalla");
    tickEdge(12000);
    const awayFromEdge = edgeStrength();
    assert.ok(awayFromEdge > 0.45 && awayFromEdge < nearEdge - 0.3, "El fringe baja solo cuando las bolas se alejan de los extremos");
    tickEdge(22000);
    const backAtEdge = edgeStrength();
    assert.ok(backAtEdge > awayFromEdge + 0.4, "El fringe vuelve a subir al acercarse a los bordes");
    observer.cb([{ isIntersecting: false }]);
    assert.equal(running(), false, "En pausa fuera de pantalla");
    assert.equal(edgeStrength(), backAtEdge, "Fuera de pantalla se conserva el último nivel, no se apaga");
    observer.cb([{ isIntersecting: true }]);
    hidden = true;
    doc.dispatchEvent(new w.Event("visibilitychange"));
    assert.equal(running(), false, "En pausa con la pestaña oculta");
    assert.equal(edgeStrength(), backAtEdge, "La proximidad se conserva con la pestaña oculta");
    hidden = false;
    doc.dispatchEvent(new w.Event("visibilitychange"));
    assert.equal(running(), true, "Se reanuda al volver");
    media.matches = true;
    media.onchange();
    assert.equal(running(), false, "Respeta cambios de reducir movimiento");
    assert.equal(edgeStrength(), backAtEdge, "Con movimiento reducido queda estático, no atenuado");
    media.matches = false;
    media.onchange();
    assert.equal(running(), true);
    assert.equal(edgeStrength(), backAtEdge);
    dom.window.close();
    console.log(`PASS ${page}: estructura, texto intacto, visibilidad y reducir movimiento`);
}
assert.match(css, /\.statement-background\s*\{[^}]*--statement-edge-tv:\s*0\.35;/s, "The chromatic fringe keeps a visible baseline");
assert.match(css, /\.statement-tv-chroma\s*\{[^}]*opacity:\s*var\(--statement-edge-tv,\s*0\)/s, "The clipped circle fringe follows edge proximity");
assert.match(css, /\.statement-background\.has-liquid \.statement-tv-chroma\s*\{\s*display:\s*none;\s*\}/, "WebGL renders its own circle-only chromatic rim");
assert.ok(js.includes("nearestEdgeGap") && js.includes("rect.right - (screenX + radius)")
    && js.includes("rect.bottom - (screenY + radius)") && js.includes("return 0.35 + 0.65 * eased;"),
    "The intensity stays visible and rises as any orb approaches a page edge, not as the orbs approach one another");
assert.doesNotMatch(css, /\.statement-(?:metaballs|liquid)\s*\{[^}]*perspective\(/s, "No perspective tilt is applied to the circles on scroll");
assert.ok(!js.includes("--statement-scroll-rotation"), "No scroll-linked circle rotation remains in script.js");
assert.match(css, /\.statement-metaballs\s*\{[^}]*filter:\s*blur\(1px\)/s, "Fallback circles get a subtle blur");
assert.match(css, /\.statement-liquid\s*\{[^}]*filter:\s*blur\(1px\)/s, "WebGL circles get the same subtle blur");
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.statement-orb\s*\{\s*animation:\s*none;/,
    "The balls remain static with reduced-motion preferences");
assert.match(css, /@keyframes statement-orbit-a\s*\{\s*0%, 100%\s*\{\s*transform: translate\(-140px, -130px\);\s*\}\s*50%\s*\{\s*transform: translate\(-40px, 10px\);\s*\}\s*\}/, "La esfera lila grande recorre más distancia y conserva el destino");
assert.match(css, /@keyframes statement-orbit-b\s*\{\s*0%, 100%\s*\{\s*transform: translate\(90px, 65px\);\s*\}\s*50%\s*\{\s*transform: translate\(-310px, -200px\);\s*\}\s*\}/, "La esfera lila pequeña conserva su inicio y destino");
assert.match(css, /@keyframes statement-orbit-c\s*\{\s*0%, 100%\s*\{\s*transform: translate\(80px, -70px\);\s*\}\s*50%\s*\{\s*transform: translate\(-300px, 120px\);\s*\}\s*\}/, "El disco verde superior conserva su inicio y destino");
assert.match(css, /@keyframes statement-orbit-d\s*\{\s*0%, 100%\s*\{\s*transform: translate\(-90px, 65px\);\s*\}\s*50%\s*\{\s*transform: translate\(250px, -210px\);\s*\}\s*\}/, "El disco verde inferior conserva su inicio y destino");
assert.match(css, /\.statement-watercolor \{ opacity: 0\.96; mix-blend-mode: normal; \}/, "La tinta de contacto oculta las formas circulares en la zona fusionada");
assert.match(css, /\.statement-orb\s*\{[^}]*animation-play-state:\s*paused/s);
assert.match(css, /\.statement-background\.is-animating \.statement-orb\s*\{\s*animation-play-state:\s*running;/);
assert.match(css, /\.statement-body \{ fill: var\(--violet\); \}/, "Lila plano y sólido");
assert.match(css, /\.statement-metaball-field \{ opacity: 0\.32; \}/, "Los cuatro discos planos comparten la misma opacidad y filtro");
const svgBlock = (css.match(/\.statement-metaballs \{[^}]*\}/) || [""])[0];
assert.ok(!/opacity/.test(svgBlock), "La opacidad vive en las capas, no en el SVG");
assert.match(css, /@media \(max-width: 600px\)[^@]*\.statement-metaball-field \{ opacity: 0\.25; \}/s);
console.log("PASS CSS: discos planos, fallback de fusión, pausa y movimiento reducido");
