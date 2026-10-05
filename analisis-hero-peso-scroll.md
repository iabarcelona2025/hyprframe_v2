# Hero de HYPRFRAME — auditoría de capas: por qué el vídeo se nota pesado al scrollear

*30/09/2026 · Alcance: `<section class="hero">` de `index.html` (idéntico en `es/index.html`) + todas las capas de `styles.css` y `script.js` que actúan sobre él mientras se hace scroll.*
*Método: lectura del código con referencias `archivo:línea`, medición del binario del vídeo (parseo de las cajas MP4), ejecución del tokenizador real del terminal en Node y cálculo del coste por frame sobre la geometría real del layout.*

---

## 0. Resumen en una tabla

Peso relativo **estimado** del coste del hero mientras se hace scroll (desktop 1440×900 @DPR2, base de cálculo en §1.3):

| # | Categoría | Peso | Qué es | ¿Se ve? |
|---|-----------|-----:|--------|---------|
| 1 | **Vídeo** (red + decodificación + invalidación) | **~30 %** | `header-video_06.mp4` · 9,46 MB · 1268×724 · 24 fps | ✅ Alta (es el hero) |
| 2 | **Motor del terminal** (`script.js` §6c) | **~25 %** | 1.620 reescrituras/s + 400 caracteres/s sobre 92 líneas | ⚠️ Muy baja (texto a 6,1 px y ~15 % de alfa) |
| 3 | **Mezclas, filtros y máscaras del panel** | **~18 %** | `overlay` + `screen` + `soft-light` + `blur` sobre 3,8 Mpx | ⚠️ Media (un lavado de color y una textura) |
| 4 | **`backdrop-filter`** (marquesina + cabecera) | **~9 %** | `blur(6px)` y `blur(14px)` sobre el vídeo en marcha | 🔸 Marquesina casi nula · cabecera sí |
| 5 | **Grano animado a pantalla completa** | **~7 %** | capa `fixed` de 6,27 Mpx compuesta siempre | 🔸 Baja, pero cumple (dither anti-banding) |
| 6 | **Animaciones no compuestas** | **~6 %** | `box-shadow` del `.pulse`, blurs del scroll-cue, caret | 🔸 Baja |
| 7 | **Barra de progreso, reveals y handlers** | **~5 %** | ya optimizados en su mayoría | ❌ Nula o imperceptible |
| — | **Multiplicador: el scroll con inercia propio** | **×2 aprox.** | `smooth-scroll.js` secuestra la rueda y mueve la página desde el hilo principal | — |

> Las cifras de peso son una estimación de ingeniería construida sobre datos medidos (§1); no son un trace de DevTools. Los bytes, tamaños de panel, número de nodos y ritmos de escritura **sí están medidos**.

**Conclusión corta:** el hero no se nota pesado por *una* cosa, se nota por la **suma de tres**: un vídeo de 9,46 MB que se decodifica en bucle, un terminal de 92 líneas que reescribe ~1.600 números por segundo sobre una pila de 271 superficies de filtro/mezcla, y un scroll con inercia propio que lleva todo ese trabajo al hilo principal y además anula el camino rápido del compositor. Lo caro y lo invisible están en el mismo sitio: **el terminal y sus mezclas cuestan ~43 % del hero y aportan una textura apenas perceptible**.

---

## 1. Qué se ha medido

### 1.1 El vídeo (medido)

| Dato | Valor |
|------|-------|
| Peso | **9.921.694 B = 9,46 MB** (el 67 % de todo `assets/`) |
| Códec | H.264 High **@L4.1**, `yuv420p` |
| Resolución | **1268 × 724** |
| Duración / frames | **30,875 s · 741 frames · 24,0 fps** |
| Bitrate medio | **2,57 Mbps** · 13,1 KB por frame |
| Póster | **no hay** |
| Atributos | `autoplay muted loop playsinline preload="auto"` (`index.html:147`) |

**Upscaling (el dato que más se repite):**

| Pantalla | Píxeles de dispositivo que ocupa el vídeo | Fuente | Factor |
|----------|------------------------------------------:|-------:|-------:|
| 1920×1080 @DPR1 | 2,10 Mpx | 0,92 Mpx | ×2,3 |
| 1440×900 @DPR2 | **5,67 Mpx** | 0,92 Mpx | **×6,2** |
| 390×844 @DPR3 (móvil) | **11,23 Mpx** | 0,92 Mpx | **×12,2** |

Es decir: en cualquier pantalla de hoy el vídeo se está **ampliando entre 2 y 12 veces**, y una buena parte del velo, del grano y del blur del panel existe precisamente para disimular esa falta de definición.

### 1.2 El terminal del hero (medido ejecutando su propio tokenizador)

| Dato | Valor |
|------|-------|
| Líneas de `LOG` | **92** |
| Caracteres totales | **4.923** (media 52,5 · máxima 99 por línea) |
| Spans `.log-num` en el DOM a la vez | **175** + 5 contadores = **180 campos dinámicos** |
| Ritmo de escritura | `TICK = 50 ms` → 20 pasos/s · 8-32 caracteres por paso → **~400 car./s** |
| Ritmo de mutación de números | `CHURN = 0.45` → 81 reescrituras candidatas por paso → **~1.620/s** |
| Superficies offscreen que abre cada repintado | **≈271** (1 panel + 1 body + 92 `.log-line` + 175 `.log-num` + caret + scanlines) |
| Tamaño del panel a 1440×900 | **332 × 734 px** con **font-size 6,14 px** (lo calcula `fit()`, `script.js:607`) |
| Tamaño del panel a 1920×1080 | 413 × 914 px @ 7,65 px |

### 1.3 Geometría y base de cálculo del coste por frame

A 1440×900 @DPR2 (viewport de 2,88 M píxeles CSS · 5,18 M píxeles de dispositivo):

| Capa | Mpx CSS | Mpx device |
|------|--------:|-----------:|
| `.hero` (grupo con `isolation: isolate`) | 1,30 | 5,18 |
| vídeo upscalado (`object-fit: cover`) | 1,42 | 5,67 |
| `.hero-veil` (2 gradientes) | 1,30 | 5,18 |
| `.hero-log` | 0,24 | 0,97 |
| `.hero-log-blend` | 0,71 | 2,86 |
| `.hero-marquee` (`backdrop-filter`) | 0,07 | 0,28 |
| `.grain` (`fixed`, `inset: -5 %`) | 1,57 | 6,27 |
| `.site-header.scrolled` (`backdrop-filter`) | 0,15 | 0,58 |

---

## 2. Inventario: todas las capas que toca el hero

De fuera hacia dentro y de arriba abajo, en el orden en que las pinta el navegador:

