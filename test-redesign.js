/* Smoke test: runs the REAL script.js against the REAL index.html in jsdom */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");

const dom = new JSDOM(html, {
    url: "http://localhost:8080/",
    pretendToBeVisual: true, // enables requestAnimationFrame
    runScripts: "outside-only",
});
const { window } = dom;

/* --- minimal browser API stubs jsdom lacks --- */
window.matchMedia = (q) => ({
    matches: false, media: q,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
});
class IOStub {
    constructor(cb) { this.cb = cb; }
    observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }], this), 5); }
    unobserve() {} disconnect() {}
}
window.IntersectionObserver = IOStub;
window.Image = class { set src(v) { this._src = v; } get src() { return this._src; } };

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const errors = [];
    window.addEventListener("error", (e) => errors.push(e.message));

    // record the moment body.loaded is set (hero ready)
    let loadedAt = null;
    new window.MutationObserver(() => {
        if (loadedAt === null && window.document.body.classList.contains("loaded")) loadedAt = Date.now();
    }).observe(window.document.body, { attributes: true, attributeFilter: ["class"] });

    // ── execute the real script ──
    try {
        window.eval(js);
    } catch (e) {
        console.log("FAIL  script.js threw on load:", e.message);
        process.exit(1);
    }

    const doc = window.document;

    check("clock removed from header", doc.getElementById("clock") === null);

    // reveals + line-mask titles observed → .in applied by IO stub
    await wait(60);
    const revealTotal = doc.querySelectorAll("[data-reveal]").length;
    const revealIn = doc.querySelectorAll("[data-reveal].in").length;
    check("data-reveal elements got .in", revealIn === revealTotal, `${revealIn}/${revealTotal}`);
    check("section titles got reveal-lines + .in",
        doc.querySelectorAll(".section-title.in, .about-title.in, .contact-title.in").length === 4,
        `${doc.querySelectorAll(".reveal-lines.in").length}/4`);

    // palabras sueltas destacadas en lila (--violet) dentro de los titulares, en cursiva
    const violetWords = [...doc.querySelectorAll(".violet")].map((el) => el.textContent);
    check("palabras en lila: WORK, HUMAN, MACHINE y Ai (DNAi)",
        violetWords.join("|") === "WORK|HUMAN|MACHINE|Ai", violetWords.join("|"));
    check("cada palabra en lila vive dentro de su .line-inner",
        [...doc.querySelectorAll(".violet")].every((el) => el.closest(".line-inner")),
        [...doc.querySelectorAll(".violet")].map((el) => el.closest(".line-inner") ? "ok" : "fuera").join(","));
    check("las palabras en lila llevan cursiva (.italic)",
        [...doc.querySelectorAll(".violet")].every((el) => el.classList.contains("italic")),
        [...doc.querySelectorAll(".violet")].map((el) => el.classList.contains("italic") ? "ok" : "recta").join(","));
    const cross = doc.querySelector(".about-title .accent");
    check("el × de HUMAN INTUITION × MACHINE SYNTHESIS gira con .cross-turn",
        cross && cross.classList.contains("cross-turn"), cross ? cross.className : "missing");
    const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
    const heroSub = doc.querySelector(".hero-sub");
    check("hero subtitle is independent of the generic sliding reveal",
        heroSub && !heroSub.hasAttribute("data-reveal") && !heroSub.hasAttribute("data-reveal-delay"));
    check("hero subtitle fades for 0.8s after a 3s delay anchored to hero readiness",
        /body\.loaded\s+\.hero-sub\s*\{\s*animation:\s*heroSubtitleFade\s+0\.8s\s+ease\s+3s\s+both;/.test(css) &&
        /@keyframes heroSubtitleFade\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}/.test(css));
    check("hero subtitle is immediately visible with reduced motion",
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.hero-sub,\s*body\.loaded\s+\.hero-sub\s*\{\s*opacity:\s*1;\s*animation:\s*none;/.test(css));
    check("cross-turn: ping-pong ×(0°) ↔ +(45°), ease-in-out, alternate y hold en cada extremo",
        /crossTurn\s+[\d.]+s\s+ease-in-out\s+infinite\s+alternate/.test(css) &&
        /@keyframes crossTurn\s*\{\s*0%,\s*[\d.]+%\s*\{\s*transform:\s*rotate\(0deg\);?/.test(css) &&
        /[\d.]+%,\s*100%\s*\{\s*transform:\s*rotate\(45deg\);?\s*\}\s*\}/.test(css),
        "ver @keyframes crossTurn / .cross-turn");
    // overshoot sutil: el × se estira antes de salir (0° → -4°) y se pasa de
    // largo al llegar (49° → 45°), en lugar de arrancar y frenar en seco.
    const crossKf = (css.match(/@keyframes crossTurn\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
    const crossDegs = [...crossKf.matchAll(/rotate\((-?[\d.]+)deg\)/g)].map((m) => Number(m[1]));
    check("cross-turn: overshoot sutil de comienzo (wind-up < 0°) y de final (pasa de 45° y vuelve)",
        crossDegs.length >= 4 &&
        crossDegs[0] === 0 && crossDegs[crossDegs.length - 1] === 45 &&
        Math.min(...crossDegs) < 0 && Math.min(...crossDegs) >= -8 &&
        Math.max(...crossDegs) > 45 && Math.max(...crossDegs) <= 53,
        `grados: ${crossDegs.join(", ") || "no encontrados"}`);
    check("cross-turn gira desde el centro del símbolo (transform-origin en la tinta, no en la caja)",
        /\.cross-turn\s*\{[^}]*transform-origin:\s*0\.216em\s+0\.6105em/.test(css),
        "ver transform-origin de .cross-turn");
    check("cross-turn sin cursiva (font-style: normal) y con reduced-motion queda en ×",
        /\.cross-turn\s*\{[^}]*font-style:\s*normal/.test(css) &&
        /\.cross-turn\s*\{\s*animation:\s*none;\s*transform:\s*none;/.test(css),
        "ver .cross-turn");

    // statement words lit (IO-independent scroll calc; rect.top=0 in jsdom → fully lit)
    const lit = doc.querySelectorAll("#statementText span.lit").length;
    check("statement words lit on scroll calc", lit > 0, `${lit} words lit`);

    // menu toggle
    const burger = doc.getElementById("burger");
    check("burger markup matches legacy (type + aria-controls)",
        burger.getAttribute("type") === "button" && burger.getAttribute("aria-controls") === "menuOverlay");
    check("menu-open raises header above overlay so the two-line × stays visible",
        /body\.menu-open\s+\.site-header\s*\{[^}]*z-index:\s*900/.test(css));
    burger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    check("burger click opens menu", doc.body.classList.contains("menu-open")
        && burger.getAttribute("aria-expanded") === "true"
        && burger.getAttribute("aria-label") === "Close menu");
    doc.querySelector(".menu-links a").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    check("menu link click closes menu", !doc.body.classList.contains("menu-open")
        && doc.body.style.overflow === ""
        && burger.getAttribute("aria-label") === "Open menu");

    // cursor hover state
    const link = doc.querySelector(".work-row");
    link.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: false }));
    check("hover enlarges cursor", doc.body.classList.contains("cursor-large"));
    link.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: false }));
    check("mouseleave restores cursor", !doc.body.classList.contains("cursor-large"));

    // rotator: starts blank (no word active before/at load)
    const rots = [...doc.querySelectorAll("[data-rot]")];
    const activeIdx = () => rots.findIndex((r) => r.classList.contains("is-active"));
    const activeCount = () => rots.filter((r) => r.classList.contains("is-active")).length;
    check("rotator starts blank", activeCount() === 0);

    // rotator timing relative to body.loaded: 2s blank → 4s per word → loop without blank
    // wait for hero ready, then sample from that instant
    while (loadedAt === null) await wait(10);
    const at = async (ms) => { const d = loadedAt + ms - Date.now(); if (d > 0) await wait(d); };
    const seq = [];
    for (const t of [1000, 1800, 3000, 5800, 7000, 9800, 11000, 15000, 17800, 19000]) {
        await at(t); seq.push(activeCount() === 1 ? activeIdx() : (activeCount() === 0 ? "-" : "x"));
    }
    // expected: blank, blank, S, S, F, F, M, SY, SY, S(loop)
    check("rotator: 2s blank then 4s cycle, loops without blank",
        loadedAt !== null && seq.join(",") === "-,-,0,0,1,1,2,3,3,0", seq.join(","));

    // count-up: 1400ms animation triggered by IO stub
    const counts = [...doc.querySelectorAll("[data-count]")].map((el) => el.textContent);
    check("stats counted up to targets", counts[0] === "10" && counts[1] === "7",
        counts.join(", "));

    // ── hero log (trace de inferencia del modelo) ──
    const heroLog = doc.getElementById("heroLog");
    check("hero log: dentro del .hero, decorativo (aria-hidden) e ignora el ratón",
        !!heroLog && heroLog.parentElement === doc.querySelector(".hero") &&
        heroLog.getAttribute("aria-hidden") === "true" &&
        /\.hero-log\s*\{[^}]*pointer-events:\s*none/.test(css));
    check("hero log: sangrado por la derecha (right negativo) y recortado por el overflow del hero",
        /\.hero-log\s*\{[^}]*right:\s*-\d/.test(css) &&
        /\.hero\s*\{[^}]*overflow:\s*hidden/.test(css));
    check("hero log: opacidad 0.35 y monoespaciada de código (JetBrains/Fira/Roboto Mono/Courier)",
        /\.hero-log\s*\{[^}]*opacity:\s*0?\.35\b/.test(css) &&
        /--font-code:[^;]*"JetBrains Mono"[^;]*"Fira Code"[^;]*"Roboto Mono"[^;]*"Courier New"/.test(css) &&
        /\.hero-log\s*\{[^}]*font-family:\s*var\(--font-code\)/.test(css));
    check("hero log: sin rótulo 'TENSOR BUFFER' y con degradado izquierdo ancho",
        !/TENSOR BUFFER/.test(html) &&
        /\.hero-log\s*\{[^}]*mask-image:\s*linear-gradient\(to right,\s*transparent 0,\s*#000 2\d%\)/.test(css));
    check("hero log: ocupa el alto del hero, de debajo del ES/EN a la marquesina horizontal",
        /\.hero-log\s*\{[^}]*top:\s*var\(--header-h\)/.test(css) &&
        /\.hero-log\s*\{[^}]*bottom:\s*calc\(var\(--marquee-h\)/.test(css) &&
        /--header-h:\s*calc\(clamp\(41\.4px/.test(css) && /--marquee-h:\s*calc\(/.test(css) &&
        /\.log-body\s*\{[^}]*flex:\s*1/.test(css));
    check("hero log: el font-size se calcula para que quepa el trace (--log-fs)",
        /\.hero-log\s*\{[^}]*font-size:\s*var\(--log-fs/.test(css) &&
        /const FS_MIN = 6, FS_MAX = 11;/.test(js) &&
        /setProperty\("--log-fs"/.test(js) && /document\.fonts\.ready\.then\(fit\)/.test(js));
    const logLines = heroLog ? [...heroLog.querySelectorAll(".log-line")] : [];
    const logNums = heroLog ? [...heroLog.querySelectorAll(".log-num")] : [];
    check("hero log: pinta el trace completo con sus campos numéricos",
        logLines.length > 40 && logNums.length > 100 &&
        /LAYER \d+\/32/.test(heroLog.textContent) && /NCCL MULTI-GPU/.test(heroLog.textContent),
        `${logLines.length} líneas · ${logNums.length} campos`);
    check("hero log: el texto estructural se respeta (formas de tensor, IDs, ε = 1e-05, θ=10000)",
        /Q_Tensor \[1, 32, 128, 64\]/.test(heroLog.textContent) &&
        /#15496 \(" tensor"\)/.test(heroLog.textContent) &&
        /ε = 1e-05/.test(heroLog.textContent) && /θ=10000/.test(heroLog.textContent));
    // el barrido randomiza en caliente: dos muestras separadas 400 ms
    const logSnap = () => heroLog.querySelector(".log-body").textContent;
    const logBefore = logSnap();
    await wait(400);
    const logAfter = logSnap();
    check("hero log: los valores numéricos cambian a gran velocidad mientras barre",
        logAfter !== logBefore, logAfter === logBefore ? "sin cambios en 400 ms" : "cambiando");
    check("hero log: solo cambian los números — el ancho de cada campo y la maquetación no se mueven",
        logAfter.length === logBefore.length &&
        heroLog.querySelectorAll(".log-line").length === logLines.length,
        `${logBefore.length} → ${logAfter.length} caracteres`);
    check("hero log: ciclo de 5 s, rAF único y throttled a ~20 fps",
        /const CYCLE = 5000;/.test(js) && /const TICK = 50;/.test(js) &&
        /now - last < TICK/.test(js) && /requestAnimationFrame\(frame\)/.test(js));
    check("hero log: contadores de ciclo (capa, timestep, token, KV-cache) sobre el propio texto",
        /\{\{24:layer\}\}/.test(js) && /\{\{450:timestep\}\}/.test(js) &&
        /\{\{1025:token\}\}/.test(js) && /advanceCounters\(\)/.test(js));
    check("hero log: se detiene fuera de pantalla y con la pestaña oculta",
        /inView && !document\.hidden/.test(js) && /visibilitychange/.test(js) &&
        /cancelAnimationFrame\(raf\)/.test(js));
    check("hero log: quieto con reduced-motion y apagado en móvil",
        /@media \(prefers-reduced-motion: reduce\)[\s\S]*\*,\s*\*::before,\s*\*::after \{\s*animation-duration/.test(css) &&
        /@media \(max-width: 900px\)[\s\S]*\.hero-log \{\s*display: none/.test(css));
    check("hero log: sin caja, ni cabecera, ni pie — solo el trace flotando",
        !/log-head|log-foot|log-dot|log-bar|data-log-addr|data-log-cycle/.test(html) &&
        !/log-head|log-foot|log-dot|log-bar|@keyframes logPulse/.test(css) &&
        !/\.hero-log\s*\{[^}]*background:/.test(css) &&
        !/\.hero-log\s*\{[^}]*border:/.test(css) &&
        heroLog.children.length === 1 && heroLog.firstElementChild.hasAttribute("data-log-lines"));

    // preloader: ~3.2s of ticking to 100 + 260ms
    await wait(1500);
    check("preloader reached ~100%", parseInt(doc.getElementById("preCount").textContent, 10) > 85,
        "count=" + doc.getElementById("preCount").textContent);
    await wait(2500);
    check("body.loaded set after preload", doc.body.classList.contains("loaded"));
    check("preloader got .done", doc.getElementById("preloader").classList.contains("done"));

    check("no uncaught runtime errors", errors.length === 0, errors.join(" | "));

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
})();
