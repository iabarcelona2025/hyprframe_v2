/* Smoke test for the Captured page's links, navigation and video player. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "legacy.html"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "legacy.js"), "utf8");
const dom = new JSDOM(html, {
    url: "http://localhost:8080/legacy.html", runScripts: "outside-only", pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;
const indexDoc = new JSDOM(index).window.document;
const errors = [];
window.addEventListener("error", (event) => errors.push(event.message));

try {
    assert.match(html, /gtag\('config', 'G-6MW201KGC9'\)/);
    assert.equal((html.match(/googletagmanager\.com\/gtag\/js/g) || []).length, 1);
    for (const css of ["styles.css", "legacy.css"]) {
        assert.ok(fs.existsSync(path.join(root, css)), `${css} must exist`);
        assert.ok(doc.querySelector(`link[href^="${css}"]`), `${css} must be loaded`);
    }
    assert.ok(fs.existsSync(path.join(root, doc.querySelector(".logo img").getAttribute("src"))));

    const headerLinks = [...doc.querySelectorAll(".main-nav a")];
    assert.deepEqual(headerLinks.map((link) => link.textContent.trim()),
        [...indexDoc.querySelectorAll(".main-nav a")].map((link) => link.textContent.trim()));
    assert.equal(doc.querySelector(".main-nav [aria-current=page]").getAttribute("href"), "legacy.html");
    for (const link of doc.querySelectorAll(".site-header a, .menu-links a, .legacy-hero__scroll, .legacy-next a")) {
        const href = link.getAttribute("href");
        if (href.startsWith("https://")) continue; // Spanish site is not part of this repo.
        const resolved = new URL(href, window.location.href);
        const filename = resolved.pathname.slice(1);
        assert.ok(fs.existsSync(path.join(root, filename)), `missing destination ${href}`);
        if (resolved.hash) {
            const target = filename === "index.html" ? indexDoc : doc;
            assert.ok(target.getElementById(decodeURIComponent(resolved.hash.slice(1))), `missing anchor ${href}`);
        }
    }
    assert.equal(doc.querySelectorAll(".film-card").length, 6);
    assert.ok([...doc.querySelectorAll(".film-card")].every((link) =>
        link.href === `https://vimeo.com/${link.dataset.vimeo}` && link.querySelector("img[data-fallback-src]")));

    // Play triangles are drawn in CSS (no "▶" glyph) and centred on their circle, which
    // keeps its centre on hover (`translate`, not `transform`, so `scale` can't drift it).
    const legacyCss = fs.readFileSync(path.join(root, "legacy.css"), "utf8");
    const plays = [...doc.querySelectorAll(".film-card__play")];
    assert.equal(plays.length, 6);
    assert.ok(plays.every((play) => play.textContent === ""), "play triangles are drawn in CSS, not with a font glyph");
    const triangle = legacyCss.match(/\.film-card__play::before \{[^}]*clip-path: polygon\(([^;]+)\);/)[1].split(",")
        .map((point) => point.match(/calc\(50% [+-] [\d.]+em\)|50%/g).map((v) => (v === "50%" ? 0 : parseFloat(v.slice(9).replace(" ", "")))));
    assert.equal(triangle.length, 3);
    for (const axis of [0, 1]) {
        assert.ok(Math.abs(triangle.reduce((sum, point) => sum + point[axis], 0)) < 1e-3, "the triangle's centroid is the circle's centre");
    }
    const radii = triangle.map(([x, y]) => Math.hypot(x, y));
    assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-3, "the triangle's corners are equidistant from the circle's edge");
    const playRule = legacyCss.match(/\.film-card__play \{[^}]*\}/)[0];
    assert.match(playRule, /translate: -50% -50%;/);
    assert.doesNotMatch(playRule, /transform:/, "the hover scale must not drift the circle off the poster centre");

    window.eval(script);
    const burger = doc.getElementById("burger");
    const menu = doc.getElementById("menuOverlay");
    const modal = doc.getElementById("videoModal");
    const player = doc.getElementById("vimeoPlayer");
    const closeButton = doc.getElementById("modalClose");
    const firstCard = doc.querySelector(".film-card");
    const key = (name, shiftKey = false) => doc.dispatchEvent(new window.KeyboardEvent("keydown", {
        key: name, shiftKey, bubbles: true, cancelable: true,
    }));

    burger.click();
    assert.ok(doc.body.classList.contains("menu-open"));
    assert.equal(burger.getAttribute("aria-expanded"), "true");
    assert.equal(menu.getAttribute("aria-hidden"), "false");
    assert.equal(doc.activeElement, menu.querySelector("a"));
    key("Escape");
    assert.ok(!doc.body.classList.contains("menu-open"));
    assert.equal(doc.activeElement, burger);

    Object.defineProperty(window, "scrollY", { value: 60, configurable: true });
    window.dispatchEvent(new window.Event("scroll"));
    assert.ok(doc.getElementById("siteHeader").classList.contains("scrolled"));

    firstCard.click();
    assert.equal(modal.hidden, false);
    assert.ok(doc.body.classList.contains("modal-open"));
    assert.match(player.src, /player\.vimeo\.com\/video\/1131285757\?autoplay=1&dnt=1/);
    assert.equal(doc.getElementById("modalTitle").textContent, firstCard.dataset.title);
    assert.ok(!doc.getElementById("modalExternal") && !doc.body.textContent.includes("WATCH ON VIMEO"),
        "the WATCH ON VIMEO link was removed from the modal on purpose");
    assert.equal(doc.activeElement, closeButton);
    key("Tab", true);
    assert.equal(doc.activeElement, player, "Shift+Tab on CLOSE wraps to the player");
    // Tabbing past the last control of the cross-origin Vimeo iframe happens inside the
    // iframe, so this page only sees focus landing behind the modal: it must come back.
    doc.querySelector(".footer-back a").focus();
    assert.equal(doc.activeElement, closeButton, "focus stays inside the modal");
    key("Escape");
    assert.equal(modal.hidden, true);
    assert.equal(player.getAttribute("src"), "");
    assert.equal(doc.activeElement, firstCard);

    doc.querySelectorAll(".film-card")[1].click();
    modal.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.equal(modal.hidden, true, "clicking backdrop closes the video");

    // The pop-up closes by itself when the film ends: once Vimeo reports "ready", the page
    // subscribes to "ended" through the player's postMessage API and closes on that event.
    const endingCard = doc.querySelectorAll(".film-card")[2];
    const sent = [];
    const fromVimeo = (data, { origin = "https://player.vimeo.com", source = player.contentWindow } = {}) =>
        window.dispatchEvent(new window.MessageEvent("message", { origin, source, data }));
    endingCard.click();
    player.contentWindow.postMessage = (message, targetOrigin) => sent.push({ message, targetOrigin });
    fromVimeo(JSON.stringify({ event: "ready", player_id: "" }));
    // (JSON round-trip: the message object was created in the page's realm, not Node's.)
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ message: { method: "addEventListener", value: "ended" }, targetOrigin: "https://player.vimeo.com" }],
        "the page asks the Vimeo player to report when the film ends");
    fromVimeo({ event: "ended" }, { origin: "https://example.com" });
    fromVimeo({ event: "ended" }, { source: window });
    fromVimeo("not json");
    assert.equal(modal.hidden, false, "only the Vimeo player in the pop-up can close it");
    fromVimeo(JSON.stringify({ event: "ended", data: { seconds: 70, percent: 1, duration: 70 } }));
    assert.equal(modal.hidden, true, "the pop-up closes as soon as the film ends");
    assert.equal(player.getAttribute("src"), "", "the ended film is unloaded");
    assert.ok(!doc.body.classList.contains("modal-open"));
    assert.equal(doc.activeElement, endingCard, "focus returns to the film that just ended");
    endingCard.click(); // the player may also send plain objects instead of JSON strings
    fromVimeo({ event: "ready" });
    fromVimeo({ event: "ended" });
    assert.equal(modal.hidden, true, "object messages from Vimeo work too");

    const image = firstCard.querySelector("img");
    image.dispatchEvent(new window.Event("error"));
    assert.equal(image.src, image.dataset.fallbackSrc, "fallback to the real Vimeo thumbnail");
    image.dispatchEvent(new window.Event("error"));
    assert.ok(image.classList.contains("is-unavailable"), "poster remains legible offline");
    assert.deepEqual(errors, [], "no runtime errors");
    console.log("PASS  Captured: root navigation, six films, video modal, keyboard and image fallback");
} finally {
    dom.window.close();
}
