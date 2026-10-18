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
     ventana) y NO se construye clon de salida: la caja real sigue a la vista
     hasta que entra la ficha, así que el relevo no se nota; en la lista vertical
     se conserva el clon y el crecimiento de siempre.
   - El bloque de CSS solo vive dentro de @supports (overflow-x: clip): sin
     clip, el overflow-x de html/body/main sería un contenedor de scroll y el
     sticky no pegaría.
   - Al soltarse el carril —justo cuando el scroll empieza a bajar hacia About—
     nacen de las líneas de cierre unas ramas geométricas que se van formando con
     el scroll (al bajar se dibujan, al subir se recogen) y se quedan de fondo:
     mismas ramas en cada carga (semilla fija), trazo gris que no escala con el
     lienzo pero se va engrosando con el scroll —de 1px a 3px al completarse el
     dibujo, con la variable --branch-w del svg— y
     profundidades en escalera, con la última de la derecha extendiéndose aún
     más abajo —pasa el logo de About— hasta que empieza a verse DNAi (el
     alto de su titular es el fondo del lienzo), y sin multiplicación de
     líneas: ningún trazo corre paralelo a otro a 10px o menos solapándolo
     (el eco repetido de la captura queda podado, con lo que cuelga de él).
   - Las ramas son rectilíneas (rejilla de 45°: vertical, horizontal o diagonal
     exacta) y ninguna sale por debajo de RYUU: la maraña vive a la derecha del
     codo de la caja ya centrada.
   - Las ramas viajan ACTIVAS SOLO EN ESCRITORIO (desactivadas el 05/10/2026,
     recuperadas el 15/10/2026): la página declara
     window.HYPRFRAME_WORK_BRANCHES = true antes de script.js, pero el dibujo
     solo se traza dentro del carril de escritorio (≥1025px); en móvil/tablet
     o con «reducir movimiento» no se traza ni se ve nada (y el carril no
     cambia con el interruptor).
   - El dibujo se ramifica con el scroll, no todo a la vez (15/10/2026): la
     ventana de altura de cada tramo se desplaza por raíz (los árboles brotan
     de izquierda a derecha) y por nivel (una hija no empieza hasta que su
     padre está entero), conservando la forma y la posición de siempre —solo
     cambia el cuándo—. Así la maraña crece y se recoge de forma progresiva,
     sin piezas sueltas ni saltos.
   - El recorrido va por detrás del avance (t = recorrido², GROWTH veces el alto
     del lienzo): arranca despacio junto a la línea y acaba cuando empieza
     a verse DNAi, pasado el logo de About. Si fuera 1:1, la tinta coincidiría con lo ya visible y no se vería
     crecer nada.
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
const BRANCH_H = 560;    // alto del lienzo de las ramas (clamp(420px, 62vh, 760px))
const ROW_LEFT = 100;    // dónde empieza la caja medida (x del rect de la fila)
const N = 10;
// El carril se detiene con el ÚLTIMO proyecto centrado en la ventana.
const RUN = (N - 1) * PANEL_W + PANEL_W / 2 - LIST_W / 2;   // 6937 px
// Fracción del recorrido vertical en la que el carril aún no se mueve (N.O.D.E.
// se queda a la vista). Se lee del propio script para no duplicar el número.
const HOLD = Number(/const HOLD = ([\d.]+);/.exec(script)[1]);
// Duración del dibujo de las ramas, en múltiplos del alto del lienzo (se lee del
// propio script para no duplicar el número).
const GROWTH = Number(/const GROWTH = ([\d.]+);/.exec(script)[1]);
const trazo = (alto = BRANCH_H) => Math.round(alto * GROWTH);   // px de scroll del dibujo

function boot(page = "index.html", { desktop = true, reduced = false, listHeight = PANEL_H, branchH = BRANCH_H, branches = false } = {}) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, page), "utf8"), {
        url: "https://hyprframe.com/",
        pretendToBeVisual: true,
        runScripts: "outside-only",
        virtualConsole: new VirtualConsole(),   // sin ruido de navegación al hacer clic
    });
    const { window } = dom;
    const doc = window.document;
    const state = { y: TOP, desktop, reduced, listHeight, branchH };

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
    const canvas = doc.getElementById("workBranches");
    Object.defineProperty(canvas, "clientWidth", { get: () => LIST_W });
    Object.defineProperty(canvas, "clientHeight", { get: () => state.branchH });
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
    // Interruptor de las ramas: en la página lo declara su HTML (en true, solo
    // escritorio); como jsdom no ejecuta los <script> de la página, aquí solo
    // se enciende cuando el test las pide (branches: true).
    if (branches) window.HYPRFRAME_WORK_BRANCHES = true;
    window.eval(script);

    const frame = () => new Promise((resolve) => setTimeout(resolve, 30));
    const scrollTo = (y) => { state.y = y; window.dispatchEvent(new window.Event("scroll")); };
    return { dom, window, doc, section, view, list, track, branches: canvas, rows, state, frame, scrollTo };
}

/* Hasta dónde baja el árbol de cada raíz: se recorren los tramos desde los que
   nacen en la línea de cierre (y = 0) siguiendo los nudos compartidos. Devuelve
   los topes de derecha a izquierda, que es como se lee la escalera. */
