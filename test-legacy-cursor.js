/* Smoke test for Captured: the opener gradient and the custom cursor.
   Runs the REAL legacy.js against the REAL legacy.html in jsdom. */
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "legacy.html"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "legacy.js"), "utf8");
const css = fs.readFileSync(path.join(root, "legacy.css"), "utf8");
const sharedCss = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const indexDoc = new JSDOM(index).window.document;
/* Static copies (no scripts): the cursor's inline transform would otherwise
   leak into the markup comparison below. */
const legacyDoc = new JSDOM(html).window.document;

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};

/* jsdom has no matchMedia; the cursor reads it to detect touch devices and
   reduced motion. `matches: true` simulates either of those two cases. */
const stubMatchMedia = (win, matches = false) => {
    win.matchMedia = (query) => ({
        matches, media: query,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
    });
};

const frame = (win) => new Promise((resolve) => win.requestAnimationFrame(resolve));
const markup = (elements) => JSON.stringify([...elements].map((el) => el.outerHTML));
const at = (el) => {
    const found = el.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    return found ? found.slice(1).map(Number) : null;
};

function loadPage(matches) {
    const dom = new JSDOM(html, {
        url: "http://localhost:8080/legacy.html", runScripts: "outside-only", pretendToBeVisual: true,
    });
    const errors = [];
    dom.window.addEventListener("error", (event) => errors.push(event.message));
    stubMatchMedia(dom.window, matches);
    dom.window.eval(script);
    return { dom, win: dom.window, doc: dom.window.document, errors };
}

(async () => {
    /* ── 1. The opener keeps the Captured gradient ─────────── */
    const hero = (css.match(/\.legacy-hero \{[^}]*\}/) || [""])[0];
    check("the Captured opener keeps its top gradient",
        /radial-gradient\(ellipse 48% 90% at 84% 38%/.test(hero) && /linear-gradient\(125deg/.test(hero),
        hero.replace(/\s+/g, " ").slice(0, 120));

    /* ── 2. Cursor markup, identical to the landing ────────── */
    const page = loadPage(false);
    const { win, doc, errors } = page;
    const dot = doc.getElementById("cursorDot");
    const ring = doc.getElementById("cursorRing");
    check("the page has .cursor-dot#cursorDot", !!dot && dot.classList.contains("cursor-dot"));
    check("the page has .cursor-ring#cursorRing", !!ring && ring.classList.contains("cursor-ring"));
    check("both cursor layers are hidden from assistive tech",
        dot?.getAttribute("aria-hidden") === "true" && ring?.getAttribute("aria-hidden") === "true");
    check("the cursor markup matches index.html",
        markup(legacyDoc.querySelectorAll(".cursor-dot, .cursor-ring")) === markup(indexDoc.querySelectorAll(".cursor-dot, .cursor-ring")));

    /* ── 3. Stacking and media queries ─────────────────────── */
    const cursorZ = Number((css.match(/\.cursor-dot, \.cursor-ring \{ z-index: (\d+); \}/) || [])[1]);
    const modalZ = Number((css.match(/\.film-modal \{[^}]*z-index: (\d+)/) || [])[1]);
    check("the cursor paints above the video modal", cursorZ > modalZ, `cursor ${cursorZ} / modal ${modalZ}`);
    check("reduced motion hides the cursor",
        /@media \(prefers-reduced-motion: reduce\) \{\s*\.cursor-dot, \.cursor-ring \{ display: none; \}/.test(css));
    check("touch devices hide the cursor",
        /@media \(hover: none\), \(pointer: coarse\) \{\s*\.cursor-dot, \.cursor-ring \{ display: none; \}/.test(sharedCss));

    /* ── 4. The dot follows the pointer, the ring eases ────── */
    const startX = win.innerWidth / 2, startY = win.innerHeight / 2;
    win.dispatchEvent(new win.MouseEvent("mousemove", { clientX: 220, clientY: 140 }));
    await frame(win);
    check("the dot sits exactly on the pointer", JSON.stringify(at(dot)) === JSON.stringify([220, 140]),
        JSON.stringify(at(dot)));
    let [ringX, ringY] = at(ring);
    check("the ring eases towards the pointer instead of jumping",
        ringX > 220 && ringX < startX && ringY > 140 && ringY < startY, `${ringX}, ${ringY}`);
    const firstGap = Math.hypot(ringX - 220, ringY - 140);

    win.dispatchEvent(new win.MouseEvent("mousemove", { clientX: 640, clientY: 400 }));
    await frame(win);
    check("the dot keeps tracking the pointer", JSON.stringify(at(dot)) === JSON.stringify([640, 400]),
        JSON.stringify(at(dot)));
    [ringX, ringY] = at(ring);
    check("the ring keeps chasing and closes the gap",
        Math.hypot(ringX - 640, ringY - 400) < firstGap, `${ringX}, ${ringY}`);

    /* ── 5. The ring grows over links and buttons ──────────── */
    const hover = (el, type) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: false }));
    const film = doc.querySelector(".film-card");
    hover(film, "mouseenter");
    check("hovering a film link enlarges the ring", doc.body.classList.contains("cursor-large"));
    hover(film, "mouseleave");
    check("leaving the link restores the ring", !doc.body.classList.contains("cursor-large"));
    hover(doc.getElementById("burger"), "mouseenter");
    check("hovering a button enlarges the ring", doc.body.classList.contains("cursor-large"));
    hover(doc.getElementById("burger"), "mouseleave");
    check("leaving the button restores the ring", !doc.body.classList.contains("cursor-large"));

    /* ── 6. The cursor keeps working over the video modal ──── */
    film.click();
    check("the video modal opens", !doc.getElementById("videoModal").hidden);
    hover(doc.getElementById("modalClose"), "mouseenter");
    check("the ring grows over the modal's close button", doc.body.classList.contains("cursor-large"));
    hover(doc.getElementById("modalClose"), "mouseleave");

    check("no runtime errors", errors.length === 0, errors.join(" | "));
    page.dom.window.close();

    /* ── 7. Touch devices and reduced motion: cursor off ───── */
    const off = loadPage(true);
    off.win.dispatchEvent(new off.win.MouseEvent("mousemove", { clientX: 220, clientY: 140 }));
    off.doc.querySelector(".film-card").dispatchEvent(new off.win.MouseEvent("mouseenter", { bubbles: false }));
    await frame(off.win);
    check("touch / reduced motion leaves the cursor still",
        at(off.doc.getElementById("cursorDot")) === null && at(off.doc.getElementById("cursorRing")) === null);
    check("touch / reduced motion never grows the ring", !off.doc.body.classList.contains("cursor-large"));
    off.doc.querySelector(".film-card").click();
    check("the film player still opens without the cursor", !off.doc.getElementById("videoModal").hidden);
    check("no runtime errors without the cursor", off.errors.length === 0, off.errors.join(" | "));
    off.dom.window.close();

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
})();
