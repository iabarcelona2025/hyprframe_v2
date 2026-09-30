/* Statement de la landing («Synthesizing human vision…» / su versión en
   español): el encendido deja de ser palabra a palabra para ser un barrido
   continuo, de letra en letra. Se ejecuta el script.js real contra el index
   real en jsdom, con reloj virtual y geometría falsa, para poder afirmar cosas
   exactas que en un navegador headless no se pueden medir.

   Lo que se fija aquí:
   - El texto se reparte en letras (un <span> por letra, con las clases de su
     palabra) sin perder ni duplicar un solo carácter.
   - Cada letra lleva su grado de encendido en --lit, continuo de 0 a 1.
   - El frente de luz avanza con un degradado: siempre hay letras a medio
     encender y el salto entre letras contiguas nunca supera una letra del
     degradado (nada de escalones por palabra).
   - El valor que se pinta va amortiguado: un salto de scroll no llega de golpe
     al texto, y el amortiguado es el mismo por segundo a 60 y a 120 Hz.
   - Cuando el barrido se asienta no queda ni un rAF pendiente.
   - Con «reducir movimiento» no se reparte nada y el CSS deja el texto ya
     encendido, con su violeta.
   - El color del acento se mezcla con el blanco según --lit (color-mix), en
     lugar de entrar de golpe al terminar la palabra.
   (30/09/2026) */
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const js = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

/* Los CSS llevan comentarios con la fecha de cada ajuste: se limpian antes de
   leer una declaración. */
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

/* Las dos landings que llevan el statement: la inglesa y su copia española. */
const PAGES = ["index.html", "es/index.html"];

/* Geometría de mentira: la sección del statement empieza en y = 2000 y mide 900
   de alto, así que su rect.top es 2000 - scroll. Con innerHeight = 800, el
   barrido arranca (rect.top = 680) en y = 1320 y termina (rect.top = -115,
   incluye el 35 % del alto de la sección) en y = 2115. */
const VIEWPORT = 800;
const SECTION_TOP = 2000;
const SECTION_H = 900;
const SWEEP_FROM = SECTION_TOP - VIEWPORT * 0.85;
const SWEEP_TO = SECTION_TOP + VIEWPORT * (0.85 - 0.25) + SECTION_H * 0.35;