| # | Capa | Dónde | Qué pinta | Coste | ¿Se ve? |
|---|------|-------|-----------|-------|---------|
| 1 | `.grain` | `styles.css:87-97` | ruido SVG tileado 300×300, `fixed`, opacidad 0,05, animado con `steps(4)` | capa `fixed` de 6,27 Mpx sobre **toda** la página, siempre | apenas |
| 2 | `.scroll-progress` | `styles.css:151-155` | barra de 3 px con `scaleX()` | composited, barato (ya optimizado) | sí, pero es gratis |
| 3 | `.site-header` + `.scrolled` | `styles.css:170-181` | cabecera fija; al pasar 40 px de scroll entra `backdrop-filter: blur(14px)` | **re-desenfoca 0,58 Mpx en cada frame de scroll** sobre el vídeo | sí (cristal esmerilado) |
| 4 | `.hero` | `styles.css:324-332` | `min-height: 100svh`, `overflow: hidden`, `isolation: isolate` | el `isolation` cierra el grupo de mezcla: **todo lo que se mezcla dentro se rasteriza junto con el vídeo** | — |
| 5 | `.hero-video` | `index.html:147` · `styles.css:333-341` | vídeo a `opacity: 0.58` con «respiración» Ken Burns de 18 s (`heroBreath`, escala 1 → 1,08) | 9,46 MB + decodificación 24 fps + 5,67 Mpx device dibujados | **sí, es el hero** |
| 6 | `.hero-veil` | `styles.css:342-347` | radial + linear-gradient para dar legibilidad | estático, pero se recompone sobre cada frame del vídeo (5,18 Mpx) | **sí, imprescindible** |
| 7 | `.hero-content` · `.hero-title` · `.rotator` | `index.html:152-166` · `styles.css:368-425` | titular con reveal por líneas + rotador de 4 palabras cada 4 s | transforms + `overflow:hidden`; barato | sí |
| 8 | `.pulse` (kicker) | `styles.css:355-366` | punto lima con `box-shadow` creciendo de 0 a 10 px en bucle | **`box-shadow` NO se compone: repinta el elemento 60×/s** (4 de ellos en la página; los 6 del menú no cuentan, están bajo `visibility: hidden`) | sí, pero mínimo |
| 9 | `.hero-log-blend` (+`::before`) | `styles.css:541-569` | **lavado cromático** violeta/lima sobre el vídeo: `mix-blend-mode: overlay` + `blur(0.5px) saturate(1.05) contrast(1.0)` + máscara + un `::before` con `soft-light` | **2,86 Mpx de mezcla + filtro + máscara, re-rasterizados con cada frame del vídeo** | media: un tinte |
| 10 | `.hero-log` (+`::before`) | `styles.css:571-608` | el panel del terminal: `mix-blend-mode: screen` + `contrast(1.18) brightness(1.06) saturate(1.05) blur(0.18px)` + máscara + scanlines `soft-light` | 0,97 Mpx re-mezclados 20-24×/s | **muy baja** (ver §5) |
| 11 | `.log-body` | `styles.css:611-621` | `mix-blend-mode: overlay` + máscara vertical | 1 superficie offscreen más | — |
| 12 | `.log-line` × 92 | `styles.css:623-629` | `text-shadow` violeta + `screen` + `blur(0.15px)` | **92 superficies de filtro** | no (0,15 px es subpíxel) |
| 13 | `.log-num` × 175 | `styles.css:630-636` | **dos** `text-shadow` con blur de 8 y 16 px + `brightness(1.08) saturate(1.0)` + `screen` | **175 superficies de filtro** + 350 sombras difuminadas por repintado | sí, es el «verde del dato» |
| 14 | `.log-caret` | `styles.css:638-648` | cursor lima parpadeante con glow | animación `opacity` en `steps()`; área diminuta | sí, pero es un punto |
| 15 | `.scroll-cue` + `::before` + `::after` | `styles.css:445-484` | pista vertical con destello que cae | `::before` con `filter: blur(4px)` animado; `::after` con `blur(5px)` **a opacidad 0** (solo sobrevive por un test legacy) | sí el destello; el `::after` **nulo** |
| 16 | `.hero-marquee` + `.marquee-track` | `index.html:184` · `styles.css:486-502` · `script.js:108-136` | marquesina infinita de 28 s, con el track duplicado por JS | **`backdrop-filter: blur(6px)` sobre el vídeo en marcha** + un transform infinito sobre un texto de ancho `max-content` | el texto sí; el blur, casi nada |

---

## 3. Peso por categoría, en detalle

### 3.1 Vídeo — ~30 % · red: 9,46 MB (84 % de la carga inicial)

Tres costes distintos que se suman:

1. **Red.** 9,46 MB con `preload="auto"` y sin póster. A 10 Mbps son **~7,6 s de descarga** que saturan la conexión justo cuando el usuario empieza a scrollear, compitiendo con las fuentes y con las 10 imágenes de hover que `script.js:787` precarga eagerly (**1,25 MB que no hacen falta hasta el primer hover**).
2. **Decodificación.** 741 frames de 1268×724 en bucle continuo: ~1,38 MB/frame en `yuv420p` → **~33 MB/s de memoria** solo en leer los frames decodificados, más la conversión a RGBA para la GPU. En un portátil sin decodificación por hardware, eso es un núcleo trabajando de fondo **siempre**, incluso cuando el usuario está leyendo.
3. **Invalidación del grupo de mezcla.** Este es el punto clave que casi nadie ve en el código: `.hero` tiene `isolation: isolate` (`styles.css:330`) porque dentro hay 6 declaraciones de `mix-blend-mode`. Un elemento con `mix-blend-mode` **no puede pintarse solo**: el navegador necesita los píxeles del fondo para calcular la mezcla. Por tanto, cada uno de los 24 frames/s del vídeo **invalida y obliga a recalcular** las superficies de `.hero-log` (0,97 Mpx) y `.hero-log-blend` (2,86 Mpx). Eso ocurre aunque el usuario no toque el scroll: cuando llega el scroll, la GPU ya viene cargada.

`html.is-scrolling .hero-video { animation-play-state: paused }` (`styles.css:47`) ataca solo el punto 1 de la respiración Ken Burns —que es un `transform` compuesto—, **no la decodificación ni la invalidación**.

### 3.2 Motor del terminal (`script.js` §6c, líneas 230-707) — ~25 %

Es, con diferencia, **la categoría con más trabajo de hilo principal de toda la página**:

- Un único `requestAnimationFrame` con `TICK = 50` → 20 pasos/s (`script.js:251`, `651-680`).
- En cada paso: 8-32 caracteres escritos + `lines.forEach(l => l.done && randomize(l, CHURN))` (`script.js:669`) sobre **180 campos dinámicos** → **~81 reescrituras candidatas por paso ≈ 1.620/s**, cada una con `Math.random()`, `toFixed()` y comparación de cadena antes de escribir `node.data`.
- El DOM completo del terminal (92 líneas, ~5.000 caracteres) vive a la vez: `fit()` calcula `--log-fs` (6,14 px a 1440×900) y `maxLines` para que entren las 92 líneas (`script.js:607-622`).
- **La cadena de invalidación es lo caro**: cada número vive dentro de un `.log-num` (con `filter` propio) → dentro de un `.log-line` (con `filter` propio) → dentro de `.log-body` (`mix-blend-mode`) → dentro de `.hero-log` (`mix-blend-mode` + `filter` + máscara). **Una sola cifra cambiada invalida 3-4 superficies offscreen encadenadas.** Y como cada paso toca campos repartidos por ~todas las líneas, en la práctica el panel entero se re-rasteriza 20 veces por segundo.

A favor: el bucle está bien criado —se para fuera de pantalla y con la pestaña oculta (`script.js:694-706`), y con `prefers-reduced-motion` pinta el bloque quieto—, y el estado se persiste en `sessionStorage` al salir.

### 3.3 Mezclas, filtros y máscaras del panel — ~18 %

Lo que el CSS le pide a la GPU por cada frame del vídeo y por cada paso del terminal:

- **9 declaraciones de `mix-blend-mode`** —todas las que hay en la hoja están en el hero—: `overlay` ×2 (`:557`, `:619`), `soft-light` ×2 (`:567`, `:604`), `screen` ×5 (`:584` —duplicada en `:585`—, `:626`, `:634`, `:646`). Son **8 superficies distintas** porque el `screen` del panel está declarado dos veces.
- **6 cadenas de `filter`**, 4 de ellas dentro del panel del terminal (`styles.css:558, 588, 628, 633`, más las dos del scroll-cue en `:460` y `:482`). Una de ellas se aplica **a 92 elementos** (`.log-line`) y otra **a 175** (`.log-num`).
- **4 `mask-image`** con degradado (`styles.css:559-560, 595-596, 616-617`).
- **2 `text-shadow` con blur en cada `.log-num`** → 350 sombras difuminadas por repintado (a 6 px de cuerpo, el blur de 16 px de `styles.css:632` es literalmente 2,6 veces el tamaño del glifo).

