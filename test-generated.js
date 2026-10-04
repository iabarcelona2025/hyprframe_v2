/* Smoke test de la sección GENERATED: las 10 páginas de vídeo comparten el
   esqueleto, el estilo y el script (styles.css + generated.css + generated.js).
   project-node.html (N.O.D.E.) abre la lista porque es la pieza de referencia:
   sus particularidades —los cuatro puntos del titular, el reproductor heredado
   de Captured, el ciclo del vídeo— se comprueban aquí, y el resto de páginas se
   recorren en bucle contra esa misma plantilla. Se comprueba que ninguna se ha
   quedado con restos del diseño anterior y que el reproductor de cada una
   apunta a su propio Vimeo. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
/* Los CSS llevan comentarios con la fecha de cada ajuste. Antes de leer una
   declaración se limpian: una regex que no salte los comentarios devuelve null
   en cuanto hay una nota delante de la propiedad. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const squash = (text) => text.replace(/\s+/g, " ").trim();
const ruleOf = (source, selector) => {
    const flat = squash(source);
    const start = flat.indexOf(`${squash(selector)} {`);
    assert.ok(start !== -1, `no encuentro la regla «${selector}»`);
    return flat.slice(start, flat.indexOf("}", start) + 1);
};
const declaration = (rule, property) => {
    const match = rule.match(new RegExp(`(?:^|[;{]\\s*)${property}: ([^;]+);`));
    assert.ok(match, `no encuentro «${property}» en ${rule}`);
    return match[1];
};

/* Las diez piezas de la sección, en el orden de SELECTED WORK de la landing:
   N.O.D.E. y, después, las nueve que comparten su plantilla. */
const PAGES = [
    // La página de referencia conserva de momento el titular de portada del
    // estudio en <title> (su og:title sí nombra la pieza).
    { file: "project-node.html", vimeo: "1227346538", piece: "N.O.D.E.", aria: "N.O.D.E. [Teaser]",
      pageTitle: "N.O.D.E — Generative AI Video | HYPRFRAME" },
    { file: "project-deep.html", vimeo: "1185276367", piece: "Deep in the Forest", aria: "Deep in the Forest [Teaser]" },
    { file: "project-polestar5.html", vimeo: "1180539625", piece: "Polestar 5", aria: "Polestar 5" },
    { file: "project-distant.html", vimeo: "1164823364", piece: "Distant", aria: "Distant [Trailer]" },
    { file: "project-exit.html", vimeo: "1141629024", piece: "Exit Plan", aria: "Exit Plan" },
    { file: "project-stained.html", vimeo: "1126933718", piece: "Stained", aria: "Stained" },
    { file: "project-asics.html", vimeo: "1131296888", piece: "Asics Vulcano", aria: "Asics Vulcano" },
    { file: "project-farewell.html", vimeo: "1148202010", piece: "Farewell", aria: "Farewell" },
    { file: "project-iad.html", vimeo: "1159850270", piece: "IAD Annual Meeting", aria: "IAD Annual Meeting" },
    { file: "project-ryuu.html", vimeo: "1136653573", piece: "Ryuu, the Dragon's Course", aria: "Ryuu, the Dragon's Course [Trailer]" },
];
const ALL = PAGES.map((page) => page.file);

const indexDoc = new JSDOM(read("index.html")).window.document;
const script = read("generated.js");
const css = read("generated.css");
const navLabels = (doc, selector) => [...doc.querySelectorAll(selector)].map((el) => el.textContent.trim());
const seenTitles = new Map();

assert.ok(!script.includes("1227346538"), "generated.js no hardcodea el vídeo de N.O.D.E.");
assert.match(script, /dataset\.vimeo/, "generated.js lee el vídeo del marcado de cada página");
// El cursor propio (cruceta, punto y rollover) está desactivado desde el 29/09/2026:
// generated.js ya no lo arranca y las diez fichas no llevan sus nodos.
assert.doesNotMatch(script, /CURSOR_KEY|hfCursor|cursorDot|cursorRing|cursor-large/,
    "generated.js no arranca ningún cursor propio");

/* Reproducción bajo demanda de una pieza: Vimeo no se carga hasta el play, solo
   el propio Vimeo revela el reproductor (ni el load del iframe ni un mensaje de
   otro origen), el final devuelve el fotograma y el foco al botón, y una
   segunda reproducción funciona igual. */
/* Retiene los dos tiempos de la ventana: la apertura (800ms, tras el fundido
   del título) y, desde el 03/10/2026, el aterrizaje del cierre (la red de
   seguridad de 650ms de la X: en jsdom no hay transitionend). La función
   devuelta abre la ventana; su método .land() hace aterrizar el cierre. */
function holdWindowOpen(window) {
    const held = [];
    const landing = [];
    const real = window.setTimeout.bind(window);
    const realClear = window.clearTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => {
        if (ms === 800) { held.push(fn); return -800; }
        if (ms === 650) { landing.push(fn); return -650; }
        return real(fn, ms, ...args);
    };
    window.clearTimeout = (id) => {
        if (id === -800) { held.length = 0; return; }
        if (id === -650) { landing.length = 0; return; }
        return realClear(id);
    };
    const openWindow = () => held.splice(0).forEach((fn) => fn());
    openWindow.land = () => landing.splice(0).forEach((fn) => fn());
    return openWindow;
}

function exercisePlayer(window, doc, page) {
    const fromVimeo = (data, { origin = "https://player.vimeo.com", source = window.document.querySelector(".node-player iframe")?.contentWindow } = {}) =>
        window.dispatchEvent(new window.MessageEvent("message", { origin, source, data }));
    assert.equal(doc.querySelector(".node-player iframe"), null, `${page.file}: Vimeo no se carga antes del play`);
    const posterSrc = doc.querySelector(".node-player > img").getAttribute("src");
    const playerEl = doc.querySelector(".node-player");
    let fullscreenCalls = 0;
    playerEl.requestFullscreen = () => { fullscreenCalls += 1; return Promise.resolve(); };
    playerEl.webkitRequestFullscreen = playerEl.requestFullscreen;
    const openWindow = holdWindowOpen(window);
    doc.getElementById("playFilm").click();
    assert.ok(playerEl.classList.contains("is-playing"), `${page.file}: el fundido del título empieza al pulsar play`);
    assert.ok(!playerEl.classList.contains("is-windowed"), `${page.file}: el vídeo no se amplía hasta que acaba el fundido`);
    openWindow();
    const iframe = doc.querySelector(".node-player iframe");
    assert.equal(fullscreenCalls, 0, `${page.file}: la web no entra en el fullscreen del navegador`);
    assert.ok(playerEl.classList.contains("is-windowed"), `${page.file}: el vídeo ocupa la ventana del navegador`);
    assert.ok(doc.querySelector(".node-player__exit"), `${page.file}: se puede salir de la ventana sin fullscreen`);
    assert.ok(!iframe.src.includes("playsinline=0"), `${page.file}: la web no pide el fullscreen nativo de Vimeo`);
    assert.match(iframe.src, /sidedock=0&like=0&share=0/, `${page.file}: se pide a Vimeo que no pinte los botones de arriba a la derecha`);
    assert.ok(!iframe.src.includes("controls=0"), `${page.file}: los mandos inferiores de Vimeo siguen`);
    assert.ok(doc.querySelector(".node-player__shield"), `${page.file}: el rollover no arranca sobre la imagen`);
    assert.ok(doc.querySelector(".node-player__dock"), `${page.file}: la esquina superior derecha queda cubierta si Vimeo insiste`);
    assert.ok(doc.querySelector(".node-player").classList.contains("is-playing"), `${page.file}: la caja de vídeo queda en primer plano`);
    assert.equal(doc.querySelector(".film-page-dimmer"), null, `${page.file}: ya no se crea el velo — la ventana cubre la página (limpieza 03/10/2026)`);
    assert.ok(!doc.body.classList.contains("film-is-playing"), `${page.file}: la página no entra en ningún estado de oscurecimiento`);
    assert.ok(doc.querySelector(".node-player > .node-hero__title"), `${page.file}: el título sigue como capa y puede desvanecerse`);
    const sent = [];
    iframe.contentWindow.postMessage = (message, targetOrigin) => sent.push({ message, targetOrigin });
    assert.match(iframe.src, new RegExp(`player\\.vimeo\\.com/video/${page.vimeo}\\?autoplay=1&dnt=1&transparent=0`));
    assert.equal(iframe.title, `${doc.querySelector(".node-player").dataset.title} — HYPRFRAME`);
    assert.ok(!iframe.classList.contains("is-ready"), `${page.file}: el iframe sigue oculto sobre negro mientras carga`);
    iframe.dispatchEvent(new window.Event("load"));
    assert.ok(!iframe.classList.contains("is-ready"), `${page.file}: el load del iframe no basta para enseñar un fotograma en blanco`);
    fromVimeo(JSON.stringify({ event: "ready" }), { origin: "https://example.com", source: iframe.contentWindow });
    assert.ok(!iframe.classList.contains("is-ready"), `${page.file}: solo Vimeo revela el reproductor`);
    fromVimeo(JSON.stringify({ event: "ready" }), { source: iframe.contentWindow });
    assert.ok(iframe.classList.contains("is-ready"), `${page.file}: el reproductor aparece solo cuando Vimeo está listo`);
    assert.deepEqual(JSON.parse(JSON.stringify(sent)),
        [{ message: { method: "addEventListener", value: "ended" }, targetOrigin: "https://player.vimeo.com" }],
        `${page.file}: se pide a Vimeo que avise del final`);
    // Cuando la pieza acaba, vuelven el fotograma y su botón de play.
    // (JSON round-trip: el objeto se creó en el realm de la página, no en Node.)
    fromVimeo(JSON.stringify({ event: "ended" }), { origin: "https://example.com", source: iframe.contentWindow });
    assert.ok(doc.querySelector(".node-player iframe"), `${page.file}: solo Vimeo puede dar por acabada la pieza`);
    assert.equal(doc.activeElement, iframe, `${page.file}: el foco sigue en el reproductor que acaba`);
    fromVimeo(JSON.stringify({ event: "ended", data: { seconds: 171, percent: 1, duration: 171 } }), { source: iframe.contentWindow });
    assert.equal(doc.querySelector(".node-player iframe"), iframe, `${page.file}: el vídeo queda encima durante la salida`);
    assert.ok(iframe.classList.contains("is-ending"), `${page.file}: se cierran las bandas del vídeo`);
    assert.equal(iframe.getAttribute("aria-hidden"), "true", `${page.file}: el vídeo saliente no es accesible`);
    assert.equal(doc.querySelector(".node-player > img").getAttribute("src"), posterSrc, `${page.file}: vuelve el fotograma detrás del vídeo`);
    assert.equal(doc.querySelector(".node-player > .node-player__play"), doc.getElementById("playFilm"), `${page.file}: con su botón de play`);
    assert.equal(doc.activeElement, doc.getElementById("playFilm"), `${page.file}: el foco pasa del reproductor al botón de play`);
    const exit = new window.Event("transitionend");
    Object.defineProperty(exit, "propertyName", { value: "opacity" });
    iframe.dispatchEvent(exit);
    assert.equal(doc.querySelector(".node-player iframe"), null, `${page.file}: el iframe se retira después de la animación`);
    doc.getElementById("playFilm").click();
    const replay = doc.querySelector(".node-player iframe");
    replay.contentWindow.postMessage = () => {};
    assert.match(replay.src, new RegExp(`player\\.vimeo\\.com/video/${page.vimeo}\\?autoplay=1`), `${page.file}: la pieza se puede volver a reproducir`);
    doc.querySelector(".node-pager__link").focus(); // el espectador ya está en otra parte de la página
    fromVimeo(JSON.stringify({ event: "ready" }), { source: replay.contentWindow });
    fromVimeo(JSON.stringify({ event: "ended" }), { source: replay.contentWindow });
    assert.ok(doc.querySelector(".node-player > img"), `${page.file}: el fotograma vuelve también tras repetir`);
    assert.equal(doc.activeElement, doc.querySelector(".node-pager__link"), `${page.file}: no se roba el foco si el espectador está en otro sitio`);
    replay.dispatchEvent(exit);
    assert.equal(doc.querySelector(".node-player iframe"), null, `${page.file}: la segunda salida también se limpia`);
}

