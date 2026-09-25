/* Captured page interactions: landing-style navigation and the film player. */
(() => {
    "use strict";

    const header = document.getElementById("siteHeader");
    const progress = document.getElementById("scrollProgress");
    const burger = document.getElementById("burger");
    const menu = document.getElementById("menuOverlay");
    const modal = document.getElementById("videoModal");
    const player = document.getElementById("vimeoPlayer");
    const closeButton = document.getElementById("modalClose");
    const title = document.getElementById("modalTitle");
    const synopsis = document.getElementById("videoSynopsis");
    let lastFilmLink = null;

    /* ── Custom cursor ───────────────────────────────────────
       Same behaviour as the landing (script.js): the dot tracks the pointer,
       the ring chases it with easing and grows over links and buttons.
       Off on touch devices and when the visitor prefers reduced motion. */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const cursorDot = document.getElementById("cursorDot");
    const cursorRing = document.getElementById("cursorRing");

    if (!isTouch && !reduced && cursorDot && cursorRing) {
        let mx = window.innerWidth / 2, my = window.innerHeight / 2;
        let rx = mx, ry = my;

        window.addEventListener("mousemove", (event) => { mx = event.clientX; my = event.clientY; });

        (function cursorLoop() {
            rx += (mx - rx) * 0.16;
            ry += (my - ry) * 0.16;
            cursorDot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
            cursorRing.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
            window.requestAnimationFrame(cursorLoop);
        })();

        document.querySelectorAll("a, button").forEach((el) => {
            el.addEventListener("mouseenter", () => document.body.classList.add("cursor-large"));
            el.addEventListener("mouseleave", () => document.body.classList.remove("cursor-large"));
        });
    }

    function updateScroll() {
        header.classList.toggle("scrolled", window.scrollY > 40);
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
        } else if (document.body.classList.contains("menu-open")) {
            if (event.key === "Escape") { event.preventDefault(); setMenu(false, true); }
            else trapFocus(event, [burger, ...menu.querySelectorAll("a")]);
        }
    });
})();
