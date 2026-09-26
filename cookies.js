/* ═══════════════════════════════════════════════════════════
   HYPRFRAME — consentimiento de cookies
   Widget autónomo (vanilla JS, sin dependencias). Inyecta el banner y
   guarda la decisión del visitante en localStorage.

   NO toca Google Analytics: el gtag.js de legacy.html y project-node.html
   se mantiene tal cual, y este widget nunca inyecta un segundo gtag.
   Aquí solo se registra la preferencia (window.HFCookies.consent), lista
   para cablearla a lo que se decida (p. ej. Consent Mode de Google).
   ═══════════════════════════════════════════════════════════ */
(() => {
    "use strict";

    const STORAGE_KEY = "hfCookieConsent";
    const REMEMBER_MS = 180 * 24 * 60 * 60 * 1000; // se vuelve a preguntar a los 6 meses

    /* ── Consent Mode v2 de Google — APAGADO ────────────────
       El interruptor vive en el <head> de cada página, justo encima del
       gtag.js: `window.HYPRFRAME_CONSENT_MODE = false`.
       Para activarlo al pasar a producción basta con ponerlo a true: los
       consent defaults se declararán antes de cargar gtag y este widget
       comunicará la decisión del visitante. El gtag.js no se modifica. */
    const CONSENT_MODE = window.HYPRFRAME_CONSENT_MODE === true;

    function applyConsent(value) {
        if (!CONSENT_MODE || typeof window.gtag !== "function") return;
        const state = value === "granted" ? "granted" : "denied";
        window.gtag("consent", "update", {
            analytics_storage: state,
            ad_storage: state,
        });
    }

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
        applyConsent(value);
        hide(banner);
        window.HFCookies.consent = value;
    }

    /* ── Arranque ─────────────────────────────────────────── */
    // Si ya hay una decisión vigente no se muestra nada, pero se comunica
    // igual a Google (solo cuando el Consent Mode está activado).
    const consent = readConsent();
    if (consent) applyConsent(consent);
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
    window.HFCookies = { consent, STORAGE_KEY, CONSENT_MODE };
})();
