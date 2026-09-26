/* ═══════════════════════════════════════════════════════════
   HYPRFRAME — REDESIGN v2 · motion engine (vanilla JS)
   ═══════════════════════════════════════════════════════════ */
(() => {
    "use strict";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

    /* ── 1. Preloader ─────────────────────────────────────── */
    // Se reproduce una sola vez por sesión (ver el script del <head> de index.html):
    // al volver a la landing desde legacy.html / builder.html no se repite.
    const INTRO_KEY = "hfIntroSeen";
    const introSeen = document.documentElement.classList.contains("hf-skip-intro");
    const preloader = document.getElementById("preloader");
    const preCount = document.getElementById("preCount");
    const preBar = document.getElementById("preBar");

    const heroReadyCbs = [];
    let heroReady = false;
    function onHeroReady(cb) { heroReady ? cb() : heroReadyCbs.push(cb); }

    function finishPreload(withTransition) {
        if (withTransition && preloader) {
            preloader.classList.add("done");
            preloader.addEventListener("transitionend", () => preloader.remove(), { once: true });
        } else if (preloader) {
            preloader.remove(); // intro ya vista: fuera del DOM, sin transición
        }
        document.body.classList.add("loaded");
        heroReady = true;
        heroReadyCbs.splice(0).forEach((cb) => cb());
    }

    if (introSeen) {
        finishPreload(false);
    } else {
        try { sessionStorage.setItem(INTRO_KEY, "1"); } catch (e) { /* storage no disponible */ }

        if (reduced) {
            finishPreload(true);
        } else {
            let n = 0;
            const started = performance.now();
            const MIN_DURATION = 900; // ms — keeps the intro legible even on cache hits
            const tick = setInterval(() => {
                // ease-out curve toward 100
                n += Math.max(1, Math.round((100 - n) * 0.06));
                if (n >= 100 && performance.now() - started >= MIN_DURATION) {
                    n = 100;
                    clearInterval(tick);
                    preCount.textContent = "100";
                    preBar.style.width = "100%";
                    setTimeout(() => finishPreload(true), 260);
                } else {
                    preCount.textContent = n;
                    preBar.style.width = n + "%";
                }
            }, 40);
        }
    }

    /* ── 2. Custom cursor ─────────────────────────────────── */
    const dot = document.getElementById("cursorDot");
    const ring = document.getElementById("cursorRing");

    if (!isTouch && !reduced && dot && ring) {
        let mx = innerWidth / 2, my = innerHeight / 2;
        let rx = mx, ry = my;

        addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });

        (function cursorLoop() {
            rx += (mx - rx) * 0.16;
            ry += (my - ry) * 0.16;
            dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
            ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
            requestAnimationFrame(cursorLoop);
        })();

        document.querySelectorAll("a, button, .service-row, input, textarea").forEach((el) => {
            el.addEventListener("mouseenter", () => document.body.classList.add("cursor-large"));
            el.addEventListener("mouseleave", () => document.body.classList.remove("cursor-large"));
        });
    }

    /* ── 3. Header state + scroll progress ────────────────── */
    const header = document.getElementById("siteHeader");
    const progress = document.getElementById("scrollProgress");

    function onScroll() {
        header.classList.toggle("scrolled", scrollY > 40);
        const max = document.documentElement.scrollHeight - innerHeight;
        progress.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";
    }
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    /* ── 4. Hero marquee: keep both halves wider than the viewport ── */
    const heroMarquee = document.querySelector(".hero-marquee");
    const marqueeTrack = heroMarquee && heroMarquee.querySelector(".marquee-track");
    if (marqueeTrack && marqueeTrack.firstElementChild) {
        const segment = marqueeTrack.firstElementChild.cloneNode(true);
        let copiesPerHalf = 1; // the HTML starts with two identical segments

        function sizeHeroMarquee() {
            const segmentWidth = marqueeTrack.firstElementChild.getBoundingClientRect().width;
            const viewportWidth = heroMarquee.clientWidth;
            if (!segmentWidth || !viewportWidth) return;

            // translateX(-50%) must land on an identical half. One segment may be
            // narrower than the screen, so fill each half before duplicating it.
            const needed = Math.ceil(viewportWidth / segmentWidth) + 1;
            if (needed === copiesPerHalf) return;
            marqueeTrack.replaceChildren(...Array.from(
                { length: needed * 2 }, () => segment.cloneNode(true)
            ));
            copiesPerHalf = needed;
            // Keep the speed per segment unchanged as the track grows.
            marqueeTrack.style.animationDuration = `${28 * needed}s`;
        }

        sizeHeroMarquee();
        addEventListener("resize", sizeHeroMarquee);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(sizeHeroMarquee).catch(() => {});
        }
    }

    /* ── 5. Reveal on scroll (generic) ────────────────────── */
    const revealIO = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
        }),
        { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => revealIO.observe(el));

    /* line-mask reveals on section titles */
    const lineIO = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add("in"); lineIO.unobserve(e.target); }
        }),
        { threshold: 0.3 }
    );
    document.querySelectorAll(".section-title, .about-title, .contact-title").forEach((el) => {
        el.classList.add("reveal-lines");
        lineIO.observe(el);
    });

    /* ── 6. Hero word rotator ─────────────────────────────── */
    // Timing: hero visible → 2 s blank → each word 4 s → loop (no further blank).
    // Motion: words only ever travel upward — the outgoing one exits through the
    // top (0.8 s, ease-out), the incoming one snaps up from below and settles with
    // a subtle overshoot (0.2 s, --ease-back: ~4.3 % of the travel above the
    // resting spot at ~98 ms, back in place by ~174 ms). Every reset back to the
    // resting spot is applied with the transition disabled, so nothing is ever seen
    // moving downwards through the visible gap.
    const rotItems = [...document.querySelectorAll("[data-rot]")];
    const ROT_INITIAL_DELAY = 2000;
    const ROT_INTERVAL = 4000;
    const ROT_EXIT_MS = 800; // must match the exit transition of .rotator-item in styles.css
    if (rotItems.length && reduced) {
        rotItems.forEach((el, i) => el.classList.toggle("is-active", i === 0));
    } else if (rotItems.length) {
        let idx = -1; // -1 = blank (no word shown yet)
        const advance = () => {
            const current = idx >= 0 ? rotItems[idx] : null;
            idx = (idx + 1) % rotItems.length;
            const next = rotItems[idx];
            if (current) {
                current.classList.remove("is-active");
                current.classList.add("is-above"); // exits upward (0 → -110%)
                setTimeout(() => {
                    current.style.transition = "none";
                    current.classList.remove("is-above"); // snap below, no animation
                    void current.offsetWidth;
                    current.style.transition = "";
                }, ROT_EXIT_MS + 100);
            }
            next.style.transition = "none";
            next.classList.remove("is-above"); // snap to the resting spot below…
            void next.offsetWidth; // reflow so the entering word starts below
            next.style.transition = "";
            next.classList.add("is-active"); // …then rises from below (+110% → 0)
        };
        onHeroReady(() => {
            setTimeout(() => {
                advance();
                setInterval(advance, ROT_INTERVAL);
            }, ROT_INITIAL_DELAY);
        });
    }

    /* ── 6b. Auto-fit: guarantee the longest rotating word is never clipped ── */
    const heroTitle = document.querySelector(".hero-title");
    const rotViewport = document.querySelector(".rotator-viewport");

    function fitHeroTitle() {
        if (!heroTitle || !rotViewport) return;
        heroTitle.style.fontSize = ""; // reset to the CSS clamp
        const need = rotViewport.scrollWidth;
        const avail = rotViewport.clientWidth;
        if (need > avail + 1 && avail > 0) {
            const base = parseFloat(getComputedStyle(heroTitle).fontSize) || 0;
            if (base) heroTitle.style.fontSize = base * (avail / need) * 0.98 + "px";
        }
    }
    fitHeroTitle();
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(fitHeroTitle).catch(() => {});
    }
    let fitTicking = false;
    addEventListener("resize", () => {
        if (!fitTicking) {
            fitTicking = true;
            requestAnimationFrame(() => { fitHeroTitle(); fitTicking = false; });
        }
    });

    /* ── 7. Statement: word-by-word light-up on scroll ────── */
    const statement = document.getElementById("statementText");
    if (statement) {
        const words = [...statement.querySelectorAll("span")];
        const section = statement.closest("section");
        let ticking = false;

        function lightWords() {
            const rect = section.getBoundingClientRect();
            const start = innerHeight * 0.85;
            const end = innerHeight * 0.25;
            const total = start - end;
            const done = Math.min(Math.max((start - rect.top) / (total + rect.height * 0.35), 0), 1);
            words.forEach((w, i) => {
                w.classList.toggle("lit", done * words.length > i);
            });
            ticking = false;
        }
        addEventListener("scroll", () => {
            if (!ticking) { requestAnimationFrame(lightWords); ticking = true; }
        }, { passive: true });
        lightWords();
    }

    /* ── 8. Work rows: floating follower image ────────────── */
    const follower = document.getElementById("workFollower");
    const followerImg = document.getElementById("workFollowerImg");
    const rows = [...document.querySelectorAll(".work-row")];

    // inyecta el fotograma de cada proyecto como variable CSS de su fila
    rows.forEach((row) => row.style.setProperty("--img", `url("${row.dataset.img}")`));

    if (follower && followerImg && rows.length && !isTouch && !reduced) {
        let fx = innerWidth / 2, fy = innerHeight / 2;   // follower position (lerped)
        let tx = fx, ty = fy;                            // target (mouse)
        let followerActive = false;

        rows.forEach((row) => {
            row.addEventListener("mouseenter", () => {
                followerImg.src = row.dataset.img;
                follower.classList.add("visible");
                followerActive = true;
            });
            row.addEventListener("mouseleave", () => {
                follower.classList.remove("visible");
                followerActive = false;
            });
        });

        addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });

        (function followerLoop() {
            fx += (tx - fx) * 0.1;
            fy += (ty - fy) * 0.1;
            if (followerActive) {
                follower.style.left = fx + "px";
                follower.style.top = fy + "px";
            }
            requestAnimationFrame(followerLoop);
        })();

        // preload all hover images so swaps are instant
        rows.forEach((r) => { const i = new Image(); i.src = r.dataset.img; });
    }

    /* ── 9. Stats count-up ────────────────────────────────── */
    document.querySelectorAll("[data-count]").forEach((el) => {
        const target = parseInt(el.dataset.count, 10);
        const io = new IntersectionObserver((entries) => {
            if (!entries[0].isIntersecting) return;
            io.disconnect();
            if (reduced) { el.textContent = target; return; }
            const dur = 1400;
            const t0 = performance.now();
            (function step(now) {
                const p = Math.min((now - t0) / dur, 1);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(target * eased);
                if (p < 1) requestAnimationFrame(step);
            })(t0);
        }, { threshold: 0.6 });
        io.observe(el);
    });

    /* ── 10. Magnetic elements ────────────────────────────── */
    if (!isTouch && !reduced) {
        document.querySelectorAll(".magnetic").forEach((el) => {
            el.addEventListener("mousemove", (e) => {
                const r = el.getBoundingClientRect();
                const dx = e.clientX - (r.left + r.width / 2);
                const dy = e.clientY - (r.top + r.height / 2);
                el.style.transform = `translate(${dx * 0.25}px, ${dy * 0.35}px)`;
                el.style.transition = "transform 0.15s ease-out";
            });
            el.addEventListener("mouseleave", () => {
                el.style.transform = "";
                el.style.transition = "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)";
            });
        });
    }

    /* ── 11. Fullscreen menu ──────────────────────────────── */
    const burger = document.getElementById("burger");
    const overlay = document.getElementById("menuOverlay");

    function toggleMenu(force) {
        const open = force !== undefined ? force : !document.body.classList.contains("menu-open");
        document.body.classList.toggle("menu-open", open);
        burger.setAttribute("aria-expanded", String(open));
        burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        overlay.setAttribute("aria-hidden", String(!open));
        document.body.style.overflow = open ? "hidden" : "";
    }
    burger.addEventListener("click", () => toggleMenu());
    overlay.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => toggleMenu(false)));
    addEventListener("keydown", (e) => { if (e.key === "Escape") toggleMenu(false); });
})();