for (const page of PAGES) {
    const html = read(page.file);
    const dom = new JSDOM(html, {
        url: `http://localhost:8080/${page.file}`, runScripts: "outside-only", pretendToBeVisual: true,
    });
    const { window } = dom;
    const doc = window.document;
    window.matchMedia = (q) => ({
        matches: false, media: q,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
    });
    const errors = [];
    window.addEventListener("error", (event) => errors.push(event.message));

    try {
        /* ── Cabecera: analítica, consentimiento y estilos de la sección ── */
        assert.match(html, /gtag\('config', 'G-6MW201KGC9'\)/, `${page.file}: falta el gtag`);
        assert.equal(doc.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]').length, 1);
        assert.match(html, /window\.HYPRFRAME_CONSENT_MODE\s*=\s*true/);
        assert.ok(html.indexOf("window.HYPRFRAME_CONSENT_MODE") < html.indexOf("googletagmanager.com/gtag/js"),
            `${page.file}: el interruptor de consentimiento va antes que gtag.js`);
        for (const style of ["styles.css", "generated.css"]) {
            assert.ok(doc.querySelector(`link[href^="${style}"]`), `${page.file}: no carga ${style}`);
        }
        assert.equal(doc.querySelector('link[href^="generated.css"]').getAttribute("href"), "generated.css?v=89");
        assert.equal(doc.querySelector('script[src^="generated.js"]').getAttribute("src"), "generated.js?v=31");
        assert.ok(!doc.querySelector("style"), `${page.file}: todavía lleva CSS inline`);
        // Kanit → Montserrat: las diez páginas cargan la misma familia y sus pesos
        assert.ok(!/family=Kanit/.test(html), `${page.file}: todavía carga Kanit`);
        assert.match(html, /family=Montserrat:ital,wght@0,600;0,700;0,800;1,700;1,800/,
            `${page.file}: no carga Montserrat con los pesos de la sección`);
        for (const legacy of ["pieza.css", "burger-menu", "mobile-nav", "projects-navigation", "related-item", "video-container", "fade-in",
            "node-hero__period", "node-film__after", "node-film__heading", "node-story__caption"]) {
            assert.ok(!html.includes(legacy), `${page.file}: queda el resto de plantilla antigua «${legacy}»`);
        }
        for (const link of doc.querySelectorAll('link[rel="apple-touch-icon"], link[rel="icon"], link[rel="shortcut icon"], link[rel="manifest"]')) {
            assert.ok(fs.existsSync(path.join(root, link.getAttribute("href").replace(/^\//, ""))),
                `${page.file}: falta ${link.getAttribute("href")}`);
        }

        /* ── SEO: cada pieza con su propio título (antes lo compartían las 10) ── */
        assert.ok(doc.title.includes("HYPRFRAME"), `${page.file}: el title lleva la marca`);
        if (page.pageTitle) {
            assert.equal(doc.title, page.pageTitle, `${page.file}: el title no es el esperado`);
        } else {
            assert.ok(doc.title.includes(page.piece.split(" [")[0].split(" ")[0]),
                `${page.file}: el title nombra la pieza`);
        }
        assert.ok(!seenTitles.has(doc.title), `«${doc.title}» se repite con ${seenTitles.get(doc.title)}`);
        seenTitles.set(doc.title, page.file);
        assert.ok(doc.querySelector('meta[name="description"]').content.length > 40);
        assert.equal(doc.querySelector('meta[property="og:image"]').content,
            `https://hyprframe.com/${doc.querySelector(".node-player > img").getAttribute("src")}`);

        /* ── Navegación idéntica a la landing ── */
        assert.deepEqual(navLabels(doc, ".main-nav a"), navLabels(indexDoc, ".main-nav a"));
        assert.deepEqual(navLabels(doc, ".menu-links a"), navLabels(indexDoc, ".menu-links a"));
        // La cabecera entera (logo, navegación, idioma) es la de la landing; se
        // comparan los textos con los espacios normalizados, que el sangrado del
        // HTML no es lo que se está vigilando.
        assert.equal(squash(doc.querySelector(".site-header").textContent),
            squash(indexDoc.querySelector(".site-header").textContent),
            `${page.file}: la cabecera no es la de la landing`);
        assert.equal(doc.querySelector(".node-hero__top"), null, `${page.file}: sigue el rótulo GENERATED`);
        assert.equal(doc.querySelector(".node-hero .kicker"), null, `${page.file}: sigue el punto verde del opener`);
        assert.ok(!doc.querySelector(".node-hero .pulse"), `${page.file}: el punto verde animado sigue en el opener`);
        // ← ALL WORK se fue (el paginador y VIEW ALL ↗ ya cubren la salida).
        assert.ok(!doc.querySelector(".node-back"), `${page.file}: sigue el enlace ← ALL WORK`);
        assert.equal(doc.querySelector(".node-hero__explore"), null, `${page.file}: se ha eliminado la flecha de explore`);
        // VIEW ALL ↗ cierra THE STORY: bajo la sinopsis, sobre la línea gris.
        const all = doc.querySelector(".node-story__all");
        assert.equal(all.getAttribute("href"), "index.html#work");
        assert.equal(all.textContent.trim(), "VIEW ALL ↗");
        assert.equal(all.parentElement.className, "node-story",
            `${page.file}: el enlace no cierra THE STORY`);
        assert.equal(all.previousElementSibling.className, "node-story__grid",
            `${page.file}: el enlace no va justo bajo la sinopsis`);
        assert.ok(!doc.querySelector(".node-related__heading a"),
            `${page.file}: el enlace sigue junto a RELATED PROJECTS`);
        assert.ok(!doc.getElementById("cursorDot") && !doc.getElementById("cursorRing"),
            `${page.file}: sigue el nodo del cursor`);

        /* ── Enlaces e imágenes locales que existen de verdad ── */
        for (const link of doc.querySelectorAll("main a, .site-header a, .menu-links a")) {
            const href = link.getAttribute("href");
            if (!href || /^(https?:|mailto:)/.test(href)) continue;
            if (href.startsWith("#")) {
                assert.ok(doc.getElementById(href.slice(1)), `${page.file}: ancla rota ${href}`);
                continue;
            }
            const url = new URL(href, window.location.href);
            const filename = decodeURIComponent(url.pathname.slice(1));
            assert.ok(fs.existsSync(path.join(root, filename)), `${page.file}: destino roto ${href}`);
            if (url.hash) {
                const target = filename === "index.html" ? indexDoc : doc;
                assert.ok(target.getElementById(url.hash.slice(1)), `${page.file}: ancla rota ${href}`);
            }
        }
        for (const img of doc.querySelectorAll("img[src^='assets/']")) {
            assert.ok(fs.existsSync(path.join(root, img.getAttribute("src"))), `${page.file}: falta ${img.getAttribute("src")}`);
        }

        /* ── Estructura de la pieza: opener, vídeo, historia y relacionadas ── */
        const h1 = doc.querySelector("h1");
        assert.equal(h1.id, "projectTitle");
        assert.equal(h1.getAttribute("aria-label"), page.aria);
        // WCAG 2.5.3: el nombre accesible contiene todo el texto visible del
        // titular. Se comparan los dos lados sin puntuación: lo que se ve como
        // «N.O.D.E.» se anuncia «NODE» y «[Teaser]» se anuncia «Teaser».
        const flatten = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
        const label = flatten(h1.getAttribute("aria-label"));
        for (const word of h1.textContent.split(/\s+/).filter(Boolean)) {
            assert.ok(label.includes(flatten(word)),
                `${page.file}: «${word}» se ve pero no está en el aria-label`);
        }
        assert.equal(doc.querySelector(".node-hero__word").textContent.trim(), h1.textContent.replace(/\[.*\]/, "").trim());
        assert.equal(doc.querySelectorAll("h1").length, 1);
        assert.ok(!doc.querySelector(".node-hero__image img"), "el opener es un fondo liso, no un fotograma");
        // Una sola talla para las diez páginas: ni modificador por página ni
        // titulares que el overflow: hidden del opener acabe recortando.
        const word = doc.querySelector(".node-hero__word").textContent.trim();
        assert.equal(doc.querySelector(".node-hero").className, "node-hero",
            `${page.file}: el opener lleva clases extra`);
        // Presupuesto de caracteres de esa talla común: lo fija el titular más
        // largo, DEEP IN THE FOREST [Teaser] (18 + 8). Si una pieza necesita más,
        // hay que volver a medir el encaje — ver el comentario de .node-hero h1.
        const teaser = doc.querySelector(".node-hero__teaser");
        const chars = word.length + (teaser ? teaser.textContent.trim().length : 0);
        assert.ok(chars <= 26,
            `${page.file}: el titular mide ${chars} caracteres, por encima del presupuesto de 26`);

        const player = doc.querySelector(".node-player");
        assert.equal(doc.querySelectorAll(".node-player").length, 1);
        assert.equal(player.dataset.vimeo, page.vimeo, `${page.file}: Vimeo que no toca`);
        assert.ok(player.dataset.title.length > 2);
        assert.equal(player.querySelector(".node-hero__title h1"), doc.getElementById("projectTitle"),
            `${page.file}: el título original se ha movido dentro de la caja del vídeo`);
        assert.equal(player.querySelector(".node-hero__title h1").getAttribute("aria-label"), page.aria,
            `${page.file}: se conserva el título y su nombre accesible`);
        assert.equal(doc.getElementById("film").querySelector(".node-player"), player);
        assert.equal(doc.querySelector(".node-player__play").textContent.trim(), "",
            "el triángulo de play se dibuja en CSS");
        assert.equal(doc.querySelector(".node-player > img").getAttribute("loading"), "lazy");

        assert.deepEqual([...doc.querySelectorAll(".node-section-label span:first-child")].map((el) => el.textContent),
            ["THE STORY", "KEEP EXPLORING"]);
        assert.ok(doc.querySelector(".node-player__synopsis p").textContent.trim().length > 60,
            `${page.file}: la sinopsis de la caja es demasiado corta`);
        assert.equal(doc.querySelector(".node-story__copy"), null,
            `${page.file}: la sinopsis sigue fuera de la caja de vídeo`);
        assert.equal(doc.querySelectorAll(".node-story h2 .violet").length, 1);
        const cards = [...doc.querySelectorAll(".node-card")];
        assert.equal(cards.length, 2);
        cards.forEach((card) => {
            // Numeraciones y categorias quitadas en RELATED PROJECTS (28/09/2026)
            const meta = card.querySelector(".node-card__meta span").textContent.trim();
            assert.ok(!/^\d+\s*\/\s*/.test(meta), `${page.file}: RELATED PROJECTS sigue con numeración «${meta}»`);
            assert.ok(!/(SHORT FILM|COMMERCIAL|BRAND FILM)/i.test(meta), `${page.file}: RELATED PROJECTS sigue con categoria «${meta}»`);
            assert.ok(card.querySelector(".node-card__title").textContent.trim().length > 2);
            assert.notEqual(card.getAttribute("href"), page.file, `${page.file}: se enlaza a sí misma`);
        });
        const footer = doc.querySelector(".footer-row");
        assert.equal(footer.querySelector("span").textContent.trim(), "© 2026 HYPRFRAME. All rights reserved.");
        assert.match(footer.textContent, /Cookie policy/, `${page.file}: el pie enlaza la política de cookies`);

        /* ── Comportamiento: menú móvil, cabecera y reproductor bajo demanda ── */
        window.eval(script);
        const burger = doc.getElementById("burger");
        const menu = doc.getElementById("menuOverlay");
        burger.click();
        assert.ok(doc.body.classList.contains("menu-open"));
        assert.equal(burger.getAttribute("aria-expanded"), "true");
        assert.equal(menu.getAttribute("aria-hidden"), "false");
        assert.equal(doc.activeElement, menu.querySelector("a"), `${page.file}: al abrir, el foco entra en el menú`);
        window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        assert.ok(!doc.body.classList.contains("menu-open"));
        assert.equal(doc.activeElement, burger, `${page.file}: Escape cierra el menú y devuelve el foco al botón`);
        Object.defineProperty(window, "scrollY", { value: 60, configurable: true });
        window.dispatchEvent(new window.Event("scroll"));
        assert.ok(doc.getElementById("siteHeader").classList.contains("scrolled"),
            `${page.file}: la cabecera se marca al hacer scroll`);

        exercisePlayer(window, doc, page);
        assert.deepEqual(errors, [], `${page.file}: errores en consola`);
    } finally {
        dom.window.close();
    }
    console.log(`PASS  GENERATED · ${page.file}: opener, vídeo ${page.vimeo}, historia, relacionadas y reproductor`);
}

/* ── N.O.D.E.: el marcado y el texto que solo tiene la pieza de referencia ── */
{
    const doc = new JSDOM(read("project-node.html")).window.document;
    // El titular escribe sus cuatro puntos como texto —el carácter «.» de
    // Montserrat—, sin cajas CSS y sin el fotograma que abría la página. Así el
    // texto visible coincide con el nombre accesible, y copiar o buscar el
    // titular da «N.O.D.E.» y no «NODE». Lo mismo en la versión ES.
    for (const [file, page] of [["project-node.html", doc], ["es/project-node.html", new JSDOM(read("es/project-node.html")).window.document]]) {
        assert.equal(page.querySelectorAll(".node-hero__dot").length, 0, `${file}: los puntos del titular siguen siendo cajas CSS`);
        assert.equal(page.querySelector(".node-hero__word").textContent, "N.O.D.E.", `${file}: el titular no lleva sus cuatro puntos como texto`);
        assert.equal(page.querySelector("h1").textContent, page.querySelector("h1").getAttribute("aria-label"),
            `${file}: el texto visible del titular y su nombre accesible no coinciden`);
    }
    // El opener se pinta con un color plano (el reproductor sí usa una máscara degradada).
    const openerRule = ruleOf(squash(stripComments(css)), ".node-hero__image");
    assert.match(openerRule, /background: var\(--bg\);/);
    assert.ok(!/radial-gradient|linear-gradient/.test(openerRule), "el degradado del opener ha vuelto");
    assert.equal(doc.querySelector(".node-hero__explore"), null,
        "la flecha de EXPLORE se ha retirado del opener");
    for (const removed of ["HUMAN INTUITION × MACHINE SYNTHESIS", "THE WORLD OF N.O.D.E.", "WATCH ON VIMEO", "SELECTED WORK", "THE TEASER.", "A world on the edge of being rewritten.", "HYPRFRAME — N.O.D.E.", "SCROLL TO EXPLORE", "N.O.D.E. / TEASER", "N.O.D.E. [TEASER]", "PLAY FILM", "02:51", "EXPLORE THE FILM", "01 / THE FILM", "02 / THE STORY", "03 / KEEP EXPLORING"]) {
        assert.ok(!doc.body.textContent.includes(removed), `vuelve texto retirado de la maqueta: ${removed}`);
    }
}

/* ── La landing enlaza todas las piezas de la sección ── */
const workRows = [...indexDoc.querySelectorAll(".work-row")];
const workOrder = workRows.map((el) =>
    new URL(el.getAttribute("href"), "http://localhost:8080/index.html").pathname.slice(1));
const workTitles = Object.fromEntries(workRows.map((el) => [
    new URL(el.getAttribute("href"), "http://localhost:8080/index.html").pathname.slice(1),
    el.querySelector(".work-title").textContent.trim(),
]));
assert.deepEqual(workOrder, ALL, "el paginador sigue el orden de SELECTED WORK");

/* ── Paginador anterior / siguiente: arriba, sin nombres y en ciclo cerrado ── */
assert.match(css, /\.node-pager \{[^}]*justify-content: center/,
    "el grupo se recoge en torno al contador en vez de repartirse de borde a borde");
assert.ok(!/node-pager__name|node-pager__kicker|node-pager__text/.test(css),
    "generated.css arrastra las clases de cuando el paginador mostraba nombres");
for (const [i, file] of ALL.entries()) {
    const doc = new JSDOM(read(file)).window.document;
    const pager = doc.querySelector(".node-pager");
    assert.ok(pager && pager.tagName === "NAV", `${file}: falta el <nav> del paginador`);
    assert.ok(pager.getAttribute("aria-label"), `${file}: el paginador no se anuncia`);
    // Debajo de GENERATED, encima del titular.
    assert.ok(doc.querySelector(".node-hero__meta-row > .node-pager"),
        `${file}: el paginador no va justo bajo el kicker`);
    assert.ok(doc.querySelector(".node-hero__meta-row + .node-hero__image"),
        `${file}: el paginador no va justo sobre el titular`);
    assert.ok(!doc.querySelector(".node-related + .node-pager"),
        `${file}: el paginador sigue cerrando la página`);
    const prev = pager.querySelector('a[rel="prev"]');
    const next = pager.querySelector('a[rel="next"]');
    assert.equal(pager.querySelectorAll("a").length, 2, `${file}: solo anterior y siguiente`);
    assert.equal(pager.children.length, 3, `${file}: flecha anterior, contador, flecha siguiente`);
    const expected = [ALL[(i - 1 + ALL.length) % ALL.length], ALL[(i + 1) % ALL.length]];
    assert.deepEqual([prev.getAttribute("href"), next.getAttribute("href")], expected,
        `${file}: el ciclo no respeta el orden de la landing`);
    assert.equal(pager.querySelector(".node-pager__count").textContent.trim(),
        `${String(i + 1).padStart(2, "0")} / ${ALL.length}`, `${file}: contador fuera de sitio`);
    for (const [link, href] of [[prev, expected[0]], [next, expected[1]]]) {
        assert.ok(fs.existsSync(path.join(root, href)), `${file}: destino roto ${href}`);
        // Sin nombres a la vista: la flecha es decorativa y solo queda la palabra.
        assert.equal(link.querySelector(".node-pager__arrow").getAttribute("aria-hidden"), "true",
            `${file}: la flecha es decorativa`);
        assert.ok(!link.querySelector(".node-pager__name"), `${file}: el paginador vuelve a enseñar nombres`);
        const visible = link.textContent.replace(/[\u2190\u2192]/g, "").trim();
        assert.equal(visible, "", `${file}: el paginador solo deja visible la flecha`);
        // El destino se anuncia por aria-label, ya que en pantalla no se ve.
        const label = link.getAttribute("aria-label") || "";
        assert.match(label, new RegExp(`^(Back|Previous|Next) project: .+`, 'i'), `${file}: aria-label ${label}`);
        assert.ok(label.toLowerCase().includes(workTitles[href].toLowerCase()),
            `${file}: «${label}» no nombra ${href}`);
    }
}
assert.match(css, /\.node-pager__arrow\s*\{[^}]*width:\s*21\.5px;[^}]*height:\s*24\.82px;[^}]*clip-path:\s*polygon\(0 50%, 100% 0, 100% 100%\)/,
    "flecha anterior reemplazada por triángulo equilátero");
assert.match(css, /\.node-pager__link--next \.node-pager__arrow\s*\{\s*clip-path:\s*polygon\(100% 50%, 0 0, 0 100%\);/,
    "flecha siguiente reemplazada por triángulo equilátero invertido");
assert.match(css, /\.node-related\s*\{\s*display:\s*none;\s*\}/,
    "RELATED PROJECTS permanece desactivado desde CSS");

/* ── El reproductor GENERATED mantiene el fotograma en color natural ──
   El botón conserva su diseño; no se aplica el filtro desaturado al poster. */
const generatedFlat = squash(stripComments(css));
const legacyFlat = squash(stripComments(read("legacy.css")));
// Misma inclinación y paso de bandas que SELECTED WORK, pero cierre de 32 a 0.
assert.match(css, /@property --film-stripe\s*\{[^}]*initial-value: 32px;/);
assert.match(css, /repeating-linear-gradient\(102deg, #000 0 var\(--film-stripe\), transparent var\(--film-stripe\) 32px\)/);
assert.match(ruleOf(generatedFlat, ".node-player iframe.is-ending"), /--film-stripe: 0px; opacity: 0; pointer-events: none;/);
const nodeStill = ruleOf(generatedFlat, ".node-player > img");
const legacyStill = ruleOf(legacyFlat, ".film-card__poster img");
assert.ok(!/filter:/.test(nodeStill), "el fotograma no arranca desaturado ni oscurecido");
assert.match(nodeStill, /transition: transform 0\.9s var\(--ease-out\);/);
const nodeRollover = ruleOf(generatedFlat, ".node-player:hover > img, .node-player:focus-within > img");
const legacyRollover = ruleOf(legacyFlat, ".film-card:hover .film-card__poster img, .film-card:focus-visible .film-card__poster img");
assert.equal(declaration(nodeRollover, "transform"), declaration(legacyRollover, "transform"),
    "el fotograma mantiene el zoom de hover");
assert.ok(!/filter:/.test(nodeRollover), "el hover no añade desaturación ni cambios de brillo");
const nodeCircle = ruleOf(generatedFlat, ".node-player__circle");
const legacyCircle = ruleOf(legacyFlat, ".film-card__play");
for (const property of ["width", "border", "border-radius", "color", "font-size", "transition"]) {
    assert.equal(declaration(nodeCircle, property), declaration(legacyCircle, property),
        `el botón de play hereda de Captured la propiedad ${property}`);
}
const nodeHover = ruleOf(generatedFlat, ".node-player__play:hover .node-player__circle, .node-player__play:focus-visible .node-player__circle");
const legacyHover = ruleOf(legacyFlat, ".film-card:hover .film-card__play, .film-card:focus-visible .film-card__play");
for (const property of ["background", "border-color", "color", "scale"]) {
    assert.equal(declaration(nodeHover, property), declaration(legacyHover, property),
        `el hover del play hereda de Captured la propiedad ${property}`);
}
// El triángulo se dibuja con clip-path: tres vértices equidistantes del centro
// del círculo y con el centroide en su sitio, para que no se descentre al
// cambiar la talla del botón.
const triangle = ruleOf(generatedFlat, ".node-player__circle::before")
    .match(/clip-path: polygon\(([^;]+)\);/)[1].split(",")
    .map((point) => point.match(/calc\(50% [+-] [\d.]+em\)|50%/g).map((v) => (v === "50%" ? 0 : parseFloat(v.slice(9).replace(" ", "")))));
assert.equal(triangle.length, 3);
for (const axis of [0, 1]) {
    assert.ok(Math.abs(triangle.reduce((sum, point) => sum + point[axis], 0)) < 1e-3,
        "el centroide del triángulo es el centro del círculo");
}
const radii = triangle.map(([x, y]) => Math.hypot(x, y));
assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-3, "los vértices equidistan del borde lima");

/* ── El titular del opener tiene una talla única, fijada por el más largo ── */
assert.ok(!/node-hero--long/.test(css), "generated.css conserva la talla especial para titulares largos");
// Kanit sólo puede quedar en los comentarios que explican por qué cambió la talla:
// como familia declarada tiene que haber desaparecido.
assert.ok(!/["']Kanit["']|family=Kanit|font:[^;]*Kanit/.test(css),
    "generated.css sigue declarando Kanit como familia");
// Desktop: Montserrat 700, con font-family/weight separados para que
// N.O.D.E. respete Montserrat. 03/10/2026: −15px y −3px más (03/10/2026) en los términos fluido y
// techo (26.25 → 44.25); el piso conserva sus 12.1px para que el titular no
// desaparezca en ventanas estrechas.
assert.match(css,
    /\.node-hero h1, \.node-player h1 \{[^}]*font-family: var\(--font-head\);[^}]*font-weight: 700;[^}]*font-size: clamp\(calc\(2\.397rem - 26\.25px\), calc\(5\.44vw - 44\.25px\), calc\(5\.44rem - 44\.25px\)\)/,
    "las diez páginas comparten la misma clamp del titular en Montserrat (−15px en escritorio)");
// Los tres cálculos que siguen al titular (ancla de la sinopsis, tope de la
// plancha y --plate-step del ángulo) usan ese mismo clamp reducido: si el
// titular mengua, todo baja con él y no se abre hueco.
assert.equal((css.match(/calc\(5\.44vw - 44\.25px\), calc\(5\.44rem - 44\.25px\)/g) || []).length, 4,
    "titular, ancla de la sinopsis, tope de la plancha y --plate-step comparten el clamp reducido");
const h1Rules = css.match(/\.node-hero h1, \.node-player h1 \{[^}]*\}/g);
assert.ok(h1Rules && h1Rules.length === 2, "el titular tiene exactamente dos reglas: escritorio y móvil");
const desktopRule = h1Rules[0];
const mobileRule = h1Rules[1];
assert.match(desktopRule, /white-space: nowrap/, "desktop: una sola línea");
assert.match(desktopRule, /var\(--font-head\)/, "desktop: Montserrat");
// Mobile: título adaptable en una sola línea — nunca se corta, siempre nowrap.
assert.match(mobileRule, /font-size: clamp\(calc\(0\.95625rem - 0\.5px\), calc\(4\.675vw - 0\.5px\), calc\(2\.21rem - 0\.5px\)\)/, "móvil: clamp adaptable del título (+8px el 05/10/2026)");
assert.match(mobileRule, /white-space: nowrap/, "móvil: una sola línea, no se corta");
assert.ok(!/white-space: normal/.test(mobileRule), "móvil: ya no parte en líneas");
// N.O.D.E. respeta Montserrat igual que las otras 9.
assert.match(css, /\.node-hero__word \{[^}]*font-family: var\(--font-head\)/, "N.O.D.E. usa Montserrat");
assert.match(css, /\.node-hero__teaser \{[^}]*font-family: var\(--font-head\)/, "el teaser usa Montserrat");
// Sus puntos son el carácter «.» de esa misma fuente: las cajas CSS se quitaron
// y no queda ninguna regla que las dibuje (el nombre solo sobrevive en un comentario).
assert.ok(!/node-hero__dot/.test(generatedFlat), "generated.css conserva las cajas de los puntos de N.O.D.E.");

/* ── ← ALL WORK fuera: la salida de la sección vive en otros dos sitios ── */
assert.ok(!/\.node-back/.test(css), "generated.css conserva las reglas de .node-back");
assert.ok(!/class="node-back"/.test(read("project-node.html")), "project-node.html conserva el enlace ← ALL WORK");

/* ── VIEW ALL ↗ cierra THE STORY en las diez páginas ── */
assert.ok(css.includes(".node-story__all"), "generated.css no da estilo al enlace bajo la sinopsis");
assert.ok(!/\.node-related__heading > a/.test(css),
    "generated.css conserva el estilo del enlace junto a RELATED PROJECTS");
assert.match(css,
    /\.node-story__all \{[^}]*margin-left: auto;[^}]*margin-bottom: clamp\(2\.5rem, 5vw, 4rem\);/,
    "el enlace se alinea con la sinopsis y se acerca a la línea gris");

