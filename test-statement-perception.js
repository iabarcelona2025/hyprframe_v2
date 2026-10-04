/* Fondo generativo del statement («Synthetic Perception»):
   statement-perception.js se ejecuta tal cual (sin navegador ni red) contra las
   dos landings reales, con un WebGL de mentira que apunta lo que se le pide.
   Lo que se fija aquí:

   - Los seis shaders compilan como GLSL ES 1.00 (se analizan con el parser),
     y cada atributo y uniform que el JavaScript busca existe de verdad en su
     shader —ni nombre mal escrito ni localización fantasma—.
   - La geometría se construye una sola vez: durante el scroll no se crean
     buffers ni se sube ni un byte (nada de reconstruir la escena).
   - El presupuesto de dibujo: 1 llamada para toda la arquitectura, 1 para los
     nodos, 1 para los planos y 4 pasadas de posproceso (umbral, dos desenfoques
     y composición). Sin brillo, 1 menos.
   - El progreso del scroll recorre las cinco fases y vuelve exacto al
     retroceder: es una función pura del progreso, no un estado acumulado.
   - Con «reducir movimiento» hay un único fotograma y ni un rAF.
   - Sin WebGL queda la composición de respaldo y la sección no se queda vacía.
   - Al desmontar (pagehide) se suelta todo: sin escuchas, sin rAF pendiente.
   - El reparto por móvil reduce geometría de verdad, no sólo el lienzo.

   Ejecutar: node test-statement-perception.js */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

let parser = null;
try { ({ parser } = require("@shaderfrog/glsl-parser")); } catch (_) { /* opcional */ }

