/* Scroll con inercia (sección 11 de script.js): qué se activa, cómo se mueve y
   qué NO debe cambiar. Se ejecuta el script real contra el index real en jsdom,
   con reloj y scroll simulados, para poder afirmar cosas exactas que el
   navegador headless no permite medir (allí el rAF va a ~1 fps).

   Lo que se fija aquí:
   - Se activa solo con puntero fino y sin «reducir movimiento»; ?smooth=0 lo apaga.
   - La rueda acumula destino y el recorrido se reparte en frames, frenando.
   - La inercia es la misma por segundo a 60 y a 120 Hz (normalizada por tiempo).
   - Un scroll que no escribimos nosotros (barra, teclado nativo, anclas del
     navegador) toma el mando y resincroniza el destino.
   - Teclado y anclas del documento usan la misma inercia.
   - Cuando está activo, el CSS deja de animar los saltos de ancla y el vídeo del
     hero pausa su «respiración» mientras se desplaza.
   (30/09/2026) */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "script.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};

/* Arranca la landing con un reloj virtual y un scroll de mentira. */
function boot({ url = "https://hyprframe.com/", touch = false, reduced = false, height = 6000, innerH = 800 } = {}) {
    const dom = new JSDOM(html, { url, pretendToBeVisual: true, runScripts: "outside-only" });
    const { window } = dom;
    const doc = window.document;
    const state = { y: 0, now: 0, queue: [] };

    window.matchMedia = (q) => ({
        matches: (touch && q.includes("pointer: coarse")) || (reduced && q.includes("reduced-motion")),
        media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    window.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }], this), 5); }
        unobserve() {} disconnect() {}
    };
    window.Image = class { set src(v) { this._src = v; } get src() { return this._src; } };
    window.EventSource = class { constructor() {} };

    Object.defineProperty(window, "scrollY", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "pageYOffset", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => innerH });
    Object.defineProperty(window, "innerWidth", { configurable: true, get: () => 1440 });
    Object.defineProperty(doc.documentElement, "scrollHeight", { configurable: true, get: () => height });
    Object.defineProperty(doc.documentElement, "clientHeight", { configurable: true, get: () => innerH });

    // scrollTo escribe la posición y avisa como haría el navegador (async, pero
    // aquí basta con el aviso inmediato: el handler está gateado por rAF).
    window.scrollTo = (x, y) => {
        state.y = typeof x === "object" && x !== null ? x.top : y;
        window.dispatchEvent(new window.Event("scroll"));
    };
    // Reloj virtual: rAF y performance.now() comparten la misma línea de tiempo.
    window.requestAnimationFrame = (cb) => { state.queue.push(cb); return state.queue.length; };
    window.cancelAnimationFrame = () => {};
    window.performance.now = () => state.now;

    window.eval(js);
    const step = (ms = 16.7) => {
        state.now += ms;
        const pending = state.queue;
        state.queue = [];
        pending.forEach((cb) => cb(state.now));
    };
    const frames = (n, ms = 16.7) => { for (let i = 0; i < n; i++) step(ms); };
    const wheel = (deltaY, target = doc.body) => {
        const ev = new window.WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
        target.dispatchEvent(ev);
        return ev;
    };
    const setExternalScroll = (y) => {
        state.y = y;
        window.dispatchEvent(new window.Event("scroll"));
    };
    return { window, doc, state, step, frames, wheel, setExternalScroll };
}

const smoothEnabled = (page) => page.doc.documentElement.classList.contains("hf-smooth");

/* ── 1. Se activa solo donde debe ─────────────────────────────────────────── */
{
    const on = boot();
    check("escritorio: activa html.hf-smooth", smoothEnabled(on));

    check("táctil: no secuestra el scroll", !smoothEnabled(boot({ touch: true })));
    check("«reducir movimiento»: no secuestra el scroll", !smoothEnabled(boot({ reduced: true })));
    check("?smooth=0: apagado",
        !smoothEnabled(boot({ url: "https://hyprframe.com/?smooth=0" })));
    check("?smooth=0 con más parámetros: apagado",
        !smoothEnabled(boot({ url: "https://hyprframe.com/?intro=0&smooth=0" })));
    check("?smooth=1 no cambia nada: sigue activo en escritorio",
        smoothEnabled(boot({ url: "https://hyprframe.com/?smooth=1" })));
}

