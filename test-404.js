/* Smoke test: tests 404.html, 404.css, and 404.js for the requested design:
   - No top menu
   - No footer
   - "NOTHING TO SEE HERE" above 404
   - 404 reduced by 30%
   - Centered BACK TO WEB button
*/
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "404.html"), "utf8");
const js = fs.readFileSync(path.join(root, "404.js"), "utf8");
const css = fs.readFileSync(path.join(root, "404.css"), "utf8");

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};

const dom = new JSDOM(html, {
    url: "http://localhost:8080/404.html",
    pretendToBeVisual: true,
    runScripts: "outside-only",
});
const { window } = dom;

// Browser API stubs for jsdom
window.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
});
window.EventSource = class { constructor() {} };
window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    scale() {},
});

(async () => {
    const doc = window.document;

    /* ─── 1. SEO & Document Structure ─────────────────────── */
    check("Document has doctype and lang", doc.doctype !== null && !!doc.documentElement.lang);
    check("Title contains 404 and HYPRFRAME", doc.title.includes("404") && doc.title.includes("HYPRFRAME"), doc.title);
    const metaRobots = doc.querySelector('meta[name="robots"]');
    check("Robots meta has noindex, follow", !!metaRobots && metaRobots.content.includes("noindex") && metaRobots.content.includes("follow"));
    check("Loads styles.css and 404.css", html.includes('styles.css') && html.includes('404.css'));

    /* ─── 2. Complete Absence of Top Menu & Footer ────────── */
    check("Top menu header (.site-header) is removed", doc.querySelector(".site-header") === null);
    check("Mobile menu overlay (.menu-overlay) is removed", doc.querySelector(".menu-overlay") === null);
    check("Footer (.site-footer) is removed", doc.querySelector(".site-footer") === null);
    check("No footer text ('SYSTEM NORMAL', 'ALL RIGHTS RESERVED', 'BARCELONA') present",
        !doc.body.textContent.includes("SYSTEM NORMAL") &&
        !doc.body.textContent.includes("ALL RIGHTS RESERVED") &&
        !doc.body.textContent.includes("BARCELONA"));

    /* ─── 3. "NOTHING TO SEE HERE" above 404 & 404 reduced by 30% ── */
    const DISPLAY_TEXT = "NOTHING TO SEE HERE";
    const glitchError = doc.getElementById("glitchError");
    const glitchNumber = doc.getElementById("glitchNumber");
    check('"NOTHING TO SEE HERE" element is present',
        !!glitchError && glitchError.textContent.trim() === DISPLAY_TEXT);
    check('"NOTHING TO SEE HERE" mirrors data-text for the glitch layers',
        !!glitchError && glitchError.getAttribute("data-text") === DISPLAY_TEXT);
    check('Old "ERROR" label is gone',
        glitchError && !/ERROR/i.test(glitchError.textContent));
    check("404 number is present", !!glitchNumber && glitchNumber.textContent.trim() === "404");
    check('"NOTHING TO SEE HERE" precedes 404 in DOM',
        glitchError && glitchNumber && glitchError.nextElementSibling === glitchNumber);

    // CSS size checks
    check("CSS defines --size-404 reduced by 30% (clamp with ~5.6rem and ~15.4rem)",
        css.includes("--size-404") && css.includes("5.6rem") && css.includes("15.4rem"));
    check('CSS sizes .glitch-error with its own clamp (1.1rem … 4.2rem), not half of --size-404',
        /\.glitch-error\s*\{[\s\S]*?font-size:\s*clamp\(1\.1rem,\s*5\.4vw,\s*4\.2rem\)/.test(css) &&
        !css.includes("calc(var(--size-404) * 0.5)"));

    /* ─── 4. Centered Button BACK TO WEB ──────────────────── */
    const btnHome = doc.getElementById("ctaHome");
    check("Button BACK TO WEB is present", !!btnHome && btnHome.textContent.includes("BACK TO WEB"));
    check('Old "VOLVER A INICIO" label is gone', !doc.body.textContent.includes("VOLVER A INICIO"));
    check("Button links to /index.html", btnHome?.getAttribute("href") === "/index.html");
    check("Only 1 CTA link exists", doc.querySelectorAll(".cta-actions a").length === 1);

    /* ─── 5. CSS Centering & Glitch Animation ─────────────── */
    check("404.css centers content in fullscreen",
        css.includes(".page-404") && css.includes("justify-content: center") && css.includes("align-items: center"));
    check("404.css defines glitch pseudo-elements and animations",
        css.includes(".glitch-error::before") && css.includes(".glitch-number::before") &&
        css.includes("@keyframes glitchSlice1") && css.includes("@keyframes glitchSlice2"));

    /* ─── 6. JavaScript Runtime Execution ─────────────────── */
    const errors = [];
    window.addEventListener("error", (e) => errors.push(e.message));

    try {
        window.eval(js);
    } catch (e) {
        console.log("FAIL  404.js threw on evaluation:", e.message);
        process.exit(1);
    }

    check("Zero uncaught runtime errors on script load", errors.length === 0, errors.join(", "));

    // Trigger glitch click
    const glitchTrigger = doc.getElementById("glitchTrigger");
    glitchTrigger.click();
    check("Clicking glitch trigger runs without error", errors.length === 0);
    check("Glitch script knows the new label (no leftover 'ERROR' reset value)",
        js.includes('"NOTHING TO SEE HERE"') && !js.includes('"ERROR"'));

    // Let the glitch burst finish, then confirm it restores the label
    await new Promise((r) => setTimeout(r, 900));
    check("Glitch burst restores 'NOTHING TO SEE HERE'",
        glitchError.textContent.trim() === DISPLAY_TEXT &&
        glitchError.getAttribute("data-text") === DISPLAY_TEXT,
        glitchError.textContent);

    if (failures === 0) {
        console.log("\n✅ ALL TESTS PASSED");
        process.exit(0);
    } else {
        console.log(`\n❌ ${failures} CHECKS FAILED`);
        process.exit(1);
    }
})();
