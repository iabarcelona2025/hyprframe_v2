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
    check("cross-turn: ping-pong ×(0°) ↔ +(45°), ease-in-out, alternate y hold en cada extremo",
        /crossTurn\s+[\d.]+s\s+ease-in-out\s+infinite\s+alternate/.test(css) &&
        /@keyframes crossTurn\s*\{\s*0%,\s*[\d.]+%\s*\{\s*transform:\s*rotate\(0deg\);?\s*\}\s*[\d.]+%,\s*100%\s*\{\s*transform:\s*rotate\(45deg\);?\s*\}/.test(css),
        "ver @keyframes crossTurn / .cross-turn");
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

    // rotator: la palabra entrante asienta con un overshoot sutil (solo en la entrada)
    const back = css.match(/--ease-back:\s*cubic-bezier\(([^)]+)\)/);
    const backY1 = back ? parseFloat(back[1].split(",")[1]) : NaN;
    check("rotator: --ease-back existe y su overshoot es sutil (1 < y1 <= 1.4)",
        !!back && backY1 > 1 && backY1 <= 1.4, back ? back[1] : "falta --ease-back");
    check("rotator: el overshoot solo se aplica a la palabra entrante (.is-active)",
        /\.rotator-item\.is-active\s*\{[^}]*transform:\s*translateY\(0\)[^}]*transition:\s*transform\s+[\d.]+s\s+var\(--ease-back\)/.test(css),
        "ver .rotator-item.is-active");
    check("rotator: la salida sigue en ease-out (sin overshoot recortado por la máscara)",
        /\.rotator-item\s*\{[^}]*transition:\s*transform\s+[\d.]+s\s+var\(--ease-out\)/.test(css),
        "ver .rotator-item");
    const durIn = (css.match(/\.rotator-item\.is-active\s*\{[^}]*transition:\s*transform\s+([\d.]+)s/) || [])[1];
    const durOut = (css.match(/\.rotator-item\s*\{[^}]*transition:\s*transform\s+([\d.]+)s/) || [])[1];
    check("rotator: la entrada asienta rápido (<= 0,25 s y más corta que la salida)",
        durIn && durOut && parseFloat(durIn) <= 0.25 && parseFloat(durIn) < parseFloat(durOut),
        `entrada ${durIn}s / salida ${durOut}s`);
    check("rotator: el snap post-salida del JS espera más que la transición de salida",
        /ROT_EXIT_MS\s*=\s*(\d+)/.test(js) && /ROT_EXIT_MS\s*\+\s*\d+/.test(js),
        "ver ROT_EXIT_MS en script.js");

    // count-up: 1400ms animation triggered by IO stub
    const counts = [...doc.querySelectorAll("[data-count]")].map((el) => el.textContent);
    check("stats counted up to targets", counts[0] === "10" && counts[1] === "7",
        counts.join(", "));

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
