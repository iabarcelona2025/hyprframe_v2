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
    // El alto de la tira es su grosor (23:1 sobre el ancho, con topes de 1.1 a 2
    // rem, el rango de siempre) más la flecha del arco, que es lo que la caja sube
    // para colgar de la curva del marco.
    const reflectionBox = css.match(/(?:^|\n)\.clb-gallery-reflection\s*\{[^}]*\}/)[0];
    assert.match(reflectionBox,
        /height:\s*calc\(clamp\(1\.1rem, 100cqw \/ 23, 2rem\) \+ var\(--clb-bow\)\);/);
    assert.match(reflectionBox, /margin-top:\s*calc\(0\.35rem - var\(--clb-bow\)\);/);
    assert.match(reflectionBox, /opacity:\s*0\.16;/);
    assert.ok(doc.querySelector("#clb .clb-showcase > .clb-gallery-reflection"));
});

test("the reflection hangs from the same curve as the screen, at a constant gap", () => {
    const shared = css.match(/\.clb-gallery-frame,\s*\.clb-gallery-reflection\s*\{([\s\S]*?)\}/)[1];
    const frameBox = css.match(/(?:^|\n)\.clb-gallery-frame\s*\{[^}]*\}/)[0];
    const reflBox = css.match(/(?:^|\n)\.clb-gallery-reflection\s*\{[^}]*\}/)[0];
    // Una sola medida para las dos curvas: la flecha del arco del marco, el 3% de
    // su alto (alto = ancho / 1.85) = 3cqw / 1.85. Se mide en cqw —una fracción
    // del ancho del carrusel, igual para las dos cajas— y no en % del alto de cada
    // una: midiéndola en %, la tira (unas 12 veces más baja que el marco) dibujaba
    // un arco 12 veces más plano y parecía recta bajo un marco curvado.
    assert.match(shared, /--clb-bow:\s*calc\(3cqw \/ 1\.85\)/);
    assert.match(shared, /clip-path:\s*var\(--clb-curve\)/);
    // El carrusel es el contexto de tamaño que da sentido a los cqw (1cqw = 1% de
    // su ancho), de modo que marco y reflejo comparten la misma medida.
    assert.match(css, /\.clb-showcase\s*\{[^}]*container-type:\s*inline-size;/);
    // El marco comba sus dos bordes horizontales hacia dentro con esa flecha.
    assert.match(frameBox, /--clb-curve:\s*polygon\(\s*0 0,/);
    assert.match(frameBox, /50% var\(--clb-bow\)/); // arco superior
    assert.match(frameBox, /100% 0,\s*100% 100%/); // right side stays straight
    assert.match(frameBox, /50% calc\(100% - var\(--clb-bow\)\)/); // arco inferior
    assert.match(frameBox, /0 100%\s*\)/); // left side stays straight
    // La tira cuelga de esa misma curva. Su caja está volteada (scaleY(-1)), así
    // que el borde inferior del polígono es el SUPERIOR visible y copia la
    // parábola del marco invertida (1 - 4x(1-x): 0.64, 0.36, 0.16, 0.04 y 0):
    // toca el techo de la caja en el centro y baja una flecha en las esquinas,
    // igual que el borde inferior del marco sube hasta su vértice en el centro.
    assert.match(reflBox, /--clb-curve:\s*polygon\(\s*0 calc\(100% - var\(--clb-bow\)\),\s*10% calc\(100% - var\(--clb-bow\) \* 0\.64\),/);
    assert.match(reflBox, /50% 100%,/); // el centro, pegado al marco
    assert.match(reflBox, /100% calc\(100% - var\(--clb-bow\)\),\s*100% 0,\s*0 0\s*\)/);
    // Sube la caja esa misma flecha para que el hueco con la curva del marco sea
    // siempre el margin-top de 0.35rem, en el centro igual que en las esquinas.
    assert.match(reflBox, /margin-top:\s*calc\(0\.35rem - var\(--clb-bow\)\);/);
    // Y el degradado se mantiene opaco hasta esa flecha —lo que el recorte se come
    // en las esquinas— para que la tira brille igual a lo largo de toda la curva.
    assert.match(reflBox,
        /mask-image:\s*linear-gradient\(to top, rgba\(0, 0, 0, 0\.85\) 0, rgba\(0, 0, 0, 0\.85\) var\(--clb-bow\), transparent 85%\);/);
    // Respaldo sin consultas de contenedor: no hay cqw, y la tira vuelve a su alto
    // fijo con el arco en % de su propio alto en vez de quedarse sin alto.
    assert.match(css, /@supports not \(container-type: inline-size\) \{[\s\S]*?\.clb-gallery-reflection \{\s*height:\s*clamp\(1\.1rem, 2\.8vw, 2rem\);\s*margin-top:\s*0\.35rem;/);
});

test("gallery stacks between intro and features on mobile and stays still with reduced motion", () => {
    assert.match(css, /grid-template-areas:\s*"intro"\s*"showcase"\s*"side"/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.clb-gallery-track, \.clb-reflection-track\s*\{\s*animation:\s*none;\s*transform:\s*none;/);
});
