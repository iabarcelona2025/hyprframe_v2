/* Recorrido horizontal del listado de proyectos en escritorio: la sección
   Generated/WORK se queda fija y avanza por los 10 proyectos hacia la derecha
   al hacer scroll, y se libera cuando el último queda a la vista para que el
   scroll vertical siga hacia About. Se ejecuta el script real contra el HTML
   real en jsdom, con la maqueta falsa que jsdom no trae (anchos, alturas,
   offsetLeft y rects), para poder afirmar cosas exactas que un navegador
   headless no permite medir.

   Lo que se fija aquí:
   - Solo se activa en escritorio (≥1025px) y sin «reducir movimiento»; en
     móvil/tablet, sin JavaScript o con esa preferencia queda la lista vertical.
   - El carril no arranca con el primer píxel: el primer tramo (HOLD, 16%) la
     sección está fija y N.O.D.E. quieto a la vista; después el recorrido se
     reparte 1:1 dentro de lo que queda. Al soltarse, el carril está al final
     (-run) sin pasarse, con RYUU centrada en la ventana.
   - El raíl enciende el proyecto en curso y termina en 10.
   - Los paneles quedan colocados de una vez (la cascada de entrada de la lista
     vertical no se cruza con el recorrido horizontal).
   - El teclado lleva el scroll al tramo del proyecto que recibe el foco.
   - Al hacer clic en el carril la fila no crece en vertical (el panel mide la
     ventana); en la lista vertical se conserva el crecimiento de siempre.
   - El bloque de CSS solo vive dentro de @supports (overflow-x: clip): sin
     clip, el overflow-x de html/body/main sería un contenedor de scroll y el
     sticky no pegaría.
   - El degradado lila de la caja es suave y el mismo en la caja y en sus dos
     clones (el de salida de la landing y el de llegada de la ficha): es el
     mismo elemento visto en tres sitios y no puede cambiar de tono al hacer
     clic.
   (05/10/2026) */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");

