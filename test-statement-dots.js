/* Retícula de puntos del statement («Synthesizing human vision…» / su versión
   en español): la textura se descubre desde el borde DERECHO conforme se baja
   por la sección. Se ejecuta el script.js real contra el index real en jsdom,
   con reloj virtual y geometría falsa, igual que test-statement.js.

   Lo que se fija aquí:
   - El CSS pone la retícula en un ::before bajo la viñeta (z-index -1) y le
     aplica una máscara horizontal con el frente en --dots-front.
   - El script escribe --dots-front en la sección: 100% (nada) cuando la
     sección aún no ha entrado, y baja hasta 0% (retícula entera) al pasar.
   - El frente es monótono al bajar y vuelve a subir al subir.
   - Sin JS, o con «reducir movimiento», la variable no se toca y el CSS deja
     la retícula entera (valor de reserva 0%).
   - En reposo no queda ningún rAF pendiente.
   (27/11/2026) */
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

/* Misma geometría de mentira que test-statement.js: la sección empieza en
   y = 2000 y mide 900. Con innerHeight = 800, el frente se queda cerrado
   hasta que el alto de la sección llega al 55% de la pantalla (rect.top = 440
   → y = 1560) y se abre del todo cuando el 35% de su alto ha pasado por
   arriba (y = 2315): el arranque va retrasado a propósito. */
const VIEWPORT = 800;
const SECTION_TOP = 2000;
const SECTION_H = 900;
const REVEAL_FROM = SECTION_TOP - VIEWPORT * 0.55;  // y = 1560 · el frente empieza a abrirse
const REVEAL_TO = SECTION_TOP + SECTION_H * 0.35;   // y = 2315 · la retícula está entera

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

    const section = doc.getElementById("statement");
    if (section) {
        section.getBoundingClientRect = () => ({
            top: SECTION_TOP - state.y, bottom: SECTION_TOP - state.y + SECTION_H,
            height: SECTION_H, width: 1440, left: 0, right: 1440, x: 0, y: SECTION_TOP - state.y,
        });
    }

    window.eval(js);

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
    return { window, doc, state, step, frames, scrollTo };
}

const frontOf = (page) => {
    const raw = page.doc.getElementById("statement").style.getPropertyValue("--dots-front");
    return raw === "" ? null : parseFloat(raw);
};

/* ── 1. El CSS de la capa ─────────────────────────────────────────────────── */
{
    const rule = ruleOf(".page-home .statement::before");
    check("la retícula vive en un ::before de la sección", rule !== "", rule.slice(0, 60));
    check("la capa va por debajo de la viñeta (z-index -1)", declaration(rule, "z-index") === "-1");
    check("la capa usa el patrón compartido --hf-dots", declaration(rule, "background-image") === "var(--hf-dots)");
    check("la retícula no se puede clicar ni seleccionar",
        declaration(rule, "pointer-events") === "none");
    const mask = declaration(rule, "-webkit-mask-image");
    check("la máscara descubre desde la derecha (negro pegado al borde derecho del frente)",
        /to right/.test(mask) && /#000 var\(--dots-front, 0%\)/.test(mask), mask);
    check("la máscara arranca con un borde suave (22% de franja)",
        /transparent calc\(var\(--dots-front, 0%\) - 22%\)/.test(mask), mask);
    check("la máscara tiene versión estándar y con prefijo para Safari",
        declaration(rule, "mask-image") === mask);
    check("sin JS el frente vale 0% (retícula entera, como antes)",
        /var\(--dots-front, 0%\)/.test(mask));
    check("las páginas de la landing son las que llevan .page-home",
        PAGES.every((p) => /<body class="page-home">/.test(fs.readFileSync(path.join(root, p), "utf8"))));
    check("el script está cacheado con la versión nueva",
        PAGES.every((p) => /script\.js\?v=66/.test(fs.readFileSync(path.join(root, p), "utf8"))));
}

/* ── 2. El frente sigue al scroll ────────────────────────────────────────── */
for (const pagina of PAGES) {
    const page = boot({ pagina });
    check(`${pagina}: al cargar se pide el frente (una vez por frame)`, page.state.queue.length >= 1);
    page.frames(2);

    check(`${pagina}: fuera de pantalla (arriba del todo) el frente está cerrado`,
        frontOf(page) === 100, `${frontOf(page)}%`);

    // La sección ya ha asomado 300px por abajo y el frente sigue cerrado:
    // el arranque no coincide con la entrada en pantalla.
    page.scrollTo(SECTION_TOP - VIEWPORT - 300);
    check(`${pagina}: con la sección ya asomando, el frente sigue cerrado (arranque retrasado)`,
        frontOf(page) === 100);
    page.scrollTo(REVEAL_FROM - 40);
    check(`${pagina}: justo antes del arranque, cerrado`, frontOf(page) === 100);

    page.scrollTo((REVEAL_FROM + REVEAL_TO) / 2);
    const middle = frontOf(page);
    check(`${pagina}: a mitad de recorrido el frente está a medio abrir`,
        middle > 20 && middle < 80, `${middle}%`);

    page.scrollTo(REVEAL_TO + 200);
    check(`${pagina}: pasada la sección la retícula está entera`, frontOf(page) === 0);

    // Vuelta: el frente se cierra otra vez, como el barrido del texto.
    page.scrollTo((REVEAL_FROM + REVEAL_TO) / 2);
    check(`${pagina}: al subir el frente se cierra de nuevo`, frontOf(page) > 20 && frontOf(page) < 80);
}

/* ── 3. Monotonía, pasos y reposo ────────────────────────────────────────── */
{
    const page = boot();
    page.frames(2);
    const series = [];
    for (let y = REVEAL_FROM - 200; y <= REVEAL_TO + 200; y += 40) {
        page.scrollTo(y);
        series.push(frontOf(page));
    }
    check("bajando, el frente nunca retrocede (los puntos solo se suman)",
        series.every((v, i, all) => i === 0 || v <= all[i - 1]),
        series.slice(0, 8).map((v) => v + "%").join(" → "));
    check("el frente termina abierto del todo", series[series.length - 1] === 0);
    check("el frente se mueve en pasos de 0,5% (no se reescribe el DOM por frame)",
        series.every((v) => Number.isInteger(v * 2)));
    page.frames(200);   // deja asentar también el amortiguado del texto
    check("en reposo no queda ningún rAF pendiente", page.state.queue.length === 0);

    // Un scroll que no cambia el frente no vuelve a tocar el DOM.
    const before = page.doc.getElementById("statement").getAttribute("style");
    page.scrollTo(REVEAL_TO + 240);
    page.frames(1);
    check("quieto dentro del mismo paso, el estilo no se reescribe",
        page.doc.getElementById("statement").getAttribute("style") === before);
}

/* ── 4. Reducir movimiento ───────────────────────────────────────────────── */
{
    const page = boot({ reduced: true });
    page.frames(2);
    page.scrollTo(REVEAL_TO + 200);
    page.frames(2);
    check("«reducir movimiento»: no se toca --dots-front (la retícula se queda entera y quieta)",
        frontOf(page) === null && page.state.queue.length === 0);
}

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