Detalle de gratis-y-sospechoso: `contrast(1.0)` (`:558`) y `saturate(1.0)` (`:633`) son **no-ops**: no cambian un solo píxel, pero fuerzan que el elemento pase por la tubería de filtros (buffer offscreen aparte). Igual que `blur(0.15px)` en `.log-line` (`:628`), que a DPR1 ni se percibe.

### 3.3.1 La capa de color que hay detrás del terminal

Sí existe, y es exactamente una: **`.hero-log-blend`** (+ su `::before`), `styles.css:541-569`. En el DOM va antes que el terminal (`index.html:170` vs `:176`), ambos con `z-index: 1`, así que se pinta justo debajo.

La pila completa del hero, de atrás hacia delante:

```
1. .hero-video        (z auto, absolute)
2. .hero-veil         (z auto, absolute)   ← degradados grises, sin color
3. .hero-log-blend    (z-index 1)          ← LA CAPA DE COLOR
4. .hero-log          (z-index 1)          ← el terminal
5. .hero-content      (z-index 2)
6. .scroll-cue        (z-index 2)
7. .hero-marquee      (z-index 2)
```

**No es una caja de color**: no tiene fondo plano, ni borde, ni `background-color`. Es un lavado de **dos `radial-gradient`** (violeta `#a064ff` en el núcleo, lima `#a3df02` en el medio) con `mix-blend-mode: overlay`, `opacity: 0.45`, `blur(0.5px)` y una máscara lateral. El comentario del CSS lo describe bien: *«Un lavado overlay independiente tiñe el vídeo por detrás del trace»*.

**Cuánto color aporta de verdad** (simulado el composite real `overlay` + alfa + máscara, muestreando toda la zona visible):

| Luminancia del vídeo | Punto más fuerte | ΔR | ΔG | ΔB | Δluminancia |
|---|---:|---:|---:|---:|---:|
| negro (0,05) | (1399, 458) | +0,4 | −0,3 | +1,6 | −0,04 |
| oscuro (0,15) | (1399, 458) | +1,2 | −1,0 | **+4,8** | −0,12 |
| medio (0,35) | (1399, 458) | +2,9 | −2,4 | +11,1 | −0,28 |
| claro (0,60) | (1399, 458) | +3,3 | −2,7 | +12,7 | −0,32 |

**El delta máximo absoluto en cualquier canal dentro de lo visible es 4,7 / 255 ≈ 1,9 % del rango.** Y la luminancia no cambia: la capa **no ilumina ni oscurece, solo desplaza el tono unas milésimas hacia el violeta**. Tres razones:

1. El alfa propio del degradado (0,28 violeta / 0,14 lima / 0,10 lima) se multiplica por la `opacity: 0.45` del elemento → **0,126 / 0,063 / 0,045 efectivos**.
2. `overlay` sobre un fondo oscuro es casi un no-op: para B < 0,5 la fórmula es `overlay = 2·B·S`, que con B = 0,15 y S = 0,63 da 0,19 — apenas por encima del propio fondo.
3. `blur(0.5px)` redondea lo que queda y `contrast(1.0)` no hace absolutamente nada.

**Y hay un desalineamiento que probablemente no era intencionado.** `.hero-log-blend` copia literalmente las dos declaraciones de encuadre del terminal (`right: calc(-16em - 40px); width: 54em;`), pero **no fija `font-size`**, así que su `em` resuelve contra el `body` (18 px a 1440) mientras que el del terminal resuelve contra `--log-fs` (6,14 px). El comentario del propio CSS dice que el `em` está ahí *«a propósito: como el font-size lo escala el JS, el recorte lateral es siempre el mismo»* — pero eso solo se cumple en `.hero-log`:

| | font-size | `width: 54em` | `right: -(16em+40px)` | Borde izquierdo en pantalla | Máscara al 100 % desde |
|---|---:|---:|---:|---:|---:|
| `.hero-log` | 6,14 px | **332 px** | −138 px | x = 1246 | x = 1408 (**33 px** legibles) |
| `.hero-log-blend` | **18 px** (heredado) | **972 px** | −328 px | x = **796** | x = 1200 (**240 px** a plena fuerza) |

Es decir: el lavado es **2,93 veces más ancho** (exactamente el cociente 18 / 6,14) y arranca **450 px más a la izquierda** que el terminal al que debía acompañar. No está «detrás del terminal»: es una mancha atmosférica sobre el **45 % derecho** de la pantalla, dentro de la cual el terminal ocupa el 13 % derecho. Para que coincidieran bastaría con añadir `font-size: var(--log-fs, 0.62rem)` a `.hero-log-blend`.

**Veredicto:** es el mejor candidato del hero a desaparecer. Paga **0,71 Mpx de mezcla `overlay` + cadena de filtros + máscara, re-rasterizados con cada frame del vídeo (24/s)** a cambio de un desplazamiento de tono de ≤ 2 % que además queda a 41 px del borde derecho de la pantalla. Si se quiere conservar la intención, lo barato es meter el violeta y el lima como un tercer `radial-gradient` dentro de `.hero-veil` (que ya se pinta, no lleva `mix-blend-mode` y no cuesta nada extra) y borrar la capa.

### 3.3.2 ¿Cuánto se gana quitando la capa de color?

Medido sobre la pantalla de referencia (1440×900 @DPR2):

| Concepto | Valor |
|---|---:|
| Superficie del elemento | 972 × 734 = **0,71 Mpx CSS** |
| Superficie de su `::before` (`inset: -12 %` → +54 % de área) | 1205 × 910 = **1,10 Mpx CSS** |
| **Total a rasterizar** | **1,81 Mpx CSS** = 7,24 Mpx dev @DPR2 |
| Área realmente visible (la máscara recorta) | 0,47 Mpx CSS |
| Relación con el vídeo | **1,28× el área que dibuja el vídeo** |
| Memoria de capa GPU | **7,2 MB @DPR1 · 29,0 MB @DPR2 · 65,2 MB @DPR3** |
| Trabajo GPU a 24 frames/s (1 pasada) | 174 Mpx/s ≈ 1,3× el vídeo |
| Trabajo GPU a 24 frames/s (3 pasadas: filtro + máscara + blend) | **521 Mpx/s ≈ 3,8× el vídeo** |

Dentro del coste del hero: la capa es el **71 % del área** de la categoría «mezclas + filtros + máscaras» (§3.3), que pesa ~18 % → **quitarla ahorra ~12,8 % del coste del hero**, más hasta 29 MB de memoria de GPU.

**Aviso honesto:** son cifras de GPU, y la GPU va sobrada en la mayoría de equipos (521 Mpx/s es ~5 % de la capacidad de relleno de una GPU integrada modesta). Lo que de verdad hace que el scroll «se note pesado» es trabajo de **hilo principal** (§3.2, §3.7) y el scroll con inercia propio (§3.8). **Quitar solo esta capa no va a cambiar la sensación al scrollear**; lo que hace es liberar memoria de GPU (importante en móvil) y quitar una superficie del grupo de mezcla. Es una buena limpieza, no una solución.

Efecto dominó que **no** se produce: no se puede quitar `isolation: isolate` de `.hero`, porque `.hero-log` sigue usando `mix-blend-mode: screen`.

### 3.4 `backdrop-filter` — ~9 %

Dos superficies que **re-muestrean lo que tienen detrás, que es un vídeo que se mueve**:

