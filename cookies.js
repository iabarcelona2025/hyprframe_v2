/* ═══════════════════════════════════════════════════════════
   HYPRFRAME — consentimiento de cookies
   Widget autónomo (vanilla JS, sin dependencias). Inyecta el banner,
   guarda la decisión en localStorage y solo carga Google Analytics
   si el visitante acepta.

   Sustituye al gtag.js que legacy.html y project-node.html cargaban
   de forma incondicional en el <head>: ahora no se pide nada a
   Google hasta que hay un consentimiento explícito.
   ═══════════════════════════════════════════════════════════ */
(() => {
    "use strict";

    const STORAGE_KEY = "hfCookieConsent";
    const GA_ID = "G-6MW201KGC9";
    const REMEMBER_MS = 180 * 24 * 60 * 60 * 1000; // se vuelve a preguntar a los 6 meses

    /* ── Persistencia de la decisión ──────────────────────── */
    function readConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            // Consentimiento caducado: se borra y se vuelve a preguntar.
            if (typeof data.until !== "number" || Date.now() > data.until) {
                localStorage.removeItem(STORAGE_KEY);
                return null;
            }
            return data.value === "granted" || data.value === "denied" ? data.value : null;
        } catch (e) {
            return null; // JSON corrupto o storage bloqueado
        }
    }

    function writeConsent(value) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                value,
                until: Date.now() + REMEMBER_MS,
            }));
        } catch (e) { /* storage bloqueado: se preguntará en la próxima visita */ }
    }

    /* ── Google Analytics, solo tras aceptar ──────────────── */
    let analyticsRequested = false;

    function loadAnalytics() {
        if (analyticsRequested) return;
        analyticsRequested = true;

        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        window.gtag = function gtag() { window.dataLayer.push(arguments); };
        window.gtag("js", new Date());
        window.gtag("config", GA_ID);
    }

    /* ── Banner ───────────────────────────────────────────── */
    function buildBanner() {
        const banner = document.createElement("div");
        banner.className = "cookie-banner";
        banner.id = "cookieBanner";
        banner.setAttribute("role", "dialog");
        banner.setAttribute("aria-label", "Cookie consent");
        banner.setAttribute("aria-live", "polite");
        banner.innerHTML = `
            <p class="cookie-title">Cookies</p>
            <p class="cookie-text">
                We use our own cookies and Google Analytics to measure traffic.
                Accept them, or continue with technical cookies only.
            </p>
            <div class="cookie-actions">
                <button type="button" class="cookie-btn cookie-accept" data-consent="granted">Accept</button>
                <button type="button" class="cookie-btn cookie-reject" data-consent="denied">Essential only</button>
            </div>`;
        return banner;
    }

    // El cursor custom crece sobre los elementos interactivos, pero script.js
    // hace su binding al cargar y este banner se inyecta después: lo replicamos.
    function bindCursorGrow(banner) {
        if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
        banner.querySelectorAll("button").forEach((btn) => {
            btn.addEventListener("mouseenter", () => document.body.classList.add("cursor-large"));
            btn.addEventListener("mouseleave", () => document.body.classList.remove("cursor-large"));
        });
    }

    // En la landing no interrumpimos la intro: el banner entra cuando el
    // preloader termina (body.loaded). En el resto de páginas entra enseguida.
    function reveal(banner) {
        const show = () => requestAnimationFrame(() => banner.classList.add("show"));
        if (!document.getElementById("preloader") || document.body.classList.contains("loaded")) {
            show();
            return;
        }
        const observer = new MutationObserver(() => {
            if (!document.body.classList.contains("loaded")) return;
            observer.disconnect();
            show();
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    function hide(banner) {
        banner.classList.remove("show");
        banner.addEventListener("transitionend", () => banner.remove(), { once: true });
        // Si el usuario prefiere menos movimiento no hay transición que espere.
        setTimeout(() => banner.remove(), 600);
    }

    function decide(value, banner) {
        writeConsent(value);
        if (value === "granted") loadAnalytics();
        hide(banner);
        window.HFCookies.consent = value;
    }

    /* ── Arranque ─────────────────────────────────────────── */
    let consent = readConsent();

    // Decisión previa: se aplica sin mostrar nada.
    if (consent === "granted") loadAnalytics();

    const banner = consent ? null : buildBanner();
    if (banner) {
        banner.addEventListener("click", (event) => {
            const button = event.target.closest("[data-consent]");
            if (button) decide(button.dataset.consent, banner);
        });
        document.body.appendChild(banner);
        bindCursorGrow(banner);
        reveal(banner);
    }

    // API mínima, útil para depurar y para los tests.
    window.HFCookies = { consent, STORAGE_KEY, GA_ID, loadAnalytics };
})();
