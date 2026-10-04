/* ═══════════════════════════════════════════════════════════
   HYPRFRAME — consentimiento de cookies
   Widget autónomo (vanilla JS, sin dependencias). Inyecta la barra de
   consentimiento y guarda la decisión del visitante en localStorage.

   Conformidad (LSSI-CE art. 22.2 y RGPD):
   · Aceptar y rechazar están al mismo nivel: los dos botones viven en la
     primera capa, con el mismo tamaño y sin pasos intermedios. Nada viene
     premarcado y no se carga analítica antes de decidir.
   · La decisión se pide por finalidades — técnicas (siempre activas) y
     analítica (apagada por defecto) — y se puede cambiar o retirar en
     cualquier momento desde «Cookie settings» / «Configurar cookies», en el
     pie de todas las páginas (RGPD art. 7.3).
   · El registro guarda la fecha, la versión del texto y las finalidades
     aceptadas, para poder demostrar el consentimiento (RGPD art. 7.1).

   NO toca Google Analytics: el gtag.js de legacy.html y las páginas de
   proyecto se mantiene tal cual, y este widget nunca inyecta un segundo
   gtag. Registra la preferencia (window.HFCookies.consent) y la comunica
   a Google vía Consent Mode v2 (ver el interruptor más abajo).
   ═══════════════════════════════════════════════════════════ */