- `.hero-marquee` → `blur(6px)` sobre 0,28 Mpx (`styles.css:491-492`). El efecto visible real es casi nulo: la barra ya lleva `rgba(5,5,5,0.35)` encima y el texto es de 0,72 rem.
- `.site-header.scrolled` → `blur(14px)` sobre 0,58 Mpx (`styles.css:179-180`). Este **sí se ve** (el cristal de la cabecera), pero entra a los **40 px de scroll**, es decir, con el vídeo del hero todavía a pantalla completa detrás. Es el peor momento posible para añadir una superficie de desenfoque.

### 3.5 Grano a pantalla completa — ~7 %

`styles.css:87-97`. Ya se ha optimizado bien (de `inset: -50 %` a `-5 %`, `will-change: transform`, `contain: strict`), pero sigue siendo una capa `fixed` de **6,27 Mpx de dispositivo** que se compone por encima de todo cada vez que cambia, y su animación `steps(4)` la repinta **4,4 veces por segundo durante toda la sesión**, mire el usuario el hero o no.

### 3.5.1 El ruido que hay sobre el vídeo del hero

**Sí hay exactamente una capa de ruido, y sí cae sobre el vídeo — pero no es una capa del hero: es global.** `.grain` (`styles.css:87-97`, instanciada en `index.html:103` y en **todas** las páginas del sitio: `legacy.html`, las 10 fichas, `404.html`).

Cómo está hecha:

| Propiedad | Valor |
|---|---|
| Tile | SVG de 300×300 con `feTurbulence` **`type="fractalNoise"`**, `baseFrequency="0.75"`, `numOctaves="2"` |
| Fuerza | `opacity: 0.05` — y **sin `mix-blend-mode`**: es un alfa normal, no un blend |
| Posición | `position: fixed; inset: -5%` → **1,1 × 1,1 pantallas** (1,57 Mpx CSS) |
| Animación | `grainShift 0.9s steps(4) infinite`, traslaciones de ±2-3 % |
| Capas | `will-change: transform` + `contain: strict` (ya optimizado) |

**Dónde queda en el orden de apilado** (todas son `fixed`, z-index explícito): skip-link 10000 › preloader 9500 › barra de progreso 980 › aviso de cookies 960 › **grano 900** › `site-header` 800 › menú 850. Es decir: **el grano tapa la cabecera y el menú**, y tapa el hero siempre que esté en pantalla.

**Cuánto se ve** (deducido del alfa y de la distribución del `fractalNoise`, no renderizado — no hay renderizador de `feTurbulence` en este entorno):

| Efecto | Valor |
|---|---|
| Variación aportada al píxel final | **±1,8 niveles** (1σ) · ±3,6 (2σ) · ±5,4 (3σ) sobre 255 |
| Nivel de negro de marca | `#050505` (5) → **~#0b0b0b (11,2)**: sube **+6 niveles** de media |
| Sobre `--bg-soft` `#0c0c0e` | 12 → 17,8 (+5,8) |

O sea: un dither finísimo (una o dos unidades) más un **levantamiento del suelo de negros de ~6 niveles**. Su trabajo real, con esa fuerza y a ese tamaño de tile, es **romper el banding de los degradados radiales del velo** — que en un sitio tan oscuro es un problema real, y el grano lo resuelve mejor que cualquier otra cosa. El movimiento (`steps(4)` a 4,4 cambios/s) es lo que casi no aporta.

**Cuánto cuesta:**

| Concepto | Valor |
|---|---|
| Superficie | 1584 × 990 = **1,57 Mpx CSS** = 6,27 Mpx dev @DPR2 = **25,1 MB** de textura |
| Pasadas por frame | **1** (alfa simple: sin blend, sin filtro, sin máscara) |
| A 60 fps de scroll | **376 Mpx/s** |
| Con el vídeo del hero reproduciéndose (24 fps) | **150 Mpx/s** |
| En reposo, solo por su animación (4,4 fps) | **27,9 Mpx/s** |

Comparada con la capa de color de §3.3.1, el grano tiene una superficie parecida (1,57 vs 1,81 Mpx CSS) pero **1/3 de las pasadas**, así que por frame es ~3× más barato. Su problema es otro y es peor: **nunca se apaga**. Con `steps(4)` obliga al compositor a producir un frame nuevo 4,4 veces por segundo **aunque la página esté completamente quieta y el usuario no toque nada**, en todas las páginas del sitio. Es lo único de esta auditoría que impide que la GPU entre en reposo alguna vez, y en un portátil eso es batería.

**Veredicto:** el dither anti-banding es útil y hay que mantenerlo; lo que no aporta es el movimiento, que a 5 % de opacidad y ±2 niveles es indetectable. Aplicado queda como `animation-play-state: paused` por defecto + `html.is-scrolling .grain { animation-play-state: running }`, de modo que el grano se mueve exactamente igual que antes mientras se scrollea (donde el movimiento sí se percibe, por el desplazamiento relativo con el contenido) y se queda quieto en reposo.

**Pero atención — el ahorro de esta capa, por sí solo, es CERO.** Y conviene saber por qué, porque cambia la prioridad de todo el plan:

Una animación en bucle solo *fuerza* frames cuando es la más rápida que queda viva. Si otra animación ya está entrega que entrega frames a 60 fps, quitar una de 4,4 fps no baja el ritmo: el compositor sigue produciendo los mismos frames y las capas se siguen componiendo en cada uno. Y en este sitio **ninguna página llega nunca a estar quieta**:

| Página | Lo que la mantiene despierta | Ritmo |
|---|---|---|
| `index.html` | vídeo del hero (24 fps) + `.marquee-track` (transform) + `.cross-turn` (rotate) + 4 `.pulse` visibles + galería CLB | **60 fps** |
| `legacy.html`, las 10 fichas | 1 `.pulse` **visible** en el kicker (los otros 6 van en el menú oculto) — anima `box-shadow`, que **no se compone**: repinta | **60 fps** |
| `404.html` | `animateCanvas` de `404.js:119/193/196`: un `requestAnimationFrame` **sin condición de salida** (solo salta el dibujo si `document.hidden`, pero sigue pidiendo frames) | **60 fps** |

Con lo que el grano era **una de ~8 animaciones siempre encendidas**, no la única. Congelarlo es correcto y deja de ser un problema, pero no mueve la aguja hoy: el grano pasa a ser gratis en reposo y nadie lo va a notar, porque quien pagaba la factura era el conjunto.

**Lo que sí es el grano durante la actividad** es su capa `fixed` a pantalla completa compuesta en cada frame (376 Mpx/s a 60 fps). Eso **no lo cambia** congelar la animación — la capa se compone igual. Aun así, componer un quad estático a pantalla completa es de las operaciones más baratas que existen en una GPU (las integradas mueven del orden de 10 Gpx/s de relleno), así que el coste real a vigilar aquí es la **memoria de la textura** (25 MB a DPR2, 56 MB a DPR3) que `will-change: transform` mantiene reservada, no el relleno.

> Dos texturas más caen sobre la zona del vídeo, por si se cuentan como «ruido»: las **scanlines** del panel del terminal (`.hero-log::before`, `repeating-linear-gradient` de 1 px en `soft-light` al 3 % de blanco, `styles.css:599-606`) — son líneas horizontales regulares, no ruido, y solo cubren el panel —, y el **grano propio del vídeo**, que a 2,57 Mbps y con 2,57 MB por cada 10 s de metraje casi seguro viene con ruido de compresión y del propio generador. No se ha podido decodificar un frame para confirmarlo (no hay decodificador H.264 en este entorno).

### 3.6 Animaciones no compuestas — ~6 %

