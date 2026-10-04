/* Smoke test: banner de consentimiento de cookies.
   Ejecuta cookies.js real sobre páginas reales en jsdom y comprueba que
   registra la decisión del visitante sin tocar el Google Analytics que
   ya cargan legacy.html y project-node.html. */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const cookiesJs = fs.readFileSync(path.join(root, "cookies.js"), "utf8");
const indexJs = fs.readFileSync(path.join(root, "script.js"), "utf8");

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const inlineScripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// transform (opcional) reescribe el HTML antes de montar la página:
// sirve para simular el interruptor apagado sin tocar los archivos.
function boot(page, storage = null, blockStorage = false, transform = null) {
    let html = fs.readFileSync(path.join(root, page), "utf8");
    if (transform) html = transform(html);
    const dom = new JSDOM(html, {
        url: `http://localhost:8080/${page}`,
        pretendToBeVisual: true,
        runScripts: "outside-only",
    });
    const { window } = dom;
    window.matchMedia = (q) => ({
        matches: false, media: q,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
    });
    window.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }], this), 5); }
        unobserve() {} disconnect() {}
    };
    window.Image = class { set src(v) { this._src = v; } get src() { return this._src; } };
    window.EventSource = class { constructor() {} };
    // builder.html llama a lucide.createIcons() en su window.onload; el CDN no
    // se descarga en jsdom, así que se stubbea igual que los otros globales.
    window.lucide = { createIcons() {} };

    if (blockStorage) {
        Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    } else if (storage) {
        for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
    }

    const errors = [];
    window.addEventListener("error", (e) => errors.push(e.message));
    inlineScripts(html).forEach((s) => window.eval(s));
    return { window, doc: window.document, errors };
}

const bannerOf = (doc) => doc.getElementById("cookieBanner");
// El gtag original de la página. cookies.js no debe añadir ninguno más.
const gtagCount = (doc) => doc.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]').length;
const consentOf = (window) => {
    const raw = window.localStorage.getItem("hfCookieConsent");
    return raw ? JSON.parse(raw).value : null;
};

