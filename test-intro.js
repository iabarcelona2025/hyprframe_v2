/* Smoke test: la intro (contador 0→100) solo se reproduce una vez por sesión.
   Ejecuta los scripts reales (head + script.js) de index.html en jsdom. */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
// scripts inline del <head> (el que marca hf-skip-intro), en orden de aparición
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(storage = {}, url = "https://hyprframe.com/") {
    const dom = new JSDOM(html, {
        url,
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
    window.EventSource = class { constructor() {} }; // live-reload del preview
    for (const [k, v] of Object.entries(storage)) window.sessionStorage.setItem(k, v);
    const errors = [];
    window.addEventListener("error", (e) => errors.push(e.message));
    return { window, errors };
}

(async () => {
    /* ── 1ª visita: la intro SÍ se reproduce ── */
    let { window, errors } = boot();
    inlineScripts.forEach((s) => window.eval(s));
    const doc = window.document;
    check("1ª visita: el head no marca skip-intro", !doc.documentElement.classList.contains("hf-skip-intro"));
    window.eval(js);
    check("1ª visita: preloader en el DOM", !!doc.getElementById("preloader"));
    check("1ª visita: hero bloqueado hasta acabar la intro", !doc.body.classList.contains("loaded"));
    await wait(600);
    const mid = parseInt(doc.getElementById("preCount").textContent, 10);
    check("1ª visita: el contador sube", mid > 0 && mid < 100, "count=" + mid);
    check("1ª visita: flag guardada en sessionStorage", window.sessionStorage.getItem("hfIntroSeen") === "1");
    /* El contador tarda 46 pasos de 28 ms = 1,29 s en llegar a 100 (antes 46 ×
       40 ms = 1,84 s). Se mide desde el arranque del script, no con una espera
       fija, para que un cambio de cadencia no pase desapercibido. (30/09/2026) */
    const t0 = Date.now();
    while (doc.getElementById("preCount").textContent !== "100" && Date.now() - t0 < 6000) {
        await wait(10);
    }
    const reached = Date.now() - t0 + 600;
    check("1ª visita: el contador tarda ~1,29 s (46 pasos × 28 ms)",
        doc.getElementById("preCount").textContent === "100" && reached > 900 && reached < 2000,
        "contador a 100 a los " + reached + "ms");
    await wait(2000);
    check("1ª visita: contador a 100 y body.loaded", doc.getElementById("preCount").textContent === "100"
        && doc.body.classList.contains("loaded"));
    check("1ª visita: preloader con .done", doc.getElementById("preloader").classList.contains("done"));
    check("1ª visita: sin errores", errors.length === 0, errors.join(" | "));

    /* ── 2ª carga en la misma sesión (volver desde legacy.html) ── */
    ({ window, errors } = boot({ hfIntroSeen: "1" }));
    inlineScripts.forEach((s) => window.eval(s));
    const doc2 = window.document;
    check("vuelta a la landing: <html> con .hf-skip-intro antes del primer frame",
        doc2.documentElement.classList.contains("hf-skip-intro"));
    window.eval(js);
    check("vuelta a la landing: preloader fuera del DOM (no hay contador)", doc2.getElementById("preloader") === null);
    check("vuelta a la landing: hero visible al instante", doc2.body.classList.contains("loaded"));
    await wait(500);
    check("vuelta a la landing: el contador no se reanuda", doc2.getElementById("preCount") === null);
    check("vuelta a la landing: sin errores", errors.length === 0, errors.join(" | "));

    /* ── storage bloqueado: se comporta como siempre ── */
    ({ window, errors } = boot());
    window.sessionStorage.getItem = () => { throw new Error("blocked"); };
    window.sessionStorage.setItem = () => { throw new Error("blocked"); };
    inlineScripts.forEach((s) => window.eval(s));
    const doc3 = window.document;
    check("storage bloqueado: no rompe, la intro se reproduce", !doc3.documentElement.classList.contains("hf-skip-intro"));
    window.eval(js);
    await wait(600);
    check("storage bloqueado: el contador sube igualmente", parseInt(doc3.getElementById("preCount").textContent, 10) > 0);

    /* ── Preview de desarrollo (localhost / e2b.app): la intro se ve SIEMPRE ──
       El host de desarrollo marca <html> con .hf-force-intro y limpia la marca
       de sesión, así que da igual haberla visto: se reproduce. ?intro=0 es la
       única forma de callarla ahí. (30/09/2026) */
    ({ window, errors } = boot({ hfIntroSeen: "1" }, "http://localhost:8080/"));
    inlineScripts.forEach((s) => window.eval(s));
    const doc4 = window.document;
    check("preview: <html> con .hf-force-intro aunque la intro ya se haya visto",
        doc4.documentElement.classList.contains("hf-force-intro")
        && !doc4.documentElement.classList.contains("hf-skip-intro"));
    window.eval(js);
    check("preview: el preloader sigue en el DOM y la cuenta arranca",
        !!doc4.getElementById("preloader") && !doc4.body.classList.contains("loaded"));
    await wait(600);
    const previewCount = parseInt(doc4.getElementById("preCount").textContent, 10);
    const previewBar = parseFloat(doc4.getElementById("preBar").style.width);
    check("preview: contador y barra progresan sincronizados",
        previewCount > 0 && previewCount < 100 && previewBar === previewCount,
        `count=${previewCount}, bar=${previewBar}%`);

    ({ window, errors } = boot({}, "http://localhost:8080/?intro=0"));
    inlineScripts.forEach((s) => window.eval(s));
    const doc5 = window.document;
    check("preview + ?intro=0: intro silenciada", doc5.documentElement.classList.contains("hf-skip-intro"));
    window.eval(js);
    check("preview + ?intro=0: preloader fuera del DOM y hero visible",
        doc5.getElementById("preloader") === null && doc5.body.classList.contains("loaded"));

    /* ── ?intro=1 en producción: petición explícita, también con reduce-motion ── */
    ({ window, errors } = boot({ hfIntroSeen: "1" }, "https://hyprframe.com/?intro=1"));
    inlineScripts.forEach((s) => window.eval(s));
    const doc6 = window.document;
    check("producción + ?intro=1: .hf-force-intro y sin .hf-skip-intro",
        doc6.documentElement.classList.contains("hf-force-intro")
        && !doc6.documentElement.classList.contains("hf-skip-intro"));

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
})();
