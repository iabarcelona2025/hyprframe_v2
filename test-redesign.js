/* Smoke test: runs the REAL script.js against the REAL index.html in jsdom */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");

const dom = new JSDOM(html, {
    url: "http://localhost:8080/",
    pretendToBeVisual: true, // enables requestAnimationFrame
    runScripts: "outside-only",
});
const { window } = dom;

/* --- minimal browser API stubs jsdom lacks --- */
window.matchMedia = (q) => ({
    matches: false, media: q,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
});
class IOStub {
    constructor(cb) { this.cb = cb; }
    observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }], this), 5); }
    unobserve() {} disconnect() {}
}
window.IntersectionObserver = IOStub;
window.Image = class { set src(v) { this._src = v; } get src() { return this._src; } };

let failures = 0;
const check = (name, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
    if (!cond) failures++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const errors = [];
    window.addEventListener("error", (e) => errors.push(e.message));

    // record the moment body.loaded is set (hero ready)
    let loadedAt = null;
    new window.MutationObserver(() => {
        if (loadedAt === null && window.document.body.classList.contains("loaded")) loadedAt = Date.now();
    }).observe(window.document.body, { attributes: true, attributeFilter: ["class"] });

    // ── execute the real script ──
    try {
        window.eval(js);
    } catch (e) {
        console.log("FAIL  script.js threw on load:", e.message);
        process.exit(1);
    }

    const doc = window.document;
    const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");

    const aboutKicker = doc.querySelector("#about > .kicker");
    check("About kicker displays THE STUDIO", aboutKicker && aboutKicker.textContent.trim() === "THE STUDIO");
    check("About copy moves 25px closer on web only; mobile keeps its base spacing",
        /\.about-heading\s*\{[^}]*margin-bottom:\s*clamp\(2\.5rem, 6vw, 4\.5rem\)/.test(css) &&
        /@media \(min-width: 861px\)[\s\S]*?\.about-heading\s*\{[^}]*margin-bottom:\s*calc\(clamp\(2\.5rem, 6vw, 4\.5rem\) - 25px\)/.test(css));
    check("Entire About block moves up 30px on web only",
        /\.about\s*\{\s*padding:\s*clamp\(6rem, 15vw, 11rem\) var\(--pad\);/.test(css) &&
        /@media \(min-width: 861px\)\s*\{[^}]*\.about\s*\{\s*padding-top:\s*calc\(clamp\(6rem, 15vw, 11rem\) - 30px\)/.test(css));
    check("About stats move 10px closer to their description on web only",
        /\.about-copy\s*\{[^}]*margin:\s*0 0 clamp\(2\.5rem, 6vw, 4\.5rem\)/.test(css) &&
        /@media \(min-width: 861px\)[\s\S]*?\.about-copy\s*\{[^}]*margin-bottom:\s*calc\(clamp\(2\.5rem, 6vw, 4\.5rem\) - 10px\)/.test(css));
    check("clock removed from header", doc.getElementById("clock") === null);

    // reveals + line-mask titles observed → .in applied by IO stub
    await wait(60);
    const revealTotal = doc.querySelectorAll("[data-reveal]").length;
    const revealIn = doc.querySelectorAll("[data-reveal].in").length;
    check("data-reveal elements got .in", revealIn === revealTotal, `${revealIn}/${revealTotal}`);
    check("section titles got reveal-lines + .in",
        doc.querySelectorAll(".section-title.in, .about-title.in, .contact-title.in").length === 5,
        `${doc.querySelectorAll(".reveal-lines.in").length}/5`);
    const clbSection = doc.getElementById("clb");
    const clbCta = clbSection && clbSection.querySelector(".clb-cta");
    const clbCopy = clbSection ? clbSection.textContent : "";
    check("CLB: section beneath DNAi and before Contact, using the shared section heading",
        !!clbSection && doc.getElementById("services").nextElementSibling === clbSection &&
        clbSection.nextElementSibling === doc.getElementById("contact") &&
        !!clbSection.querySelector(".section-head .section-title"));
    check("CLB: includes the overview, technical setup and dual-format output details",
        /filmmakers, cinematographers, and AI creators/.test(clbCopy) &&
        /LLM-ready prompts/.test(clbCopy) && /Precise Technical Setup/.test(clbCopy) &&
        /grain, halation, and saturation/.test(clbCopy) && /Dual-Format Generation/.test(clbCopy) &&
        /Semantic Prompt/.test(clbCopy) && /Technical JSON/.test(clbCopy));
    check("CLB: TEST NOW opens builder.html",
        clbCta && clbCta.getAttribute("href") === "builder.html" &&
        clbCta.textContent.trim().startsWith("TEST NOW"));
    const clbNavLinks = [...doc.querySelectorAll(".main-nav a, .menu-links a")]
        .filter((link) => link.textContent.trim().endsWith("CLB"));
    check("CLB links in the top and mobile menus point to the landing section",
        clbNavLinks.length === 2 && clbNavLinks.every((link) => link.getAttribute("href") === "#clb"));
    check("CLB occupies a full viewport so Contact does not appear when the anchor opens",
        /\.clb\s*\{[^}]*min-height:\s*100svh/.test(css));
    const contactSection = doc.getElementById("contact");
    check("Contact anchor reserves space for the footer without showing CLB's TEST NOW button",
        /\.contact\s*\{[^}]*min-height:\s*calc\(100svh - 8\.5rem\)/.test(css));
    check("Contact desktop kicker aligns with About while the footer still fits in view",
        /\.about\s*\{\s*padding:\s*clamp\(6rem, 15vw, 11rem\)/.test(css) &&
        /@media \(min-width: 861px\)\s*\{\s*\.contact\s*\{[^}]*padding:\s*clamp\(6rem, 15vw, 11rem\) var\(--pad\) clamp\(0\.5rem, 1vh, 0\.75rem\)/.test(css) &&
        /\.contact-title\s*\{\s*font-size:\s*clamp\(3rem, min\(9\.5vw, 10vh\), 8\.5rem\)/.test(css));
    const pageFooter = doc.querySelector(".site-footer");
    check("footer copyright stays legible at the Contact anchor",
        /\.footer-row\s*\{[^}]*font-size:\s*calc\(0\.65rem - 1px\);[^}]*color:\s*var\(--muted\)/.test(css));
    check("the copyright is 1px smaller on the web/desktop version and keeps its own size on mobile",
        /\.footer-row\s*\{[^}]*font-size:\s*calc\(0\.65rem - 1px\);/.test(css) &&
        /@media \(max-width: 640px\)\s*\{\s*\.footer-row\s*\{\s*font-size:\s*calc\(0\.65rem - 4px\);\s*\}\s*\}/.test(css));
    check("Contact is compacted so the footer follows closely and can be seen sooner",
        !!contactSection && contactSection.parentElement.nextElementSibling === pageFooter &&
        /\.contact\s*\{[^}]*padding:\s*clamp\(4\.5rem, 8vw, 7rem\) var\(--pad\) clamp\(2\.5rem, 4vw, 3\.5rem\)/.test(css) &&
        /\.site-footer\s*\{\s*padding:\s*clamp\(2rem, 4vw, 3rem\) var\(--pad\) 1\.5rem;/.test(css));

    // palabras sueltas destacadas en lila (--violet) dentro de los titulares, en cursiva
    const violetWords = [...doc.querySelectorAll(".violet")].map((el) => el.textContent);
    check("palabras en lila: WORK, HUMAN, MACHINE, Ai (DNAi), Cinematic (CLB) y MAKE IT (Contact)",
        violetWords.join("|") === "WORK|HUMAN|MACHINE|Ai|Cinematic|MAKE IT", violetWords.join("|"));
    check("cada palabra en lila vive dentro de su .line-inner",
        [...doc.querySelectorAll(".violet")].every((el) => el.closest(".line-inner")),
        [...doc.querySelectorAll(".violet")].map((el) => el.closest(".line-inner") ? "ok" : "fuera").join(","));
    check("las palabras en lila llevan cursiva (.italic)",
        [...doc.querySelectorAll(".violet")].every((el) => el.classList.contains("italic")),
        [...doc.querySelectorAll(".violet")].map((el) => el.classList.contains("italic") ? "ok" : "recta").join(","));
    const mobileAboutBlock = (css.match(/@media \(max-width: 600px\)\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
    check("About en móvil: anagrama y su animación debajo del texto descriptivo y centrados",
        /\.about\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(mobileAboutBlock) &&
        /\.about-heading,\s*\.about-grid\s*\{[^}]*display:\s*contents/.test(mobileAboutBlock) &&
        /\.about\s*>\s*\.kicker\s*\{[^}]*order:\s*1/.test(mobileAboutBlock) &&
        /\.about-title\s*\{[^}]*order:\s*2/.test(mobileAboutBlock) &&
        /\.about-copy\s*\{[^}]*order:\s*3/.test(mobileAboutBlock) &&
        /\.about-emblem-wrap\s*\{[^}]*order:\s*4;[^}]*justify-self:\s*center;[\s\S]*?translate:\s*25%\s+0/.test(mobileAboutBlock) &&
        /\.stats\s*\{[^}]*order:\s*5/.test(mobileAboutBlock) &&
        doc.querySelector(".about-emblem-wrap").classList.contains("in"));
    check("Sin desbordamiento horizontal en móvil (html/body/main/.about/.work-row recortados)",
        /html\s*\{[^}]*overflow-x:\s*hidden/.test(css) &&
        /main\s*\{[^}]*overflow-x:\s*hidden/.test(css) &&
        /\.about\s*\{[^}]*overflow:\s*hidden/.test(css) &&
        /\.work-row\s*\{[^}]*overflow:\s*hidden/.test(css) &&
        !/\.about-emblem-wipe\s*\{/.test(mobileAboutBlock));
    const cross = doc.querySelector(".about-title .accent");
    check("el × de HUMAN INTUITION × MACHINE SYNTHESIS gira con .cross-turn",
        cross && cross.classList.contains("cross-turn"), cross ? cross.className : "missing");
    const crossKf = (css.match(/@keyframes crossTurn\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
    const crossDegs = [...crossKf.matchAll(/rotate\((-?[\d.]+)deg\)/g)].map((m) => Number(m[1]));
    check("white typography uses a subtly warm off-white instead of pure white",
        /--fg:\s*#efeee9;/.test(css) &&
        /\.hero-title\s*\{[^}]*font-weight:\s*700[^}]*color:\s*rgba\(239, 238, 233, 0\.7\)/.test(css));
    const heroSub = doc.querySelector(".hero-sub");
    check("hero subtitle is independent of the generic sliding reveal",
        heroSub && !heroSub.hasAttribute("data-reveal") && !heroSub.hasAttribute("data-reveal-delay"));
    check("hero subtitle fades for 0.8s after a 3s delay anchored to hero readiness",
        /body\.loaded\s+\.hero-sub\s*\{\s*animation:\s*heroSubtitleFade\s+0\.8s\s+ease\s+3s\s+both;/.test(css) &&
        /@keyframes heroSubtitleFade\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}/.test(css));
    check("hero subtitle is immediately visible with reduced motion",
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.hero-sub,\s*body\.loaded\s+\.hero-sub\s*\{\s*opacity:\s*1;\s*animation:\s*none;/.test(css));
    // giro continuo de izquierda a derecha (horario) en loop: sin `alternate`
    // la dirección no se invierte nunca; cada barrido avanza 45° y el ciclo
    // 90°, así que al repetir el × queda en una posición ópticamente idéntica
    // a la de salida (90° ≡ 0°) y el loop engancha sin salto.
    check("cross-turn: gira siempre hacia la derecha en loop (sin `alternate`)",
        /\.cross-turn\s*\{[^}]*animation:\s*crossTurn\s+1\.8s\s+ease-in-out\s+infinite;/.test(css) &&
        !/crossTurn[^;}]*alternate/.test(css),
        "ver .cross-turn / @keyframes crossTurn");
    check("cross-turn: 45° por barrido y 90° por ciclo (el loop cierra sin salto)",
        crossDegs.length === 8 &&
        crossDegs[0] === 0 && crossDegs[7] === 90 &&
        crossDegs[3] - crossDegs[0] === 45 && crossDegs[7] - crossDegs[3] === 45,
        `grados: ${crossDegs.join(", ") || "no encontrados"}`);
    check("cross-turn: ciclo acelerado a 1.8s (~44% más rápido) y misma curva de giro",
        /\.cross-turn\s*\{[^}]*animation:\s*crossTurn\s+1\.8s\s+ease-in-out\s+infinite;/.test(css) &&
        /0%,\s*9\.75%/.test(css) && /59\.75%/.test(css) &&
        /87\.25%/.test(css) && /90\.25%,\s*100%/.test(css) &&
        Math.abs(2.6 / 1.8 - 1.4444444444) < 1e-9);
    // overshoot sutil: el × se estira antes de salir (0° → -4°) y se pasa de
    // largo al llegar (49° → 45°), en lugar de arrancar y frenar en seco.
    check("cross-turn: overshoot sutil de comienzo (wind-up < 0°) y de final (pasa de 45° y vuelve)",
        crossDegs.length >= 4 &&
        Math.min(...crossDegs) < 0 && Math.min(...crossDegs) >= -8 &&
        Math.max(...crossDegs) > 90 && Math.max(...crossDegs) <= 98 &&
        // el rebote vuelve justo al reposo del paso, y el segundo barrido es
        // el primero desplazado 45°: mismo wind-up, mismo recorrido, mismo
        // overshoot (mismo recorrido por barrido y sin invertir dirección)
        crossDegs[3] === 45 && crossDegs[7] === 90 &&
        crossDegs.slice(4).every((deg, i) => deg === crossDegs[i] + 45),
        `grados: ${crossDegs.join(", ") || "no encontrados"}`);
    check("cross-turn gira desde el centro del símbolo (transform-origin en la tinta, no en la caja)",
        /\.cross-turn\s*\{[^}]*transform-origin:\s*0\.3em\s+0\.5185em/.test(css),
        "ver transform-origin de .cross-turn");
    check("cross-turn sin cursiva (font-style: normal) y con reduced-motion queda en ×",
        /\.cross-turn\s*\{[^}]*font-style:\s*normal/.test(css) &&
        /\.cross-turn\s*\{\s*animation:\s*none;\s*transform:\s*none;/.test(css),
        "ver .cross-turn");

    // Kanit → Montserrat (SIL Open Font License), mismos ejes y pesos
    check("--font-head es Montserrat y no queda Kanit en styles.css",
        /--font-head:\s*"Montserrat", "Syne", sans-serif;/.test(css) && !/Kanit/i.test(css));
    check("el landing carga Montserrat con los ejes que cargaba Kanit",
        /family=Montserrat:ital,wght@0,300;0,400;0,600;0,700;0,800;1,700;1,800/.test(html)
        && !/family=Kanit/.test(html));

    // statement: el encendido es continuo, letra a letra (script.js §6). En jsdom
    // el rect de la sección es 0 → el scroll la da por pasada entera y todas las
    // letras se quedan escritas a 1 (el barrido en sí se mide en test-statement.js).
    const statementSpans = [...doc.querySelectorAll("#statementText span")];
    const lit = statementSpans.filter((span) => span.style.getPropertyValue("--lit") === "1.000").length;
    check("statement letters lit on scroll calc", statementSpans.length > 40 && lit === statementSpans.length,
        `${lit}/${statementSpans.length} letters`);

    // menu toggle
    const burger = doc.getElementById("burger");
    check("burger markup matches legacy (type + aria-controls)",
        burger.getAttribute("type") === "button" && burger.getAttribute("aria-controls") === "menuOverlay");
    check("menu-open raises header above overlay so the two-line × stays visible",
        /body\.menu-open\s+\.site-header\s*\{[^}]*z-index:\s*900/.test(css));
    burger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    check("burger click opens menu", doc.body.classList.contains("menu-open")
        && burger.getAttribute("aria-expanded") === "true"
        && burger.getAttribute("aria-label") === "Close menu");
    doc.querySelector(".menu-links a").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    check("menu link click closes menu", !doc.body.classList.contains("menu-open")
        && doc.body.style.overflow === ""
        && burger.getAttribute("aria-label") === "Open menu");

    /* ── Cursor propio desactivado (29/09/2026): cruceta, punto y rollover fuera ── */
    const link = doc.querySelector(".work-row");
    link.dispatchEvent(new window.MouseEvent("mouseenter", { bubbles: false }));
    check("hover no enlarges any cursor", !doc.body.classList.contains("cursor-large"));
    link.dispatchEvent(new window.MouseEvent("mouseleave", { bubbles: false }));
    check("mouseleave keeps the body clean", !doc.body.classList.contains("cursor-large"));
    check("no cursor nodes left in the page",
        !/cursor-dot|cursor-ring|cursorDot|cursorRing/.test(html));
    check("no crosshair / dot / rollover rules left in styles.css",
        !/\.cursor-dot|\.cursor-ring|cursor-large/.test(css));
    check("script.js no wires the cursor any more",
        !/CURSOR_KEY|hfCursor|cursorDot|cursorRing|cursor-large/.test(js));

    // pista de scroll del hero con vídeo: fuera la etiqueta, línea de 3px (27/09/2026)
    const cue = doc.querySelector(".scroll-cue");
    check("SCROLL ya no aparece en el hero", cue.textContent.trim() === "");
    check("la pista sigue anunciándose a lectores de pantalla",
        cue.getAttribute("aria-label") === "Scroll to work" && cue.getAttribute("href") === "#work");
    check("la línea de la pista mide 3px (5px − 2px)", /\.scroll-cue-line \{\s*width: 3px;/.test(css));
    check("el destello verde lima de la línea sigue ahí", /\.scroll-cue-line::after \{[^}]*background: var\(--lime\);[^}]*animation: cueDrop/.test(css));
    check("el verde del cue deja un glow sutil al pasar",
        /\.scroll-cue::after \{[^}]*filter: blur\(5px\)/.test(css) && /@keyframes cueGlow/.test(css));

    // rotator: starts blank (no word active before/at load)
    const rots = [...doc.querySelectorAll("[data-rot]")];
    const activeIdx = () => rots.findIndex((r) => r.classList.contains("is-active"));
    const activeCount = () => rots.filter((r) => r.classList.contains("is-active")).length;
    check("rotator starts blank", activeCount() === 0);

    // rotator timing relative to body.loaded: 2s blank → 4s per word → loop without blank
    // wait for hero ready, then sample from that instant
    while (loadedAt === null) await wait(10);
    const at = async (ms) => { const d = loadedAt + ms - Date.now(); if (d > 0) await wait(d); };
    const seq = [];
    for (const t of [1000, 1800, 3000, 5800, 7000, 9800, 11000, 15000, 17800, 19000]) {
        await at(t); seq.push(activeCount() === 1 ? activeIdx() : (activeCount() === 0 ? "-" : "x"));
    }
    // expected: blank, blank, S, S, F, F, M, SY, SY, S(loop)
    check("rotator: 2s blank then 4s cycle, loops without blank",
        loadedAt !== null && seq.join(",") === "-,-,0,0,1,1,2,3,3,0", seq.join(","));

    // count-up: 1400ms animation triggered by IO stub
    const counts = [...doc.querySelectorAll("[data-count]")].map((el) => el.textContent);
    check("stats counted up to targets", counts[0] === "15" && counts[1] === "7",
        counts.join(", "));

    // ── hero log (trace de inferencia del modelo) ──
    const heroLog = doc.getElementById("heroLog");
    check("hero log: dentro del .hero, decorativo (aria-hidden) e ignora el ratón",
        !!heroLog && heroLog.parentElement === doc.querySelector(".hero") &&
        heroLog.getAttribute("aria-hidden") === "true" &&
        /\.hero-log\s*\{[^}]*pointer-events:\s*none/.test(css));
    const heroLogBlend = doc.querySelector(".hero-log-blend");
    check("hero log: capa de mezcla overlay independiente que tiñe el vídeo",
        !!heroLogBlend && heroLogBlend.parentElement === heroLog.parentElement &&
        heroLogBlend.nextElementSibling === heroLog &&
        /\.hero-log-blend\s*\{[^}]*background:\s*radial-gradient/.test(css) &&
        /\.hero-log-blend\s*\{[^}]*mix-blend-mode:\s*overlay/.test(css));
    check("hero log: sangrado por la derecha (right negativo) y recortado por el overflow del hero",
        /\.hero-log\s*\{[^}]*right:\s*calc\(-[\d.]+em - 40px\)/.test(css) &&
        /\.hero\s*\{[^}]*overflow:\s*hidden/.test(css));
    check("hero log: 40 px más a la derecha y fundido con el vídeo (mix-blend-mode: screen)",
        /\.hero-log\s*\{[^}]*mix-blend-mode:\s*screen/.test(css));
    check("hero log: opacidad 0.25 y monoespaciada de código (JetBrains/Fira/Roboto Mono/Courier)",
        /\.hero-log\s*\{[^}]*opacity:\s*0?\.25\b/.test(css) &&
        /--font-code:[^;]*"JetBrains Mono"[^;]*"Fira Code"[^;]*"Roboto Mono"[^;]*"Courier New"/.test(css) &&
        /\.hero-log\s*\{[^}]*font-family:\s*var\(--font-code\)/.test(css));
    check("hero log: sin rótulo 'TENSOR BUFFER' y con degradado izquierdo más amplio (calc(38% + 35px))",
        !/TENSOR BUFFER/.test(html) &&
        /\.hero-log\s*\{[^}]*mask-image:\s*linear-gradient\(to right,\s*transparent 0,\s*#000 calc\(38% \+ 35px\)\)/.test(css));
    check("DNAi: el rollover desplaza suavemente los títulos de los servicios",
        /\.service-body h3\s*\{[^}]*transform:\s*translateX\(0\)[^}]*transition:\s*transform\s+0\.7s\s+var\(--ease-out\),\s*color\s+0\.5s\s+var\(--ease-out\)/.test(css) &&
        /\.service-row:hover \.service-body h3\s*\{[^}]*transform:\s*translateX\(0\.8rem\)/.test(css));

    // DNAi: fuera los números entre paréntesis; el + de la derecha ocupa su sitio
    const serviceRows = [...doc.querySelectorAll(".service-row")];
    const servicesText = doc.getElementById("services").textContent;
    check("DNAi: siete apartados, sin números entre paréntesis ni .service-num",
        serviceRows.length === 7 && !doc.querySelector(".service-num")
        && !/\(\d\d\)/.test(servicesText) && !/\.service-num\s*\{/.test(css),
        `${serviceRows.length} apartados`);
    check("DNAi: un solo + por apartado, abriendo la fila y decorativo",
        serviceRows.every((row) => row.querySelectorAll(".service-plus").length === 1
            && row.firstElementChild.classList.contains("service-plus")
            && row.firstElementChild.textContent.trim() === "+"
            && row.firstElementChild.getAttribute("aria-hidden") === "true"));
    check("DNAi: el + conserva su animación (gira 135° y se vuelve lima al hover)",
        /\.service-row:hover \.service-plus\s*\{\s*transform:\s*rotate\(135deg\);\s*color:\s*var\(--lime\);\s*\}/.test(css)
        && /\.service-plus\s*\{[^}]*transition:\s*transform\s+0\.35s\s+var\(--ease-out\),\s*color\s+0\.5s\s+var\(--ease-out\)/.test(css));
    check("DNAi: rejilla de dos columnas y + visible también por debajo de 900px",
        /\.service-row\s*\{[^}]*grid-template-columns:\s*6rem 1fr;/.test(css)
        && /@media \(max-width: 900px\) \{[\s\S]*?\.service-row \{ grid-template-columns: 3\.5rem 1fr; \}/.test(css)
        && !/\.service-plus \{ display: none; \}/.test(css));
    check("hero log: ocupa el alto del hero, de debajo del ES/EN a la marquesina horizontal",
        /\.hero-log\s*\{[^}]*top:\s*var\(--header-h\)/.test(css) &&
        /\.hero-log\s*\{[^}]*bottom:\s*calc\(var\(--marquee-h\)/.test(css) &&
        /--header-h:\s*calc\(clamp\(41\.4px/.test(css) && /--marquee-h:\s*calc\(/.test(css) &&
        /\.log-body\s*\{[^}]*flex:\s*1/.test(css));
    check("hero log: el font-size se calcula para que quepa el trace (--log-fs)",
        /\.hero-log\s*\{[^}]*font-size:\s*var\(--log-fs/.test(css) &&
        /const FS_MIN = 6, FS_MAX = 11;/.test(js) &&
        /setProperty\("--log-fs"/.test(js) && /document\.fonts\.ready\.then\(fit\)/.test(js));
    // el trace se escribe en bucle: esperar a que la ventana esté llena
    for (let i = 0; i < 30 && !/NCCL MULTI-GPU/.test(heroLog.textContent); i++) await wait(400);
    const logLines = heroLog ? [...heroLog.querySelectorAll(".log-line")] : [];
    const logNums = heroLog ? [...heroLog.querySelectorAll(".log-num")] : [];
    check("hero log: pinta el trace completo con sus campos numéricos",
        logLines.length > 40 && logNums.length > 100 &&
        /LAYER \d+\/32/.test(heroLog.textContent) && /NCCL MULTI-GPU/.test(heroLog.textContent),
        `${logLines.length} líneas · ${logNums.length} campos`);
    check("hero log: el texto estructural se respeta (formas de tensor, IDs, ε = 1e-05, θ=10000)",
        /Q_Tensor \[1, 32, 128, 64\]/.test(heroLog.textContent) &&
        /#15496 \(" tensor"\)/.test(heroLog.textContent) &&
        /ε = 1e-05/.test(heroLog.textContent) && /θ=10000/.test(heroLog.textContent));
    // el bloque está vivo: dos muestras separadas 400 ms
    const logSnap = () => heroLog.querySelector(".log-body").textContent;
    const logBefore = logSnap();
    await wait(400);
    const logAfter = logSnap();
    check("hero log: los valores numéricos cambian a gran velocidad mientras se escribe",
        logAfter !== logBefore, logAfter === logBefore ? "sin cambios en 400 ms" : "cambiando");
    // invariante: en las líneas YA escritas solo cambian los números, nunca el
    // ancho de un campo (la línea en curso no cuenta: se está escribiendo)
    const widthsByLog = () => {
        const map = {};
        heroLog.querySelectorAll(".log-line.is-done").forEach((l) => { map[l.dataset.log] = l.textContent.length; });
        return map;
    };
    const wBefore = widthsByLog();
    await wait(400);
    const wAfter = widthsByLog();
    const sameWidth = Object.keys(wBefore).every((k) => wAfter[k] === undefined || wAfter[k] === wBefore[k]);
    check("hero log: solo cambian los números — el ancho de cada campo y la maquetación no se mueven",
        Object.keys(wBefore).length > 20 && sameWidth,
        `${Object.keys(wBefore).length} líneas escritas, anchos idénticos`);
    // sin franja: los números se mueven en todas las líneas ya escritas
    const doneSnap = [...heroLog.querySelectorAll(".log-line.is-done")].map((l) => l.textContent);
    await wait(400);
    const doneNow = [...heroLog.querySelectorAll(".log-line.is-done")].map((l) => l.textContent);
    const moved = doneSnap.filter((txt, i) => doneNow[i] !== undefined && txt !== doneNow[i]).length;
    check("hero log: los números cambian en todo el bloque escrito, sin depender de ninguna franja",
        moved > 3 && !/is-hot|is-head/.test(js) && !/is-hot|is-head/.test(css),
        `${moved} líneas cambiando en 400 ms`);
    check("hero log: se escribe carácter a carácter, con cursor al final de la línea activa",
        /const CHARS_MIN = 8, CHARS_VAR = 24;/.test(js) && /function typeChars/.test(js) &&
        /\.log-caret\s*\{[^}]*animation:\s*logCaret/.test(css) &&
        heroLog.querySelectorAll(".log-caret").length === 1 &&
        heroLog.querySelector(".log-caret").parentElement === heroLog.querySelectorAll(".log-line:not(.is-done)")[0],
        `cursor en ${heroLog.querySelector(".log-caret").parentElement ? "línea activa" : "ninguna"}`);
    const head0 = [...heroLog.querySelectorAll(".log-line")].slice(0, 5).map((l) => l.textContent).join("|");
    await wait(2500);
    const head1 = [...heroLog.querySelectorAll(".log-line")].slice(0, 5).map((l) => l.textContent).join("|");
    check("hero log: con la pantalla llena la información scrollea (ventana deslizante)",
        head0 !== head1 &&
        heroLog.querySelectorAll(".log-line").length === logLines.length &&
        /while \(lines\.length > maxLines\)/.test(js),
        `${logLines.length} líneas en ventana, la cabecera del bloque avanza`);
    check("hero log: degradado superior (más corto que el lateral) para fundir la cabecera",
        /\.log-body\s*\{[^}]*mask-image:\s*linear-gradient\(to bottom,\s*transparent 0,\s*#000 4\.5rem\)/.test(css) &&
        /\.hero-log\s*\{[^}]*mask-image:\s*linear-gradient\(to right,\s*transparent 0,\s*#000 calc\(38% \+ 35px\)\)/.test(css));
    check("hero log: ciclo de 5 s, rAF único y throttled a ~20 fps",
        /const CYCLE = 5000;/.test(js) && /const TICK = 50;/.test(js) &&
        /now - last < TICK/.test(js) && /requestAnimationFrame\(frame\)/.test(js));
    check("hero log: contadores de ciclo (capa, timestep, token, KV-cache) sobre el propio texto",
        /\{\{24:layer\}\}/.test(js) && /\{\{450:timestep\}\}/.test(js) &&
        /\{\{1025:token\}\}/.test(js) && /advanceCounters\(\)/.test(js));
    check("hero log: se detiene fuera de pantalla y con la pestaña oculta",
        /inView && !document\.hidden/.test(js) && /visibilitychange/.test(js) &&
        /cancelAnimationFrame\(raf\)/.test(js));
    check("hero log: quieto con reduced-motion y desplazado a la derecha en móvil",
        /@media \(prefers-reduced-motion: reduce\)[\s\S]*\*,\s*\*::before,\s*\*::after \{\s*animation-duration/.test(css) &&
        /@media \(max-width: 900px\)[\s\S]*\.hero-log,\s*\.hero-log-blend \{\s*right:\s*calc\(-24em - 40px\)/.test(css));
    check("hero log: sin caja, ni cabecera, ni pie — solo el trace flotando",
        !/log-head|log-foot|log-dot|log-bar|data-log-addr|data-log-cycle/.test(html) &&
        !/log-head|log-foot|log-dot|log-bar|@keyframes logPulse/.test(css) &&
        !/\.hero-log\s*\{[^}]*background:/.test(css) &&
        !/\.hero-log\s*\{[^}]*border:/.test(css) &&
        heroLog.children.length === 1 && heroLog.firstElementChild.hasAttribute("data-log-lines"));

    const preloaderInner = doc.querySelector(".preloader-inner");
    const preloaderBar = doc.querySelector(".preloader-bar");
    check("preloader countdown is centered in the screen with a vertical stack",
        /\.preloader\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center/.test(css) &&
        /\.preloader-inner\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*center/.test(css) &&
        doc.getElementById("preCount").parentElement === preloaderInner &&
        doc.getElementById("preCount").nextElementSibling === preloaderBar);
    check("preloader progress is a 20px by 2px gray track with a lime fill",
        /\.preloader-bar\s*\{[^}]*width:\s*20px;[^}]*height:\s*2px;[^}]*background:\s*var\(--muted\)/.test(css) &&
        /\.preloader-bar span\s*\{[^}]*background:\s*var\(--lime\)/.test(css));

    // preloader: ~3.2s of ticking to 100 + 260ms
    await wait(1500);
    check("preloader reached ~100%", parseInt(doc.getElementById("preCount").textContent, 10) > 85,
        "count=" + doc.getElementById("preCount").textContent);
    await wait(2500);
    check("body.loaded set after preload", doc.body.classList.contains("loaded"));
    check("preloader got .done", doc.getElementById("preloader").classList.contains("done"));

    check("no uncaught runtime errors", errors.length === 0, errors.join(" | "));

    console.log(failures === 0 ? "\n✅ ALL PASS" : `\n❌ ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
})();