(() => {
    "use strict";

    const STORAGE_KEY = "hfCookieConsent";
    const REMEMBER_MS = 180 * 24 * 60 * 60 * 1000; // se vuelve a preguntar a los 6 meses
    const RECORD_VERSION = 2;  // súbelo si cambian el texto o las finalidades
    /* Relativo a propósito: la política vive en la raíz y en /es/, así que el
       mismo href resuelve a /cookie-policy.html o a /es/cookie-policy.html. */
    const POLICY_URL = "cookie-policy.html";

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

    /* ── Textos ───────────────────────────────────────────── */
    function isSpanish() {
        if (document.documentElement.lang === "es") return true;
        return typeof location !== "undefined" && /\/es\//.test(location.pathname || "");
    }

    const TEXTS = {
        en: {
            label: "Cookie consent",
            text: "This website uses cookies. For more information, see our",
            link: "Cookie Policy",
            accept: "Accept",
            reject: "Decline",
            config: "Preferences",
            prefsLabel: "Cookie preferences",
            necessary: "Strictly necessary",
            necessaryState: "Always on",
            necessaryDesc: "Required to browse the site, remember your choice and send the contact form. They do not identify you.",
            analyticsName: "Analytics",
            analyticsDesc: "Google Analytics 4 (G-6MW201KGC9): aggregated statistics about visits, to know which pages work. Only loads if you accept.",
            save: "Save preferences",
        },
        es: {
            label: "Consentimiento de cookies",
            text: "Este sitio web usa cookies. Para más información, consulta nuestra",
            link: "Política de cookies",
            accept: "Aceptar",
            reject: "Rechazar",
            config: "Preferencias",
            prefsLabel: "Preferencias de cookies",
            necessary: "Técnicas o necesarias",
            necessaryState: "Siempre activas",
            necessaryDesc: "Imprescindibles para navegar, recordar tu decisión y enviar el formulario de contacto. No te identifican.",
            analyticsName: "Analítica",
            analyticsDesc: "Google Analytics 4 (G-6MW201KGC9): estadísticas agregadas de visitas, para saber qué páginas funcionan. Solo se carga si aceptas.",
            save: "Guardar preferencias",
        },
    };

    const t = () => (isSpanish() ? TEXTS.es : TEXTS.en);

    /* ── Persistencia de la decisión ──────────────────────── */
    // El registro es { value, purposes, until, ts, v }. Los registros de la
    // versión anterior ({ value, until }) se siguen leyendo: se reinterpretan
    // como una decisión global sobre todas las finalidades.
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
            if (data.value !== "granted" && data.value !== "denied") return null;
            const analytics = data.purposes && typeof data.purposes.analytics === "boolean"
                ? data.purposes.analytics
                : data.value === "granted";
            return {
                value: data.value,
                purposes: { necessary: true, analytics },
                ts: typeof data.ts === "number" ? data.ts : null,
                v: typeof data.v === "number" ? data.v : 1,
            };
        } catch (e) {
            return null; // JSON corrupto o storage bloqueado
        }
    }

    function writeConsent(value, analytics) {
        const record = {
            value,
            purposes: { necessary: true, analytics: !!analytics },
            ts: Date.now(),
            v: RECORD_VERSION,
            until: Date.now() + REMEMBER_MS,
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        } catch (e) { /* storage bloqueado: se preguntará en la próxima visita */ }
        return record;
    }

    /* ── Barra de consentimiento y panel de preferencias ──── */
    function buildBanner() {
        const s = t();
        const banner = document.createElement("div");
        banner.className = "cookie-banner";
        banner.id = "cookieBanner";
        banner.setAttribute("role", "dialog");
        banner.setAttribute("aria-label", s.label);
        banner.setAttribute("aria-live", "polite");
        banner.innerHTML = `
            <div class="cookie-bar">
                <p class="cookie-text">
                    ${s.text}
                    <a class="cookie-link" href="${POLICY_URL}">${s.link}</a>.
                </p>
                <div class="cookie-actions">
                    <button type="button" class="cookie-btn cookie-accept" data-consent="granted">${s.accept}</button>
                    <button type="button" class="cookie-btn cookie-reject" data-consent="denied">${s.reject}</button>
                    <button type="button" class="cookie-config" data-cookie-config aria-expanded="false" aria-controls="cookiePrefs">${s.config}</button>
                </div>
            </div>
            <div class="cookie-prefs" id="cookiePrefs" role="group" aria-label="${s.prefsLabel}" hidden>
                <div class="cookie-purpose cookie-purpose-fixed">
                    <p class="cookie-purpose-head">
                        <span class="cookie-purpose-name">${s.necessary}</span>
                        <span class="cookie-purpose-state">${s.necessaryState}</span>
                    </p>
                    <p class="cookie-purpose-desc">${s.necessaryDesc}</p>
                </div>
                <div class="cookie-purpose">
                    <label class="cookie-purpose-head" for="cookieAnalytics">
                        <span class="cookie-purpose-name">${s.analyticsName}</span>
                        <input class="cookie-toggle" type="checkbox" id="cookieAnalytics" data-purpose="analytics" />
                    </label>
                    <p class="cookie-purpose-desc">${s.analyticsDesc}</p>
                </div>
                <div class="cookie-actions">
                    <button type="button" class="cookie-btn cookie-save" data-cookie-save>${s.save}</button>
                </div>
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

    function syncPrefs(banner, record) {
        const toggle = banner.querySelector("[data-purpose='analytics']");
        if (toggle) toggle.checked = !!(record && record.purposes.analytics);
    }

    function decide(value, banner, analytics) {
        const record = writeConsent(value, analytics);
        applyConsent(record.purposes.analytics ? "granted" : "denied");
        hide(banner);
        api.consent = record.value;
        api.record = record;
    }

    /* Reabre la barra de preferencias desde el botón «Cookie settings» /
       «Configurar cookies» del pie y desde la API pública. */
    function open() {
        let banner = document.getElementById("cookieBanner");
        if (!banner) {
            banner = buildBanner();
            banner.addEventListener("click", onClick);
            document.body.appendChild(banner);
            syncPrefs(banner, api.record);
            reveal(banner);
        } else {
            banner.hidden = false;
            requestAnimationFrame(() => banner.classList.add("show"));
        }
        const first = banner.querySelector(".cookie-accept");
        if (first && typeof first.focus === "function") first.focus();
        return banner;
    }

    /* Guarda una decisión sin pasar por la barra: lo usa el interruptor de
       analítica de la página de política de cookies. */
    function set(analytics) {
        const record = writeConsent(analytics ? "granted" : "denied", analytics);
        applyConsent(record.purposes.analytics ? "granted" : "denied");
        api.consent = record.value;
        api.record = record;
        return record;
    }

    function reset() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* nada que borrar */ }
        api.consent = null;
        api.record = null;
        return open();
    }

    function onClick(event) {
        const banner = event.currentTarget;
        const button = event.target.closest("[data-consent]");
        if (button) {
            decide(button.dataset.consent, banner, button.dataset.consent === "granted");
            return;
        }
        if (event.target.closest("[data-cookie-config]")) {
            const prefs = banner.querySelector("#cookiePrefs");
            const trigger = banner.querySelector("[data-cookie-config]");
            const openNow = prefs.hidden;
            prefs.hidden = !openNow;
            trigger.setAttribute("aria-expanded", String(openNow));
            if (openNow) syncPrefs(banner, api.record);
            return;
        }
        if (event.target.closest("[data-cookie-save]")) {
            const toggle = banner.querySelector("[data-purpose='analytics']");
            const analytics = !!(toggle && toggle.checked);
            decide(analytics ? "granted" : "denied", banner, analytics);
        }
    }

    /* ── Arranque ─────────────────────────────────────────── */
    // Si ya hay una decisión vigente no se muestra nada, pero se comunica
    // igual a Google (solo cuando el Consent Mode está activado).
    const consent = readConsent();
    if (consent) applyConsent(consent.purposes.analytics ? "granted" : "denied");

    // API mínima, útil para depurar, para el pie de página y para los tests.
    const api = {
        consent: consent ? consent.value : null,
        record: consent,
        STORAGE_KEY,
        CONSENT_MODE,
        POLICY_URL,
        RECORD_VERSION,
        REMEMBER_MS,
        read: readConsent,
        set,
        open,
        reset,
    };
    window.HFCookies = api;

    if (!consent) {
        const banner = buildBanner();
        banner.addEventListener("click", onClick);
        document.body.appendChild(banner);
        reveal(banner);
    }

    // Retirada del consentimiento desde el pie, delegado para todas las páginas.
    document.addEventListener("click", (event) => {
        if (event.target.closest("[data-cookie-settings]")) {
            event.preventDefault();
            open();
        }
    });

    /* Interruptores de la página de política de cookies: reflejan la decisión
       guardada y la actualizan al cambiarlos (vía de retirada o de alta). */
    function syncPolicyToggles() {
        document.querySelectorAll("[data-cookie-policy-toggle]").forEach((input) => {
            input.checked = !!(api.record && api.record.purposes.analytics);
        });
    }
    document.addEventListener("change", (event) => {
        const input = event.target.closest("[data-cookie-policy-toggle]");
        if (!input) return;
        set(input.checked);
        syncPolicyToggles();
    });
    syncPolicyToggles();
})();
