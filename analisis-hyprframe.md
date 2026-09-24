# Análisis en profundidad — hyprframe.com
*Fecha: 24/09/2026 · Metodología: auditoría del HTML/CSS/JS en producción, medición de peso de recursos y revisión de las 5 secciones + páginas de proyecto.*

---

## 1. Lo que funciona (mantener en el rediseño)

| ✓ | Hallazgo | Dato verificado |
|---|----------|-----------------|
| ✓ | **Servidor rápido** | TTFB 0,157 s — excelente |
| ✓ | **Concepto claro** | "AI Visual Storytelling Studio" es un posicionamiento fuerte y diferenciado |
| ✓ | **10 proyectos reales** | Node, Deep, Polestar 5, Distant, Exit, Stained, Asics, Farewell, IAD, Ryuu |
| ✓ | **Idea del canvas de líneas** | Fondo animado vinculado al scroll: buena intuición, ejecución mejorable |
| ✓ | **Infraestructura lista** | Google Analytics (G-6MW201KGC9) y Formspree ya integrados |
| ✓ | **Identidad de color** | Negro + violeta (#A064FF) + lima (#A3DF02): base de marca recuperable |

## 2. Problemas críticos encontrados

### 🔴 Urgentes
1. **Texto placeholder en producción**: el subtítulo del hero dice literalmente *"su titulo aqui"*. Es lo primero que ve cualquier visitante.
2. **Cero SEO on-page**: sin `meta description` (0 apariciones), sin etiquetas Open Graph (0) → al compartir la web en WhatsApp/LinkedIn sale sin descripción ni imagen.
3. **Las 10 páginas de proyecto comparten el mismo `<title>`** genérico → Google no las diferencia.

### 🟠 Importantes
4. **Accesibilidad**: los 10 `<img>` del portfolio tienen `alt=""`; sin skip-link; contraste bajo en textos (#666 sobre negro).
5. **Rendimiento**: el vídeo del hero pesa **9,9 MB** (MP4 sin poster ni compresión) y bloquea la percepción de carga; las 10 imágenes (~1,3 MB) cargan todas de golpe sin `loading="lazy"`.
6. **Tipografía pequeña y sin jerarquía**: el H1 "AI VISUAL STORYTELLING" mide solo **2,5rem (40 px)** — en un estudio audiovisual el titular debería ocupar pantalla completa. Cuerpos de texto a 13–15 px.
7. **Font Awesome completo desde cdnjs** (~100 KB de CSS) para usar solo 3 iconos sociales.
8. **Inter cargada en 5 pesos** (300–700) cuando se usan 2–3.

### 🟡 Deuda técnica (CSS/JS)
9. El CSS (36 KB) acumula parches: docenas de `!important`, media queries duplicadas y comentarios tipo *"Corregimos el error del clip-text anterior"* — cada cambio nuevo rompe algo viejo.
10. El canvas usa `shadowBlur` (muy costoso en GPU) en cada frame → riesgo de tirones en móvil.
11. **Footer desactualizado**: "© 2025" (estamos en 2026).
12. **Idiomas mezclados**: placeholder en español dentro de la versión inglesa.
13. Los proyectos del portfolio son solo imágenes sin título: el usuario no sabe qué va a ver hasta que hace clic.

## 3. Diagnóstico de diseño

El sitio actual es un **buen esqueleto con piel antigua**: contenido sólido envuelto en una plantilla genérica de 2019 (hero con vídeo + grid de 3 columnas + tarjetas de servicios). Para un estudio que vende *futuro e IA*, la web debería *demostrar* capacidad técnica y dirección de arte — ahora mismo la demuestra el portfolio, pero no la envoltura.

---

## 4. El rediseño (prototipo funcional construido)

**Dirección**: editorial-brutalista moderna estilo Awwwards — tipografía gigante como protagonista, negro profundo, violeta eléctrico y lima ácido, micro-interacciones en cada elemento.

### Sistema de diseño
- **Tipografía**: `Syne 800` para titulares gigantes (hasta 10,5rem / 168 px) + `Space Grotesk` para cuerpo + `Space Mono` para etiquetas (continuidad con tu marca actual)
- **Paleta**: `#050505` fondo · `#F2F1EE` texto · `#A064FF` violeta (tu color) · `#A3DF02` lima (tu color)
- **Textura**: capa de grano animado + velo radial sobre el vídeo

### Movimientos dinámicos implementados (vanilla JS, sin librerías)
1. **Preloader** con contador 0→100 y cortina que sube
2. **Cursor personalizado** con anillo que persigue con inercia (mix-blend-mode: difference) y crece sobre elementos interactivos
3. **Titular cinético**: revelado por líneas con máscara + palabra rotatoria infinita (STORYTELLING → FILMMAKING → MOTION DESIGN → SYNTHESIS)
4. **Texto que se ilumina palabra a palabra** al hacer scroll (sección statement)
5. **Portfolio tipo "hover follower"**: lista gigante de proyectos; al pasar el ratón, la imagen flota y persigue al cursor con lerp
6. **Marquesinas** en direcciones opuestas (hero + tira de proyectos con texto outline)
7. **Reveals con stagger** por IntersectionObserver en todas las secciones
8. **Menú fullscreen** con apertura circular (clip-path) y enlaces enormes escalonados
9. **Botones magnéticos** que se atraen hacia el cursor
10. **Contadores animados** en las stats + reloj en vivo "BCN 14:49" en el header
11. **Barra de progreso** de scroll y **wordmark gigante** en el footer que se rellena de violeta al hover
12. **Vídeo del hero con respiración Ken Burns** (zoom lento 18 s)

### Mejoras de calidad incluidas
- Meta description + Open Graph + alts reales en imágenes
- `prefers-reduced-motion` respetado (accesibilidad)
- Formulario con labels flotantes (mantiene tu endpoint de Formspree)
- Links a tus páginas existentes: `legacy.html`, `builder.html`, `project-*.html`, `es/`

### Verificación
- `node --check script.js` → sin errores de sintaxis
- HTML validado (estructura balanceada)
- **Test de humo real con jsdom**: el script.js real ejecutado contra el index.html real → **15/15 checks PASS** (preloader, rotador, menú, cursor, reveals, contadores, reloj, cero errores de runtime)
- Servidor verificado: index, CSS, JS, vídeo e imágenes responden 200

## 5. Próximos pasos sugeridos
1. **Revisar el prototipo en vivo** y decidir: paleta (¿violeta dominante o lima?), intensidad de animación, textos
2. Adaptar el mismo sistema a `legacy.html`, las fichas de proyecto y la versión `es/`
3. Optimizar el vídeo del hero (WebM ~2 MB + poster) — se puede hacer con ffmpeg
4. Títulos y meta únicos por proyecto
5. Desplegar (el prototipo es HTML/CSS/JS puro: funciona tal cual en tu hosting actual)

**Archivos**: `redesign/index.html` · `redesign/styles.css` · `redesign/script.js` · assets en `redesign/assets/`