const topesPorRaiz = (branches) => {
    const tramos = [...branches.querySelectorAll("path")].map((p) => {
        const m = /^M(\d+) (\d+)L(\d+) (\d+)$/.exec(p.getAttribute("d"));
        return { x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]) };
    });
    const salen = new Map();   // nudo → tramos que salen de ahí
    for (const t of tramos) {
        const k = `${t.x0},${t.y0}`;
        if (!salen.has(k)) salen.set(k, []);
        salen.get(k).push(t);
    }
    const extremos = new Map();   // x de la raíz → y más profunda de su árbol
    for (const raiz of tramos.filter((t) => t.y0 === 0)) {
        let profundo = 0;
        const pila = [raiz];
        const vistos = new Set();
        while (pila.length) {
            const t = pila.pop();
            profundo = Math.max(profundo, t.y1);
            const k = `${t.x1},${t.y1}`;
            if (vistos.has(k)) continue;
            vistos.add(k);
            pila.push(...(salen.get(k) || []));
        }
        extremos.set(raiz.x0, Math.max(extremos.get(raiz.x0) || 0, profundo));
    }
    return [...extremos.entries()].sort((a, b) => b[0] - a[0]).map(([, y]) => y);
};

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
    // El velo tiñe el fondo de la caja con el lila de la web (19/10/2026): era
    // rgba(5,5,5,…) y se leía grisáceo sobre la foto. Mismas alfas: lo que se
    // cambia es el color, no la cantidad de velo, así que la legibilidad no se
    // toca. #1e142d = --bg mezclado con --violet al 16%.
    assert.match(cuerpo,
        /linear-gradient\(to right,\s*rgba\(30, 20, 45, 0\.94\) 0%,\s*rgba\(30, 20, 45, 0\.72\) 34%,\s*rgba\(30, 20, 45, 0\.34\) 62%,\s*rgba\(30, 20, 45, 0\) 100%\)/,
        "el velo teñido de lila deja legibles el número y el titular a la izquierda");
    assert.doesNotMatch(cuerpo, /rgba\(5, 5, 5, 0\.94\)/,
        "y no vuelve a ser neutro: un velo gris desatura la foto justo donde más se nota");
    assert.match(cuerpo,
        /linear-gradient\(to right,\s*rgba\(160, 100, 255, 0\.22\) 0%,\s*rgba\(160, 100, 255, 0\.10\) 40%,\s*rgba\(160, 100, 255, 0\) 74%\)/,
        "el lavado lila tiñe la foto desde la izquierda y se apaga hacia la derecha");
    assert.match(cuerpo, /var\(--img, none\);/, "y debajo está la foto del proyecto");
    assert.match(carril,
        /@supports \(mask-composite: intersect\) \{\s*\.work\.hf-work-h \.work-row::after \{[\s\S]*?repeating-linear-gradient\(102deg, #000 0 var\(--work-stripe\), transparent var\(--work-stripe\) 32px\)/,
        "con máscaras compuestas se conserva el descubierto en bandas del hover");
});

test("la salida del carril es un empujón del fotograma, sin cambiar el contenido de la caja", () => {
    const carril = css.slice(css.indexOf("@media (min-width: 1025px)"));
    assert.match(carril,
        /\.work\.hf-work-h \.work-row\.is-departing::after \{\s*opacity: 1;\s*transform: scale\(1\.05\);\s*\}/,
        "el fotograma se empuja hacia dentro y se queda encendido");
    // Sin clon no hay nada que sustituya a la caja: ni el texto ni el lavado
    // pueden desaparecer al hacer clic.
    assert.match(script, /if \(full\) \{\s*setTimeout\(\(\) => \{ location\.href = row\.href; \}, 440\);\s*return;\s*\}/,
        "el clic del carril navega sin crear capa");
    assert.doesNotMatch(script, /layer\.className = "work-transition work-transition--departure" \+ \(full/,
        "el clon de salida ya no se personaliza para el carril");
});

test("el clon del clic reproduce la caja a sangre, también al llegar a la ficha", () => {
    // El clon de salida de la landing y el de llegada de la ficha llevan la
    // misma capa de fusión que la caja; si no, el relevo cambiaría de aspecto.
    const generado = fs.readFileSync(path.join(root, "generated.css"), "utf8");
    // Las dos capas de relevo del clic llevan el velo TEÑIDO, idéntico al de la
    // caja; si una se queda gris (o con otras alfas) el tono salta a mitad del
    // traqueteo.
    const capa = /rgba\(30, 20, 45, 0\.94\) 0%,\s*rgba\(30, 20, 45, 0\.72\) 34%,\s*rgba\(30, 20, 45, 0\.34\) 62%,\s*rgba\(30, 20, 45, 0\) 100%/;
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
    test(`${page}: el lienzo de las ramas del final existe y está vacío`, () => {
        const doc = new JSDOM(fs.readFileSync(path.join(root, page), "utf8")).window.document;
        const branches = doc.getElementById("workBranches");
        assert.ok(branches, "el contenedor existe");
        assert.equal(branches.getAttribute("aria-hidden"), "true", "es decorativo");
        assert.equal(branches.children.length, 0, "y vacío: las ramas las traza el script");
        assert.equal(branches.parentElement.id, "work", "cuelga de la sección del carril");
        assert.equal(branches.previousElementSibling.className, "work-view",
            "y va justo después de la pantalla del carril");
    });

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
        assert.ok(doc.querySelector("#workRailTicks"));
        // El contador numérico («01 / 10») y su caja se retiraron a petición del
        // cliente (05/10/2026): el raíl es solo la fila de muescas.
        assert.equal(doc.querySelectorAll(".work-rail-count, #workRailNow").length, 0,
            "sin contador ni caja de contador, ni en el HTML ni creados por el script");
        assert.doesNotMatch(rail.textContent, /\/\s*10/);
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
        assert.equal(doc.querySelectorAll(".work-rail-count, #workRailNow").length, 0,
            "el script no recrea el contador");
        assert.ok(rows.every((row) => row.classList.contains("work-row-visible")),
            "los paneles quedan colocados de una vez: la cascada de la lista vertical "
            + "no debe cruzarse con el recorrido horizontal");
    } finally { dom.window.close(); }
});

test("CSS: las ramas nacen en la línea de cierre, bajan hacia About y se quedan de fondo", () => {
    assert.match(css, /\.work-branches \{ display: none; \}/, "fuera del carril no existen");
    const carril = css.slice(css.indexOf("@media (min-width: 1025px)"));
    assert.match(carril,
        /\.work\.hf-work-h \.work-branches \{\s*display: block;\s*position: absolute; top: 100%; left: 0;\s*width: 100%;\s*height: var\(--work-branches-h, clamp\(420px, 62vh, 760px\)\);\s*pointer-events: none; z-index: 0;\s*\}/,
        "el lienzo cuelga del final de la sección, con el alto medido hasta que empieza DNAi "
        + "(clamp de reserva) y sin capturar el ratón");
    const trazo = /\.work\.hf-work-h \.work-branches path \{([\s\S]*?)\n        \}/.exec(carril);
    assert.ok(trazo, "los tramos tienen estilo propio");
    assert.match(trazo[1], /stroke: var\(--line\);/, "trazo del mismo gris que las líneas");
    assert.match(trazo[1], /stroke-width: var\(--branch-w, 1\);/,
        "el grosor lo lleva el scroll (--branch-w del svg: 1px al arrancar, 3px al completar)");
    assert.match(trazo[1], /vector-effect: non-scaling-stroke;/, "que no escala con el lienzo");
    assert.match(trazo[1], /stroke-dasharray: var\(--len, 2000\);/);
    assert.match(trazo[1], /stroke-dashoffset: var\(--len, 2000\);\s*\/\* el scroll lo baja hasta 0 \*\//,
        "sin scroll, sin dibujar: el dibujo lo lleva el scroll, no una animación");
    assert.doesNotMatch(trazo[1], /opacity|transform:/, "solo se dibuja el trazo, ni opacidad ni escala");
    assert.doesNotMatch(carril, /work-branch-grow|is-playing/,
        "no queda animación por tiempo: el dibujo es del scroll");
});

test("las ramas viajan ACTIVAS solo en escritorio: el interruptor de la página está en true", async () => {
    // Desactivadas el 05/10/2026 y recuperadas el 15/10/2026, solo en
    // escritorio. La landing declara el interruptor en true antes de
    // script.js, pero fuera del carril de escritorio no se traza nada.
    for (const page of ["index.html", "es/index.html"]) {
        const html = fs.readFileSync(path.join(root, page), "utf8");
        const m = /window\.HYPRFRAME_WORK_BRANCHES = (true|false);/.exec(html);
        assert.ok(m, `${page}: la página declara el interruptor de las ramas`);
        assert.equal(m[1], "true", `${page}: y lo deja encendido (solo escritorio)`);
        assert.ok(html.indexOf("HYPRFRAME_WORK_BRANCHES") < html.indexOf("script.js?"),
            `${page}: el interruptor va antes de script.js, que lo lee al arrancar`);
    }
    // En escritorio, con el interruptor encendido, se trazan; el carril corre igual.
    const escritorio = boot("index.html", { branches: true });
    try {
        await escritorio.frame();
        assert.ok(escritorio.branches.querySelector("svg"), "escritorio: se traza el svg");
        assert.ok(escritorio.branches.querySelectorAll("path").length > 0, "escritorio: hay tramos");
        escritorio.scrollTo(TOP + RUN / 2);
        await escritorio.frame();
        assert.ok(transformX(escritorio.track) < 0,
            `el carril sigue corriendo (${transformX(escritorio.track)})`);
    } finally { escritorio.dom.window.close(); }
    // Solo en escritorio: en móvil/tablet (o con «reducir movimiento»), aun con
    // el interruptor en true, no se traza ni el svg ni se mide el lienzo.
    for (const options of [{ desktop: false, branches: true }, { desktop: true, reduced: true, branches: true }]) {
        const movil = boot("index.html", options);
        try {
            await movil.frame();
            assert.equal(movil.branches.querySelector("svg"), null,
                `${JSON.stringify(options)}: no se traza ni el svg`);
            assert.equal(movil.branches.querySelectorAll("path").length, 0, "ni un solo tramo");
            assert.equal(movil.branches.style.height, "", "y no se mide el lienzo");
            assert.equal(movil.branches.children.length, 0, "el lienzo queda vacío");
        } finally { movil.dom.window.close(); }
    }
    // Y el CSS lo respalda: fuera del carril de escritorio no se ven.
    assert.match(css, /\.work-branches \{ display: none; \}/,
        "fuera de escritorio el lienzo de las ramas está oculto");
});
test("escritorio: las ramas se trazan al medir el carril, con raíces en la línea de cierre", async () => {
    const { dom, doc, branches, frame } = boot("index.html", { branches: true });
    try {
        await frame();
        const svg = branches.querySelector("svg");
        assert.ok(svg, "al montar el carril se traza el svg");
        assert.equal(svg.getAttribute("viewBox"), `0 0 ${LIST_W} ${BRANCH_H}`);
        const paths = [...svg.querySelectorAll("path")];
        assert.ok(paths.length >= 20, `ramas de sobra para que sea intrincado (${paths.length})`);
        assert.ok(paths.every((p) => /^M(\d+) (\d+)L(\d+) (\d+)$/.test(p.getAttribute("d"))),
            "todos los tramos son rectos (geometría, sin curvas)");
        const raices = paths.filter((p) => /^M\d+ 0L/.test(p.getAttribute("d")));
        assert.ok(raices.length >= 4, `las ramas nacen de la línea de cierre (${raices.length} arranques)`);
        for (const path of paths) {
            const ys = [...path.getAttribute("d").matchAll(/[ML](\d+) (\d+)/g)].map((m) => Number(m[2]));
            assert.ok(ys.every((y, i) => i === 0 || y >= ys[i - 1]), "cada rama baja, nunca sube");
            assert.ok(ys[ys.length - 1] <= BRANCH_H, "y no se sale por abajo del lienzo");
        }
        // Geometría rectilínea: cada tramo es vertical, horizontal o una diagonal
        // EXACTA de 45° — nada de medias inclinaciones.
        for (const path of paths) {
            const m = /^M(\d+) (\d+)L(\d+) (\d+)$/.exec(path.getAttribute("d"));
            const [dx, dy] = [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])];
            assert.ok(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy),
                `la rejilla de 45° se respeta (${path.getAttribute("d")})`);
        }
        // Ninguna rama sale por debajo de RYUU: la maraña vive a la derecha de su
        // codo (el borde derecho de la caja centrada), no debajo de la caja.
        const corner = 9 * PANEL_W + PANEL_W - RUN;   // el codo de RYUU al soltarse
        for (const path of paths) {
            const m = /^M(\d+) (\d+)L(\d+) (\d+)$/.exec(path.getAttribute("d"));
            assert.ok(Math.min(Number(m[1]), Number(m[3])) >= corner,
                `ningún tramo cruza el codo de RYUU (x ≥ ${corner}): ${path.getAttribute("d")}`);
        }
        assert.ok(!branches.classList.contains("is-playing"), "al empezar el carril todavía no se dibuja");
    } finally { dom.window.close(); }
});

