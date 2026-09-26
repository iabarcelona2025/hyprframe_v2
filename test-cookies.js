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

function boot(page, storage = null, blockStorage = false) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
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
    check("cookies.js no referencia googletagmanager",
        !/googletagmanager/.test(cookiesJs));

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAIL`);
    process.exit(failures === 0 ? 0 : 1);
})();