(async () => {
    /* ── 1. Primera visita en Captured (no tiene preloader) ── */
    let ctx = boot("legacy.html");
    check("1ª visita: el gtag original de la página sigue ahí", gtagCount(ctx.doc) === 1);
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("1ª visita: el banner aparece", !!bannerOf(ctx.doc));
    check("1ª visita: el banner entra visible", bannerOf(ctx.doc).classList.contains("show"));
    check("1ª visita: sin decisión guardada todavía", consentOf(ctx.window) === null);
    check("1ª visita: sin errores", ctx.errors.length === 0, ctx.errors.join("; "));

    /* ── 2. Aceptar ── */
    ctx.doc.querySelector(".cookie-accept").click();
    await wait(700);
    check("Aceptar: decisión guardada como granted", consentOf(ctx.window) === "granted");
    check("Aceptar: NO se inyecta un segundo gtag", gtagCount(ctx.doc) === 1,
        "encontrados " + gtagCount(ctx.doc));
    check("Aceptar: el banner se retira del DOM", !bannerOf(ctx.doc));

    /* ── 3. Volver con el consentimiento ya concedido ── */
    ctx = boot("legacy.html", {
        hfCookieConsent: JSON.stringify({ value: "granted", until: Date.now() + 864e5 }),
    });
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Concedido: no vuelve a salir el banner", !bannerOf(ctx.doc));
    check("Concedido: el gtag original intacto y sin duplicar", gtagCount(ctx.doc) === 1);

    /* ── 4. Rechazar ── */
    ctx = boot("legacy.html");
    ctx.window.eval(cookiesJs);
    await wait(60);
    ctx.doc.querySelector(".cookie-reject").click();
    await wait(700);
    check("Rechazar: decisión guardada como denied", consentOf(ctx.window) === "denied");
    check("Rechazar: no se altera el gtag de la página", gtagCount(ctx.doc) === 1);
    check("Rechazar: el banner se retira del DOM", !bannerOf(ctx.doc));

    /* ── 5. Volver habiendo rechazado ── */
    ctx = boot("legacy.html", {
        hfCookieConsent: JSON.stringify({ value: "denied", until: Date.now() + 864e5 }),
    });
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Denegado: no vuelve a salir el banner", !bannerOf(ctx.doc));

    /* ── 6. Consentimiento caducado ── */
    ctx = boot("legacy.html", {
        hfCookieConsent: JSON.stringify({ value: "granted", until: Date.now() - 1000 }),
    });
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Caducado: el banner vuelve a aparecer", !!bannerOf(ctx.doc));
    check("Caducado: se limpia el registro vencido", consentOf(ctx.window) === null);

    /* ── 7. Almacenamiento bloqueado ── */
    ctx = boot("legacy.html", null, true);
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Storage bloqueado: no rompe", ctx.errors.length === 0, ctx.errors.join("; "));
    check("Storage bloqueado: el banner se muestra igualmente", !!bannerOf(ctx.doc));

    /* ── 8. N.O.D.E. mantiene su analytics y gana el banner ── */
    ctx = boot("project-node.html");
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("N.O.D.E.: gtag original presente", gtagCount(ctx.doc) === 1);
    check("N.O.D.E.: banner mostrado", !!bannerOf(ctx.doc));

    /* ── 9. En la landing el banner no interrumpe la intro ── */
    ctx = boot("index.html");
    ctx.window.eval(indexJs);   // arranca el preloader (contador 0→100)
    ctx.window.eval(cookiesJs);
    await wait(120);
    check("Landing: el banner espera a que acabe la intro",
        !!bannerOf(ctx.doc) && !bannerOf(ctx.doc).classList.contains("show"));
    await wait(2600);
    check("Landing: aparece cuando body.loaded", bannerOf(ctx.doc).classList.contains("show"));
    check("Landing: sin errores", ctx.errors.length === 0, ctx.errors.join("; "));

    /* ── 10. El widget no vuelve a tocar Google Analytics ── */
    check("cookies.js no inyecta googletagmanager por su cuenta",
        !/googletagmanager\.com/.test(cookiesJs));

    /* ── 11. Consent Mode ENCENDIDO (estado en producción) ── */
    const consentUpdates = (w) => (w.dataLayer || [])
        .filter((a) => a[0] === "consent" && a[1] === "update")
        .map((a) => a[2]);
    const consentDefaults = (w) => (w.dataLayer || [])
        .filter((a) => a[0] === "consent" && a[1] === "default")
        .map((a) => a[2]);

    // Las 28 páginas envían el interruptor encendido, con defaults 'denied'
    // globales (sin restricción de región: todo el EEE queda cubierto), y el
    // bloque va ANTES del gtag.js cuando la página lo carga.
    const projectPages = [
        "project-asics.html", "project-deep.html", "project-distant.html",
        "project-exit.html", "project-farewell.html", "project-iad.html",
        "project-node.html", "project-polestar5.html", "project-ryuu.html",
        "project-stained.html",
    ];
    const allPages = [
        "index.html", "legacy.html", "builder.html", ...projectPages,
        "es/index.html", "es/legacy.html", "es/builder.html",
        ...projectPages.map((p) => "es/" + p),
        "cookie-policy.html", "es/cookie-policy.html",
    ];
    for (const page of allPages) {
        const src = fs.readFileSync(path.join(root, page), "utf8");
        const defaultBlock = (src.match(/gtag\('consent', 'default', \{[\s\S]*?\}\)/) || [""])[0];
        const flagAt = src.indexOf("window.HYPRFRAME_CONSENT_MODE");
        const gtagAt = src.indexOf("googletagmanager.com/gtag/js");
        check(`${page}: interruptor encendido y defaults denied globales`,
            /window\.HYPRFRAME_CONSENT_MODE\s*=\s*true/.test(src) &&
            defaultBlock.includes("'analytics_storage': 'denied'") &&
            defaultBlock.includes("'ad_storage': 'denied'") &&
            !defaultBlock.includes("'region'"));
        if (gtagAt !== -1) {
            check(`${page}: el interruptor va antes que gtag.js`,
                flagAt !== -1 && flagAt < gtagAt);
        }
    }

    ctx = boot("legacy.html");
    check("Consent Mode: encendido por defecto", ctx.window.HYPRFRAME_CONSENT_MODE === true);
    check("Defaults denied emitidos antes de que llegue gtag",
        consentDefaults(ctx.window).length === 1 &&
        consentDefaults(ctx.window)[0]?.analytics_storage === "denied" &&
        consentDefaults(ctx.window)[0]?.ad_storage === "denied",
        JSON.stringify(consentDefaults(ctx.window)));
    ctx.window.eval(cookiesJs);
    await wait(60);
    ctx.doc.querySelector(".cookie-accept").click();
    await wait(50);
    check("ON por defecto: aceptar emite consent update granted",
        consentUpdates(ctx.window).length === 1 &&
        consentUpdates(ctx.window)[0]?.analytics_storage === "granted",
        JSON.stringify(consentUpdates(ctx.window)));

    /* ── 11b. Interruptor apagado a mano (modo OFF simulado) ── */
    const switchOff = (html) => html.replace(
        "window.HYPRFRAME_CONSENT_MODE = true;",
        "window.HYPRFRAME_CONSENT_MODE = false;"
    );
    ctx = boot("legacy.html", null, false, switchOff);
    check("OFF simulado: no se emiten consent defaults",
        consentDefaults(ctx.window).length === 0);
    ctx.window.eval(cookiesJs);
    await wait(60);
    ctx.doc.querySelector(".cookie-accept").click();
    await wait(50);
    check("OFF simulado: aceptar NO emite consent update",
        consentUpdates(ctx.window).length === 0,
        JSON.stringify(consentUpdates(ctx.window)));

    /* ── 12. Consent Mode ENCENDIDO — comportamiento del widget ──
       (redundante a propósito: la sección 11 ya comprueba el estado por
       defecto; aquí se fuerza el flag para aislar cookies.js del HTML) */
    ctx = boot("legacy.html");
    ctx.window.HYPRFRAME_CONSENT_MODE = true;
    ctx.window.eval(cookiesJs);
    await wait(60);
    ctx.doc.querySelector(".cookie-accept").click();
    await wait(50);
    check("Consent Mode ON: aceptar emite consent update",
        consentUpdates(ctx.window).length === 1);
    check("Consent Mode ON: analytics_storage queda granted",
        consentUpdates(ctx.window)[0]?.analytics_storage === "granted");

    ctx = boot("legacy.html");
    ctx.window.HYPRFRAME_CONSENT_MODE = true;
    ctx.window.eval(cookiesJs);
    await wait(60);
    ctx.doc.querySelector(".cookie-reject").click();
    await wait(50);
    check("Consent Mode ON: rechazar deja analytics_storage en denied",
        consentUpdates(ctx.window)[0]?.analytics_storage === "denied");

    ctx = boot("legacy.html", {
        hfCookieConsent: JSON.stringify({ value: "granted", until: Date.now() + 864e5 }),
    });
    ctx.window.HYPRFRAME_CONSENT_MODE = true;
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Consent Mode ON: la decisión guardada se comunica al volver",
        consentUpdates(ctx.window).length === 1 &&
        consentUpdates(ctx.window)[0].analytics_storage === "granted");

    /* ── 13. builder.html (CLB) también lleva el banner ── */
    ctx = boot("builder.html");
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("CLB: el banner aparece", !!bannerOf(ctx.doc));
    check("CLB: tiene los dos botones",
        !!ctx.doc.querySelector(".cookie-accept") && !!ctx.doc.querySelector(".cookie-reject"));
    check("CLB: incluye cookies.js",
        /cookies\.js\?v=/.test(fs.readFileSync(path.join(root, "builder.html"), "utf8")));
    check("CLB: define sus propios estilos del banner",
        /\.cookie-banner\s*\{/.test(fs.readFileSync(path.join(root, "builder.html"), "utf8")));
    check("CLB: sin errores", ctx.errors.length === 0, ctx.errors.join("; "));

    /* ── 14. Barra conforme: información, enlace y alternativas ── */
    ctx = boot("legacy.html");
    ctx.window.eval(cookiesJs);
    await wait(60);
    const banner = bannerOf(ctx.doc);
    const policyLink = banner.querySelector(".cookie-link");
    check("Barra: enlaza la política de cookies",
        !!policyLink && policyLink.getAttribute("href") === "cookie-policy.html");
    check("Barra: aceptar y rechazar comparten fila y peso",
        !!banner.querySelector(".cookie-actions .cookie-accept") &&
        !!banner.querySelector(".cookie-actions .cookie-reject") &&
        banner.querySelector(".cookie-accept") !== banner.querySelector(".cookie-reject"));
    check("Barra: hay una tercera vía, configurar por finalidades",
        !!banner.querySelector("[data-cookie-config]"));
    check("Barra: nada premarcado",
        banner.querySelector("[data-purpose='analytics']").checked === false);
    check("Barra: el panel de preferencias arranca cerrado",
        banner.querySelector("#cookiePrefs").hidden === true);

    /* ── 15. Consentimiento por finalidades ── */
    banner.querySelector("[data-cookie-config]").click();
    await wait(20);
    check("Configurar: el panel se despliega",
        banner.querySelector("#cookiePrefs").hidden === false &&
        banner.querySelector("[data-cookie-config]").getAttribute("aria-expanded") === "true");
    banner.querySelector("[data-cookie-save]").click();
    await wait(50);
    check("Guardar sin analítica: decisión denied", consentOf(ctx.window) === "denied");
    let record = JSON.parse(ctx.window.localStorage.getItem("hfCookieConsent"));
    check("Registro: guarda finalidades, fecha y versión",
        record.purposes && record.purposes.necessary === true &&
        record.purposes.analytics === false &&
        typeof record.ts === "number" && record.v === 2,
        JSON.stringify(record));

    ctx = boot("legacy.html");
    ctx.window.eval(cookiesJs);
    await wait(60);
    bannerOf(ctx.doc).querySelector("[data-cookie-config]").click();
    bannerOf(ctx.doc).querySelector("[data-purpose='analytics']").checked = true;
    bannerOf(ctx.doc).querySelector("[data-cookie-save]").click();
    await wait(50);
    check("Guardar con analítica: decisión granted", consentOf(ctx.window) === "granted");
    record = JSON.parse(ctx.window.localStorage.getItem("hfCookieConsent"));
    check("Guardar con analítica: la finalidad queda registrada",
        record.purposes.analytics === true);
    check("Guardar con analítica: consent update granted",
        consentUpdates(ctx.window).at(-1)?.analytics_storage === "granted");

    /* ── 16. Retirada del consentimiento desde el pie de página ── */
    ctx = boot("legacy.html", {
        hfCookieConsent: JSON.stringify({ value: "granted", until: Date.now() + 864e5 }),
    });
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Con decisión guardada: no hay barra y se comunica a Google",
        !bannerOf(ctx.doc) && consentUpdates(ctx.window).length === 1);
    const settingsBtn = ctx.doc.querySelector("[data-cookie-settings]");
    check("Pie: el botón «Cookie settings» está en la página", !!settingsBtn);
    settingsBtn.click();
    await wait(60);
    check("Pie: «Cookie settings» reabre la barra", !!bannerOf(ctx.doc));
    check("Barra reabierta: el interruptor refleja la decisión guardada",
        bannerOf(ctx.doc).querySelector("#cookieAnalytics").checked === true);
    bannerOf(ctx.doc).querySelector(".cookie-reject").click();
    await wait(50);
    check("Retirar: la nueva decisión es denied", consentOf(ctx.window) === "denied");
    check("Retirar: consent update denied",
        consentUpdates(ctx.window).at(-1)?.analytics_storage === "denied");

    /* ── 17. Enlaces legales en las 28 páginas y política en EN/ES ── */
    for (const page of allPages) {
        const src = fs.readFileSync(path.join(root, page), "utf8");
        const footer = (src.match(/<footer\b[\s\S]*?<\/footer>/i) || [""])[0];
        const isBuilder = page.endsWith("builder.html");
        const settingsArea = isBuilder ? src : footer;
        const settingsLabel = page.startsWith("es/") ? "Configurar cookies" : "Cookie settings";
        check(`${page}: enlaza la política y ofrece configurar`,
            /href="cookie-policy\.html"/.test(src) &&
            /data-cookie-settings/.test(settingsArea) &&
            settingsArea.includes(settingsLabel) &&
            (!isBuilder || /w-px h-3/.test(src)));
    }
    for (const page of ["404.html", "es/404.html"]) {
        const src = fs.readFileSync(path.join(root, page), "utf8");
        check(`${page}: enlaza la política (sin barra: no carga cookies.js)`,
            /\/cookie-policy\.html/.test(src) && !/cookies\.js/.test(src));
    }
    const policyEn = fs.readFileSync(path.join(root, "cookie-policy.html"), "utf8");
    const policyEs = fs.readFileSync(path.join(root, "es", "cookie-policy.html"), "utf8");
    check("Política EN: tabla con las cookies reales del sitio",
        /hfCookieConsent/.test(policyEn) && /_ga_G-6MW201KGC9/.test(policyEn) &&
        /_ga</.test(policyEn) && /2 years/.test(policyEn) && /6 months/.test(policyEn));
    check("Política: documenta las cookies de Vimeo y su dnt=1",
        /__cf_bm/.test(policyEn) && /vimeo_player_/.test(policyEn) &&
        /dnt=1/.test(policyEn) && /Vimeo's cookie policy/.test(policyEn));
    check("Política: secciones y estados como la referencia",
        /Essential Cookies/.test(policyEn) && /Analytics Cookies/.test(policyEn) &&
        /Video Cookies/.test(policyEn) && (policyEn.match(/Always active/g) || []).length === 2);
    check("Política: caducidad del registro = la del widget (180 días = 6 meses)",
        /6 months/.test(policyEn) && /REMEMBER_MS/.test(cookiesJs) &&
        /180 \* 24 \* 60 \* 60 \* 1000/.test(cookiesJs));
    check("Política ES: traducida, con interruptor y acceso a ajustes en el pie",
        /Política de cookies/.test(policyEs) && /data-cookie-policy-toggle/.test(policyEs) &&
        /data-cookie-settings/.test(policyEs) && /AEPD/.test(policyEs));
    check("Política: hreflang recíproco EN ↔ ES",
        /hreflang="es" href="https:\/\/hyprframe\.com\/es\/cookie-policy\.html"/.test(policyEn) &&
        /hreflang="en" href="https:\/\/hyprframe\.com\/cookie-policy\.html"/.test(policyEs));
    check("Política: entra en el sitemap",
        /https:\/\/hyprframe\.com\/cookie-policy\.html/.test(fs.readFileSync(path.join(root, "sitemap.xml"), "utf8")));

    /* ── 18. Barra inferior de ancho completo, como la referencia ── */
    const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
    const barRule = (css.match(/\.cookie-banner \{[\s\S]*?\}/) || [""])[0];
    const headerRule = (css.match(/\.site-header\.scrolled \{[\s\S]*?\}/) || [""])[0];
    check("Pie: una línea vertical de 1 px separa los enlaces legales del copyright",
        /\.footer-legal\s*\{[^}]*border-left:\s*1px solid var\(--line\)/.test(css));
    check("Barra: ocupa el ancho completo y va pegada abajo",
        /position: fixed/.test(barRule) && /left: 0/.test(barRule) && /right: 0/.test(barRule) &&
        /bottom: 0/.test(barRule));
    check("Barra: gris translúcido con desenfoque, como la cabecera fija",
        /rgba\(46, 46, 48, 0\.62\)/.test(barRule) && /backdrop-filter: blur\(16px\)/.test(barRule));
    check("Barra: el desenfoque es el mismo material que el de la cabecera",
        /backdrop-filter: blur\(16px\)/.test(barRule) &&
        /backdrop-filter: blur\(14px\)/.test(headerRule));

    ctx = boot("legacy.html");
    ctx.window.eval(cookiesJs);
    await wait(60);
    const bar = bannerOf(ctx.doc);
    check("Barra: el texto es el de la referencia",
        /This website uses cookies\. For more information, see our/.test(bar.textContent));
    check("Barra: botones Accept, Decline y Preferences",
        bar.querySelector(".cookie-accept").textContent.trim() === "Accept" &&
        bar.querySelector(".cookie-reject").textContent.trim() === "Decline" &&
        bar.querySelector("[data-cookie-config]").textContent.trim() === "Preferences");
    check("Barra: el enlace es «Cookie Policy»",
        bar.querySelector(".cookie-link").textContent.trim() === "Cookie Policy");
    check("Barra: sin título de encabezado (como en la referencia)",
        !bar.querySelector(".cookie-title"));
    check("Barra: aceptar y rechazar siguen en la misma fila",
        !!bar.querySelector(".cookie-actions .cookie-accept") &&
        !!bar.querySelector(".cookie-actions .cookie-reject"));
    check("Barra: preferencias abre el panel por finalidades",
        !!bar.querySelector("#cookiePrefs") && bar.querySelector("#cookiePrefs").hidden === true);

    /* ── 19. Interruptor de analítica en la propia política ── */
    ctx = boot("cookie-policy.html");
    ctx.window.eval(cookiesJs);
    await wait(60);
    const toggle = ctx.doc.querySelector("[data-cookie-policy-toggle]");
    check("Política: lista los cinco navegadores con su enlace de ayuda",
        ["Chrome", "Firefox", "Safari", "Edge", "Brave"].every((b) => policyEn.includes("Cookie settings in ") && policyEn.includes(b)) &&
        (policyEn.match(/<li><a href="https:\/\/support\./g) || []).length === 5 &&
        /support\.brave\.app\/hc\/en-us\/articles\/360048833872/.test(policyEn) &&
        policyEs.includes("Configuración de cookies en Brave"));
    check("Política: hay interruptor de analítica", !!toggle);
    check("Política: arranca apagado sin decisión", toggle.checked === false);
    check("Política: sin decisión guardada la barra sigue apareciendo", !!bannerOf(ctx.doc));
    toggle.checked = true;
    toggle.dispatchEvent(new ctx.window.Event("change", { bubbles: true }));
    await wait(40);
    check("Política: encender el interruptor guarda granted", consentOf(ctx.window) === "granted");
    check("Política: y lo comunica a Google",
        consentUpdates(ctx.window).at(-1)?.analytics_storage === "granted");
    toggle.checked = false;
    toggle.dispatchEvent(new ctx.window.Event("change", { bubbles: true }));
    await wait(40);
    check("Política: apagarlo retira el consentimiento", consentOf(ctx.window) === "denied");

    ctx = boot("cookie-policy.html", {
        hfCookieConsent: JSON.stringify({ value: "granted", until: Date.now() + 864e5 }),
    });
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Política: al volver, el interruptor refleja la decisión",
        ctx.doc.querySelector("[data-cookie-policy-toggle]").checked === true);

    /* ── 20. Fondo gris oscuro de la página legal ── */
    check("Política: el <body> se marca como página legal",
        /<body class="page-legal">/.test(policyEn) && /<body class="page-legal">/.test(policyEs));
    const legalRule = (css.match(/body\.page-legal \{([^}]*)\}/) || ["", ""])[1];
    const legalToken = (css.match(/--bg-legal:\s*([^;]+);/) || ["", ""])[1].trim();
    check("Política: el fondo es un gris oscuro, no el negro de la web",
        /background:\s*var\(--bg-legal\)/.test(legalRule) && /^#[0-9a-f]{6}$/i.test(legalToken) &&
        legalToken.toLowerCase() !== "#050505",
        legalToken);
    check("Política: el gris se pinta también en <html> (lienzo del scroll)",
        /html:has\(body\.page-legal\)\s*\{\s*background:\s*var\(--bg-legal\)/.test(css));
    const grey = legalToken.replace("#", "").match(/../g).map((h) => parseInt(h, 16));
    check("Política: el gris va en el rango oscuro (cada canal entre 16 y 64)",
        grey.every((c) => c >= 16 && c <= 64), grey.join(","));
    check("Política: gris neutro (sin dominante de color)",
        Math.max(...grey) - Math.min(...grey) <= 4, grey.join(","));
    check("El resto de páginas conservan el negro de la web",
        /body \{\s*background:\s*var\(--bg\)/.test(css.replace(/\n/g, " ")) ||
        /\nbody \{[\s\S]*?background: var\(--bg\)/.test(css));

    /* ── 20. Página sin cabecera: logo dentro del escrito, sin ES/EN ── */
    for (const [file, source] of [["EN", policyEn], ["ES", policyEs]]) {
        check(`Política ${file}: sin cabecera fija ni selector de idioma`,
            !/site-header/.test(source) && !/lang-switch/.test(source));
        check(`Política ${file}: el logo va dentro del escrito y enlaza a portada`,
            /class="legal-logo" href="(\.\.\/)?index\.html#top"/.test(source) &&
            /class="legal-logo"[\s\S]{0,200}?assets\/images\/logo\.png/.test(source));
        check(`Política ${file}: fuera la sección de contacto`,
            !/Who to contact/.test(source) && !/Con quién contactar/.test(source) &&
            !/wa\.me\/34645795080/.test(source));
    }
    check("El logo de la política va centrado en la columna",
        /\.legal-logo \{[\s\S]*?display: flex; justify-content: center;/.test(css));
    check("El logo de la política usa la misma escala que la cabecera del sitio",
        /\.legal-logo img \{[\s\S]*?height: clamp\(41\.4px, 4\.485vw, 59\.8px\)/.test(css));
    check("Política: sin errores", ctx.errors.length === 0, ctx.errors.join("; "));

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAIL`);
    process.exit(failures === 0 ? 0 : 1);
})();