test("escritorio: las ramas se forman con el scroll y se recogen al subir", async () => {
    const { dom, branches, frame, scrollTo } = boot("index.html", { branches: true });
    try {
        await frame();
        const paths = [...branches.querySelectorAll("path")];
        const len = (p) => Number(p.style.getPropertyValue("--len"));
        const dash = (p) => Number(p.style.strokeDashoffset);
        const dibujadas = () => paths.filter((p) => dash(p) === 0).length;      // terminadas
        const sinDibujar = () => paths.filter((p) => dash(p) === len(p)).length; // ni empezadas
        const empezadas = () => paths.filter((p) => dash(p) < len(p)).length;    // en curso o hechas
        // Grosor de la tinta: la variable del svg que el scroll va subiendo.
        const svg = branches.querySelector("svg");
        const grosor = () => Number(svg.style.getPropertyValue("--branch-w"));
        const range = RUN, hold = Math.round(range * HOLD);

        // 1. Antes del final del carril no hay nada dibujado.
        scrollTo(Math.round(TOP + hold + (range - hold) * 0.5));
        await frame();
        assert.equal(sinDibujar(), paths.length, "a mitad de recorrido aún no hay ramas");
        scrollTo(Math.round(TOP + hold + (range - hold) * 0.9));
        await frame();
        assert.equal(sinDibujar(), paths.length, "y al 90%, tampoco");

        // 2. Justo al soltarse la sección empieza el dibujo (todavía en cero).
        scrollTo(TOP + range);
        await frame();
        assert.equal(sinDibujar(), paths.length, "al soltarse arranca, aún sin trazo");
        assert.equal(grosor(), 1, "y la tinta arranca fina: 1px");

        // 3. Con el scroll, se van formando: a mitad del dibujo, ni todas ni ninguna.
        const span = trazo();
        scrollTo(TOP + range + span * 0.5);
        await frame();
        const grosorMedio = grosor();
        assert.ok(grosorMedio > 1 && grosorMedio < 3,
            `a mitad del dibujo la tinta ya engrosa pero no llega a 3px (${grosorMedio})`);
        const aMedias = empezadas();
        const terminadas = dibujadas();   // los primeros troncos ya han acabado
        assert.ok(aMedias > 0 && aMedias < paths.length,
            `a mitad del dibujo hay ramas en curso y otras sin empezar (${aMedias}/${paths.length})`);
        const parciales = paths.filter((p) => dash(p) > 0 && dash(p) < len(p)).length;
        assert.ok(parciales > 0, "y trazos a medio hacer, no de golpe");

        // 4. Al final del tramo del dibujo están todas: y se quedan.
        scrollTo(TOP + range + span);
        await frame();
        assert.equal(dibujadas(), paths.length, "al final del recorrido del dibujo, todas");
        assert.equal(grosor(), 3, "y la tinta ha engrosado hasta los 3px");
        scrollTo(TOP + range + span + 800);
        await frame();
        assert.equal(dibujadas(), paths.length, "y ya dentro de About siguen enteras");
        assert.equal(grosor(), 3, "y el grosor se queda en 3px, no engrosa más");

        // 5. Al subir, se recogen en el mismo orden y al revés.
        scrollTo(TOP + range + span * 0.5);
        await frame();
        assert.equal(empezadas(), aMedias, `al subir vuelve el mismo estado (${aMedias})`);
        assert.equal(dibujadas(), terminadas, `y las mismas terminadas (${terminadas})`);
        assert.equal(grosor(), grosorMedio, `y la tinta se acopla al mismo avance: se afina a lo que tocaba (${grosorMedio})`);
        assert.equal(sinDibujar(), paths.length - aMedias);
        scrollTo(TOP + range);
        await frame();
        assert.equal(sinDibujar(), paths.length, "y al volver al final del carril, recogidas del todo");
        assert.equal(grosor(), 1, "y la tinta vuelve a 1px");
        scrollTo(TOP + hold);   // muy por encima
        await frame();
        assert.equal(sinDibujar(), paths.length);
    } finally { dom.window.close(); }
});

