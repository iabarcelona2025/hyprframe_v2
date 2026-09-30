/* Marco de la marca (anagrama) en la sección ABOUT de la landing: el picto
   cierra el bloque por la derecha y sale del negro al entrar en pantalla, con
   una perspectiva de cámara. Se ejecuta el script.js real contra el index real
   en jsdom, con reloj virtual y geometría falsa, para poder afirmar cosas
   exactas que un navegador headless no permite medir.

   Lo que se fija aquí:
   - El marcado existe en las dos landings, es decorativo (aria-hidden, sin alt),
     y el activo es el anagrama real (mismo picto del repo, con transparencia).
   - El encendido va en --frame-dark, de 1 (dentro del negro) a 0 (fuera).
   - El marco se coloca de golpe al cargar (sin transición) y después sigue al
     scroll amortiguado: no salta en un frame y la curva es la misma por segundo
     a 60 y a 120 Hz.
   - La clase .emerging solo está viva mientras viaja: en reposo el CSS deja el
     marco limpio (sin transformación ni filtro) y no queda ni un rAF pendiente.
   - Con «reducir movimiento» no se escribe nada ni se pide un frame.
   (30/09/2026) */
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const js = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const squash = (text) => text.replace(/\s+/g, " ").trim();
const flatCss = squash(stripComments(css));
const ruleOf = (selector) => {
    const start = flatCss.indexOf(`${selector} {`);
    return start === -1 ? "" : flatCss.slice(start, flatCss.indexOf("}", start) + 1);
};
const declaration = (rule, property) => {
    const match = rule.match(new RegExp(`(?:^|[;{]\\s*)${property}: ([^;]+);`));
    return match ? match[1] : "";
};

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};

const PAGES = ["index.html", "es/index.html"];

/* Geometría de mentira: el marco mide 44 × 254 (1/5,77 como el picto) y su caja
   arranca en y = 3000. Con innerHeight = 800, la salida del negro va de
   rect.top = 784 (apenas asoma) a rect.top = 344 (a media pantalla):
   --frame-dark pasa de 1 a 0 entre esos dos puntos. */
const VIEWPORT = 800;
const MARK_TOP = 3000;
const MARK_W = 44;
const MARK_H = 254;
const FROM = MARK_TOP - VIEWPORT * 0.98;                       // y = 2216
const TO = MARK_TOP - VIEWPORT * 0.98 + VIEWPORT * 0.55;       // y = 2656

