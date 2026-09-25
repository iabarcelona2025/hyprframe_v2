/* Smoke test for N.O.D.E.: brand navigation, local assets, teaser and keyboard menu. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "project-node.html"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "project-node.js"), "utf8");
const dom = new JSDOM(html, {
    url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;
window.matchMedia = (q) => ({
    matches: false, media: q,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
});
const indexDoc = new JSDOM(index).window.document;
const errors = [];
window.addEventListener("error", (event) => errors.push(event.message));

try {
    assert.match(html, /gtag\('config', 'G-6MW201KGC9'\)/);
    assert.equal(doc.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]').length, 1);
    assert.equal(doc.title, "AI Visual Storytelling Studio – Generative Image & Video | HYPRFRAME");
    assert.match(doc.querySelector('meta[name="description"]').content, /algorithmic mega-corporation/);
    for (const icon of JSON.parse(fs.readFileSync(path.join(root, "assets/favicons/site.webmanifest"), "utf8")).icons) {
        assert.ok(fs.existsSync(path.join(root, icon.src.replace(/^\//, ""))), `missing manifest icon ${icon.src}`);
    }
    for (const link of doc.querySelectorAll('link[rel="apple-touch-icon"], link[rel="icon"], link[rel="shortcut icon"], link[rel="manifest"]')) {
        assert.ok(fs.existsSync(path.join(root, link.getAttribute("href").replace(/^\//, ""))), `missing head asset ${link.href}`);
    }
    for (const css of ["styles.css", "project-node.css"]) {
        assert.ok(fs.existsSync(path.join(root, css)));
        assert.ok(doc.querySelector(`link[href^="${css}"]`));
    }
    assert.deepEqual([...doc.querySelectorAll(".main-nav a")].map((el) => el.textContent.trim()),
        [...indexDoc.querySelectorAll(".main-nav a")].map((el) => el.textContent.trim()));
    assert.deepEqual([...doc.querySelectorAll(".menu-links a")].map((el) => el.textContent.trim()),
        [...indexDoc.querySelectorAll(".menu-links a")].map((el) => el.textContent.trim()));
    for (const link of doc.querySelectorAll(".site-header a, .menu-links a, .node-back, .node-related__heading a, .node-hero__explore")) {
        const href = link.getAttribute("href");
        if (href.startsWith("https://")) continue;
        const url = new URL(href, window.location.href);
        const filename = url.pathname.slice(1);
        assert.ok(fs.existsSync(path.join(root, filename)), `missing destination ${href}`);
        if (url.hash) {
            const target = filename === "index.html" ? indexDoc : doc;
            assert.ok(target.getElementById(url.hash.slice(1)), `missing anchor ${href}`);
        }
    }
    for (const img of doc.querySelectorAll("img[src^='assets/']")) {
        assert.ok(fs.existsSync(path.join(root, img.getAttribute("src"))), `missing image ${img.src}`);
    }
    assert.equal(indexDoc.querySelector(".work-row .work-title").textContent, "N.O.D.E.");
    assert.equal(indexDoc.querySelector(".work-row").getAttribute("href"), "project-node.html");
    assert.equal(doc.querySelector("h1").getAttribute("aria-label"), "N.O.D.E. (Teaser)");
    assert.equal(doc.querySelectorAll(".node-hero__dot").length, 4, "the title's four dots are uniform CSS boxes");
    assert.ok(!doc.querySelector(".node-hero__period"), "the title's period inherits the same colour as its letters");
    assert.match(fs.readFileSync(path.join(root, "project-node.css"), "utf8"), /font-size: clamp\(1\.15rem, 2vw, 1\.7rem\); text-indent/);
    assert.ok(!doc.querySelector(".node-film__after"), "old film caption has been removed");
    const css = fs.readFileSync(path.join(root, "project-node.css"), "utf8");
    assert.ok(!doc.querySelector(".node-hero__image img"), "the opener is a flat background, not a still image");
    assert.ok(!/radial-gradient|linear-gradient/.test(css), "the opener gradient has been removed");
    assert.ok(doc.getElementById("cursorDot") && doc.getElementById("cursorRing"), "custom cursor dot and ring exist");
    assert.match(fs.readFileSync(path.join(root, "project-node.css"), "utf8"), /background: var\(--lime\); border: 1px solid var\(--lime\)/);
    assert.equal(doc.getElementById("playFilm").textContent.trim(), "▶");
    assert.ok(!doc.querySelector(".node-story__caption"));
    assert.equal(doc.querySelector(".node-hero__bottom > .node-hero__explore").getAttribute("href"), "#film");
    assert.ok(!doc.querySelector(".node-hero__image .node-hero__explore"));
    for (const removed of ["HUMAN INTUITION × MACHINE SYNTHESIS", "THE WORLD OF N.O.D.E.", "WATCH ON VIMEO", "01 / SELECTED WORK", "THE TEASER.", "A world on the edge of being rewritten.", "HYPRFRAME — N.O.D.E.", "SCROLL TO EXPLORE", "N.O.D.E. / TEASER", "N.O.D.E. [TEASER]", "PLAY FILM", "02:51"]) {
        assert.ok(!doc.body.textContent.includes(removed), `removed copy is still visible: ${removed}`);
    }
    assert.ok(!doc.querySelector(".node-film__heading"), "the video follows its label without a title block");
    assert.match(fs.readFileSync(path.join(root, "project-node.css"), "utf8"), /height: clamp\(170px, 23svh, 250px\)/);
    assert.match(doc.querySelector(".node-story__copy p").textContent, /water rationing/);
    assert.equal(doc.querySelectorAll(".node-card").length, 2);
    assert.equal(doc.querySelector(".footer-row").textContent.trim(), "© 2026 HYPRFRAME. All rights reserved.");

    window.eval(script);
    const burger = doc.getElementById("burger");
    const menu = doc.getElementById("menuOverlay");
    const key = (name, shiftKey = false) => window.dispatchEvent(new window.KeyboardEvent("keydown", {
        key: name, shiftKey, bubbles: true, cancelable: true,
    }));
    burger.click();
    assert.ok(doc.body.classList.contains("menu-open"));
    assert.equal(burger.getAttribute("aria-expanded"), "true");
    assert.equal(menu.getAttribute("aria-hidden"), "false");
    assert.equal(doc.activeElement, menu.querySelector("a"));
    key("Escape");
    assert.equal(doc.activeElement, burger);
    assert.ok(!doc.body.classList.contains("menu-open"));
    Object.defineProperty(window, "scrollY", { value: 60, configurable: true });
    window.dispatchEvent(new window.Event("scroll"));
    assert.ok(doc.getElementById("siteHeader").classList.contains("scrolled"));

    assert.equal(doc.querySelector(".node-player iframe"), null, "Vimeo is not loaded before playback");
    doc.getElementById("playFilm").click();
    const player = doc.querySelector(".node-player iframe");
    assert.match(player.src, /player\.vimeo\.com\/video\/1227346538\?autoplay=1&dnt=1&transparent=0/);
    assert.equal(player.title, "N.O.D.E. teaser — HYPRFRAME");
    assert.match(fs.readFileSync(path.join(root, "project-node.css"), "utf8"), /\.node-player \{[^}]*background: #000/);
    assert.ok(!player.classList.contains("is-ready"), "the iframe stays hidden over black while loading");
    player.dispatchEvent(new window.Event("load"));
    assert.ok(!player.classList.contains("is-ready"), "iframe load alone must not reveal a white frame");
    window.dispatchEvent(new window.MessageEvent("message", {
        origin: "https://example.com", source: player.contentWindow,
        data: JSON.stringify({ event: "ready" }),
    }));
    assert.ok(!player.classList.contains("is-ready"), "only Vimeo can reveal the player");
    window.dispatchEvent(new window.MessageEvent("message", {
        origin: "https://player.vimeo.com", source: player.contentWindow,
        data: JSON.stringify({ event: "ready" }),
    }));
    assert.ok(player.classList.contains("is-ready"), "the player appears only when Vimeo is ready");
    assert.deepEqual(errors, []);
    console.log("PASS  N.O.D.E.: header, working links, assets, story, video and mobile menu");
} finally {
    dom.window.close();
}
