/* ═══════════════════════════════════════════════════════════
   HYPRFRAME — 404 / FRAME NOT FOUND INTERACTIONS
   Vanilla JS, zero external dependencies.
   ═══════════════════════════════════════════════════════════ */
(() => {
    "use strict";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

    /* ─── 1. Custom Cursor (Shared HYPRFRAME System) ─────── */
    const dot = document.getElementById("cursorDot");
    const ring = document.getElementById("cursorRing");

    if (!isTouch && !reducedMotion && dot && ring) {
        const CURSOR_KEY = "hfCursor";
        let mx = window.innerWidth / 2;
        let my = window.innerHeight / 2;

        try {
            const saved = sessionStorage.getItem(CURSOR_KEY);
            if (saved) {
                const parts = saved.split(",");
                const sx = Number(parts[0]);
                const sy = Number(parts[1]);
                if (Number.isFinite(sx) && Number.isFinite(sy)) {
                    mx = Math.min(Math.max(sx, 0), window.innerWidth);
                    my = Math.min(Math.max(sy, 0), window.innerHeight);
                }
            }
        } catch (e) { /* storage unavailable */ }

        let rx = mx;
        let ry = my;
        let savedX = mx;
        let savedY = my;

        window.addEventListener("mousemove", (e) => {
            mx = e.clientX;
            my = e.clientY;
        }, { passive: true });

        const cursorLoop = () => {
            rx += (mx - rx) * 0.16;
            ry += (my - ry) * 0.16;
            dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
            ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;

            if (mx !== savedX || my !== savedY) {
                savedX = mx;
                savedY = my;
                try {
                    sessionStorage.setItem(CURSOR_KEY, `${mx},${my}`);
                } catch (e) {}
            }
            requestAnimationFrame(cursorLoop);
        };
        requestAnimationFrame(cursorLoop);

        const bindCursorLarge = () => {
            document.querySelectorAll("a, button, .waypoint-card, input, .glitch-display").forEach((el) => {
                if (el.dataset.cursorBound) return;
                el.dataset.cursorBound = "1";
                el.addEventListener("mouseenter", () => document.body.classList.add("cursor-large"));
                el.addEventListener("mouseleave", () => document.body.classList.remove("cursor-large"));
            });
        };
        bindCursorLarge();
        // Export cursor binder for dynamically added elements (like quick jump results)
        window.bindCursorLarge = bindCursorLarge;
    }

    /* ─── 2. Header & Mobile Menu ────────────────────────── */
    const header = document.getElementById("siteHeader");
    const progress = document.getElementById("scrollProgress");
    const burger = document.getElementById("burger");
    const overlay = document.getElementById("menuOverlay");

    const updateScroll = () => {
        if (!progress) return;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    };
    window.addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();

    const toggleMenu = (open) => {
        if (!burger || !overlay) return;
        document.body.classList.toggle("menu-open", open);
        burger.setAttribute("aria-expanded", String(open));
        burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        overlay.setAttribute("aria-hidden", String(!open));
        if (open) {
            const first = overlay.querySelector(".menu-links a");
            if (first) first.focus();
        } else {
            burger.focus();
        }
    };

    if (burger) {
        burger.addEventListener("click", () => {
            const isOpen = document.body.classList.contains("menu-open");
            toggleMenu(!isOpen);
        });
    }

    if (overlay) {
        overlay.querySelectorAll(".menu-links a").forEach((a) => {
            a.addEventListener("click", () => toggleMenu(false));
        });
    }

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && document.body.classList.contains("menu-open")) {
            toggleMenu(false);
        }
    });

    /* ─── 3. Dynamic Pathname & Telemetry Readout ─────────── */
    const termUri = document.getElementById("termUri");
    const termEntropy = document.getElementById("termEntropy");
    const termCoords = document.getElementById("termCoords");

    if (termUri) {
        let path = window.location.pathname || "/unknown-frame";
        if (window.location.search) path += window.location.search;
        // Clean display
        termUri.textContent = path.length > 36 ? path.slice(0, 34) + "..." : path;
        termUri.title = path;
    }

    // Subtle entropy variation
    if (termEntropy && !reducedMotion) {
        setInterval(() => {
            if (document.hidden) return;
            const jitter = (0.9820 + Math.random() * 0.007).toFixed(4);
            termEntropy.textContent = `ENTROPY: ${jitter}`;
        }, 2200);
    }

    /* ─── 4. Glitch Effect & Re-scan Simulation ───────────── */
    const glitchDisplay = document.getElementById("glitchTrigger");
    const glitchNumber = document.getElementById("glitchNumber");
    const btnRescan = document.getElementById("btnRescan");

    const glitchGlyphs = ["404", "4Ø4", "4_4", "4#4", "4?4", "!0!", "404"];
    let isGlitching = false;

    const runGlitchBurst = () => {
        if (isGlitching || !glitchNumber) return;
        isGlitching = true;
        let count = 0;
        const originalText = "404";

        const interval = setInterval(() => {
            count++;
            const rand = glitchGlyphs[Math.floor(Math.random() * glitchGlyphs.length)];
            glitchNumber.textContent = rand;
            glitchNumber.setAttribute("data-text", rand);

            if (count > 7) {
                clearInterval(interval);
                glitchNumber.textContent = originalText;
                glitchNumber.setAttribute("data-text", originalText);
                isGlitching = false;
            }
        }, 60);

        // Randomize tensor coords
        if (termCoords) {
            const hex = Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, "0");
            const seed = `0x${hex}`;
            const dim1 = Math.floor(Math.random() * 4);
            const dim2 = [512, 768, 1024, 2048][Math.floor(Math.random() * 4)];
            termCoords.textContent = `dim[${dim1}, ${dim2}, NaN] · seed: ${seed}`;
        }

        // Trigger shockwave in canvas
        if (window.triggerCanvasPulse) {
            window.triggerCanvasPulse();
        }
    };

    if (glitchDisplay) {
        glitchDisplay.addEventListener("click", runGlitchBurst);
    }

    if (btnRescan) {
        btnRescan.addEventListener("click", () => {
            btnRescan.classList.add("is-scanning");
            runGlitchBurst();
            setTimeout(() => {
                btnRescan.classList.remove("is-scanning");
            }, 1000);
        });
    }

    /* ─── 5. Bilingual Support (EN / ES) ─────────────────── */
    const langBtns = document.querySelectorAll(".lang-switch button, .lang-toggle");
    let currentLang = "en";

    // Detect initial language
    try {
        const savedLang = localStorage.getItem("hfLang");
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get("lang");

        if (urlLang === "es" || urlLang === "en") {
            currentLang = urlLang;
        } else if (savedLang === "es" || savedLang === "en") {
            currentLang = savedLang;
        } else if (navigator.language && navigator.language.startsWith("es")) {
            currentLang = "es";
        }
    } catch (e) {}

    const setLanguage = (lang) => {
        currentLang = lang;
        document.documentElement.lang = lang;

        try {
            localStorage.setItem("hfLang", lang);
        } catch (e) {}

        // Update switcher buttons
        document.querySelectorAll("[data-lang='en'], #langEn, #menuLangEn").forEach((el) => {
            el.classList.toggle("active", lang === "en");
        });
        document.querySelectorAll("[data-lang='es'], #langEs, #menuLangEs").forEach((el) => {
            el.classList.toggle("active", lang === "es");
        });

        // Toggle title and description spans
        document.querySelectorAll(".title-en, .desc-en").forEach((el) => {
            el.style.display = lang === "en" ? "" : "none";
        });
        document.querySelectorAll(".title-es, .desc-es").forEach((el) => {
            el.style.display = lang === "es" ? "" : "none";
        });

        // Update elements with data-en and data-es
        document.querySelectorAll("[data-en][data-es]").forEach((el) => {
            el.textContent = el.getAttribute(`data-${lang}`);
        });

        // Update search placeholder
        const searchInput = document.getElementById("quickJumpInput");
        if (searchInput) {
            searchInput.placeholder = lang === "es"
                ? "Escribe un destino (ej. Node, Ryuu, Polestar, About, Contact...)"
                : "Type a destination (e.g. Node, Ryuu, Polestar, About, Contact...)";
        }
    };

    langBtns.forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const targetLang = btn.dataset.lang || (btn.id.includes("Es") ? "es" : "en");
            setLanguage(targetLang);
        });
    });

    // Initialize with detected language
    setLanguage(currentLang);

    /* ─── 6. Quick Jump Search / Destination Filter ─────── */
    const searchInput = document.getElementById("quickJumpInput");
    const resultsContainer = document.getElementById("quickJumpResults");

    const DESTINATIONS = [
        { title: "N.O.D.E.", type: "Generated Video", url: "/project-node.html", tags: "node teaser urban insurgency machine water" },
        { title: "Deep in the Forest", type: "Generated Video", url: "/project-deep.html", tags: "deep forest nature generative video" },
        { title: "Polestar 5", type: "Generated Video", url: "/project-polestar5.html", tags: "polestar car automotive automotive ev" },
        { title: "Distant", type: "Generated Video", url: "/project-distant.html", tags: "distant sci-fi trailer space" },
        { title: "Exit Plan", type: "Generated Video", url: "/project-exit.html", tags: "exit plan action cinematic teaser" },
        { title: "Stained", type: "Generated Video", url: "/project-stained.html", tags: "stained art direction narrative film" },
        { title: "Asics Vulcano", type: "Generated Video", url: "/project-asics.html", tags: "asics vulcano commercial footwear" },
        { title: "Farewell", type: "Generated Video", url: "/project-farewell.html", tags: "farewell emotional drama synthesis" },
        { title: "IAD Annual Meeting", type: "Generated Video", url: "/project-iad.html", tags: "iad corporate architecture design" },
        { title: "Ryuu, the Dragon's Course", type: "Generated Video", url: "/project-ryuu.html", tags: "ryuu dragon racing anime teaser" },
        { title: "All Generated Work", type: "Pipeline 01", url: "/index.html#work", tags: "generated work portfolio ai films video" },
        { title: "Captured (Legacy Films)", type: "Pipeline 02", url: "/legacy.html", tags: "captured real cinema documentary commercials" },
        { title: "DNAi Studio Capabilities", type: "Consulting", url: "/index.html#services", tags: "dnai capabilities consulting services ai pipelines" },
        { title: "Cinematic Look Builder (CLB)", type: "Prompt Engine", url: "/builder.html", tags: "builder clb prompts lighting camera stocks tool" },
        { title: "About HYPRFRAME", type: "Studio", url: "/index.html#about", tags: "about manifesto barcelona intuition synthesis" },
        { title: "Contact & Collaborations", type: "Direct Link", url: "/index.html#contact", tags: "contact commission inquiry email barcelona" },
        { title: "Return to Homepage", type: "Home", url: "/index.html#top", tags: "home base index start" }
    ];

    if (searchInput && resultsContainer) {
        let activeIndex = -1;

        const renderResults = (items) => {
            if (items.length === 0) {
                resultsContainer.innerHTML = `<div class="quick-jump-empty">No matching coordinates found.</div>`;
                resultsContainer.hidden = false;
                activeIndex = -1;
                return;
            }

            resultsContainer.innerHTML = items.map((item, idx) => `
                <a href="${item.url}" class="quick-jump-item" data-index="${idx}">
                    <span class="quick-jump-item-title">${item.title}</span>
                    <span class="quick-jump-item-badge">${item.type}</span>
                </a>
            `).join("");
            resultsContainer.hidden = false;
            activeIndex = -1;

            if (window.bindCursorLarge) window.bindCursorLarge();
        };

        searchInput.addEventListener("input", () => {
            const q = searchInput.value.trim().toLowerCase();
            if (!q) {
                resultsContainer.hidden = true;
                resultsContainer.innerHTML = "";
                activeIndex = -1;
                return;
            }

            const matches = DESTINATIONS.filter((d) =>
                d.title.toLowerCase().includes(q) ||
                d.type.toLowerCase().includes(q) ||
                d.tags.toLowerCase().includes(q)
            ).slice(0, 6);

            renderResults(matches);
        });

        searchInput.addEventListener("keydown", (e) => {
            const items = resultsContainer.querySelectorAll(".quick-jump-item");
            if (!items.length || resultsContainer.hidden) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                activeIndex = (activeIndex + 1) % items.length;
                updateActive(items);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                activeIndex = (activeIndex - 1 + items.length) % items.length;
                updateActive(items);
            } else if (e.key === "Enter") {
                if (activeIndex >= 0 && items[activeIndex]) {
                    e.preventDefault();
                    items[activeIndex].click();
                }
            } else if (e.key === "Escape") {
                searchInput.value = "";
                resultsContainer.hidden = true;
                searchInput.blur();
            }
        });

        const updateActive = (items) => {
            items.forEach((it, idx) => {
                it.classList.toggle("is-selected", idx === activeIndex);
            });
            if (items[activeIndex]) {
                items[activeIndex].scrollIntoView({ block: "nearest" });
            }
        };

        document.addEventListener("click", (e) => {
            if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.hidden = true;
            }
        });
    }

    /* ─── 7. Interactive Latent Constellation Canvas ──────── */
    const canvas = document.getElementById("canvas404");
    if (canvas && !reducedMotion) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
            let width = 0;
            let height = 0;
            let dpr = window.devicePixelRatio || 1;
            let particles = [];
            const PARTICLE_COUNT = 55;
            let pulseRadius = 0;
            let pulseActive = false;

            const resize = () => {
                width = window.innerWidth;
                height = window.innerHeight;
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                ctx.scale(dpr, dpr);
            };
            resize();
            window.addEventListener("resize", resize, { passive: true });

            // Initialize points
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.45,
                    vy: (Math.random() - 0.5) * 0.45,
                    radius: Math.random() * 1.6 + 0.8,
                    color: Math.random() > 0.65 ? "#a064ff" : (Math.random() > 0.85 ? "#a3df02" : "#ffffff"),
                    alpha: Math.random() * 0.5 + 0.25
                });
            }

            let mouseX = -9999;
            let mouseY = -9999;
            window.addEventListener("mousemove", (e) => {
                mouseX = e.clientX;
                mouseY = e.clientY;
            }, { passive: true });

            window.triggerCanvasPulse = () => {
                pulseRadius = 0;
                pulseActive = true;
            };

            const animateCanvas = () => {
                if (document.hidden) {
                    requestAnimationFrame(animateCanvas);
                    return;
                }

                ctx.clearRect(0, 0, width, height);

                // Update & draw particles
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    p.x += p.vx;
                    p.y += p.vy;

                    // Wrap around borders
                    if (p.x < 0) p.x = width;
                    else if (p.x > width) p.x = 0;
                    if (p.y < 0) p.y = height;
                    else if (p.y > height) p.y = 0;

                    // Repel slightly from cursor
                    const dxm = p.x - mouseX;
                    const dym = p.y - mouseY;
                    const distm = Math.sqrt(dxm * dxm + dym * dym);
                    if (distm < 110) {
                        const force = (110 - distm) / 110 * 0.6;
                        p.x += (dxm / distm) * force * 2;
                        p.y += (dym / distm) * force * 2;
                    }

                    // Render point
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = p.alpha;
                    ctx.fill();

                    // Proximity connections
                    for (let j = i + 1; j < particles.length; j++) {
                        const p2 = particles[j];
                        const dx = p.x - p2.x;
                        const dy = p.y - p2.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < 125) {
                            const lineAlpha = (1 - dist / 125) * 0.18;
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.strokeStyle = p.color === "#a3df02" ? "#a3df02" : "#a064ff";
                            ctx.globalAlpha = lineAlpha;
                            ctx.lineWidth = 0.8;
                            ctx.stroke();
                        }
                    }
                }

                // Render shockwave pulse if active
                if (pulseActive) {
                    pulseRadius += 18;
                    const maxR = Math.max(width, height) * 0.75;
                    const pAlpha = Math.max(0, 0.45 * (1 - pulseRadius / maxR));

                    ctx.beginPath();
                    ctx.arc(width / 2, height / 2, pulseRadius, 0, Math.PI * 2);
                    ctx.strokeStyle = "#a064ff";
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = pAlpha;
                    ctx.stroke();

                    if (pulseRadius >= maxR || pAlpha <= 0) {
                        pulseActive = false;
                    }
                }

                ctx.globalAlpha = 1;
                requestAnimationFrame(animateCanvas);
            };

            requestAnimationFrame(animateCanvas);
        }
    }

})();