- `.pulse` ×4 pintándose a la vez (hero, about, CLB y contacto) con `box-shadow` animado (`styles.css:356-366`): las animaciones de `box-shadow` **no se componen**, repintan el elemento en cada frame. Los otros 6 `.pulse` están en el menú a pantalla completa, que vive bajo `visibility: hidden` (`styles.css`, `.menu-overlay`) y por tanto no se pinta.
- `.scroll-cue-line::before` con `filter: blur(4px)` animado (`styles.css:458-463`).
- `.scroll-cue::after` con `filter: blur(5px)` + animación infinita **a opacidad 0** (`styles.css:481-484`): no tiene fondo, así que no pinta nada, pero mantiene declaradas una animación infinita y una superficie de filtro solo para que pase un test legacy. Código muerto.
- `.log-caret` con `box-shadow` y `mix-blend-mode: screen`.

### 3.7 Barra de progreso, reveals y handlers — ~5 %

- `script.js:71-107`: un rAF que agrupa los eventos de scroll y escribe `scaleX()` + una clase. **Bien resuelto.**
- `script.js:709-731` (`lightWords`): en cada scroll llama a `getBoundingClientRect()` de la sección — **fuerza recálculo de layout dentro del frame del scroll** — y hace `classList.toggle` sobre 11 spans de titular gigante con transiciones de 0,45 s de opacidad y color. Cae justo en los primeros 900 px de scroll, inmediatamente después del hero.
- `script.js:813-818`: los botones `.magnetic` hacen `getBoundingClientRect()` **en cada `mousemove`** (no en cada frame).
- `script.js:787`: precarga eager de las 10 imágenes de hover (1,25 MB).

### 3.8 El multiplicador: el scroll con inercia — ×2 sobre todo lo anterior

`	smooth-scroll.js` es el amplificador de todas las categorías de arriba:

1. **Secuestra la rueda** (`smooth-scroll.js:80-92`: `e.preventDefault()` + `glideBy(delta)`). Al cancelar el `wheel`, el navegador **pierde el camino rápido del compositor**: el scroll deja de poder ejecutarse en el hilo del compositor y pasa a depender del hilo principal.
2. **Mueve la página desde rAF**: `frame()` (`:45-68`) llama a `scrollTo(0, current)` en **cada frame** con `LERP = 0.11`. Ese `scrollTo` real, frame a frame, es lo que obliga a recomponer todo lo que no está en su propia capa — exactamente donde viven el terminal, el lavado cromático y el grano.
3. En consecuencia, cualquier pico de trabajo del hilo principal (una tanda de `randomize()`, el `getBoundingClientRect()` de `lightWords`, un repintado del `.pulse`) **se convierte en un tirón visible del scroll**, porque el scroll lo está escribiendo ese mismo hilo.
4. `markScrolling` (`:155-158`) añade y quita `html.is-scrolling` con un temporizador de 180 ms, lo que además pausa y reanuda la animación del vídeo en cada gesto.

**Prueba en 10 segundos**: abre `https://hyprframe.com/?smooth=0` y compara. Si el scroll se siente mucho más ligero, la mitad del problema no son las capas: es quién mueve la página.

---

### 3.9 Optimizar el scroll CON el smooth scroll puesto: qué se ha hecho

Objetivo declarado: **no quitar la inercia**, sino que el scroll sea fluido mientras el hero (y su vídeo) están en pantalla. En ese estado concreto hay dos consumidores que compiten por recursos distintos, y cada uno se ataca de una forma:

**a) El vídeo — ataca el camino del compositor/GPU.** Mientras la rueda mueve la
página, el vídeo sostiene el fotograma (`pause()`), igual que ya sostenía su
respiración. Motivo: el hero lleva encima capas con `mix-blend-mode`, y una mezcla
necesita los píxeles del fondo, así que **cada fotograma del vídeo invalida esas
capas y fuerza rehacer el grupo del hero — justo en el frame en que se está
moviendo la página**. Congelado, el hero es una textura válida que solo se
desplaza.

**b) El terminal — ataca el hilo principal.** Durante el scroll, el terminal se
calla: sigue con su rAF pero no escribe. Sus ~81 reescrituras por paso (≈1.620
cambios de nodo de texto por segundo) invalidan la línea, el filtro de cada span y
la cadena de mezclas del panel, y **el hilo principal es exactamente el que está
escribiendo el scroll** (`smooth-scroll.js` hace `scrollTo` desde rAF). A 6 px y
~15 % de alfa, unos cientos de ms sin escribir no se ven.

**Trabajo eliminado en 1 segundo de scroll con el hero visible** (cifras calculadas sobre la geometría medida de §1.3; no son un trace):

| Trabajo | Antes | Ahora |
|---|---:|---:|
| Cambios de nodo de texto del terminal | ~1.620 | **0** |
| Repintados del panel del terminal | ~20 | **0** |
| Fotogramas de vídeo producidos (decodificación H.264) | 24 | **0** (congelado) |
| Invalidaciones de las capas de mezcla del hero | 24 | **0** |
| Superficie de mezcla re-rasterizada | ~197 Mpx | **0** |

Detalles de implementación que importan:

- **`pause()` no hace `seek`**: al reanudar el vídeo sigue exactamente donde estaba (no recarga ni salta de imagen).
- **Tope de 1,2 s** (`HOLD_MAX`): en un scroll largo y continuado el vídeo retoma aunque la rueda siga, para que no se quede congelado a la vista. Un gesto normal dura bastante menos. Hasta que el gesto no termina (180 ms sin eventos) no se vuelve a congelar, así que **no hay tirabuzón de `pause`/`play`**: verificado, 1 `pause` en 40 eventos de rueda, 1 `pause` + 1 `play` en un gesto de 3 s con 187 eventos.
- **El reloj del terminal se desplaza con el hueco** (`t0 += gap`), así que `elapsed` no avanza: al reanudar no suelta de golpe los caracteres acumulados ni se salta un ciclo de contadores. Verificado: tras 1 s de scroll simulado, `elapsed` continúa en 1.016 ms en vez de saltar a ~2.950 ms.
- **Se usa `html.is-scrolling`**, que es la señal única de «hay desplazamiento» del sitio (la pone y la quita `smooth-scroll.js`), en vez de duplicar temporizadores en `script.js`. La inercia sigue desactivada en táctil, pero ahora la señal también sigue el scroll nativo táctil y pausa las escrituras del terminal; con «reducir movimiento» el terminal ya se renderiza quieto.
- **Ambos archivos están enlazados desde `es/`** (`es/script.js`, `es/smooth-scroll.js`, `es/styles.css` son symlinks a la raíz), así que la versión en español hereda los cambios sin tocar nada.
- Verificación de comportamiento con jsdom sobre los archivos reales: 10/10 PASS. Los 11 archivos de test del repo siguen igual (los 4 fallos de `test-redesign.js` son preexistentes y se comprobaron contra el original).

**Lo que NO se ha hecho, y por qué:**

- **`lightWords` (§3.7)**: era el candidato obvio (un `getBoundingClientRect()` en cada frame de scroll). Al mirarlo de cerca, **no merece la pena**: `classList.toggle` con `force` no muta el atributo si el estado no cambia, así que los 11 toggles son no-ops en la mayoría de los frames; y leer el rect con el árbol limpio cuesta microsegundos. El único caso con coste real es el frame en que cruza el umbral de la cabecera (que cambia `padding` e invalida layout) — unos pocos frames por scroll, no todos.
- **Bajar la resolución o el bitrate del vídeo**: no cambia que el compositor tenga que rehacer las mezclas; el problema no es el tamaño del fotograma, es que llegue uno nuevo.
- **Apagar los `mix-blend-mode` durante el scroll**: sería lo más barato de todo (el hero pasaría a ser capas independientes que se limitan a desplazarse), pero el cambio `screen`/`overlay` → `normal` da un salto visible de brillo. Descartado por riesgo visual.
- **`backdrop-filter` de la cabecera**: sigue igual. Entra a los 40 px de scroll, o sea justo con el vídeo a pantalla completa detrás, y esa es la peor casilla del recorrido para una superficie de desenfoque. Si en la medición real sigue pesando, la corrección es retrasar el umbral hasta que el hero haya salido (`scrollY > innerHeight * 0.6`, en `script.js:97`) o darle fondo sólido mientras esté encima del vídeo.

