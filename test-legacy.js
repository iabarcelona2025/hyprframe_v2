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
    assert.equal(doc.getElementById("modalExternal").href, firstCard.href);
    assert.equal(doc.activeElement, closeButton);
    doc.getElementById("modalExternal").focus();
    key("Tab");
    assert.equal(doc.activeElement, closeButton, "focus stays inside the modal");
    key("Escape");
    assert.equal(modal.hidden, true);
    assert.equal(player.getAttribute("src"), "");
    assert.equal(doc.activeElement, firstCard);

    doc.querySelectorAll(".film-card")[1].click();
    modal.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.equal(modal.hidden, true, "clicking backdrop closes the video");

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
