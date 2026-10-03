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
                // html still has scroll-behavior:smooth here (smooth-scroll.js runs
                // after this file). A bare scrollBy would ease, and the expanding
                // thumbnail would be measured at the old center — 40px above the
                // film. Jump first, then aim the clone at the film's final box.
                const root = document.documentElement;
                const previousBehavior = root.style.scrollBehavior;
                root.style.scrollBehavior = "auto";
                player.scrollIntoView({ block: "center", behavior: "instant" });
                // Web only: raise the anchor 40px so the film, and the thumbnail
                // measured just below, land 40px lower. Mobile stays centered.
                if (window.matchMedia("(min-width: 561px)").matches) {
                    window.scrollBy(0, -40);
                    // Solo escritorio: en pantallas anchas la caja 16:9 (85.5% del
                    // viewport) es tan alta que centrarla deja el paginador
                    // (flechas + contador) por encima del viewport, tras la
                    // cabecera fija. Se recorta el scroll justo lo necesario para
                    // que el paginador quede visible bajo la cabecera, antes de
                    // medir la caja final del clon de la transición. (03/10/2026)
                    const pager = document.querySelector(".node-pager");
                    if (pager) {
                        const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
                        const clearance = headerBottom + 12;
                        const pagerTop = pager.getBoundingClientRect().top;
                        if (pagerTop < clearance) window.scrollBy(0, pagerTop - clearance);
                    }
                }
                root.style.scrollBehavior = previousBehavior;
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
    const mobileVideoQuery = window.matchMedia("(max-width: 560px)");
    const isMobileVideo = mobileVideoQuery.matches;

    /* Vimeo normally plays embeds inline on phones. playsinline=0 hands the
       play action to Vimeo's native player, and the Fullscreen API is requested
       as well — the browser's gray "how to exit" notice may show; that is
       accepted. Desktop does not use the Fullscreen API: the player box grows
       to the browser window (.is-windowed). Landscape is not locked, so the
       visitor can turn the phone back to portrait. */
    function requestMobileFullscreen(iframe) {
        if (!isMobileVideo) return;
        const request = iframe.requestFullscreen || iframe.webkitRequestFullscreen;
        if (typeof request !== "function") return;
        try {
            const pending = request.call(iframe);
            if (pending?.catch) pending.catch(() => {});
        } catch (err) { /* playsinline=0 still opens the native player */ }
    }
    function exitMobileFullscreen(iframe) {
        const exitDoc = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
        if (typeof exitDoc === "function") {
            try {
                const pending = exitDoc.call(document);
                if (pending?.catch) pending.catch(() => {});
            } catch (err) { /* already left, or the native player owns the screen */ }
        }
        try {
            iframe?.contentWindow?.postMessage({ method: "exitFullscreen" }, "https://player.vimeo.com");
        } catch (err) { /* the player frame may already be gone */ }
    }
    function isPortraitNow() {
        const type = window.screen?.orientation?.type;
        if (typeof type === "string" && type) return type.startsWith("portrait");
        if (typeof window.orientation === "number") return Math.abs(window.orientation) !== 90;
        return window.matchMedia("(orientation: portrait)").matches;
    }

    if (play && playerBox && vimeoId) {
        const pieceTitle = playerBox.dataset.title || document.title;
        const poster = [...playerBox.childNodes]; // opening title, still and play button, restored when the film ends
        const titleOverlay = playerBox.querySelector(".node-hero__title");
        // 03/10/2026 — Limpieza: el velo que oscurecía y desenfocaba la página
        // (pageDimmer / .film-page-dimmer / body.film-is-playing) se retiró:
        // la ventana del vídeo cubre el navegador y detrás no se veía nada.
        let playbackSpacer = null;
        let exitButton = null;
        let hoverShield = null;
        let dockCover = null;
        // Mobile: after 3s of playback, turning back to portrait leaves
        // fullscreen. Turning to landscape again during the same playback
        // asks for fullscreen once more. The phone is not locked, so both
        // turns stay possible.
        let mobileFs = false;
        let seenLandscape = false;
        let returnedToPortrait = false;
        let portraitExitArmed = false;
        let portraitExitTimer = 0;
        let sawDocumentFullscreen = false;
        function disarmPortraitExit() {
            clearTimeout(portraitExitTimer);
            portraitExitTimer = 0;
            portraitExitArmed = false;
            mobileFs = false;
            seenLandscape = false;
            returnedToPortrait = false;
        }
        function armPortraitExit() {
            if (!isMobileVideo || portraitExitArmed || portraitExitTimer) return;
            portraitExitTimer = setTimeout(() => {
                portraitExitTimer = 0;
                portraitExitArmed = true;
            }, 3000);
        }
        function playingIframe() {
            const iframe = playerBox.querySelector("iframe");
            if (!iframe || iframe.classList.contains("is-ending")) return null;
            if (!playerBox.classList.contains("is-playing")) return null;
            return iframe;
        }
        function reenterMobileFullscreen(iframe) {
            requestMobileFullscreen(iframe);
            try {
                iframe.contentWindow?.postMessage({ method: "requestFullscreen" }, "https://player.vimeo.com");
            } catch (err) { /* the player frame may already be gone */ }
        }
        function onMobileOrientation(forced) {
            if (!isMobileVideo) return;
            const portrait = forced === "portrait" || (forced !== "landscape" && isPortraitNow());
            const iframe = playingIframe();
            if (!portrait) {
                seenLandscape = true;
                if (!returnedToPortrait || mobileFs || !iframe) return;
                returnedToPortrait = false;
                mobileFs = true;
                reenterMobileFullscreen(iframe);
                return;
            }
            if (!iframe || !seenLandscape || !portraitExitArmed || !mobileFs) return;
            mobileFs = false;
            returnedToPortrait = true;
            exitMobileFullscreen(iframe);
        }
        function onDocumentFullscreen() {
            const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (on) {
                sawDocumentFullscreen = true;
                mobileFs = true;
                if (!isPortraitNow()) seenLandscape = true;
            } else if (sawDocumentFullscreen) {
                mobileFs = false;
            }
        }
        if (isMobileVideo) {
            addEventListener("orientationchange", () => onMobileOrientation());
            window.screen?.orientation?.addEventListener?.("change", () => onMobileOrientation());
            window.matchMedia("(orientation: portrait)").addEventListener?.("change", (event) => {
                if (event.matches) onMobileOrientation("portrait");
            });
            window.matchMedia("(orientation: landscape)").addEventListener?.("change", (event) => {
                if (event.matches) onMobileOrientation("landscape");
            });
            addEventListener("fullscreenchange", onDocumentFullscreen);
            addEventListener("webkitfullscreenchange", onDocumentFullscreen);
        }

        // Web only: cover the browser window without the Fullscreen API. A
        // spacer keeps the 16:9 hole so the page does not jump. The X stops
        // the film and puts the ficha back to the state before play.
        let detachPlayerMessages = null;
        function closePlayerWindow() {
            clearTimeout(windowOpenTimer);
            windowOpenTimer = null;
            playerBox.style.transform = "";
            playerBox.style.transition = "";
            playerBox.classList.remove("is-windowed");
            if (exitButton) {
                exitButton.remove();
                exitButton = null;
            }
            if (playbackSpacer) {
                playbackSpacer.remove();
                playbackSpacer = null;
            }
            if (hoverShield) {
                hoverShield.remove();
                hoverShield = null;
            }
            if (dockCover) {
                dockCover.remove();
                dockCover = null;
            }
        }
        function stopAndRestore() {
            disarmPortraitExit();
            if (detachPlayerMessages) {
                detachPlayerMessages();
                detachPlayerMessages = null;
            }
            if (windowCloseTimer !== null) return; // la ventana ya está volviendo a la caja
            /* Web (03/10/2026): la X (y Escape) deshacen la ampliación con el
               mismo efecto que la abrió, al contrario — la ventana vuelve, con
               la transición de transform de .is-windowed (0,5s), al rectángulo
               que guarda el spacer en la página, y el desmontaje espera a que
               aterrice. El vídeo se pausa antes para que el regreso sea
               silencioso, y la X, el escudo y el dock no viajan. Móvil y
               reduced-motion conservan el cierre inmediato. */
            if (!isMobileVideo && !reduced && playbackSpacer && playerBox.classList.contains("is-windowed")) {
                try {
                    playerBox.querySelector("iframe")?.contentWindow?.postMessage({ method: "pause" }, "https://player.vimeo.com");
                } catch (err) { /* el iframe puede haberse ido ya */ }
                if (exitButton) { exitButton.remove(); exitButton = null; }
                if (hoverShield) { hoverShield.remove(); hoverShield = null; }
                if (dockCover) { dockCover.remove(); dockCover = null; }
                const from = playerBox.getBoundingClientRect();
                const to = playbackSpacer.getBoundingClientRect();
                if (from.width >= 1 && from.height >= 1 && to.width >= 1 && to.height >= 1) {
                    playerBox.style.transformOrigin = "0 0";
                    playerBox.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
                    const finish = () => {
                        if (windowCloseTimer === null) return;
                        clearTimeout(windowCloseTimer);
                        windowCloseTimer = null;
                        playerBox.removeEventListener("transitionend", onLanded);
                        finishStopAndRestore();
                    };
                    const onLanded = (event) => {
                        if (event.target === playerBox && event.propertyName === "transform") finish();
                    };
                    playerBox.addEventListener("transitionend", onLanded);
                    windowCloseTimer = setTimeout(finish, 650); // red de seguridad si transitionend no llega
                    return;
                }
            }
            finishStopAndRestore();
        }
        function finishStopAndRestore() {
            const iframe = playerBox.querySelector("iframe");
            if (!playerBox.querySelector(".node-player__play")) playerBox.prepend(...poster);
            if (iframe) iframe.remove();
            closePlayerWindow();
            playerBox.classList.remove("is-playing");
            play.focus({ preventScroll: true });
        }
        let windowOpenTimer = null;
        let windowCloseTimer = null;
        function openPlayerWindow() {
            if (isMobileVideo || playerBox.classList.contains("is-windowed")) return;
            const from = playerBox.getBoundingClientRect();
            playbackSpacer = document.createElement("div");
            playbackSpacer.className = "node-player-spacer";
            playbackSpacer.setAttribute("aria-hidden", "true");
            playbackSpacer.style.height = `${playerBox.getBoundingClientRect().height}px`;
            playerBox.before(playbackSpacer);
            const spanish = document.documentElement.lang === "es";
            exitButton = document.createElement("button");
            exitButton.type = "button";
            exitButton.className = "node-player__exit";
            exitButton.setAttribute("aria-label", spanish ? "Cerrar vídeo" : "Close video");
            exitButton.addEventListener("click", (event) => {
                event.stopPropagation();
                stopAndRestore();
            });
            // The picture must not wake Vimeo's hover chrome (like / watch later /
            // share, top right). The bottom strip stays open so its controls work.
            hoverShield = document.createElement("div");
            hoverShield.className = "node-player__shield";
            hoverShield.setAttribute("aria-hidden", "true");
            dockCover = document.createElement("div");
            dockCover.className = "node-player__dock";
            dockCover.setAttribute("aria-hidden", "true");
            playerBox.append(hoverShield, dockCover, exitButton);
            playerBox.classList.add("is-windowed");
            // La caja ya ocupa la ventana. El primer frame la devuelve, con un
            // scale, al rectángulo medido; al soltarlo, la transición de
            // transform la amplía hasta el viewport. (03/10/2026)
            if (reduced) return;
            const to = playerBox.getBoundingClientRect();
            if (from.width < 1 || from.height < 1 || to.width < 1 || to.height < 1) return;
            const sx = from.width / to.width;
            const sy = from.height / to.height;
            playerBox.style.transformOrigin = "0 0";
            playerBox.style.transition = "none";
            playerBox.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
            void playerBox.offsetWidth;
            playerBox.style.transition = "";
            playerBox.style.transform = "";
        }
        // El fundido del título y la sinopsis (0,8s) tiene que acabar antes de
        // que la caja ocupe la ventana. En móvil no hay ampliación.
        function schedulePlayerWindow() {
            if (isMobileVideo || playerBox.classList.contains("is-windowed")) return;
            clearTimeout(windowOpenTimer);
            windowOpenTimer = setTimeout(() => {
                windowOpenTimer = null;
                if (!playerBox.classList.contains("is-playing")) return;
                openPlayerWindow();
            }, reduced ? 0 : 800);
        }
        addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || !playerBox.classList.contains("is-windowed")) return;
            if (document.body.classList.contains("menu-open")) return;
            event.preventDefault();
            stopAndRestore();
        });
        // Crossing into the mobile layout drops the window cover.
        mobileVideoQuery.addEventListener?.("change", () => {
            if (mobileVideoQuery.matches) closePlayerWindow();
        });

        // Sin velo que fundir (limpieza 03/10/2026): al acabar el vídeo basta
        // con soltar el estado de reproducción y dejar que título y sinopsis
        // vuelvan con su propia transición de opacidad.
        function clearPlayingLook() {
            playerBox.classList.remove("is-playing");
        }
        play.addEventListener("click", () => {
            playerBox.classList.add("is-playing");
            const iframe = document.createElement("iframe");
            iframe.title = `${pieceTitle} — HYPRFRAME`;
            const mobileFullscreenParam = isMobileVideo ? "&playsinline=0" : "";
            // sidedock / like / share / watch later: pide a Vimeo que no pinte
            // los botones de la esquina superior. controls no se toca: la barra
            // inferior sigue. Si la cuenta ignora el parámetro, el escudo y el
            // dock de la versión web cubren el mismo hueco.
            const hideTopActions = "&sidedock=0&like=0&share=0&watchlater=0&watch_later=0&embed=0&badge=0";
            iframe.src = `https://player.vimeo.com/video/${vimeoId}?autoplay=1&dnt=1&transparent=0${mobileFullscreenParam}${hideTopActions}`;
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
                    if (isMobileVideo) {
                        for (const name of ["play", "playing", "timeupdate", "fullscreenchange"]) {
                            iframe.contentWindow.postMessage({ method: "addEventListener", value: name }, "https://player.vimeo.com");
                        }
                    }
                } else if (data?.event === "play" || data?.event === "playing" || data?.event === "timeupdate") {
                    armPortraitExit();
                } else if (data?.event === "fullscreenchange") {
                    const on = !!data.data?.fullscreen;
                    if (on) {
                        mobileFs = true;
                        if (!isPortraitNow()) seenLandscape = true;
                    } else if (portraitExitArmed || sawDocumentFullscreen) {
                        mobileFs = false;
                    }
                } else if (data?.event === "ended") {
                    disarmPortraitExit();
                    removeEventListener("message", onPlayerMessage);
                    detachPlayerMessages = null;
                    const hadFocus = document.activeElement === iframe;
                    // Devuelve el fotograma DETRÁS del iframe sin desmontarlo: mover
                    // el iframe lo recargaría y perderíamos la imagen a enmascarar.
                    playerBox.prepend(...poster);
                    closePlayerWindow();
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
            detachPlayerMessages = () => removeEventListener("message", onPlayerMessage);
            if (titleOverlay) {
                // Keep the title node mounted so its opacity can animate instead
                // of disappearing instantly when replacing the poster contents.
                playerBox.insertBefore(iframe, titleOverlay.nextSibling);
                playerBox.querySelectorAll("img, .node-player__play").forEach((posterNode) => posterNode.remove());
            } else {
                playerBox.replaceChildren(iframe);
            }
            if (!isMobileVideo) schedulePlayerWindow();
            requestMobileFullscreen(iframe);
            if (isMobileVideo) {
                mobileFs = true;
                if (!isPortraitNow()) seenLandscape = true;
            }
            iframe.focus();
        });
    }
})();
