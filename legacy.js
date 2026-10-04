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

    // Match Generated: phones use Vimeo inline in the card, not the Captured modal.
    // Keep the initial layout decision stable while the device rotates.
    const mobileVideoQuery = window.matchMedia("(max-width: 560px)");
    const isMobileVideo = mobileVideoQuery.matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const VIMEO_ORIGIN = "https://player.vimeo.com";
    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
    let activeMobileFilm = null;
    let mobileFs = false;
    let lockOnNextFullscreen = false;
    let seenLandscape = false;
    let portraitExitArmed = false;
    let portraitExitTimer = 0;

    function isPortraitNow() {
        const type = window.screen?.orientation?.type;
        if (typeof type === "string" && type) return type.startsWith("portrait");
        if (typeof window.orientation === "number") return Math.abs(window.orientation) !== 90;
        return window.matchMedia("(orientation: portrait)").matches;
    }
    function unlockMobileOrientation() {
        try {
            const pending = window.screen?.orientation?.unlock?.();
            if (pending?.catch) pending.catch(() => {});
        } catch { /* The browser may not support orientation locking. */ }
    }
    function requestIframeFullscreen(iframe, release) {
        if (!isMobileVideo) return;
        const request = iframe.requestFullscreen || iframe.webkitRequestFullscreen;
        if (typeof request !== "function") return; // playsinline=0 is the iOS fallback.
        try {
            const pending = request.call(iframe);
            if (pending?.catch) pending.catch(() => { if (release) release(); });
        } catch { if (release) release(); }
    }
    function forceMobileLandscape() {
        if (!lockOnNextFullscreen || !isMobileVideo || !isPortraitNow()) return;
        const orientation = window.screen?.orientation;
        if (typeof orientation?.lock !== "function") return;
        try {
            const pending = orientation.lock("landscape");
            if (pending?.catch) pending.catch(() => {});
        } catch { /* Vimeo's native player handles rotation when lock() is unavailable. */ }
        lockOnNextFullscreen = false;
    }
    function exitMobileFullscreen(iframe) {
        lockOnNextFullscreen = false;
        mobileFs = false;
        unlockMobileOrientation();
        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
        if (fullscreenElement() === iframe && typeof exit === "function") {
            try {
                const pending = exit.call(document);
                if (pending?.catch) pending.catch(() => {});
            } catch { /* Vimeo may own the native fullscreen surface. */ }
        }
        try { iframe?.contentWindow?.postMessage({ method: "exitFullscreen" }, VIMEO_ORIGIN); }
        catch { /* The player frame may already be gone. */ }
    }
    function disarmPortraitExit() {
        window.clearTimeout(portraitExitTimer);
        portraitExitTimer = 0;
        portraitExitArmed = false;
        lockOnNextFullscreen = false;
        mobileFs = false;
        seenLandscape = false;
        unlockMobileOrientation();
    }
    function armPortraitExit() {
        if (!isMobileVideo || portraitExitArmed || portraitExitTimer) return;
        portraitExitTimer = window.setTimeout(() => {
            portraitExitTimer = 0;
            portraitExitArmed = true;
        }, 3000);
    }
    function onMobileOrientation(forced) {
        if (!isMobileVideo || !activeMobileFilm) return;
        const portrait = forced === "portrait" || (forced !== "landscape" && isPortraitNow());
        const iframe = activeMobileFilm.iframe;
        if (!portrait) {
            seenLandscape = true;
            if (mobileFs) return;
            mobileFs = true;
            requestIframeFullscreen(iframe, () => { mobileFs = false; });
            try { iframe.contentWindow?.postMessage({ method: "requestFullscreen" }, VIMEO_ORIGIN); }
            catch { /* Vimeo may have already closed the player. */ }
            return;
        }
        if (!seenLandscape || !portraitExitArmed || !mobileFs) return;
        exitMobileFullscreen(iframe);
    }
    function onDocumentFullscreen() {
        if (!isMobileVideo || !activeMobileFilm) return;
        if (fullscreenElement()) {
            mobileFs = true;
            if (!isPortraitNow()) seenLandscape = true;
            forceMobileLandscape();
        } else {
            mobileFs = false;
            unlockMobileOrientation();
        }
    }
    function onFullscreenError() { mobileFs = false; }
    if (isMobileVideo) {
        window.addEventListener("orientationchange", () => onMobileOrientation());
        window.screen?.orientation?.addEventListener?.("change", () => onMobileOrientation());
        window.matchMedia("(orientation: portrait)").addEventListener?.("change", (event) => {
            if (event.matches) onMobileOrientation("portrait");
        });
        window.matchMedia("(orientation: landscape)").addEventListener?.("change", (event) => {
            if (event.matches) onMobileOrientation("landscape");
        });
        document.addEventListener("fullscreenchange", onDocumentFullscreen);
        document.addEventListener("webkitfullscreenchange", onDocumentFullscreen);
        document.addEventListener("fullscreenerror", onFullscreenError);
    }

    const panel = modal.querySelector(".film-modal__panel");
    const desktopPlayer = window.matchMedia("(min-width: 561px)");
    for (const name of ["shield", "dock"]) {
        const layer = document.createElement("div");
        layer.className = `film-modal__${name}`;
        layer.setAttribute("aria-hidden", "true");
        panel.append(layer);
    }
    const videoBox = modal.querySelector(".film-modal__video");
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
        // El fotograma que destapan las cortinillas solo vive mientras el vídeo
        // se cierra: si la ventana se vuelve a abrir o se cierra, se retira.
        videoBox.querySelector(".film-modal__exit-still")?.remove();
        player.classList.remove("is-ready", "is-ending");
    }
    // Cortinillas de salida: el cartel de la tarjeta vuelve a montarse DETRÁS
    // del iframe (sin recargarlo, que perdería el último fotograma) para que las
    // bandas lo destapen al cerrarse, igual que en GENERATED.
    function showExitStill() {
        if (!lastFilmLink || videoBox.querySelector(".film-modal__exit-still")) return;
        const poster = lastFilmLink.querySelector(".film-card__poster img");
        if (!poster) return;
        const still = poster.cloneNode();
        still.className = "film-modal__exit-still";
        still.alt = "";
        still.removeAttribute("loading");
        still.setAttribute("aria-hidden", "true");
        videoBox.prepend(still);
    }
    function onWindowLanded(event) {
        if (event.target === panel && event.propertyName === "transform") finishCloseFilm();
    }
    function openDesktopWindow(link) {
        if (!desktopPlayer.matches) return;
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

    function stopMobileFilm(film = activeMobileFilm) {
        if (!film) return;
        if (activeMobileFilm === film) activeMobileFilm = null;
        window.removeEventListener("message", film.onMessage);
        disarmPortraitExit();
        film.link.classList.remove("is-mobile-playing");
        try { film.iframe.contentWindow?.postMessage({ method: "pause" }, VIMEO_ORIGIN); }
        catch { /* The iframe may already have closed. */ }
        exitMobileFullscreen(film.iframe);
        film.iframe.src = "";
        film.iframe.remove();
    }

    function finishMobileFilm(film) {
        if (activeMobileFilm !== film) return;
        activeMobileFilm = null;
        window.removeEventListener("message", film.onMessage);
        disarmPortraitExit();
        film.link.classList.remove("is-mobile-playing");
        if (fullscreenElement() === film.iframe) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
            try { exit?.call(document)?.catch?.(() => {}); }
            catch { /* Vimeo may have already left fullscreen. */ }
        }
        try { film.iframe.contentWindow?.postMessage({ method: "exitFullscreen" }, VIMEO_ORIGIN); }
        catch { /* The player frame may already have closed. */ }

        const iframe = film.iframe;
        const remove = () => {
            window.clearTimeout(endTimer);
            iframe.removeEventListener("transitionend", onFadeOut);
            iframe.remove();
            iframe.src = "";
        };
        let endTimer = 0;
        const onFadeOut = (event) => {
            if (event.target === iframe && event.propertyName === "opacity") remove();
        };
        if (reducedMotion.matches || !iframe.classList.contains("is-ready")) {
            remove();
            return;
        }
        iframe.setAttribute("aria-hidden", "true");
        iframe.tabIndex = -1;
        iframe.classList.add("is-ending");
        iframe.addEventListener("transitionend", onFadeOut);
        endTimer = window.setTimeout(remove, 750);
    }

    function playMobileFilm(link) {
        const id = link.dataset.vimeo;
        const poster = link.querySelector(".film-card__poster");
        if (!/^\d+$/.test(id) || !poster) return;
        if (activeMobileFilm?.link === link) return;
        if (activeMobileFilm) stopMobileFilm(activeMobileFilm);

        const iframe = document.createElement("iframe");
        iframe.className = "film-card__mobile-player";
        iframe.title = `${link.dataset.title || "Captured film"} — Vimeo video`;
        iframe.src = `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1&transparent=0&playsinline=0&sidedock=0&like=0&share=0&watchlater=0&watch_later=0&embed=0&badge=0`;
        iframe.allow = "autoplay; fullscreen; picture-in-picture";
        iframe.setAttribute("allowfullscreen", "");

        const film = { link, iframe, onMessage: null };
        activeMobileFilm = film;
        link.classList.add("is-mobile-playing");
        film.onMessage = (event) => {
            if (activeMobileFilm !== film || event.origin !== VIMEO_ORIGIN || event.source !== iframe.contentWindow) return;
            let data = event.data;
            if (typeof data === "string") {
                try { data = JSON.parse(data); } catch { return; }
            }
            if (data?.event === "ready") {
                iframe.classList.add("is-ready");
                for (const name of ["ended", "play", "playing", "timeupdate", "fullscreenchange"]) {
                    iframe.contentWindow.postMessage({ method: "addEventListener", value: name }, VIMEO_ORIGIN);
                }
            } else if (data?.event === "play" || data?.event === "playing" || data?.event === "timeupdate") {
                armPortraitExit();
            } else if (data?.event === "fullscreenchange") {
                if (data.data?.fullscreen) {
                    mobileFs = true;
                    if (!isPortraitNow()) seenLandscape = true;
                    else lockOnNextFullscreen = true;
                    forceMobileLandscape();
                } else {
                    lockOnNextFullscreen = false;
                    mobileFs = false;
                    unlockMobileOrientation();
                }
            } else if (data?.event === "ended") {
                finishMobileFilm(film);
            }
        };
        window.addEventListener("message", film.onMessage);
        poster.append(iframe);

        mobileFs = true;
        lockOnNextFullscreen = isPortraitNow();
        seenLandscape = !isPortraitNow();
        requestIframeFullscreen(iframe, () => { mobileFs = false; });
        forceMobileLandscape();
        iframe.focus({ preventScroll: true });
    }

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
        openDesktopWindow(link);
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

    // Al acabar la película el vídeo no se corta en seco: como en GENERATED,
    // las bandas diagonales de 102° se cierran sobre el último fotograma
    // (paúsado por closeFilm) mientras la ventana vuelve a su tarjeta. Con
    // movimiento reducido, o si Vimeo todavía no ha dado su "ready", no hay
    // imagen que tapar y la ventana se cierra como antes.
    function closeEndedFilm() {
        if (reducedMotion.matches || !player.classList.contains("is-ready")) {
            closeFilm();
            return;
        }
        showExitStill();
        player.classList.add("is-ending");
        closeFilm();
    }

    function finishCloseFilm() {
        clearWindowTransition();
        modal.classList.remove("is-windowed");
        panel.style.transition = "";
        panel.style.transform = "";
        modal.hidden = true;
        player.src = ""; // stop playback, even when closing via Escape or the backdrop
        document.body.classList.remove("modal-open");
        lastFilmLink?.focus({ preventScroll: true });
    }

    document.querySelectorAll(".film-card").forEach((link) => {
        link.addEventListener("click", (event) => {
            // Keep Ctrl/Cmd-click, Shift-click and the no-JS fallback to Vimeo working.
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (!/^\d+$/.test(link.dataset.vimeo)) return;
            event.preventDefault();
            if (isMobileVideo) playMobileFilm(link);
            else openFilm(link);
        });
    });
    closeButton.addEventListener("click", closeFilm);
    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeFilm();
    });

    // Close the pop-up as soon as the film ends. This is the postMessage protocol behind
    // Vimeo's player.js: once the player reports "ready", ask it to report "ended" too.
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
            closeEndedFilm();
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
