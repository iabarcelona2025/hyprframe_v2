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
// El cursor arranca en la última posición guardada: al volver con atrás/adelante
// la página se recarga y la cruceta reaparecía en el centro hasta mover el ratón.
assert.match(script, /const CURSOR_KEY = "hfCursor"/, "generated.js guarda la posición del cursor");
assert.match(script, /sessionStorage\.getItem\(CURSOR_KEY\)/, "generated.js restaura la posición del cursor al cargar");
assert.match(script, /sessionStorage\.setItem\(CURSOR_KEY/, "generated.js persiste la posición del cursor al mover el ratón");

/* Reproducción bajo demanda de una pieza: Vimeo no se carga hasta el play, solo
   el propio Vimeo revela el reproductor (ni el load del iframe ni un mensaje de
   otro origen), el final devuelve el fotograma y el foco al botón, y una
   segunda reproducción funciona igual. */
function exercisePlayer(window, doc, page) {
    const fromVimeo = (data, { origin = "https://player.vimeo.com", source = window.document.querySelector(".node-player iframe")?.contentWindow } = {}) =>
        window.dispatchEvent(new window.MessageEvent("message", { origin, source, data }));
    assert.equal(doc.querySelector(".node-player iframe"), null, `${page.file}: Vimeo no se carga antes del play`);
    const posterSrc = doc.querySelector(".node-player > img").getAttribute("src");
    doc.getElementById("playFilm").click();
    const iframe = doc.querySelector(".node-player iframe");
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
    assert.equal(doc.querySelector(".node-player iframe"), null, `${page.file}: el iframe se retira al acabar`);
    assert.equal(doc.querySelector(".node-player > img").getAttribute("src"), posterSrc, `${page.file}: vuelve el fotograma de apertura`);
    assert.equal(doc.querySelector(".node-player > .node-player__play"), doc.getElementById("playFilm"), `${page.file}: con su botón de play`);
    assert.equal(doc.activeElement, doc.getElementById("playFilm"), `${page.file}: el foco pasa del reproductor al botón de play`);
    doc.getElementById("playFilm").click();
    const replay = doc.querySelector(".node-player iframe");
    replay.contentWindow.postMessage = () => {};
    assert.match(replay.src, new RegExp(`player\\.vimeo\\.com/video/${page.vimeo}\\?autoplay=1`), `${page.file}: la pieza se puede volver a reproducir`);
    doc.querySelector(".node-hero__explore").focus(); // el espectador ya está en otra parte de la página
    fromVimeo(JSON.stringify({ event: "ready" }), { source: replay.contentWindow });
    fromVimeo(JSON.stringify({ event: "ended" }), { source: replay.contentWindow });
    assert.ok(doc.querySelector(".node-player > img"), `${page.file}: el fotograma vuelve también tras repetir`);
    assert.equal(doc.activeElement, doc.querySelector(".node-hero__explore"), `${page.file}: no se roba el foco si el espectador está en otro sitio`);
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
        assert.match(html, /window\.HYPRFRAME_CONSENT_MODE\s*=\s*false/);
        assert.ok(html.indexOf("window.HYPRFRAME_CONSENT_MODE") < html.indexOf("googletagmanager.com/gtag/js"),
            `${page.file}: el interruptor de consentimiento va antes que gtag.js`);
        for (const style of ["styles.css", "generated.css"]) {
            assert.ok(doc.querySelector(`link[href^="${style}"]`), `${page.file}: no carga ${style}`);
        }
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
        assert.equal(doc.querySelector(".node-hero__top .kicker").textContent.trim(), "HYPRFRAME / GENERATED");
        // La fila superior del opener lleva solo el kicker: ← ALL WORK se fue
        // (el paginador arriba y VIEW ALL ↗ bajo la sinopsis ya cubren la salida).
        assert.ok(!doc.querySelector(".node-back"), `${page.file}: sigue el enlace ← ALL WORK`);
        assert.equal(doc.querySelector(".node-hero__top").children.length, 1,
            `${page.file}: la fila del kicker lleva más de un elemento`);
        assert.equal(doc.querySelector(".node-hero__explore").getAttribute("href"), "#film");
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
        assert.ok(doc.getElementById("cursorDot") && doc.getElementById("cursorRing"));

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
        assert.equal(doc.getElementById("film").querySelector(".node-player"), player);
        assert.equal(doc.querySelector(".node-player__play").textContent.trim(), "",
            "el triángulo de play se dibuja en CSS");
        assert.equal(doc.querySelector(".node-player > img").getAttribute("loading"), "lazy");

        assert.deepEqual([...doc.querySelectorAll(".node-section-label span:first-child")].map((el) => el.textContent),
            ["THE STORY", "KEEP EXPLORING"]);
        assert.ok(doc.querySelector(".node-story__copy p").textContent.trim().length > 60);
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
        assert.equal(doc.querySelector(".footer-row").textContent.trim(), "© 2026 HYPRFRAME. All rights reserved.");

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
    // El titular dibuja sus cuatro puntos con cajas CSS uniformes, sin el punto
    // final y sin el fotograma que abría la página.
    assert.equal(doc.querySelectorAll(".node-hero__dot").length, 4, "los cuatro puntos del titular son cajas CSS");
    // El opener se pinta con un color plano: si vuelve un degradado, se cuela aquí.
    assert.ok(!/radial-gradient|linear-gradient/.test(css), "el degradado del opener ha vuelto a generated.css");
    const explore = doc.querySelector(".node-hero__bottom > .node-hero__explore");
    assert.equal(explore.getAttribute("href"), "#film");
    assert.ok(!doc.querySelector(".node-hero__image .node-hero__explore"),
        "EXPLORE vive bajo el titular, no dentro del fondo del opener");
    assert.equal(explore.firstChild.textContent.trim(), "EXPLORE");
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
    // Debajo de HYPRFRAME / GENERATED, encima del titular.
    assert.ok(doc.querySelector(".node-hero__top + .node-pager"),
        `${file}: el paginador no va justo bajo el kicker`);
    assert.ok(doc.querySelector(".node-pager + .node-hero__image"),
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
        assert.match(visible, /^(Back|Next)$/, `${file}: «${visible}» no es solo Back/Next`);
        // El destino se anuncia por aria-label, ya que en pantalla no se ve.
        const label = link.getAttribute("aria-label") || "";
        assert.match(label, new RegExp(`^(Back|Previous|Next) project: .+`, 'i'), `${file}: aria-label ${label}`);
        assert.ok(label.toLowerCase().includes(workTitles[href].toLowerCase()),
            `${file}: «${label}» no nombra ${href}`);
    }
}

/* ── El reproductor de la sección es el de Captured (legacy.css) ──
   La ficha hereda el fotograma y el botón de play del diseño anterior: mismo
   gris apagado, mismo hover y mismo círculo. Las reglas llevan comentarios con
   la fecha del ajuste (p. ej. «-10% de diametro (27/09/2026)»), así que se leen
   con los comentarios fuera. */
const generatedFlat = squash(stripComments(css));
const legacyFlat = squash(stripComments(read("legacy.css")));
const nodeStill = ruleOf(generatedFlat, ".node-player > img");
const legacyStill = ruleOf(legacyFlat, ".film-card__poster img");
assert.equal(declaration(nodeStill, "filter"), declaration(legacyStill, "filter"),
    "el fotograma arranca con el gris apagado de Captured");
assert.match(nodeStill, /transition: transform 0\.9s var\(--ease-out\), filter 0\.6s;/);
const nodeRollover = ruleOf(generatedFlat, ".node-player:hover > img, .node-player:focus-within > img");
const legacyRollover = ruleOf(legacyFlat, ".film-card:hover .film-card__poster img, .film-card:focus-visible .film-card__poster img");
for (const property of ["transform", "filter"]) {
    assert.equal(declaration(nodeRollover, property), declaration(legacyRollover, property),
        `el fotograma hereda el hover de Captured (${property})`);
}
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
// Desktop: Montserrat 700, misma clamp que antes (6.4vw) pero ahora con
// font-family/weight separados para que N.O.D.E. respete Montserrat.
assert.match(css,
    /\.node-hero h1 \{[^}]*font-family: var\(--font-head\);[^}]*font-weight: 700;[^}]*font-size: clamp\(calc\(2\.99rem - 15px\), calc\(6\.4vw - 15px\), calc\(6\.4rem - 15px\)\)/,
    "las diez páginas comparten la misma clamp del titular en Montserrat");
