/* Scroll con inercia, compartido por todas las páginas del sitio (landing,
   fichas de proyecto, legacy y 404). Lo carga cada página con su propio
   <script defer>; ver la comprobación de cobertura en test-smooth-scroll.js.

   Va aparte de script.js (landing) y de generated.js/legacy.js/404.js (fichas)
   para no duplicar el mismo código en cuatro archivos ni obligar a las fichas a
   cargar el JavaScript de la portada. No depende de nada más del sitio.

   Alcance: solo puntero fino y sin «reducir movimiento»; en táctil el scroll
   nativo ya trae su propia inercia y no se toca. ?smooth=0 lo apaga (útil para
   comparar o si alguna máquina lo prefiere nativo). (30/09/2026) */
(() => {
    "use strict";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

    /* ── Cómo funciona ──────────────────────────────────────
       Los portfolios que se sienten «mantequilla» (Lenis y compañía) no mueven
       la página con cada evento de rueda: acumulan a dónde quieren llegar y
       recorren la distancia con una interpolación por frame, de modo que el
       movimiento arranca y frena solo, sin saltos. Esto hace lo mismo, sin
       dependencias, y sobre el scroll nativo: position: sticky, los
       IntersectionObserver, las anclas y la accesibilidad siguen funcionando
       igual, porque seguimos desplazando el documento de verdad.

       Alcance: solo con puntero fino y sin «reducir movimiento»; en táctil el
       scroll nativo ya trae su propia inercia y no se toca. ?smooth=0 lo apaga
       (útil para comparar o si alguna máquina lo prefiere nativo). */
    const smoothRequested = !isTouch && !reduced && !/[?&]smooth=0(?:&|$)/.test(location.search);
    if (smoothRequested) {
        const LERP = 0.11;          // fracción del recorrido cubierta por frame a 60 fps
        const FRAME_MS = 1000 / 60;
        const docEl = document.documentElement;
        docEl.classList.add("hf-smooth");

        let target = scrollY;
        let current = scrollY;
        let lastWritten = scrollY;
        let raf = 0;
        let lastTime = 0;

        const maxY = () => Math.max(0, docEl.scrollHeight - innerHeight);
        const clampY = (y) => Math.min(Math.max(y, 0), maxY());
        const write = () => { lastWritten = current; scrollTo(0, current); };

        // La inercia se normaliza por tiempo real, no por frame: en pantallas de
        // 120 Hz el recorrido es el mismo por segundo que en una de 60.
        function frame(now) {
            const dt = lastTime ? Math.min(now - lastTime, 100) : FRAME_MS;
            lastTime = now;
            const t = 1 - Math.pow(1 - LERP, dt / FRAME_MS);
            current += (target - current) * t;
            if (Math.abs(target - current) < 0.4) {
                current = target;
                write();
                raf = 0;
                lastTime = 0;
                return;
            }
            write();
            raf = requestAnimationFrame(frame);
        }
        function run() {
            if (!raf) { lastTime = 0; raf = requestAnimationFrame(frame); }
        }
        function glideTo(y) { target = clampY(y); run(); }
        function glideBy(delta) { glideTo(target + delta); }

        // ¿El gesto cae dentro de un panel con scroll propio (menú, overlays)?
        // Entonces manda el nativo: no secuestramos la rueda.
        function inScrollable(node) {
            for (let el = node; el && el !== document.body; el = el.parentElement) {
                const style = getComputedStyle(el);
                if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return true;
            }
            return false;
        }

        addEventListener("wheel", (e) => {
            if (e.ctrlKey) return;                              // zoom con pinza: nativo
            if (document.body.classList.contains("menu-open")) return;
            // El vídeo de Generated cubre la ventana: la rueda no debe mover la página debajo.
            if (document.querySelector(".node-player.is-windowed")) return;
            if (inScrollable(e.target)) return;
            let delta = e.deltaY;
            if (e.deltaMode === 1) delta *= 16;                 // líneas
            else if (e.deltaMode === 2) delta *= innerHeight;   // páginas
            if (!delta) return;                    // gesto horizontal (Shift+rueda): nativo
            e.preventDefault();
            glideBy(delta);
        }, { passive: false });

        // Teclado: mismos destinos que el navegador, pero con la misma inercia.
        const PAGE = 0.9;
        const LINE = 0.12;
        addEventListener("keydown", (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (document.querySelector(".node-player.is-windowed")) return;
            const el = e.target;
            if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
            const step = innerHeight;
            let handled = true;
            switch (e.key) {
                case "ArrowDown": glideBy(step * LINE); break;
                case "ArrowUp": glideBy(-step * LINE); break;
                case "PageDown": glideBy(step * PAGE); break;
                case "PageUp": glideBy(-step * PAGE); break;
                case " ": glideBy(step * PAGE * (e.shiftKey ? -1 : 1)); break;
                case "Home": glideTo(0); break;
                case "End": glideTo(maxY()); break;
                default: handled = false;
            }
            if (handled) e.preventDefault();
        });

        // Anclas del propio documento (#film, #work, #main, el menú…): en vez del
        // salto instantáneo (hf-smooth ya quitó el scroll-behavior: smooth de CSS)
        // las lleva la misma inercia.
        addEventListener("click", (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const link = e.target.closest && e.target.closest("a[href]");
            if (!link) return;
            const href = link.getAttribute("href") || "";
            const hashAt = href.indexOf("#");
            if (hashAt === -1) return;
            const url = new URL(link.href, location.href);
            // «/» e «/index.html» son el mismo documento: en producción la landing
            // vive en la raíz y sus enlaces apuntan a index.html#seccion.
            const sameDoc = (ruta) => ruta.replace(/index\.html$/, "").replace(/\/$/, "");
            if (sameDoc(url.pathname) !== sameDoc(location.pathname) || url.search !== location.search) return;
            const el = hashAt === href.length - 1 ? document.body : document.getElementById(href.slice(hashAt + 1));
            if (!el) return;
            e.preventDefault();
            const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
            glideTo(el.getBoundingClientRect().top + scrollY - margin);
            history.pushState(null, "", href);   // la URL comparte el ancla, sin recargar
        });

        // Un scroll que no hemos escrito nosotros (barra lateral, teclado nativo,
        // buscar en la página, scrollIntoView) toma el mando: resincronizamos.
        addEventListener("scroll", () => {
            if (raf) return;
            if (Math.abs(scrollY - lastWritten) > 2) target = current = lastWritten = scrollY;
        }, { passive: true });

        addEventListener("resize", () => { target = clampY(target); });
        addEventListener("load", () => { target = current = lastWritten = scrollY; });

        // Mientras hay movimiento, el vídeo del hero no reescala su «respiración»:
        // ese transform continuo obliga a remuestrear la textura en cada frame y
        // compite con el scroll. Se reanuda al parar y, al ser un ciclo de 18 s,
        // no se nota.
        //
        // (30/09/2026) Aquí se probó también a sostener el fotograma durante el
        // gesto —congelar el vídeo mientras la rueda mueve la página— para
        // esquivar la invalidación de las capas de mezcla del hero. Se ha
        // RETIRADO: la ganancia no compensaba que el vídeo se parara a la vista.
        // El vídeo se reproduce siempre; lo que se ajusta para el scroll está en
        // el terminal (script.js §6c) y en el grano (styles.css .grain).
        let scrollIdle = 0;
        const markScrolling = () => {
            docEl.classList.add("is-scrolling");
            clearTimeout(scrollIdle);
            scrollIdle = setTimeout(() => docEl.classList.remove("is-scrolling"), 180);
        };
        addEventListener("scroll", markScrolling, { passive: true });
        addEventListener("wheel", markScrolling, { passive: true });
    }
})();
