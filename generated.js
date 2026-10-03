/* HYPRFRAME / GENERATED — brand navigation and on-demand film player shared by
   every page of the Generated section (N.O.D.E., Deep, Polestar 5, Distant,
   Exit Plan, Stained, Asics Vulcano, Farewell, IAD, Ryuu).
   Each page declares its own video with data-vimeo / data-title on .node-player. */
(() => {
    "use strict";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Pager navigation preserves the same document scroll coordinate, so the
    // next/previous project's opener and video stay at the same viewport height.
    const PAGER_SCROLL_KEY = "hfGeneratedPagerScroll";
    try {
        const savedScroll = sessionStorage.getItem(PAGER_SCROLL_KEY);
        if (savedScroll !== null) {
            sessionStorage.removeItem(PAGER_SCROLL_KEY);
            const y = Number(savedScroll);
            if (Number.isFinite(y)) {
                const root = document.documentElement;
                const previousBehavior = root.style.scrollBehavior;
                root.style.scrollBehavior = "auto";
                window.scrollTo(0, y);
                requestAnimationFrame(() => { root.style.scrollBehavior = previousBehavior; });
            }
        }
        document.querySelectorAll(".node-pager a").forEach((link) => {
            link.addEventListener("click", (event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                sessionStorage.setItem(PAGER_SCROLL_KEY, String(window.scrollY));
            });
        });
    } catch (_) { /* Storage disabled: standard link navigation still works. */ }

    const header = document.getElementById("siteHeader");
    const progress = document.getElementById("scrollProgress");
    const burger = document.getElementById("burger");
    const overlay = document.getElementById("menuOverlay");

    function onScroll() {
        header.classList.add("scrolled");
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
    // Arrival: keep the page black while the landing still travels into the
    // video poster, then fade the page in. Header and progress bar sit above black.
    try {
        const raw = sessionStorage.getItem("hfGeneratedTransition");
        if (raw) {
            sessionStorage.removeItem("hfGeneratedTransition");
            const origin = JSON.parse(raw);
            const player = document.querySelector(".node-player");
            const image = player?.querySelector("img");
            if (player && image && image.getAttribute("src") === origin.image) {
                if (origin.position) image.style.objectPosition = origin.position;
                const black = document.createElement("div");
                black.className = "hf-entry-black";
                document.body.append(black);
                const layer = document.createElement("div");
                layer.className = "work-transition work-transition--arrival";
                layer.style.cssText = `left:${origin.left}px;top:${origin.top}px;width:${origin.width}px;height:${origin.height}px;background-image:url('${origin.image}');background-position:${origin.position || "center"};`;
                document.body.append(layer);
                player.scrollIntoView({ block: "center", behavior: "instant" });
                const target = player.getBoundingClientRect();
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    layer.style.left = `${target.left}px`;
                    layer.style.top = `${target.top}px`;
                    layer.style.width = `${target.width}px`;
                    layer.style.height = `${target.height}px`;
                    layer.classList.add("is-opening");
                    setTimeout(() => {
                        layer.classList.add("is-dissolving");
                        setTimeout(() => layer.remove(), 230);
                    }, 420);
                    setTimeout(() => {
                        black.classList.add("is-fading");
                        setTimeout(() => black.remove(), 620);
                    }, 200);
                }));
            }
        }
    } catch (_) { /* Storage can be disabled; preserve regular navigation. */ }

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

    // On desktop, fullscreen the whole 16:9 player box; on mobile Vimeo keeps
    // using its existing native fullscreen flow.
    function requestDesktopFullscreen(player) {
        if (isMobileVideo) return;
        const request = player.requestFullscreen || player.webkitRequestFullscreen;
        if (typeof request !== "function") return;
        try {
            const pending = request.call(player);
            if (pending?.catch) pending.catch(() => {});
        } catch (err) { /* Fullscreen can be denied by browser policy. */ }
    }

    function exitPlayerFullscreen(player) {
        const current = document.fullscreenElement || document.webkitFullscreenElement;
        if (current !== player) return;
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (typeof exit !== "function") return;
        try {
            const pending = exit.call(document);
            if (pending?.catch) pending.catch(() => {});
        } catch (err) { /* Best-effort cleanup after the film ends. */ }
    }

    if (play && playerBox && vimeoId) {
        const pieceTitle = playerBox.dataset.title || document.title;
        const poster = [...playerBox.childNodes]; // opening title, still and play button, restored when the film ends
        const titleOverlay = playerBox.querySelector(".node-hero__title");
        let pageDimmer = null;
        function clearPlayingLook() {
            if (pageDimmer) {
                const dimmer = pageDimmer;
                pageDimmer = null;
                dimmer.classList.add("is-clearing");
                setTimeout(() => {
                    dimmer.remove();
                    playerBox.classList.remove("is-playing");
                    document.body.classList.remove("film-is-playing");
                }, reduced ? 20 : 1050);
            } else {
                playerBox.classList.remove("is-playing");
                document.body.classList.remove("film-is-playing");
            }
        }
        play.addEventListener("click", () => {
            document.body.classList.add("film-is-playing");
            playerBox.classList.add("is-playing");
            pageDimmer = document.createElement("div");
            pageDimmer.className = "film-page-dimmer";
            pageDimmer.setAttribute("aria-hidden", "true");
            document.body.append(pageDimmer);
            const activeDimmer = pageDimmer;
            requestAnimationFrame(() => activeDimmer.classList.add("is-visible"));
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
                    exitPlayerFullscreen(playerBox);
                    clearPlayingLook();
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
            if (titleOverlay) {
                // Keep the title node mounted so its opacity can animate instead
                // of disappearing instantly when replacing the poster contents.
                playerBox.insertBefore(iframe, titleOverlay.nextSibling);
                playerBox.querySelectorAll("img, .node-player__play").forEach((posterNode) => posterNode.remove());
            } else {
                playerBox.replaceChildren(iframe);
            }
            requestMobileFullscreen(iframe);
            requestDesktopFullscreen(playerBox);
            iframe.focus();
        });
    }
})();
