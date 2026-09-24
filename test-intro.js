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

function boot(storage = {}) {
    const dom = new JSDOM(html, {
        url: "http://localhost:8080/",
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
    await wait(3200);
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

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
})();