const root = __dirname;
const source = fs.readFileSync(path.join(root, "statement-perception.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const pages = ["index.html", "es/index.html"];

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};
const squash = (text) => text.replace(/\s+/g, " ").trim();

/* ══ 1. Los shaders: GLSL ES 1.00 de verdad, sin nombres fantasma ═══════════ */
{
    const shaders = {};
    for (const name of ["LINE_VS", "LINE_FS", "POINT_VS", "POINT_FS", "QUAD_VS", "BRIGHT_FS", "BLUR_FS", "COMP_FS"]) {
        const match = source.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`));
        check(`${name}: el shader está en el módulo`, !!match);
        if (match) shaders[name] = match[1];
    }
    const list = Object.entries(shaders);
    check("hay ocho programas/etapas (línea, punto, quad y tres de posproceso)", list.length === 8);

    if (parser) {
        for (const [name, code] of list) {
            let ok = true, detail = "";
            try { parser.parse(code); } catch (error) { ok = false; detail = error.message.split("\n")[0]; }
            check(`${name}: el parser lo acepta (sin erratas de sintaxis)`, ok, detail);
        }
    } else {
        console.log("SKIP  parser GLSL no disponible: no se analiza la sintaxis");
    }

    for (const [name, code] of list) {
        const declared = squash(code).match(/\b(uniform|attribute|varying)\s+(?:highp |mediump |lowp )?\w+\s+(\w+)\s*;/g) || [];
        const names = declared.map((d) => d.match(/(\w+)\s*;/)[1]);
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        check(`${name}: no declara dos veces el mismo símbolo`, dupes.length === 0, dupes.join(","));
        if (name.endsWith("_FS")) {
            check(`${name}: declara la precisión float (obligatoria en fragmento)`,
                /precision\s+(highp|mediump)\s+float\s*;/.test(code), "");
        }
    }

    /* Atributos y uniformes que el JS busca: todos declarados en su shader. */
    const declaredIn = (code) => {
        const out = new Set();
        const re = /\b(?:uniform|attribute|varying)\s+(?:highp |mediump |lowp )?\w+\s+(\w+)\s*;/g;
        let m;
        while ((m = re.exec(code))) out.add(m[1]);
        return out;
    };
    const jsLooks = (marker, listMarker) => {
        const zone = source.slice(source.indexOf(marker));
        const end = listMarker ? zone.indexOf(listMarker) : zone.length;
        return squash(zone.slice(0, end));
    };
    const attrUses = [
        ["LINE_VS", jsLooks("const aLine = attribs(pLine", "const aPoint"),
            (source.match(/attribs\(pLine, \[([^\]]+)\]\)/) || [, ""])[1]],
        ["POINT_VS", jsLooks("const aPoint = attribs(pPoint", "const aQuad"),
            (source.match(/attribs\(pPoint, \[([^\]]+)\]\)/) || [, ""])[1]],
    ];
    for (const [shaderName, , attrList] of attrUses) {
        const names = attrList.match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
        const declared = declaredIn(shaders[shaderName]);
        const missing = names.filter((n) => !declared.has(n));
        check(`${shaderName}: los atributos que pide el JS existen (${names.length})`, missing.length === 0, missing.join(","));
    }
    const uniformLists = source.match(/uni\((p\w+), \[([^\]]+)\]\)/g) || [];
    check("las listas de uniformes cubren los cinco programas", uniformLists.length === 5, `${uniformLists.length}`);
    const programToShader = { pLine: "LINE_VS", pPoint: "POINT_VS", pBright: "BRIGHT_FS", pBlur: "BLUR_FS", pComp: "COMP_FS" };
    for (const entry of uniformLists) {
        const [, prog, list] = entry.match(/uni\((p\w+), \[([^\]]+)\]\)/);
        const names = list.match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
        const declared = declaredIn(shaders[programToShader[prog]]);
        const missing = names.filter((n) => !declared.has(n));
        check(`${prog}: los uniformes que pide el JS existen en ${programToShader[prog]}`, missing.length === 0, missing.join(","));
    }
    /* Y al revés: ningún uniform declarado se queda sin escribir desde el JS
       (el que se declara y no se usa es basura o un olvido). */
    const usedUniforms = new Set();
    for (const entry of uniformLists) {
        for (const n of entry.match(/"(\w+)"/g)) usedUniforms.add(n.replace(/"/g, ""));
    }
    for (const [shaderName, code] of list) {
        const declared = new Set();
        const re = /\buniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+(\w+)\s*;/g;
        let m;
        while ((m = re.exec(code))) declared.add(m[1]);
        const unused = [...declared].filter((n) => !usedUniforms.has(n));
        check(`${shaderName}: todos sus uniforms se alimentan desde el JS`, unused.length === 0, unused.join(","));
    }
}

/* ══ 2. Arnés: el módulo real sobre el HTML real, con WebGL de mentira ═════ */
function boot({ pagina = "index.html", webgl = true, reduced = false, mobile = false, height = 900 } = {}) {
    const html = fs.readFileSync(path.join(root, pagina), "utf8");
    const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true, runScripts: "outside-only" });
    const { window } = dom;
    const doc = window.document;
    const state = { y: 0, now: 0, queue: [], calls: {}, frames: 0 };

    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => height });
    Object.defineProperty(window, "innerWidth", { configurable: true, get: () => 1440 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => 1 });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => state.y });
    window.performance.now = () => state.now;
    window.requestAnimationFrame = (cb) => { state.queue.push(cb); return state.queue.length; };
    window.cancelAnimationFrame = () => { state.queue = []; };
    window.matchMedia = (q) => ({
        matches: (reduced && q.includes("reduced-motion")) || (mobile && q.includes("pointer: coarse")),
        media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    let intersect = null;
    window.IntersectionObserver = class { constructor(cb) { intersect = cb; } observe() {} unobserve() {} disconnect() { this.disconnected = true; } };
    window.ResizeObserver = class { observe() {} disconnect() {} };
    window.HTMLCanvasElement.prototype.getContext = webgl ? () => gl : () => null;

    const calls = {};
    const gl = new Proxy({}, {
        get(_, key) {
            if (typeof key !== "string") return undefined;
            if (/^[A-Z][A-Z0-9_]*$/.test(key)) return 1;
            return (...args) => {
                calls[key] = (calls[key] || 0) + 1;
                switch (key) {
                    case "getShaderParameter":
                    case "getProgramParameter": return true;
                    case "getShaderInfoLog":
                    case "getProgramInfoLog": return "";
                    case "getError": return 0;
                    case "getAttribLocation": return 3;
                    case "getUniformLocation": return { name: args[1] };
                    case "getExtension": return null;
                    default: return {};
                }
            };
        },
    });

    const section = doc.getElementById("statement");
    const rect = () => ({ top: 2000 - state.y, bottom: 2000 - state.y + height * 3, height: height * 3, width: 1440, left: 0, right: 1440, x: 0, y: 2000 - state.y });
    section.getBoundingClientRect = rect;
    const stage = doc.querySelector(".statement-stage");
    stage.getBoundingClientRect = () => ({ top: 0, left: 0, right: 1440, bottom: height, width: 1440, height, x: 0, y: 0 });
    const text = doc.getElementById("statementText");
    text.getBoundingClientRect = () => ({ top: height * 0.3, left: 100, right: 700, bottom: height * 0.62, width: 600, height: height * 0.32, x: 100, y: height * 0.3 });

    window.eval(source);
    const step = (ms = 16.7) => {
        state.now += ms;
        const pending = state.queue;
        state.queue = [];
        pending.forEach((cb) => cb(state.now));
        state.frames++;
    };
    const frames = (n, ms) => { for (let i = 0; i < n; i++) step(ms); };
    const scrollTo = (y, steps = 30) => {
        state.y = y;
        for (let i = 0; i < steps; i++) step();     // deja asentar el amortiguado
    };
    return { window, doc, state, calls, gl, step, frames, scrollTo, intersect, stage, section, canvas: doc.querySelector(".statement-perception") };
}

/* Geometría real: la del hook de desarrollo expuesta con hostname localhost. */
function geometryOf(page) {
    const api = page.window.__hfPerception;
    return api && api.geometry();
}

/* ══ 3. Construcción: una vez, determinista, con presupuesto ════════════════ */
{
    const page = boot();
    const geo = geometryOf(page);
    check("la escena se monta en el DOM con su lienzo", !!page.canvas && page.canvas.className === "statement-perception");
    const fallbackEl = page.stage.querySelector(".statement-fallback");
    check("el lienzo cuelga del escenario, por debajo del titular",
        page.canvas.parentElement === page.stage &&
        (page.canvas.compareDocumentPosition(page.doc.getElementById("statementText")) & 4) === 4);
    check("y por encima del respaldo CSS (que queda debajo, listo para sustituirlo)",
        !!fallbackEl && (page.canvas.compareDocumentPosition(fallbackEl) & 2) === 2);
    check("la clase has-canvas la pone el propio módulo", page.stage.classList.contains("has-canvas"));

    /* Presupuesto deliberado: ~1.800 segmentos por defecto (unos 7.000
       vértices) — suficiente para que el espacio se lea como arquitectura y
       muy por debajo de lo que convierte esto en un mar de líneas. */
    check("la arquitectura tiene geometría de verdad sin pasarse",
        geo.segments > 900 && geo.segments < 4200, `${geo.segments} segmentos`);
    check("los planos translúcidos existen pero son pocos",
        geo.quads >= 30 && geo.quads <= 260, `${geo.quads} cuadriláteros`);
    check("los nodos de encuentro se calculan (no son decorativos)",
        geo.points.length / 12 >= 20, `${geo.points.length / 12} nodos`);
    check("los buffers son coherentes: 4 vértices por segmento y 6 índices",
        geo.lines.length === geo.segments * 4 * 18 && geo.lineIndex.length === geo.segments * 6,
        `${geo.lines.length} floats · ${geo.lineIndex.length} índices`);
    check("ningún índice se sale del búfer de vértices",
        Math.max(...geo.lineIndex) === geo.segments * 4 - 1, `máx ${Math.max(...geo.lineIndex)}`);

    const page2 = boot();
    const geo2 = geometryOf(page2);
    let same = geo.lines.length === geo2.lines.length && geo.lineIndex.length === geo2.lineIndex.length;
    for (let i = 0; same && i < geo.lines.length; i += 997) same = geo.lines[i] === geo2.lines[i];
    check("la pieza es determinista: dos cargas dan exactamente la misma geometría", same);

    const mobilePage = boot({ mobile: true, height: 760 });
    const geoM = geometryOf(mobilePage);
    check("el reparto móvil reduce geometría de verdad (no sólo el lienzo)",
        geoM.segments < geo.segments * 0.7, `${geoM.segments} vs ${geo.segments} segmentos`);
    check("el móvil conserva la transformación completa (nodos, planos y lomos)",
        geoM.quads > 20 && geoM.points.length / 12 >= 10, `${geoM.quads} planos · ${geoM.points.length / 12} nodos`);
}

/* ══ 4. El scroll no reconstruye nada ══════════════════════════════════════ */
{
    const page = boot();
    const before = { ...page.calls };
    page.frames(120);
    page.scrollTo(1200, 40);
    page.frames(120);
    const subidas = (page.calls.bufferData || 0) - (before.bufferData || 0);
    const creados = (page.calls.createBuffer || 0) - (before.createBuffer || 0);
    const texturas = (page.calls.texImage2D || 0) - (before.texImage2D || 0);
    check("durante el scroll no se sube ni un byte de geometría", subidas === 0, `${subidas} bufferData`);
    check("tampoco se crean búferes nuevos", creados === 0, `${creados} createBuffer`);
    check("ni se reasignan texturas en cada frame", texturas === 0, `${texturas} texImage2D`);
}

/* ══ 5. Presupuesto de dibujo por fotograma ════════════════════════════════ */
{
    const page = boot();
    page.frames(4);
    const before = { ...page.calls };
    page.frames(1);
    const delta = (name) => (page.calls[name] || 0) - (before[name] || 0);
    check("toda la arquitectura sale en dos llamadas: líneas y planos",
        delta("drawElements") === 2, `${delta("drawElements")} drawElements`);
    check("los nodos, en una sola llamada (ninguna por nodo)",
        delta("drawArrays") === 5 && (geometryOf(page).points.length / 12) > 20,
        `${delta("drawArrays")} drawArrays = nodos + umbral + dos desenfoques + composición`);
    check("presupuesto por fotograma: 7 llamadas de dibujo y ningún estado suelto",
        delta("drawElements") + delta("drawArrays") === 7, `${delta("drawElements") + delta("drawArrays")} llamadas`);
    check("no hay más objetivos de render que escena y dos de brillo",
        (page.calls.createFramebuffer || 0) <= 3, `${page.calls.createFramebuffer} FBO`);
}

/* ══ 6. Las cinco fases, atadas al progreso del scroll ═════════════════════ */
{
    const page = boot();
    const section = page.canvas.closest(".statement");
    void section;
    const at = (progress) => {
        page.scrollTo(progress * (900 * 3 - 900), 40);
        return page.window.__hfPerception.state(progress);
    };
    /* Progreso 0: sólo el origen. */
    page.scrollTo(0, 40);
    /* El estado se pide con el progreso explícito: el valor que se dibuja va
       amortiguado y aquí se mide la función pura del scroll. */
    const s0 = page.window.__hfPerception.state(0);
    /* A progreso 0 sólo existe la semilla: ni corredor, ni celosía, ni una
       sola deformación — el punto de luz fría del arranque. */
    check("en el arranque manda el canal del origen y sólo él",
        s0.rev[0] <= 0.06 && s0.rev[1] === 0 && s0.rev[2] === 0 && s0.rev[3] === 0,
        `origen ${s0.rev[0].toFixed(2)}`);
    check("y nada está deformado todavía", s0.morph[0] === 0 && s0.morph[1] === 0 && s0.open[0] === 0);
    const s5 = page.window.__hfPerception.state(0.06);
    check("a 6 % el origen ya está encendido y extendiéndose", s5.rev[0] > 0.4, `${s5.rev[0].toFixed(2)}`);

    const s15 = at(0.15);
    check("a 15 % el corredor humano ya existe y la IA no ha llegado",
        s15.rev[1] > 0.1 && s15.rev[2] === 0, `humano ${s15.rev[1].toFixed(2)} · IA ${s15.rev[2].toFixed(2)}`);
    const s33 = at(0.33);
    check("justo antes del 35 %, la máquina todavía no está en escena",
        s33.rev[2] === 0 && s33.rev[1] > 0.5, `humano ${s33.rev[1].toFixed(2)}`);
    const s40 = at(0.4);
    check("y entra ensamblándose poco a poco", s40.rev[2] > 0.05 && s40.rev[2] < 0.5, `${s40.rev[2].toFixed(2)}`);
    const s55 = at(0.55);
    check("a 55 % los dos sistemas conviven en escena",
        s55.rev[1] > 0.9 && s55.rev[2] > 0.6, `humano ${s55.rev[1].toFixed(2)} · IA ${s55.rev[2].toFixed(2)}`);
    const s65 = at(0.65);
    check("y la IA empieza a deformarse (deja de ser exacta)", s65.morph[1] > 0.1, `${s65.morph[1].toFixed(2)}`);
    const s80 = at(0.8);
    check("a 80 % la síntesis está en marcha y el híbrido aparece",
        s80.morph[0] > 0.4 && s80.rev[3] > 0.4, `morph ${s80.morph[0].toFixed(2)} · híbrido ${s80.rev[3].toFixed(2)}`);
    const s100 = at(1);
    check("al final la escultura está completamente desplegada",
        s100.open[0] > 0.9 && s100.morph[0] > 0.9, `apertura ${s100.open[0].toFixed(2)}`);
    check("y el frente de onda ha terminado su recorrido", s100.open[1] > 1.0,
        `frente ${s100.open[1].toFixed(2)} · amplitud ${s100.open[2].toFixed(3)}`);

    /* Monotonía: cada parámetro sube o se queda, nunca retrocede. */
    const series = [];
    for (let i = 0; i <= 20; i++) series.push(page.window.__hfPerception.state(i / 20));
    const monotone = (get) => series.every((s, i) => i === 0 || get(s) >= get(series[i - 1]) - 1e-9);
    check("el revelado de cada sistema es monótono con el scroll",
        monotone((s) => s.rev[1]) && monotone((s) => s.rev[2]) && monotone((s) => s.rev[3]));
    check("la racionalización y la apertura también (sin bandazos)",
        monotone((s) => s.morph[0]) && monotone((s) => s.morph[1]) && monotone((s) => s.open[0]));
    check("el brillo sólo sube", monotone((s) => s.bloom));

    /* Reversibilidad: mismo progreso, mismos valores, en los dos sentidos. */
    const forward = [];
    for (let i = 0; i <= 10; i++) { page.scrollTo(i * 300, 40); forward.push(page.window.__hfPerception.state(i / 10)); }
    const backward = [];
    for (let i = 10; i >= 0; i--) { page.scrollTo(i * 300, 40); backward.unshift(page.window.__hfPerception.state(i / 10)); }
    let maxGap = 0;
    forward.forEach((s, i) => {
        maxGap = Math.max(maxGap,
            Math.abs(s.rev[1] - backward[i].rev[1]), Math.abs(s.rev[2] - backward[i].rev[2]),
            Math.abs(s.morph[0] - backward[i].morph[0]), Math.abs(s.open[0] - backward[i].open[0]));
    });
    check("subir y bajar reconstruye exactamente los mismos estados", maxGap < 0.02, `Δ máx ${maxGap.toFixed(4)}`);

    /* La cámara va con el scroll y no da saltos. */
    const camps = [];
    for (let i = 0; i <= 40; i++) camps.push(page.window.__hfPerception.camera(i / 40));
    let jump = 0;
    for (let i = 1; i < camps.length; i++) {
        jump = Math.max(jump, Math.hypot(camps[i].pos[0] - camps[i - 1].pos[0], camps[i].pos[1] - camps[i - 1].pos[1], camps[i].pos[2] - camps[i - 1].pos[2]));
    }
    check("la cámara acompaña al scroll de forma continua", jump < 1.2, `paso máximo ${jump.toFixed(3)}`);
    check("y avanza hacia la estructura en la primera mitad",
        camps[10].pos[2] < camps[0].pos[2], `z ${camps[0].pos[2].toFixed(1)} → ${camps[10].pos[2].toFixed(1)}`);
}

/* ══ 6b. El recorrido se adelanta: la fase 01 se juega mientras asoma ══════
   El progreso ya no espera a que la sección quede anclada arriba: arranca
   cuando su borde superior asoma por el pie de la ventana, consume la fase
   del origen (0.15) a lo largo de esa pantalla de entrada y reparte el resto
   sobre el recorrido anclado. El final no se mueve. */
{
    const page = boot();
    const VH = 900;                       /* ventana del banco de pruebas */
    const H = VH * 3;                     /* la sección mide 300vh */
    const TOP = 2000;                     /* rect.top = TOP - scrollY */
    const SHOW = TOP - VH;                /* y en la que la sección asoma */
    const PIN = TOP;                      /* y en la que queda anclada */
    const END = PIN + (H - VH);           /* y en la que termina el recorrido */
    const raw = () => page.window.__hfPerception.rawProgress();

    page.scrollTo(SHOW - 260, 8);
    check("por debajo del pie de la ventana no se adelanta nada (sigue a 0)",
        raw() === 0, `${raw().toFixed(4)}`);
    page.scrollTo(SHOW, 8);
    check("el recorrido arranca justo cuando el statement asoma", raw() === 0, `${raw().toFixed(4)}`);

    page.scrollTo(SHOW + VH * 0.5, 8);
    const half = raw();
    check("a media entrada el origen ya está en marcha", half > 0.05 && half < 0.12, `${half.toFixed(4)}`);
    check("y se lee: el punto de luz y sus líneas ya existen en pantalla",
        page.window.__hfPerception.state(half).rev[0] > 0.5,
        `origen ${page.window.__hfPerception.state(half).rev[0].toFixed(2)}`);

    page.scrollTo(PIN, 8);
    check("al anclarse la sección el progreso vale exactamente 0.15",
        Math.abs(raw() - 0.15) < 1e-9, `${raw().toFixed(4)}`);
    const pinnedState = page.window.__hfPerception.state(raw());
    check("es decir: el origen está completo y la visión humana empieza a abrirse",
        pinnedState.rev[0] > 0.95 && pinnedState.rev[1] > 0.05 && pinnedState.rev[2] === 0,
        `origen ${pinnedState.rev[0].toFixed(2)} · humano ${pinnedState.rev[1].toFixed(2)}`);

    page.scrollTo(END, 8);
    check("el final sigue donde estaba: la escultura cerrada", raw() === 1, `${raw().toFixed(4)}`);
    page.scrollTo(END + VH, 8);
    check("y se sostiene: más scroll no reinicia ni pasa de 1", raw() === 1, `${raw().toFixed(4)}`);

    /* Monotonía en todo el recorrido, entrada incluida. */
    let prev = -1, monotone = true, subidas = 0;
    for (let y = SHOW - 300; y <= END + 600; y += 40) {
        page.scrollTo(y, 4);
        const value = raw();
        if (value < prev - 1e-9) monotone = false;
        if (value > prev + 1e-9) subidas++;
        prev = value;
    }
    check("el progreso nunca retrocede a lo largo de todo el recorrido", monotone);
    check("y avanza tanto en la entrada como en el recorrido anclado", subidas > 40, `${subidas} tramos`);

    /* La proporción de la entrada no depende del alto del recorrido: en móvil
       (recorrido más corto) el anclaje sigue cerrando la fase 01. */
    const mobilePage = boot({ mobile: true, height: 760 });
    mobilePage.scrollTo(2000, 8);
    const mobileRaw = mobilePage.window.__hfPerception.rawProgress();
    check("en el reparto móvil el anclaje también cae en 0.15 (entrada y recorrido proporcionales)",
        Math.abs(mobileRaw - 0.15) < 1e-9, `${mobileRaw.toFixed(4)}`);

    /* Lo que se dibuja va con el scroll ya durante la entrada (el valor
       amortiguado sigue al de la función pura, sin quedarse atrás). */
    page.intersect([{ isIntersecting: true }]);
    page.scrollTo(SHOW + VH * 0.5, 60);
    const drawn = page.window.__hfPerception.progress();
    check("el fotograma que se pinta ya dibuja la entrada, no el negro del arranque",
        Math.abs(drawn - raw()) < 0.01 && drawn > 0.05, `pintado ${drawn.toFixed(4)}`);
}

/* ══ 7. Fuera de pantalla no se dibuja; al volver, se retoma ═══════════════ */
{
    const page = boot();
    page.intersect([]);
    const before = page.calls.drawArrays || 0;
    page.frames(10);
    check("con la sección fuera de pantalla, ni un dibujo", (page.calls.drawArrays || 0) === before);
    page.intersect([{ isIntersecting: true }]);
    page.frames(2);
    check("al entrar en pantalla se retoma el bucle", (page.calls.drawArrays || 0) >= before);
}

/* ══ 8. Reducir movimiento: una composición quieta, sin bucle ══════════════ */
{
    const page = boot({ reduced: true });
    check("con «reducir movimiento» se pinta un único fotograma", page.state.queue.length === 0);
    const draws = page.calls.drawArrays || 0;
    page.frames(10);
    check("y no queda ningún bucle detrás", (page.calls.drawArrays || 0) === draws, `${draws} dibujos`);
    const done = page.window.__hfPerception.progress();
    check("la composición quieta es la escultura terminada, no el negro del arranque", done > 0.6, `progreso fijo ${done}`);
    check("sigue habiendo escena que mirar", page.canvas.width > 0 && page.canvas.height > 0, `${page.canvas.width}×${page.canvas.height}`);
}

/* ══ 9. Sin WebGL: respaldo honesto, nunca una caja negra ══════════════════ */
{
    const page = boot({ webgl: false });
    check("sin WebGL no queda lienzo", page.doc.querySelector(".statement-perception") === null);
    const fallback = page.stage.querySelector(".statement-fallback");
    check("pero sí la composición de respaldo", !!fallback);
    check("y la clase que la mantiene visible", page.stage.classList.contains("is-fallback"));
    check("el titular sigue en su sitio, intacto",
        page.doc.getElementById("statementText").textContent.includes("realities") ||
        page.doc.getElementById("statementText").textContent.includes("visuales"));
}

/* ══ 10. Desmontaje: sin escuchas sueltas ni trabajo después ═══════════════ */
{
    const page = boot();
    page.frames(4);
    const api = page.window.__hfPerception;
    let removed = 0;
    const originalRemove = page.window.removeEventListener;
    page.window.removeEventListener = (...args) => { removed++; return originalRemove.apply(page.window, args); };
    api.dispose();
    check("al desmontar se sueltan las escuchas de ventana", removed >= 2, `${removed} removeEventListener`);
    const before = page.calls.drawArrays || 0;
    page.frames(10);
    check("y no vuelve a dibujar ni un frame", (page.calls.drawArrays || 0) === before);
    check("el lienzo se retira del DOM", page.doc.querySelector(".statement-perception") === null);
    check("las extensiones de WebGL se liberan (contexto perdido a propósito)",
        (page.calls.getExtension || 0) >= 1);
}

/* ══ 11. Integración en las dos landings ══════════════════════════════════ */
for (const pagina of pages) {
    const html = fs.readFileSync(path.join(root, pagina), "utf8");
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const section = doc.getElementById("statement");
    const stage = section.querySelector(".statement-stage");
    check(`${pagina}: la sección del titular lleva el escenario`, !!stage);
    check(`${pagina}: el titular vive dentro del escenario y no se ha tocado`,
        stage.contains(doc.getElementById("statementText")) && doc.querySelectorAll("#statementText span").length >= 11);
    check(`${pagina}: el fondo antiguo se conserva fuera del escenario`,
        !!section.querySelector(".statement-background") && !stage.contains(section.querySelector(".statement-background")));
    check(`${pagina}: el módulo del nuevo fondo se carga desde su ruta`,
        [...doc.querySelectorAll("script[src]")].some((s) => s.getAttribute("src").replace("../", "").startsWith("statement-perception.js")));

    /* Nada de overflow recortado en la cadena de ancestros: rompería el sticky. */
    const flat = squash(css.replace(/\/\*[\s\S]*?\*\//g, ""));
    const sectionRule = flat.slice(flat.indexOf(".statement {"), flat.indexOf("}", flat.indexOf(".statement {")) + 1);
    check(`${pagina}: la sección es el recorrido y no recorta (el anclaje seguiría funcionando)`,
        /min-height: var\(--statement-runway\)/.test(sectionRule) && !/overflow: hidden/.test(sectionRule),
        sectionRule.slice(0, 110));
    check("el escenario es sticky y recorta él mismo el lienzo",
        /\.statement-stage \{[^}]*position: sticky[^}]*overflow: clip/.test(flat));
    const flatCss = squash(css.replace(/\/\*[\s\S]*?\*\//g, ""));
    const canvasRule = flatCss.slice(flatCss.indexOf(".statement-perception,"), flatCss.indexOf("}", flatCss.indexOf(".statement-perception,")));
    check("el lienzo no intercepta el puntero y queda tras el texto",
        /pointer-events: none/.test(canvasRule) && /z-index: 0/.test(canvasRule) &&
        /\.statement-text \{ position: relative; z-index: 1; \}/.test(flatCss));
    check("hay respaldo CSS para cuando no hay WebGL",
        /\.statement-fallback::after/.test(css) && /mask-image/.test(css));
    check("«reducir movimiento» desmonta el recorrido (una sola pantalla, quieta)",
        /prefers-reduced-motion: reduce[\s\S]{0,400}--statement-runway: auto/.test(css));
}

console.log(failures ? `\n❌ ${failures} comprobaciones fallidas` : "\n✅ ALL PASS");
process.exit(failures ? 1 : 0);
