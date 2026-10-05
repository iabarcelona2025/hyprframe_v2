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
    // ?intro=1 (y el preview de desarrollo) piden la intro expresamente, así que
    // también se salta el atajo de «reducir movimiento»: quien la pide, la ve.
    const introForced = document.documentElement.classList.contains("hf-force-intro");
    const preloader = document.getElementById("preloader");
    const preCount = document.getElementById("preCount");

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

        if (reduced && !introForced) {
            finishPreload(true);
        } else {
            let n = 0;
            const started = performance.now();
            const MIN_DURATION = 900; // ms — keeps the intro legible even on cache hits
            // La curva tarda 46 pasos: 46 × 28 ms = 1,29 s; solo avanza el contador.
            const TICK_MS = 28;
            const tick = setInterval(() => {
                // ease-out curve toward 100
                n += Math.max(1, Math.round((100 - n) * 0.06));
                // Fade out both orbit triangles ~0.3s before the counter reaches 100.
                if (n >= 90 && preloader) preloader.classList.add("triangles-fading");
                if (n >= 100 && performance.now() - started >= MIN_DURATION) {
                    n = 100;
                    clearInterval(tick);
                    preCount.textContent = "100";
                    if (preloader) preloader.classList.add("is-complete");
                    setTimeout(() => finishPreload(true), 260);
                } else {
                    preCount.textContent = n;
                }
            }, TICK_MS);
        }
    }

    /* ── 2. Header state + scroll position ───────────────── */
    const header = document.getElementById("siteHeader");
    let scrollMax = 0;

    function measureScrollMax() {
        scrollMax = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    }

    let scrollTicking = false;
    function onScroll() {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
            scrollTicking = false;
            header.classList.toggle("scrolled", scrollY > 40);
        });
    }

    measureScrollMax();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", measureScrollMax);
    if (window.ResizeObserver) new ResizeObserver(measureScrollMax).observe(document.body);
    addEventListener("load", measureScrollMax);
    onScroll();

    /* ── 2b. Nav activo: el apartado en el que estás se ilumina ── */
    // Solo escritorio: a ≤1024px el .main-nav se cambia por el burger, así que
    // no hay nada que iluminar. Solo cuenta los enlaces internos de esta
    // página —«Captured» apunta a legacy.html y allí se marca con
    // aria-current="page"—. El estado se escribe con el mismo atributo
    // aria-current que ya usa legacy.css, y las posiciones se cachean (se
    // recalculan al redimensionar y cuando el documento cambia de tamaño, igual
    // que scrollMax) para no leer el layout en cada frame de scroll.
    const navDesktop = window.matchMedia("(min-width: 1025px)");
    const NAV_LINE = 0.35;   // fracción de la ventana donde se considera «estás aquí»
    const navItems = [];
    {
        const docKey = (ruta) => ruta.replace(/index\.html$/, "").replace(/\/$/, "");
        document.querySelectorAll(".main-nav a[href]").forEach((link) => {
            const href = link.getAttribute("href") || "";
            const hashAt = href.indexOf("#");
            if (hashAt === -1) return;
            const url = new URL(link.href, location.href);
            // Mismo documento que este (index.html y / son la misma página).
            if (docKey(url.pathname) !== docKey(location.pathname) || url.search !== location.search) return;
            const section = document.getElementById(href.slice(hashAt + 1));
            if (section) navItems.push({ link, section, top: 0 });
        });
    }
    let navActive = null;
    let navClicked = null;     // enlace pulsado, mientras la inercia va hacia él
    let navClickedTimer = 0;

    function measureNav() {
        navItems.forEach((item) => { item.top = item.section.getBoundingClientRect().top + scrollY; });
        navItems.sort((a, b) => a.top - b.top);   // por si cambia el orden del HTML
    }

    function lightNav(item) {
        if (item === navActive) return;
        if (navActive) navActive.link.removeAttribute("aria-current");
        navActive = item;
        if (item) item.link.setAttribute("aria-current", "location");
    }

    function updateActiveNav() {
        if (!navDesktop.matches) {           // móvil/tablet: el nav no se ve
            navClicked = null;
            clearTimeout(navClickedTimer);
            lightNav(null);
            return;
        }
        if (!navItems.length) return;
        // El apartado se enciende cuando su inicio cruza la línea (un 35% de la
        // ventana): entonces ya ocupa la mayor parte de la vista y su título está
        // a la vista. Al final del documento manda el último, para que un
        // apartado corto (Contact) también se encienda.
        const line = scrollY + innerHeight * NAV_LINE;
        let found = null;
        for (const item of navItems) if (item.top <= line) found = item;
        if (scrollMax > 0 && scrollY >= scrollMax - 1) found = navItems[navItems.length - 1];
        // Un clic manda hasta que su destino llega a la línea: así el resaltado no
        // parpadea por todos los apartados que se cruzan de camino.
        if (navClicked === found) {
            navClicked = null;
            clearTimeout(navClickedTimer);
        }
        lightNav(navClicked || found);
    }

    navItems.forEach((item) => {
        item.link.addEventListener("click", () => {
            lightNav(item);
            navClicked = item;
            clearTimeout(navClickedTimer);
            // Red de seguridad: si el destino no llega a cruzar la línea (o algo
            // lo deja a medio camino), a los 2 s vuelve a mandar la posición.
            navClickedTimer = setTimeout(() => { navClicked = null; updateActiveNav(); }, 2000);
        });
    });

    // Si el usuario toma el mando (rueda, teclado, táctil), deja de mandar el clic.
    ["wheel", "touchstart", "keydown"].forEach((type) => addEventListener(type, () => {
        if (!navClicked) return;
        navClicked = null;
        clearTimeout(navClickedTimer);
        updateActiveNav();
    }, { passive: true }));

    // Un rAF por frame, como el resto del scroll de la página.
    let navTicking = false;
    addEventListener("scroll", () => {
        if (navTicking) return;
        navTicking = true;
        requestAnimationFrame(() => { navTicking = false; updateActiveNav(); });
    }, { passive: true });
    const remeasureNav = () => { measureNav(); updateActiveNav(); };
    addEventListener("resize", remeasureNav);
    addEventListener("load", remeasureNav);
    if (window.ResizeObserver) new ResizeObserver(remeasureNav).observe(document.body);
    if (navDesktop.addEventListener) navDesktop.addEventListener("change", updateActiveNav);
    else if (navDesktop.addListener) navDesktop.addListener(updateActiveNav);

    measureNav();
    updateActiveNav();

    /* ── 3. Hero marquee: keep both halves wider than the viewport ── */
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

    /* ── 4. Reveal on scroll (generic) ────────────────────── */
    const revealIO = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
        }),
        { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }
    );
    document.querySelectorAll("[data-reveal]:not([data-reveal-late])").forEach((el) => revealIO.observe(el));

    /* About stats wait until they are farther into the viewport, so the user
       has to continue scrolling down before the counters animate in. */
    const lateRevealMargin = Math.round(window.innerHeight * 0.28);
    const lateRevealIO = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add("in"); lateRevealIO.unobserve(e.target); }
        }),
        { threshold: 0.18, rootMargin: `0px 0px -${lateRevealMargin}px 0px` }
    );
    document.querySelectorAll("[data-reveal-late]").forEach((el) => lateRevealIO.observe(el));

    /* line-mask reveals on section titles */
    const workSection = document.getElementById("work");
    const workTitle = workSection && workSection.querySelector(".section-title");
    let onWorkTitleReveal = () => {};
    const aboutTitle = document.querySelector(".about-title");
    const aboutEmblem = document.querySelector(".about-emblem-wrap");
    const lineIO = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
            if (e.isIntersecting) {
                e.target.classList.add("in");
                if (e.target === workTitle) onWorkTitleReveal();
                if (e.target === aboutEmblem && aboutTitle) {
                    aboutTitle.classList.add("in");
                }
                lineIO.unobserve(e.target);
            }
        }),
        { threshold: 0.3 }
    );
    document.querySelectorAll(".section-title, .about-title, .contact-title").forEach((el) => {
        el.classList.add("reveal-lines");
        lineIO.observe(el);
    });
    if (aboutEmblem) lineIO.observe(aboutEmblem);

    /* WORK title: on desktop and mobile, wait for its final line to finish
       sliding in, then immediately cascade ALL rows in sequence — the row
       entrance begins right when the WORK title animation ends, without
       waiting for the list to reach the viewport. Check the untransformed
       list (not rows translated offscreen in 3D). */
    if (!reduced && workSection && workTitle) {
        const workRows = [...workSection.querySelectorAll(".work-row")];
        const lastTitleLine = workTitle.querySelector(".line:last-child .line-inner");
        if (workRows.length && lastTitleLine) {
            let titleFinished = false;
            let firstRowReached = false;
            let nextRow = 0;
            let revealTimer = null;
            let titleRevealStarted = false;

            function revealNextRow() {
                revealTimer = null;
                if (!titleFinished || !firstRowReached || nextRow >= workRows.length) return;
                workRows[nextRow++].classList.add("work-row-visible");
                if (nextRow < workRows.length) {
                    revealTimer = setTimeout(revealNextRow, 105);
                } else {
                    removeEventListener("scroll", onWorkScroll);
                    removeEventListener("resize", onWorkScroll);
                }
            }

            const workList = workSection.querySelector(".work-list");
            function updateReachedRows() {
                // The list has no entrance transform, unlike its rows. Once its
                // top reaches the viewport, play the complete cascade.
                if (workList.getBoundingClientRect().top <= innerHeight * 0.96) firstRowReached = true;
                // A direct anchor jump may skip the heading entirely; and on
                // short viewports the title may never meet its IO threshold.
                // Either way, no row must remain invisible indefinitely.
                if (firstRowReached && !workTitle.classList.contains("in")) {
                    if (workTitle.getBoundingClientRect().bottom < 0) {
                        titleFinished = true;
                    } else {
                        workTitle.classList.add("in");
                        onWorkTitleReveal();
                    }
                }
                if (!revealTimer) revealNextRow();
            }
            let workScrollTicking = false;
            function onWorkScroll() {
                if (workScrollTicking) return;
                workScrollTicking = true;
                requestAnimationFrame(() => {
                    workScrollTicking = false;
                    updateReachedRows();
                });
            }

            onWorkTitleReveal = () => {
                if (titleRevealStarted || titleFinished) return;
                titleRevealStarted = true;
                const finishTitle = () => {
                    if (titleFinished) return;
                    titleFinished = true;
                    // Start the row cascade immediately when the WORK title
                    // animation ends — don't wait for the list to scroll into
                    // view, so the rows begin entering right as WORK finishes.
                    firstRowReached = true;
                    updateReachedRows();
                };
                lastTitleLine.addEventListener("transitionend", (event) => {
                    if (event.target === lastTitleLine && event.propertyName === "transform") finishTitle();
                }, { once: true });
                // Safety net if the transition is interrupted: 1s + 0.17s
                // delay for the second line, with a little breathing room.
                setTimeout(finishTitle, 1250);
            };
            workSection.classList.add("work-3d-ready");
            addEventListener("scroll", onWorkScroll, { passive: true });
            addEventListener("resize", onWorkScroll);
            updateReachedRows();
            if (workTitle.classList.contains("in")) onWorkTitleReveal();
        }
    }

    /* El anagrama vuelve a ocultarse bajo la plancha al seguir bajando por
       About; al subir de nuevo, se desliza otra vez hacia fuera. */
    if (!reduced && aboutTitle && aboutEmblem) {
        let previousScrollY = window.scrollY;
        const updateEmblemForScroll = () => {
            const currentScrollY = window.scrollY;
            const emblemTop = Math.max(
                aboutTitle.getBoundingClientRect().top,
                aboutEmblem.getBoundingClientRect().top
            );
            const coverThreshold = 0;
            const revealThreshold = -80;

            if (currentScrollY > previousScrollY && (aboutTitle.classList.contains("in") || aboutEmblem.classList.contains("in")) && emblemTop <= coverThreshold) {
                aboutEmblem.classList.add("is-covered");
            } else if (currentScrollY < previousScrollY && emblemTop > revealThreshold) {
                aboutEmblem.classList.remove("is-covered");
            }
            previousScrollY = currentScrollY;
        };
        window.addEventListener("scroll", updateEmblemForScroll, { passive: true });
    }

    /* ── 5. Hero word rotator ─────────────────────────────── */
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

    /* ── 6c. Hero: log de inferencia del modelo ───────────── */
    // Terminal de inferencia a la derecha del hero: el trace se ESCRIBE solo,
    // carácter a carácter y en bucle, como si el modelo estuviera escupiendo su
    // traza por consola.
    //
    // · Fase de llenado: arranca vacío y va escribiendo líneas hacia abajo.
    // · Pantalla llena: al llegar al final del panel, cada línea nueva empuja
    //   la más vieja fuera del DOM (ventana deslizante) → el bloque se queda
    //   lleno y la información sigue fluyendo, como un terminal de verdad.
    // · Sin franja ni barrido: el único foco es el cursor, que parpadea al
    //   final de la línea que se está escribiendo ahora mismo.
    // · Los números de las líneas ya escritas siguen cambiando (CHURN).
    // · El texto es literal y los campos numéricos conservan el ancho y los
    //   decimales del original, así que la maquetación nunca baila.
    // · Un único rAF throttled escribiendo sobre nodos de texto (node.data, no
    //   textContent), se para fuera de pantalla, y con prefers-reduced-motion
    //   pinta el bloque ya escrito y quieto.
    const heroLog = document.getElementById("heroLog");

    if (heroLog) {
        const CYCLE = 5000;      // ms — los contadores avanzan una vez por ciclo
        const TICK = 50;         // ms entre pasos de escritura (~20 fps)
        const LEAD = 1.3;        // line-height, el mismo que en el CSS
        const FS_MIN = 6, FS_MAX = 11;
        const CHARS_MIN = 8, CHARS_VAR = 24;   // caracteres por paso (8-32)
        const CHURN = 0.45;      // fracción de campos que cambia por paso
        const HEX = "0123456789abcdef";
        // Contadores: avanzan una vez por ciclo de 5 s (no con el barrido).
        const COUNTERS = {
            layer:    { v: 24,   min: 1,    max: 32,    step: 1 },
            timestep: { v: 450,  min: 0,    max: 450,   step: -1 },
            token:    { v: 1025, min: 1025, max: 99999, step: 1 },
            kvtokens: { v: 128,  min: 8,    max: 512,   step: 8 },
        };
        const LOG = [
`[LAYER {{24:layer}}/32 :: Self-Attention Multi-Head Matrix Multiplication]`,
``,
`Q_Tensor [1, 32, 128, 64] × K_Tensor^T [1, 32, 64, 128] -> Softmax Scaling (1/√d)`,
``,
`   -[0.0412  0.8921 -1.2043  0.0034] × [ 1.4120 -0.3312] = [ 0.9821 -0.0012]`,
`   -[1.1042 -0.0023  0.4511  0.7812] × [-0.8812  0.2104] = [-0.4129  0.8831]`,
`   -[0.0001  0.3341 -0.0092 -0.8812] × [ 0.0024  0.0000] = [ 0.1204 -0.5129]`,
``,
`[ACTIVATION: GELU Output Vectors]`,
`[ 0.141201, -0.002931,  1.892014, -0.451200,  0.000012,  0.781923, -1.102341 ]`,
`[ 0.000000,  0.512984, -0.000120,  0.003411, -0.891230,  1.204511,  0.041289 ]`,
``,
`[GRADIENT ACCUMULATION & FP16 WEIGHT SCALING]`,
`W_proj:  0.00234  -0.12093   0.88412   0.00001  -0.45129   1.00234  -0.00891`,
`Delta:  +0.00001  -0.00004  +0.00012  +0.00000  -0.00002  +0.00008  -0.00001`,
`Norm:   ||v||_2 = 1.04821 | Loss: 0.23019 | Throughput: 142.8 TFLOPS`,
``,
`--------------------------------------------------------------------------------`,
`[FORWARD PASS :: Layer Norm 25 & Residual Connection Sync]`,
`Input_Res:  [1.0412, -0.8912,  0.3312,  0.0041, -1.2019,  0.5512,  0.0012]`,
`LN_Gamma:   [0.9982,  1.0012,  0.9954,  1.0001,  0.9892,  1.0023,  0.9971]`,
`LN_Beta:    [0.0012, -0.0004,  0.0008,  0.0000, -0.0011,  0.0002,  0.0005]`,
`μ = -0.0124 | σ² = 0.8412 | ε = 1e-05 -> Normalized Scale Vector Output`,
``,
`[KV-CACHE MANAGEMENT :: FlashAttention-2 PagedMemory]`,
`Block_ID: 0x7f8a9a40 | Allocation: {{128:kvtokens}}/512 tokens | Cache Hit Rate: 98.4%`,
`Head_03: [0.12, -0.45, 0.88, 0.01] ... [Rotary Embedding (RoPE) applied: θ=10000]`,
`Head_04: [0.00,  0.31,-0.12, 0.94] ... [Rotary Embedding (RoPE) applied: θ=10000]`,
``,
`[FEED-FORWARD NETWORK (FFN) :: SwiGLU Gate Projection]`,
`Gate_Proj:  [ 2.412, -0.114,  0.891, -3.201] -> SiLU(x) -> [ 2.210, -0.053,  0.631, -0.124]`,
`Up_Proj:    [-0.512,  1.204,  0.001,  0.881]`,
`Product:    [-1.131, -0.063,  0.000, -0.109] -> Down_Proj Linear Mapping`,
``,
`[LOGITS DIVERSE SAMPLING :: Final Linear Layer (Vocab Size: 32,000)]`,
`Token_IDs Top-5 Probabilities:`,
`  #15496 (" tensor")  :: Logit: 14.82 -> Softmax: 68.4%`,
`  #3211  (" data")    :: Logit: 12.11 -> Softmax: 18.2%`,
`  #892   (" process") :: Logit: 10.04 -> Softmax:  7.1%`,
`  #410   (" matrix")  :: Logit:  8.91 -> Softmax:  3.5%`,
`  #1204  (" memory")  :: Logit:  7.23 -> Softmax:  1.2%`,
``,
`[SAMPLING CONFIG :: Temperature: 0.7 | Top-P: 0.9 | Top-K: 40]`,
`Selected Token: #15496 (" tensor") -> Appended to Context Window [Seq Len: 1,024]`,
``,
`--------------------------------------------------------------------------------`,
`[CROSS-ATTENTION & MULTI-MODAL EMBEDDING ALIGNMENT]`,
`Vision_Encoder_Feature_Map: [1, 576, 1024] -> BFloat16 Projection`,
`   Map_01: [ 0.0041, -0.9981,  0.4120,  1.1204] -> Cross-Attn Key  [0x8f3a2]`,
`   Map_02: [-0.3120,  0.0012, -0.8912,  0.0000] -> Cross-Attn Value [0x8f3a3]`,
`Cosine Similarity Score: 0.8914 (High Alignment with Prompt Tokens)`,
``,
`[QUANTIZATION RUNTIME :: INT4 AutoGPTQ Dequantization]`,
`Pack_32bit [0xA5F12C09] -> Unpacked INT4: [ 10, -5, 15,  1,  2, -8,  0,  9 ]`,
`Scale Factor: 0.00142 | Zero Point: -2`,
`FP16 Recovered: [ 0.01704, -0.00426,  0.02414,  0.00426,  0.00568, -0.00852 ]`,
``,
`[GPU VRAM & SYSTEM METRICS :: TensorRT LLM Engine]`,
`Allocated Memory: 14.82 GB / 24.00 GB (61.75%) | VRAM Bandwidth: 936 GB/s`,
`SM Execution Efficiency: 94.2% | Tensor Core Utilization: 98.1%`,
`Queue Delay: 0.12 ms | Decode Speed: 84.6 tokens/sec | CUDA Kernel: trt_fmha_v2`,
``,
`[AUTOREGRESSIVE LOOP NEXT TOKEN PREDICTION]`,
`Context Token Window: [ ... 1021, 1022, 1023, 15496 ]`,
`Generating Token #{{1025:token}}... Target Latency: 11.8ms | Status: COMPUTING LAYER 01/32`,
``,
`--------------------------------------------------------------------------------`,
`[MOE ROUTING :: Mixture of Experts Sparsity Gating (8 Experts / Top-2 Active)]`,
`Router Logits: [ e0: 0.12, e1: 3.89, e2: -1.02, e3: 0.04, e4: 2.11, e5: -0.44, e6: 0.00, e7: 0.82 ]`,
`Gating Softmax Top-2 Selection:`,
`  -> Expert 1 (Weight: 0.842) | Expert 4 (Weight: 0.158)`,
`  -> Routing Tensor Payload [1, 4096] to Experts CUDA Sub-stream 1 & 4... DONE`,
``,
`[LATENT DIFFUSION / DENOISING STEP :: Scheduler: DPM++ 2M Karras]`,
`Timestep: {{450:timestep}}/1000 (t={{0.45:tscale}}) | Noise Prediction Vector ε_θ(x_t, t)`,
`   Latent Grid [1, 4, 64, 64]:`,
`   [-0.0124,  0.8812, -1.4012,  0.0041 ...  0.3391]`,
`   [ 1.1023, -0.0092,  0.4120, -0.8912 ... -0.1204]`,
`Denoised Latent Estimate (x_0):`,
`   x_0_hat = (x_t - σ_t * ε_θ) / α_t -> Variance Preserved (σ = 0.412)`,
``,
`[BACKPROP GRADIENT CHECKPOINTING :: Backward Pass Trace]`,
`dL/dW_attn:  [ -0.00012,  0.00045, -0.00001,  0.00089,  0.00000, -0.00034 ]`,
`AdamW Optimizer State:`,
`  m_t (1st Moment):  0.00124 | v_t (2nd Moment):  0.00004`,
`  Weight Decay: 0.01 applied -> Updated Weights Sync [0x7f8a9a00]`,
``,
`[NCCL MULTI-GPU INTERCONNECT :: Distributed Tensor Parallelism (TP=4)]`,
`All-Reduce Collective Sync via NVLink (900 GB/s):`,
`  GPU_0 -> GPU_1: Broadcast Partial Sums Tensor [1, 128, 4096]`,
`  GPU_2 -> GPU_3: Reduction Operator (SUM) Completed in 1.42 μs`,
`Pipeline Parallel Buffer Status: STAGE 3 READY`,
        ];

        const linesEl = heroLog.querySelector("[data-log-lines]");

        // Contador {{muestra:nombre}} · hex 0x… · notación científica (1e-05)
        // · números (-?d[,ddd][.ddd]). Lo que no encaja en un campo dinámico
        // (enteros sueltos: formas, IDs, índices) se deja tal cual.
        const TOKEN = /\{\{\S+?:\w+\}\}|0[xX][0-9a-fA-F]+|\d+e[+-]?\d+|-?\d[\d,]*(?:\.\d+)?/g;

        function makeSpec(tok) {
            const counter = /^\{\{(\S+?):(\w+)\}\}$/.exec(tok);
            if (counter) return { kind: "counter", name: counter[2], width: counter[1].length, sample: counter[1] };
            if (/^0[xX][0-9a-fA-F]+$/.test(tok)) {
                const digits = tok.slice(2);
                return { kind: "hex", len: digits.length, upper: /[A-F]/.test(digits), sample: tok };
            }
            if (/e[+-]/i.test(tok)) return null;      // 1e-05: constante
            if (tok.indexOf(".") < 0) return null;    // enteros: estructura, no medida
            const neg = tok[0] === "-";
            const body = neg ? tok.slice(1) : tok;
            const dot = body.indexOf(".");
            const intDigits = dot;
            const dec = body.length - dot - 1;
            const mag = Math.abs(parseFloat(tok));
            // rango plausible: por debajo de 1 se mantiene en [0,1); por encima,
            // hasta el doble de la muestra sin pasarse del ancho del campo
            const hi = mag < 1 ? 1 : Math.min(Math.pow(10, intDigits), mag * 2);
            return { kind: "float", dec, body: body.length, signed: neg, hi, sample: tok };
        }

        // random=false → el valor literal del texto (primer pintado)
        function render(spec, random) {
            if (spec.kind === "counter") {
                const s = spec.name === "tscale"
                    ? (COUNTERS.timestep.v / 1000).toFixed(2)
                    : String(COUNTERS[spec.name].v);
                return s.length >= spec.width ? s.slice(-spec.width) : s.padStart(spec.width, " ");
            }
            if (!random) return spec.sample;
            if (spec.kind === "hex") {
                let s = spec.upper ? "0X" : "0x";
                for (let i = 0; i < spec.len; i++) {
                    const c = HEX[(Math.random() * 16) | 0];
                    s += spec.upper ? c.toUpperCase() : c;
                }
                return s;
            }
            let v = Math.random() * (spec.hi - Math.pow(10, -spec.dec));
            if (spec.signed && Math.random() < 0.5) v = -v;
            let s = Math.abs(v).toFixed(spec.dec);
            if (s.length > spec.body) s = s.slice(-spec.body);
            while (s.length < spec.body) s = "0" + s;
            return spec.signed ? (v < 0 ? "-" : " ") + s : s;
        }

        // Cursor de escritura: viaja al final de la línea que se está escribiendo.
        const caret = document.createElement("span");
        caret.className = "log-caret";

        const lines = [];        // ventana deslizante: [{ el, parts, fields, done }]
        let maxLines = LOG.length; // líneas que caben en el panel
        let logIndex = 0;        // siguiente línea del trace
        let cur = null;          // línea en curso (null → toca abrir otra)
        let persistedElapsed = 0;
        let currentElapsed = 0;
        const LOG_STATE_KEY = "hfHeroLogState";

        // Construye la línea con toda su estructura (texto + spans de números)
        // pero con los textos VACÍOS: "escribir" es ir revelando caracteres.
        function buildLine(text) {
            const el = document.createElement("div");
            el.className = "log-line";
            const parts = [];
            const fields = [];
            let last = 0, m;
            TOKEN.lastIndex = 0;
            const addText = (str) => {
                const node = document.createTextNode("");
                el.appendChild(node);
                parts.push({ node: node, full: str });
            };
            while ((m = TOKEN.exec(text))) {
                if (m.index > last) addText(text.slice(last, m.index));
                const spec = makeSpec(m[0]);
                if (!spec) {
                    addText(m[0]);
                } else {
                    const span = document.createElement("span");
                    span.className = "log-num";
                    const node = document.createTextNode("");
                    span.appendChild(node);
                    el.appendChild(span);
                    parts.push({ node: node, full: render(spec, false) });
                    fields.push({ node: node, spec: spec });
                }
                last = m.index + m[0].length;
            }
            if (last < text.length) addText(text.slice(last));
            // las líneas en blanco necesitan contenido para ocupar su alto
            if (!parts.length) addText(" ");
            return { el: el, parts: parts, fields: fields, pi: 0, done: false };
        }

        /* El landing es una página estática, así que al volver desde otra página
           el documento se crea de nuevo. Guardamos el estado visual del trace en
           sessionStorage para que el terminal continúe donde estaba, en vez de
           volver a aparecer vacío y empezar desde la primera línea. */
        function restoreLogState() {
            let state;
            try {
                state = JSON.parse(sessionStorage.getItem(LOG_STATE_KEY) || "null");
            } catch (e) {
                return;
            }
            if (!state || state.version !== 1 || !Array.isArray(state.lines)) return;

            Object.keys(COUNTERS).forEach((name) => {
                const saved = state.counters && state.counters[name];
                if (Number.isFinite(saved)) COUNTERS[name].v = saved;
            });
            if (Number.isFinite(state.elapsed)) {
                persistedElapsed = Math.max(0, state.elapsed);
                currentElapsed = persistedElapsed;
            }
            if (Number.isFinite(state.logIndex)) logIndex = Math.max(0, state.logIndex);

            state.lines.forEach((saved) => {
                const index = Number(saved && saved.index);
                if (!Number.isInteger(index) || index < 0 || index >= LOG.length) return;
                const line = buildLine(LOG[index]);
                line.el.dataset.log = String(index);
                const savedParts = Array.isArray(saved.parts) ? saved.parts : [];
                line.parts.forEach((part, partIndex) => {
                    if (typeof savedParts[partIndex] === "string") {
                        part.node.data = savedParts[partIndex];
                    } else {
                        part.node.data = part.full;
                    }
                });
                line.pi = line.parts.findIndex((part) => part.node.data.length < part.full.length);
                if (line.pi < 0) line.pi = line.parts.length;
                line.done = saved.done !== false && line.pi >= line.parts.length;
                if (line.done) line.el.classList.add("is-done");
                lines.push(line);
                linesEl.appendChild(line.el);
                if (!line.done) cur = line;
            });

            while (lines.length > maxLines) {
                const old = lines.shift();
                if (old === cur) cur = null;
                old.el.remove();
            }
            if (cur && !reduced) cur.el.appendChild(caret);
        }

        function persistLogState() {
            if (!lines.length) return;
            try {
                sessionStorage.setItem(LOG_STATE_KEY, JSON.stringify({
                    version: 1,
                    savedAt: Date.now(),
                    elapsed: currentElapsed,
                    logIndex: logIndex,
                    counters: Object.fromEntries(Object.entries(COUNTERS).map(([name, counter]) => [name, counter.v])),
                    lines: lines.map((line) => ({
                        index: Number(line.el.dataset.log),
                        done: line.done,
                        parts: line.parts.map((part) => part.node.data),
                    })),
                }));
            } catch (e) {
                // sessionStorage puede estar bloqueado o lleno; el terminal sigue funcionando.
            }
        }

        // pagehide cubre los enlaces a otras páginas y también el cierre de la pestaña.
        addEventListener("pagehide", persistLogState);
        addEventListener("beforeunload", persistLogState);

        // Abre la línea siguiente del trace. Si el panel ya está lleno, la más
        // vieja sale del DOM: eso es lo que hace "scrollear" el bloque hacia
        // abajo, como un terminal real cuando llegas al final de la pantalla.
        function nextLine() {
            const idx = logIndex % LOG.length;
            cur = buildLine(LOG[idx]);
            cur.el.dataset.log = String(idx);   // de qué línea del trace viene
            logIndex++;
            lines.push(cur);
            linesEl.appendChild(cur.el);
            if (!reduced) cur.el.appendChild(caret);
            while (lines.length > maxLines) {
                const old = lines.shift();
                if (old === cur) cur = null;   // solo pasa al reducir la ventana
                old.el.remove();
            }
        }

        // Escribe hasta `n` caracteres de la línea; devuelve los que no gasta.
        function typeChars(line, n) {
            while (n > 0 && line.pi < line.parts.length) {
                const part = line.parts[line.pi];
                const written = part.node.data.length;
                const take = Math.min(n, part.full.length - written);
                part.node.data = part.full.slice(0, written + take);
                n -= take;
                if (part.node.data.length >= part.full.length) line.pi++;
            }
            return n;
        }

        function finishLine(line) {
            line.done = true;
            line.el.classList.add("is-done");
        }

        // Los números de las líneas ya escritas siguen vivos: en cada paso se
        // mueve una parte de sus campos (ratio 0-1).
        function randomize(line, ratio) {
            line.fields.forEach((f) => {
                if (f.spec.kind === "counter") return;   // lo mueve el ciclo
                if (ratio < 1 && Math.random() > ratio) return;
                const t = render(f.spec, true);
                if (f.node.data !== t) f.node.data = t;
            });
        }

        function paintCounters() {
            lines.forEach((line) => {
                line.fields.forEach((f) => {
                    if (f.spec.kind !== "counter") return;
                    // si el campo aún se está escribiendo, no se adelanta
                    if (f.node.data.length < f.spec.width) return;
                    const t = render(f.spec, false);
                    if (f.node.data !== t) f.node.data = t;
                });
            });
        }

        function advanceCounters() {
            Object.keys(COUNTERS).forEach((k) => {
                const c = COUNTERS[k];
                c.v += c.step;
                if (c.v > c.max) c.v = c.min;
                if (c.v < c.min) c.v = c.max;
            });
        }

        // Ajusta el font-size al alto disponible y deriva cuántas líneas caben
        // (esa es la ventana: una vez llena, el bloque ya solo scrollea).
        function fit() {
            const cs = getComputedStyle(linesEl);
            const avail = linesEl.getBoundingClientRect().height
                - (parseFloat(cs.paddingTop) || 0)
                - (parseFloat(cs.paddingBottom) || 0);
            if (avail > 0) {
                const fs = Math.min(FS_MAX, Math.max(FS_MIN, avail / (LOG.length * LEAD)));
                heroLog.style.setProperty("--log-fs", fs.toFixed(2) + "px");
                maxLines = Math.max(4, Math.floor(avail / (fs * LEAD)));
            }
            while (lines.length > maxLines) {
                const old = lines.shift();
                if (old === cur) cur = null;
                old.el.remove();
            }
        }

        fit();
        restoreLogState();
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(fit).catch(() => {});
        }
        let logFitTicking = false;
        addEventListener("resize", () => {
            if (!logFitTicking) {
                logFitTicking = true;
                requestAnimationFrame(() => { fit(); logFitTicking = false; });
            }
        });

        if (reduced) {
            // sin animación: el bloque aparece ya escrito y quieto, sin cursor
            while (lines.length < maxLines) {
                nextLine();
                if (!cur) break;
                cur.parts.forEach((p) => { p.node.data = p.full; });
                cur.pi = cur.parts.length;
                finishLine(cur);
                cur = null;
            }
        } else {
            let raf = 0, running = false, inView = false;
            let elapsed = currentElapsed, t0 = 0, last = 0, cycle = -1;

            function frame(now) {
                raf = requestAnimationFrame(frame);
                if (now - last < TICK) return;
                // Hueco real desde el último paso. En el primer frame tras
                // start() last = 0 (centinela), así que vale el propio TICK; en
                // el resto el throttle de arriba ya garantiza el mínimo.
                const gap = last ? now - last : TICK;
                last = now;
                // Con la rueda en marcha el terminal se calla. Rendimiento
                // (30/09/2026): cada paso reescribe ~81 campos, y cada
                // reescritura invalida la línea, el filtro de su span y la
                // cadena de mezclas del panel — unos 1.620 cambios de nodo de
                // texto por segundo compitiendo en el HILO PRINCIPAL con el
                // propio scroll, que lo escribe smooth-scroll.js desde rAF (con
                // el wheel anulado, el scroll ya no puede correr en el
                // compositor). Callarlo mientras se desplaza libera ese hilo
                // justo en el frame que lo necesita; a 6 px y ~15 % de alfa,
                // unos cientos de ms sin escribir no se ven, y el rAF sigue
                // vivo para reanudar al instante.
                // El reloj se desplaza con el hueco (`t0 += gap`), así que
                // `elapsed` no avanza: al volver se retoma donde estaba, sin
                // soltar de golpe los caracteres acumulados ni saltarse un ciclo
                // de contadores. Se usa `is-scrolling` como señal única de
                // «hay desplazamiento»: smooth-scroll.js la marca tanto durante
                // la inercia de escritorio como ante el scroll nativo táctil.
                // Así el móvil conserva su scroll nativo y solo pausa el terminal.
                if (document.documentElement.classList.contains("is-scrolling")) {
                    t0 += gap;
                    return;
                }
                elapsed = now - t0;
                currentElapsed = elapsed;

                // 1) escribir: un golpe de teclas por paso, con cadencia viva
                let budget = CHARS_MIN + ((Math.random() * CHARS_VAR) | 0);
                let guard = 0;
                while (budget > 0 && guard++ < 64) {
                    if (!cur) nextLine();
                    if (!cur) break;
                    budget = typeChars(cur, budget);
                    if (cur.pi >= cur.parts.length) { finishLine(cur); cur = null; }
                }

                // 2) los números de las líneas ya escritas siguen cambiando
                lines.forEach((l) => { if (l.done) randomize(l, CHURN); });

                // 3) los contadores (capa, timestep, token, KV-cache) avanzan
                //    una vez por ciclo, sobre el texto ya escrito
                const c = Math.floor(elapsed / CYCLE);
                if (c !== cycle) {
                    cycle = c;
                    advanceCounters();
                    paintCounters();
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

            onHeroReady(() => io.observe(heroLog)); // ni un frame tras el preloader
        }
    }

    /* ── 6a. Statement: fondo de círculos / metaballs ───────── */
    // Las cuatro bolas quedan estáticas temporalmente. Se conserva el cálculo
    // inicial del borde y se comenta el gestor que las ponía en movimiento.
    const statementBackground = document.querySelector(".statement-background");
    if (statementBackground) {
        let edgeClock = 0;
        const orbs = [
            { x: 790, y: 350, from: [-140, -130], to: [-40, 10], radius: 185, period: 22 },
            { x: 1190, y: 640, from: [90, 65], to: [-310, -200], radius: 135, period: 19 },
            { x: 1180, y: 280, from: [80, -70], to: [-300, 120], radius: 110, period: 24 },
            { x: 470, y: 640, from: [-90, 65], to: [250, -210], radius: 145, period: 21 },
        ];
        const edgeStrengthAt = (clock) => {
            const rect = statementBackground.getBoundingClientRect();
            if (!(rect.width > 0 && rect.height > 0)) return 0.35;
            const mobile = rect.width <= 600.5;
            const scale = Math.max(rect.width * (mobile ? 1.5 : 1) / 1440, rect.height / 900);
            const anchorX = rect.width * (mobile ? 0.3 : 0.5);
            const anchorY = rect.height * 0.5;
            let nearestEdgeGap = Infinity;
            for (const orb of orbs) {
                const t = 0.5 - 0.5 * Math.cos(clock * Math.PI * 2 / orb.period);
                const centerX = orb.x + orb.from[0] + (orb.to[0] - orb.from[0]) * t;
                const centerY = orb.y + orb.from[1] + (orb.to[1] - orb.from[1]) * t;
                const screenX = rect.left + anchorX + (centerX - 720) * scale;
                const screenY = rect.top + anchorY + (centerY - 450) * scale;
                const radius = (orb.radius + 10) * scale;
                nearestEdgeGap = Math.min(
                    nearestEdgeGap,
                    screenX - radius - rect.left,
                    rect.right - (screenX + radius),
                    screenY - radius - rect.top,
                    rect.bottom - (screenY + radius)
                );
            }
            const proximity = Math.max(0, Math.min(1, 1 - Math.max(0, nearestEdgeGap) / 240));
            const eased = proximity * proximity * (3 - 2 * proximity);
            return 0.35 + 0.65 * eased;
        };
        const applyEdgeTv = () => {
            statementBackground.style.setProperty("--statement-edge-tv", edgeStrengthAt(edgeClock).toFixed(3));
        };
        applyEdgeTv();
        window.addEventListener("resize", applyEdgeTv);

        /* Animación temporalmente desactivada: para reactivarla, descomentar
           este bloque; el cálculo estático del borde permanece encendido.
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let visible = false;
        let edgeRaf = 0, edgeLast = 0;
        const updateEdgeTv = (now) => {
            edgeRaf = 0;
            if (!visible || document.hidden || motion.matches) {
                edgeLast = 0;
                return;
            }
            if (edgeLast) edgeClock += (now - edgeLast) / 1000;
            edgeLast = now;
            applyEdgeTv();
            edgeRaf = requestAnimationFrame(updateEdgeTv);
        };
        const syncBackground = () => {
            const active = visible && !document.hidden && !motion.matches;
            statementBackground.classList.toggle("is-animating", active);
            if (active && !edgeRaf) {
                edgeLast = 0;
                updateEdgeTv(performance.now());
            } else if (!active) {
                if (edgeRaf) cancelAnimationFrame(edgeRaf);
                edgeRaf = 0;
                edgeLast = 0;
            }
        };
        const observer = new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            syncBackground();
        }, { threshold: 0 });
        document.addEventListener("visibilitychange", syncBackground);
        motion.addEventListener?.("change", syncBackground);
        window.addEventListener("resize", () => { if (!edgeRaf) applyEdgeTv(); });
        onHeroReady(() => observer.observe(statementBackground.closest("section")));
        */
    }

    /* ── 6. Statement: barrido de encendido, de letra en letra ── */
    // Antes cada palabra saltaba de golpe a la clase .lit y el violeta del
    // acento llegaba con un cambio seco. Ahora el texto se reparte en letras y
    // cada una recibe su grado de encendido en --lit (0 → 1): el frente de luz
    // avanza con un degradado de SPREAD letras —siempre hay unas cuantas a
    // medio encender entre las apagadas y las encendidas— y el valor que se
    // pinta sigue al del scroll con un amortiguado corto, normalizado por
    // tiempo, así que ni el salto de la rueda ni un desplazamiento rápido se
    // notan en el texto. (30/09/2026)
    const statement = document.getElementById("statementText");
    if (statement && !reduced) {
        /* Reparto en letras: cada palabra pasa a ser un tramo de <span>, uno por
           letra y con las clases de su palabra (.accent, .italic). Los nodos de
           texto que separan las palabras se quedan donde están, de modo que los
           saltos de línea siguen en los mismos espacios. */
        const letters = [];
        [...statement.querySelectorAll("span")].forEach((word) => {
            const run = document.createDocumentFragment();
            for (const char of word.textContent) {
                const letter = document.createElement("span");
                letter.className = word.className;
                letter.textContent = char;
                run.appendChild(letter);
                letters.push(letter);
            }
            word.replaceWith(run);
        });

        const section = statement.closest("section");
        const total = letters.length;
        const SPREAD = Math.max(2, total / 16);  // letras que tarda cada una en encenderse
        const painted = new Float32Array(total); // valor que ya está en el DOM
        let head = 0;                            // frente de luz, en letras
        let raf = 0, last = 0, first = true;

        // Encendido que le toca a la letra i: continuo, y a 1 una vez que el
        // frente la ha rebasado por completo.
        const level = (i) => Math.min(Math.max((head - i) / SPREAD, 0), 1);

        function headFromScroll() {
            const rect = section.getBoundingClientRect();
            const start = innerHeight * 0.85;
            const end = innerHeight * 0.25;
            const travel = start - end;
            const done = Math.min(Math.max((start - rect.top) / (travel + rect.height * 0.35), 0), 1);
            // A done 0 el frente arranca una SPREAD por delante de la primera
            // letra (todas apagadas); a done 1 acaba una SPREAD por detrás de la
            // última (todas encendidas).
            head = done * (total - 1 + SPREAD * 2) - SPREAD;
        }

        function frame(now) {
            const dt = last ? Math.min(now - last, 64) : 16;
            last = now;
            const snap = first;                      // primer trazo: cada letra se coloca en su sitio
            // Decaimiento exponencial —la solución exacta del amortiguado—, que
            // se compone igual a 60 y a 120 Hz y no depende del ritmo de refresco.
            const k = snap ? 0 : Math.exp(-dt / 80);
            first = false;
            let moving = false;
            for (let i = 0; i < total; i++) {
                const goal = level(i);
                let value = goal + (painted[i] - goal) * k;
                if (Math.abs(goal - value) < 0.002) value = goal;   // lo que queda no se ve
                else moving = true;
                if (value !== painted[i] || snap) {
                    painted[i] = value;
                    letters[i].style.setProperty("--lit", value.toFixed(3));
                }
            }
            // El bucle solo vive mientras hay barrido: en reposo no queda ni un
            // rAF pendiente (la sección ocupa casi una pantalla y no hay nada
            // que hacer con ella quieta).
            raf = moving ? requestAnimationFrame(frame) : 0;
        }

        function sweep() {
            headFromScroll();
            if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
        }

        addEventListener("scroll", sweep, { passive: true });
        addEventListener("resize", sweep, { passive: true });
        sweep();
    }

    /* ── 7. Work rows: floating follower image ────────────── */
    const follower = document.getElementById("workFollower");
    const followerImg = document.getElementById("workFollowerImg");
    const rows = [...document.querySelectorAll(".work-row")];

    // inyecta el fotograma de cada proyecto como variable CSS de su fila
    rows.forEach((row) => row.style.setProperty("--img", `url("${row.dataset.img}")`));

    // Carry the Selected Work still into the corresponding Generated film page.
    rows.forEach((row) => row.addEventListener("click", (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const rect = row.getBoundingClientRect();
        // En el carril de escritorio (7b) el fotograma cubre toda la caja: el
        // rect que viaja a la ficha es el de la caja entera. En la lista vertical
        // es la mitad derecha, que es donde vive la foto.
        const full = !!(workSection && workSection.classList.contains("hf-work-h"));
        const start = full
            ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
            : { left: rect.left + rect.width / 2, top: rect.top, width: rect.width / 2, height: rect.height };
        // El ::after del carril lleva tres capas (velo, lavado y foto): el
        // encuadre del proyecto es el de la capa de la foto, y las tres comparten
        // el mismo valor, así que basta con la primera.
        const imagePosition = (getComputedStyle(row, "::after").backgroundPosition || "center").split(",")[0].trim();
        try { sessionStorage.setItem("hfGeneratedTransition", JSON.stringify({ ...start, image: row.dataset.img, position: imagePosition, full })); } catch (_) {}
        event.preventDefault();
        row.classList.add("is-departing");

        // Carril de escritorio (05/10/2026): aquí NO se construye clon. El clon
        // de salida es una caja nueva con la misma foto, pero sin el número, el
        // titular ni el lavado lila de la caja real, así que al aparecer —encima,
        // tapándola— el relevo se notaba: el texto se apagaba de golpe. En el
        // carril la caja ya está donde tiene que estar (la sección está fija) y
        // el navegador la sigue pintando hasta que carga la ficha, así que se
        // deja tal cual y la salida la cuenta la propia caja: el fotograma se
        // empuja un 5% hacia dentro (ver .is-departing en styles.css) y la ficha
        // recoge el relevo con su clon de llegada desde el mismo rect.
        if (full) {
            setTimeout(() => { location.href = row.href; }, 440);
            return;
        }

        const layer = document.createElement("div");
        layer.className = "work-transition work-transition--departure";
        layer.style.cssText = `left:${start.left}px;top:${start.top}px;width:${start.width}px;height:${start.height}px;background-image:url('${row.dataset.img}');background-position:${imagePosition};`;
        document.body.append(layer);
        // La caja crece con el fotograma (03/10/2026): el clon escala ×1.28
        // anclado a su borde superior (la línea que delimita la caja por arriba
        // es el border-bottom de la fila anterior y no se mueve), así que todo el
        // crecimiento —un 28% del alto medido al clic— va hacia abajo y la fila
        // lo acompaña sumándolo a su padding inferior en el mismo frame, con
        // idéntica curva (ver .work-row.is-departing en styles.css): la línea
        // inferior, propia de la fila, baja con la caja y el fotograma queda
        // contenido. El rect guardado arriba no cambia: la llegada sigue igual.
        const padding = getComputedStyle(row);
        row.style.paddingTop = padding.paddingTop;
        row.style.paddingBottom = `${parseFloat(padding.paddingBottom) + rect.height * 0.28}px`;
        requestAnimationFrame(() => layer.classList.add("is-opening"));
        setTimeout(() => { location.href = row.href; }, 440);
    }));

    // Botón atrás (03/10/2026): el bfcache revive la landing tal cual quedó
    // al salir —con el clon de salida escalado a la vista y la fila ampliada—
    // y los timers ya consumidos no se repiten, así que el clon quedaba
    // bloqueado en pantalla. Al mostrarse la página retiramos cualquier clon
    // de salida y devolvemos la fila a su estado normal, lista para otro
    // clic. Corre también en cargas normales: es idempotente e inocuo.
    addEventListener("pageshow", () => {
        document.querySelectorAll(".work-transition--departure").forEach((el) => el.remove());
        rows.forEach((r) => {
            r.classList.remove("is-departing");
            r.style.paddingTop = "";
            r.style.paddingBottom = "";
        });
    });

    if (follower && followerImg && rows.length && !isTouch && !reduced) {
        let fx = innerWidth / 2, fy = innerHeight / 2;   // follower position (lerped)
        let tx = fx, ty = fy;                            // target (mouse)
        let followerActive = false;

        // Rendimiento (30/09/2026): el bucle corría siempre, con o sin fila
        // señalada, gastando un rAF por frame durante toda la landing. Ahora
        // solo vive mientras hay una fila activa: mismo suavizado, sin coste
        // cuando el cursor no está sobre el listado.
        let followerRaf = 0;
        function followerLoop() {
            fx += (tx - fx) * 0.1;
            fy += (ty - fy) * 0.1;
            follower.style.left = fx + "px";
            follower.style.top = fy + "px";
            followerRaf = requestAnimationFrame(followerLoop);
        }
        function followerStart() {
            if (!followerRaf) followerRaf = requestAnimationFrame(followerLoop);
        }
        function followerStop() {
            cancelAnimationFrame(followerRaf);
            followerRaf = 0;
        }

        rows.forEach((row) => {
            row.addEventListener("mouseenter", () => {
                followerImg.src = row.dataset.img;
                follower.classList.add("visible");
                followerActive = true;
                followerStart();
            });
            row.addEventListener("mouseleave", () => {
                follower.classList.remove("visible");
                followerActive = false;
                followerStop();
            });
        });

        addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) followerStop();
            else if (followerActive) followerStart();
        });

        // preload all hover images so swaps are instant
        rows.forEach((r) => { const i = new Image(); i.src = r.dataset.img; });
    }

    /* ── 7b. Work: recorrido horizontal del listado en escritorio ─────────────
       En pantallas de 1025px o más la sección de proyectos se recorre en
       horizontal: la sección se queda fija (sticky) mientras el scroll vertical
       avanza por los 10 proyectos hacia la derecha y, al llegar al último, se
       libera para que el scroll siga normal hacia About.

       El desplazamiento del carril es 1:1 con el scroll del documento (no hay
       motor de scroll propio), así que la inercia de smooth-scroll.js, el scroll
       nativo, las anclas y el teclado siguen funcionando igual; este módulo solo
       traduce posición de scroll a translateX y enciende el raíl.

       La clase .hf-work-h (la que activa el diseño del carril en styles.css) se
       pone solo cuando el recorrido se puede sostener: escritorio, sin «reducir
       movimiento» y con maqueta medida. En móvil/tablet, sin JavaScript o con
       esa preferencia, el listado se queda como estaba, en vertical. El alto de
       la sección es «una pantalla + el recorrido» (--work-run), así que el punto
       en el que la sección se suelta coincide con el final del recorrido.

       Dos tiempos pedidos por el cliente (05/10/2026): N.O.D.E. se queda quieto
       y a la vista el primer tramo de scroll (HOLD, ver abajo) antes de que el
       carril empiece a correr, y el recorrido termina con RYUU CENTRADA en la
       ventana, que es el último estado antes de soltarse y seguir bajando.

       Al soltarse nacen unas ramas geométricas y rectilíneas —a la derecha del
       codo de RYUU, nunca por debajo de la caja— que se van formando con el
       scroll: el dibujo baja de la línea de cierre hacia abajo, de forma
       progresiva y a la vista, y al subir se recoge por el mismo sitio (ver más
       abajo). Hoy viajan DESACTIVADAS: BRANCHES_ON las apaga y la landing lo
       declara en su HTML (window.HYPRFRAME_WORK_BRANCHES); el carril no cambia. */
    const workView = workSection && workSection.querySelector(".work-view");
    const workList = workSection && workSection.querySelector(".work-list");
    const workTrack = document.getElementById("workTrack");
    const workRailTicks = document.getElementById("workRailTicks");
    const workBranches = document.getElementById("workBranches");

    if (workView && workList && workTrack && workRailTicks && rows.length > 1) {
        const MIN_PANEL_H = 260;   // alto mínimo de panel para que el carril valga la pena
        const desktop = window.matchMedia("(min-width: 1025px)");
        /* Ramas de WORK → About: DESACTIVADAS (05/10/2026). El dibujo está entero
           en el módulo, pero mientras este interruptor no se encienda no se traza
           nada: las ramas viajan en el código sin dibujarse. La landing lo declara
           antes de cargar este script (window.HYPRFRAME_WORK_BRANCHES) y, para
           verlas, basta ponerlo en true: el frente, la escalera y la rama de la
           derecha hasta SYNTHESIS vuelven tal cual. */
        const BRANCHES_ON = window.HYPRFRAME_WORK_BRANCHES === true;
        // Una muesca por proyecto, en el mismo orden que el listado.
        const ticks = rows.map(() => {
            const tick = document.createElement("i");
            tick.className = "work-rail-tick";
            workRailTicks.appendChild(tick);
            return tick;
        });
        // Tramo inicial, en fracción del recorrido de la sección, en el que el
        // carril no se mueve: N.O.D.E. se queda a la vista antes de arrancar.
        const HOLD = 0.16;
        // Cuánto dura el dibujo de las ramas, en múltiplos del alto del lienzo.
        // Con el frente 1:1 la tinta dibujada coincidiría con la parte del lienzo
        // que ya está a la vista (todo parecería terminado, sin animación que
        // ver), así que el frente va por detrás: arranca despacio junto a la línea
        // de cierre y se le ve bajar. Ver paintBranches.
        const GROWTH = 1.4;
        let branchPaths = [];   // tren de dibujo de las ramas: { el, len, t0, t1, last }
        let branchStart = 0;    // scrollY en el que el carril se suelta y arrancan
        let branchSpan = 0;     // px de scroll que dura el dibujo (el alto del lienzo)
        let run = 0;          // recorrido horizontal total (px que se desplaza el carril)
        let step = 0;         // recorrido por proyecto (px)
        let windowW = 0;      // ancho de la ventana del carril (px)
        let range = 0;        // px de scroll vertical que dura la sección fija
        let hold = 0;         // px de scroll de esa espera inicial
        let start = 0;        // posición de la sección dentro del documento
        let lit = -1;         // último proyecto encendido en el raíl
        let paintedX = null;  // último translate escrito (para no repetirlo)
        let hooked = false;   // la sección está en modo carril y medida
        let queued = 0;       // rAF pendiente

        function paint() {
            queued = 0;
            if (!hooked) return;
            // Los primeros `hold` px de la sección fija no mueven nada: N.O.D.E.
            // sigue a la vista. El recorrido completo se reparte entre el resto.
            const travel = Math.max(1, range - hold);
            const raw = (scrollY - start - hold) / travel;
            let progress = raw < 0 ? 0 : raw > 1 ? 1 : raw;
            // Al soltarse la sección (final del carril) empiezan a formarse las
            // ramas, y lo hacen con el scroll: bajan al bajar, se recogen al subir.
            paintBranches();
            const travelled = progress * run;
            const x = -travelled;
            // Fuera del recorrido el valor no cambia: no se reescribe el estilo
            // en cada frame de scroll del resto de la página.
            if (x !== paintedX) {
                paintedX = x;
                workTrack.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
            }
            // Proyecto «en curso»: el que tiene el centro más cerca del centro de
            // la ventana. Con el último proyecto ya no hay recorrido para dejarlo
            // alineado a la izquierda (la lista se suelta justo entonces), y esta
            // cuenta lo enciende igual: la última muesca se enciende al final.
            const now = Math.min(rows.length - 1, Math.max(0,
                Math.round((travelled + windowW / 2) / step - 0.5)));
            if (now !== lit) {
                if (ticks[lit]) ticks[lit].classList.remove("is-on");
                ticks[now].classList.add("is-on");
                lit = now;
            }
        }

        function requestPaint() {
            if (!hooked || queued) return;
            queued = requestAnimationFrame(paint);
        }

        // Sin carril: se retira todo lo que puso este módulo y el listado vuelve
        // a ser la lista vertical (es idempotente y se puede llamar siempre).
        function unhook() {
            hooked = false;
            if (queued) { cancelAnimationFrame(queued); queued = 0; }
            workSection.classList.remove("hf-work-h");
            workSection.style.removeProperty("--work-run");
            workTrack.style.transform = "";
            paintedX = null;
            if (ticks[lit]) ticks[lit].classList.remove("is-on");
            lit = -1;
            // Las ramas son del carril: sin carril no queda nada (y se vuelven a
            // trazar, al ritmo del scroll, si el carril regresa al redimensionar).
            if (workBranches) {
                workBranches.textContent = "";
                workBranches.style.removeProperty("height");
            }
            branchPaths = [];
        }

        /* Dibujo de las ramas ligado al scroll (05/10/2026): el frente baja desde
           la línea de cierre y cada tramo se dibuja cuando el frente pasa por su
           altura: por debajo del frente no hay nada dibujado y por encima está
           todo, así que la maraña crece hacia abajo de forma progresiva y al subir
           se recoge por el mismo sitio, en orden inverso. Parado, se queda como
           esté.

           El recorrido dura GROWTH veces el alto del lienzo y el frente va por
           detrás (t = recorrido²): despacio al principio, junto a la línea, y
           llegando a SYNTHESIS al final. Así el lienzo que aún no está dibujado se
           ve a la vista (la maraña crece delante del que mira) en vez de coincidir
           con lo que ya se ve, que es lo que dejaba el dibujo sin animación.
           Solo se escribe el estilo cuando el número cambia. */
        function paintBranches() {
            if (!branchPaths.length) return;
            const span = Math.max(1, branchSpan);
            let t = (scrollY - branchStart) / span;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            t = t * t;
            for (const tramo of branchPaths) {
                const dur = tramo.t1 - tramo.t0;
                let local = dur > 0 ? (t - tramo.t0) / dur : (t >= tramo.t0 ? 1 : 0);
                local = local < 0 ? 0 : local > 1 ? 1 : local;
                const dash = Math.round(tramo.len * (1 - local));
                if (dash !== tramo.last) {
                    tramo.last = dash;
                    tramo.el.style.strokeDashoffset = String(dash);
                }
            }
        }

        /* Traza las ramas dentro del contenedor (w × h) y devuelve los tramos, ya
           con su ventana de dibujo (t0 → t1, en fracción de su árbol).

           Nacen en y = 0, que es la línea de cierre del carril (el borde inferior
           del listado), y SIEMPRE a la derecha del codo de RYUU: la caja, que al
           soltarse queda centrada, no tiene nada por debajo (05/10/2026).

           Geometría rectilínea, la de antes (05/10/2026): un tallo recto y, de él,
           un abanico de ramas que se vuelven a partir, cada nivel más corto. Todo
           sobre la rejilla de 45° con coordenadas enteras —vertical, horizontal o
           diagonal exacta—, sin subir nunca y sin medias inclinaciones. Con semilla
           fija: las mismas ramas en cada carga.

           Cada árbol se ajusta a SU tope (la escalera: el de la derecha llega a
           SYNTHESIS y los de su izquierda, cada vez menos) escalándolo: se traza
           para medirlo y se repite a la escala de su tope hasta caer justo encima.

           La ventana de dibujo de cada tramo sale de su altura (t0 → t1, en
           fracción del lienzo), no de su distancia: el dibujo baja con el frente
           desde la línea de cierre —nada queda ya dibujado por delante— y un tramo
           empieza justo cuando el que lo engendra acaba, porque las hijas nacen
           donde muere su padre. No hay piezas sueltas ni saltos. */
        function traceBranches(w, h) {
            const MAX_DEPTH = 5;
            const tramos = [];

            const last = rows[rows.length - 1];
            const corner = Math.round(last.offsetLeft + last.offsetWidth - run);
            // Banda de dibujo: del codo de la última caja al borde de la ventana.
            const xMin = Math.round(Math.min(Math.max(corner, 4), w - 16));
            const xMax = Math.round(w - 4);

            // Rejilla de 45°: las cinco direcciones que bajan (E, SE, S, SW, W).
            // Con coordenadas enteras cada tramo es una recta exacta: vertical,
            // horizontal o diagonal de 45°, y la maraña se lee rectilínea.
            const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
            const espejo = (i) => 4 - i;   // E↔W, SE↔SW, S→S: endereza hacia dentro

            /* Un árbol: del tallo recto salen ramas en diagonal que se vuelven a
               partir (cada nivel más corto, ninguna sube, ninguna sale de la banda)
               y el conjunto se escala para caer justo sobre SU tope. */
            const arbol = (x, cap, root) => {
                const marca = tramos.length;
                let esc = 1;
                // En la primera pasada se traza a tamaño natural (con el lienzo como
                // tope, solo para medirlo); después se repite ya escalado, ajustando
                // la escala hasta que el árbol queda justo encima de su tope.
                for (let pasada = 0; pasada < 4; pasada++) {
                    const tope = pasada === 0 ? h + 40 : cap;
                    let seed = (0x51ED270B + root * 0x9E3779B1) | 0;
                    const rnd = () => {
                        seed = (seed + 0x6D2B79F5) | 0;
                        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
                        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                    };
                    let profundo = 0;  // lo más abajo que llega (para escalarlo)
                    /* La ventana de dibujo de cada tramo sale de SU ALTURA: el
                       frente baja de la línea de cierre al ritmo del scroll, así
                       que un tramo se dibuja al paso del frente por su arranque y
                       acaba cuando el frente lo pasa. Por debajo del frente no
                       queda nada dibujado: el dibujo crece hacia abajo, no a
                       saltos. Los llanos, que no bajan, se dibujan con un barrido
                       corto en cuanto el frente llega a su altura. */
                    const push = (x0, y0, x1, y1, depth) => {
                        const xa = Math.round(x0), ya = Math.round(y0);
                        const xb = Math.round(x1), yb = Math.round(y1);
                        profundo = Math.max(profundo, yb);
                        tramos.push({
                            d: `M${xa} ${ya}L${xb} ${yb}`, depth, root,
                            t0: ya / h,
                            t1: yb > ya ? yb / h : Math.min(1, (ya + 30) / h),
                        });
                    };
                    /* Una rama: recta de la rejilla, que se vuelve a partir. `r`
                       es su largo natural —el del árbol sin escalar, así que la
                       estructura no cambia de escala— y el corte en el tope solo
                       acorta el paso: sigue siendo una diagonal exacta. */
                    const rama = (x, y, i, r, depth) => {
                        let k = i;
                        let paso = Math.max(1, Math.round(r * esc));
                        if (x + DIRS[k][0] * paso < xMin || x + DIRS[k][0] * paso > xMax) k = espejo(k);
                        const [ux, uy] = DIRS[k];
                        // El tope corta la rama: el trozo que queda se dibuja igual
                        // (aunque sea de un par de píxeles) porque es el que deja al
                        // árbol justo encima de su tope, y la rama ya no sigue.
                        const cortada = uy && y + uy * paso > tope;
                        if (cortada) paso = tope - y;
                        if (r < 8 || (paso < 8 && !cortada)) return;
                        const nx = x + ux * paso, ny = y + uy * paso;
                        push(x, y, nx, ny, depth);
                        if (cortada || depth >= MAX_DEPTH || r < 22) return;
                        // Derivación llana corta: el aire de trazado de siempre.
                        if (rnd() < 0.28) {
                            const lado = nx + 40 > xMax ? -1 : nx - 40 < xMin ? 1 : (rnd() < 0.5 ? -1 : 1);
                            const hueco = lado > 0 ? xMax - nx : nx - xMin;
                            const cruce = Math.min(Math.max(1, Math.round((16 + rnd() * 48) * esc)), hueco);
                            if (cruce >= 1) push(nx, ny, nx + lado * cruce, ny, depth + 1);
                        }
                        const hijos = rnd() < 0.62 ? 2 : 1;
                        for (let c = 0; c < hijos; c++) {
                            const giro = (c === 0 ? -1 : 1) * (rnd() < 0.5 ? 1 : 2);
                            // El giro se queda en el abanico que baja (SE, S, SW):
                            // los llanos son la derivación de arriba, no un destino.
                            const j = Math.min(3, Math.max(1, k + giro));
                            rama(nx, ny, j, r * (0.68 + rnd() * 0.2), depth + 1);
                        }
                    };
                    // Tallo: primer tramo recto (el de antes: un quinto largo del
                    // árbol) y de ahí el abanico.
                    rama(Math.round(x), 0, 2, h * (0.2 + rnd() * 0.12), 0);
                    if (pasada > 0 && profundo === cap) break;   // ya toca su tope
                    if (!profundo) break;                        // nada que trazar
                    // Un pelo de más que recorta el corte en el tope: así el árbol
                    // cae justo encima de él, ni un píxel menos.
                    esc = Math.min(2.5, Math.max(0.4, esc * (cap + Math.max(4, cap * 0.02)) / profundo));
                    tramos.length = marca;
                }
            };

            // Arranques, todos a la derecha del codo de RYUU: el codo mismo (el
            // borde derecho de la última caja) y tres puntos repartidos hasta el
            // borde de la ventana. El tope de cada árbol baja en escalera, de forma
            // que el de la derecha es el que llega a SYNTHESIS.
            const hueco = Math.max(0, xMax - xMin);
            const raices = [[0.04, 0.45], [0.32, 0.6], [0.6, 0.78], [0.88, 1]];
            raices.forEach(([f, tope], root) => {
                // Normalizada por árbol, cada maraña crece a su ritmo y todas
                // acaban a la vez: cuando el lienzo entra entero en pantalla.
                arbol(xMin + hueco * f, Math.round(h * tope), root);
            });
            return tramos;
        }

        function buildBranches() {
            // Interruptor apagado: no se traza nada (las ramas son lo único que
            // este módulo dibuja fuera del carril; el carril sigue igual).
            if (!workBranches || !BRANCHES_ON) return;
            // Alto del lienzo: hasta la altura de SYNTHESIS (el centro de la
            // tercera línea del titular de About), medido en el documento. Si no
            // se puede medir —About no está, la fuente aún no ha cargado— vale el
            // clamp del CSS. Es el listón que alcanza la rama de la derecha y, a
            // la vez, los px de scroll que dura el dibujo.
            const linea3 = document.querySelector(".about-title .line:nth-child(3)");
            if (linea3) {
                const abajo = workSection.getBoundingClientRect().bottom + scrollY;
                const rect = linea3.getBoundingClientRect();
                const alto = Math.round(rect.top + scrollY + rect.height / 2 - abajo);
                if (alto >= 200) workBranches.style.height = alto + "px";
                else workBranches.style.removeProperty("height");
            } else {
                workBranches.style.removeProperty("height");
            }
            const w = Math.round(workBranches.clientWidth);
            const h = Math.round(workBranches.clientHeight);
            if (!w || !h) return;                    // sin maqueta (jsdom, pestaña oculta)
            workBranches.textContent = "";           // se rehace con la medida nueva
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
            svg.setAttribute("aria-hidden", "true");
            svg.setAttribute("focusable", "false");
            const tramos = traceBranches(w, h);
            // Cada tramo ya trae su ventana (t0 → t1, en fracción de su árbol).
            branchPaths = tramos.map(({ d, t0, t1 }) => {
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("d", d);
                // --len: longitud real del trazo; sin getTotalLength (jsdom) queda
                // la reserva del CSS, que es la que usa también el dibujo.
                const medida = typeof path.getTotalLength === "function" ? path.getTotalLength() : 0;
                const len = Math.max(1, Math.ceil(medida) || 2000);
                path.style.setProperty("--len", len);
                path.style.strokeDashoffset = String(len);   // sin scroll: sin dibujar
                svg.appendChild(path);
                return { el: path, len, t0, t1, last: len };
            });
            workBranches.appendChild(svg);
            // El dibujo va con el scroll: arranca donde se suelta la sección y dura
            // GROWTH veces el alto del lienzo, para que se vea crecer (ver arriba).
            branchStart = start + range;
            branchSpan = Math.round(h * GROWTH);
            paintBranches();
        }

        function measure() {
            if (!desktop.matches || reduced) { unhook(); return; }
            // Se mide con el diseño del carril ya puesto: anchos y alturas son
            // los de la maqueta horizontal, no los de la lista vertical.
            workSection.classList.add("hf-work-h");
            const listWidth = workList.clientWidth;
            const listHeight = workList.clientHeight;
            const last = rows[rows.length - 1];
            // El recorrido llega hasta dejar el ÚLTIMO proyecto CENTRADO en la
            // ventana (no pegado al borde derecho): es la imagen con la que la
            // sección se suelta y el scroll sigue bajando (05/10/2026).
            run = Math.max(0, Math.round(
                last.offsetLeft + last.offsetWidth / 2 - listWidth / 2));
            step = Math.max(0, rows[1].offsetLeft - rows[0].offsetLeft);
            // Sin maqueta (jsdom, pestaña oculta) o si el carril ya cabe entero
            // en la ventana no hay recorrido que hacer: se deja en vertical.
            if (listWidth <= 0 || run < 1 || step < 1) { unhook(); return; }
            // Una ventana muy baja (un portátil apaisado, media pantalla) deja los
            // paneles sin alto para el número y el titular: ahí la lista vertical
            // se adapta mejor y se prefiere. El umbral es el mínimo con el que el
            // panel cabe holgado (número + titular + raíl) en el caso más estrecho.
            if (listHeight < MIN_PANEL_H) { unhook(); return; }
            windowW = listWidth;
            workSection.style.setProperty("--work-run", run + "px");
            start = workSection.getBoundingClientRect().top + scrollY;
            // El recorrido vertical que dura la sección pegado es exactamente el
            // trozo de sección que sobresale de la pantalla pegada (una pantalla
            // + recorrido − una pantalla = recorrido), así que el carril y el
            // scroll van 1:1 y la sección se suelta con el proyecto 10 a la vista
            // aunque el alto de ventana real no coincida con el de la maqueta
            // (barras del navegador, zoom…).
            range = Math.max(1, workSection.offsetHeight - workView.offsetHeight);
            hold = Math.round(range * HOLD);   // espera inicial de N.O.D.E.
            // La cascada de entrada de las filas (sección 4) es de la lista
            // vertical, donde se apilan: aquí los paneles viajan en horizontal y
            // aparecerían a media animación al llegar con scroll rápido. Se dan
            // por visibles de una vez —quedan colocados cuando el carril llega a
            // la pantalla— y ya no se retira la clase: quitarla con la cascada ya
            // consumida dejaría las filas ocultas para siempre.
            rows.forEach((row) => row.classList.add("work-row-visible"));
            buildBranches();
            hooked = true;
            requestPaint();
        }

        addEventListener("scroll", requestPaint, { passive: true });
        addEventListener("resize", measure);
        addEventListener("load", measure);
        if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure, measure);

        // Al recorrer el listado con el teclado, el proyecto que recibe el foco
        // tiene que quedar a la vista: se lleva el scroll al tramo que lo enseña.
        // Solo con el teclado: al hacer clic en una fila el foco no debe mover la
        // página (y además la fila ya se lleva a la ficha del proyecto).
        let keyboardNav = false;
        addEventListener("keydown", () => { keyboardNav = true; }, { passive: true, capture: true });
        addEventListener("pointerdown", () => { keyboardNav = false; }, { passive: true, capture: true });
        rows.forEach((row, index) => {
            row.addEventListener("focus", () => {
                if (!hooked || !keyboardNav) return;
                // Misma cuenta que paint(): el tramo de espera y, después, la
                // parte del recorrido que deja ese proyecto alineado a la izquierda.
                scrollTo(0, Math.round(start + hold + Math.min(range - hold, (index * step * (range - hold)) / run)));
            });
        });

        measure();
    }

    /* ── 8. Stats count-up ────────────────────────────────── */
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

    /* ── 9. Magnetic elements ────────────────────────────── */
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

    /* ── 10. Fullscreen menu ──────────────────────────────── */
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