/* ── 2. La rueda acumula destino y el movimiento se reparte en frames ─────── */
{
    const page = boot();
    const ev = page.wheel(1200);
    check("la rueda se consume (preventDefault)", ev.defaultPrevented);
    page.step();                       // primer frame
    check("mientras se desplaza marca html.is-scrolling",
        page.doc.documentElement.classList.contains("is-scrolling"));
    const afterOne = page.state.y;
    check("tras un frame ya se ha movido, sin saltar al destino",
        afterOne > 0 && afterOne < 1200, `y=${Math.round(afterOne)}px de 1200px`);

    const deltas = [];
    let settledAt = -1;
    for (let i = 0; i < 140; i++) {
        const before = page.state.y;
        page.step();
        deltas.push(page.state.y - before);
        if (settledAt === -1 && Math.abs(page.state.y - 1200) < 0.5) settledAt = i + 1;
    }
    const moving = deltas.filter((d) => d > 0);
    check("el recorrido ocupa varios frames (inercia)", moving.length >= 10, `${moving.length} frames moviendo`);
    check("frena progresivamente", moving[0] > moving[moving.length - 1],
        `${Math.round(moving[0])}px → ${Math.round(moving[moving.length - 1])}px`);
    check("siempre hacia delante", deltas.every((d) => d >= 0));
    check("llega al destino exacto", Math.abs(page.state.y - 1200) < 1, `y=${page.state.y.toFixed(2)}`);
    // A 60 fps, 1200px se asientan en ~1 s: el mismo orden que Lenis con lerp 0.1
    check("se asienta en ~1 s a 60 fps", settledAt > 40 && settledAt < 80, `frame ${settledAt} (${Math.round(settledAt * 16.7)}ms)`);
}

/* ── 3. Dos impulsos seguidos suman destino (como el scroll nativo) ────────── */
{
    const page = boot();
    page.wheel(800);
    page.frames(3);
    page.wheel(400);
    page.frames(60);
    check("los impulsos se acumulan", Math.abs(page.state.y - 1200) < 1, `y=${page.state.y.toFixed(2)}`);
}

/* ── 4. Misma velocidad real a 60 y a 120 Hz ──────────────────────────────── */
{
    const at60 = boot();
    at60.wheel(1500);
    at60.frames(18, 16.7);                    // ~300 ms
    const at120 = boot();
    at120.wheel(1500);
    at120.frames(36, 8.35);                   // los mismos 300 ms en el doble de frames
    const diff = Math.abs(at60.state.y - at120.state.y);
    check("la inercia se normaliza por tiempo (60 vs 120 Hz)", diff < 12,
        `60Hz ${at60.state.y.toFixed(1)}px vs 120Hz ${at120.state.y.toFixed(1)}px (Δ${diff.toFixed(1)})`);
}

/* ── 5. Un scroll ajeno manda: resincroniza ───────────────────────────────── */
{
    const page = boot();
    page.setExternalScroll(2500);             // barra lateral / buscar en la página
    page.frames(2);
    page.wheel(300);
    page.frames(60);
    check("un scroll externo resincroniza el destino",
        Math.abs(page.state.y - 2800) < 1, `y=${page.state.y.toFixed(2)} (esperado 2800)`);
}

