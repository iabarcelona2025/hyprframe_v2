/* ═══════════════════════════════════════════════════════════
   HYPRFRAME — 404 / FRAME NOT FOUND INTERACTIONS
   Vanilla JS, zero external dependencies.
   ═══════════════════════════════════════════════════════════ */
(() => {
    "use strict";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ─── 1. Glitch Click Effect ─────────────────────────── */
    const glitchDisplay = document.getElementById("glitchTrigger");
    const glitchError = document.getElementById("glitchError");
    const glitchNumber = document.getElementById("glitchNumber");

    /* Headline shown above the 404 (replaces the old error label). */
    const DISPLAY_TEXT = "NOTHING TO SEE HERE";

    const glitchGlyphs404 = ["404", "4Ø4", "4_4", "4#4", "4?4", "!0!", "404"];
    const glitchGlyphsErr = [
        DISPLAY_TEXT,
        "N0THING T0 SEE HERE",
        "N_THING TO SEE HERE",
        "NOT#ING TO SEE HER3",
        "N??HING TO SEE HERE",
        "NOTHING T_ SEE H#RE",
        DISPLAY_TEXT
    ];
    let isGlitching = false;

    const runGlitchBurst = () => {
        if (isGlitching || !glitchNumber) return;
        isGlitching = true;
        let count = 0;

        const interval = setInterval(() => {
            count++;
            const rand404 = glitchGlyphs404[Math.floor(Math.random() * glitchGlyphs404.length)];
            glitchNumber.textContent = rand404;
            glitchNumber.setAttribute("data-text", rand404);

            if (glitchError) {
                const randErr = glitchGlyphsErr[Math.floor(Math.random() * glitchGlyphsErr.length)];
                glitchError.textContent = randErr;
                glitchError.setAttribute("data-text", randErr);
            }

            if (count > 7) {
                clearInterval(interval);
                glitchNumber.textContent = "404";
                glitchNumber.setAttribute("data-text", "404");
                if (glitchError) {
                    glitchError.textContent = DISPLAY_TEXT;
                    glitchError.setAttribute("data-text", DISPLAY_TEXT);
                }
                isGlitching = false;
            }
        }, 55);

        // Trigger shockwave in canvas
        if (window.triggerCanvasPulse) {
            window.triggerCanvasPulse();
        }
    };

    if (glitchDisplay) {
        glitchDisplay.addEventListener("click", runGlitchBurst);
    }

    /* ─── 2. Interactive Latent Constellation Canvas ──────── */
    const canvas = document.getElementById("canvas404");
    if (canvas && !reducedMotion) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
            let width = 0;
            let height = 0;
            let dpr = window.devicePixelRatio || 1;
            let particles = [];
            const PARTICLE_COUNT = 45;
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
                    vx: (Math.random() - 0.5) * 0.35,
                    vy: (Math.random() - 0.5) * 0.35,
                    radius: Math.random() * 1.5 + 0.8,
                    color: Math.random() > 0.65 ? "#a064ff" : (Math.random() > 0.85 ? "#a3df02" : "#ffffff"),
                    alpha: Math.random() * 0.45 + 0.2
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
                        const force = (110 - distm) / 110 * 0.5;
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
                            const lineAlpha = (1 - dist / 125) * 0.16;
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
