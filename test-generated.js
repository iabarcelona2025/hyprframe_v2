/* Smoke test de la sección GENERATED: las 9 páginas de vídeo comparten el
   esqueleto, el estilo y el script de project-node.html (styles.css +
   generated.css + generated.js). Se comprueba que ninguna se ha quedado con
   restos de la plantilla antigua y que el reproductor de cada una apunta a su
   propio Vimeo. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const PAGES = [
    { file: "project-deep.html", vimeo: "1185276367", title: "Deep in the Forest", aria: "Deep in the Forest [Teaser]" },
    { file: "project-polestar5.html", vimeo: "1180539625", title: "Polestar 5", aria: "Polestar 5 [Commercial]" },
    { file: "project-distant.html", vimeo: "1164823364", title: "Distant", aria: "Distant [Trailer]" },
    { file: "project-exit.html", vimeo: "1141629024", title: "Exit Plan", aria: "Exit Plan [Campaign]" },
    { file: "project-stained.html", vimeo: "1126933718", title: "Stained", aria: "Stained [Short Film]" },
    { file: "project-asics.html", vimeo: "1131296888", title: "Asics Vulcano", aria: "Asics Vulcano [Commercial]" },
    { file: "project-farewell.html", vimeo: "1148202010", title: "Farewell", aria: "Farewell [Short Film]" },
    { file: "project-iad.html", vimeo: "1159850270", title: "IAD Annual Meeting", aria: "IAD [Annual Meeting]" },
    { file: "project-ryuu.html", vimeo: "1136653573", title: "Ryuu, the Dragon's Course", aria: "Ryuu, the Dragon's Course" },
];

const nodeHtml = read("project-node.html");
const nodeDoc = new JSDOM(nodeHtml).window.document;
const indexDoc = new JSDOM(read("index.html")).window.document;
const script = read("generated.js");
const css = read("generated.css");
const navLabels = (doc, selector) => [...doc.querySelectorAll(selector)].map((el) => el.textContent.trim());
const seenTitles = new Map();

assert.ok(!script.includes("1227346538"), "generated.js no hardcodea el vídeo de N.O.D.E.");
assert.match(script, /dataset\.vimeo/, "generated.js lee el vídeo del marcado de cada página");

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
        for (const legacy of ["pieza.css", "burger-menu", "mobile-nav", "projects-navigation", "related-item", "video-container", "fade-in"]) {
            assert.ok(!html.includes(legacy), `${page.file}: queda el resto de plantilla antigua «${legacy}»`);
        }
        for (const link of doc.querySelectorAll('link[rel="apple-touch-icon"], link[rel="icon"], link[rel="shortcut icon"], link[rel="manifest"]')) {
            assert.ok(fs.existsSync(path.join(root, link.getAttribute("href").replace(/^\//, ""))),
                `${page.file}: falta ${link.getAttribute("href")}`);
        }

        /* ── SEO: cada pieza con su propio título (antes lo compartían las 10) ── */
        assert.ok(doc.title.includes("HYPRFRAME"), `${page.file}: el title lleva la marca`);
        assert.ok(doc.title.includes(page.title.split(" [")[0].split(" ")[0]),
            `${page.file}: el title nombra la pieza`);
        assert.ok(!seenTitles.has(doc.title), `«${doc.title}» se repite con ${seenTitles.get(doc.title)}`);
        seenTitles.set(doc.title, page.file);
        assert.ok(doc.querySelector('meta[name="description"]').content.length > 40);
        assert.equal(doc.querySelector('meta[property="og:image"]').content,
            `https://hyprframe.com/${doc.querySelector(".node-player > img").getAttribute("src")}`);

        /* ── Navegación idéntica a la landing y a N.O.D.E. ── */
        assert.deepEqual(navLabels(doc, ".main-nav a"), navLabels(indexDoc, ".main-nav a"));
        assert.deepEqual(navLabels(doc, ".menu-links a"), navLabels(indexDoc, ".menu-links a"));
        assert.deepEqual(navLabels(doc, ".site-header"), navLabels(nodeDoc, ".site-header"));
        assert.equal(doc.querySelector(".node-hero__top .kicker").textContent.trim(), "HYPRFRAME / GENERATED");
        assert.equal(doc.querySelector(".node-back").getAttribute("href"), "index.html#work");
        assert.equal(doc.querySelector(".node-hero__explore").getAttribute("href"), "#film");
        // VIEW ALL WORK ↗ cierra THE STORY: bajo la sinopsis, sobre la línea gris.
        const all = doc.querySelector(".node-story__all");
        assert.equal(all.getAttribute("href"), "index.html#work");
        assert.equal(all.textContent.trim(), "VIEW ALL WORK ↗");
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
        // WCAG 2.5.3: el nombre accesible contiene todo el texto visible del titular.
        for (const word of h1.textContent.split(/\s+/).filter(Boolean)) {
            assert.ok(h1.getAttribute("aria-label").toLowerCase().includes(word.replace(/[\[\]]/g, "").toLowerCase()),
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
        cards.forEach((card, i) => {
            assert.match(card.querySelector(".node-card__meta span").textContent, new RegExp(`^0${i + 1} / `));
            assert.ok(card.querySelector(".node-card__title").textContent.trim().length > 2);
            assert.notEqual(card.getAttribute("href"), page.file, `${page.file}: se enlaza a sí misma`);
        });
        assert.equal(doc.querySelector(".footer-row").textContent.trim(), "© 2026 HYPRFRAME. All rights reserved.");

        /* ── Comportamiento: menú móvil y reproductor bajo demanda ── */
        window.eval(script);
        const burger = doc.getElementById("burger");
        const menu = doc.getElementById("menuOverlay");
        burger.click();
        assert.ok(doc.body.classList.contains("menu-open"));
        assert.equal(burger.getAttribute("aria-expanded"), "true");
        assert.equal(menu.getAttribute("aria-hidden"), "false");
        window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        assert.ok(!doc.body.classList.contains("menu-open"));

        assert.equal(doc.querySelector(".node-player iframe"), null, "Vimeo no se carga antes del play");
        const posterSrc = doc.querySelector(".node-player > img").getAttribute("src");
        doc.getElementById("playFilm").click();
        const iframe = doc.querySelector(".node-player iframe");
        iframe.contentWindow.postMessage = () => {};
        assert.match(iframe.src, new RegExp(`player\\.vimeo\\.com/video/${page.vimeo}\\?autoplay=1&dnt=1&transparent=0`));
        assert.equal(iframe.title, `${player.dataset.title} — HYPRFRAME`);
        window.dispatchEvent(new window.MessageEvent("message", {
            origin: "https://player.vimeo.com", source: iframe.contentWindow,
            data: JSON.stringify({ event: "ready" }),
        }));
        assert.ok(iframe.classList.contains("is-ready"), "el player aparece solo cuando Vimeo está listo");
        window.dispatchEvent(new window.MessageEvent("message", {
            origin: "https://player.vimeo.com", source: iframe.contentWindow,
            data: JSON.stringify({ event: "ended" }),
        }));
        assert.equal(doc.querySelector(".node-player iframe"), null, "el iframe se retira al acabar");
        assert.equal(doc.querySelector(".node-player > img").getAttribute("src"), posterSrc,
            "el fotograma de apertura vuelve al terminar");
        assert.equal(doc.querySelector(".node-player > .node-player__play"), doc.getElementById("playFilm"),
            "con su botón de play");
        assert.deepEqual(errors, [], `${page.file}: errores en consola`);
    } finally {
        dom.window.close();
    }
    console.log(`PASS  GENERATED · ${page.file}: opener, vídeo ${page.vimeo}, historia y relacionadas`);
}