const root = __dirname;
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const generado = fs.readFileSync(path.join(root, "generated.css"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

const INNER_H = 800;      // alto de ventana
const LIST_W = 1440;      // ancho de la ventana del carril
const PANEL_W = 806;      // 56vw de 1440 (el ancho de panel del CSS)
const TOP = 4000;         // dónde empieza la sección dentro del documento
const PANEL_H = 640;      // alto útil de la ventana del carril
const ROW_LEFT = 100;    // dónde empieza la caja medida (x del rect de la fila)
const N = 10;
// El carril se detiene con el ÚLTIMO proyecto centrado en la ventana.
const RUN = (N - 1) * PANEL_W + PANEL_W / 2 - LIST_W / 2;   // 6937 px
// Fracción del recorrido vertical en la que el carril aún no se mueve (N.O.D.E.
// se queda a la vista). Se lee del propio script para no duplicar el número.
const HOLD = Number(/const HOLD = ([\d.]+);/.exec(script)[1]);

function boot(page = "index.html", { desktop = true, reduced = false, listHeight = PANEL_H } = {}) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, page), "utf8"), {
        url: "https://hyprframe.com/",
        pretendToBeVisual: true,
        runScripts: "outside-only",
        virtualConsole: new VirtualConsole(),   // sin ruido de navegación al hacer clic
    });
    const { window } = dom;
    const doc = window.document;
    const state = { y: TOP, desktop, reduced, listHeight };

    window.matchMedia = (query) => ({
        get matches() {
            if (query.includes("prefers-reduced-motion")) return state.reduced;
            if (query.includes("min-width: 1025px")) return state.desktop;
            return false;
        },
        media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    window.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }], this), 5); }
        unobserve() {} disconnect() {}
    };
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.Image = class { set src(v) { this._src = v; } get src() { return this._src; } };
    window.EventSource = class { constructor() {} };

    Object.defineProperty(window, "scrollY", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "pageYOffset", { configurable: true, get: () => state.y });
    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => INNER_H });
    Object.defineProperty(window, "innerWidth", { configurable: true, get: () => LIST_W });
    Object.defineProperty(doc.documentElement, "scrollHeight", { configurable: true, get: () => TOP + INNER_H + RUN + 4000 });
    Object.defineProperty(doc.documentElement, "clientHeight", { configurable: true, get: () => INNER_H });
    window.scrollTo = (x, y) => { state.y = y; window.dispatchEvent(new window.Event("scroll")); };

    // ── maqueta falsa: el carril de 10 paneles de 806px dentro de una ventana de 1440 ──
    const section = doc.getElementById("work");
    const view = section.querySelector(".work-view");
    const list = doc.getElementById("workList");
    const track = doc.getElementById("workTrack");
    const rows = [...track.querySelectorAll(".work-row")];
    Object.defineProperty(list, "clientWidth", { get: () => LIST_W });
    Object.defineProperty(list, "clientHeight", { get: () => state.listHeight });   // alto del panel
    Object.defineProperty(view, "offsetHeight", { get: () => INNER_H });   // la pantalla pegada
    rows.forEach((row, index) => {
        Object.defineProperty(row, "offsetLeft", { get: () => index * PANEL_W });
        Object.defineProperty(row, "offsetWidth", { get: () => PANEL_W });
        const left = ROW_LEFT + index * PANEL_W;
        row.getBoundingClientRect = () => ({
            left, top: 120, width: PANEL_W, height: PANEL_H,
            right: left + PANEL_W, bottom: 120 + PANEL_H, x: left, y: 120, toJSON() {},
        });
    });
    Object.defineProperty(section, "offsetHeight", { get: () => INNER_H + RUN });
    section.getBoundingClientRect = () => ({
        top: TOP - state.y, bottom: TOP - state.y + INNER_H + RUN,
        left: 0, right: LIST_W, width: LIST_W, height: INNER_H + RUN, x: 0, y: TOP - state.y,
    });

    doc.documentElement.classList.add("hf-skip-intro");   // sin intro: arranque directo
    window.eval(script);

    const frame = () => new Promise((resolve) => setTimeout(resolve, 30));
    const scrollTo = (y) => { state.y = y; window.dispatchEvent(new window.Event("scroll")); };
    return { dom, window, doc, section, view, list, track, rows, state, frame, scrollTo };
}