test("escritorio: la maraña se ramifica por niveles, sin ramas sueltas ni saltos", async () => {
    const { dom, branches, frame, scrollTo } = boot("index.html", { branches: true });
    try {
        await frame();
        const paths = [...branches.querySelectorAll("path")];
        const len = (p) => Number(p.style.getPropertyValue("--len"));
        const dash = (p) => Number(p.style.strokeDashoffset);
        const enCurso = (p) => dash(p) < len(p);      // empezada (en curso o hecha)
        const hecha = (p) => dash(p) === 0;           // terminada
        const punto = (d, i) => {
            const m = /^M(\d+) (\d+)L(\d+) (\d+)$/.exec(d);
            return i ? `${m[3]},${m[4]}` : `${m[1]},${m[2]}`;
        };
        // Quién llega a cada nudo: el padre de un tramo es el que acaba donde él
        // empieza. Los arranques (en la línea de cierre) no tienen padre.
        const llegan = new Map();
        for (const p of paths) {
            const k = punto(p.getAttribute("d"), 1);
            if (!llegan.has(k)) llegan.set(k, []);
            llegan.get(k).push(p);
        }
        const padres = (p) => llegan.get(punto(p.getAttribute("d"), 0)) || [];
        // Con el scroll, la ramificación avanza por niveles: un tramo solo
        // empieza cuando el que lo engendra ya está en marcha. Ni una pieza suelta.
        const span = trazo();
        for (const frac of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
            scrollTo(TOP + RUN + Math.round(span * frac));
            await frame();
            for (const p of paths) {
                const arriba = padres(p);
                if (!arriba.length) continue;                  // es un arranque
                if (enCurso(p)) {
                    assert.ok(arriba.some(enCurso),
                        `a ${frac} del dibujo, ningún tramo empieza sin su padre: ${p.getAttribute("d")}`);
                }
                if (hecha(p)) {
                    assert.ok(arriba.some(hecha),
                        `a ${frac} del dibujo, ningún tramo acaba antes que su padre: ${p.getAttribute("d")}`);
                }
            }
        }
        // Y al subir, el mismo orden: la ramificación se recoge por las puntas.
        for (const frac of [0.8, 0.5, 0.2]) {
            scrollTo(TOP + RUN + Math.round(span * frac));
            await frame();
            const terminadas = paths.filter(hecha).length;
            const empezadas = paths.filter(enCurso).length;
            assert.ok(empezadas <= 0.9 * paths.length,
                `al recogerse quedan tramos por recoger (${empezadas}/${paths.length})`);
            assert.ok(terminadas < paths.length,
                `y no salta a dibujado del todo (${terminadas}/${paths.length})`);
        }
    } finally { dom.window.close(); }
});

