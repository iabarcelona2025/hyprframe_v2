/* Regression test for the hero marquee's seamless loop across viewport/font sizes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
const dom = new JSDOM(html, {
    url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;
const errors = [];
window.addEventListener("error", (event) => errors.push(event.error));
const marquee = doc.querySelector(".hero-marquee");
const track = marquee.querySelector(".marquee-track");
let viewportWidth = 1920;
let segmentWidth = 1050;

// jsdom has no layout: supply the two measurements the real script uses.
Object.defineProperty(marquee, "clientWidth", { get: () => viewportWidth });
const realRect = window.Element.prototype.getBoundingClientRect;
window.Element.prototype.getBoundingClientRect = function () {
    if (this.matches(".hero-marquee .marquee-track > span")) return { width: segmentWidth };
    return realRect.call(this);
};
window.matchMedia = () => ({ matches: true }); // reduced motion avoids unrelated timers
window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
let fontsReady;
Object.defineProperty(doc, "fonts", {
    value: { ready: new Promise((resolve) => { fontsReady = resolve; }) },
});

function checkLoop() {
    const spans = [...track.children];
    const half = spans.length / 2;
    assert.equal(spans.length % 2, 0, "the track must have two equal halves");
    assert.ok(half * segmentWidth > viewportWidth, "each half must cover the viewport without a gap");
    assert.deepEqual(
        spans.slice(0, half).map((el) => el.textContent),
        spans.slice(half).map((el) => el.textContent),
        "the second half must exactly repeat the first at the CSS -50% seam"
    );
    assert.equal(track.style.animationDuration, `${28 * half}s`, "speed must not change with width");
    assert.match(css, /@keyframes marquee\s*\{\s*to\s*\{\s*transform:\s*translateX\(-50%\)/);
}

(async () => {
    // Before the fix, one segment (1050px) left a gap on a 1920px viewport.
    assert.equal(track.children.length, 2);
    assert.ok(segmentWidth < viewportWidth);
    window.eval(script);
    checkLoop();

    viewportWidth = 3840;
    window.dispatchEvent(new window.Event("resize"));
    checkLoop();

    // Font swap can make the text shorter after initial sizing.
    segmentWidth = 670;
    fontsReady();
    await Promise.resolve();
    checkLoop();

    viewportWidth = 375;
    window.dispatchEvent(new window.Event("resize"));
    checkLoop();
    assert.deepEqual(errors, [], "no runtime errors on resize");
    dom.window.close();
    console.log("PASS  hero marquee stays seamless at 375/1920/3840px and after font load");
})().catch((error) => { console.error(error); process.exitCode = 1; dom.window.close(); });