const h1Rules = css.match(/\.node-hero h1 \{[^}]*\}/g);
assert.ok(h1Rules && h1Rules.length === 2, "el titular tiene exactamente dos reglas: escritorio y móvil");
const desktopRule = h1Rules[0];
const mobileRule = h1Rules[1];
assert.match(desktopRule, /white-space: nowrap/, "desktop: una sola línea");
assert.match(desktopRule, /var\(--font-head\)/, "desktop: Montserrat");
// Mobile: título adaptable en una sola línea — nunca se corta, siempre nowrap.
assert.match(mobileRule, /font-size: clamp\(1\.125rem, 5\.5vw, 2\.6rem\)/, "móvil: clamp adaptable para que entre en una línea");
assert.match(mobileRule, /white-space: nowrap/, "móvil: una sola línea, no se corta");
assert.ok(!/white-space: normal/.test(mobileRule), "móvil: ya no parte en líneas");
// N.O.D.E. respeta Montserrat igual que las otras 9.
assert.match(css, /\.node-hero__word \{[^}]*font-family: var\(--font-head\)/, "N.O.D.E. usa Montserrat");
assert.match(css, /\.node-hero__teaser \{[^}]*font-family: var\(--font-head\)/, "el teaser usa Montserrat");

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

/* ── Las fichas ES cierran LA HISTORIA con el equivalente corto ── */
for (const file of ALL) {
    const es = read(`es/${file}`);
    assert.match(es, /<a class="node-story__all" href="index\.html#work">VER TODO ↗<\/a>/,
        `es/${file}: el enlace de salida no es VER TODO ↗`);
    assert.ok(!/VER TODO EL TRABAJO/.test(es), `es/${file}: sigue el texto largo`);
}

console.log(`\n✅ ALL PASS — ${ALL.length} páginas GENERATED con el estilo de project-node.html`);