test("escritorio: las ramas se ramifican con el scroll, no todas a la vez", async () => {
    const { dom, branches, frame, scrollTo } = boot("index.html", { branches: true });
    try {
        await frame();
        const tramos = [...branches.querySelectorAll("path")].map((p) => {
            const m = /^M(\d+) (\d+)L(\d+) (\d+)$/.exec(p.getAttribute("d"));
            return { p, x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]) };
        });
        const len = (t) => Number(t.p.style.getPropertyValue("--len"));
        // Fracción de trazo ya dibujada (0 = sin empezar, 1 = entero). El dibujo
        // escribe el dashoffset, así que de ahí sale la tinta. La forma y la
        // posición de cada tramo son las de siempre (su `d` no se toca): lo
        // que se comprueba aquí es solo el CUÁNDO de cada uno.
        const tinta = (t) => 1 - Number(t.p.style.strokeDashoffset) / len(t);
        const span = trazo();
        const ir = async (frac) => {
            scrollTo(TOP + RUN + Math.round(span * frac));
            await frame();
        };
        // Quién llega a cada nudo: el padre de un tramo es el que acaba donde
        // él empieza. Los arranques (en la línea de cierre) no tienen padre.
        const llegan = new Map();
        for (const t of tramos) {
            const k = `${t.x1},${t.y1}`;
            if (!llegan.has(k)) llegan.set(k, []);
            llegan.get(k).push(t);
        }
        const padres = (t) => llegan.get(`${t.x0},${t.y0}`) || [];

        // 1. Al soltarse la sección no hay nada dibujado.
        await ir(0);
        assert.ok(tramos.every((t) => tinta(t) === 0), "el dibujo arranca en la línea de cierre");

        // 2. Las raíces no nacen todas a la vez: brotan de izquierda a
        //    derecha, así que con poco scroll la primera ya crece y la de la
        //    derecha aún no ha empezado; esta solo arranca más abajo.
        const raices = tramos.filter((t) => t.y0 === 0).sort((a, b) => a.x0 - b.x0);
        assert.ok(raices.length >= 4, `hay varias raíces (${raices.length})`);
        await ir(0.3);
        assert.ok(tinta(raices[0]) > 0, "la primera raíz ya crece con poco scroll");
        assert.equal(tinta(raices[raices.length - 1]), 0,
            "y la de la derecha aún no ha nacido: no brotan todas a la vez");
        await ir(0.5);
        assert.ok(tinta(raices[raices.length - 1]) > 0,
            "la raíz de la derecha brota al seguir bajando");

        // 3. Ramificación por niveles: ningún tramo empieza antes de que el
        //    que lo engendra esté entero, en ningún punto del recorrido. Las
        //    hijas nacen de un padre ya dibujado, nivel a nivel.
        for (const frac of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
            await ir(frac);
            for (const t of tramos) {
                if (t.y0 === 0 || tinta(t) === 0) continue;
                const arriba = padres(t);
                assert.ok(arriba.length, `todo tramo cuelga de un padre: ${t.p.getAttribute("d")}`);
                assert.ok(arriba.some((p) => tinta(p) === 1),
                    `a ${frac}, ningún tramo se ramifica antes de que su padre acabe: ${t.p.getAttribute("d")}`);
            }
        }

        // 4. El crecimiento es progresivo: a cada tramo de scroll hay más
        //    ramas empezadas que en el anterior, sin llegar nunca de golpe.
        let empezadasAntes = 0;
        for (const frac of [0.2, 0.35, 0.5, 0.65, 0.8]) {
            await ir(frac);
            const empezadas = tramos.filter((t) => tinta(t) > 0).length;
            const hechas = tramos.filter((t) => tinta(t) === 1).length;
            assert.ok(empezadas > empezadasAntes,
                `a ${frac} hay más ramas en marcha que antes (${empezadas} > ${empezadasAntes})`);
            assert.ok(empezadas < tramos.length,
                `a ${frac} aún no han brotado todas (${empezadas}/${tramos.length})`);
            assert.ok(hechas < empezadas,
                `a ${frac} hay ramas a medio ramificar, no un salto a entero (${hechas}/${empezadas})`);
            empezadasAntes = empezadas;
        }

        // 5. Al final del recorrido están todas, y al subir se recogen por el
        //    mismo sitio: cada tramo pierde tinta, nunca gana.
        await ir(1);
        assert.ok(tramos.every((t) => tinta(t) === 1), "al final del recorrido, todas dibujadas");
        await ir(0.6);
        const a60 = tramos.map(tinta);
        await ir(0.3);
        const a30 = tramos.map(tinta);
        assert.ok(a30.every((l, i) => l <= a60[i]),
            "al subir, ningún tramo se dibuja de más");
        assert.ok(a60.some((l, i) => l > a30[i]), "y alguno se recoge");
    } finally { dom.window.close(); }
});