### 3.10 La carga previa (preload): qué se pide, cuándo y con qué prioridad

Inventario de todo lo que arranca al abrir la landing, medido:

| Recurso | Peso | Cómo llega |
|---|---:|---|
| `index.html` | 30,8 KB | bloquea el parsing |
| `styles.css` | 65,8 KB | **bloquea el render** |
| Hoja de Google Fonts | ~2 KB (+ fuentes) | **bloquea el render**, origen tercero (ya con `preconnect`) |
| `logo.png` | 39,6 KB | visible desde el primer frame |
| `script.js` + `smooth-scroll.js` + `cookies.js` | 57,2 KB | `defer` |
| **VÍDEO del hero** | **9.689 KB** | `preload="auto"` + `autoplay`, sin póster |
| 10 imágenes de hover | 1.283 KB | `script.js:814`, en cuanto corre el `defer` |
| **TOTAL** | **11,2 MB** | **el vídeo es el 87 %** |

**Hallazgo 1 — `preload="auto"` no significa lo que parece, y cambiarlo no sirve de nada.** Con `autoplay` puesto, el atributo `preload` queda anulado: el navegador tiene que descargar para poder reproducir. Es decir, **pasar `preload="auto"` a `preload="metadata"` es prácticamente un no-op** en este hero. Esto corrige lo que recomendé en §5.2: lo que de verdad arregla la percepción de carga no es el atributo, es **el póster** y **el peso real del archivo**.

**Hallazgo 2 — el contador del preloader no mide nada.** Del código (`script.js:44-62`): la curva tarda 46 pasos × 28 ms = **1.288 ms**, más 260 ms = **el hero se revela a los 1,55 s, siempre**, haya llegado el vídeo o no. El «0 → 100» es un temporizador disfrazado de medidor.

| Conexión | Descarga del vídeo (solo él) | Tiempo con el hero ya revelado pero aún sin vídeo |
|---|---:|---:|
| 10 Mbps | 7,6 s | **6,0 s en negro** |
| 25 Mbps | 3,0 s | **1,5 s en negro** |
| 50 Mbps | 1,5 s | 0 s |
| 100 Mbps | 0,8 s | 0 s |

Sin póster, esos segundos son el velo sobre `#050505`: el titular se lee, pero el hero está **plano y negro**. Nota de precisión: Chrome asigna **prioridad baja** a las descargas de medios, así que el vídeo no suele robar ancho a `styles.css` (que además se descubre antes) — lo que sí compite de tú a tú es el vídeo **contra las 10 imágenes de hover**, que van por la misma vía de prioridad baja.

**Hallazgo 3 — 1,25 MB de imágenes que nadie ha pedido todavía.** `script.js:814` instancia las 10 imágenes de hover en cuanto corre el `defer`, para que el cambio sea instantáneo. No se necesitan hasta el primer hover.

**Hallazgo 4 — fuentes: 17 pesos pedidos, 11 usados.**

| Familia | Pide | Usa | Sin usar |
|---|---:|---:|---|
| JetBrains Mono | 2 | 1 | 500 |
| Montserrat | 5 | 3 | 300, 400 |
| Syne | 3 | 2 | 600 |
| Space Grotesk | 5 | 3 | 500, 700 |
| Space Mono | 2 | 2 | — |
| **Total** | **17** | **11** | **6 (35 %)** |

Matiz importante para no exagerar el problema: **el navegador solo descarga los archivos que usa de verdad**, así que esos 6 pesos no se bajan. El coste real es el **viaje bloqueante a `fonts.googleapis.com`**, y ese ya está mitigado con `preconnect`. Es limpieza, no rendimiento.

**Por orden de impacto real:**

1. **Póster en el vídeo** (10-20 KB, `ffmpeg` de §5.2): elimina de golpe los 6 s de hero negro. Es el arreglo más barato y el que más se nota.
2. **Retrasar las 10 imágenes de hover** a la primera entrada en cada fila (o a `requestIdleCallback`): libera 1,25 MB en la ventana en que el vídeo se está bajando.
3. **Recodificar el vídeo** (§5.2): sigue siendo el arreglo de fondo; baja el tiempo de espera de 7,6 s a ~2 s en 10 Mbps.
4. **Opcional — que el preloader mida algo de verdad**: liberar el hero cuando el vídeo tenga `readyState >= 2` (HAVE_CURRENT_DATA), con **tope** en el temporizador actual. Así el contador dejaría de ser decorativo, sin arriesgar un intro eterno en conexiones lentas.
5. **Limpiar los 6 pesos de fuente** sin usar: cosmético.

### 3.10b Experimento: «para solo el grano» — resultado

Se ha probado lo que pediste: **retirar el congelado del vídeo y dejar solo el
grano parado** (`animation: none`, sin la regla que lo reanudaba al scrollear).

**Resultado: el grano parado, por sí solo, no mejora el scroll. Medido, la
ganancia es ~0.** Y ahora sabemos exactamente por qué, que es lo útil:

Una animación en bucle solo *fuerza* frames si es la más rápida que queda viva.
Con el grano ya fuera, esto es lo que sigue animándose en `index.html`:

| Animación | Duración | Ritmo que impone |
|---|---|---|
| `.hero-video` (autoplay, 24 fps) | bucle | **24 fps de fotogramas nuevos** |
| `.marquee-track` | 28 s | 60 fps |
| `.pulse` ×4 visibles (`box-shadow`, repinta) | 2 s | 60 fps |
| `.cross-turn` (rotate) | 2,6 s | 60 fps |
| `.scroll-cue-line::after` | 2,2 s | 60 fps |
| `.clb-gallery-track` + `.clb-reflection-track` | 12 s | 60 fps |

El grano solo aportaba **4,4 cambios/s marginales sobre frames que ya se estaban
produciendo**. Al quitarlo, el compositor sigue a 60 fps igual. Lo que se
elimina es una entrada en su lista de animaciones, no el ritmo — y su capa se
sigue componiendo en cada frame de todas formas (`will-change: transform` sigue
ahí, y eso está bien: promocionarla evita repintar el ruido tileado).

Conclusión: **el grano no era el problema.** Es una limpieza correcta (batería
en páginas sin nada más animado) y nada más. Se queda parado porque no aporta
nada en movimiento, pero no cuenta como mejora de rendimiento.

### 3.10c Dónde SÍ está el coste que depende del vídeo

Si el objetivo es mejorar el scroll **sin congelar el vídeo**, hay que atacar lo
que el vídeo *obliga a rehacer* en cada uno de sus 24 fotogramas por segundo.
Eso no es el grano: son las capas de mezcla del hero, que necesitan los píxeles
del fondo y por tanto se re-rasterizan cada vez que el vídeo entrega un frame.

| Capa | Superficie (1440×900) | A DPR2 | Trabajo a 24 fps |
|---|---:|---:|---:|
| vídeo (dibujarse) | 1,42 Mpx | 5,67 Mpx | 136 Mpx/s |
| **`.hero-log-blend` + su `::before`** | **1,81 Mpx** | **7,24 Mpx** | **174 Mpx/s** |
| panel del terminal (`screen` + filtro + máscara) | 0,71 Mpx | 2,84 Mpx | 68 Mpx/s |
| **TOTAL re-mezclado por segundo** | 3,94 Mpx | — | **378 Mpx/s** |

Esto ocurre **siempre** mientras el vídeo se reproduce, se scrollee o no. El
scroll lo empeora porque añade encima su propia reescritura. Y el dato clave:

