/* Nav activo (scroll-spy de script.js §2b): en el landing, el apartado en el
   que estás se ilumina en el menú superior —solo en escritorio, donde el nav
   está a la vista—. Se ejecuta el script real contra el index real en jsdom,
   con una maqueta de posiciones y un scroll simulados, para poder afirmar
   exactamente cuándo se enciende cada enlace.

   Lo que se fija aquí:
   - El enlace se enciende cuando su sección cruza la línea de lectura (35% de
     la ventana) y se apaga al salir; el hero no enciende nada.
   - Al final del documento manda el último apartado, aunque su inicio no llegue
     a cruzar la línea (Contact es corta).
   - Solo hay un enlace encendido a la vez y se escribe con aria-current, el
     mismo atributo que legacy.html usa para «Captured».
   - «Captured» (legacy.html) no se enciende nunca en el landing, y el menú
     burger no se toca: el resaltado es solo del nav de escritorio.
   - Al pulsar un enlace, ese manda mientras la inercia llega (sin parpadeos por
     los apartados que se cruzan), y la rueda/teclado devuelven el mando.
   - En móvil/tablet no se marca nada, y al salir de escritorio se apaga.
   - Funciona igual en las dos landings (EN y ES).
   (04/10/2026) */
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const HTML = fs.readFileSync(path.join(root, "index.html"), "utf8");
const HTML_ES = fs.readFileSync(path.join(root, "es", "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};

/* Maqueta: dónde empieza cada sección en el documento. Contact queda pegada al
   final (400px de alto) a propósito: su inicio nunca cruza la línea del 35%, así
   que solo puede encenderse por la regla de «fin del documento». */
const TOPS = { work: 2000, about: 3600, services: 5200, clb: 6400, contact: 7600 };
const DOC_HEIGHT = 8000;
const INNER_H = 800;
const INNER_W = 1440;
const LINE = 0.35 * INNER_H;            // 280px
const MAX_Y = DOC_HEIGHT - INNER_H;     // 7200px

function boot({ pagina = "index.html", desktop = true } = {}) {
    const dom = new JSDOM(pagina === "index.html" ? HTML : HTML_ES, {
        url: "https://hyprframe.com/" + (pagina === "index.html" ? "" : pagina),
        pretendToBeVisual: true,
        runScripts: "outside-only",
    });
    const { window } = dom;
    const doc = window.document;
    const state = { y: 0, desktop, observers: [] };

    window.matchMedia = (q) => ({
        // getter: la ventana puede cambiar de tamaño a mitad del test
        get matches() { return q.includes("min-width: 1025px") ? state.desktop : false; },
        media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    window.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }], this), 5); }
        unobserve() {} disconnect() {}
    };
    window.ResizeObserver = class {
        constructor(cb) { this.cb = cb; state.observers.push(cb); }
        observe() {} unobserve() {} disconnect() {}
    };
    window.Image = class { set src(v) { this._src = v; } get src() { return this._src; } };
    window.EventSource = class { constructor() {} };

    Object.defineProperty(window, "scrollY", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "pageYOffset", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => INNER_H });
    Object.defineProperty(window, "innerWidth", { configurable: true, get: () => INNER_W });
    Object.defineProperty(doc.documentElement, "scrollHeight", { configurable: true, get: () => DOC_HEIGHT });
    Object.defineProperty(doc.documentElement, "clientHeight", { configurable: true, get: () => INNER_H });

    doc.documentElement.classList.add("hf-skip-intro");   // sin intro: arranque directo
    window.eval(js);

    // Las secciones del nav tienen posición; el resto de elementos conserva los
    // rects a cero de jsdom, como en el resto de tests.
    const original = window.Element.prototype.getBoundingClientRect;
    window.Element.prototype.getBoundingClientRect = function () {
        const top = TOPS[this.id];
        if (top === undefined) return original.call(this);
        const t = top - state.y;
        return { x: 0, y: t, top: t, left: 0, right: INNER_W, bottom: t + 400, width: INNER_W, height: 400, toJSON() {} };
    };

    const remeasure = () => {
        state.observers.forEach((cb) => cb());
        window.dispatchEvent(new window.Event("resize"));
    };
    const scrollToY = (y) => { state.y = y; window.dispatchEvent(new window.Event("scroll")); };
    const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
    const activeHref = () => {
        const on = [...doc.querySelectorAll(".main-nav [aria-current]")];
        return on.length === 0 ? null : (on.length === 1 ? on[0].getAttribute("href") : `!${on.length}`);
    };
    const legacyMarked = () => [...doc.querySelectorAll('.main-nav a[href*="legacy"][aria-current]')].length;
    const clickNav = (href) => {
        const link = doc.querySelector(`.main-nav a[href="${href}"]`);
        link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    };

    remeasure();   // el script midió con los rects a cero; ahora ya hay maqueta
    return { window, doc, state, remeasure, scrollToY, wait, activeHref, legacyMarked, clickNav };
}

const GEN = "#work", ABOUT = "#about", SERVICES = "#services", CLB = "#clb", CONTACT = "#contact";

/* ── 1. CSS: el apartado activo se distingue solo por el color del texto ─── */
{
    check("CSS: el apartado activo pasa a blanco, sin subrayado",
        /\.main-nav \[aria-current="location"\] \{ color: var\(--fg\); \}/.test(css) &&
        !/\.main-nav[^{}]*::after/.test(css));
    check("CSS: los rollovers del menú superior no dibujan líneas de color",
        !/\.main-nav a::after|\.main-nav a:hover::after|\.main-nav \.nav-cta::after/.test(css));
    check("CSS: el rollover amplía la palabra unos 3px sin desplazar los enlaces vecinos",
        /\.main-nav a\s*\{[^}]*transform-origin:\s*center;[^}]*transition:[^;]*transform/.test(css) &&
        /\.main-nav a:hover\s*\{ color: var\(--fg\); transform: scale\(1\.24\); \}/.test(css));
    check("la franja de avance ya no existe en las landings, estilos ni script",
        !HTML.includes("scroll-progress") && !HTML_ES.includes("scroll-progress") &&
        !css.includes("scroll-progress") && !js.includes("scrollProgress"));
    check("el selector de idioma no muestra el icono de globo en escritorio ni móvil",
        !/\.header-meta > \.lang-switch::before/.test(css) &&
        !/\.menu-lang \.lang-switch::before/.test(css));
}

