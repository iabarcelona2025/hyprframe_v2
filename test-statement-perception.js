/* SYNTHETIC PERCEPTION: la escena 3D del statement, comprobada sin GPU.

   Dos mitades:
   1) La geometría y el guion, que son matemática pura y se pueden ejecutar en
      Node tal cual: determinismo, estados de origen e híbrido, orden de las
      fases, continuidad y reversibilidad de la cámara.
   2) El ciclo de vida en la página, con un WebGL de mentira: que haya un único
      dibujo por frame, que fuera de pantalla no se dibuje, que el scroll mande
      en el avance, que «reducir movimiento» deje un fotograma fijo y que al
      perder el contexto no quede un bucle suelto.

   Ejecutar: node test-statement-perception.js   (04/10/2026) */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const root = __dirname;
const source = fs.readFileSync(`${root}/statement-perception.js`, "utf8");
const css = fs.readFileSync(`${root}/styles.css`, "utf8");
const api = require(`${root}/statement-perception.js`);

let failures = 0;
const check = (name, condition, extra = "") => {
    console.log(`${condition ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!condition) failures++;
};

/* ── 1. Geometría determinista ────────────────────────────────────────────── */
const sceneA = api.buildScene("desktop");
const sceneB = api.buildScene("desktop");
check("la escena es reproducible: misma semilla, mismos vértices",
    sceneA.lineCount === sceneB.lineCount && sceneA.lineData.every((v, i) => v === sceneB.lineData[i]),
    `${sceneA.lineCount} segmentos`);
check("cada segmento lleva sus dos estados (origen e híbrido) en el mismo vértice",
    sceneA.lineData.length === sceneA.lineCount * api.FLOATS);
check("ningún valor es NaN o infinito (una sola línea rota arrastra toda la malla)",
    sceneA.lineData.every(Number.isFinite) && sceneA.planeData.every(Number.isFinite));
const groups = new Set();
for (let o = 0; o < sceneA.lineData.length; o += api.FLOATS) groups.add(sceneA.lineData[o + 11]);
check("los cuatro sistemas están presentes (origen, visión, inteligencia, pórtico)",
    [0, 1, 2, 3].every((g) => groups.has(g)), [...groups].join(" "));

const mobile = api.buildScene("mobile");
check("el móvil no es la escena de escritorio encogida: tiene menos geometría",
    mobile.lineCount < sceneA.lineCount * 0.7, `${mobile.lineCount} vs ${sceneA.lineCount}`);
check("la densidad de escritorio se mantiene en un solo buffer razonable",
    sceneA.lineCount > 1200 && sceneA.lineCount < 9000, `${sceneA.lineCount} segmentos`);

// El mapa híbrido es continuo: dos puntos vecinos no pueden acabar lejos (si
// lo hicieran, las líneas se romperían al interpolar).
let worst = 0;
const out1 = [0, 0, 0], out2 = [0, 0, 0];
for (let i = 0; i < 400; i++) {
    const x = Math.sin(i * 1.7) * 40, y = Math.cos(i * 2.3) * 24, z = -4 - (i % 90);
    api.hybridMap(x, y, z, out1);
    api.hybridMap(x + 0.05, y + 0.05, z + 0.05, out2);
    worst = Math.max(worst, Math.hypot(out1[0] - out2[0], out1[1] - out2[1], out1[2] - out2[2]));
}
check("el mapa híbrido es continuo: un paso pequeño no salta", worst < 1.2, `salto máximo ${worst.toFixed(3)}`);

// El núcleo (la tercera geometría) nace colapsado en el germen.
let coreSegments = 0, coreSpan = 0;
for (let o = 0; o < sceneA.lineData.length; o += api.FLOATS) {
    const sa = Math.hypot(sceneA.lineData[o], sceneA.lineData[o + 1], sceneA.lineData[o + 2]);
    const hb = Math.hypot(sceneA.lineData[o + 8], sceneA.lineData[o + 9], sceneA.lineData[o + 10] + 20);
    if (sa < 0.4 && hb > 3) { coreSegments++; coreSpan = Math.max(coreSpan, hb); }
}
check("la escultura híbrida crece desde el punto de luz inicial",
    coreSegments > 60 && coreSpan > 8, `${coreSegments} segmentos, radio ${coreSpan.toFixed(1)}`);

/* ── 2. El guion: fases, continuidad y reversibilidad ─────────────────────── */
const at = (t) => api.stateAt(t, 1.78, false);
const origin = at(0.02), human = at(0.26), machine = at(0.46), synthesis = at(0.7), opening = at(0.95), end = at(1);

check("fase 1: sólo el germen y la perspectiva; ni bóveda ni retícula",
    origin.revealHuman < 0.05 && origin.revealAi === 0 && origin.revealOrigin > 0 && origin.morph === 0);
check("fase 2: la visión humana se construye antes que nada más",
    human.revealHuman > 0.4 && human.revealAi === 0 && human.morph === 0);
check("fase 3: la retícula entra desde otro eje y se va alineando",
    machine.revealAi > 0.2 && Math.abs(machine.aiOffset[0]) > 4 && machine.aiYaw > 0.05 && machine.morph === 0);
check("fase 3: la retícula acaba compartiendo el espacio exacto de la bóveda",
    Math.hypot(...synthesis.aiOffset) < 0.01 && Math.abs(synthesis.aiYaw) < 0.01);
check("fase 3: los contactos se encienden sólo en el cruce, no antes ni siempre",
    origin.contact === 0 && machine.contact > 0.1 && end.contact < machine.contact);
check("fase 4: la síntesis está en marcha y el espacio se reorganiza",
    synthesis.morph > 0.5 && synthesis.warp > 0.1);
check("fase 5: la estructura se abre, llega el pórtico y pasa una sola onda de luz",
    opening.open > 0.5 && opening.revealPortal > 0.7 && opening.waveAmp > 0.2 && at(0.5).waveAmp === 0);
check("final estable: a 1 todo está construido y la onda ya ha pasado",
    end.morph === 1 && end.open === 1 && end.revealPortal === 1 && end.waveAmp < 0.3);

// Continuidad: ningún parámetro puede dar un salto entre dos posiciones de
// scroll contiguas (un salto se vería como un corte en la animación).
const KEYS = ["seed", "revealOrigin", "revealHuman", "revealAi", "morph", "warp", "open", "revealPortal", "accent", "exposure"];
let jump = 0, jumpKey = "";
let camJump = 0;
for (let i = 1; i <= 1000; i++) {
    const a = at((i - 1) / 1000), b = at(i / 1000);
    for (const key of KEYS) {
        const d = Math.abs(b[key] - a[key]);
        if (d > jump) { jump = d; jumpKey = key; }
    }
    camJump = Math.max(camJump, Math.hypot(b.eye[0] - a.eye[0], b.eye[1] - a.eye[1], b.eye[2] - a.eye[2]));
}
check("el guion es continuo: ningún parámetro salta entre dos pasos de scroll",
    jump < 0.02, `salto máximo ${jump.toFixed(4)} en ${jumpKey}`);
check("la cámara no da tirones: avance suave en todo el recorrido",
    camJump < 0.1, `${camJump.toFixed(4)} unidades por milésima`);

// Reversibilidad: el estado depende sólo de t, así que subir devuelve
// exactamente el mismo fotograma.
const forward = at(0.63), backward = at(0.63);
check("subir reconstruye el mismo estado: el guion no acumula historia",
    KEYS.every((key) => forward[key] === backward[key])
    && forward.eye.every((v, i) => v === backward.eye[i]));

// La cámara nunca se mete dentro de la escultura.
let nearest = Infinity;
for (let i = 0; i <= 200; i++) {
    const s = at(i / 200);
    nearest = Math.min(nearest, Math.hypot(s.eye[0], s.eye[1], s.eye[2] + 20));
}
check("la cámara se acerca pero nunca atraviesa la escultura", nearest > 24, `${nearest.toFixed(1)} unidades`);

// Dirección de arte responsive: el móvil no es un recorte del escritorio.
const wide = api.stateAt(0.7, 1.78, false), tall = api.stateAt(0.7, 0.52, true);
check("dirección de arte vertical propia: otro encuadre y otra composición",
    tall.fov > wide.fov && tall.shiftX === 0 && tall.shiftY !== wide.shiftY);
check("en pantalla ancha la escultura se aparta del titular",
    wide.shiftX < -0.1);

/* ── 3. Integración con la página (HTML y CSS) ────────────────────────────── */
for (const page of ["index.html", "es/index.html"]) {
    const html = fs.readFileSync(`${root}/${page}`, "utf8");
    const doc = new JSDOM(html).window.document;
    const section = doc.querySelector("section.statement");
    const host = section.querySelector(".perception");
    check(`${page}: el escenario vive dentro de la sección del statement`, !!host);
    check(`${page}: el lienzo queda por detrás del titular y fuera del árbol accesible`,
        host.getAttribute("aria-hidden") === "true"
        && !!host.querySelector("canvas.perception-canvas")
        && host.compareDocumentPosition(doc.getElementById("statementText")) === 4);
    check(`${page}: el titular conserva su marcado palabra a palabra`,
        doc.getElementById("statementText").textContent.replace(/\s+/g, " ").trim()
        === (page.startsWith("es/")
            ? "Sintetizando la visión humana y la inteligencia artificial para construir nuevas realidades visuales."
            : "Synthesizing human vision and artificial intelligence to construct new visual realities."));
    check(`${page}: el renderer se carga aplazado, sin dependencias externas`,
        /<script src="statement-perception\.js\?v=\d+" defer><\/script>/.test(html)
        && !/three|gsap|cdn\./i.test(html.split("<body")[1] || ""));
}

const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector) => {
    const start = flat.indexOf(`${selector} {`);
    return start === -1 ? "" : flat.slice(start, flat.indexOf("}", start) + 1);
};
check("la sección gana recorrido propio sin tocar nada más",
    /\.statement \{[^}]*--perception-runway: 260svh;[^}]*min-height: calc\(100svh \+ var\(--perception-runway\)\)/s.test(flat));
check("el recorte no rompe el anclaje: overflow clip, no un contenedor de scroll",
    /\.statement \{[^}]*overflow: clip;/s.test(flat));
check("el escenario se ancla y no ocupa sitio en el flujo",
    /position: sticky/.test(rule(".perception")) && /margin-bottom: -100svh/.test(rule(".perception")));
check("el titular se queda quieto por delante del lienzo",
    /\.statement-text \{[^}]*position: sticky;[^}]*z-index: 1;/s.test(flat));
check("el lienzo no intercepta el puntero", /pointer-events: none/.test(rule(".perception")));
check("hay un velo que protege la lectura del titular",
    /radial-gradient/.test(rule(".perception-veil")));
check("sin WebGL no queda un lienzo vacío",
    /\.perception\.is-unsupported \.perception-canvas,\s*\.perception\.is-lost \.perception-canvas \{ display: none; \}/.test(flat));
check("con «reducir movimiento» la sección recupera su alto y suelta el anclaje",
    /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.statement \{\s*min-height: 0;/s.test(flat)
    && /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.statement-text \{ position: static;/s.test(flat));
check("hay dirección de arte propia para móvil",
    /@media \(max-width: 820px\) \{[^@]*--perception-runway: 170svh/s.test(flat));

/* ── 4. Ciclo de vida con un WebGL de mentira ─────────────────────────────── */
function boot({ supported = true, reduced = false, instanced = true } = {}) {
    const html = fs.readFileSync(`${root}/index.html`, "utf8");
    const dom = new JSDOM(html, { url: "https://hyprframe.com/", runScripts: "outside-only", pretendToBeVisual: true });
    const w = dom.window;
    const state = { y: 0, now: 0, raf: null, queued: 0, cancelled: 0, draws: 0, uniforms: {}, intersect: null };
    const media = (query) => ({
        matches: query.includes("reduced-motion") ? reduced : false,
        media: query, addEventListener(_, fn) { this.changed = fn; }, removeEventListener() {},
    });
    const queries = {};
    w.matchMedia = (query) => (queries[query] = queries[query] || media(query));
    Object.defineProperty(w, "scrollY", { configurable: true, get: () => state.y });
    Object.defineProperty(w, "innerHeight", { configurable: true, get: () => 900 });
    Object.defineProperty(w, "innerWidth", { configurable: true, get: () => 1600 });
    Object.defineProperty(w, "devicePixelRatio", { configurable: true, get: () => 2 });
    w.performance.now = () => state.now;
    w.requestAnimationFrame = (cb) => { state.raf = cb; state.queued++; return state.queued; };
    w.cancelAnimationFrame = () => { state.cancelled++; state.raf = null; };
    w.IntersectionObserver = class { constructor(fn) { state.intersect = fn; } observe() {} disconnect() {} };
    w.ResizeObserver = class { observe() {} disconnect() {} };

    const gl = new Proxy({}, {
        get(_, key) {
            if (key === "drawArraysInstanced") return instanced ? () => { state.draws++; } : undefined;
            if (key === "getExtension") return (name) => (name === "ANGLE_instanced_arrays" ? { drawArraysInstancedANGLE: () => { state.draws++; }, vertexAttribDivisorANGLE() {} } : null);
            if (key === "getShaderParameter" || key === "getProgramParameter") return (_o, p) => (p === "ACTIVE_UNIFORMS" || p === "ACTIVE_ATTRIBUTES" ? 0 : true);
            if (key === "getActiveUniform" || key === "getActiveAttrib") return () => ({ name: "x" });
            if (key === "getAttribLocation") return () => 0;
            if (key === "getUniformLocation") return (_p, name) => name;
            if (key === "createShader" || key === "createProgram" || key === "createBuffer") return () => ({});
            if (key === "drawArrays") return () => { state.draws++; };
            if (key === "uniform1f") return (location, value) => { state.uniforms[location] = value; };
            if (key === "VERTEX_SHADER" || key === "FRAGMENT_SHADER") return 1;
            return () => {};
        },
    });
    w.HTMLCanvasElement.prototype.getContext = () => (supported ? gl : null);
    const section = w.document.getElementById("statement");
    const host = section.querySelector(".perception");
    // Geometría de mentira: la sección mide 3,6 pantallas y su escenario una.
    section.getBoundingClientRect = () => ({ top: -state.y, height: 900 * 3.6, bottom: 900 * 3.6 - state.y, left: 0, right: 1600, width: 1600 });
    host.getBoundingClientRect = () => ({ top: 0, height: 900, width: 1600, left: 0, right: 1600, bottom: 900 });

    w.eval(source);
    const tick = (ms = 16.7) => { state.now += ms; const cb = state.raf; state.raf = null; if (cb) cb(state.now); };
    const scrollTo = (y) => { state.y = y; w.dispatchEvent(new w.Event("scroll")); };
    return { w, state, host, tick, scrollTo };
}

{
    const page = boot({ supported: false });
    check("sin WebGL: la sección se marca como no soportada y no se dibuja nada",
        page.host.classList.contains("is-unsupported") && page.state.draws === 0 && page.state.queued === 0);
    page.w.close();
}
{
    const page = boot({ instanced: false });
    check("WebGL 1 con instanciado por extensión: la escena también se dibuja",
        page.host.classList.contains("is-ready"));
    page.w.close();
}
{
    const page = boot();
    check("al arrancar hay un fotograma y el lienzo se declara listo",
        page.host.classList.contains("is-ready") && page.state.queued >= 1);
    page.state.intersect([{ isIntersecting: true }]);
    for (let i = 0; i < 40; i++) page.tick();
    const settledDraws = page.state.draws;
    page.tick();
    check("en reposo no queda ni un rAF pendiente: la sección no consume GPU",
        page.state.draws === settledDraws, `${page.state.draws} dibujos`);

    // Un scroll largo: el avance llega amortiguado pero alcanza su destino.
    page.scrollTo(900 * 2.6);
    for (let i = 0; i < 200; i++) page.tick();
    check("el avance sigue al scroll hasta el final del recorrido y se detiene",
        page.state.raf === null);
    const drawsAfter = page.state.draws;
    page.scrollTo(0);
    for (let i = 0; i < 200; i++) page.tick();
    check("subir vuelve a dibujar: la secuencia es reversible",
        page.state.draws > drawsAfter);

    // Fuera de pantalla no se dibuja.
    const before = page.state.draws;
    page.state.intersect([{ isIntersecting: false }]);
    page.scrollTo(900);
    check("fuera del viewport no se pide ni un frame", page.state.draws === before && page.state.raf === null);

    // Pérdida de contexto: ni bucle ni lienzo en blanco.
    page.state.intersect([{ isIntersecting: true }]);
    page.host.querySelector("canvas").dispatchEvent(new page.w.Event("webglcontextlost", { cancelable: true }));
    check("al perder el contexto se detiene el bucle y se retira el lienzo",
        page.host.classList.contains("is-lost") && page.state.raf === null);
    page.w.close();
}
{
    const page = boot({ reduced: true });
    for (let i = 0; i < 60; i++) page.tick();
    const draws = page.state.draws;
    page.scrollTo(900 * 2);
    for (let i = 0; i < 20; i++) page.tick();
    check("«reducir movimiento»: una composición fija, inmune al scroll",
        page.state.draws === draws && page.state.raf === null, `${page.state.draws} dibujos`);
    page.w.close();
}

check("ni una dependencia nueva: WebGL nativo y nada más",
    !/require\(|import |three|gsap/.test(source.replace(/module\.exports[\s\S]*?;/, "")) );

console.log(failures ? `\n❌ ${failures} FAILURE(S)` : "\n✅ ALL PASS");
process.exit(failures ? 1 : 0);
