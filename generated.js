/* HYPRFRAME / GENERATED — brand navigation and on-demand film player shared by
   every page of the Generated section (N.O.D.E., Deep, Polestar 5, Distant,
   Exit Plan, Stained, Asics Vulcano, Farewell, IAD, Ryuu).
   Each page declares its own video with data-vimeo / data-title on .node-player. */
(() => {
    "use strict";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const header = document.getElementById("siteHeader");
    const progress = document.getElementById("scrollProgress");
    const burger = document.getElementById("burger");
    const overlay = document.getElementById("menuOverlay");

    function onScroll() {
        header.classList.toggle("scrolled", scrollY > 40);
        const max = document.documentElement.scrollHeight - innerHeight;
        progress.style.width = (max > 0 ? scrollY / max * 100 : 0) + "%";
    }
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    function toggleMenu(open) {
        document.body.classList.toggle("menu-open", open);
        burger.setAttribute("aria-expanded", String(open));
        burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        overlay.setAttribute("aria-hidden", String(!open));
        if (open) overlay.querySelector("a").focus();
        else burger.focus();
    }
    burger.addEventListener("click", () => toggleMenu(!document.body.classList.contains("menu-open")));
    overlay.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
        document.body.classList.remove("menu-open");
        burger.setAttribute("aria-expanded", "false");
        burger.setAttribute("aria-label", "Open menu");
        overlay.setAttribute("aria-hidden", "true");
    }));
    addEventListener("keydown", (event) => {
        if (!document.body.classList.contains("menu-open")) return;
        if (event.key === "Escape") toggleMenu(false);
        // Trap keyboard focus inside the mobile navigation while it is open.
        if (event.key !== "Tab") return;
        const links = [...overlay.querySelectorAll("a")];
        const first = links[0];
        const last = links[links.length - 1];
        if (event.shiftKey && document.activeElement === burger) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); burger.focus();
        }
    });

    /* ── On-demand player ─────────────────────────────────────
       The iframe is created only when the visitor presses play, and the opening
       still comes back when Vimeo reports the end of the piece. Which piece it is
       lives in the markup of each page: data-vimeo (id) and data-title (name) on
       the .node-player box, the same convention as the Captured film cards. */
    const play = document.getElementById("playFilm");
    const playerBox = play ? play.closest(".node-player") : null;
    const vimeoId = playerBox ? playerBox.dataset.vimeo : "";
    const isMobileVideo = window.matchMedia("(max-width: 560px)").matches;

    /* Vimeo normally plays embeds inline on phones. playsinline=0 hands the
       play action to Vimeo's native fullscreen player on mobile; desktop keeps
       the existing inline iframe. The Fullscreen API and orientation lock are
       best-effort fallbacks for mobile browsers that expose them. */
    function lockMobileLandscape() {
        if (!isMobileVideo || !window.screen?.orientation?.lock) return;
        try {
            const pending = window.screen.orientation.lock("landscape");
            if (pending?.catch) pending.catch(() => {});
        } catch (err) { /* orientation lock needs fullscreen on some browsers */ }
    }

    function requestMobileFullscreen(iframe) {
        if (!isMobileVideo) return;
        const request = iframe.requestFullscreen || iframe.webkitRequestFullscreen;
        if (typeof request === "function") {
            try {
                const pending = request.call(iframe);
                if (pending?.then) pending.then(lockMobileLandscape).catch(() => {});
            } catch (err) { /* Vimeo's playsinline=0 fallback still applies */ }
        }
        lockMobileLandscape();
    }

    if (play && playerBox && vimeoId) {
        const pieceTitle = playerBox.dataset.title || document.title;
        const poster = [...playerBox.childNodes]; // opening still + play button, restored when the film ends
        play.addEventListener("click", () => {
            const iframe = document.createElement("iframe");
            iframe.title = `${pieceTitle} — HYPRFRAME`;
            const mobileFullscreenParam = isMobileVideo ? "&playsinline=0" : "";
            iframe.src = `https://player.vimeo.com/video/${vimeoId}?autoplay=1&dnt=1&transparent=0${mobileFullscreenParam}`;
            iframe.allow = "autoplay; fullscreen; picture-in-picture";
            iframe.setAttribute("allowfullscreen", "");
            // The iframe's load event may fire before Vimeo paints its player (white flash).
            // Reveal it only when Vimeo itself reports that the player is ready, and ask it to
            // report the end as well: then the opening still and its play button come back.
            function onPlayerMessage(event) {
                if (event.origin !== "https://player.vimeo.com" || event.source !== iframe.contentWindow) return;
                let data;
                try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; }
                catch { return; }
                if (data?.event === "ready") {
                    iframe.classList.add("is-ready");
                    iframe.contentWindow.postMessage({ method: "addEventListener", value: "ended" }, "https://player.vimeo.com");
                } else if (data?.event === "ended") {
                    removeEventListener("message", onPlayerMessage);
                    const hadFocus = document.activeElement === iframe;
                    // Devuelve el fotograma DETRÁS del iframe sin desmontarlo: mover
                    // el iframe lo recargaría y perderíamos la imagen a enmascarar.
                    playerBox.prepend(...poster);
                    if (hadFocus) play.focus({ preventScroll: true });
                    if (reduced || !iframe.classList.contains("is-ready")) {
                        iframe.remove();
                        return;
                    }
                    iframe.setAttribute("aria-hidden", "true");
                    iframe.tabIndex = -1;
                    // Las bandas que destapaban la imagen en Selected Work se
                    // cierran aquí sobre el vídeo, dejando el fotograma debajo.
                    // Opacity asegura la salida si el navegador no soporta máscaras.
                    const finishExit = () => { clearTimeout(exitTimer); iframe.remove(); };
                    iframe.addEventListener("transitionend", (e) => {
                        if (e.target === iframe && e.propertyName === "opacity") finishExit();
                    });
                    const exitTimer = setTimeout(finishExit, 850); // pestaña oculta / sin transitionend
                    iframe.classList.add("is-ending");
                }
            }
            addEventListener("message", onPlayerMessage);
            playerBox.replaceChildren(iframe);
            requestMobileFullscreen(iframe);
            iframe.focus();
        });
    }
})();
