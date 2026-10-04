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

    // Keep this independent of viewport width: a phone remains mobile when rotated.
    const mobilePlayer = window.matchMedia("(hover: none) and (pointer: coarse) and (max-device-width: 1024px)");
    const landscape = window.matchMedia("(orientation: landscape)");
    let rotationEnabled = false;
    let fullscreenAttempt = 0;
    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

    function exitNativeFullscreen() {
        if (fullscreenElement() !== modal) return;
        try {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            Promise.resolve(exit?.call(document)).catch(() => {});
        } catch { /* Some mobile browsers expose but do not support this API. */ }
    }

    function leaveMobileFullscreen() {
        fullscreenAttempt++;
        modal.classList.remove("is-mobile-fullscreen");
        exitNativeFullscreen();
    }

    function enterMobileFullscreen() {
        if (!rotationEnabled || modal.hidden) return;
        modal.classList.add("is-mobile-fullscreen");
        if (fullscreenElement() === modal) return;
        const request = modal.requestFullscreen || modal.webkitRequestFullscreen;
        if (!request) return; // iPhone: retain the full-window landscape layout.
        const attempt = ++fullscreenAttempt;
        try {
            Promise.resolve(request.call(modal)).then(() => {
                if (attempt !== fullscreenAttempt && !modal.classList.contains("is-mobile-fullscreen")) {
                    exitNativeFullscreen();
                }
            }).catch(() => {}); // Rotation may lack the user activation required by the browser.
        } catch { /* The CSS full-window fallback stays usable. */ }
    }

    function isLandscape() {
        const type = window.screen.orientation?.type;
        if (type) return type.startsWith("landscape");
        if (typeof window.orientation === "number") return Math.abs(window.orientation) === 90;
        return landscape.matches;
    }
    let previousLandscape = isLandscape();
    function onRotation() {
        const nextLandscape = isLandscape();
        if (nextLandscape === previousLandscape) return;
        previousLandscape = nextLandscape;
        if (!rotationEnabled || modal.hidden) return;
        if (nextLandscape) enterMobileFullscreen();
        else leaveMobileFullscreen();
    }
    // Do not lock ScreenOrientation: that suppresses the portrait change needed to exit.
    // The portrait CSS rotates the player instead, leaving physical rotation observable.
    window.screen.orientation?.addEventListener("change", onRotation);
    window.addEventListener("orientationchange", onRotation);
    landscape.addEventListener("change", onRotation);
    function onFullscreenChange() {
        if (!fullscreenElement()) modal.classList.remove("is-mobile-fullscreen");
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    const panel = modal.querySelector(".film-modal__panel");
    const desktopPlayer = window.matchMedia("(min-width: 561px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    for (const name of ["shield", "dock"]) {
        const layer = document.createElement("div");
        layer.className = `film-modal__${name}`;
        layer.setAttribute("aria-hidden", "true");
        panel.append(layer);
    }
    let closeTimer = null;
    let openingPoster = null;
    let posterTimer = null;
    function clearWindowTransition() {
        clearTimeout(closeTimer);
        clearTimeout(posterTimer);
        posterTimer = null;
        closeTimer = null;
        panel.removeEventListener("transitionend", onWindowLanded);
        modal.classList.remove("is-closing");
        openingPoster?.remove();
        openingPoster = null;
        player.classList.remove("is-ready");
    }
    function onWindowLanded(event) {
        if (event.target === panel && event.propertyName === "transform") finishCloseFilm();
    }
    function openDesktopWindow(link) {
        if (mobilePlayer.matches || !desktopPlayer.matches) return;
        const from = link.querySelector(".film-card__poster").getBoundingClientRect();
        openingPoster = link.querySelector(".film-card__poster img").cloneNode();
        openingPoster.className = "film-modal__opening-poster";
        openingPoster.alt = "";
        openingPoster.removeAttribute("loading");
        panel.prepend(openingPoster);
        // The still only travels during expansion. Never leave it behind Vimeo
        // (or showing through its letterbox / loading area) in windowed playback.
        posterTimer = setTimeout(() => {
            openingPoster?.remove();
            openingPoster = null;
            posterTimer = null;
        }, reducedMotion.matches ? 0 : 500);
        modal.classList.add("is-windowed");
        if (reducedMotion.matches) return;
        const to = panel.getBoundingClientRect();
        if (!from.width || !from.height || !to.width || !to.height) return;
        panel.style.transition = "none";
        panel.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
        void panel.offsetWidth;
        panel.style.transition = "";
        panel.style.transform = "";
    }
    desktopPlayer.addEventListener("change", () => {
        if (!desktopPlayer.matches) modal.classList.remove("is-windowed");
    });

    function openFilm(link) {
        const id = link.dataset.vimeo;
        if (!/^\d+$/.test(id)) return;
        clearWindowTransition();
        panel.style.transform = "";
        panel.style.transition = "";
        lastFilmLink = link;
        title.textContent = link.dataset.title;
        // Sinopsis opcional (data-synopsis): como el reparto, la línea del pop-up
        // solo existe en las tarjetas que la llevan (DÁCIL / GROC va sin leyenda).
        synopsis.textContent = link.dataset.synopsis || "";
        synopsis.hidden = !synopsis.textContent;
        // Reparto opcional (data-cast): la línea solo existe en las tarjetas que lo llevan.
        cast.textContent = link.dataset.cast || "";
        cast.hidden = !cast.textContent;
        player.title = `${link.dataset.title} — Vimeo video`;
        modal.hidden = false;
        document.body.classList.add("modal-open");
        // Match Generated: Vimeo must paint its own opaque black background.
        // Parent CSS cannot style the cross-origin document inside the iframe.
        player.src = `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1&transparent=0`;
        closeButton.focus({ preventScroll: true });
        rotationEnabled = mobilePlayer.matches;
        previousLandscape = isLandscape();
        if (rotationEnabled) enterMobileFullscreen();
        else openDesktopWindow(link);
    }

    function closeFilm() {
        if (modal.hidden || closeTimer !== null) return;
        if (modal.classList.contains("is-windowed") && !reducedMotion.matches) {
            const to = lastFilmLink?.querySelector(".film-card__poster").getBoundingClientRect();
            const from = modal.getBoundingClientRect();
            if (to?.width > 0 && to.height > 0 && from.width > 0 && from.height > 0) {
                // Pause without unloading: keep the last frame visible on the way back.
                player.contentWindow?.postMessage({ method: "pause" }, "https://player.vimeo.com");
                modal.classList.add("is-closing");
                panel.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
                panel.addEventListener("transitionend", onWindowLanded);
                closeTimer = setTimeout(finishCloseFilm, 650);
                return;
            }
        }
        finishCloseFilm();
    }

    function finishCloseFilm() {
        clearWindowTransition();
        rotationEnabled = false;
        modal.classList.remove("is-windowed");
        panel.style.transition = "";
        panel.style.transform = "";
        leaveMobileFullscreen();
        modal.hidden = true;
        player.src = ""; // stop playback, even when closing via Escape or the backdrop
        document.body.classList.remove("modal-open");
        lastFilmLink?.focus({ preventScroll: true });
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
        if (modal.hidden) return;
        if (data?.event === "ready") {
            player.classList.add("is-ready");
            openingPoster?.remove();
            openingPoster = null;
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
