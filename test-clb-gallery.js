/* CLB gallery regression checks: run with `node test-clb-gallery.js`. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const doc = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8")).window.document;
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("CLB gallery precedes Key Capabilities and TEST NOW sits directly below its text", () => {
    const grid = doc.querySelector("#clb .clb-grid");
    assert.deepEqual([...grid.children].map(el => el.className),
        ["clb-intro", "clb-showcase", "clb-side"]);
    const side = grid.querySelector(".clb-side");
    assert.deepEqual([...side.children].map(el => el.className), ["clb-capabilities", "clb-cta magnetic"]);
    assert.equal(side.querySelector(".clb-cta").getAttribute("href"), "builder.html");
    assert.match(css, /\.clb-side\s*\{[^}]*grid-area:\s*side;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/);
    assert.match(css, /grid-template-areas:\s*"intro"\s*"showcase"\s*"side"/);
});

test("desktop CLB keeps the gallery wide with capabilities and CTA in the right column", () => {
    const gridRule = css.match(/\.clb-grid\s*\{[^}]*\}/)[0];
    assert.match(gridRule, /grid-template-columns: minmax\(0, 1\.35fr\) minmax\(22rem, 0\.85fr\)/);
    assert.match(gridRule, /grid-template-areas:\s*"intro side"\s*"showcase side"/);
    assert.match(css, /@media \(max-width: 700px\)[\s\S]*grid-template-areas: "intro" "showcase" "side"/);
});

test("desktop carousel is anchored to the intro text block, not to its column", () => {
    const start = css.indexOf("@media (min-width: 1181px)");
    const end = css.indexOf("@media (max-width: 1180px)");
    const desktop = css.slice(start, end);
    // Un solo ancho de referencia: el del bloque de texto de la izquierda (31em
    // sobre el tamaño de letra de la intro). El carrusel y el párrafo lo comparten.
    assert.match(css.match(/(?:^|\n)\.clb\s*\{[^}]*\}/)[0],
        /--clb-copy-fs:\s*clamp\(1\.15rem, 1\.7vw, 1\.5rem\);/);
    assert.match(css.match(/(?:^|\n)\.clb-intro > p\s*\{[^}]*\}/)[0],
        /font-size:\s*var\(--clb-copy-fs\);/);
    assert.match(desktop, /--clb-copy-w:\s*calc\(31 \* var\(--clb-copy-fs\)\);/);
    assert.match(desktop, /\.clb-intro > p\s*\{[^}]*width:\s*var\(--clb-copy-w\);/);
    const showcase = desktop.match(/\.clb-showcase\s*\{[^}]*\}/)[0];
    assert.match(showcase, /width:\s*100%;\s*max-width:\s*var\(--clb-copy-w\);/);
    assert.match(showcase, /justify-self:\s*start;/);
    // Nada de anchos propios que se desmadren según la resolución.
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /calc\(100%\s*-\s*250px\)/);
});

test("desktop-only anchor: Key Capabilities starts level with the intro text on the left", () => {
    const start = css.indexOf("@media (min-width: 1181px)");
    const end = css.indexOf("@media (max-width: 1180px)");
    assert.ok(start > -1 && end > start, "desktop media query found");
    const desktop = css.slice(start, end);
    // La columna derecha se estira toda la fila: su borde superior coincide con el
    // del texto de la izquierda, y el CTA sigue pegado abajo con el carrusel.
    assert.match(desktop, /\.clb-side\s*\{\s*align-self:\s*stretch;\s*\}/);
    assert.match(desktop, /\.clb-capabilities\s*\{\s*margin-bottom:\s*clamp\(1\.5rem, 3vw, 2\.5rem\);\s*\}/);
    assert.match(desktop, /\.clb-cta\s*\{\s*margin-top:\s*auto;\s*\}/);
    assert.match(desktop, /\.clb-showcase\s*\{\s*align-self:\s*end;\s*\}/);
    // El anclaje es solo de escritorio: fuera de ese media query la columna no se estira.
    assert.doesNotMatch(css.match(/(?:^|\n)\.clb-side\s*\{[^}]*\}/)[0], /align-self/);
    assert.doesNotMatch(css.match(/(?:^|\n)\.clb-cta\s*\{[^}]*\}/)[0], /margin-top:\s*auto/);
});

test("capability headings start at the left edge without numbering, while descriptions are indented", () => {
    const features = [...doc.querySelectorAll("#clb .clb-feature")];
    assert.deepEqual(features.map(feature => feature.querySelector("h3").textContent),
        ["Precise Technical Setup", "Dual-Format Generation"]);
    assert.ok(features.every(feature => !feature.querySelector(".clb-num")));
    assert.doesNotMatch(css.match(/\.clb-feature\s*\{[^}]*\}/)[0], /grid-template-columns|padding-left/);
    assert.match(css.match(/\.clb-feature p\s*\{[^}]*\}/)[0], /margin-left:\s*clamp\(0\.75rem, 1\.5vw, 1\.25rem\)/);
});

test("four distinct frames plus a hidden copy of the first for a seamless loop", () => {
    const images = [...doc.querySelectorAll("#clb .clb-gallery-track img")];
    assert.equal(images.length, 5);
    images.slice(0, 4).forEach((img, i) => {
        assert.equal(img.getAttribute("src"), `assets/images/clb0${i + 1}.png`);
        assert.ok(img.alt);
        assert.ok(fs.existsSync(path.join(root, img.getAttribute("src"))));
    });
    assert.equal(images[4].getAttribute("src"), images[0].getAttribute("src"));
    assert.equal(images[4].getAttribute("aria-hidden"), "true");
    assert.equal(images[4].alt, "");
});

test("gallery and reflection slide in sync every 3s with ease-in-out", () => {
    assert.match(css, /\.clb-gallery-track\s*\{[^}]*animation:\s*clbSlide\s+12s\s+ease-in-out\s+infinite/);
    assert.match(css, /\.clb-reflection-track\s*\{[^}]*animation:\s*clbSlide\s+12s\s+ease-in-out\s+infinite/);
    const frames = css.match(/@keyframes clbSlide\s*\{([^}]+\}[^}]*\}[^}]*\}[^}]*\}[^}]*\})\s*\}/)?.[1];
    assert.ok(frames, "five keyframe groups");
    for (const offset of ["0", "-20%", "-40%", "-60%", "-80%"])
        assert.ok(frames.includes(`translateX(${offset})`), `position ${offset}`);
});

test("only mirrored photos appear beneath the gallery; no violet glow", () => {
    const photos = [...doc.querySelectorAll("#clb .clb-gallery-track img")];
    const reflection = doc.querySelector("#clb .clb-gallery-reflection");
    assert.equal(reflection.getAttribute("aria-hidden"), "true");
    assert.deepEqual([...reflection.querySelectorAll("img")].map(img => img.getAttribute("src")),
        photos.map(img => img.getAttribute("src")));
    assert.match(css, /\.clb-gallery-reflection\s*\{[^}]*scaleY\(-1\)/);
    assert.doesNotMatch(css, /\.clb-showcase::before\s*\{/);
    assert.doesNotMatch(css, /\.clb-gallery-frame\s*\{[^}]*box-shadow:/);
});

test("gallery faces the viewer head-on and the reflection is short and faint", () => {
    assert.match(css, /\.clb-gallery-frame\s*\{[^}]*border:\s*1px solid #111114;/);
    assert.match(css, /\.clb-showcase\s*\{[^}]*transform:\s*none;/);
    assert.doesNotMatch(css, /\.clb-showcase\s*\{[^}]*(perspective|rotate[XYZ]?)\(/);
    // El alto es proporcional al ancho (23:1), con topes de grosor: así la tira
    // escala con el carrusel y el arco —que se mide sobre el ancho— le cabe
    // siempre (con un alto fijo se partía en dos en pantallas medianas).
    const reflectionBox = css.match(/(?:^|\n)\.clb-gallery-reflection\s*\{[^}]*\}/)[0];
    assert.match(reflectionBox, /aspect-ratio:\s*23 \/ 1;/);
    assert.match(reflectionBox, /min-height:\s*1\.1rem;\s*max-height:\s*2rem;/);
    assert.match(css, /\.clb-gallery-reflection\s*\{[^}]*opacity:\s*0\.16;/);
    assert.ok(doc.querySelector("#clb .clb-showcase > .clb-gallery-reflection"));
});

test("the screen and its reflection share the same inward bow", () => {
    const shared = css.match(/\.clb-gallery-frame,\s*\.clb-gallery-reflection\s*\{([\s\S]*?)\}/)[1];
    // Una sola curva para las dos cajas. Su flecha se mide en cqw (3% del alto del
    // marco = 3cqw / 1.85, con el alto = ancho / 1.85) y no en % del alto de cada
    // caja: midiéndola en % el reflejo —unas 12 veces más bajo que el marco—
    // dibujaba un arco 12 veces más plano, recto bajo un marco curvado.
    assert.match(shared, /--clb-bow:\s*calc\(3cqw \/ 1\.85\)/);
    assert.match(shared, /--clb-curve:\s*polygon\(\s*0 0,/);
    assert.match(shared, /50% var\(--clb-bow\)/); // arco superior, flecha máxima en el centro
    assert.match(shared, /100% 0,\s*100% 100%/); // right side stays straight
    assert.match(shared, /50% calc\(100% - var\(--clb-bow\)\)/); // arco inferior
    assert.match(shared, /0 100%\s*\)/); // left side stays straight
    assert.match(shared, /clip-path:\s*var\(--clb-curve\)/);
    // El carrusel es el contexto de tamaño que da sentido a los cqw (1cqw = 1% de
    // su ancho), de modo que marco y reflejo comparten la misma medida.
    assert.match(css, /\.clb-showcase\s*\{[^}]*container-type:\s*inline-size;/);
    // Respaldo: sin consultas de contenedor no hay cqw, y el arco vuelve a % del
    // alto de cada caja en vez de perderse el recorte entero.
    assert.match(css, /@supports not \(container-type: inline-size\) \{\s*\.clb-gallery-frame, \.clb-gallery-reflection \{ --clb-bow: 3%; \}\s*\}/);
    // Ninguna de las dos cajas recorta por su cuenta: las dos usan la curva
    // compartida, así no pueden desincronizarse.
    assert.doesNotMatch(css.match(/(?:^|\n)\.clb-gallery-frame\s*\{[^}]*\}/)[0], /clip-path:/);
    assert.doesNotMatch(css.match(/(?:^|\n)\.clb-gallery-reflection\s*\{[^}]*\}/)[0], /clip-path:/);
});

test("gallery stacks between intro and features on mobile and stays still with reduced motion", () => {
    assert.match(css, /grid-template-areas:\s*"intro"\s*"showcase"\s*"side"/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.clb-gallery-track, \.clb-reflection-track\s*\{\s*animation:\s*none;\s*transform:\s*none;/);
});