/* Arranca la landing (o su copia española) con reloj virtual, scroll de mentira
   y la sección del statement colocada a mano. */
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
    // Ningún observer entra en escena: así el único rAF en danza es el del
    // statement (el log del hero, los reveals y los contadores no se encienden).
    window.IntersectionObserver = class { constructor() {} observe() {} unobserve() {} disconnect() {} };
    window.Image = class { set src(v) { this._src = v; } get src() { return this._src; } };
    window.ResizeObserver = class { observe() {} disconnect() {} };

    Object.defineProperty(window, "scrollY", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "pageYOffset", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => VIEWPORT });
    Object.defineProperty(window, "innerWidth", { configurable: true, get: () => 1440 });

    // Reloj virtual: rAF y performance.now() comparten la misma línea de tiempo.
    window.performance.now = () => state.now;
    window.requestAnimationFrame = (cb) => { state.queue.push(cb); return state.queue.length; };
    window.cancelAnimationFrame = () => {};

    const section = doc.getElementById("statement");
    if (section) {
        section.getBoundingClientRect = () => ({
            top: SECTION_TOP - state.y, bottom: SECTION_TOP - state.y + SECTION_H,
            height: SECTION_H, width: 1440, left: 0, right: 1440, x: 0, y: SECTION_TOP - state.y,
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
    /* Un scroll real: mueve la página, avisa al script y deja pasar un frame
       para que el aviso se despache (como el navegador con su rAF). */
    const scrollTo = (y, ms = 16.7) => {
        state.y = y;
        window.dispatchEvent(new window.Event("scroll"));
        step(ms);
    };
    return { window, doc, state, step, frames, scrollTo };
}

const spansOf = (page) => [...page.doc.querySelectorAll("#statementText span")];
const valuesOf = (page) => spansOf(page).map((span) => parseFloat(span.style.getPropertyValue("--lit")));
const textOf = (page) => squash(page.doc.getElementById("statementText").textContent);

/* El texto de partida, sin scripts: con él se comprueba que el reparto en
   letras no pierde ni duplica nada y que en el HTML las palabras siguen
   enteras (el reparto es cosa del script, no del marcado). */
const pristine = {};
for (const pagina of PAGES) {
    const doc = new JSDOM(fs.readFileSync(path.join(root, pagina), "utf8")).window.document;
    pristine[pagina] = {
        text: squash(doc.getElementById("statementText").textContent),
        words: [...doc.querySelectorAll("#statementText span")].map((span) => span.textContent),
    };
}

/* ── 1. El reparto en letras ──────────────────────────────────────────────── */
for (const pagina of PAGES) {
    const page = boot({ pagina });
    const spans = spansOf(page);
    const chars = spans.map((span) => span.textContent).join("");
    check(`${pagina}: el statement se reparte en letras (${spans.length})`,
        spans.length > 40 && spans.every((span) => span.textContent.length === 1),
        `${spans.length} spans, ${spans.filter((s) => s.textContent.length === 1).length} de una letra`);
    check(`${pagina}: no se pierde ni se duplica un carácter`,
        textOf(page) === pristine[pagina].text && chars === pristine[pagina].text.replace(/\s/g, ""),
        `${textOf(page).length} caracteres`);
    check(`${pagina}: las palabras violeta conservan su clase letra a letra`,
        spans.filter((span) => span.classList.contains("accent")).length > 5 &&
        spans.filter((span) => span.classList.contains("accent")).every((span) => span.classList.contains("italic")));
    check(`${pagina}: en el HTML las palabras siguen enteras (el reparto lo hace el script)`,
        pristine[pagina].words.join(" ") === pristine[pagina].text,
        pristine[pagina].words.join("|"));
}

/* ── 2. El barrido: continuo, con degradado y de delante hacia atrás ──────── */
{
    const page = boot();
    page.frames(3);                       // primer frame: se coloca de golpe
    check("fuera de pantalla (antes de entrar): ninguna letra encendida",
        valuesOf(page).every((v) => v === 0), `scroll ${page.state.y}`);

    page.scrollTo(SWEEP_FROM - 400);
    page.frames(3);
    check("justo antes de arrancar: sigue todo apagado", valuesOf(page).every((v) => v === 0));

    page.scrollTo((SWEEP_FROM + SWEEP_TO) / 2);   // mitad del recorrido
    page.frames(60);                              // deja asentar el amortiguado
    const middle = valuesOf(page);
    const lit = middle.filter((v) => v === 1).length;
    const half = middle.filter((v) => v > 0 && v < 1).length;
    check("a mitad de recorrido hay letras encendidas, a medio encender y apagadas",
        lit > 5 && half >= 2 && lit + half < middle.length,
        `${lit} encendidas · ${half} a medio encender · ${middle.length - lit - half} apagadas`);
    check("el encendido va de delante hacia atrás (monótono, sin saltos)",
        middle.every((v, i, all) => i === 0 || v <= all[i - 1] + 1e-9));
    const spread = middle.length / 16;            // letras que abarca el frente (SPREAD de script.js)
    const jumps = middle.slice(1).map((v, i) => Math.abs(v - middle[i]));
    check("el frente es un degradado, no un escalón (salto de ~1/SPREAD entre letras)",
        Math.max(...jumps) <= 1 / spread + 0.002, // 0,002 = margen del redondeo a 3 decimales al escribir
        `salto máximo ${Math.max(...jumps).toFixed(3)} (1/SPREAD = ${(1 / spread).toFixed(3)})`);
    check("el degradado mide lo que tiene que medir (ni escalón ni fundido eterno)",
        half >= Math.floor(spread) - 1 && half <= Math.ceil(spread) + 1,
        `${half} letras a medio encender para SPREAD = ${spread.toFixed(1)}`);

    page.scrollTo(SWEEP_TO + 200);
    page.frames(60);
    check("pasada la sección: todas encendidas", valuesOf(page).every((v) => v === 1));

    page.scrollTo((SWEEP_FROM + SWEEP_TO) / 2);
    page.frames(60);
    const back = valuesOf(page);
    check("al volver hacia arriba el texto se apaga igual de continuo",
        back.every((v, i, all) => v <= all[i === 0 ? 0 : i - 1] + 1e-9) &&
        back.some((v) => v > 0 && v < 1) && back[0] > back[back.length - 1],
        `primera ${back[0].toFixed(2)} · última ${back[back.length - 1].toFixed(2)}`);
}

/* ── 3. Suavizado: el scroll no llega de golpe al texto ───────────────────── */
{
    const page = boot();
    page.frames(3);
    page.scrollTo(SWEEP_TO + 200);        // salto de golpe al final del barrido
    const first = valuesOf(page)[0];
    check("un salto de scroll no enciende la primera letra en un solo frame",
        first > 0 && first < 0.6, `--lit ${first.toFixed(3)} tras un frame`);
    const samples = [first];
    for (let i = 0; i < 5; i++) { page.step(); samples.push(valuesOf(page)[0]); }
    check("y sube de forma progresiva, frame a frame",
        samples.every((v, i) => i === 0 || v > samples[i - 1]), samples.map((v) => v.toFixed(2)).join(" → "));
    page.frames(60);
    check("acaba llegando al objetivo", valuesOf(page).every((v) => v === 1));
}

/* ── 4. El amortiguado es el mismo por segundo a 60 y a 120 Hz ────────────── */
{
    // 24 frames de 16,7 ms y 48 de 8,35 ms: los mismos 400 ms de barrido.
    const run = (ms, n) => {
        const page = boot();
        page.frames(3, ms);
        page.step(30);                    // mismo hueco desde el último frame
        page.state.y = SWEEP_TO + 200;
        page.window.dispatchEvent(new page.window.Event("scroll"));
        page.frames(n, ms);
        return valuesOf(page);
    };
    const at60 = run(16.7, 24);
    const at120 = run(8.35, 48);
    const gap = Math.max(...at60.map((v, i) => Math.abs(v - at120[i])));
    check("la misma curva con reloj de 60 y de 120 Hz (comparado a igual tiempo)",
        Math.abs(at60[0] - at120[0]) < 0.01 && gap < 0.01,
        `60Hz ${at60[0].toFixed(3)} vs 120Hz ${at120[0].toFixed(3)} (Δ${gap.toFixed(4)})`);
}

/* ── 5. En reposo no queda ningún rAF pendiente ───────────────────────────── */
{
    const page = boot();
    page.frames(3);
    page.scrollTo(SWEEP_TO + 200);
    page.frames(60);
    page.frames(10);                      // frames de sobra, ya asentado
    check("con el barrido asentado no queda ni un rAF pendiente",
        page.state.queue.length === 0, `${page.state.queue.length} callbacks pendientes`);
    page.scrollTo(0);
    page.frames(60);
    check("y vuelve a arrancar en cuanto la sección se mueve (y se para otra vez)",
        valuesOf(page).every((v) => v === 0) && page.state.queue.length === 0);
}

/* ── 6. Reducir movimiento: nada de barrido, texto encendido ──────────────── */
{
    const page = boot({ reduced: true });
    const spans = spansOf(page);
    check("«reducir movimiento»: el texto no se reparte en letras (se lee igual que siempre)",
        spans.map((span) => span.textContent).join(" ") === pristine["index.html"].text,
        spans.map((s) => s.textContent).join("|"));
    page.scrollTo(SWEEP_TO + 200);
    page.frames(10);
    check("«reducir movimiento»: no se escribe ni un --lit ni se pide un frame",
        valuesOf(page).every((v) => Number.isNaN(v)) && page.state.queue.length === 0);
    const reducedBlock = flatCss.slice(flatCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    check("«reducir movimiento»: el CSS deja el texto encendido de una vez",
        /\.statement-text span \{ --lit: 1; opacity: 1; \}/.test(reducedBlock));
}

/* ── 7. El CSS del barrido ───────────────────────────────────────────────── */
{
    check("--lit está registrada como <number> (para calc() y color-mix())",
        /@property --lit \{ syntax: "<number>"; inherits: false; initial-value: 0; \}/.test(flatCss));
    check("la opacidad de cada letra se interpola con --lit",
        declaration(ruleOf(".statement-text span"), "opacity") === "calc(0.14 + 0.86 * var(--lit, 0))",
        declaration(ruleOf(".statement-text span"), "opacity"));
    check("el violeta del acento llega mezclado con el blanco según el encendido",
        declaration(ruleOf(".statement-text span.accent"), "color") === "color-mix(in srgb, var(--violet) calc(var(--lit, 0) * 100%), var(--fg))",
        declaration(ruleOf(".statement-text span.accent"), "color"));
    check("sin transición de CSS: el suavizado lo pone el script, no un reinicio por frame",
        !/\.statement-text span \{[^}]*transition:/.test(flatCss));
    check("no quedan restos del encendido por clase (.lit) ni en el CSS ni en el script",
        !/\.statement-text span\.lit/.test(flatCss) && !/classList\.toggle\("lit"/.test(js) && !/"lit"/.test(js));
}

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