test("escritorio: los troncos bajan en escalera y el de la derecha llega hasta DNAi", async () => {
    const { dom, doc, branches, frame } = boot("index.html", { branches: true });
    try {
        await frame();
        const topes = topesPorRaiz(branches);
        assert.ok(topes.length >= 4, `hay varias raíces (${topes.length})`);
        // De derecha a izquierda, cada árbol llega menos abajo que el de su derecha.
        assert.equal(topes[0], BRANCH_H, "la última de la derecha llega al fondo del lienzo (donde empieza DNAi)");
        for (let i = 1; i < topes.length; i++) {
            assert.ok(topes[i] < topes[i - 1],
                `la de su izquierda baja menos (${topes[i]} < ${topes[i - 1]})`);
        }
        // Y el listón es DNAi, aún más abajo: el alto del lienzo se mide desde
        // el cierre del carril hasta que empieza a verse su titular, pasando
        // el logo de About (antes las ramas paraban en la base del logo).
        const dnai = doc.querySelector("#services .section-title");
        assert.ok(dnai, "DNAi tiene su titular");
        assert.ok(doc.querySelector(".about-emblem-wrap"), "y antes pasa el logo de About");
        assert.match(fs.readFileSync(path.join(root, "script.js"), "utf8"),
            /const dnai = document\.querySelector\("#services \.section-title"\)/,
            "el alto del lienzo se mide hasta que empieza DNAi");
    } finally { dom.window.close(); }
});

