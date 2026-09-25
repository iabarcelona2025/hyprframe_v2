/* Smoke test for N.O.D.E.: brand navigation, local assets, teaser and keyboard menu. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "project-node.html"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "project-node.js"), "utf8");
const css = fs.readFileSync(path.join(root, "project-node.css"), "utf8");
const dom = new JSDOM(html, {
    url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;
const indexDoc = new JSDOM(index).window.document;
const errors = [];
window.addEventListener("error", (event) => errors.push(event.message));

/* jsdom has no matchMedia: stub it so the cursor can read the touch and
   reduced-motion preferences (same approach as test-redesign.js). */
const stubMatchMedia = (win, matches = false) => {
    win.matchMedia = (query) => ({
        matches, media: query,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
    });
};
stubMatchMedia(window);

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
    for (const sheet of ["styles.css", "project-node.css"]) {
        assert.ok(fs.existsSync(path.join(root, sheet)));
        assert.ok(doc.querySelector(`link[href^="${sheet}"]`));
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
    assert.equal(doc.querySelector("h1").textContent, "N.O.D.E. (Teaser)");
    assert.ok(!doc.querySelector(".node-hero__period"),
        "the removed .node-hero__period wrapper stays out (it recoloured the period)");

    // The four dots of "N.O.D.E." share one class and one fixed box, so the
    // tracking stays even — without touching the visible title.
    const dots = [...doc.querySelectorAll("#nodeTitle .node-hero__dot")];
    assert.equal(dots.length, 4, "the title has four .node-hero__dot periods");
    assert.deepEqual(dots.map((dot) => dot.textContent), [".", ".", ".", "."]);
    assert.deepEqual([...new Set(dots.map((dot) => dot.getAttribute("class")))], ["node-hero__dot"],
        "every period uses the same single class");
    assert.match(css, /\.node-hero__dot \{[^}]*width: 0\.22em/, "each dot is a 0.22em box");
    assert.ok(!/\.node-hero__dot[^{]*\{[^}]*\bcolor:/.test(css), "the dots keep the colour of the letters");
    assert.equal(doc.querySelector("#nodeTitle").textContent.replace(/\s+/g, " "), "N.O.D.E. (Teaser)");

    assert.match(css, /font-size: clamp\(1\.15rem, 2vw, 1\.7rem\); text-indent/);
    assert.ok(!doc.querySelector(".node-film__after"), "old film caption has been removed");
    assert.ok(!doc.querySelector(".node-hero__image img"), "the opener band carries no still image");
    assert.match(css, /\.node-hero__image \{[^}]*background: var\(--bg\)/,
        "the header band sits on the solid --bg background");
    assert.ok(!/radial-gradient\(ellipse 48% 90%/.test(css), "the header band gradient is gone");
    assert.match(css, /background: var\(--lime\); border: 1px solid var\(--lime\)/);
    assert.equal(doc.getElementById("playFilm").textContent.trim(), "▶");
    assert.ok(!doc.querySelector(".node-story__caption"));
    assert.equal(doc.querySelector(".node-hero__bottom > .node-hero__explore").getAttribute("href"), "#film");
    assert.ok(!doc.querySelector(".node-hero__image .node-hero__explore"));
    for (const removed of ["HUMAN INTUITION × MACHINE SYNTHESIS", "THE WORLD OF N.O.D.E.", "WATCH ON VIMEO", "01 / SELECTED WORK", "THE TEASER.", "A world on the edge of being rewritten.", "HYPRFRAME — N.O.D.E.", "SCROLL TO EXPLORE", "N.O.D.E. / TEASER", "N.O.D.E. [TEASER]", "PLAY FILM", "02:51"]) {
        assert.ok(!doc.body.textContent.includes(removed), `removed copy is still visible: ${removed}`);
    }
    assert.ok(!doc.querySelector(".node-film__heading"), "the video follows its label without a title block");
    assert.match(css, /height: clamp\(170px, 23svh, 250px\)/);
    assert.match(doc.querySelector(".node-story__copy p").textContent, /water rationing/);
    assert.equal(doc.querySelectorAll(".node-card").length, 2);
    assert.equal(doc.querySelector(".footer-row").textContent.trim(), "© 2026 HYPRFRAME. All rights reserved.");

    // Custom cursor: the same two elements as the landing, driven by project-node.js.
    assert.deepEqual([...doc.querySelectorAll(".cursor-dot, .cursor-ring")].map((el) => el.outerHTML),
        [...indexDoc.querySelectorAll(".cursor-dot, .cursor-ring")].map((el) => el.outerHTML),
        "the cursor markup matches index.html");
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.cursor-dot, \.cursor-ring \{ display: none; \}/,
        "reduced motion hides the cursor");

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

    // Hovering an interactive element enlarges the cursor ring.
    const hover = (el, type) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: false }));
    hover(doc.querySelector(".node-back"), "mouseenter");
    assert.ok(doc.body.classList.contains("cursor-large"), "hovering a link enlarges the ring");
    hover(doc.querySelector(".node-back"), "mouseleave");
    assert.ok(!doc.body.classList.contains("cursor-large"), "leaving the link restores the ring");
    hover(doc.getElementById("playFilm"), "mouseenter");
    assert.ok(doc.body.classList.contains("cursor-large"), "hovering a button enlarges the ring");
    hover(doc.getElementById("playFilm"), "mouseleave");
    assert.ok(!doc.body.classList.contains("cursor-large"));

    assert.equal(doc.querySelector(".node-player iframe"), null, "Vimeo is not loaded before playback");
    doc.getElementById("playFilm").click();
    const player = doc.querySelector(".node-player iframe");
    assert.match(player.src, /player\.vimeo\.com\/video\/1227346538\?autoplay=1&dnt=1&transparent=0/);
    assert.equal(player.title, "N.O.D.E. teaser — HYPRFRAME");
    assert.match(css, /\.node-player \{[^}]*background: #000/);
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

/* The dot and the ring are painted from a requestAnimationFrame loop, so the
   movement checks need a frame to run: each one uses its own document and
   closes it when it is done. `matches` simulates a touch device or a visitor
   who prefers reduced motion, where the cursor must stay off. */
async function checkCursor(matches) {
    const cursorDom = new JSDOM(html, {
        url: "http://localhost:8080/project-node.html", runScripts: "outside-only", pretendToBeVisual: true,
    });
    const win = cursorDom.window;
    try {
        stubMatchMedia(win, matches);
        win.eval(script);
        const cursorDoc = win.document;
        const dot = cursorDoc.getElementById("cursorDot");
        const ring = cursorDoc.getElementById("cursorRing");
        const startX = win.innerWidth / 2, startY = win.innerHeight / 2;
        const at = (el) => {
            const found = el.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
            return found ? found.slice(1).map(Number) : null;
        };

        win.dispatchEvent(new win.MouseEvent("mousemove", { clientX: 220, clientY: 140 }));
        cursorDoc.querySelector(".node-card").dispatchEvent(new win.MouseEvent("mouseenter", { bubbles: false }));
        await new Promise((resolve) => win.requestAnimationFrame(resolve));

        if (matches) {
            assert.equal(at(dot), null, "touch / reduced motion leaves the dot where it is");
            assert.equal(at(ring), null, "touch / reduced motion leaves the ring where it is");
            assert.ok(!cursorDoc.body.classList.contains("cursor-large"), "the ring never grows while the cursor is off");
            console.log("PASS  N.O.D.E.: cursor stays off on touch devices and with reduced motion");
        } else {
            assert.deepEqual(at(dot), [220, 140], "the dot sits exactly on the pointer");
            const [ringX, ringY] = at(ring);
            assert.ok(ringX > 220 && ringX < startX && ringY > 140 && ringY < startY,
                `the ring eases towards the pointer instead of jumping (${ringX}, ${ringY})`);
            assert.ok(cursorDoc.body.classList.contains("cursor-large"), "hovering a card enlarges the ring");
            console.log("PASS  N.O.D.E.: cursor dot follows the pointer and the ring eases behind it");
        }
    } finally {
        cursorDom.window.close();
    }
}

(async () => {
    try {
        await checkCursor(false);
        await checkCursor(true);
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
})();
