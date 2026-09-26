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
                last = now;
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