> **`.hero-log-blend` es el 46 % de todo ese trabajo**, y es la capa que quedaba
> a **41 px del borde derecho** de la pantalla aportando un desplazamiento de
> tono de **≤ 1,9 % por canal** (§3.3.1).

Por eso esa capa, y no el grano, es el candidato correcto para «mejorar el
scroll sin tocar el vídeo»:

1. **Fundir `.hero-log-blend` en `.hero-veil`** como un tercer `radial-gradient`
   (el velo ya se pinta, no lleva `mix-blend-mode`): elimina el 46 % del trabajo
   por fotograma de vídeo, con cambio visual prácticamente nulo.
2. **Recodificar el vídeo** a 720p (~2-3 MB): baja el coste de decodificación
   ~4× sin dejar de reproducirse (y no toca el aspecto: ya se está ampliando ×2
   a ×12).
3. **Parar el vídeo solo cuando el hero sale de pantalla** (IntersectionObserver):
   no se congela durante el scroll, se apaga cuando ya no se ve. Ahorro de
   batería en todo el resto de la página.
4. **Reducir el `CHURN` del terminal** de 0,45 a ~0,10: el hilo principal baja
   ~5× y la animación a 6 px se ve igual.

Las cuatro mejoran el scroll **sin parar el vídeo**. La primera es la de mayor
impacto por minuto de trabajo.

## 4. ¿Es visualmente relevante? Veredicto capa por capa

| Capa | Lo que el usuario percibe de verdad | Veredicto |
|------|-------------------------------------|-----------|
| Vídeo | Todo el hero. Es la pieza. Se ve blando (×2,3 a ×12 de upscale) pero el velo y el grano lo disimulan | **Imprescindible.** Pero 9,46 MB para 1268×724 es carísimo: se puede bajar a ~2 MB **sin que se note** (ver §5.2) |
| Velo | El degradado que hace legible el titular | **Imprescindible y barato.** No tocar |
| Terminal: el texto | A 1440×900 el panel mide 332 px, de los que ~194 están en pantalla; la máscara deja opacos solo los **últimos ~33 px**, y el cuerpo es de **6,14 px**. Alfa efectivo del texto = opacidad del panel (0,28) × alfa del color (0,52) × máscara → **~0,15, en modo `screen` sobre un vídeo**. Resultado: se leen, con suerte, los **últimos 8-12 caracteres** de cada línea, y ni eso de forma cómoda | **No es texto: es textura.** Nadie va a leer una traza a 6 px y 15 % de alfa |
| Terminal: el «cabezal» que escribe | Invisible a ese tamaño. Lo que se percibe es un parpadeo general, no caracteres entrando | **Decorativo puro.** Es el 25 % del coste del hero por un efecto de brillo |
| Terminal: los números que cambian (`CHURN`) | Lo mismo: con 175 campos cambiando a 1.620/s a ese tamaño y opacidad, el ojo no distingue ningún dígito. Se ve un *shimmer* | **El 90 % de esa animación no la ve nadie** |
| Cursor `.log-caret` | Un puntito lima parpadeando | Se ve, pero es un bloque de 0,6 em |
| `hero-log-blend` (lavado violeta/lima) | Un tinte de color sobre el vídeo, integrado con la marca | **Relevante, pero redundante**: el mismo tinte se puede meter en los gradientes del velo, que ya existe y ya se pinta |
| Scanlines (`::before`) | Franjas de 1 px al 3 % de blanco, en `soft-light`, sobre un panel al 28 % | **Prácticamente nulas** a esa escala |
| Marquesina: el texto que corre | Sí, es un recurso de marca visible y con carácter | **Relevante.** El movimiento, sí |
| Marquesina: el `backdrop-filter` | Una barra oscura semitransparente con el texto pequeño. El desenfoque de 6 px detrás no se distingue del `rgba(5,5,5,0.35)` | **Irrelevante.** Subir el alfa del fondo a 0,5 y quitar el blur no se nota |
| Cabecera con blur al scrollear | El cristal esmerilado al hacer scroll | **Relevante**, pero el *cuándo* es mejorable: hoy entra a 40 px, sobre el vídeo |
| Ken Burns del vídeo (18 s, 1 → 1,08) | Un zoom lentísimo | Relevante y ya optimizado (se pausa al scrollear) |
| Grano | La textura de «película» de la marca, al 5 % | **Relevante para el look**, prescindible en movimiento: el mismo grano **estático** da la misma sensación de textura |
| Cue de scroll (destello lima) | Una guía de scroll | Se ve, pero ya está duplicado el efecto (`::before` + `::after`) y uno de los dos está invisible |
| Barra de progreso | El progreso de lectura | Se ve. Ya es barata |
| `.pulse` de los kickers | Un punto lima que late | Se ve. El `box-shadow` animado no merece lo que cuesta: con `opacity`/`transform` se ve igual y se compone |

**El patrón general:** todo lo que cuesta de verdad en el hero (terminal + mezclas + marquesina con blur + grano animado) es **atmósfera**, y todo lo que se ve de verdad (vídeo, velo, titular, marquesina, cabecera) es **barato o ya está optimizado**. La factura está en el sitio equivocado.

---

## 5. Plan de acción por ratio impacto / riesgo visual

### 5.1 Ganancias inmediatas, cero riesgo visual (≈30 min)

| Acción | Dónde | Ahorro |
|--------|-------|--------|
| Quitar `contrast(1.0)` y `saturate(1.0)` | `styles.css:558`, `:633` | 2 no-ops que fuerzan la tubería de filtros |
| Borrar `.scroll-cue::after` completo (blur + animación a opacidad 0) | `styles.css:481-484` | una animación infinita y un filtro sobre un elemento invisible |
| Limpiar declaraciones duplicadas (`mix-blend-mode` ×2, `opacity` 0.25→0.28, `opacity` 0.65→0.45) | `styles.css:555-556`, `:584-587` | CSS muerto, 0 riesgo |
| `.pulse`: cambiar `box-shadow` por `transform: scale()` + `opacity` | `styles.css:355-366` | pasa de repintado a compuesto (×4 elementos) |
| Precargar las 10 imágenes de hover **en el primer hover**, no al cargar | `script.js:787` | libera 1,25 MB de la conexión durante la carga del hero |

### 5.2 El vídeo: de 9,46 MB a ~2-3 MB sin que se note (el mayor ahorro por minuto invertido)

Hoy es un 1268×724 a 2,57 Mbps para un contenedor que lo va a ampliar 2-12 veces, con velo al 58 % y grano encima. Recomendaciones:

```bash
# 1) Bucle más corto (12-15 s), 720p, CRF 25, perfil main, faststart
ffmpeg -i header-video_06.mp4 -t 15 -vf "scale=1280:720" \
  -c:v libx264 -profile:v main -crf 25 -preset slow -pix_fmt yuv420p \
  -an -movflags +faststart header-video_07.mp4

# 2) Extraer el póster de la primera imagen (para el primer pintado)
ffmpeg -i header-video_06.mp4 -frames:v 1 -vf "scale=1280:720" \
  -q:v 4 assets/images/hero-poster.jpg

# 3) Versión AV1/WebM (~40 % menos que H.264 a igual calidad)
ffmpeg -i header-video_06.mp4 -t 15 -vf "scale=1280:720" \
  -c:v libsvtav1 -crf 32 -preset 6 -an header-video_07.webm
```

Y en el HTML (`index.html:147`):

```html
<video class="hero-video" autoplay muted loop playsinline
       preload="metadata" poster="assets/images/hero-poster.jpg" aria-hidden="true">
    <source src="assets/videos/header-video_07.webm" type="video/webm" />
    <source src="assets/videos/header-video_07.mp4" type="video/mp4" />
</video>
```

