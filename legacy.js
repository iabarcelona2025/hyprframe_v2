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
    const externalLink = document.getElementById("modalExternal");
    let lastFilmLink = null;

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
        externalLink.href = link.href;
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
            else trapFocus(event, [closeButton, player, externalLink]);
        } else if (document.body.classList.contains("menu-open")) {
            if (event.key === "Escape") { event.preventDefault(); setMenu(false, true); }
            else trapFocus(event, [burger, ...menu.querySelectorAll("a")]);
        }
    });
})();