/* ── La landing enlaza todas las piezas de la sección ── */
const workRows = [...indexDoc.querySelectorAll(".work-row")];
const workOrder = workRows.map((el) =>
    new URL(el.getAttribute("href"), "http://localhost:8080/index.html").pathname.slice(1));
const workTitles = Object.fromEntries(workRows.map((el) => [
    new URL(el.getAttribute("href"), "http://localhost:8080/index.html").pathname.slice(1),
    el.querySelector(".work-title").textContent.trim(),
]));
const ALL = ["project-node.html", ...PAGES.map((page) => page.file)];
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
        assert.match(visible, /^(Previous|Next)$/, `${file}: «${visible}» no es solo Previous/Next`);
        // El destino se anuncia por aria-label, ya que en pantalla no se ve.
        const label = link.getAttribute("aria-label") || "";
        assert.match(label, new RegExp(`^${visible} project: .+`), `${file}: aria-label ${label}`);
        assert.ok(label.toLowerCase().includes(workTitles[href].toLowerCase()),
            `${file}: «${label}» no nombra ${href}`);
    }
}

/* ── El titular del opener tiene una talla única, fijada por el más largo ── */
assert.ok(!/node-hero--long/.test(css), "generated.css conserva la talla especial para titulares largos");
assert.match(css,
    /\.node-hero h1 \{\s*font: 700 clamp\(calc\(3\.36rem - 15px\), calc\(7\.2vw - 15px\), calc\(7\.2rem - 15px\)\)\/0\.8 var\(--font-head\);/,
    "las diez páginas comparten la misma clamp del titular");
assert.deepEqual(css.match(/\.node-hero h1 \{[^}]*\}/g).map((rule) => rule.match(/(?:font|font-size): ([^;]+);/)[1]),
    ["700 clamp(calc(3.36rem - 15px), calc(7.2vw - 15px), calc(7.2rem - 15px))/0.8 var(--font-head)",
     "clamp(calc(3.7rem - 15px), calc(16vw - 15px), calc(6.5rem - 15px))"],
    "el titular tiene exactamente dos tallas: la común de escritorio y la de móvil");
assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.node-hero h1 \{ font-size: clamp\(calc\(3\.7rem - 15px\), calc\(16vw - 15px\), calc\(6\.5rem - 15px\)\); white-space: normal; \}/,
    "por debajo de 560px el titular parte en líneas, como antes");

/* ── VIEW ALL WORK ↗ cierra THE STORY en las diez páginas ── */
assert.ok(css.includes(".node-story__all"), "generated.css no da estilo al enlace bajo la sinopsis");
assert.ok(!/\.node-related__heading > a/.test(css),
    "generated.css conserva el estilo del enlace junto a RELATED PROJECTS");
assert.match(css,
    /\.node-story__all \{[^}]*margin-left: auto;[^}]*margin-bottom: clamp\(2\.5rem, 5vw, 4rem\);/,
    "el enlace se alinea con la sinopsis y se acerca a la línea gris");

console.log(`\n✅ ALL PASS — ${ALL.length} páginas GENERATED con el estilo de project-node.html`);