/* ── Móvil: el vídeo ocupa el ancho de la línea gris que abre THE STORY ── */
const mobileBlock = css.match(/@media \(max-width: 560px\) \{[\s\S]*?\n\}/)[0];
assert.match(mobileBlock, /\.node-player \{ width: 100%; \}/,
    "en móvil la caja del vídeo debe crecer hasta el ancho del contenido (la línea de 1px)");
assert.match(ruleOf(generatedFlat, ".node-player"), /width: 85\.5%;/,
    "fuera de móvil el vídeo sigue al 85,5% centrado");
assert.match(ruleOf(generatedFlat, ".node-player"), /aspect-ratio: 16 \/ 9;/,
    "el alto crece en proporción porque la caja conserva su aspect-ratio");

/* ── La línea de 1px bajo el vídeo: fuera ──
   El label que abre THE STORY no lleva borde (se probó acortarla al ancho de
   la caja de vídeo y la decisión final es quitarla). KEEP EXPLORING conserva
   su línea de borde a borde vía la regla base del label. (29/09/2026) */
assert.ok(!/\.node-story > \.node-section-label::before/.test(generatedFlat),
    "no queda ningún ::before dibujando la línea bajo el vídeo");
assert.equal(generatedFlat.match(/border-top: 0;/g).length, 1,
    "solo el label de THE STORY quita su borde: KEEP EXPLORING conserva el suyo");