El póster (10-20 KB) da el primer pantallazo al instante; el vídeo entra después sin bloquear el primer pintado. Corrección (ver §3.10): cambiar `preload` aquí **no aporta nada**, porque con `autoplay` presente el atributo queda anulado — el póster es lo que arregla la percepción, no el atributo. **Riesgo visual: nulo** — a 720p, con el velo y el grano, el espectador no distingue la diferencia; y el bucle de 15 s con Ken Burns de 18 s no se lee como repetición.

### 5.3 El terminal: conservar el look, quitar el motor (el mayor ahorro de CPU)

Si el objetivo es «que parezca que la máquina está trabajando», no hace falta escribir 400 caracteres y reescribir 1.620 números por segundo:

1. **Bajar el ritmo**: `TICK` de 50 a **120-150 ms** (7-8 pasos/s) y `CHURN` de 0,45 a **0,08-0,12** → el coste del motor cae a **~1/8** y el shimmer se percibe igual (a 6 px y 14 % de alfa, nadie cuenta los cambios por segundo).
2. **Quitar los `filter` por elemento**: `.log-line { filter: blur(0.15px) }` (92 superficies) y `.log-num { filter: brightness(1.08) saturate(1.0) }` (175 superficies). Sustituir por `color` + `text-shadow` ya existentes. Esto elimina **~267 de las ~271 superficies offscreen**.
3. **Un solo `text-shadow`** en `.log-num` en vez de dos (el de 16 px no aporta sobre un glifo de 6 px).
4. **Congelar el bloque** cuando el hero está fuera de pantalla (ya se hace) y, opcionalmente, **pausar el shimmer tras N segundos** si el usuario no ha interactuado: el efecto «ya visto» no se pierde.
5. **Alternativa radical, cero pérdida visual**: sustituir el terminal animado por un **panel estático** (el mismo texto, ya escrito, con un `linear-gradient` en movimiento muy lento vía `transform`). Recupera el 100 % del coste del motor y, a 6 px, la diferencia en pantalla es mínima.

### 5.4 Las mezclas y los blurs

- **Fusionar `hero-log-blend` con `.hero-veil`**: el tinte violeta/lima se puede añadir como un tercer `radial-gradient` en el velo, que ya se pinta y no lleva `mix-blend-mode` ni filtro. **Ahorra 2,86 Mpx de mezcla + filtro + máscara por frame del vídeo** con un cambio visual casi imperceptible (medido: ≤ 1,9 % en un canal, §3.3.1). Si en cambio se quiere conservar la capa, **añadirle `font-size: var(--log-fs, 0.62rem)`** para que su `em` resuelva contra el del terminal: hoy mide 972 px en vez de 332 px y no está alineada con él.
- **Quitar el `backdrop-filter` de `.hero-marquee`** y subir el fondo a `rgba(5,5,5,0.5)`. Elimina una superficie de desenfoque que muestrea el vídeo a 24 fps.
- **Retrasar el `backdrop-filter` de la cabecera** hasta que el hero haya salido de pantalla (`scrollY > innerHeight * 0.6` en `script.js:97`) o darle un fondo sólido mientras esté sobre el vídeo. Es la única superficie de blur del hero que **sí** se ve; el problema es *cuándo* aparece.
- **Fusionar `log-body` en `hero-log`**: hoy hay dos `mix-blend-mode` anidados (`overlay` dentro de `screen`) sobre el mismo rectángulo. Uno de los dos se puede aplanar.

### 5.5 El scroll con inercia

Tres opciones, de menos a más conservadora:

1. **Desactivarlo y dejar el scroll nativo**: recupera el camino del compositor y hace que todo lo demás importe mucho menos. Es la palanca más grande que existe en esta página.
2. **Mantenerlo pero excluir el hero**: activarlo solo por debajo del primer `100svh`. Se conserva el *feel* premium al recorrer el resto de la página y el hero se scrollea nativo.
3. **Mantenerlo como está** y aplicar §5.1-5.4 primero. Con el terminal y las mezclas aligerados, el hilo principal tendrá margen y el propio lerp dejará de notarse.

### 5.6 Prioridad sugerida

| Prioridad | Acción | Coste | Ahorro estimado del hero |
|-----------|--------|-------|--------------------------:|
| 1 | §5.2 vídeo: recodificar a ~2-3 MB + póster + `preload="metadata"` | 30 min | −25 % |
| 2 | §5.3 terminal: `TICK` 120 ms + `CHURN` 0,10 + quitar filtros por elemento | 45 min | −20 % |
| 3 | §5.4 fusionar `hero-log-blend` en el velo + quitar blur de la marquesina | 30 min | −12 % |
| 4 | §5.5 decidir el destino del smooth scroll | 10 min (decisión) | −20 % percibido |
| 5 | §5.1 limpiezas | 30 min | −5 % |
| 6 | ✅ **HECHO** — grano parado del todo (`animation: none`) | 5 min | **~0 %** — no era el problema (§3.10b) |
| 7 | ⚠️ **PARCIAL** — terminal en silencio al scrollear (§3.9). Congelar el vídeo se **retiró** por petición | — | −1.620 escrituras/s durante el gesto |
| 8 | ⏳ Pendiente de medición — umbral del `backdrop-filter` de la cabecera (§3.9) | 10 min | a confirmar en navegador |
| 8b | 🎯 **SIGUIENTE** — fundir `.hero-log-blend` en el velo: −46 % del trabajo por fotograma de vídeo, **sin parar el vídeo** (§3.10c) | 30 min | el mayor ahorro sin tocar el vídeo |
| 9 | ⏳ **Carga previa** (§3.10): póster + aplazar las 10 imágenes de hover | 30 min | −6 s de hero negro en 10 Mbps · −1,25 MB de competencia |

---

## 6. Lo que ya está bien (no tocar)

`styles.css:43-47` (pausar la respiración al scrollear), `:78-93` (grano reducido a `inset: -5 %` + `will-change` + `contain`), `:147-155` (barra de progreso con `scaleX`), `:160-169` (nota de rendimiento del `backdrop-filter` fuera de las transiciones), `script.js:71-107` (rAF que agrupa los scroll + `ResizeObserver` en lugar de leer `scrollHeight` en cada frame), `script.js:694-706` (el terminal se para fuera de pantalla y con la pestaña oculta), `script.js:750-759` (el bucle del follower ya no corre si no hay fila activa), `script.js:204-227` (`fitHeroTitle` solo en `resize` y con `document.fonts.ready`).

---

## 7. Anexo: cómo verificarlo en DevTools

1. **¿Cuánto pesa el smooth scroll?** Comparar `hyprframe.com/` con `hyprframe.com/?smooth=0` (el flag ya existe, `smooth-scroll.js:30`). Grabar ambos con el panel Performance y comparar el tiempo de frame medio y los picos.
2. **¿Quién repinta?** DevTools → **Rendering → Paint flashing**, con el scroll parado en el hero. Si el panel del terminal parpadea en verde ~20 veces por segundo con el vídeo corriendo, es §3.2/§3.3 confirmado.
3. **¿Cuántas capas?** DevTools → **Layers** → comprobar cuántas superficies abre el panel; y **Rendering → Layer borders**.
4. **Comprobar el coste del vídeo solo**: añadir `hero-video { display: none }` en el inspector y volver a scrollear. La diferencia es la categoría 1.
5. **Comprobar el terminal solo**: en consola, `document.querySelector('.log-body').style.filter='blur(50px)'`… o más limpio, poner `[data-log-lines]{display:none}` y comparar.
6. **Medición reproducible de las cifras de §1**: los números se obtuvieron con `python3` (parseo de las cajas `moov/mvhd/tkhd/stsd/stsz` del MP4), con el tokenizador real de `script.js` ejecutado en Node, y con el cálculo del layout a partir de los `clamp()` de `styles.css`.