test("escritorio: sin multiplicación de líneas, ningún eco paralelo repetido", async () => {
    const { dom, branches, frame } = boot("index.html", { branches: true });
    try {
        await frame();
        const tramos = [...branches.querySelectorAll("path")].map((p) => {
            const m = /^M(\d+) (\d+)L(\d+) (\d+)$/.exec(p.getAttribute("d"));
            return { d: p.getAttribute("d"), x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]) };
        });
        assert.ok(tramos.length >= 40, `la maraña sigue siendo intrincada (${tramos.length} trazos)`);
        assert.equal(new Set(tramos.map((t) => t.d)).size, tramos.length, "ningún trazo exacto repetido");
        const orientacion = (s) => (s.y1 === s.y0 ? "H" : s.x1 === s.x0 ? "V"
            : ((s.x1 - s.x0) * (s.y1 - s.y0) > 0 ? "D1" : "D2"));
        const constante = (s, o) => (o === "H" ? s.y0 : o === "V" ? s.x0
            : o === "D1" ? s.y0 - s.x0 : s.y0 + s.x0);
        const proyeccion = (s, o) => (o === "H"
            ? [Math.min(s.x0, s.x1), Math.max(s.x0, s.x1)]
            : [Math.min(s.y0, s.y1), Math.max(s.y0, s.y1)]);
        // El eco de la captura: la misma recta trazada dos o tres veces en
        // paralelo, a pocos píxeles y solapadas. No puede quedar ninguna.
        for (let i = 0; i < tramos.length; i++) {
            for (let j = i + 1; j < tramos.length; j++) {
                const a = tramos[i], b = tramos[j], o = orientacion(a);
                if (o !== orientacion(b)) continue;
                let distancia = Math.abs(constante(a, o) - constante(b, o));
                if (o === "D1" || o === "D2") distancia /= Math.SQRT2;
                if (distancia > 10) continue;
                const pa = proyeccion(a, o), pb = proyeccion(b, o);
                const solape = Math.min(pa[1], pb[1]) - Math.max(pa[0], pb[0]);
                const corta = Math.min(pa[1] - pa[0], pb[1] - pb[0]);
                assert.ok(!(corta > 0 && solape >= 6 && solape > corta * 0.5),
                    `sin líneas multiplicadas: ${a.d} ≈ ${b.d} (a ${distancia.toFixed(1)}px)`);
            }
        }
    } finally { dom.window.close(); }
});

test("escritorio: la escalera cae exacta sobre sus topes a cualquier alto de lienzo", async () => {
    // El árbol se traza, se mide y se repite escalado hasta caer justo sobre su
    // tope: ni un píxel corto. Se comprueba en varios altos de lienzo, porque es
    // donde el redondeo podía dejarlo corto.
    for (const alto of [496, 700, 760]) {
        const { dom, branches, frame } = boot("index.html", { branchH: alto, branches: true });
        try {
            await frame();
            const topes = topesPorRaiz(branches);
            assert.deepEqual(topes, [1, 0.78, 0.6, 0.45].map((f) => Math.round(alto * f)),
                `con el lienzo de ${alto}px, cada árbol llega justo a su tope`);
        } finally { dom.window.close(); }
    }
});

test("escritorio: el alto del lienzo se mide hasta que empieza a verse DNAi", async () => {
    const { dom, window, branches, state, frame, scrollTo } = boot("index.html", { branches: true });
    try {
        await frame();
        assert.equal(branches.style.height, "", "sin medida fiable vale el clamp del CSS");
        // El titular de DNAi empieza 1240px por debajo del cierre del carril
        // (pasado todo About, logo incluido); el lienzo llega hasta ahí: al
        // seguir haciendo scroll, las ramificaciones continúan hasta que
        // DNAi empieza a verse.
        const dnai = window.document.querySelector("#services .section-title");
        assert.ok(dnai, "DNAi tiene su titular");
        const cierre = TOP + INNER_H + RUN;          // el cierre del carril, en el documento
        dnai.getBoundingClientRect = () => {
            const top = cierre + 1240 - state.y;
            return { top, height: 120, bottom: top + 120, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} };
        };
        window.dispatchEvent(new window.Event("resize"));
        await frame();
        assert.equal(branches.style.height, "1240px", "el lienzo baja hasta que empieza DNAi");

        // Y con el alto medido, el dibujo dura GROWTH veces ese alto: la rama más
        // honda —la de la derecha, que llega al fondo— acaba al final del tramo; un
        // píxel antes aún no está.
        state.branchH = 1240;
        window.dispatchEvent(new window.Event("resize"));
        await frame();
        const paths = [...branches.querySelectorAll("path")];
        const dibujadas = () => paths.filter((p) => Number(p.style.strokeDashoffset) === 0).length;
        const span = trazo(1240);
        scrollTo(TOP + RUN + span - 1);
        await frame();
        assert.ok(dibujadas() < paths.length,
            `un píxel antes del final del tramo aún falta algo (${dibujadas()}/${paths.length})`);
        scrollTo(TOP + RUN + span);
        await frame();
        assert.equal(dibujadas(), paths.length, "al final del tramo, todas dibujadas");
    } finally { dom.window.close(); }
});

test("escritorio: redimensionar rehace las ramas al estado que marca el scroll", async () => {
    const { dom, window, branches, state, frame, scrollTo } = boot("index.html", { branches: true });
    try {
        await frame();
        scrollTo(TOP + RUN + trazo());           // dibujo completo
        await frame();
        const dibujadas = () => [...branches.querySelectorAll("path")]
            .filter((p) => Number(p.style.strokeDashoffset) === 0).length;
        const total = branches.querySelectorAll("path").length;
        assert.equal(dibujadas(), total, "con el lienzo a la vista, todas dibujadas");
        state.branchH = 700;                     // otra ventana: se rehace todo
        window.dispatchEvent(new window.Event("resize"));
        await frame();
        const paths = [...branches.querySelectorAll("path")];
        assert.ok(paths.length > 0, "se vuelven a trazar con la medida nueva");
        assert.equal(branches.querySelector("svg").getAttribute("viewBox"), `0 0 ${LIST_W} 700`);
        // El mismo scroll sobre otro lienzo (y otro tramo de dibujo) da el mismo
        // estado: no se reinicia la animación ni salta a dibujado del todo.
        const span = trazo(700);
        scrollTo(TOP + RUN + Math.round(span * 0.5));   // la mitad del tramo nuevo
        await frame();
        const hechas = paths.filter((p) => Number(p.style.strokeDashoffset) === 0).length;
        assert.ok(hechas > 0 && hechas < paths.length,
            `a mitad del tramo nuevo hay trazos hechos y pendientes (${hechas}/${paths.length})`);
        scrollTo(TOP + RUN + span);
        await frame();
        assert.equal(paths.filter((p) => Number(p.style.strokeDashoffset) === 0).length, paths.length,
            "y al final del tramo nuevo, todas");
    } finally { dom.window.close(); }
});

