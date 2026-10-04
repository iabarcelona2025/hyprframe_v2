/* Smoke test for the Captured page's links, navigation and video player. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "legacy.html"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "legacy.js"), "utf8");
const dom = new JSDOM(html, {
    url: "http://localhost:8080/legacy.html", runScripts: "outside-only", pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;
/* --- minimal browser API stubs jsdom lacks --- */
window.matchMedia = (q) => ({
    matches: q === "(min-width: 561px)", media: q,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
});
const indexDoc = new JSDOM(index).window.document;
const errors = [];
window.addEventListener("error", (event) => errors.push(event.message));

try {
    assert.match(html, /gtag\('config', 'G-6MW201KGC9'\)/);
    assert.equal((html.match(/googletagmanager\.com\/gtag\/js/g) || []).length, 1);
    for (const css of ["styles.css", "legacy.css"]) {
        assert.ok(fs.existsSync(path.join(root, css)), `${css} must exist`);
        assert.ok(doc.querySelector(`link[href^="${css}"]`), `${css} must be loaded`);
    }
    // Kanit → Montserrat en las dos páginas que comparten styles.css
    for (const [name, src] of [["legacy.html", html], ["index.html", index]]) {
        assert.ok(!/family=Kanit/.test(src), `${name} todavía carga Kanit`);
        assert.match(src, /family=Montserrat:ital,wght@/, `${name} no carga Montserrat`);
    }
    assert.ok(fs.existsSync(path.join(root, doc.querySelector(".logo img").getAttribute("src"))));

    const headerLinks = [...doc.querySelectorAll(".main-nav a")];
    assert.deepEqual(headerLinks.map((link) => link.textContent.trim()),
        [...indexDoc.querySelectorAll(".main-nav a")].map((link) => link.textContent.trim()));
    assert.equal(doc.querySelector(".main-nav [aria-current=page]").getAttribute("href"), "legacy.html");
    for (const link of doc.querySelectorAll(".site-header a, .menu-links a, .legacy-next a")) {
        const href = link.getAttribute("href");
        if (href.startsWith("https://")) continue; // Spanish site is not part of this repo.
        const resolved = new URL(href, window.location.href);
        const filename = resolved.pathname.slice(1);
        assert.ok(fs.existsSync(path.join(root, filename)), `missing destination ${href}`);
        if (resolved.hash) {
            const target = filename === "index.html" ? indexDoc : doc;
            assert.ok(target.getElementById(decodeURIComponent(resolved.hash.slice(1))), `missing anchor ${href}`);
        }
    }
    assert.equal(doc.querySelectorAll(".film-card").length, 8);
    assert.ok([...doc.querySelectorAll(".film-card")].every((link) =>
        link.href === `https://vimeo.com/${link.dataset.vimeo}` && link.querySelector("img[data-fallback-src]")));

    /* ── Capturado: catálogo sin «/ FILM» ni «/ MOTION» (04/10/2026) ──
       Las etiquetas se quedan con el género solo y «THE SUNDAY» pasa a ser
       INSERT / SEASON 02, como sus hermanas de temporada. DÁCIL / GROC se
       retiró por error y se ha recuperado (04/10/2026): vuelve como sexto
       vídeo, numerado 06 y con su género («MUSIC VIDEO» / «VIDEOCLIP»), ya
       sin «/ FILM». */
    const esLegacy = fs.readFileSync(path.join(root, "es", "legacy.html"), "utf8");
    const esLegacyDoc = new JSDOM(esLegacy).window.document;
    assert.equal(doc.querySelector("#filmsTitle").textContent.trim(), "WORK");
    assert.doesNotMatch(doc.querySelector("#filmsTitle").textContent, /SELECTED/i);
    assert.equal(esLegacyDoc.querySelector("#filmsTitle").textContent.trim(), "PROYECTOS");
    assert.doesNotMatch(esLegacyDoc.querySelector("#filmsTitle").textContent, /SELECTED|DESTACADOS/i);
    const genus = { "legacy.html": "MUSIC VIDEO", "es/legacy.html": "VIDEOCLIP" };
    const genusType = { "legacy.html": "CAMPAIGN", "es/legacy.html": "CAMPAÑA" };
    const genusSpot = { "legacy.html": "COMMERCIAL", "es/legacy.html": "SPOT" };
    for (const [name, src] of [["legacy.html", html], ["es/legacy.html", esLegacy]]) {
        const cards = [...new JSDOM(src).window.document.querySelectorAll(".film-card")];
        const types = cards.map((card) => card.querySelector(".film-card__type").textContent.trim());
        assert.equal(types.length, 8, `${name}: ocho vídeos`);
        assert.ok(types.every((type) => !/\s\/\s/.test(type)),
            `${name}: fuera «/ FILM» y «/ MOTION» — ${types.join(", ")}`);
        assert.ok(!/THE SUNDAY|EL DOMINGO/.test(src), `${name}: ya no queda «THE SUNDAY»`);
        const dacil = cards.find((card) => card.dataset.vimeo === "21087707");
        assert.ok(dacil, `${name}: DÁCIL / GROC vuelve al catálogo`);
        assert.equal(dacil.dataset.title, "DÁCIL / GROC");
        assert.equal(dacil.querySelector(".film-card__number").textContent, "06");
        assert.equal(dacil.querySelector(".film-card__fallback").textContent, "HF / 06");
        assert.equal(dacil.querySelector(".film-card__type").textContent, genus[name]);
        assert.match(dacil.querySelector("img").getAttribute("src"), /assets\/images\/groc2\.jpg$/);
        // Sin leyenda debajo de la tarjeta (ni sinopsis en el pop-up): la tarjeta
        // no lleva .film-card__details ni data-synopsis. (04/10/2026)
        assert.equal(dacil.querySelector(".film-card__details"), null,
            `${name}: DÁCIL / GROC va sin leyenda`);
        assert.equal(dacil.querySelector(".film-card__synopsis"), null);
        assert.equal(dacil.dataset.synopsis, undefined);

        // INSERT / SEASON 01: séptima tarjeta, campaña y con la miniatura del
        // vídeo (assets/images/insert01.jpg) y su respaldo de Vimeo. (04/10/2026)
        const season01 = cards.find((card) => card.dataset.vimeo === "1131285645");
        assert.ok(season01, `${name}: INSERT / SEASON 01 está en el catálogo`);
        assert.equal(season01.dataset.title, "INSERT / SEASON 01");
        assert.equal(season01.querySelector(".film-card__number").textContent, "07");
        assert.equal(season01.querySelector(".film-card__fallback").textContent, "HF / 07");
        assert.equal(season01.querySelector(".film-card__type").textContent, genusType[name]);
        assert.equal(season01.querySelector("img").getAttribute("src"), "assets/images/insert01.jpg");
        assert.match(season01.querySelector("img").getAttribute("data-fallback-src"),
            /^https:\/\/i\.vimeocdn\.com\/video\/2208326423-/);
        assert.equal(season01, cards[cards.length - 2], `${name}: la penúltima tarjeta`);

        // SXSW 2012 / VAN STORIES: octava tarjeta, campaña de Chevrolet con su
        // miniatura en assets/images/sxsw.jpg y su respaldo de Vimeo, y con la
        // info «Chevrolet: What drives You?» debajo. (04/10/2026)
        const sxsw = cards[cards.length - 1];
        assert.equal(sxsw.dataset.vimeo, "1131453934");
        assert.equal(sxsw.dataset.title, "SXSW 2012 / VAN STORIES");
        assert.equal(sxsw.querySelector(".film-card__number").textContent, "08");
        assert.equal(sxsw.querySelector(".film-card__fallback").textContent, "HF / 08");
        assert.equal(sxsw.querySelector(".film-card__type").textContent, genusSpot[name]);
        assert.equal(sxsw.querySelector("img").getAttribute("src"), "assets/images/sxsw.jpg");
        assert.match(sxsw.querySelector("img").getAttribute("data-fallback-src"),
            /^https:\/\/i\.vimeocdn\.com\/video\/2075388631-/);
        assert.equal(sxsw.querySelector(".film-card__synopsis").textContent, "Chevrolet: What drives You?");
        assert.equal(sxsw.querySelector(".film-card__client"), null, `${name}: SXSW no es de INSERT`);

        // INSERT / SEASON 01 lleva su info justo debajo de «Techno Club».
        const season1Text = name === "legacy.html"
            ? "INSERT SEASON 1: Beyond the Surface."
            : "INSERT TEMPORADA 1: Beyond the Surface.";
        const season01Details = season01.querySelector(".film-card__details");
        assert.ok(season01Details, `${name}: INSERT / SEASON 01 ya tiene leyenda`);
        assert.equal(season01Details.querySelector(".film-card__synopsis").textContent, season1Text);
        assert.equal(season01Details.previousElementSibling.className, "film-card__client",
            `${name}: la info va debajo de «Techno Club»`);
        assert.equal(season01.dataset.synopsis, season1Text);

        // INSERT → «Techno Club» justo debajo del género, visible en móvil y
        // escritorio. (04/10/2026)
        const inserts = cards.filter((card) => card.dataset.title.startsWith("INSERT /"));
        assert.equal(inserts.length, 4, `${name}: cuatro campañas de INSERT`);
        for (const card of inserts) {
            const client = card.querySelector(".film-card__client");
            assert.ok(client, `${name}: ${card.dataset.title} lleva cliente`);
            assert.equal(client.textContent.trim(), "Techno Club");
            assert.equal(client.previousElementSibling.className, "film-card__type",
                `${name}: el cliente va justo debajo del género`);
        }
        const otros = cards.filter((card) => !card.dataset.title.startsWith("INSERT /"));
        assert.ok(otros.every((card) => !card.querySelector(".film-card__client")),
            `${name}: las tarjetas que no son de INSERT no llevan cliente`);
    }
    assert.equal(doc.querySelectorAll(".film-card__title")[4].textContent, "INSERT / SEASON 02");
    assert.equal(doc.querySelectorAll(".film-card")[4].dataset.title, "INSERT / SEASON 02");
    assert.equal(doc.querySelectorAll(".film-card")[4].dataset.synopsis, "INSERT 2.0: The Sunday.");
    assert.equal(doc.querySelectorAll(".film-card__title")[5].textContent, "DÁCIL / GROC");

    // Play triangles are drawn in CSS (no "▶" glyph) and centred on their circle, which
    // keeps its centre on hover (`translate`, not `transform`, so `scale` can't drift it).
    const legacyCss = fs.readFileSync(path.join(root, "legacy.css"), "utf8");
    assert.equal(doc.querySelector(".legacy-hero__bottom p").textContent,
        "Real places. Real people.Stories worth keeping.");
    assert.match(legacyCss, /\.legacy-hero\s*\{[^}]*min-height: min\(410px, 47svh\)/);
    assert.match(legacyCss, /@media \(max-width: 560px\)[\s\S]*\.legacy-hero\s*\{\s*min-height: min\(320px, 42svh\)/);
    // Solo web: la línea de 1px bajo el hero sube 20px — min-height y relleno
    // inferior pierden 20px a la vez (contenido centrado). (03/10/2026)
    assert.match(legacyCss, /@media \(min-width: 561px\) \{\s*\.legacy-hero \{\s*min-height: calc\(min\(410px, 47svh\) - 20px\);\s*padding-bottom: calc\(clamp\(1\.5rem, 2\.5vw, 2\.5rem\) - 20px\);/,
        "web: la línea gris bajo «Stories worth keeping.» se acerca 20px");
    assert.equal(doc.querySelector(".legacy-hero__scroll"), null, "Captured: EXPLORE ↓ removed from the hero");
    assert.equal(esLegacyDoc.querySelector(".legacy-hero__scroll"), null, "Captured ES: EXPLORAR ↓ removed from the hero");
    assert.doesNotMatch(legacyCss, /\.legacy-hero__scroll/, "the removed hero link has no leftover styling");
    assert.match(legacyCss, /\.legacy-work__heading\s*\{[^}]*padding:\s*clamp\(calc\(5rem - 20px\), calc\(10vw - 20px\), calc\(9rem - 20px\)\) var\(--pad\) clamp\(calc\(2\.5rem \+ 20px\), calc\(5vw \+ 20px\), calc\(4rem \+ 20px\)\)/,
        "the heading moves up 20px while the equal bottom padding keeps the videos in place");
    assert.equal(doc.querySelector("#filmsTitle span").textContent, "WORK");
    assert.match(legacyCss, /\.legacy-work__heading h2 span\s*\{[^}]*font-style:\s*italic;/);
    // YOUR STORY / GOES NEXT: caja y letras al 80% (27/09/2026) y −10px (04/10/2026)
    assert.match(legacyCss, /\.legacy-next \{[^}]*padding:\s*clamp\(4rem, 8vw, 7\.2rem\) var\(--pad\)/,
        "the YOUR STORY box is 20% tighter");
    assert.match(legacyCss, /\.legacy-next h2 \{[^}]*font:\s*700 clamp\(calc\(2\.6rem - 10px\), calc\(7\.2vw - 10px\), calc\(8rem - 10px\)\)\/0\.97/,
        "las letras de YOUR STORY bajan 10px en los tres tramos del clamp (EN y ES)");
    const plays = [...doc.querySelectorAll(".film-card__play")];
    assert.equal(plays.length, 8);
    assert.ok(plays.every((play) => play.textContent === ""), "play triangles are drawn in CSS, not with a font glyph");
    const triangle = legacyCss.match(/\.film-card__play::before \{[^}]*clip-path: polygon\(([^;]+)\);/)[1].split(",")
        .map((point) => point.match(/calc\(50% [+-] [\d.]+em\)|50%/g).map((v) => (v === "50%" ? 0 : parseFloat(v.slice(9).replace(" ", "")))));
    assert.equal(triangle.length, 3);
    for (const axis of [0, 1]) {
        assert.ok(Math.abs(triangle.reduce((sum, point) => sum + point[axis], 0)) < 1e-3, "the triangle's centroid is the circle's centre");
    }
    const radii = triangle.map(([x, y]) => Math.hypot(x, y));
    assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-3, "the triangle's corners are equidistant from the circle's edge");
    const playRule = legacyCss.match(/\.film-card__play \{[^}]*\}/)[0];
    assert.match(playRule, /translate: -50% -50%;/);
    assert.doesNotMatch(playRule, /transform:/, "the hover scale must not drift the circle off the poster centre");

    /* ── Sin cursor propio: cruceta, punto y rollover desactivados (29/09/2026) ── */
    const stylesCss = fs.readFileSync(path.join(root, "styles.css"), "utf8");
    assert.doesNotMatch(script, /CURSOR_KEY|hfCursor|cursorDot|cursorRing|cursor-large/,
        "legacy.js no arranca ningún cursor propio");
    assert.doesNotMatch(html, /cursor-dot|cursor-ring|cursorDot|cursorRing/,
        "la página no lleva los nodos del cursor");
    assert.doesNotMatch(stylesCss, /\.cursor-dot|\.cursor-ring|cursor-large/,
        "styles.css ya no define cruceta, punto ni rollover");
    assert.doesNotMatch(legacyCss, /\.cursor-dot|\.cursor-ring|cursor-large/,
        "legacy.css ya no define cruceta, punto ni rollover");
    // Sin cursor propio el modal de vídeo vuelve a ser lo más alto de la página.
    const modalZ = Number(legacyCss.match(/\.film-modal \{[^}]*z-index: (\d+)/)[1]);
    assert.ok(modalZ > 9900, `el modal (${modalZ}) debe quedar por encima del resto`);

    let nativeFullscreenRequests = 0;
    doc.getElementById("videoModal").requestFullscreen = () => {
        nativeFullscreenRequests++;
        return Promise.resolve();
    };
    window.eval(script);
    const burger = doc.getElementById("burger");
    const menu = doc.getElementById("menuOverlay");
    const modal = doc.getElementById("videoModal");
    const player = doc.getElementById("vimeoPlayer");
    const closeButton = doc.getElementById("modalClose");
    const firstCard = doc.querySelector(".film-card");
    const key = (name, shiftKey = false) => doc.dispatchEvent(new window.KeyboardEvent("keydown", {
        key: name, shiftKey, bubbles: true, cancelable: true,
    }));

    // El hover ya no hace nada: ni la tarjeta de película ni el cierre del modal
    // mueven el cuerpo, porque el rollover del cursor está desactivado.
    firstCard.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: false }));
    assert.ok(!doc.body.classList.contains("cursor-large"), "hover sobre una tarjeta no agranda el cursor");
    firstCard.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: false }));
    closeButton.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: false }));
    assert.ok(!doc.body.classList.contains("cursor-large"), "hover sobre el cierre del modal no agranda el cursor");
    closeButton.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: false }));

    burger.click();
    assert.ok(doc.body.classList.contains("menu-open"));
    assert.equal(burger.getAttribute("aria-expanded"), "true");
    assert.equal(menu.getAttribute("aria-hidden"), "false");
    assert.equal(doc.activeElement, menu.querySelector("a"));
    key("Escape");
    assert.ok(!doc.body.classList.contains("menu-open"));
    assert.equal(doc.activeElement, burger);

    Object.defineProperty(window, "scrollY", { value: 60, configurable: true });
    window.dispatchEvent(new window.Event("scroll"));
    assert.ok(doc.getElementById("siteHeader").classList.contains("scrolled"));

    firstCard.click();
    assert.equal(modal.hidden, false);
    assert.ok(modal.classList.contains("is-windowed"), "desktop video covers the browser window");
    assert.ok(!modal.classList.contains("is-mobile-fullscreen"));
    assert.equal(nativeFullscreenRequests, 0, "desktop does not enter system fullscreen");
    assert.ok(doc.body.classList.contains("modal-open"));
    assert.match(player.src, /player\.vimeo\.com\/video\/1131285757\?autoplay=1&dnt=1/);
    assert.equal(new URL(player.src).searchParams.get("transparent"), "0",
        "Vimeo paints the same opaque black background as Generated");
    assert.equal(doc.getElementById("modalTitle").textContent, firstCard.dataset.title);
    assert.ok(!doc.getElementById("modalExternal") && !doc.body.textContent.includes("WATCH ON VIMEO"),
        "the WATCH ON VIMEO link was removed from the modal on purpose");
    assert.equal(doc.activeElement, closeButton);
    key("Tab", true);
    assert.equal(doc.activeElement, player, "Shift+Tab on CLOSE wraps to the player");
    // Tabbing past the last control of the cross-origin Vimeo iframe happens inside the
    // iframe, so this page only sees focus landing behind the modal: it must come back.
    doc.querySelector(".footer-back a").focus();
    assert.equal(doc.activeElement, closeButton, "focus stays inside the modal");
    key("Escape");
    assert.equal(modal.hidden, true);
    assert.ok(!modal.classList.contains("is-windowed"), "closing removes windowed playback");
    assert.equal(player.getAttribute("src"), "");
    assert.equal(doc.activeElement, firstCard);

    doc.querySelectorAll(".film-card")[1].click();
    modal.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.equal(modal.hidden, true, "clicking backdrop closes the video");

    // Cast credit: the pop-up shows data-cast, and says nothing for the films that don't carry it.
    const castLine = doc.getElementById("videoCast");
    // Its rule must stay more specific than ".film-modal__info p", which sets font-size
    // and colour for the synopsis and would otherwise win on the same element.
    assert.match(legacyCss, /\.film-modal__info \.film-modal__cast\s*\{[^}]*margin-top:/);
    doc.querySelectorAll(".film-card")[1].click();
    assert.equal(castLine.hidden, false, "BRUBAKER / NOSE DUEL shows its cast in the pop-up");
    assert.equal(castLine.textContent, "With Jordi Roca, Andrés Velencoso");
    doc.querySelectorAll(".film-card")[0].click();
    assert.equal(castLine.hidden, true, "films without data-cast keep the cast line hidden");
    assert.equal(castLine.textContent, "");

    // Sinopsis opcional (data-synopsis): DÁCIL / GROC no la lleva, así que su
    // pop-up no repite la leyenda; los demás vídeos la siguen mostrando.
    const synopsisLine = doc.getElementById("videoSynopsis");
    assert.equal(synopsisLine.hidden, false, "los vídeos con sinopsis la muestran en el pop-up");
    assert.equal(synopsisLine.textContent, "INSERT SEASON 5: Sounds frozen in time.");
    doc.querySelectorAll(".film-card")[5].click();          // DÁCIL / GROC
    assert.equal(synopsisLine.hidden, true, "DÁCIL / GROC no muestra leyenda en el pop-up");
    assert.equal(synopsisLine.textContent, "");
    doc.querySelectorAll(".film-card")[6].click();          // INSERT / SEASON 01
    assert.equal(synopsisLine.hidden, false, "INSERT / SEASON 01 muestra su info en el pop-up");
    assert.equal(synopsisLine.textContent, "INSERT SEASON 1: Beyond the Surface.");   // página EN
    doc.querySelectorAll(".film-card")[1].click();          // BRUBAKER / NOSE DUEL
    assert.equal(synopsisLine.hidden, false, "al abrir otro vídeo, la línea vuelve");
    assert.equal(synopsisLine.textContent, "BRUBAKER CO: Nose duel.");
    key("Escape");

    // The pop-up closes by itself when the film ends: once Vimeo reports "ready", the page
    // subscribes to "ended" through the player's postMessage API and closes on that event.
    const endingCard = doc.querySelectorAll(".film-card")[2];
    const sent = [];
    const fromVimeo = (data, { origin = "https://player.vimeo.com", source = player.contentWindow } = {}) =>
        window.dispatchEvent(new window.MessageEvent("message", { origin, source, data }));
    endingCard.click();
    player.contentWindow.postMessage = (message, targetOrigin) => sent.push({ message, targetOrigin });
    fromVimeo(JSON.stringify({ event: "ready", player_id: "" }));
    // (JSON round-trip: the message object was created in the page's realm, not Node's.)
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ message: { method: "addEventListener", value: "ended" }, targetOrigin: "https://player.vimeo.com" }],
        "the page asks the Vimeo player to report when the film ends");
    fromVimeo({ event: "ended" }, { origin: "https://example.com" });
    fromVimeo({ event: "ended" }, { source: window });
    fromVimeo("not json");
    assert.equal(modal.hidden, false, "only the Vimeo player in the pop-up can close it");
    fromVimeo(JSON.stringify({ event: "ended", data: { seconds: 70, percent: 1, duration: 70 } }));
    assert.equal(modal.hidden, true, "the pop-up closes as soon as the film ends");
    assert.equal(player.getAttribute("src"), "", "the ended film is unloaded");
    assert.ok(!doc.body.classList.contains("modal-open"));
    assert.equal(doc.activeElement, endingCard, "focus returns to the film that just ended");
    endingCard.click(); // the player may also send plain objects instead of JSON strings
    fromVimeo({ event: "ready" });
    fromVimeo({ event: "ended" });
    assert.equal(modal.hidden, true, "object messages from Vimeo work too");

    const image = firstCard.querySelector("img");
    image.dispatchEvent(new window.Event("error"));
    assert.equal(image.src, image.dataset.fallbackSrc, "fallback to the real Vimeo thumbnail");
    image.dispatchEvent(new window.Event("error"));
    assert.ok(image.classList.contains("is-unavailable"), "poster remains legible offline");
    // La versión ES comparte legacy.js y legacy.css por symlink: la ausencia del
    // cursor y las versiones de los assets no pueden desincronizarse de la EN.
    const esHtml = fs.readFileSync(path.join(root, "es", "legacy.html"), "utf8");
    const esDoc = new JSDOM(esHtml).window.document;
    assert.ok(!esDoc.getElementById("cursorDot") && !esDoc.getElementById("cursorRing"),
        "es/legacy.html tampoco lleva los nodos del cursor");
    const version = (src, asset) => src.match(new RegExp(`${asset}\\?v=(\\d+)`))[1];
    for (const asset of ["legacy.js", "legacy.css"]) {
        assert.equal(version(esHtml, asset), version(html, asset),
            `es/legacy.html pide otra versión de ${asset} que legacy.html`);
    }

    endingCard.click();
    closeButton.click();
    assert.ok(modal.hidden && !modal.classList.contains("is-windowed"), "X stops windowed playback");
    assert.equal(player.getAttribute("src"), "");
    assert.equal(nativeFullscreenRequests, 0);
    for (const page of [doc, esDoc]) {
        for (const card of page.querySelectorAll(".film-card")) {
            const details = card.querySelector(".film-card__details");
            if (card.dataset.vimeo === "21087707") {
                // DÁCIL / GROC es la única tarjeta sin leyenda.
                assert.equal(details, null, "DÁCIL / GROC va sin leyenda");
                continue;
            }
            assert.ok(details, "every film includes its pop-up copy in the grid");
            const before = details.previousElementSibling;
            assert.ok(["film-card__type", "film-card__client"].includes(before.className),
                `la leyenda va tras el género o tras el cliente — ${before.className}`);
            assert.equal(details.querySelector(".film-card__synopsis").textContent, card.dataset.synopsis);
            assert.equal(details.querySelector(".film-card__cast")?.textContent, card.dataset.cast);
        }
    }
    // Dos líneas bajo el título: el género en el cuerpo técnico (monoespaciada,
    // 0.62rem, muy espaciada) y el cliente en el cuerpo de la info de la ficha
    // (Space Grotesk 0.88rem/1.6, como la sinopsis). (04/10/2026)
    assert.match(legacyCss, /\.film-card__type,\s*\n\.film-card__client \{\s*\n\s*display: block;\s*\n\s*color: var\(--muted\);/,
        "las dos líneas parten de la misma base (bloque y color)");
    assert.match(legacyCss, /\.film-card__type \{[^}]*font-family: var\(--font-mono\); font-weight: 400;[^}]*font-size: calc\(0\.62rem \+ 3px\);[^}]*line-height: 1\.5;[^}]*letter-spacing: 0\.2em;/,
        "el género sigue en el cuerpo técnico monoespaciado, 3px más grande");
    assert.match(legacyCss, /\.film-card__client \{[^}]*font-family: var\(--font-body\);[^}]*font-size: 0\.88rem; line-height: 1\.6;/,
        "el cliente usa el cuerpo de la info (Space Grotesk 0.88rem/1.6)");
    // Y el mismo cuerpo que la sinopsis de la ficha, que es la referencia.
    assert.match(legacyCss, /\.film-card__details \{\s*display: block;[^}]*font-size: 0\.88rem;[^}]*line-height: 1\.6;/,
        "la sinopsis aparece en las tarjetas, también en móvil, con cuerpo 0.88rem/1.6");
    assert.match(legacyCss, /\.film-card__synopsis, \.film-card__cast \{ display: block; \}/,
        "sinopsis y reparto ocupan líneas propias en móvil");
    assert.match(legacyCss, /\.film-card__client \+ \.film-card__details \{ margin-top: 0\.3rem; \}/,
        "la leyenda de INSERT queda más cerca de Techno Club, como un bloque de texto");
    // Real dimensions exercise the animated path (jsdom otherwise reports zeros).
    const panel = modal.querySelector(".film-modal__panel");
    const rect = (left, top, width, height) => ({ left, top, width, height });
    firstCard.querySelector(".film-card__poster").getBoundingClientRect = () => rect(40, 200, 480, 300);
    panel.getBoundingClientRect = modal.getBoundingClientRect = () => rect(0, 0, 1200, 800);
    firstCard.click();
    assert.ok(panel.querySelector(".film-modal__opening-poster"), "poster travels while Vimeo loads");
    fromVimeo({ event: "ready" });
    assert.ok(player.classList.contains("is-ready"), "Vimeo is revealed only when ready");
    assert.ok(!panel.querySelector(".film-modal__opening-poster"), "ready playback has no poster behind it");
    assert.match(legacyCss, /\.film-modal\.is-windowed \.film-modal__video \{ background: #000; \}/,
        "the layer directly behind Vimeo is opaque black");
    const pauseMessages = [];
    player.contentWindow.postMessage = message => pauseMessages.push(message);
    closeButton.click();
    assert.equal(modal.hidden, false, "keep the picture mounted during the return animation");
    assert.ok(modal.classList.contains("is-closing"));
    assert.match(panel.style.transform, /translate\(40px, 200px\) scale\(0.4, 0.375\)/);
    assert.equal(pauseMessages[0].method, "pause");
    closeButton.click();
    assert.equal(pauseMessages.length, 1, "repeat close cannot restart the animation");
    const landed = new window.Event("transitionend");
    Object.defineProperty(landed, "propertyName", { value: "transform" });
    panel.dispatchEvent(landed);
    assert.equal(modal.hidden, true);
    assert.equal(player.getAttribute("src"), "");
    assert.equal(panel.style.transform, "");
    assert.ok(!panel.querySelector(".film-modal__opening-poster"));
    assert.ok(!modal.classList.contains("is-closing"));
    assert.equal(doc.activeElement, firstCard);
    assert.deepEqual(errors, [], "no runtime errors");
    console.log("PASS  Captured: root navigation, eight films, video modal, keyboard and image fallback");
} finally {
    dom.window.close();
}
