/* HYPRFRAME / N.O.D.E. — navigation and on-demand film player. */
(() => {
    "use strict";

    /* ── Custom cursor (same behaviour as index.html) ────────── */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const dot = document.getElementById("cursorDot");
    const ring = document.getElementById("cursorRing");

    if (!isTouch && !reduced && dot && ring) {
        let mx = innerWidth / 2, my = innerHeight / 2;
        let rx = mx, ry = my;

        addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });

        (function cursorLoop() {
            rx += (mx - rx) * 0.16;
            ry += (my - ry) * 0.16;
            dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
            ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
            requestAnimationFrame(cursorLoop);
        })();

        document.querySelectorAll("a, button, .service-row, input, textarea").forEach((el) => {
            el.addEventListener("mouseenter", () => document.body.classList.add("cursor-large"));
            el.addEventListener("mouseleave", () => document.body.classList.remove("cursor-large"));
        });
    }

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

    const play = document.getElementById("playFilm");
    play.addEventListener("click", () => {
        const iframe = document.createElement("iframe");
        iframe.title = "N.O.D.E. teaser — HYPRFRAME";
        // The iframe's load event may fire before Vimeo paints its player (white flash).
        // Reveal it only when Vimeo itself reports that the player is ready.
        function onPlayerMessage(event) {
            if (event.origin !== "https://player.vimeo.com" || event.source !== iframe.contentWindow) return;
            let data;
            try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; }
            catch { return; }
            if (!data || data.event !== "ready") return;
            iframe.classList.add("is-ready");
            removeEventListener("message", onPlayerMessage);
        }
        addEventListener("message", onPlayerMessage);
        iframe.src = "https://player.vimeo.com/video/1227346538?autoplay=1&dnt=1&transparent=0";
        iframe.allow = "autoplay; fullscreen; picture-in-picture";
        iframe.setAttribute("allowfullscreen", "");
        document.getElementById("nodePlayer").replaceChildren(iframe);
        iframe.focus();
    });
})();
