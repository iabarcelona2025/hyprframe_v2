/* Captured page interactions: landing-style navigation and the film player. */
(() => {
    "use strict";

    /* ── Custom cursor (same behaviour as index.html and the Generated pages) ── */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const dot = document.getElementById("cursorDot");
    const ring = document.getElementById("cursorRing");

    if (!isTouch && !reduced && dot && ring) {
        /* El cursor arranca donde se quedó el ratón la última vez: al volver con
           atrás/adelante del navegador la página se recarga y la cruceta
           aparecía en el centro hasta que el usuario movía el ratón. */
        const CURSOR_KEY = "hfCursor";
        let mx = innerWidth / 2, my = innerHeight / 2;
        try {
            const saved = sessionStorage.getItem(CURSOR_KEY);
            if (saved) {
                const parts = saved.split(",");
                const sx = Number(parts[0]), sy = Number(parts[1]);
                if (Number.isFinite(sx) && Number.isFinite(sy)) {
                    // Acotado por si la ventana cambió de tamaño entre recargas.
                    mx = Math.min(Math.max(sx, 0), innerWidth);
                    my = Math.min(Math.max(sy, 0), innerHeight);
                }
            }
        } catch (err) { /* storage bloqueado: se queda el centro */ }
        let rx = mx, ry = my;
        let savedX = mx, savedY = my;

        addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });

        (function cursorLoop() {
            rx += (mx - rx) * 0.16;
            ry += (my - ry) * 0.16;
            dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
            ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
            // Guarda la posición (como mucho una escritura por frame) para que la
            // siguiente carga —atrás/adelante incluidos— arranque desde aquí.
            if (mx !== savedX || my !== savedY) {
                savedX = mx; savedY = my;
                try { sessionStorage.setItem(CURSOR_KEY, `${mx},${my}`); } catch (err) {}
            }
            requestAnimationFrame(cursorLoop);
        })();

        // En Captured los interactivos son los enlaces (tarjetas de película, nav,
        // menú) y los botones (hamburguesa, cerrar el modal): el selector genérico
        // ya los cubre, igual que en la landing y en las fichas GENERATED.
        document.querySelectorAll("a, button, .service-row, input, textarea").forEach((el) => {
            el.addEventListener("mouseenter", () => document.body.classList.add("cursor-large"));
            el.addEventListener("mouseleave", () => document.body.classList.remove("cursor-large"));
        });
    }

    const header = document.getElementById("siteHeader");
    const progress = document.getElementById("scrollProgress");
    const burger = document.getElementById("burger");
    const menu = document.getElementById("menuOverlay");
    const modal = document.getElementById("videoModal");
    const player = document.getElementById("vimeoPlayer");
    const closeButton = document.getElementById("modalClose");
    const title = document.getElementById("modalTitle");
    const synopsis = document.getElementById("videoSynopsis");
    const cast = document.getElementById("videoCast");
    let lastFilmLink = null;

    function updateScroll() {
        // En Captured la cabecera usa siempre su versión compacta y desenfocada.
        header.classList.add("scrolled");
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    }
    window.addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();

    function setMenu(open, restoreFocus = false) {
        document.body.classList.toggle("menu-open", open);
        burger.setAttribute("aria-expanded", String(open));
        burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        menu.setAttribute("aria-hidden", String(!open));
        if (open) menu.querySelector(".menu-links a").focus();
        else if (restoreFocus) burger.focus();
    }
    burger.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
    menu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => setMenu(false));
    });

    function openFilm(link) {
        const id = link.dataset.vimeo;
        if (!/^\d+$/.test(id)) return;
        lastFilmLink = link;
        title.textContent = link.dataset.title;
        synopsis.textContent = link.dataset.synopsis;
        // Reparto opcional (data-cast): la línea solo existe en las tarjetas que lo llevan.
        cast.textContent = link.dataset.cast || "";
        cast.hidden = !cast.textContent;
        player.title = `${link.dataset.title} — Vimeo video`;
        modal.hidden = false;
        document.body.classList.add("modal-open");
        player.src = `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`;
        closeButton.focus();
    }

    function closeFilm() {
        if (modal.hidden) return;
        modal.hidden = true;
        player.src = ""; // stop playback, even when closing via Escape or the backdrop
        document.body.classList.remove("modal-open");
        lastFilmLink?.focus();
    }

    document.querySelectorAll(".film-card").forEach((link) => {
        link.addEventListener("click", (event) => {
            // Keep Ctrl/Cmd-click, Shift-click and the no-JS fallback to Vimeo working.
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            openFilm(link);
        });
    });
    closeButton.addEventListener("click", closeFilm);
    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeFilm();
    });

    // Close the pop-up as soon as the film ends. This is the postMessage protocol behind
    // Vimeo's player.js: once the player reports "ready", ask it to report "ended" too.
    const VIMEO_ORIGIN = "https://player.vimeo.com";
    window.addEventListener("message", (event) => {
        if (event.origin !== VIMEO_ORIGIN || event.source !== player.contentWindow) return;
        let data = event.data;
        if (typeof data === "string") {
            try { data = JSON.parse(data); } catch { return; }
        }
        if (data?.event === "ready") {
            player.contentWindow.postMessage({ method: "addEventListener", value: "ended" }, VIMEO_ORIGIN);
        } else if (data?.event === "ended") {
            closeFilm();
        }
    });

    // The original stills are not in this repo. Fall back to the matching Vimeo
    // thumbnails, then to the CSS poster if neither host can be reached.
    document.querySelectorAll(".film-card__poster img").forEach((img) => {
        let triedFallback = false;
        function handleError() {
            if (!triedFallback) {
                triedFallback = true;
                img.src = img.dataset.fallbackSrc;
            } else {
                img.classList.add("is-unavailable");
            }
        }
        img.addEventListener("error", handleError);
        if (img.complete && img.naturalWidth === 0) handleError();
    });

    function trapFocus(event, elements) {
        if (event.key !== "Tab") return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
        }
    }
    document.addEventListener("keydown", (event) => {
        if (!modal.hidden) {
            if (event.key === "Escape") { event.preventDefault(); closeFilm(); }
            else trapFocus(event, [closeButton, player]);
        } else if (document.body.classList.contains("menu-open")) {
            if (event.key === "Escape") { event.preventDefault(); setMenu(false, true); }
            else trapFocus(event, [burger, ...menu.querySelectorAll("a")]);
        }
    });
    // Key presses inside the cross-origin Vimeo iframe never reach this document, so
    // tabbing past the player's last control would land behind the modal: bring it back.
    document.addEventListener("focusin", (event) => {
        if (!modal.hidden && !modal.contains(event.target)) closeButton.focus();
    });
})();
