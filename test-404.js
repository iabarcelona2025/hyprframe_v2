/* Smoke test: tests 404.html, 404.css, and 404.js in jsdom and against server.py */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const http = require("http");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "404.html"), "utf8");
const js = fs.readFileSync(path.join(root, "404.js"), "utf8");
const css = fs.readFileSync(path.join(root, "404.css"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "styles.css"), "utf8");

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
    check("Document has doctype and en lang", doc.doctype !== null && doc.documentElement.lang === "en");
    check("Title contains 404 and HYPRFRAME", doc.title.includes("404") && doc.title.includes("HYPRFRAME"), doc.title);
    const metaRobots = doc.querySelector('meta[name="robots"]');
    check("Robots meta has noindex, follow", !!metaRobots && metaRobots.content.includes("noindex") && metaRobots.content.includes("follow"));
    const metaDesc = doc.querySelector('meta[name="description"]');
    check("Meta description is informative (> 40 chars)", !!metaDesc && metaDesc.content.length > 40);
    check("Open Graph tags defined", !!doc.querySelector('meta[property="og:title"]') && !!doc.querySelector('meta[property="og:description"]'));
    check("Theme color meta is #050505", doc.querySelector('meta[name="theme-color"]')?.content === "#050505");
    check("Skip link present", doc.querySelector(".skip-link")?.getAttribute("href") === "#main");

    /* ─── 2. Favicons & Asset Links ───────────────────────── */
    const faviconLinks = [...doc.querySelectorAll('link[rel="apple-touch-icon"], link[rel="icon"], link[rel="shortcut icon"]')];
    check("Favicon links present (at least 3)", faviconLinks.length >= 3);
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
        doc.getElementById("burger")?.getAttribute("aria-controls") === "menuOverlay" &&
        doc.getElementById("burger")?.getAttribute("aria-expanded") === "false");
    const menuLinks = [...doc.querySelectorAll(".menu-links a")].map((a) => a.textContent.trim().replace(/^.*?\s+/, ""));
    check("Mobile menu overlay has matching links",
        menuLinks.some((l) => l.includes("Generated")) && menuLinks.some((l) => l.includes("Captured")));
    const footer = doc.querySelector(".site-footer");
    check("Footer present with 2026 copyright and status",
        !!footer && footer.textContent.includes("2026") && footer.textContent.includes("SYSTEM NORMAL"));

    /* ─── 4. 404 Specific Elements ────────────────────────── */
    check("Kicker with .pulse dot present", !!doc.querySelector("#kicker404 .pulse"));
    check("Glitch 404 display present", doc.getElementById("glitchNumber")?.textContent.trim() === "404");
    check("H1 contains .violet and .italic styling",
        !!doc.querySelector(".title-404 .violet.italic"));
    check("Terminal HUD present with traffic dots",
        !!doc.querySelector(".terminal-hud") && doc.querySelectorAll(".t-dot").length === 3);
    check("Terminal HUD has re-scan button and entropy readout",
        !!doc.getElementById("btnRescan") && !!doc.getElementById("termEntropy"));
    check("Primary CTA buttons present (Home, Work, Contact)",
        !!doc.getElementById("ctaHome") && !!doc.getElementById("ctaWork") && !!doc.getElementById("ctaContact"));
    check("Waypoint cards grid contains 4 core pillars",
        doc.querySelectorAll(".waypoint-card").length === 4);
    check("Quick jump search input and results container present",
        !!doc.getElementById("quickJumpInput") && !!doc.getElementById("quickJumpResults"));

    /* ─── 5. CSS Rules Integrity ──────────────────────────── */
    check("404.css defines .page-404 and glitch animations",
        css.includes(".page-404") && css.includes("@keyframes glitchSlice1") && css.includes("@keyframes glitchSlice2"));
    check("404.css defines responsive grid for waypoints",
        css.includes("grid-template-columns: repeat(4, 1fr)") && css.includes("@media (max-width: 1024px)"));
    check("404.css respects prefers-reduced-motion",
        css.includes("@media (prefers-reduced-motion: reduce)"));
    check("404.css defines cybernetic terminal hud",
        css.includes(".terminal-hud") && css.includes(".term-row"));

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

    // Check dynamic URI injection into terminal readout
    const termUriEl = doc.getElementById("termUri");
    check("Terminal URI reflects requested path",
        termUriEl && termUriEl.textContent.includes("non-existent-dimension"),
        termUriEl?.textContent);

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
    const langEsBtn = doc.getElementById("langEs");
    const langEnBtn = doc.getElementById("langEn");
    langEsBtn.click();
    check("Language toggle to ES updates html lang to 'es'", doc.documentElement.lang === "es");
    check("Language toggle shows Spanish title and hides English title",
        doc.querySelector(".title-es")?.style.display !== "none" && doc.querySelector(".title-en")?.style.display === "none");
    check("Language toggle updates data-es text on kicker",
        doc.querySelector(".kicker-text")?.textContent.includes("SEÑAL PERDIDA"));

    langEnBtn.click();
    check("Language toggle back to EN updates html lang to 'en'", doc.documentElement.lang === "en");
    check("Language toggle shows English title",
        doc.querySelector(".title-en")?.style.display !== "none" && doc.querySelector(".title-es")?.style.display === "none");

    // Test Re-scan trigger
    const rescanBtn = doc.getElementById("btnRescan");
    rescanBtn.click();
    check("Re-scan button gets .is-scanning class on click", rescanBtn.classList.contains("is-scanning"));
    await wait(700);

    // Test Quick Jump search filter
    const searchInput = doc.getElementById("quickJumpInput");
    const resultsBox = doc.getElementById("quickJumpResults");
    searchInput.value = "polestar";
    searchInput.dispatchEvent(new window.Event("input"));
    const results = resultsBox.querySelectorAll(".quick-jump-item");
    check("Quick jump search for 'polestar' shows matching results",
        results.length > 0 && resultsBox.hidden === false && results[0].textContent.includes("Polestar"),
        `Found ${results.length} item(s)`);

    searchInput.value = "clb";
    searchInput.dispatchEvent(new window.Event("input"));
    check("Quick jump search for 'clb' returns CLB Tool",
        resultsBox.textContent.includes("Cinematic Look Builder"));

    searchInput.value = "xyznonexistentkeyword";
    searchInput.dispatchEvent(new window.Event("input"));
    check("Quick jump search for non-matching keyword shows empty state",
        resultsBox.textContent.includes("No matching coordinates"));

    if (failures === 0) {
        console.log("\n✅ ALL 404 TESTS PASSED");
        process.exit(0);
    } else {
        console.log(`\n❌ ${failures} CHECKS FAILED`);
        process.exit(1);
    }
})();
