/* CLB gallery regression checks: run with `node test-clb-gallery.js`. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const doc = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8")).window.document;
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("CLB gallery follows TEST NOW and precedes Key Capabilities", () => {
    const grid = doc.querySelector("#clb .clb-grid");
    assert.deepEqual([...grid.children].map(el => el.className),
        ["clb-intro", "clb-showcase", "clb-capabilities"]);
    assert.equal(grid.querySelector(".clb-intro .clb-cta").getAttribute("href"), "builder.html");
});

test("four distinct frames plus a hidden copy of the first for a seamless loop", () => {
    const images = [...doc.querySelectorAll("#clb .clb-gallery-track img")];
    assert.equal(images.length, 5);
    images.slice(0, 4).forEach((img, i) => {
        assert.equal(img.getAttribute("src"), `assets/images/clb0${i + 1}.png`);
        assert.ok(img.alt);
        assert.ok(fs.existsSync(path.join(root, img.getAttribute("src"))));
    });
    assert.equal(images[4].getAttribute("src"), images[0].getAttribute("src"));
    assert.equal(images[4].getAttribute("aria-hidden"), "true");
    assert.equal(images[4].alt, "");
});

test("gallery and reflection slide in sync every 3s with ease-in-out", () => {
    assert.match(css, /\.clb-gallery-track\s*\{[^}]*animation:\s*clbSlide\s+12s\s+ease-in-out\s+infinite/);
    assert.match(css, /\.clb-reflection-track\s*\{[^}]*animation:\s*clbSlide\s+12s\s+ease-in-out\s+infinite/);
    const frames = css.match(/@keyframes clbSlide\s*\{([^}]+\}[^}]*\}[^}]*\}[^}]*\}[^}]*\})\s*\}/)?.[1];
    assert.ok(frames, "five keyframe groups");
    for (const offset of ["0", "-20%", "-40%", "-60%", "-80%"])
        assert.ok(frames.includes(`translateX(${offset})`), `position ${offset}`);
});

test("only mirrored photos appear beneath the gallery; no violet glow", () => {
    const photos = [...doc.querySelectorAll("#clb .clb-gallery-track img")];
    const reflection = doc.querySelector("#clb .clb-gallery-reflection");
    assert.equal(reflection.getAttribute("aria-hidden"), "true");
    assert.deepEqual([...reflection.querySelectorAll("img")].map(img => img.getAttribute("src")),
        photos.map(img => img.getAttribute("src")));
    assert.match(css, /\.clb-gallery-reflection\s*\{[^}]*scaleY\(-1\)/);
    assert.doesNotMatch(css, /\.clb-showcase::before\s*\{/);
    assert.doesNotMatch(css, /\.clb-gallery-frame\s*\{[^}]*box-shadow:/);
});

test("right edge recedes 10 degrees and the reflection is short and faint", () => {
    assert.match(css, /\.clb-gallery-frame\s*\{[^}]*border:\s*1px solid #111114;/);
    assert.match(css, /\.clb-showcase\s*\{[^}]*transform:\s*perspective\(1100px\) rotateY\(10deg\);\s*transform-origin:\s*left center;/);
    assert.match(css, /\.clb-gallery-reflection\s*\{[^}]*height:\s*clamp\(1\.1rem, 2\.8vw, 2rem\);/);
    assert.match(css, /\.clb-gallery-reflection\s*\{[^}]*opacity:\s*0\.16;/);
    assert.ok(doc.querySelector("#clb .clb-showcase > .clb-gallery-reflection"));
});

test("only the screen's top and bottom bow inward; sides and reflection remain unchanged", () => {
    const frameRule = css.match(/\.clb-gallery-frame\s*\{[^}]*\}/)?.[0] || "";
    const reflectionRule = css.match(/\.clb-gallery-reflection\s*\{[^}]*\}/)?.[0] || "";
    assert.match(frameRule, /clip-path:\s*polygon\(\s*0 0,/);
    assert.match(frameRule, /50% 3%/); // top center curves inward
    assert.match(frameRule, /100% 0,\s*100% 100%/); // right side stays straight
    assert.match(frameRule, /50% 97%/); // bottom center curves inward
    assert.match(frameRule, /0 100%\s*\)/); // left side stays straight
    assert.doesNotMatch(reflectionRule, /clip-path:/);
});

test("gallery stacks between intro and features on mobile and stays still with reduced motion", () => {
    assert.match(css, /grid-template-areas:\s*"intro"\s*"showcase"\s*"capabilities"/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.clb-gallery-track, \.clb-reflection-track\s*\{\s*animation:\s*none;\s*transform:\s*none;/);
});
