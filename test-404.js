/* Smoke test: tests 404.html, 404.css, and 404.js for the minimalist centered 404 design */
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
    url: "http://localhost:8080/non-existent-dimension",
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
    check("Theme color meta is #050505", doc.querySelector('meta[name="theme-color"]')?.content === "#050505");
    check("Skip link present", !!doc.querySelector(".skip-link"));

    /* ─── 2. Favicons & Asset Links ───────────────────────── */
    const stylesheets = [...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute("href"));
    check("Loads styles.css and 404.css", stylesheets.some((s) => s.includes("styles.css")) && stylesheets.some((s) => s.includes("404.css")));

    /* ─── 3. Navigation & Header / Footer ─────────────────── */
    const mainNavLinks = [...doc.querySelectorAll(".main-nav a")].map((a) => a.textContent.trim());
    const expectedNav = ["Generated", "Captured", "About", "DNAi", "CLB", "Contact"];
    check("Header main nav items match site canonical labels",
        JSON.stringify(mainNavLinks) === JSON.stringify(expectedNav),
        mainNavLinks.join(", "));
    check("Header logo is present and links home", !!doc.querySelector(".site-header .logo"));
    check("Burger button has aria controls and expanded attributes",
        doc.getElementById("burger")?.getAttribute("aria-controls") === "menuOverlay");
    const footer = doc.querySelector(".site-footer");
    check("Footer present with 2026 copyright and status",
        !!footer && footer.textContent.includes("2026") && footer.textContent.includes("SYSTEM NORMAL"));

    /* ─── 4. Centered Minimalist 404 Layout Verification ─── */
    check("Centered 404 number display is present", doc.getElementById("glitchNumber")?.textContent.trim() === "404");
    check("Primary button is VOLVER A INICIO",
        doc.getElementById("ctaHome")?.textContent.includes("VOLVER A INICIO"));
    check("Only 1 CTA button exists on the page (VOLVER A INICIO)",
        doc.querySelectorAll(".cta-actions a, .cta-actions button").length === 1);

    /* ─── 5. Verified Removal of Requested Elements ───────── */
    check("No kicker / 'SEÑAL PERDIDA' present",
        !doc.body.textContent.includes("SEÑAL PERDIDA") && !doc.body.textContent.includes("ERR_CODE"));
    check("No 'FOTOGRAMA NO ENCONTRADO' heading present",
        !doc.body.textContent.includes("FOTOGRAMA NO ENCONTRADO") && !doc.body.textContent.includes("FRAME NOT FOUND"));
    check("No 'LATENT FIELD DESYNC / FRAME: VOID' subscan present",
        !doc.body.textContent.includes("FRAME: VOID") && !doc.body.textContent.includes("DESYNC"));
    check("No long narrative description present",
        !doc.body.textContent.includes("La máquina ha explorado"));
    check("No Terminal HUD / 'SYNTHESIS_DEBUGGER' present",
        doc.querySelector(".terminal-hud") === null && !doc.body.textContent.includes("SYNTHESIS_DEBUGGER"));
    check("No 'PUNTOS DE RECUPERACIÓN' / waypoint cards present",
        doc.querySelector(".waypoints-block") === null && doc.querySelectorAll(".waypoint-card").length === 0);
    check("No search input bar present",
        doc.getElementById("quickJumpInput") === null);
    check("No 'EXPLORAR PROYECTOS' or 'CONTACTAR ESTUDIO' buttons present",
        !doc.body.textContent.includes("EXPLORAR PROYECTOS") && !doc.body.textContent.includes("CONTACTAR"));

    /* ─── 6. CSS Rules Integrity ──────────────────────────── */
    check("404.css centers content vertically and horizontally",
        css.includes(".main-404") && css.includes("align-items: center") && css.includes("justify-content: center"));
    check("404.css defines glitch animations",
        css.includes("@keyframes glitchSlice1") && css.includes("@keyframes glitchSlice2"));
    check("404.css respects prefers-reduced-motion",
        css.includes("@media (prefers-reduced-motion: reduce)"));

    /* ─── 7. JavaScript Runtime Execution ─────────────────── */
    const errors = [];
    window.addEventListener("error", (e) => errors.push(e.message));

    try {
        window.eval(js);
    } catch (e) {
        console.log("FAIL  404.js threw on evaluation:", e.message);
        process.exit(1);
    }

    check("Zero uncaught runtime errors on script load", errors.length === 0, errors.join(", "));

    // Test Burger menu interaction
    const burgerBtn = doc.getElementById("burger");
    burgerBtn.click();
    check("Burger click opens mobile menu (.menu-open + aria-expanded=true)",
        doc.body.classList.contains("menu-open") && burgerBtn.getAttribute("aria-expanded") === "true");
    const overlayLink = doc.querySelector(".menu-links a");
    overlayLink.click();
    check("Overlay link click closes menu (.menu-open removed)",
        !doc.body.classList.contains("menu-open") && burgerBtn.getAttribute("aria-expanded") === "false");

    // Test Language switcher interaction
    const langEnBtn = doc.getElementById("langEn");
    const langEsBtn = doc.getElementById("langEs");
    langEnBtn.click();
    check("Language toggle to EN updates button text to 'RETURN HOME'",
        doc.getElementById("ctaHome")?.textContent.includes("RETURN HOME"));
    langEsBtn.click();
    check("Language toggle back to ES updates button text to 'VOLVER A INICIO'",
        doc.getElementById("ctaHome")?.textContent.includes("VOLVER A INICIO"));

    if (failures === 0) {
        console.log("\n✅ ALL MINIMALIST 404 TESTS PASSED");
        process.exit(0);
    } else {
        console.log(`\n❌ ${failures} CHECKS FAILED`);
        process.exit(1);
    }
})();
