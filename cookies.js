/* ═══════════════════════════════════════════════════════════
   HYPRFRAME — consentimiento de cookies
   Widget autónomo (vanilla JS, sin dependencias). Inyecta el banner y
   guarda la decisión del visitante en localStorage.

   NO toca Google Analytics: el gtag.js de legacy.html y las páginas de
   proyecto se mantiene tal cual, y este widget nunca inyecta un segundo
   gtag. Registra la preferencia (window.HFCookies.consent) y la comunica
   a Google vía Consent Mode v2 (ver el interruptor más abajo).
   ═══════════════════════════════════════════════════════════ */
(() => {
    "use strict";

    const STORAGE_KEY = "hfCookieConsent";
    const REMEMBER_MS = 180 * 24 * 60 * 60 * 1000; // se vuelve a preguntar a los 6 meses

    /* ── Consent Mode v2 de Google — ACTIVADO ───────────────
       El interruptor vive en el <head> de cada página, justo encima del
       gtag.js: `window.HYPRFRAME_CONSENT_MODE = true` declara los consent
       defaults globales en 'denied' (Google no deja cookies hasta que el
       visitante acepta) y este widget comunica la decisión con
       gtag('consent','update'). Con false el cableado se apaga sin tocar
       el gtag.js. */
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
        const isEs = document.documentElement.lang === "es" || (typeof location !== "undefined" && location.pathname && location.pathname.includes("/es/"));
        const banner = document.createElement("div");
        banner.className = "cookie-banner";
        banner.id = "cookieBanner";
        banner.setAttribute("role", "dialog");
        banner.setAttribute("aria-label", isEs ? "Consentimiento de cookies" : "Cookie consent");
        banner.setAttribute("aria-live", "polite");
        banner.innerHTML = `
            <p class="cookie-title">Cookies</p>
            <p class="cookie-text">
                ${isEs
                    ? "Utilizamos cookies propias y de Google Analytics para medir el tráfico. Acéptalas o continúa únicamente con las cookies técnicas."
                    : "We use our own cookies and Google Analytics to measure traffic. Accept them, or continue with technical cookies only."}
            </p>
            <div class="cookie-actions">
                <button type="button" class="cookie-btn cookie-accept" data-consent="granted">${isEs ? "Aceptar" : "Accept"}</button>
                <button type="button" class="cookie-btn cookie-reject" data-consent="denied">${isEs ? "Solo esenciales" : "Essential only"}</button>
            </div>`;
        return banner;
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
        reveal(banner);
    }

    // API mínima, útil para depurar y para los tests.
    window.HFCookies = { consent, STORAGE_KEY, CONSENT_MODE };
})();
