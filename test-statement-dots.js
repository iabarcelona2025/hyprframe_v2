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
   - La transparencia respira al azar entre 93% (0,35) y 80% (1): cada tramo
     dura 450–2000 ms como mucho (nunca más de 2 s) y las duraciones y los
     destinos cambian de un tramo a otro. Con «reducir movimiento» no hay
     respiración: la retícula se queda al 93%.
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

function boot({ pagina = "index.html", reduced = false, breathing = false } = {}) {
    const fuente = fs.readFileSync(path.join(root, pagina), "utf8");
    const dom = new JSDOM(fuente, { url: `https://hyprframe.com/${pagina}`, pretendToBeVisual: true, runScripts: "outside-only" });
    const { window } = dom;
    const doc = window.document;
    const state = { y: 0, now: 0, queue: [] };

    window.matchMedia = (q) => ({
        matches: reduced && q.includes("reduced-motion"),
        media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    // Con breathing, el observer sí avisa —pero solo del statement— para poder
    // probar el bucle de opacidad; el resto del script se queda sin observers,
    // igual que en test-statement.js.
    window.IntersectionObserver = breathing
        ? class {
            constructor(cb) { this.cb = cb; window.__observers = window.__observers || []; window.__observers.push(this); }
            observe(target) {
                this.target = target;
                if (target && target.id === "statement") this.cb([{ target, isIntersecting: true }], this);
            }
            unobserve() {} disconnect() {}
        }
        : class { constructor() {} observe() {} unobserve() {} disconnect() {} };
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
    check("la capa se pinta al alfa máximo del patrón y la opacidad la pone --hf-dot-strength",
        declaration(rule, "opacity") === "var(--hf-dot-strength, 0.35)",
        declaration(rule, "opacity"));
    check("el alfa máximo del patrón es 0,20 (80% de transparencia)",
        /rgba\(255, 255, 255, 0\.2\)/.test(flatCss));
    check("0,20 × 0,35 = 0,07: el reposo sigue siendo el 93% de siempre",
        Math.abs(0.2 * 0.35 - 0.07) < 1e-9);
    check("el script está cacheado con la versión nueva",
        PAGES.every((p) => /script\.js\?v=67/.test(fs.readFileSync(path.join(root, p), "utf8"))));
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

/* ── 5. La transparencia respira al azar (93% ↔ 80%) ─────────────────────── */
{
    const page = boot({ breathing: true });
    const section = page.doc.getElementById("statement");
    const strengthOf = () => parseFloat(section.style.getPropertyValue("--hf-dot-strength"));

    check("al arrancar la opacidad está en 0,35 (93% de transparencia)",
        strengthOf() === 0.35, `${strengthOf()}`);

    const samples = [];
    for (let i = 0; i < 2400; i++) {          // ~40 s de reloj virtual
        page.frames(1);
        samples.push({ t: page.state.now, v: strengthOf() });
    }
    const values = samples.map((sample) => sample.v);

    check("la opacidad nunca se sale del rango 0,35 – 1 (93% – 80% de transparencia)",
        values.every((v) => v >= 0.35 - 1e-9 && v <= 1 + 1e-9),
        `${Math.min(...values).toFixed(3)} – ${Math.max(...values).toFixed(3)}`);
    check("llega a los dos extremos de verdad (93% y 80%)",
        Math.min(...values) <= 0.351 && Math.max(...values) >= 0.999,
        `${Math.min(...values).toFixed(3)} – ${Math.max(...values).toFixed(3)}`);
    check("los valores intermedios existen (fundido, no saltos)",
        values.filter((v) => v > 0.36 && v < 0.99).length > 200);
    // Tramos = recorridos monótonos entre dos cambios de sentido. Como cada
    // transición va de un extremo al otro, un tramo es exactamente una
    // transición: del primer frame en que el valor se mueve al último.
    const moves = [];
    let startT = null, lastChangeT = null, dir = 0, prev = samples[0].v;
    for (const sample of samples.slice(1)) {
        const delta = sample.v - prev;
        if (delta !== 0) {
            const sign = Math.sign(delta);
            if (dir === 0) startT = sample.t;
            else if (sign !== dir) {                 // cambio de sentido: cierra el tramo
                moves.push(lastChangeT - startT);
                startT = sample.t;
            }
            dir = sign;
            lastChangeT = sample.t;
        }
        prev = sample.v;
    }
    check("hay varios pulsos (la retícula respira todo el rato)", moves.length >= 8, `${moves.length} pulsos`);
    check("ninguna transición pasa de 2 s",
        moves.every((ms) => ms <= 2000 + 34), `la más larga ${Math.round(Math.max(...moves))} ms`);
    check("la duración también es aleatoria (no todas iguales)",
        new Set(moves.map((ms) => Math.round(ms / 50))).size >= 3,
        moves.slice(0, 6).map((ms) => Math.round(ms) + " ms").join(", "));
    check("entre pulso y pulso hay un respiro aleatorio (no un metrónomo)",
        new Set(moves.map((ms) => Math.round(ms / 100))).size >= 3,
        `${new Set(moves.map((ms) => Math.round(ms / 50))).size} duraciones distintas`);

    // Fuera de pantalla el bucle se para: no queda ni un rAF pendiente.
    const observer = page.window.__observers.find((o) => o.target && o.target.id === "statement");
    observer.cb([{ target: observer.target, isIntersecting: false }], observer);
    page.frames(3);
    check("al salir la sección de pantalla el bucle se para (sin rAF pendientes)",
        page.state.queue.length === 0);
}

/* ── 6. «Reducir movimiento»: la retícula no respira ─────────────────────── */
{
    const page = boot({ breathing: true, reduced: true });
    page.frames(120);
    const section = page.doc.getElementById("statement");
    check("«reducir movimiento»: no se escribe --hf-dot-strength (se queda al 93%)",
        section.style.getPropertyValue("--hf-dot-strength") === "" &&
        page.state.queue.length === 0);
}

console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
