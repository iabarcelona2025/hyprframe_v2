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

    // statement words lit (IO-independent scroll calc; rect.top=0 in jsdom → fully lit)
    const lit = doc.querySelectorAll("#statementText span.lit").length;
    check("statement words lit on scroll calc", lit > 0, `${lit} words lit`);

    // menu toggle
    const burger = doc.getElementById("burger");
    burger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    check("burger click opens menu", doc.body.classList.contains("menu-open")
        && burger.getAttribute("aria-expanded") === "true");
    doc.querySelector(".menu-links a").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    check("menu link click closes menu", !doc.body.classList.contains("menu-open")
        && doc.body.style.overflow === "");

    // cursor hover state
    const link = doc.querySelector(".work-row");
    link.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: false }));
    check("hover enlarges cursor", doc.body.classList.contains("cursor-large"));
    link.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: false }));
    check("mouseleave restores cursor", !doc.body.classList.contains("cursor-large"));

    // rotator: first item active at start
    const rots = [...doc.querySelectorAll("[data-rot]")];
    check("rotator starts on first word", rots[0].classList.contains("is-active"));
    await wait(2750); // one rotation interval
    check("rotator advanced to word 2", !rots[0].classList.contains("is-active")
        && rots[1].classList.contains("is-active"));

    // count-up: 1400ms animation triggered by IO stub
    await wait(1600);
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