function boot({ pagina = "index.html", reduced = false } = {}) {
    const fuente = fs.readFileSync(path.join(root, pagina), "utf8");
    const dom = new JSDOM(fuente, { url: `https://hyprframe.com/${pagina}`, pretendToBeVisual: true, runScripts: "outside-only" });
    const { window } = dom;
    const doc = window.document;
    const state = { y: 0, now: 0, queue: [] };

    window.matchMedia = (q) => ({
        matches: reduced && q.includes("reduced-motion"),
        media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    // Ningún observer entra en escena: el único rAF en danza es el del marco.
    window.IntersectionObserver = class { constructor() {} observe() {} unobserve() {} disconnect() {} };
    window.Image = class { set src(v) { this._src = v; } get src() { return this._src; } };
    window.ResizeObserver = class { observe() {} disconnect() {} };

    Object.defineProperty(window, "scrollY", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "pageYOffset", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => VIEWPORT });
    Object.defineProperty(window, "innerWidth", { configurable: true, get: () => 1440 });

    window.performance.now = () => state.now;
    window.requestAnimationFrame = (cb) => { state.queue.push(cb); return state.queue.length; };
    window.cancelAnimationFrame = () => {};

    const mark = doc.querySelector(".about-frame");
    if (mark) {
        mark.getBoundingClientRect = () => ({
            top: MARK_TOP - state.y, bottom: MARK_TOP - state.y + MARK_H,
            height: MARK_H, width: MARK_W, left: 1400, right: 1400 + MARK_W,
            x: 1400, y: MARK_TOP - state.y,
        });
    }

    window.eval(js);   // script.js

    const step = (ms = 16.7) => {
        state.now += ms;
        const pending = state.queue;
        state.queue = [];
        pending.forEach((cb) => cb(state.now));
    };
    const frames = (n, ms = 16.7) => { for (let i = 0; i < n; i++) step(ms); };
    const scrollTo = (y, ms = 16.7) => {
        state.y = y;
        window.dispatchEvent(new window.Event("scroll"));
        step(ms);
    };
    const dark = () => parseFloat(mark.style.getPropertyValue("--frame-dark"));
    return { window, doc, state, step, frames, scrollTo, mark, dark };
}

/* ── 1. El marcado, en las dos landings ──────────────────────────────────── */
for (const pagina of PAGES) {
    const doc = new JSDOM(fs.readFileSync(path.join(root, pagina), "utf8")).window.document;
    const mark = doc.querySelector(".about-grid > .about-frame");
    const img = mark && mark.querySelector("img");
    const noise = mark && mark.querySelector(".about-frame-noise");
    check(`${pagina}: el marco cierra el .about-grid (tercera columna, tras las cifras)`,
        !!mark && mark === doc.querySelector(".about-grid").lastElementChild &&
        mark.previousElementSibling.classList.contains("stats"));
    check(`${pagina}: es decorativo (fuera del árbol de accesibilidad, sin texto alternativo)`,
        mark.getAttribute("aria-hidden") === "true" && img.getAttribute("alt") === "");
    check(`${pagina}: apunta al anagrama del repo, con sus medidas y carga diferida`,
        img.getAttribute("src") === "assets/images/anagrama-trans.png" &&
        img.getAttribute("width") === "360" && img.getAttribute("height") === "2078" &&
        img.getAttribute("loading") === "lazy" && !!noise);
    check(`${pagina}: el archivo del anagrama existe en el repo`,
        fs.existsSync(path.join(root, "assets/images/anagrama-trans.png")));
}

/* ── 2. El activo: el picto de la marca, con transparencia y su proporción ── */
{
    const bytes = fs.readFileSync(path.join(root, "assets/images/anagrama-trans.png"));
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    check("el anagrama es PNG de 360 × 2078 (2× el picto del repo, proporción 1:5,77)",
        width === 360 && height === 2078 && Math.abs(height / width - 5.77) < 0.01,
        `${width} × ${height} (1:${(height / width).toFixed(2)})`);
    check("declara transparencia (color type 6: RGBA) para poder recortar el ruido a su silueta",
        bytes[25] === 6, `color type ${bytes[25]}`);
    check("pesa menos de 40 KB (17,9 KB reales)", bytes.length < 40 * 1024, `${Math.round(bytes.length / 1024)} KB`);
}

/* ── 3. La salida del negro sigue al scroll ───────────────────────────────── */
{
    const page = boot();
    page.frames(3);
    check("al cargar, con la sección muy por debajo: dentro del negro (--frame-dark = 1)",
        page.dark() === 1 && page.state.queue.length === 0, `${page.dark()}`);

    page.scrollTo(FROM);
    page.frames(3);
    check("cuando el marco apenas asoma: todavía dentro del negro", page.dark() === 1);

    page.scrollTo(TO);
    page.frames(60);
    check("a media pantalla: del todo fuera (--frame-dark = 0)", page.dark() === 0);

    page.scrollTo(FROM + (TO - FROM) * 0.5);
    page.frames(60);
    const half = page.dark();
    check("a mitad de recorrido: a mitad de salida", half > 0.2 && half < 0.8, `--frame-dark ${half.toFixed(2)}`);

    page.scrollTo(FROM + (TO - FROM) * 0.25);
    page.frames(60);
    const quarter = page.dark();
    check("el recorrido es continuo y monótono (más cerca = menos negro)",
        quarter > half && half > 0, `${quarter.toFixed(2)} → ${half.toFixed(2)} → 0`);
}

/* ── 4. Amortiguado: no salta en un frame y es igual a 60 y a 120 Hz ──────── */
{
    const page = boot();
    page.frames(3);
    page.scrollTo(TO);                    // salto de golpe al final del recorrido
    const first = page.dark();
    check("un salto de scroll no saca el marco del negro en un solo frame",
        first > 0.6 && first < 1, `--frame-dark ${first.toFixed(3)} tras un frame`);
    const samples = [first];
    for (let i = 0; i < 5; i++) { page.step(); samples.push(page.dark()); }
    check("y baja de forma progresiva, frame a frame",
        samples.every((v, i) => i === 0 || v < samples[i - 1]), samples.map((v) => v.toFixed(2)).join(" → "));
    page.frames(60);
    check("acaba llegando al objetivo (fuera del todo)", page.dark() === 0);

    const run = (ms, n) => {
        const p = boot();
        p.frames(3, ms);
        p.step(30);
        p.state.y = TO;
        p.window.dispatchEvent(new p.window.Event("scroll"));
        p.frames(n, ms);                  // los mismos ~167 ms de salida
        return p.dark();
    };
    // El primer frame tras un arranque asume 16 ms (centinela del script), así
    // que se comparan tiempos iguales: 16 + 9 × 16,7 ms = 16 + 18 × 8,35 ms.
    const at60 = run(16.7, 10);
    const at120 = run(8.35, 19);
    check("la misma curva a 60 y a 120 Hz", Math.abs(at60 - at120) < 0.01,
        `60Hz ${at60.toFixed(3)} vs 120Hz ${at120.toFixed(3)}`);
}

/* ── 5. .emerging solo mientras viaja; en reposo, nada pendiente ──────────── */
{
    const page = boot();
    page.frames(3);
    check("dentro del negro y quieto: sin .emerging (el CSS deja el marco limpio)",
        !page.mark.classList.contains("emerging") && page.state.queue.length === 0);

    page.scrollTo(TO);
    check("en mitad de la salida: con .emerging y el bucle vivo",
        page.mark.classList.contains("emerging") && page.state.queue.length > 0);
    page.frames(60);
    check("ya fuera: sin .emerging y sin ningún rAF pendiente",
        !page.mark.classList.contains("emerging") && page.state.queue.length === 0);
}

/* ── 6. «Reducir movimiento» ─────────────────────────────────────────────── */
{
    const page = boot({ reduced: true });
    page.frames(3);
    check("«reducir movimiento»: no se escribe --frame-dark ni se pide un frame",
        page.mark.style.getPropertyValue("--frame-dark") === "" && page.state.queue.length === 0);
    page.scrollTo(TO);
    page.frames(10);
    check("«reducir movimiento»: el marco se queda quieto y limpio",
        page.mark.style.getPropertyValue("--frame-dark") === "" &&
        !page.mark.classList.contains("emerging") && page.state.queue.length === 0);
    const reducedBlock = flatCss.slice(flatCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    check("«reducir movimiento»: el CSS deja el marco nítido y sin ruido",
        /\.about-frame img \{ transform: none; opacity: 1; filter: none; \}/.test(reducedBlock) &&
        /\.about-frame-noise \{ opacity: 0; \}/.test(reducedBlock));
}

/* ── 7. El CSS de la colocación y de la salida del negro ─────────────────── */
{
    check("el about-grid abre la tercera columna para el marco",
        declaration(ruleOf(".about-grid"), "grid-template-columns") === "1.2fr 1fr auto");
    check("--frame-dark está registrada como <number> y hereda (la leen el img y el ruido)",
        /@property --frame-dark \{ syntax: "<number>"; inherits: true; initial-value: 0; \}/.test(flatCss));
    const transform = declaration(ruleOf(".about-frame.emerging img"), "transform");
    check("la salida es una perspectiva de cámara: acercarse, enderezarse y escalar hasta 1",
        transform.includes("perspective(900px)") &&
        transform.includes("rotateY(calc(38deg * var(--frame-dark)))") &&
        transform.includes("rotateX(calc(-9deg * var(--frame-dark)))") &&
        transform.includes("scale(calc(1 - 0.32 * var(--frame-dark)))"),
        transform);
    check("el marco nace desenfocado y casi transparente, y se aclara al salir",
        declaration(ruleOf(".about-frame.emerging img"), "filter") === "blur(calc(7px * var(--frame-dark)))" &&
        declaration(ruleOf(".about-frame.emerging img"), "opacity") === "calc(1 - 0.94 * var(--frame-dark))");
    check("el ruido de dentro es el mismo tile del grano del sitio, recortado a la silueta del marco",
        /\.grain \{[^}]*feTurbulence/.test(flatCss) &&
        declaration(ruleOf(".about-frame-noise"), "background-image") ===
            declaration(ruleOf(".grain"), "background-image") &&
        declaration(ruleOf(".about-frame-noise"), "mask-image") === 'url("assets/images/anagrama-trans.png")' &&
        declaration(ruleOf(".about-frame-noise"), "mix-blend-mode") === "screen");
    const clean = declaration(ruleOf(".about-frame img"), "transform");
    check("el marco en reposo es una imagen limpia (el CSS base no transforma ni filtra nada)",
        clean === "" && declaration(ruleOf(".about-frame img"), "filter") === "" &&
        declaration(ruleOf(".about-frame img"), "opacity") === "");
}

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