/* ── 6. Teclado: mismos destinos, misma inercia ───────────────────────────── */
{
    const page = boot();
    const ev = new page.window.KeyboardEvent("keydown", { key: "PageDown", bubbles: true, cancelable: true });
    page.doc.body.dispatchEvent(ev);
    check("PageDown se gestiona y se consume", ev.defaultPrevented);
    page.frames(60);
    check("PageDown avanza ~0,9 pantallas", Math.abs(page.state.y - 720) < 1, `y=${page.state.y.toFixed(1)}`);

    const typing = boot();
    const input = typing.doc.createElement("input");
    typing.doc.body.appendChild(input);
    const ev2 = new typing.window.KeyboardEvent("keydown", { key: "PageDown", bubbles: true, cancelable: true });
    input.dispatchEvent(ev2);
    check("escribiendo en un campo, el teclado no se intercepta", !ev2.defaultPrevented);

    const end = boot();
    end.doc.body.dispatchEvent(new end.window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    end.frames(80);
    check("Fin lleva al final del documento", Math.abs(end.state.y - 5200) < 1, `y=${end.state.y.toFixed(1)}`);
}

/* ── 7. Anclas del documento: inercia y hash sin recargar ─────────────────── */
{
    const page = boot({ url: "https://hyprframe.com/index.html" });
    const link = page.doc.querySelector('a[href="#work"]');
    const ev = new page.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(ev);
    check("el clic en un ancla se consume (no salta)", ev.defaultPrevented);
    check("el hash se actualiza sin recargar", page.window.location.hash === "#work", page.window.location.hash);

    // En producción la landing vive en «/» y sus enlaces apuntan a index.html#work
    const root = boot({ url: "https://hyprframe.com/" });
    const enlace = root.doc.querySelector('a[href="#work"]');
    const ev2 = new root.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    const navLink = root.doc.createElement("a");
    navLink.setAttribute("href", "index.html#work");
    root.doc.body.appendChild(navLink);
    navLink.dispatchEvent(ev2);
    check("«/» e «index.html» cuentan como el mismo documento", ev2.defaultPrevented);

    // Con «reducir movimiento» no se toca: manda el navegador
    const reduced = boot({ reduced: true });
    const ev3 = new reduced.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    reduced.doc.querySelector('a[href="#work"]').dispatchEvent(ev3);
    check("con «reducir movimiento» el ancla no se secuestra", !ev3.defaultPrevented);
}

/* ── 8. El menú abierto y los paneles con scroll propio no se secuestran ──── */
{
    const page = boot();
    page.doc.body.classList.add("menu-open");
    const ev = page.wheel(600);
    check("con el menú abierto, la rueda no se secuestra", !ev.defaultPrevented);

    const panel = boot();
    const box = panel.doc.createElement("div");
    box.style.overflowY = "scroll";
    Object.defineProperty(box, "scrollHeight", { configurable: true, get: () => 1000 });
    Object.defineProperty(box, "clientHeight", { configurable: true, get: () => 200 });
    panel.doc.body.appendChild(box);
    const ev2 = panel.wheel(600, box);
    check("dentro de un panel con scroll propio, manda el nativo", !ev2.defaultPrevented);

    const flat = boot();
    const ev3 = new flat.window.WheelEvent("wheel", { deltaY: 0, deltaX: 120, bubbles: true, cancelable: true });
    flat.doc.body.dispatchEvent(ev3);
    check("un gesto horizontal (Shift+rueda) no se bloquea", !ev3.defaultPrevented);
    check("y no inicia animación", (flat.frames(5), flat.state.y === 0), `y=${flat.state.y}`);
}

/* ── 9. CSS que acompaña a la inercia ─────────────────────────────────────── */
{
    check("styles.css quita la animación nativa de anclas cuando hay inercia",
        /html\.hf-smooth \{ scroll-behavior: auto; \}/.test(css));
    check("styles.css pausa la respiración del vídeo mientras se desplaza",
        /html\.is-scrolling \.hero-video \{ animation-play-state: paused; \}/.test(css));
}

/* ── 10. Al asentarse, el vídeo del hero puede volver a respirar ─────────── */
(async () => {
    const page = boot();
    page.wheel(1200);
    page.frames(140);                    // la inercia ya terminó (reloj virtual)
    check("mientras dura la inercia sigue marcado html.is-scrolling",
        page.doc.documentElement.classList.contains("is-scrolling"));
    await new Promise((r) => setTimeout(r, 300));   // el reposo usa un temporizador real
    check("al asentarse retira html.is-scrolling (el vídeo vuelve a respirar)",
        !page.doc.documentElement.classList.contains("is-scrolling"));

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
})();