assert.match(css, /\.node-section-label \{ padding: 1rem 0; border-top: 1px solid var\(--line\); \}/,
    "la regla base del label conserva su 1px gris (la de KEEP EXPLORING)");

/* ── THE STORY, justificado por la izquierda con el h2 de cada página ──
   El rótulo abre la historia sobre la misma columna que el titular: sin ancho
   propio (antes copiaba el 85,5% de la caja de vídeo y su texto quedaba
   sangrado 7,25% a la derecha del h2) y con la rejilla de la historia sin
   relleno lateral, así que los dos arrancan en el borde del contenido que fija
   padding-inline del section. (30/09/2026)
   Y el hueco hasta el h2, recortado: el relleno superior de la rejilla pasa de
   clamp(3.5rem, 8vw, 8rem) a clamp(1.25rem, 2.4vw, 2.25rem). Medido en el
   navegador a 1440px, el titular pasa de arrancar a 131,2px del rótulo a 50,5px
   (3,5% del ancho), la proporción de la referencia de diseño. */
const storyLabel = ruleOf(generatedFlat, ".node-story > .node-section-label");
assert.match(storyLabel, /margin-inline: 0; border-top: 0;/,
    "el rótulo de THE STORY suelta la medida de la caja de vídeo y vuelve al borde del contenido");
assert.ok(!/width:/.test(storyLabel), "el rótulo de THE STORY no lleva ancho propio");
assert.ok(!/\.node-story > \.node-section-label[\s\S]{0,200}?\{[^}]*width/.test(generatedFlat)
    && !/\.node-story > \.node-section-label[\s\S]{0,200}?\{[^}]*width/.test(mobileBlock),
    "ninguna regla —tampoco la de móvil— devuelve el ancho de la caja de vídeo al rótulo");
assert.match(generatedFlat, /\.node-film, \.node-story, \.node-related \{ padding-inline: var\(--pad\); \}/,
    "el rótulo y el h2 comparten el borde del contenido (--pad)");
assert.match(ruleOf(generatedFlat, ".node-story__grid"),
    /padding: clamp\(1\.25rem, 2\.4vw, 2\.25rem\) 0 clamp\(3\.5rem, 8vw, 7rem\);/,
    "la rejilla de la historia solo respira en vertical y el h2 queda pegado al rótulo");
/* La pila del título (rótulo + h2) tiene que quedar a la izquierda en las diez
   páginas: mismas clases, un solo <span> en el rótulo y sin estilos propios. */
for (const file of ALL) {
    const doc = new JSDOM(read(file)).window.document;
    const label = doc.querySelector(".node-story > .node-section-label");
    assert.ok(label, `${file}: THE STORY no abre la historia`);
    assert.equal(label.children.length, 1, `${file}: el rótulo de THE STORY lleva más de un texto`);
    assert.equal(label.querySelectorAll("span").length, 1, `${file}: el rótulo repite texto`);
    assert.ok(doc.querySelector(".node-story__grid > h2"),
        `${file}: el h2 de la historia no abre la rejilla`);
    for (const tag of doc.querySelectorAll(".node-story [style]")) {
        assert.ok(!tag.getAttribute("style"), `${file}: la historia lleva estilos inline que rompen la alineación`);
    }
}
assert.match(mobileBlock, /\.node-story__grid \{ padding-top: clamp\(3\.5rem, 8vw, 8rem\); \}/,
    "en móvil el hueco rótulo→h2 conserva su medida (el recorte es de la versión web)");

/* ── El aire entre la caja de vídeo y THE STORY ──
   Lo daba solo el relleno del propio rótulo (1rem = 16px), así que la historia
   arrancaba pegada al vídeo. Ahora lo abre la sección, con el mismo eje que el
   resto de la retícula: en 1440px, del vídeo al rótulo hay 72px. El móvil
   conserva sus 16px. (30/09/2026) */
assert.match(ruleOf(generatedFlat, ".node-story"), /padding-top: clamp\(2rem, 4vw, 3\.5rem\);/,
    "la historia abre su propio aire bajo el vídeo");
assert.match(mobileBlock, /\.node-story \{ padding-top: 0; \}/,
    "en móvil la historia conserva el hueco de siempre bajo el vídeo");

/* El h1 original vive dentro de la caja del vídeo, arriba a la izquierda;
   el antiguo enlace EXPLORE y la fila vacía se retiran del opener. */
for (const file of ALL) {
    const doc = new JSDOM(read(file)).window.document;
    assert.ok(doc.querySelector(".node-player > .node-hero__title h1#projectTitle"),
        `${file}: el título original no vive dentro de la caja de vídeo`);
    assert.equal(doc.querySelector(".node-hero__explore"), null,
        `${file}: queda la flecha EXPLORE`);
    assert.equal(doc.querySelector(".node-hero__bottom"), null,
        `${file}: queda una fila inferior vacía`);
}

