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

    // Las 26 páginas envían el interruptor encendido, con defaults 'denied'
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

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAIL`);
    process.exit(failures === 0 ? 0 : 1);
})();
