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
    // Motion: the outgoing word briefly anticipates downward, then exits through
    // the top; the incoming word rises from below and settles with an overshoot.
    // Resets back below are applied with the transition disabled and no active
    // animation, so the reset itself is never visible.
    const rotItems = [...document.querySelectorAll("[data-rot]")];
    const ROT_INITIAL_DELAY = 2000;
    const ROT_INTERVAL = 4000;
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
                }, 900); // reset after the 0.8 s transition finishes
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

    /* ── 6c. Hero hexdump: tensor buffer ──────────────────── */
    // Volcado de memoria en hex sangrado por la derecha del hero (ver
    // .hero-hexdump en styles.css). Ocupa el alto del hero de arriba abajo
    // (debajo del ES/EN de la cabecera → marquesina horizontal del fondo) y el
    // número de filas se mide en caliente para rellenar ese hueco.
    //
    // Un "cabezal de escritura" recorre las filas en ciclos de 5 s: las filas
    // dentro de la banda se reescriben con bytes aleatorios a ~20 fps y, cuando
    // el cabezal pasa de largo, la fila vuelve a sus bytes base. Así el bloque
    // siempre es legible (el relleno es vocabulario de marca en ASCII) y el
    // bucle no tiene ningún salto visible al reiniciar.
    //
    // Render:
    // · un único rAF compartido, throttled a 20 fps (TICK): a 60 fps no se
    //   aprecia más y se comería el presupuesto de frame del scroll.
    // · solo se tocan las filas de la banda y solo su textContent: cada celda
    //   mide lo mismo en `ch`, así que no hay reflow ni repaint de más.
    // · la barra de ciclo va con transform: scaleX() (compositor) en vez de
    //   width, y el contador de ciclo solo escribe cuando cambia.
    // · se para solo (IntersectionObserver + visibilitychange) cuando el panel
    //   sale de pantalla o la pestaña se oculta: cero trabajo en background.
    // · con prefers-reduced-motion se pintan los bytes base una vez y no arranca.
    const hexdump = document.getElementById("heroHexdump");

    if (hexdump) {
        const BYTES = 8;            // bytes por fila (pares hex)
        const CYCLE = 5000;         // ms — duración de un barrido completo
        const TICK = 50;            // ms entre repintados (~20 fps)
        // El alto lo marca el CSS, no el número de filas: se miden en caliente
        // y se acotan para pantallas diminutas, para cuando no hay layout
        // (jsdom, panel oculto en móvil) y para no disparar el coste por frame.
        const ROWS_MIN = 8, ROWS_FALLBACK = 14, ROWS_MAX = 64;
        const HEX = "0123456789ABCDEF";
        // Relleno: vocabulario de marca en ASCII reciclado por filas, así entre
        // barridos se lee algo con sentido en la columna de la derecha.
        const SEED = "HYPRFRAME TENSOR LATENT DIFFUSION SYNTHESIS VISION MACHINE ";

        const rowsEl = hexdump.querySelector("[data-hex-rows]");
        const addrEl = hexdump.querySelector("[data-hex-addr]");
        const cycleEl = hexdump.querySelector("[data-hex-cycle]");
        const barEl = hexdump.querySelector("[data-hex-bar]");

        const hex2 = (v) => HEX[(v >> 4) & 15] + HEX[v & 15];
        const hex4 = (v) => "0x" + hex2((v >> 8) & 255) + hex2(v & 255);
        const ascii = (v) => (v > 31 && v < 127 ? String.fromCharCode(v) : ".");

        if (rowsEl) {
            let ROWS = 0;           // filas actuales del volcado
            let BAND = 3;           // filas simultáneas dentro de la banda
            let base = [];          // bytes "en reposo" de cada fila
            let state = [];         // bytes actuales (= base salvo en la banda)
            let rowEls = [];
            let cellEls = [];
            let asciiEls = [];
            let dirty = [];         // fila pendiente de restaurar a sus bytes base

            // Escribe una fila entera (bytes + columna de valores) solo si cambia.
            // La columna derecha va entre barras, como en un hexdump de verdad.
            function paintRow(r) {
                const vals = state[r];
                let text = "|";
                for (let b = 0; b < BYTES; b++) {
                    const hex = hex2(vals[b]);
                    if (cellEls[r][b].textContent !== hex) cellEls[r][b].textContent = hex;
                    text += ascii(vals[b]);
                }
                text += "|";
                if (asciiEls[r].textContent !== text) asciiEls[r].textContent = text;
            }

            // (Re)construye el listado con `n` filas. La banda crece con el
            // bloque para que el barrido tarde lo mismo con 14 filas que con 40.
            function build(n) {
                ROWS = n;
                // ~18% del listado: con 20 filas son 4, con 45 son 8. Mantiene
                // el barrido de 5 s y acota el trabajo por frame.
                BAND = Math.max(3, Math.round(n * 0.18));
                base = []; state = []; rowEls = []; cellEls = []; asciiEls = []; dirty = [];
                const frag = document.createDocumentFragment();
                for (let r = 0; r < n; r++) {
                    const row = [];
                    for (let b = 0; b < BYTES; b++) {
                        row.push(SEED.charCodeAt((r * BYTES + b) % SEED.length) & 255);
                    }
                    base.push(row);
                    state.push(row.slice());

                    const rowEl = document.createElement("div");
                    rowEl.className = "hex-row";
                    const offEl = document.createElement("span");
                    offEl.className = "hex-off";
                    offEl.textContent = hex4(r * BYTES);
                    const bytesEl = document.createElement("span");
                    bytesEl.className = "hex-bytes";
                    const cells = [];
                    for (let b = 0; b < BYTES; b++) {
                        const cell = document.createElement("span");
                        cell.className = "hex-byte";
                        bytesEl.appendChild(cell);
                        cells.push(cell);
                    }
                    const asciiEl = document.createElement("span");
                    asciiEl.className = "hex-ascii";
                    rowEl.appendChild(offEl);
                    rowEl.appendChild(bytesEl);
                    rowEl.appendChild(asciiEl);
                    frag.appendChild(rowEl);

                    rowEls.push(rowEl);
                    cellEls.push(cells);
                    asciiEls.push(asciiEl);
                    dirty.push(false);
                }
                rowsEl.textContent = "";
                rowsEl.appendChild(frag);
                for (let r = 0; r < n; r++) paintRow(r);
            }

            // Alto de una fila medido con una fila sonda (no depende de cuántas
            // haya ya puestas), y alto disponible: el cuerpo es flex:1 dentro de
            // un panel con top/bottom fijos, así que clientHeight ya es el hueco.
            function measureRowHeight() {
                const probe = document.createElement("div");
                probe.className = "hex-row";
                probe.innerHTML =
                    '<span class="hex-off">0x0000</span><span class="hex-bytes"></span>' +
                    '<span class="hex-ascii">|........|</span>';
                rowsEl.appendChild(probe);
                const h = probe.getBoundingClientRect().height;
                rowsEl.removeChild(probe);
                return h;
            }

            function fit() {
                const h = measureRowHeight();
                // clientHeight incluiría el padding y el hueco útil es el del
                // contenido: se resta para que la última fila no quede a medias.
                const cs = getComputedStyle(rowsEl);
                const avail = rowsEl.getBoundingClientRect().height
                    - (parseFloat(cs.paddingTop) || 0)
                    - (parseFloat(cs.paddingBottom) || 0);
                const n = (h > 0 && avail > 0)
                    ? Math.min(ROWS_MAX, Math.max(ROWS_MIN, Math.floor(avail / h)))
                    : ROWS_FALLBACK;
                if (n !== ROWS) build(n);
            }

            fit();
            // la altura cambia al cargar la monoespaciada y al redimensionar
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(fit).catch(() => {});
            }
            let hexFitTicking = false;
            addEventListener("resize", () => {
                if (!hexFitTicking) {
                    hexFitTicking = true;
                    requestAnimationFrame(() => { fit(); hexFitTicking = false; });
                }
            });

            if (!reduced) {
                let raf = 0, running = false, inView = false;
                let elapsed = 0, t0 = 0, last = 0, cycle = -1;

                function frame(now) {
                    raf = requestAnimationFrame(frame);
                    if (now - last < TICK) return;
                    last = now;

                    elapsed = now - t0;
                    const p = (elapsed % CYCLE) / CYCLE;
                    const span = ROWS + BAND;       // recorrido del cabezal
                    const head = -BAND + p * span;  // fila por la que va
                    const from = Math.max(0, Math.ceil(head - BAND));
                    const to = Math.min(ROWS - 1, Math.floor(head));

                    for (let r = 0; r < ROWS; r++) {
                        const hot = r >= from && r <= to;
                        rowEls[r].classList.toggle("is-hot", hot);
                        rowEls[r].classList.toggle("is-head", hot && r === to);
                        if (!hot) {
                            // el cabezal ya pasó: la fila vuelve a sus bytes base
                            if (dirty[r]) {
                                state[r] = base[r].slice();
                                paintRow(r);
                                dirty[r] = false;
                            }
                            continue;
                        }
                        dirty[r] = true;
                        // la fila del cabezal se reescribe entera; la estela,
                        // solo un par de bytes, para que el ruido no sea plano
                        const n = r === to ? BYTES : 1 + ((Math.random() * 3) | 0);
                        for (let k = 0; k < n; k++) {
                            state[r][(Math.random() * BYTES) | 0] = (Math.random() * 256) | 0;
                        }
                        paintRow(r);
                    }

                    if (barEl) barEl.style.transform = "scaleX(" + p.toFixed(3) + ")";
                    if (addrEl) {
                        const addr = hex4(Math.max(0, to) * BYTES);
                        if (addrEl.textContent !== addr) addrEl.textContent = addr;
                    }
                    const c = Math.floor(elapsed / CYCLE);
                    if (c !== cycle) {
                        cycle = c;
                        if (cycleEl) cycleEl.textContent = "CYCLE " + String(c % 1000).padStart(3, "0");
                    }
                }

                function start() {
                    if (running) return;
                    running = true;
                    t0 = performance.now() - elapsed;  // se reanuda donde estaba
                    last = 0;
                    raf = requestAnimationFrame(frame);
                }
                function stop() {
                    if (!running) return;
                    running = false;
                    cancelAnimationFrame(raf);
                }

                const io = new IntersectionObserver((entries) => {
                    inView = entries[0].isIntersecting;
                    if (inView && !document.hidden) start();
                    else stop();
                }, { threshold: 0 });

                document.addEventListener("visibilitychange", () => {
                    if (document.hidden) stop();
                    else if (inView) start();
                });

                onHeroReady(() => io.observe(hexdump)); // ni un frame tras el preloader
            }
        }
    }

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