const transformX = (track) => {
    const m = /translate3d\((-?[\d.]+)px/.exec(track.style.transform);
    return m ? Number(m[1]) : null;
};

test("CSS: el carril solo existe en escritorio y solo si el sticky puede pegar", () => {
    const carril = css.slice(css.indexOf("@supports (overflow-x: clip)"));
    assert.match(css, /@media \(min-width: 1025px\) \{\s*@supports \(overflow-x: clip\) \{/,
        "el bloque va bajo min-width: 1025px y condicionado a overflow-x: clip");
    assert.match(carril, /\.work\.hf-work-h \{\s*padding-bottom: 0;\s*height: calc\(100svh \+ var\(--work-run, 0px\)\);\s*\}/,
        "la sección mide una pantalla más el recorrido del carril");
    assert.match(carril, /\.work\.hf-work-h \.work-view \{\s*position: sticky; top: 0;/,
        "la pantalla se queda pegada mientras dura el recorrido");
    assert.match(carril, /\.work\.hf-work-h \.work-track \{\s*display: flex;\s*height: 100%;\s*width: max-content;/);
    assert.match(carril, /\.work\.hf-work-h \.work-row \{[\s\S]*?flex: 0 0 auto;[\s\S]*?border-left: 1px solid var\(--line\);/);
    assert.match(carril, /\.work\.hf-work-h \.work-rail \{[\s\S]*?display: flex;/);
    assert.match(css, /\.work-rail \{ display: none; \}/, "fuera del carril el raíl no se ve");
    assert.match(css, /\.work\.work-3d-ready \.work-track \{\s*perspective: 1100px;/,
        "el carril hereda el punto de fuga de la entrada 3D de las filas");
    // El hover de siempre sigue en pie dentro del carril (foto + bandas).
    assert.match(css, /\.work-row:hover::after, \.work-row:focus-visible::after \{ opacity: 1; transform: scale\(1\); \}/);
});

test("el degradado lila de las cajas es suave y el mismo en la caja y en sus dos clones", () => {
    const caja = /\.work-row::before\s*\{[^}]*linear-gradient\(90deg, rgba\(160, 100, 255, ([0-9.]+)\), transparent (\d+)%\)/.exec(css);
    const salida = /\.work-transition::after\s*\{[^}]*linear-gradient\(90deg, rgba\(160,100,255,\.([0-9]+)\), transparent (\d+)%\)/.exec(css);
    const llegada = /\.work-transition::after\s*\{[^}]*linear-gradient\(90deg, rgba\(160,100,255,\.([0-9]+)\), transparent (\d+)%\)/.exec(generado);
    assert.ok(caja && salida && llegada, "el degradado está en la caja y en los dos clones");
    // La caja escribe «0.08» y los clones «.08»: mismo valor, dos formas.
    const lila = (m) => Number(m[1].includes(".") ? m[1] : "0." + m[1]);
    assert.equal(lila(caja), lila(salida), "el clon de salida lleva el mismo lila que la caja");
    assert.equal(lila(salida), lila(llegada), "el clon de llegada de la ficha también");
    assert.equal(caja[2], salida[2], "y el mismo punto de desvanecido");
    assert.equal(salida[2], llegada[2]);
    assert.ok(lila(caja) <= 0.1, `el lila de la caja es suave (${lila(caja)})`);
    assert.ok(Number(caja[2]) >= 65, `y el desvanecido, largo (${caja[2]}%)`);
});

test("las cajas se cierran por abajo con la misma línea gris que las recorre por arriba", () => {
    assert.match(css, /\.work-list \{ border-top: 1px solid var\(--line\); \}/,
        "la línea de arriba es el borde superior del listado");
    const carril = css.slice(css.indexOf("@media (min-width: 1025px)"));
    assert.match(carril,
        /\.work\.hf-work-h \.work-list \{[\s\S]*?border-bottom: 1px solid var\(--line\);\s*\}/,
        "y el carril le añade la de abajo");
});

test("los números y los titulares del carril conservan el tamaño de la lista vertical", () => {
    const regla = (sel) => {
        const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(css);
        assert.ok(m, `falta la regla ${sel}`);
        return m[1];
    };
    assert.doesNotMatch(regla(".work.hf-work-h .work-num"), /font-size/,
        "el número del carril no cambia de tamaño: hereda el de la versión vertical");
    assert.doesNotMatch(regla(".work.hf-work-h .work-title"), /font-size|line-height/,
        "el titular tampoco: mismo cuerpo que en la lista vertical");
    assert.doesNotMatch(regla(".work.hf-work-h .work-go"), /font-size/,
        "la flecha también se queda en el tamaño de siempre");
    // Y ese tamaño común es el de la lista vertical.
    assert.match(css, /\.work-num \{\s*font-family: var\(--font-mono\); font-size: 0\.75rem;/);
    assert.match(css, /\.work-title \{[\s\S]*?font-size: clamp\(1\.3rem, 3\.2vw, 2\.5rem\);/);
});

test("las cajas del carril son más pequeñas que al principio y todas del mismo ancho", () => {
    const m = /\.work\.hf-work-h \.work-row \{[\s\S]*?width: clamp\((\d+)px, (\d+)vw, (\d+)px\);/.exec(css);
    assert.ok(m, "el panel del carril tiene ancho declarado");
    assert.ok(Number(m[2]) >= 32 && Number(m[2]) <= 44,
        `el panel baja del 56vw original (${m[2]}vw)`);
    assert.ok(Number(m[3]) <= 800, `y su tope también baja (${m[3]}px)`);
    // Un único ancho para las diez cajas: ninguna se ajusta por su posición
    // (la última se cierra por la derecha, pero no cambia de tamaño).
    const carril = css.slice(css.indexOf("@media (min-width: 1025px)"));
    // Todas las reglas del carril que apuntan a una caja (sin contar la ::after
    // de la foto, que lleva width: 100% y no es una caja).
    const conAncho = [...carril.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, sel]) => /\.work\.hf-work-h [^{}]*\.work-row/.test(sel) && !/::/.test(sel))
        .map(([, , cuerpo]) => /width:\s*([^;]+);/.exec(cuerpo))
        .filter(Boolean);
    assert.equal(conAncho.length, 1,
        `solo una declaración de ancho para las cajas (${conAncho.length})`);
    assert.match(conAncho[0][1], /^clamp\(340px, 40vw, 780px\)$/,
        "y es la misma para las diez");
    assert.doesNotMatch(carril, /\.work\.hf-work-h \.work-row:(first|last)-child \{[^}]*width:/,
        "ni la primera ni la última cambian de ancho");
    assert.match(carril, /\.work\.hf-work-h \.work-row:last-child \{ border-right: 1px solid var\(--line\); \}/,
        "la última caja se cierra por la derecha con la misma línea gris");
    assert.doesNotMatch(carril, /\.work\.hf-work-h \.work-row \{[^}]*border-right/,
        "las demás no llevan línea derecha: la pone la caja siguiente");
});

test("el fotograma cubre toda la caja con su capa de fusión", () => {
    const carril = css.slice(css.indexOf("@media (min-width: 1025px)"));
    const regla = /\.work\.hf-work-h \.work-row::after \{([\s\S]*?)\n        \}/.exec(carril);
    assert.ok(regla, "el carril define su propio fotograma");
    const cuerpo = regla[1];
    assert.match(cuerpo, /width: 100%;/, "la foto cubre la caja entera, no la mitad derecha");
    assert.match(cuerpo, /-webkit-mask-image: none;\s*mask-image: none;/,
        "sin fundido lateral: el borde izquierdo lo hace la capa de fusión");
    assert.match(cuerpo,
        /linear-gradient\(to right,\s*rgba\(5, 5, 5, 0\.94\) 0%,\s*rgba\(5, 5, 5, 0\.72\) 34%,\s*rgba\(5, 5, 5, 0\.34\) 62%,\s*rgba\(5, 5, 5, 0\) 100%\)/,
        "el velo negro deja legibles el número y el titular a la izquierda");
    assert.match(cuerpo,
        /linear-gradient\(to right,\s*rgba\(160, 100, 255, 0\.22\) 0%,\s*rgba\(160, 100, 255, 0\.10\) 40%,\s*rgba\(160, 100, 255, 0\) 74%\)/,
        "el lavado lila tiñe la foto desde la izquierda y se apaga hacia la derecha");
    assert.match(cuerpo, /var\(--img, none\);/, "y debajo está la foto del proyecto");
    assert.match(carril,
        /@supports \(mask-composite: intersect\) \{\s*\.work\.hf-work-h \.work-row::after \{[\s\S]*?repeating-linear-gradient\(102deg, #000 0 var\(--work-stripe\), transparent var\(--work-stripe\) 32px\)/,
        "con máscaras compuestas se conserva el descubierto en bandas del hover");
});

test("el clon del clic reproduce la caja a sangre, también al llegar a la ficha", () => {
    // El clon de salida de la landing y el de llegada de la ficha llevan la
    // misma capa de fusión que la caja; si no, el relevo cambiaría de aspecto.
    const generado = fs.readFileSync(path.join(root, "generated.css"), "utf8");
    const capa = /rgba\(5, 5, 5, 0\.94\) 0%,\s*rgba\(5, 5, 5, 0\.72\) 34%,\s*rgba\(5, 5, 5, 0\.34\) 62%,\s*rgba\(5, 5, 5, 0\) 100%/;
    for (const [nombre, hoja] of [["landing", css], ["ficha", generado]]) {
        const bloque = /\.work-transition--full::after \{([\s\S]*?)\n\}/.exec(hoja);
        assert.ok(bloque && capa.test(bloque[1]),
            `${nombre}: el clon a sangre lleva la capa de fusión`);
        assert.match(hoja, /\.work-transition--full \{\s*-webkit-mask-image: none;\s*mask-image: none;\s*\}/,
            `${nombre}: y sin el fundido lateral que recortaba la mitad derecha`);
    }
    assert.match(script, /const full = !!\(workSection && workSection\.classList\.contains\("hf-work-h"\)\);/,
        "la landing clona la caja entera cuando el carril está activo");
    assert.match(script, /left: rect\.left, top: rect\.top, width: rect\.width, height: rect\.height/);
    assert.match(script, /position: imagePosition, full \}/, "y lo anota para la ficha");
    assert.match(fs.readFileSync(path.join(root, "generated.js"), "utf8"),
        /origin\.full \? " work-transition--full" : ""/, "la ficha lo reproduce");
});

for (const page of ["index.html", "es/index.html"]) {
    test(`${page}: los 10 proyectos viven en el carril y el raíl está listo`, () => {
        const doc = new JSDOM(fs.readFileSync(path.join(root, page), "utf8")).window.document;
        const view = doc.querySelector(".work-view");
        const list = doc.querySelector(".work-view > .work-list");
        const track = list && list.querySelector(":scope > .work-track");
        const rows = track ? [...track.querySelectorAll(".work-row")] : [];
        assert.ok(view && list && track, "la estructura del carril está en el HTML");
        assert.equal(rows.length, 10);
        assert.deepEqual(rows.map((row) => row.querySelector(".work-num").textContent),
            ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
        const rail = doc.querySelector(".work-view > .work-rail");
        assert.ok(rail && rail.getAttribute("aria-hidden") === "true",
            "el raíl es decorativo y lo rellena el script");
        assert.ok(doc.querySelector("#workRailTicks") && doc.querySelector("#workRailNow"));
        assert.equal(doc.getElementById("workRailNow").textContent, "01");
        assert.equal(doc.querySelectorAll("#work .work-rail-tick").length, 0,
            "las 10 muescas las crea el script, no el HTML");
    });
}

test("escritorio: la clase y el recorrido se miden, sin mover nada al arrancar", async () => {
    const { dom, doc, section, track, rows, frame } = boot();
    try {
        await frame();
        assert.ok(section.classList.contains("hf-work-h"), "la clase del carril está puesta");
        assert.equal(section.style.getPropertyValue("--work-run"), `${RUN}px`);
        assert.equal(transformX(track), 0, "en el arranque de la sección el carril está a cero");
        const ticks = [...doc.querySelectorAll("#work .work-rail-tick")];
        assert.equal(ticks.length, rows.length);
        assert.ok(ticks[0].classList.contains("is-on"));
        assert.equal(doc.getElementById("workRailNow").textContent, "01");
        assert.ok(rows.every((row) => row.classList.contains("work-row-visible")),
            "los paneles quedan colocados de una vez: la cascada de la lista vertical "
            + "no debe cruzarse con el recorrido horizontal");
    } finally { dom.window.close(); }
});

test("escritorio: N.O.D.E. espera, el carril reparte el recorrido y RYUU queda centrada al soltarse", async () => {
    const { dom, doc, section, track, state, frame, scrollTo } = boot();
    try {
        await frame();
        const range = RUN;               // una pantalla fija: alto de sección − ventana
        const hold = Math.round(range * HOLD);
        scrollTo(TOP + Math.round(hold / 2));   // primer tramo: solo espera
        await frame();
        assert.equal(transformX(track), 0,
            "N.O.D.E. sigue quieto a la vista durante la espera inicial");
        assert.equal(doc.getElementById("workRailNow").textContent, "01");
        scrollTo(TOP + hold + (range - hold) / 2);   // mitad del recorrido real
        await frame();
        assert.ok(Math.abs(transformX(track) + RUN / 2) < 1,
            `a mitad del recorrido el carril va por la mitad (${transformX(track)})`);
        scrollTo(TOP + range);   // borde de liberación: último estado del carril
        await frame();
        assert.ok(Math.abs(transformX(track) + RUN) < 1,
            "al final del recorrido el carril está entero, sin pasarse");
        // RYUU centrada: su centro cae en el centro de la ventana del carril.
        const centroRyuu = -RUN + 9 * PANEL_W + PANEL_W / 2;
        assert.ok(Math.abs(centroRyuu - LIST_W / 2) < 1,
            `el 10.º proyecto queda centrado (centro en ${centroRyuu}px de ${LIST_W}px)`);
        const counter = doc.getElementById("workRailNow").textContent;
        assert.equal(counter, "10", "el raíl termina en el proyecto 10");
        const ticks = [...doc.querySelectorAll("#work .work-rail-tick")];
        assert.ok(ticks[9].classList.contains("is-on") && !ticks[8].classList.contains("is-on"));
        // Pasado el borde de liberación la sección ya no está fija: el carril no
        // sigue avanzando (no se pasa) y el scroll vertical continúa normal.
        scrollTo(TOP + range + 600);
        await frame();
        assert.ok(Math.abs(transformX(track) + RUN) < 1, "el carril no se pasa del último proyecto");
        assert.ok(section.classList.contains("hf-work-h"), "la sección liberada sigue siendo el carril hasta salir de pantalla");
        scrollTo(TOP - 900);
        await frame();
        assert.equal(transformX(track), 0, "por encima de la sección el carril vuelve a cero");
        assert.ok(state.y < TOP, "el scroll de antes de la sección es vertical, sin secuestro");
        scrollTo(TOP + hold - 40);
        await frame();
        assert.equal(transformX(track), 0, "y justo antes de que acabe la espera, también");
    } finally { dom.window.close(); }
});

test("escritorio: el raíl enciende el proyecto en curso mientras se recorre", async () => {
    const { dom, doc, track, rows, frame, scrollTo } = boot();
    try {
        await frame();
        const ticks = [...doc.querySelectorAll("#work .work-rail-tick")];
        const counter = doc.getElementById("workRailNow");
        const range = RUN, hold = Math.round(range * HOLD);
        const seen = [];
        for (let i = 0; i < rows.length - 1; i++) {
            // punto de scroll (con la espera inicial incluida) en el que el
            // proyecto i queda alineado a la izquierda
            scrollTo(Math.round(TOP + hold + (i * PANEL_W * (range - hold)) / RUN));
            await frame();
            seen.push(counter.textContent);
            assert.equal(ticks.filter((tick) => tick.classList.contains("is-on")).length, 1,
                "solo una muesca encendida a la vez");
        }
        assert.deepEqual(seen, ["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
        scrollTo(TOP + RUN);   // el último no llega a alinearse a la izquierda: se enciende al soltarse
        await frame();
        assert.equal(counter.textContent, "10", "el último proyecto se enciende al final del recorrido");
        assert.ok(Math.abs(Number(transformX(track)) + RUN) < 1);
    } finally { dom.window.close(); }
});

test("móvil y «reducir movimiento»: la lista sigue siendo vertical", async () => {
    for (const options of [{ desktop: false }, { desktop: true, reduced: true }, { desktop: false, reduced: true }]) {
        const { dom, doc, section, track, frame } = boot("index.html", options);
        try {
            await frame();
            assert.ok(!section.classList.contains("hf-work-h"), JSON.stringify(options));
            assert.equal(section.style.getPropertyValue("--work-run"), "");
            assert.equal(track.style.transform, "");
            assert.equal(doc.querySelectorAll("#work .work-rail-tick").length, 10,
                "las muescas existen pero el raíl no se muestra");
        } finally { dom.window.close(); }
    }
});

test("escritorio: en una ventana muy baja manda la lista vertical", async () => {
    const { dom, section, track, frame } = boot("index.html", { listHeight: 200 });
    try {
        await frame();
        assert.ok(!section.classList.contains("hf-work-h"),
            "sin alto para los paneles el carril no se activa");
        assert.equal(track.style.transform, "");
    } finally { dom.window.close(); }
});

test("escritorio: al bajar de 1025px la sección se libera y vuelve a la lista", async () => {
    const { dom, window, section, track, state, frame } = boot();
    try {
        await frame();
        assert.ok(section.classList.contains("hf-work-h"));
        state.desktop = false;
        window.dispatchEvent(new window.Event("resize"));
        await frame();
        assert.ok(!section.classList.contains("hf-work-h"), "sin escritorio no hay carril");
        assert.equal(section.style.getPropertyValue("--work-run"), "");
        assert.equal(track.style.transform, "");
    } finally { dom.window.close(); }
});

test("teclado: el proyecto que recibe el foco entra en pantalla", async () => {
    const { dom, window, rows, state, frame } = boot();
    try {
        await frame();
        window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab" }));
        rows[3].focus();
        await frame();
        const range = RUN, hold = Math.round(range * HOLD);
        assert.equal(Math.round(state.y),
            Math.round(TOP + hold + (3 * PANEL_W * (range - hold)) / RUN),
            "el scroll se coloca en el tramo del proyecto enfocado");
    } finally { dom.window.close(); }
});

test("clic: en el carril la fila no crece en vertical; en la lista sí se mantiene", async () => {
    const carril = boot();
    try {
        await carril.frame();
        const row = carril.rows[0];
        row.dispatchEvent(new carril.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        const layer = carril.doc.querySelector(".work-transition--departure");
        assert.ok(layer, "el fotograma de salida se prepara igual");
        // El fotograma cubre toda la caja: el clon es la caja entera, con su capa.
        assert.ok(layer.classList.contains("work-transition--full"));
        assert.equal(layer.style.width, `${PANEL_W}px`);
        assert.equal(layer.style.left, `${ROW_LEFT}px`);
        assert.equal(layer.style.height, `${PANEL_H}px`);
        const guardado = JSON.parse(carril.window.sessionStorage.getItem("hfGeneratedTransition"));
        assert.equal(guardado.full, true, "y la ficha lo recibe para reproducir la caja a sangre");
        assert.equal(guardado.width, PANEL_W);
        assert.equal(row.style.paddingBottom, "", "el panel mide la ventana: no hay padding que crecer");
        assert.equal(row.style.paddingTop, "");
    } finally { carril.dom.window.close(); }

    const lista = boot("index.html", { desktop: false });
    try {
        await lista.frame();
        const row = lista.rows[0];
        row.dispatchEvent(new lista.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        const layer = lista.doc.querySelector(".work-transition--departure");
        assert.ok(layer && !layer.classList.contains("work-transition--full"),
            "en la lista vertical el clon sigue siendo la mitad derecha");
        assert.equal(layer.style.width, `${PANEL_W / 2}px`);
        assert.equal(layer.style.left, `${ROW_LEFT + PANEL_W / 2}px`);
        assert.equal(JSON.parse(lista.window.sessionStorage.getItem("hfGeneratedTransition")).full, false);
        assert.notEqual(row.style.paddingBottom, "", "la lista vertical conserva el crecimiento de la caja");
    } finally { lista.dom.window.close(); }
});