/* Web: la sinopsis vive en la caja, bajo el título, con la tipografía
   de la antigua sinopsis exterior y 7px menos (5px y otros 2px). En móvil sale
   debajo de la caja, a ancho completo. THE STORY y el h2 no se ven; VIEW ALL sí, bajo la sinopsis. */
assert.match(ruleOf(generatedFlat, ".node-player__synopsis"),
    /font-family: var\(--font-body\); font-weight: 300; font-size: calc\(clamp\(1\.15rem, 1\.9vw, 1\.85rem\) - 7px\); line-height: 1\.45;/,
    "la sinopsis de la caja usa la tipografía de fuera, 7px más pequeña");
assert.match(mobileBlock, /\.node-player__synopsis \{[^}]*font-size: clamp\(1\.15rem, 1\.9vw, 1\.85rem\);/,
    "en móvil la sinopsis no baja esos 2px");
assert.match(mobileBlock, /\.node-player__synopsis \{[^}]*position: static;[^}]*grid-row: 2;[^}]*width: 100%;/,
    "en móvil la sinopsis queda debajo de la caja de vídeo");
assert.ok(!/\.node-player__synopsis \{ display: none/.test(mobileBlock),
    "en móvil la sinopsis no se apaga");

/* Web: una única plancha gris cubre titular y sinopsis — el h1 suelta su fondo
   y su corte dentro del bloque de escritorio, y el ::before de la sinopsis
   dibuja la pieza con la misma transparencia y el corte diagonal a la derecha;
   el titular pinta por delante (z-index 4). Solo escritorio: la regla base del
   h1 no se toca, así que el móvil conserva su plancha de siempre. (03/10/2026) */
assert.match(generatedFlat,
    /@media \(min-width: 561px\) \{ \.node-player > \.node-hero__title \{ z-index: 4; \} \.node-player > \.node-hero__title h1 \{ background: none; clip-path: none; \}/,
    "web: el h1 suelta su plancha y el titular pinta sobre la nueva");
assert.match(ruleOf(generatedFlat, ".node-player > .node-hero__title h1"),
    /background: rgba\(128, 128, 128, \.5\);/,
    "móvil: la regla base del h1 conserva la plancha gris");
/* Una única plancha (03/10/2026 · 2): la banda del titular desapareció y la de
   la sinopsis crece hasta el arranque del título — su top deshace el cálculo
   que separa sinopsis y titular. Ceñida a la columna del texto (100% + 8px),
   siempre a la izquierda del círculo centrado; --plate-step ya solo guarda la
   referencia del ángulo de la diagonal. */
assert.ok(!generatedFlat.includes(".node-player__synopsis::before"),
    "web: la plancha del titular (::before) ya no existe");
const bandRule = ruleOf(generatedFlat, ".node-player__synopsis::after");
assert.match(bandRule, /background: rgba\(128, 128, 128, \.5\);/,
    "web: la plancha conserva la transparencia de la vieja");
assert.match(bandRule,
    /top: calc\(-1 \* \(1\.8rem \+ 16px \+ 0\.8 \* clamp\(/,
    "web: la plancha sube hasta el arranque del titular y lo integra");
assert.match(bandRule, /width: calc\(100% \+ 88px\);[\s\S]*?transform-origin: bottom;/,
    "web: la plancha se ciñe a la columna (100% + 8px con el sobrante izquierdo) y ancla su diagonal abajo");
assert.match(bandRule, /z-index: -1;/,
    "web: la plancha queda detrás del texto");
/* La diagonal derecha: el ángulo que tenía la del titular, por construcción
   (skewX de −atan2(12px, --plate-step)), anclada abajo para no cortar el
   texto justificado ni bajar hacia el play. Solo desde 850px: por debajo el
   ángulo es tan empinado que pisaría el círculo, y queda el borde recto. */
assert.match(generatedFlat,
    /@media \(min-width: 850px\) \{ \.node-player__synopsis::after \{ transform: skewX\(calc\(-1 \* atan2\(12px, var\(--plate-step\)\)\)\); \} \}/,
    "web: la plancha lleva su diagonal con el ángulo del titular original desde 850px");
assert.match(generatedFlat,
    /@media \(min-width: 561px\) \{[^@]*\.node-player__synopsis \{ text-align: justify; --plate-step: calc\(1\.1rem \+ 0\.8 \* clamp\(/,
    "web: la sinopsis va justificada y conserva la referencia del ángulo");
/* 03/10/2026 — Solo web: la sinopsis baja 2px de tipografía (−7 → −9 sobre el
   clamp base), 2px de interlineado (1.45em − 2px) y pierde el sombreado. La
   regla base (que hereda el móvil) conserva −7px, 1.45 y su sombra. */
assert.match(generatedFlat,
    /@media \(min-width: 561px\) \{[^@]*\.node-player__synopsis \{[^}]*font-size: calc\(clamp\(1\.15rem, 1\.9vw, 1\.85rem\) - 9px\); line-height: calc\(1\.45em - 2px\); text-shadow: none;/,
    "web: la sinopsis baja 2px de talla y de interlineado y pierde el sombreado");
assert.match(ruleOf(generatedFlat, ".node-player__synopsis"),
    /text-shadow: 0 1px 2px rgba\(0, 0, 0, 0\.72\)/,
    "la regla base (la que pisa el bloque web) no se toca");
assert.ok(!/text-align: justify/.test(squash(stripComments(mobileBlock))) &&
    !/text-align: justify/.test(ruleOf(generatedFlat, ".node-player__synopsis")),
    "móvil y regla base: la sinopsis no se justifica fuera del bloque web");

/* Las 10 cajas de vídeo con esquinas de 10px: en web recorta la propia caja
   (overflow hidden); la ventana completa (is-windowed) vuelve a rectas; en
   móvil, sin recorte en la caja, el redondeo va en la imagen y el iframe. */
assert.match(ruleOf(generatedFlat, ".node-player"), /border-radius: 10px;/,
    "la caja de vídeo redondea sus esquinas a 10px");
assert.match(ruleOf(generatedFlat, ".node-player.is-windowed"), /border-radius: 0;/,
    "la caja a ventana completa vuelve a esquinas rectas");
assert.match(mobileBlock, /\.node-player \{[^}]*border-radius: 0;/,
    "móvil: la caja-rejilla no redondea (no recorta)");
assert.match(mobileBlock, /\.node-player > img \{[^}]*border-radius: 10px;/,
    "móvil: la imagen del vídeo redondea a 10px");
assert.match(mobileBlock, /\.node-player > iframe \{[^}]*border-radius: 10px;/,
    "móvil: el iframe del vídeo redondea a 10px");
/* Móvil: al volver del fullscreen el vídeo sigue en su caja y la sinopsis tiene
   que quedar bloqueada en su posición correcta, debajo del vídeo: en
   reproducción el iframe ocupa en flujo la misma celda 1/1 de la grid que la
   imagen de apertura y reserva el 16:9 de la fila 1. Antes la fila colapsaba al
   quitarse la imagen y la sinopsis se metía por detrás del vídeo. (03/10/2026) */
assert.match(mobileBlock, /\.node-player\.is-playing > iframe \{[^}]*position: relative;[^}]*grid-area: 1 \/ 1;/,
    "móvil: el iframe en reproducción reserva la celda 16:9 de la grid (la sinopsis queda debajo)");
assert.match(mobileBlock, /\.node-player > iframe \{[^}]*z-index: 1;/,
    "móvil: el iframe sigue pintando sobre el fotograma para el cierre de bandas");
assert.equal(css.match(/\.node-player\.is-playing > iframe/g)?.length, 1,
    "la celda en flujo del iframe solo existe en el bloque móvil");
assert.match(css, /@media \(min-width: 561px\) \{[^}]*\.node-story \{ display: none; \}/,
    "en web no se ve la sección de la historia");
assert.match(mobileBlock, /\.node-story > \.node-section-label,\s*\.node-story__grid \{ display: none; \}/,
    "en móvil no se ven THE STORY ni el h2");
assert.match(mobileBlock, /\.node-story__all \{[^}]*display: block;/,
    "en móvil VIEW ALL vuelve debajo de la sinopsis");
assert.ok(!/\.node-story \{ display: none/.test(mobileBlock),
    "en móvil la sección no se apaga entera: VIEW ALL tiene que verse");
const DEEP_EN = "February 2013, Kiruna. An abandoned Volvo 240 sits on a snowy road with its engine running, and Elena has vanished. Footprints suggest a voluntary walk into the woods, but a disturbing non-human trail turns the search into a chilling mystery of isolation and fear in the Swedish winter.";
const DEEP_ES = "Febrero de 2013, Kiruna. Un Volvo 240 abandonado permanece en una carretera nevada con el motor en marcha, y Elena ha desaparecido. Las huellas sugieren una caminata voluntaria hacia el bosque, pero un inquietante rastro no humano convierte la búsqueda en un misterio helador de aislamiento y miedo en el invierno sueco.";
for (const file of ALL) {
    for (const path of [file, `es/${file}`]) {
        const page = new JSDOM(read(path)).window.document;
        assert.equal(page.querySelector(".node-story__copy"), null, `${path}: la sinopsis sigue fuera de la caja`);
        const inBox = page.querySelector(".node-player > .node-player__synopsis");
        assert.ok(inBox, `${path}: la sinopsis no está en la caja de vídeo`);
        assert.equal(inBox.getAttribute("aria-hidden"), null, `${path}: la única sinopsis no debe ocultarse a lectores de pantalla`);
        assert.equal(inBox.previousElementSibling?.className, "node-hero__title", `${path}: la sinopsis no queda debajo del título`);
        assert.equal(inBox.previousElementSibling.querySelector("h1")?.id, "projectTitle");
        assert.ok([...inBox.querySelectorAll("p")].every((p) => p.textContent.trim().length > 40),
            `${path}: falta el texto de la sinopsis`);
    }
}
assert.equal(new JSDOM(read("project-deep.html")).window.document.querySelector(".node-player__synopsis p").textContent.trim(), DEEP_EN,
    "Deep no lleva la sinopsis nueva");
assert.equal(new JSDOM(read("es/project-deep.html")).window.document.querySelector(".node-player__synopsis p").textContent.trim(), DEEP_ES,
    "Deep en español no lleva la traducción de la sinopsis");

/* ── Opener: el hueco entre el paginador y el titular, recortado ──
   El campo liso del opener y el relleno inferior del paginador se reducen a la
   mitad en la versión web (escritorio): el hueco entre el paginador y el
   titular pasa de ~235px a ~121px en 1440×900. El móvil mantiene su campo y su
   relleno propios, donde la fila inferior va anclada al hero y el hueco ya era
   mucho más corto. (30/09/2026) */
assert.match(ruleOf(generatedFlat, ".node-hero__image"),
    /height: calc\(clamp\(84px, 11svh, 120px\) - 80px\);/,
    "el campo liso del opener vuelve a crecer por encima de la mitad");
assert.match(ruleOf(generatedFlat, ".node-pager"),
    /grid-column: 2; justify-self: center;/,
    "el paginador se mantiene centrado en la fila con el kicker");
assert.match(generatedFlat, /\.node-pager \{[^}]*padding-bottom: 0;/,
    "el paginador no añade aire bajo el contador");
assert.match(mobileBlock, /\.node-hero__image \{ height: 0; \}/,
    "en móvil el campo liso no separa el paginador de la caja");
assert.match(mobileBlock, /\.node-film \{ margin-top: 0; padding-top: calc\(0\.75rem \+ 20px\); \}/,
    "en móvil las flechas y el contador quedan 20px más separadas de la caja");
const desktopFilmRule = ruleOf(generatedFlat, ".node-film");
assert.equal(declaration(desktopFilmRule, "margin-top"),
    "max(-140px, calc(115px - clamp(3rem, 5vw, 4.5rem) - clamp(84px, 11svh, 120px) - clamp(3rem, 6vw, 5rem)))",
    "en escritorio el solape se ajusta para conservar 20px mínimos hasta la caja de vídeo");
const cssClampPx = (min, preferred, max) => Math.max(min, Math.min(preferred, max));
const desktopPagerVideoGap = (width, height) => {
    const metaPadding = cssClampPx(48, width * 0.05, 72);
    const openerField = cssClampPx(84, height * 0.11, 120);
    const filmPadding = cssClampPx(48, width * 0.06, 80);
    const filmMargin = Math.max(-140, 115 - metaPadding - openerField - filmPadding);
    return (metaPadding - 15) + (openerField - 80) + filmMargin + filmPadding;
};
for (const [width, height] of [
    [561, 320], [640, 360], [768, 600], [768, 1024], [1024, 600], [1024, 768],
    [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [3840, 2160],
]) {
    assert.ok(desktopPagerVideoGap(width, height) >= 20 - 1e-9,
        `${width}×${height}: solo hay ${desktopPagerVideoGap(width, height)}px entre el paginador y el vídeo`);
}
assert.match(mobileBlock, /\.node-pager \{ gap: 0\.35rem; padding-bottom: 0; \}/,
    "en móvil manda el relleno corto del paginador");
assert.match(mobileBlock, /\.node-pager__link, \.node-pager__count \{ font-size: calc\(0\.56rem \+ 4px\); letter-spacing: 0\.12em; \}/,
    "en móvil las flechas y el contador crecen 4 px (bajado 2 px tras revisión, 05/10/2026)");
assert.match(mobileBlock, /\.node-pager__arrow \{ width: 15\.05px; height: 17\.38px; \}/,
    "en móvil la flecha triángulo equilátero crece 4 px (11.05→15.05, altura 2/√3·w ≈ 17.38)");

/* ── Las fichas ES cierran LA HISTORIA con el equivalente corto ── */
for (const file of ALL) {
    const es = read(`es/${file}`);
    assert.match(es, /<a class="node-story__all" href="index\.html#work">VER TODO ↗<\/a>/,
        `es/${file}: el enlace de salida no es VER TODO ↗`);
    assert.ok(!/VER TODO EL TRABAJO/.test(es), `es/${file}: sigue el texto largo`);
    assert.match(es, /generated\.css\?v=89/);
    assert.match(es, /generated\.js\?v=31/);
    assert.ok(!/class="kicker"/.test(es), `es/${file}: sigue GENERATED y el punto verde`);
}

/* ── Play: la web llena la ventana sin fullscreen; el móvil no oscurece ── */
assert.doesNotMatch(script, /requestDesktopFullscreen|exitPlayerFullscreen/,
    "generated.js ya no pide el fullscreen del navegador en escritorio");
assert.match(script, /function requestIframeFullscreen/,
    "el móvil vuelve a pedir el fullscreen del navegador");
assert.match(script, /if \(!isMobileVideo\) return;[\s\S]{0,240}requestFullscreen/,
    "el fullscreen del navegador solo se pide en móvil");
assert.match(script, /setTimeout\(\(\) => \{[\s\S]{0,120}portraitExitArmed = true;[\s\S]{0,40}\}, 3000\)/,
    "la salida al volver a vertical espera 3s desde que empieza el vídeo");
assert.match(script, /method: "exitFullscreen"/,
    "al volver a vertical se sale del fullscreen");
assert.match(script, /method: "requestFullscreen"/,
    "al volver a horizontal durante la reproducción se pide el fullscreen otra vez");
/* El primer play abre el vídeo ya en horizontal (04/10/2026): si el móvil está
   vertical, screen.orientation.lock('landscape') gira la pantalla. El bloqueo
   solo vive dentro del fullscreen — al salir se suelta (unlock) — así que no es
   permanente: vertical sale y horizontal vuelve a entrar. Si el teléfono ya está
   horizontal no se bloquea nada y los giros quedan libres. Todo va con red de
   seguridad (typeof, try/catch y catch del promise): Safari no trae lock(). */
assert.match(script, /function forceMobileLandscape\(\) \{\s*if \(!lockOnNextFullscreen \|\| !isMobileVideo \|\| !isPortraitNow\(\)\) return;[\s\S]{0,300}orientation\.lock\("landscape"\)/,
    "móvil: el apaisado se fuerza solo cuando lockOnNextFullscreen está armado y la pantalla está vertical, con lock('landscape')");
/* El lock se pide EN LÍNEA desde el play (lockOnNextFullscreen armado cuando
   el móvil está vertical) y se reintenta en fullscreenchange. forceMobile-
   Landscape desarma el flag en cuanto llama a lock() para que la reentrada
   por orientationchange nunca vuelva a bloquear. */
assert.match(script, /lockOnNextFullscreen = isPortraitNow\(\);[\s\S]{0,400}requestIframeFullscreen\(iframe, \(\) => \{ mobileFs = false; \}\)[\s\S]{0,400}forceMobileLandscape\(\)/,
    "móvil: fullscreen y apaisado se piden juntos en el play con el flag armado solo cuando hace falta");
assert.match(script, /function exitMobileFullscreen\(iframe\) \{\s*lockOnNextFullscreen = false;\s*mobileFs = false;\s*unlockMobileOrientation\(\);/,
    "salir del fullscreen limpia los flags y suelta el bloqueo de orientación");
assert.match(script, /function disarmPortraitExit[\s\S]{0,400}unlockMobileOrientation\(\)/,
    "al terminar o parar el vídeo se suelta el bloqueo de orientación");
assert.match(script, /typeof orientation\?\.lock !== "function"/,
    "el bloqueo de orientación se detecta antes de usarlo (Safari no lo trae)");
assert.match(script, /addEventListener\("fullscreenerror", onFullscreenError\)/,
    "se escucha fullscreenerror para desmarcar mobileFs si el navegador deniega el fullscreen");
assert.match(script, /function onFullscreenError\(\) \{\s*mobileFs = false;\s*\}/,
    "fullscreenerror limpia el flag mobileFs");
/* Reenter: requestIframeFullscreen NO llama a forceMobileLandscape ni arma
   lockOnNextFullscreen — la reentrada por giro a horizontal nunca bloquea la
   orientación: el visitante decide los giros. El catch del promise libera
   mobileFs por si el navegador deniega el fullscreen, y el postMessage pide
   a Vimeo que entre en fullscreen nativo. */
assert.match(script, /function reenterMobileFullscreen\(iframe\) \{\s*mobileFs = true;\s*requestIframeFullscreen\(iframe, \(\) => \{ mobileFs = false; \}\);[\s\S]{0,200}postMessage\(\{ method: "requestFullscreen" \}/,
    "reenterMobileFullscreen no bloquea la orientación: solo pide el fullscreen y avisa a Vimeo");
assert.match(script, /if \(!portrait\) \{\s*seenLandscape = true;\s*if \(mobileFs\) return;/,
    "en horizontal con el vídeo ya en pantalla el giro no dispara nada");
assert.match(script, /scrollBehavior = "auto"[\s\S]{0,220}scrollIntoView\(\{ block: "center", behavior: "instant" \}\)[\s\S]{0,220}min-width: 561px[\s\S]{0,120}scrollBy\(0, -40\)[\s\S]{0,1200}player\.getBoundingClientRect\(\)/,
    "en web el salto de 40px es instantáneo y el thumbnail se mide después, 40px más abajo");
/* En pantallas anchas la caja 16:9 es tan alta que centrarla dejaba el
   paginador (flechas + contador) por encima de la cabecera fija: el recorte
   del scroll tiene que vivir dentro de la rama web, antes de medir la caja
   final del clon. (03/10/2026) */
assert.match(script, /min-width: 561px[\s\S]{0,1000}node-pager[\s\S]{0,400}pagerTop < clearance[\s\S]{0,80}scrollBy\(0, pagerTop - clearance\)[\s\S]{0,300}player\.getBoundingClientRect\(\)/,
    "web: el scroll de llegada se recorta para que el paginador quede visible bajo la cabecera, antes de medir el clon");
assert.match(script, /layer\.style\.top = `\$\{target\.top\}px`/,
    "el thumbnail que se amplía aterriza en la caja de vídeo ya desplazada");
assert.match(script, /is-windowed/, "el play de la web marca la caja como ventana");
assert.match(script, /schedulePlayerWindow[\s\S]{0,500}reduced \? 0 : 800/,
    "en web la caja espera a que acabe el fundido de 0,8s antes de ampliarse");
assert.match(script, /playsinline=0/, "el móvil sigue entregando el play al reproductor nativo de Vimeo");
assert.doesNotMatch(css, /:fullscreen|:-webkit-full-screen/,
    "el cover de la ventana no depende del pseudo :fullscreen");
assert.match(ruleOf(generatedFlat, ".node-player.is-windowed"),
    /position: fixed; inset: 0;/,
    "en web la caja en reproducción ocupa el viewport");
assert.match(ruleOf(generatedFlat, ".node-player.is-windowed"),
    /aspect-ratio: auto;/,
    "el 16:9 de la caja no impide que ocupe toda la ventana");
assert.match(ruleOf(generatedFlat, ".node-player.is-windowed"),
    /transition: transform 0\.5s var\(--ease-out\);/,
    "la ampliación de la caja es una transición");
assert.match(script, /translate\(\$\{from\.left - to\.left\}px, \$\{from\.top - to\.top\}px\) scale/,
    "la ampliación parte del rectángulo de la caja, no salta");
/* Limpieza (03/10/2026): la ventana cubre el navegador al reproducir, así que
   el velo que oscurecía y desenfocaba la página, el estado body.film-is-playing
   y el apagado del paginador se borraron de CSS y JS (quedan solo los
   comentarios fechados que documentan la retirada). */
assert.ok(!generatedFlat.includes(".film-page-dimmer"),
    "el velo (.film-page-dimmer) ya no existe en el CSS");
assert.ok(!generatedFlat.includes("film-is-playing"),
    "el estado body.film-is-playing ya no existe en el CSS");
assert.ok(!generatedFlat.includes(".node-pager::after"),
    "el apagado del paginador (.node-pager::after) ya no existe");
assert.ok(!/backdrop-filter: blur\(4px\)/.test(generatedFlat),
    "el desenfoque del resto de la página ya no existe (el blur de la cabecera no cuenta)");
const scriptFlat = stripComments(script).replace(/^\s*\/\/.*$/gm, "");
assert.ok(!scriptFlat.includes("film-page-dimmer") && !scriptFlat.includes("film-is-playing") && !scriptFlat.includes("pageDimmer"),
    "generated.js ya no crea el velo ni marca el estado de oscurecimiento");
const exitRule = ruleOf(generatedFlat, ".node-player.is-windowed .node-player__exit");
assert.match(exitRule, /border: 0; background: none;/, "la X no tiene caja");
assert.match(exitRule, /transition: color 0\.18s ease;/, "el rollover de la X es una transición rápida");
assert.doesNotMatch(exitRule, /border: 1px|background: rgba/, "la X no recupera fondo ni borde");
assert.match(squash(css), /\.node-player__exit:hover, \.node-player\.is-windowed \.node-player__exit:focus-visible \{ color: var\(--violet\); \}/,
    "el rollover de la X pasa a lila");
assert.match(script, /function stopAndRestore/, "la X detiene el vídeo y restaura la ficha");
assert.match(css, /\.node-player__shield \{[^}]*bottom: 5rem;/, "el escudo deja libre la barra inferior de Vimeo");
assert.match(css, /\.node-player__dock \{[^}]*background: #000;/, "el dock tapa la esquina de los botones de Vimeo");
assert.ok(!/controls=0/.test(script), "no se apagan los mandos de Vimeo");

{
    const dom = new JSDOM(read("project-node.html"), {
        url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
    });
    const { window } = dom;
    window.matchMedia = (query) => ({
        matches: query.includes("max-width: 560px"),
        media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    window.eval(script);
    const doc = window.document;
    const box = doc.querySelector(".node-player");
    let boxFullscreenCalls = 0;
    box.requestFullscreen = () => { boxFullscreenCalls += 1; return Promise.resolve(); };
    box.webkitRequestFullscreen = box.requestFullscreen;
    let iframeFullscreenCalls = 0;
    window.HTMLIFrameElement.prototype.requestFullscreen = function () {
        iframeFullscreenCalls += 1;
        return Promise.resolve();
    };
    window.HTMLIFrameElement.prototype.webkitRequestFullscreen = window.HTMLIFrameElement.prototype.requestFullscreen;
    doc.getElementById("playFilm").click();
    const iframe = box.querySelector("iframe");
    assert.equal(doc.querySelector(".film-page-dimmer"), null, "móvil: no se crea el velo");
    assert.ok(!doc.body.classList.contains("film-is-playing"), "móvil: la página no entra en el estado de oscurecimiento");
    assert.ok(!box.classList.contains("is-windowed"), "móvil: el vídeo no ocupa la ventana");
    assert.equal(doc.querySelector(".node-player__exit"), null, "móvil: no aparece el cierre de la ventana");
    assert.equal(doc.querySelector(".node-player__shield"), null, "móvil: no se tapa el rollover de la ventana web");
    assert.match(iframe.src, /playsinline=0/, "móvil: Vimeo puede abrir su reproductor nativo");
    assert.equal(boxFullscreenCalls, 0, "móvil: no se pone la caja en fullscreen de escritorio");
    assert.equal(iframeFullscreenCalls, 1, "móvil: se vuelve a pedir el fullscreen del navegador");
    dom.window.close();
}

/* Móvil (04/10/2026): el play abre el vídeo en fullscreen y en apaisado — el
   bloqueo se pide desde el primer toque, pero solo si el móvil está vertical,
   y se suelta al salir. Volver a vertical sale del fullscreen (solo 3s después
   de que empiece el vídeo y solo si antes se vio el móvil en horizontal);
   volver a horizontal lo reactiva. */
{
    const dom = new JSDOM(read("project-node.html"), {
        url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
    });
    const { window } = dom;
    window.matchMedia = (query) => ({
        matches: query.includes("max-width: 560px"),
        media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    const held = [];
    const realSetTimeout = window.setTimeout.bind(window);
    const realClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => {
        if (ms === 3000) { held.push(fn); return -1; }
        return realSetTimeout(fn, ms, ...args);
    };
    window.clearTimeout = (id) => {
        if (id === -1) { held.length = 0; return; }
        return realClearTimeout(id);
    };
    const locks = [];
    let unlocks = 0;
    const orientation = {
        type: "portrait-primary",
        lock(kind) { locks.push(kind); return Promise.resolve(); },
        unlock() { unlocks += 1; return Promise.resolve(); },
    };
    window.screen.orientation = orientation;
    window.orientation = 0;
    window.eval(script);
    const doc = window.document;
    let exits = 0;
    doc.exitFullscreen = () => { exits += 1; return Promise.resolve(); };
    doc.getElementById("playFilm").click();
    const iframe = doc.querySelector(".node-player iframe");
    const sent = [];
    iframe.contentWindow.postMessage = (message, origin) => sent.push({ message, origin });
    const fromVimeo = (data) => window.dispatchEvent(new window.MessageEvent("message", {
        origin: "https://player.vimeo.com", source: iframe.contentWindow, data,
    }));
    const rotate = (angle) => {
        window.orientation = angle;
        orientation.type = angle === 90 ? "landscape-primary" : "portrait-primary";
        window.dispatchEvent(new window.Event("orientationchange"));
    };
    let reentered = 0;
    iframe.requestFullscreen = () => { reentered += 1; return Promise.resolve(); };
    iframe.webkitRequestFullscreen = iframe.requestFullscreen;
    assert.deepEqual(locks, ["landscape"], "el play con el móvil vertical fuerza el apaisado desde el primer toque");
    fromVimeo({ event: "play" });
    assert.equal(held.length, 1, "el vídeo arranca la espera de 3s");
    rotate(0);
    assert.equal(exits, 0, "en vertical, antes de los 3s, no se sale");
    held[0]();
    rotate(0);
    assert.equal(exits, 0, "seguir en vertical no es girar de vuelta");
    rotate(90);
    assert.equal(exits, 0, "girar a horizontal no sale del fullscreen");
    assert.equal(reentered, 0, "el horizontal inicial no vuelve a pedir el fullscreen");
    assert.equal(locks.length, 1, "ya en horizontal no se bloquea nada: el giro queda libre");
    rotate(0);
    assert.equal(exits, 1, "girar de vuelta a vertical sale del fullscreen");
    assert.equal(unlocks, 1, "salir del fullscreen suelta el bloqueo de orientación");
    assert.equal(sent.filter((item) => item.message?.method === "exitFullscreen").length, 1,
        "también se pide a Vimeo que salga del fullscreen");
    assert.ok(doc.querySelector(".node-player iframe"), "salir del fullscreen no corta el vídeo");
    rotate(90);
    assert.equal(reentered, 1, "volver a horizontal durante la reproducción activa el fullscreen");
    assert.equal(locks.length, 1, "la vuelta a horizontal no necesita bloqueo (la pantalla ya es horizontal)");
    assert.equal(sent.filter((item) => item.message?.method === "requestFullscreen").length, 1,
        "también se pide a Vimeo que entre en fullscreen");
    rotate(0);
    assert.equal(exits, 2, "un nuevo vertical vuelve a salir");
    assert.equal(unlocks, 2, "y vuelve a soltar el bloqueo");
    /* Devuelta del fullscreen: el vídeo sigue en la caja (is-playing) y el
       iframe encaja en la regla que le reserva la celda 1/1 de la grid, con la
       sinopsis debajo, en su posición correcta. (03/10/2026) */
    assert.ok(doc.querySelector(".node-player.is-playing > iframe"),
        "devuelta del fullscreen: el iframe encaja en la regla de la celda 1/1 de la grid");
    assert.ok(doc.querySelector(".node-player.is-playing > .node-player__synopsis"),
        "devuelta del fullscreen: la sinopsis sigue en la fila 2, debajo del vídeo");
    fromVimeo({ event: "ended" });
    assert.equal(unlocks, 3, "el final del vídeo suelta el bloqueo de orientación");
    dom.window.close();
}

/* Móvil (04/10/2026): si el visitante sale del fullscreen a mano (botón atrás,
   gesto, la propia X de Vimeo), la pantalla vuelve a girarse libre y el
   siguiente giro a horizontal devuelve el vídeo a pantalla completa. Antes la
   reentrada solo se armaba con una salida por vertical, así que tras una salida
   manual el giro ya no hacía nada. */
{
    const dom = new JSDOM(read("project-node.html"), {
        url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
    });
    const { window } = dom;
    window.matchMedia = (query) => ({
        matches: query.includes("max-width: 560px"),
        media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    const locks = [];
    let unlocks = 0;
    const orientation = {
        type: "landscape-primary",
        lock(kind) { locks.push(kind); return Promise.resolve(); },
        unlock() { unlocks += 1; return Promise.resolve(); },
    };
    window.screen.orientation = orientation;
    window.orientation = 90;
    window.eval(script);
    const doc = window.document;
    let reentered = 0;
    doc.getElementById("playFilm").click();
    const iframe = doc.querySelector(".node-player iframe");
    iframe.requestFullscreen = () => { reentered += 1; return Promise.resolve(); };
    iframe.webkitRequestFullscreen = iframe.requestFullscreen;
    assert.equal(locks.length, 0, "con el móvil ya en horizontal el play no bloquea nada: los giros quedan libres");
    const enterOrLeave = (on) => {
        Object.defineProperty(doc, "fullscreenElement", { get: () => (on ? iframe : null), configurable: true });
        window.dispatchEvent(new window.Event("fullscreenchange"));
    };
    enterOrLeave(true);
    assert.equal(reentered, 0, "entrar en fullscreen no repite la petición");
    enterOrLeave(false);
    assert.equal(unlocks, 1, "salir del fullscreen a mano suelta el bloqueo de orientación");
    const rotate = (type) => {
        orientation.type = type;
        window.orientation = type === "landscape-primary" ? 90 : 0;
        window.dispatchEvent(new window.Event("orientationchange"));
    };
    rotate("portrait-primary");
    assert.equal(reentered, 0, "en vertical no se vuelve a abrir solo");
    rotate("landscape-primary");
    assert.equal(reentered, 1, "tras una salida manual, girar a horizontal devuelve el fullscreen");
    /* El propio Vimeo también avisa cuando su reproductor entra o sale del
       fullscreen: con el móvil de nuevo en vertical, entrar vuelve a girar la
       pantalla; salir suelta el bloqueo. */
    const fromVimeo = (data) => window.dispatchEvent(new window.MessageEvent("message", {
        origin: "https://player.vimeo.com", source: iframe.contentWindow, data,
    }));
    rotate("portrait-primary");
    fromVimeo({ event: "fullscreenchange", data: { fullscreen: true } });
    assert.deepEqual(locks, ["landscape"], "el fullscreen de Vimeo recupera el apaisado con el móvil vertical");
    const unlocksBefore = unlocks;
    fromVimeo({ event: "fullscreenchange", data: { fullscreen: false } });
    assert.equal(unlocks, unlocksBefore + 1, "el Vimeo que sale del fullscreen suelta el bloqueo");
    dom.window.close();
}

/* Móvil (05/10/2026): la reentrada tras salida manual es repetible todas las
   veces que el visitante gire el teléfono, y NUNCA vuelve a bloquear la
   orientación — el bloqueo solo vive en el play inicial (si el móvil estaba
   vertical) y se suelta al salir. Si el navegador deniega el fullscreen
   (fullscreenerror o promise rechazado) el flag mobileFs se limpia para que
   el siguiente giro pueda volver a intentarlo. */
{
    const dom = new JSDOM(read("project-node.html"), {
        url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
    });
    const { window } = dom;
    window.matchMedia = (query) => ({
        matches: query.includes("max-width: 560px"),
        media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    const locks = [];
    let unlocks = 0;
    const orientation = {
        type: "landscape-primary",
        lock(kind) { locks.push(kind); return Promise.resolve(); },
        unlock() { unlocks += 1; return Promise.resolve(); },
    };
    window.screen.orientation = orientation;
    window.orientation = 90;
    window.eval(script);
    const doc = window.document;
    let reentered = 0;
    let errors = 0;
    doc.getElementById("playFilm").click();
    const iframe = doc.querySelector(".node-player iframe");
    iframe.requestFullscreen = () => {
        reentered += 1;
        return Promise.resolve();
    };
    iframe.webkitRequestFullscreen = iframe.requestFullscreen;
    // Tres ciclos completos: salida manual por fullscreenchange false, giro
    // a vertical, giro a horizontal (reentrada). El lock no se vuelve a pedir.
    const enterOrLeave = (on) => {
        Object.defineProperty(doc, "fullscreenElement", { get: () => (on ? iframe : null), configurable: true });
        window.dispatchEvent(new window.Event("fullscreenchange"));
    };
    const rotate = (type) => {
        orientation.type = type;
        window.orientation = type === "landscape-primary" ? 90 : 0;
        window.dispatchEvent(new window.Event("orientationchange"));
    };
    enterOrLeave(true);
    for (let i = 0; i < 3; i++) {
        enterOrLeave(false);
        rotate("portrait-primary");
        rotate("landscape-primary");
    }
    assert.equal(reentered, 3, "reentrada repetible: tres giros a horizontal tras sendas salidas manuales vuelven a pedir el fullscreen");
    assert.deepEqual(locks, [], "la reentrada por giro a horizontal NUNCA vuelve a bloquear la orientación");
    assert.equal(unlocks, 3, "cada salida suelta el (inexistente) bloqueo sin errores");
    // Ahora con el promise de requestFullscreen rechazado: el release limpia
    // mobileFs para que el siguiente giro lo vuelva a intentar.
    let rejected = 0;
    iframe.requestFullscreen = () => {
        rejected += 1;
        return Promise.reject(new Error("denied"));
    };
    iframe.webkitRequestFullscreen = iframe.requestFullscreen;
    enterOrLeave(false);
    rotate("portrait-primary");
    rotate("landscape-primary");
    assert.equal(rejected, 1, "un fullscreen denegado no impide que se siga intentando");
    // Y el evento fullscreenerror también limpia mobileFs para que el
    // siguiente giro pueda volver a pedir el fullscreen: primero dejamos
    // mobileFs = true (como si hubiésemos hecho una petición que falló),
    // disparamos fullscreenerror y luego giramos dos veces.
    rotate("portrait-primary");
    window.dispatchEvent(new window.Event("fullscreenerror"));
    const rejectedBeforeError = rejected;
    rotate("landscape-primary");
    assert.equal(rejected, rejectedBeforeError + 1, "fullscreenerror limpia mobileFs y el siguiente giro vuelve a intentar el fullscreen");
    dom.window.close();
}

/* La X de la web para el vídeo y devuelve el fotograma, sin dejar el reproductor. */
{
    const dom = new JSDOM(read("project-node.html"), {
        url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
    });
    const { window } = dom;
    window.matchMedia = () => ({
        matches: false, media: "",
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    window.eval(script);
    const doc = window.document;
    const posterSrc = doc.querySelector(".node-player > img").getAttribute("src");
    const openWindow = holdWindowOpen(window);
    doc.getElementById("playFilm").click();
    assert.equal(doc.querySelector(".node-player__exit"), null, "la X no sale mientras el título se desvanece");
    openWindow();
    const exit = doc.querySelector(".node-player__exit");
    assert.equal(exit.textContent.trim(), "", "la X no muestra la palabra Close");
    assert.equal(exit.getAttribute("aria-label"), "Close video");
    assert.ok(doc.querySelector(".node-player iframe"), "el vídeo está en marcha antes de la X");
    const box = doc.querySelector(".node-player");
    const spacer = doc.querySelector(".node-player-spacer");
    assert.ok(spacer, "el spacer guarda el hueco 16:9 en la página");
    // jsdom no mide: la ventana ocupa 1280×720 y el hueco del spacer es la
    // caja de 800×450 en (72, 300) — el regreso debe apuntar exactamente ahí.
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, x: 0, y: 0, toJSON() { return this; } });
    spacer.getBoundingClientRect = () => ({ left: 72, top: 300, width: 800, height: 450, right: 872, bottom: 750, x: 72, y: 300, toJSON() { return this; } });
    exit.click();
    /* El viaje de vuelta (03/10/2026): la X no desmonta nada todavía — la
       ventana regresa con la misma transición de transform que la amplió,
       pero al contrario, hacia el rectángulo del spacer; el vídeo queda
       pausado y la X, el escudo y el dock no viajan. */
    assert.ok(box.classList.contains("is-windowed"), "durante el regreso la caja sigue siendo la ventana");
    assert.ok(box.querySelector("iframe"), "durante el regreso el fotograma pausado sigue montado");
    assert.equal(box.style.transform, "translate(72px, 300px) scale(0.625, 0.625)",
        "la vuelta usa el mismo viaje de transform, invertido, hacia el rectángulo del spacer");
    assert.equal(doc.querySelector(".node-player__exit"), null, "la X no viaja con la caja");
    assert.equal(doc.querySelector(".node-player__shield"), null, "el escudo tampoco");
    assert.equal(doc.querySelector(".node-player__dock"), null, "ni el dock");
    openWindow.land();
    assert.equal(box.querySelector("iframe"), null, "al aterrizar, la X para y retira el vídeo");
    assert.equal(box.querySelector("img").getAttribute("src"), posterSrc, "vuelve el fotograma previo al play");
    assert.equal(box.querySelector(".node-player__play"), doc.getElementById("playFilm"), "vuelve el botón de play");
    assert.ok(!box.classList.contains("is-windowed"), "la X devuelve la ficha: la caja ya no ocupa la ventana");
    assert.ok(!box.classList.contains("is-playing"), "la ficha sale del estado de reproducción");
    assert.equal(doc.querySelector(".film-page-dimmer"), null, "la X retira el velo");
    assert.ok(!doc.body.classList.contains("film-is-playing"));
    assert.equal(doc.activeElement, doc.getElementById("playFilm"), "el foco vuelve al play");
    doc.getElementById("playFilm").click();
    assert.ok(doc.querySelector(".node-player iframe"), "después de la X se puede volver a reproducir");
    dom.window.close();
}

/* Si el espectador pide menos movimiento, el iframe desaparece sin animación. */
{
    const dom = new JSDOM(read("project-node.html"), {
        url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
    });
    const { window } = dom;
    window.matchMedia = (query) => ({ matches: query.includes("prefers-reduced-motion") });
    window.eval(script);
    const doc = window.document;
    doc.getElementById("playFilm").click();
    const iframe = doc.querySelector(".node-player iframe");
    window.dispatchEvent(new window.MessageEvent("message", {
        origin: "https://player.vimeo.com", source: iframe.contentWindow, data: { event: "ready" },
    }));
    window.dispatchEvent(new window.MessageEvent("message", {
        origin: "https://player.vimeo.com", source: iframe.contentWindow, data: { event: "ended" },
    }));
    assert.equal(doc.querySelector(".node-player iframe"), null, "reduced motion: sin transición al acabar");
    assert.ok(doc.querySelector(".node-player > img"), "reduced motion: el fotograma vuelve de inmediato");
    dom.window.close();
}

/* El thumbnail que se amplía al entrar desde el landing aterriza en la caja
   ya bajada 40px en web, y no se desplaza en móvil. En pantallas anchas
   (pagerStart por debajo de la cabecera tras el centrado) el scroll se recorta
   para que el paginador quede visible y el thumbnail se mide después, así que
   baja esos píxeles extra junto con la caja. (03/10/2026) */
function arrivalThumbnailTop(web, pagerStart = 120) {
    return new Promise((resolve) => {
        const dom = new JSDOM(read("project-node.html"), {
            url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
        });
        const { window } = dom;
        const doc = window.document;
        const player = doc.querySelector(".node-player");
        const image = player.querySelector("img");
        const pager = doc.querySelector(".node-pager");
        const header = doc.getElementById("siteHeader");
        let scrollDelta = 0;
        window.matchMedia = (query) => ({
            matches: web && query.includes("min-width: 561px"),
            media: query,
            addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
        });
        player.scrollIntoView = () => {};
        window.scrollBy = (x, y) => { scrollDelta += typeof x === "object" ? (x.top || 0) : (y || 0); };
        player.getBoundingClientRect = () => {
            const top = 300 - scrollDelta;
            return { left: 72, top, width: 800, height: 450, right: 872, bottom: top + 450, x: 72, y: top, toJSON() { return this; } };
        };
        // El paginador va anclado al documento (se mueve con el scroll); la
        // cabecera es fija, así que su rect no depende del scroll.
        pager.getBoundingClientRect = () => {
            const top = pagerStart - scrollDelta;
            return { left: 500, top, width: 200, height: 25, right: 700, bottom: top + 25, x: 500, y: top, toJSON() { return this; } };
        };
        header.getBoundingClientRect = () => (
            { left: 0, top: 0, width: 1920, height: 73, right: 1920, bottom: 73, x: 0, y: 0, toJSON() { return this; } }
        );
        window.sessionStorage.setItem("hfGeneratedTransition", JSON.stringify({
            left: 400, top: 500, width: 200, height: 80,
            image: image.getAttribute("src"), position: "center",
        }));
        window.eval(script);
        setTimeout(() => {
            const layer = doc.querySelector(".work-transition--arrival");
            assert.ok(layer, "el click del landing deja el thumbnail de llegada");
            // Recorte web: si tras subir 40px el paginador queda a menos de
            // 85px (cabecera 73px + 12 de margen), el scroll retrocede justo
            // hasta dejarlo en esos 85px.
            const clamp = web ? Math.min(0, (pagerStart + 40) - 85) : 0;
            const expected = web ? -40 + clamp : 0;
            assert.equal(scrollDelta, expected, web
                ? (clamp ? "web ancha: el scroll retrocede hasta dejar visible el paginador" : "web: el ancla sube 40px")
                : "móvil: el ancla no se mueve");
            if (web) {
                assert.ok(pagerStart - scrollDelta >= 85,
                    "web: el paginador (flechas + contador) queda por debajo de la cabecera fija");
            }
            assert.equal(layer.style.top, `${300 - expected}px`,
                web ? "web: el thumbnail baja con el scroll recortado y coincide con el vídeo" : "móvil: el thumbnail no baja");
            assert.equal(layer.style.left, "72px");
            assert.equal(layer.style.width, "800px");
            assert.equal(layer.style.height, "450px");
            dom.window.close();
            resolve();
        }, 80);
    });
}

Promise.all([
    arrivalThumbnailTop(true),
    arrivalThumbnailTop(false),
    /* Pantalla ancha: el centrado dejaba el paginador 20px por encima del
       viewport; el recorte lo devuelve a 85px bajo la cabecera. */
    arrivalThumbnailTop(true, -60),
]).then(() => {
    console.log(`\n✅ ALL PASS — ${ALL.length} páginas GENERATED con el estilo de project-node.html`);
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
