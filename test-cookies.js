/* Smoke test: banner de consentimiento de cookies.
   Ejecuta cookies.js real sobre páginas reales en jsdom y comprueba que
   Google Analytics solo se carga cuando el visitante acepta. */
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
const gtagOf = (doc) => doc.querySelector('script[src*="googletagmanager.com/gtag/js"]');
const consentOf = (window) => {
    const raw = window.localStorage.getItem("hfCookieConsent");
    return raw ? JSON.parse(raw).value : null;
};

(async () => {
    /* ── 1. Primera visita en Captured (no tiene preloader) ── */
    let ctx = boot("legacy.html");
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("1ª visita: el banner aparece", !!bannerOf(ctx.doc));
    check("1ª visita: el banner entra visible", bannerOf(ctx.doc).classList.contains("show"));
    check("1ª visita: NO se ha pedido nada a Google", !gtagOf(ctx.doc));
    check("1ª visita: sin decisión guardada todavía", consentOf(ctx.window) === null);
    check("1ª visita: sin errores", ctx.errors.length === 0, ctx.errors.join("; "));

    /* ── 2. Aceptar ── */
    ctx.doc.querySelector(".cookie-accept").click();
    await wait(700);
    check("Aceptar: decisión guardada como granted", consentOf(ctx.window) === "granted");
    check("Aceptar: gtag se inyecta tras aceptar", !!gtagOf(ctx.doc));
    check("Aceptar: gtag apunta al ID correcto", /id=G-6MW201KGC9/.test(gtagOf(ctx.doc).src));
    check("Aceptar: el banner se retira del DOM", !bannerOf(ctx.doc));

    /* ── 3. Volver con el consentimiento ya concedido ── */
    ctx = boot("legacy.html", {
        hfCookieConsent: JSON.stringify({ value: "granted", until: Date.now() + 864e5 }),
    });
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Concedido: no vuelve a salir el banner", !bannerOf(ctx.doc));
    check("Concedido: gtag se carga automáticamente", !!gtagOf(ctx.doc));

    /* ── 4. Rechazar ── */
    ctx = boot("legacy.html");
    ctx.window.eval(cookiesJs);
    await wait(60);
    ctx.doc.querySelector(".cookie-reject").click();
    await wait(700);
    check("Rechazar: decisión guardada como denied", consentOf(ctx.window) === "denied");
    check("Rechazar: NO se carga gtag", !gtagOf(ctx.doc));
    check("Rechazar: el banner se retira del DOM", !bannerOf(ctx.doc));

    /* ── 5. Volver habiendo rechazado ── */
    ctx = boot("legacy.html", {
        hfCookieConsent: JSON.stringify({ value: "denied", until: Date.now() + 864e5 }),
    });
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Denegado: no vuelve a salir el banner", !bannerOf(ctx.doc));
    check("Denegado: sigue sin cargarse gtag", !gtagOf(ctx.doc));

    /* ── 6. Consentimiento caducado ── */
    ctx = boot("legacy.html", {
        hfCookieConsent: JSON.stringify({ value: "granted", until: Date.now() - 1000 }),
    });
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Caducado: el banner vuelve a aparecer", !!bannerOf(ctx.doc));
    check("Caducado: no se carga gtag sin un consentimiento vigente", !gtagOf(ctx.doc));

    /* ── 7. Almacenamiento bloqueado ── */
    ctx = boot("legacy.html", null, true);
    ctx.window.eval(cookiesJs);
    await wait(60);
    check("Storage bloqueado: no rompe", ctx.errors.length === 0, ctx.errors.join("; "));
    check("Storage bloqueado: el banner se muestra igualmente", !!bannerOf(ctx.doc));

    /* ── 8. En la landing el banner no interrumpe la intro ── */
    ctx = boot("index.html");
    ctx.window.eval(indexJs);   // arranca el preloader (contador 0→100)
    ctx.window.eval(cookiesJs);
    await wait(120);
    check("Landing: el banner espera a que acabe la intro",
        !!bannerOf(ctx.doc) && !bannerOf(ctx.doc).classList.contains("show"));
    await wait(2600);
    check("Landing: aparece cuando body.loaded", bannerOf(ctx.doc).classList.contains("show"));
    check("Landing: sin errores", ctx.errors.length === 0, ctx.errors.join("; "));

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAIL`);
    process.exit(failures === 0 ? 0 : 1);
})();