test("escritorio: el trazado es reproducible (semilla fija) y se retira con el carril", async () => {
    const primera = boot("index.html", { branches: true });
    let antes;
    try {
        await primera.frame();
        antes = [...primera.branches.querySelectorAll("path")].map((p) => p.getAttribute("d"));
        assert.ok(antes.length > 0);
    } finally { primera.dom.window.close(); }

    const segunda = boot("index.html", { branches: true });
    try {
        await segunda.frame();
        assert.deepEqual([...segunda.branches.querySelectorAll("path")].map((p) => p.getAttribute("d")),
            antes, "la semilla fija da las mismas ramas en cada carga");
        // Sin carril (ventana baja) las ramas se retiran con él.
        segunda.state.listHeight = 200;
        segunda.window.dispatchEvent(new segunda.window.Event("resize"));
        await segunda.frame();
        assert.equal(segunda.branches.children.length, 0, "sin carril no hay ramas");
        assert.ok(!segunda.branches.classList.contains("is-playing"));
    } finally { segunda.dom.window.close(); }
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
        let muescas = [...doc.querySelectorAll("#work .work-rail-tick")];
        assert.ok(muescas[0].classList.contains("is-on") && !muescas[1].classList.contains("is-on"),
            "y el raíl marca el proyecto 1");
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
        const ticks = [...doc.querySelectorAll("#work .work-rail-tick")];
        assert.ok(ticks[9].classList.contains("is-on") && !ticks[8].classList.contains("is-on"),
            "al final la muesca encendida es la del proyecto 10");
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
        const range = RUN, hold = Math.round(range * HOLD);
        const encendida = () => ticks.findIndex((tick) => tick.classList.contains("is-on"));
        const seen = [];
        for (let i = 0; i < rows.length - 1; i++) {
            // punto de scroll (con la espera inicial incluida) en el que el
            // proyecto i queda alineado a la izquierda
            scrollTo(Math.round(TOP + hold + (i * PANEL_W * (range - hold)) / RUN));
            await frame();
            seen.push(encendida());
            assert.equal(ticks.filter((tick) => tick.classList.contains("is-on")).length, 1,
                "solo una muesca encendida a la vez");
        }
        assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
        scrollTo(TOP + RUN);   // el último no llega a alinearse a la izquierda: se enciende al soltarse
        await frame();
        assert.equal(encendida(), 9, "el último proyecto se enciende al final del recorrido");
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

test("clic: en el carril no hay relevo a clon; en la lista sí se mantiene", async () => {
    const carril = boot();
    try {
        await carril.frame();
        const row = carril.rows[0];
        row.dispatchEvent(new carril.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        // Sin clon: la caja real sigue a la vista (con su número, su titular y su
        // lavado lila) hasta que entra la ficha, así que el relevo no se nota.
        assert.equal(carril.doc.querySelectorAll(".work-transition--departure").length, 0,
            "el carril no construye clon de salida");
        assert.ok(row.classList.contains("is-departing"), "la salida la cuenta la propia caja");
        assert.equal(row.style.paddingBottom, "", "el panel mide la ventana: no hay padding que crecer");
        assert.equal(row.style.paddingTop, "");
        // El rect que viaja a la ficha sigue siendo el de la caja entera.
        const guardado = JSON.parse(carril.window.sessionStorage.getItem("hfGeneratedTransition"));
        assert.equal(guardado.full, true);
        assert.equal(guardado.width, PANEL_W);
        assert.equal(guardado.left, ROW_LEFT);
        assert.equal(guardado.height, PANEL_H);
        assert.ok(!/NaN|undefined/.test(carril.window.sessionStorage.getItem("hfGeneratedTransition")));
    } finally { carril.dom.window.close(); }

    const lista = boot("index.html", { desktop: false });
    try {
        await lista.frame();
        const row = lista.rows[0];
        row.dispatchEvent(new lista.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
        const layer = lista.doc.querySelector(".work-transition--departure");
        assert.ok(layer, "en la lista vertical el clon de salida sigue siendo el de siempre");
        assert.ok(!layer.classList.contains("work-transition--full"));
        assert.equal(layer.style.width, `${PANEL_W / 2}px`);
        assert.equal(layer.style.left, `${ROW_LEFT + PANEL_W / 2}px`);
        assert.equal(JSON.parse(lista.window.sessionStorage.getItem("hfGeneratedTransition")).full, false);
        assert.notEqual(row.style.paddingBottom, "", "la lista vertical conserva el crecimiento de la caja");
    } finally { lista.dom.window.close(); }
});