/* ── 2. El enlace se enciende cuando su sección cruza la línea ────────────── */
(async () => {
    const page = boot();
    check("al principio (hero) no hay nada encendido", page.activeHref() === null);

    // Generado empieza en 2000: la línea (scroll + 280) lo alcanza en 1720.
    page.scrollToY(1700);
    await page.wait();
    check("justo antes de cruzar la línea, todavía nada", page.activeHref() === null,
        `scroll 1700 → línea ${1700 + LINE}`);
    page.scrollToY(1730);
    await page.wait();
    check("al cruzar la línea se enciende Generated", page.activeHref() === GEN);

    page.scrollToY(3600 - LINE + 20);
    await page.wait();
    check("al cruzar About, se enciende About", page.activeHref() === ABOUT);
    page.scrollToY(5200 - LINE + 20);
    await page.wait();
    check("al cruzar DNAi, se enciende DNAi", page.activeHref() === SERVICES);
    page.scrollToY(6400 - LINE + 20);
    await page.wait();
    check("al cruzar CLB, se enciende CLB", page.activeHref() === CLB);

    // Contact (7600) nunca cruza la línea: como máximo está en 7480.
    page.scrollToY(MAX_Y - 200);
    await page.wait();
    check("a 200px del final todavía manda CLB", page.activeHref() === CLB);
    page.scrollToY(MAX_Y);
    await page.wait();
    check("al final del documento se enciende Contact (aunque su inicio no cruce la línea)",
        page.activeHref() === CONTACT);

    // Y al volver arriba se apaga todo otra vez.
    page.scrollToY(0);
    await page.wait();
    check("de vuelta al hero, se apaga", page.activeHref() === null);

    /* Solo un enlace a la vez y solo el nav de escritorio */
    let maxOn = 0, legacy = 0;
    for (const y of [0, 500, 1700, 1730, 3000, 3900, 5400, 6700, 7200]) {
        page.scrollToY(y);
        await page.wait();
        maxOn = Math.max(maxOn, page.doc.querySelectorAll(".main-nav [aria-current]").length);
        legacy += page.legacyMarked();
    }
    check("nunca hay más de un enlace encendido", maxOn === 1);
    check("«Captured» (legacy.html) no se enciende en el landing", legacy === 0);
    check("el menú burger no se toca (solo el nav de escritorio)",
        page.doc.querySelectorAll(".menu-links [aria-current]").length === 0);

    /* ── 3. El clic manda mientras la inercia llega ───────────────────────── */
    const click = boot();
    click.clickNav(CLB);
    check("al pulsar CLB se enciende al momento, sin esperar al scroll",
        click.activeHref() === CLB);
    click.scrollToY(3600);            // de camino, en zona de About
    await click.wait();
    check("mientras viaja, el resaltado no parpadea por los apartados del camino",
        click.activeHref() === CLB);
    click.scrollToY(6200);            // ya en CLB: la posición y el clic coinciden
    await click.wait();
    click.scrollToY(5000);            // y al seguir, vuelve a mandar la posición
    await click.wait();
    check("al llegar, la posición recupera el mando", click.activeHref() === SERVICES);

    /* La rueda devuelve el mando antes de llegar */
    const wheel = boot();
    wheel.clickNav(CONTACT);
    wheel.scrollToY(3000);
    await wheel.wait();
    check("con el clic recién hecho, sigue mandando el clic", wheel.activeHref() === CONTACT);
    wheel.window.dispatchEvent(new wheel.window.WheelEvent("wheel", { deltaY: 100, bubbles: true }));
    await wheel.wait();
    check("al mover la rueda, manda la posición", wheel.activeHref() === GEN,
        `scroll 3000 → ${GEN}`);

    /* ── 4. Solo escritorio ───────────────────────────────────────────────── */
    const mobile = boot({ desktop: false });
    for (const y of [0, 2000, 4000, 6000, MAX_Y]) {
        mobile.scrollToY(y);
        await mobile.wait();
    }
    check("móvil/tablet: no se enciende nada (el nav está en el burger)",
        mobile.activeHref() === null);

    const leaving = boot();
    leaving.scrollToY(6200);
    await leaving.wait();
    check("escritorio: CLB encendido", leaving.activeHref() === CLB);
    leaving.state.desktop = false;                       // el usuario estrecha la ventana
    leaving.scrollToY(6200);
    await leaving.wait();
    check("al salir de escritorio se apaga el resaltado", leaving.activeHref() === null);

    /* ── 5. Las dos landings (EN y ES) ────────────────────────────────────── */
    const es = boot({ pagina: "es/index.html" });
    es.scrollToY(3600 - LINE + 20);
    await es.wait();
    const esLink = es.doc.querySelector('.main-nav [aria-current]');
    check("la landing ES también se ilumina (BIO en #about)",
        !!esLink && esLink.getAttribute("href") === ABOUT && esLink.textContent.trim() === "BIO");
    es.scrollToY(MAX_Y);
    await es.wait();
    check("landing ES: al final se enciende Contacto",
        (es.doc.querySelector(".main-nav [aria-current]") || {}).textContent === "Contacto");

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
})();
