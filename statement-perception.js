/* ══════════════════════════════════════════════════════════════════════════
   HYPRFRAME — SYNTHETIC PERCEPTION
   Fondo generativo del statement: una escultura arquitectónica en tiempo real
   que se construye con el scroll. WebGL nativo, sin dependencias —la misma
   familia que statement-liquid.js—, de modo que el sitio sigue sirviéndose
   tal cual, sin empaquetador ni CDN.

   La idea: dos lenguajes geométricos que no se ilustran, se construyen.
     · Visión humana  — un corredor orgánico, ligeramente irregular: radios
       que se abren hacia un punto de fuga, anillos que respiran, nada exacto.
     · Inteligencia artificial — una retícula de celosía medida, un huso
       reglado de doble familia (líneas rectas exactas) y planos de retícula
       uniformes: todo alineado, todo verificable.
   La síntesis no es un fundido: el espacio entero se pliega (quíntuple),
   gira y se recoge, y de ese plegado nace una escultura híbrida de cinco
   lóbulos con una apertura en el centro —el antiguo punto de fuga.

   Todo lo que se mueve sale de un único progreso 0→1 del scroll: la misma
   función, el mismo resultado, avanzando o retrocediendo. La geometría se
   construye una vez (determinista, semilla fija) y se interpola en el shader
   de vértices; en el bucle de dibujo no se asigna memoria.

   Progreso del scroll por fases (el mismo que describe el brief):
     01  0.00–0.15  el origen: el punto y las primeras líneas
     02  0.15–0.35  visión humana: el corredor se abre
     03  0.35–0.55  inteligencia artificial: celosía y huso se ensamblan
     04  0.55–0.80  síntesis: plegado, torsión y nodos de encuentro
     05  0.80–1.00  nuevas realidades visuales: los pétalos se abren

   (04/10/2026) */
(() => {
    "use strict";

    const stage = document.querySelector(".statement-stage");
    if (!stage) return;
    const section = stage.closest(".statement") || stage;
    const text = stage.querySelector(".statement-text") || section.querySelector(".statement-text");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    // Configuración pensada una sola vez: en móvil el vocabulario se reduce
    // (menos radios, menos niveles, celosía más ancha) pero la transformación
    // —corredor → plegado → apertura— es exactamente la misma.
    const mobile = coarse || Math.min(window.innerWidth, window.innerHeight) < 720;
    const DEV = /(localhost|127\.0\.0\.1|e2b\.app)/.test(location.hostname);

    /* ══════════════════════════════════════════════════════════════════════
       1. Canvas y contexto
       ══════════════════════════════════════════════════════════════════════ */
    const canvas = document.createElement("canvas");
    canvas.className = "statement-perception";
    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("role", "presentation");
    /* El respaldo CSS se monta en las dos rutas: sin WebGL es la composición
       de siempre y, con WebGL, queda debajo del lienzo por si el contexto se
       pierde —entonces la clase has-canvas se retira y vuelve a la vista—. */
    const fallback = document.createElement("div");
    fallback.className = "statement-fallback";
    fallback.setAttribute("aria-hidden", "true");
    stage.insertBefore(fallback, stage.firstChild);
    stage.insertBefore(canvas, fallback.nextSibling);

    const ATTR = {
        alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: false,
        powerPreference: "high-performance", failIfMajorPerformanceCaveat: false,
    };
    let gl = canvas.getContext("webgl", ATTR) || canvas.getContext("experimental-webgl", ATTR);

    /* Sin WebGL queda una composición de respaldo (CSS) que mantiene el
       punto de fuga y la retícula en perspectiva: el statement nunca se ve
       como una caja negra vacía. */
    if (!gl) {
        canvas.remove();
        stage.classList.add("is-fallback");
        return;
    }

    /* ══════════════════════════════════════════════════════════════════════
       2. Shaders
       GLSL ES 1.00 a propósito: el mismo código vale en WebGL 1 y WebGL 2.
       ══════════════════════════════════════════════════════════════════════ */
    const LINE_VS = `
    attribute vec3 aA0;
    attribute vec3 aA1;
    attribute vec3 aB0;
    attribute vec3 aB1;
    attribute vec4 aParam;   /* rol, nacimiento, canal, intensidad */
    attribute vec2 aCorner;  /* línea: (lado, avance) · plano: (u, v) */

    uniform mat4 uVP;
    uniform vec3 uCam;
    uniform vec2 uRes;
    uniform float uTime;
    uniform float uLineW;
    uniform float uMode;     /* 0 líneas · 1 planos */
    uniform vec4 uRev;       /* revelado por canal: origen, humano, IA, híbrido */
    uniform vec2 uMorph;     /* x racionaliza lo humano · y deforma lo artificial */
    uniform vec3 uOpen;      /* x despliegue · y frente de onda · z amplitud */

    varying vec3 vCol;
    varying float vI;
    varying vec2 vCorner;
    varying float vPend;

    const float PI = 3.14159265359;

    float hfHash(vec2 p) {
        return fract(sin(dot(p, vec2(41.31, 289.7))) * 43758.5453);
    }

    /* Ruido pseudo-periódico de dos ondas: barato y suficiente para torcer
       una línea sin volverla ruido. */
    float hfNoise(vec3 p) {
        return sin(p.x * 1.71 + sin(p.y * 1.27) * 1.13 + sin(p.z * 0.91) * 1.41)
             * sin(p.z * 1.87 + sin(p.x * 0.83) * 1.19 + sin(p.y * 1.63) * 0.87);
    }

    /* El campo de deformación del espacio. Lo comparten los dos sistemas —por
       eso sus líneas llegan a alinearse y a cortarse— y es el mismo del
       retroceso: sólo depende de la posición y de los uniformes.

       La síntesis no retuerce el espacio: lo ORDENA. El giro es leve y sólo
       alcanza al perímetro (el fondo conserva su perspectiva), y el radio se
       recoge sobre un perfil de cinco lóbulos. Así el corredor humano, la
       celosía medida y el huso acaban formando la misma cáscara lobulada:
       la escultura híbrida. */
    vec3 hfWarp(vec3 p, float amt, float openAmt, float depthFold) {
        float px = p.x, py = p.y, pz = p.z;
        float a = atan(py, px);
        float r = length(vec2(px, py));
        float d = clamp((pz + 46.0) / 92.0, 0.0, 1.0);   /* 0 cerca · 1 al fondo */

        /* 0 · Plegado en profundidad: el corredor no se pierde hacia dentro, se
               comprime alrededor de un plano. La retícula medida casi no se
               pliega —sigue siendo el esqueleto exacto—, así que la síntesis es
               también la historia de cuál de los dos se dobla. */
        pz = -14.0 + (pz + 14.0) * (1.0 - depthFold);
        d = clamp((pz + 46.0) / 92.0, 0.0, 1.0);
        px = cos(a) * r;
        py = sin(a) * r;

        /* 1 · Giro leve, sólo en el perímetro. */
        a += amt * 0.62 * (1.0 - d * 0.55) * smoothstep(1.6, 9.0, r);

        /* 2 · Los dos sistemas se recogen sobre el mismo perfil de cinco
               lóbulos: ahí es donde dejan de ser dos. */
        float lobe = cos(5.0 * a + pz * 0.155 + uTime * 0.03);
        float shell = 5.0 + 1.7 * lobe;
        r = mix(r, shell, amt * 0.70) * (1.0 + amt * 0.04 * lobe);

        /* 3 · Apertura final: los pétalos se separan y el conjunto avanza,
               más el frente, que es quien cruza la escena. */
        r *= 1.0 + openAmt * (0.34 + 0.42 * (1.0 - d));
        pz += openAmt * (5.0 + 4.5 * (1.0 - d));

        return vec3(cos(a) * r, sin(a) * r, pz);
    }

    void main() {
        float role = aParam.x;
        float birth = aParam.y;
        float chan = aParam.z;
        float inten = aParam.w;

        float rev = chan < 0.5 ? uRev.x : (chan < 1.5 ? uRev.y : (chan < 2.5 ? uRev.z : uRev.w));
        float grow = clamp((rev - birth) / 0.32, 0.0, 1.0);

        /* El corredor humano cede un punto de luz: cuando la retícula llega,
           se lee por delante sin necesidad de subir el cian. */
        float noiseWeight = role < 1.5 ? 0.86 : 1.0;
        float human = role < 2.5 ? 1.0 : 0.0;
        float ai = (role > 2.5 && role < 7.5) ? 1.0 : 0.0;
        float mh = uMorph.x * human;
        float ma = uMorph.y * ai;

        /* El pétalo no se racionaliza: se despliega (su destino es la forma
           abierta, y el scroll lo recorre de ida y de vuelta). */
        float mo = role > 7.5 ? uOpen.x : mh;
        vec3 p0 = mix(aA0, aB0, mo);
        vec3 p1 = mix(aA1, aB1, mo);

        /* El sistema artificial empieza a deformarse: pierde la escuadra. */
        if (ma > 0.001) {
            vec3 off = vec3(
                hfNoise(p0 * 0.19 + vec3(0.0, 0.0, uTime * 0.03)),
                hfNoise(p1 * 0.21 + vec3(3.1, 1.7, uTime * 0.03)),
                hfNoise((p0 + p1) * 0.17 + vec3(7.3, 5.2, uTime * 0.025))
            ) * (0.42 * ma);
            p0 += off;
            p1 += off * 0.85;
        }

        float amt = uMorph.x;
        float fold = amt * (role < 2.5 ? 0.80 : 0.26);
        p0 = hfWarp(p0, amt, uOpen.x, fold);
        p1 = hfWarp(p1, amt, uOpen.x, fold);

        float seed = hfHash(aParam.zw + aCorner);

        if (uMode < 0.5) {
            /* Las líneas se extienden desde su origen: la construcción es un
               trazo, no una aparición. */
            p1 = mix(p0, p1, grow);
            vPend = 1.0 - grow;
        } else {
            vPend = 0.0;
        }

        /* Respiración casi imperceptible, común a los dos extremos para que
           el segmento no se estire. */
        vec3 mid = (p0 + p1) * 0.5;
        vec3 breath = vec3(
            sin(uTime * 0.29 + mid.z * 0.11),
            sin(uTime * 0.23 + mid.x * 0.14),
            sin(uTime * 0.19 + mid.y * 0.16)
        ) * 0.055;
        p0 += breath;
        p1 += breath;

        vec4 c0 = uVP * vec4(p0, 1.0);
        vec4 c1 = uVP * vec4(p1, 1.0);
        vec2 n0 = c0.xy / max(c0.w, 0.0001);
        vec2 n1 = c1.xy / max(c1.w, 0.0001);

        float dist = distance(uCam, mid);
        float atten = exp(-dist * 0.021) * mix(1.0, 0.16, clamp((dist - 9.0) / 74.0, 0.0, 1.0));

        /* Frente de onda de la fase 05: una sola ola de luz que recorre la
           estructura de dentro hacia fuera y se apaga al llegar. */
        float flow = clamp((mid.z + 44.0) / 88.0, 0.0, 1.0);
        float wave = exp(-pow((flow - uOpen.y) * 2.7, 2.0)) * uOpen.z;
        inten *= noiseWeight;
        /* Pulso lento y la luz no se enciende en todas las líneas a la vez. */
        float shimmer = 0.5 + 0.5 * sin(flow * 6.3 - uTime * 0.5 + seed * 6.2831);

        vI = inten * atten * (0.74 + 0.26 * shimmer) * (1.0 + wave * 2.1);
        /* Las dos voces: el blanco frío de la percepción y el cian medido de
           la máquina. El híbrido es la mezcla, y por eso va en blanco-azul. */
        vCol = chan < 1.5 ? vec3(0.945, 0.960, 0.980)
             : (chan < 2.5 ? vec3(0.510, 0.885, 0.975) : vec3(0.760, 0.900, 1.000));
        /* Al final la escultura manda: los lomos y los pétalos suben de
           intensidad mientras el armazón heredado se queda donde estaba. */
        if (role > 6.5) vI *= 1.0 + 1.05 * uMorph.x + 1.45 * uOpen.x;
        vCorner = aCorner;

        if (uMode > 0.5) {
            vI *= grow;
            gl_Position = c0;
            return;
        }

        /* El centro de la pantalla se apaga y el perímetro se enciende: el
           titular manda y la arquitectura respira en los bordes. */
        float rad = length((n0 + n1) * 0.5);
        vI *= mix(0.20, 1.0, smoothstep(0.08, 0.70, rad));

        vec2 dir = (n1 - n0) * uRes;
        float len = length(dir);
        vec2 nrm = len > 0.0001 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
        float w = uLineW * (0.70 + 0.62 * inten);
        vec2 off = nrm * (w * 2.0 / uRes) * aCorner.x;
        c0.xy += off * c0.w;
        c1.xy += off * c1.w;
        gl_Position = aCorner.y < 0.5 ? c0 : c1;
    }`;

    const LINE_FS = `
    precision highp float;

    varying vec3 vCol;
    varying float vI;
    varying vec2 vCorner;
    varying float vPend;

    uniform float uMode;

    void main() {
        vec3 col = vCol * vI;
        if (uMode > 0.5) {
            /* Plano translúcido: casi nada en el centro, luz en las aristas
               y un reflejo sesgado que lo hace leer como vidrio. */
            float e = max(abs(vCorner.x), abs(vCorner.y));
            float edge = pow(clamp(e, 0.0, 1.0), 6.0) * 1.15 + 0.06;
            float sheen = exp(-pow((vCorner.x * 0.75 + vCorner.y * 0.65) * 1.35, 2.0)) * 0.30;
            gl_FragColor = vec4(col * (edge + sheen) * (vI * 0.34), 1.0);
            return;
        }
        float cover = exp(-vCorner.x * vCorner.x * 3.3);
        cover *= mix(1.0, smoothstep(1.0, 0.84, vCorner.y), vPend);
        gl_FragColor = vec4(col * cover, 1.0);
    }`;

    const POINT_VS = `
    attribute vec3 aH;       /* anclaje en el sistema humano */
    attribute vec3 aA;       /* anclaje en el sistema artificial */
    attribute vec4 aParam;   /* nacimiento, semilla, tamaño, intensidad */
    attribute vec2 aCorner;

    uniform mat4 uVP;
    uniform vec3 uCam;
    uniform vec2 uRes;
    uniform float uTime;
    uniform float uProg;
    uniform vec4 uRev;
    uniform vec2 uMorph;
    uniform vec3 uOpen;

    varying float vI;
    varying vec3 vCol;
    varying vec2 vCorner;

    vec3 hfWarpP(vec3 p, float amt, float openAmt, float depthFold) {
        float px = p.x, py = p.y, pz = p.z;
        float a = atan(py, px);
        float r = length(vec2(px, py));
        float d = clamp((pz + 46.0) / 92.0, 0.0, 1.0);
        pz = -14.0 + (pz + 14.0) * (1.0 - depthFold);
        d = clamp((pz + 46.0) / 92.0, 0.0, 1.0);
        px = cos(a) * r;
        py = sin(a) * r;
        a += amt * 0.62 * (1.0 - d * 0.55) * smoothstep(1.6, 9.0, r);
        float lobe = cos(5.0 * a + pz * 0.155 + uTime * 0.03);
        float shell = 5.0 + 1.7 * lobe;
        r = mix(r, shell, amt * 0.70) * (1.0 + amt * 0.04 * lobe);
        r *= 1.0 + openAmt * (0.34 + 0.42 * (1.0 - d));
        pz += openAmt * (5.0 + 4.5 * (1.0 - d));
        return vec3(cos(a) * r, sin(a) * r, pz);
    }

    void main() {
        float birth = aParam.x;
        float seed = aParam.y;
        /* Mientras la IA se ensambla, los nodos viajan de la geometría humana
           a su cita: el intercambio es un desplazamiento, no un icono. */
        float link = smoothstep(0.30, 0.70, uRev.z);
        vec3 p = mix(aH, aA, link);
        p = hfWarpP(p, uMorph.x, uOpen.x, uMorph.x * 0.62);

        vec4 c = uVP * vec4(p, 1.0);
        float dist = distance(uCam, p);

        float flash = exp(-pow((uProg - birth) * 15.0, 2.0));
        float ember = 0.14 * smoothstep(birth, birth + 0.06, uProg);
        float twin = 0.6 + 0.4 * sin(uTime * 1.6 + seed * 12.0);
        float gate = mix(1.0, smoothstep(0.34, 0.62, uRev.z), step(0.2, birth));
        float on = aParam.w * gate * (flash * 2.3 + ember * twin);

        float size = aParam.z * (1.0 + flash * 1.5);
        c.xy += aCorner * (size * 2.0 / uRes) * c.w;
        gl_Position = c;

        float rad = length(c.xy / max(c.w, 0.0001));
        vI = on * exp(-dist * 0.02) * mix(0.22, 1.0, smoothstep(0.05, 0.55, rad));
        vCol = mix(vec3(0.914, 0.929, 0.949), vec3(0.451, 0.851, 0.961), fract(seed * 3.7));
        vCorner = aCorner;
    }`;

    const POINT_FS = `
    precision highp float;

    varying float vI;
    varying vec3 vCol;
    varying vec2 vCorner;

    void main() {
        float d = length(vCorner);
        float core = exp(-d * d * 3.4);
        float halo = exp(-d * d * 1.1) * 0.28;
        gl_FragColor = vec4(vCol * (vI * (core + halo)), 1.0);
    }`;

    const QUAD_VS = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

    const BRIGHT_FS = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform float uThresh;
    void main() {
        vec3 c = texture2D(uTex, vUv).rgb;
        float l = max(max(c.r, c.g), c.b);
        gl_FragColor = vec4(c * smoothstep(uThresh, uThresh + 0.30, l), 1.0);
    }`;

    const BLUR_FS = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uDir;
    void main() {
        vec3 s = texture2D(uTex, vUv).rgb * 0.2270;
        s += (texture2D(uTex, vUv + uDir).rgb + texture2D(uTex, vUv - uDir).rgb) * 0.3160;
        s += (texture2D(uTex, vUv + uDir * 2.3333).rgb + texture2D(uTex, vUv - uDir * 2.3333).rgb) * 0.0700;
        gl_FragColor = vec4(s, 1.0);
    }`;

    /* Composición final: escena + brillo contenido, un velo oscuro bajo el
       titular para que el texto nunca compita, viñeta, tono y tramado fino
       (sin él, estos degradados tan oscuros se escalonan). */
    const COMP_FS = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uScene;
    uniform sampler2D uGlow;
    uniform vec2 uRes;
    uniform vec4 uSafe;     /* centro (uv) y radio (uv) de la zona del titular */
    uniform float uBloom;
    uniform float uTime;

    float hfDither(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec3 s = texture2D(uScene, vUv).rgb;
        vec3 g = texture2D(uGlow, vUv).rgb;
        vec3 c = s + g * uBloom * vec3(0.62, 0.78, 0.96);

        vec2 q = (vUv - uSafe.xy) / max(uSafe.zw, vec2(0.0001));
        c *= mix(0.30, 1.0, smoothstep(0.82, 1.5, length(q)));

        vec2 v = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0) * 1.12, 1.0);
        c *= mix(0.40, 1.0, smoothstep(0.22, 0.98, length(v)));

        c = c / (1.0 + c * 0.62);
        c = pow(max(c, vec3(0.0)), vec3(0.92));

        vec3 bg = vec3(0.0196, 0.0235, 0.0314);   /* #050608 */
        c = bg + c * (1.0 - bg);
        c += (hfDither(vUv * uRes + fract(uTime)) - 0.5) * 0.0035;
        gl_FragColor = vec4(max(c, bg), 1.0);
    }`;

    /* ══════════════════════════════════════════════════════════════════════
       3. Utilidades GL
       ══════════════════════════════════════════════════════════════════════ */
    function compile(type, source) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, source);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            if (DEV) console.warn("[statement-perception]", gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    function program(vsSource, fsSource) {
        const vs = compile(gl.VERTEX_SHADER, vsSource);
        const fs = compile(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        const p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            if (DEV) console.warn("[statement-perception]", gl.getProgramInfoLog(p));
            gl.deleteProgram(p);
            return null;
        }
        return p;
    }

    function buffer(data) {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return b;
    }

    function indexBuffer(data) {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return b;
    }

    function texture() {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }

    function target(t, w, h) {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return f;
    }

    /* ══════════════════════════════════════════════════════════════════════
       4. Geometría — determinista, construida una sola vez
       Cada vértice lleva sus dos estados (natural y destino) y el shader
       interpola. Nada se reconstruye con el scroll.
       ══════════════════════════════════════════════════════════════════════ */
    const TAU = Math.PI * 2;

    /* Azar con semilla: la pieza es reproducible fotograma a fotograma. */
    function mulberry32(a) {
        return function () {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const cfg = mobile ? {
        rays: 18, levels: 14, ringEvery: 3,
        panelsH: 4, panelGrid: 2,
        spire: { a: 3.05, c: 2.25, mu: 1.05, n: 16, seg: 4, y: -7.5 },
        shell: { r: 4.8, band: 0.6, step: 2.6, yMax: 5.2 },
        grid: { step: 5.5, span: 26, yFloor: -5.0, yRoof: 5.6, seg: 6, planes: 1 },
        points: 22,
    } : {
        rays: 27, levels: 21, ringEvery: 3,
        panelsH: 6, panelGrid: 3,
        spire: { a: 3.1, c: 2.3, mu: 1.15, n: 26, seg: 5, y: -8.2 },
        shell: { r: 5.2, band: 0.62, step: 3.0, yMax: 6.0 },
        grid: { step: 5.5, span: 34, yFloor: -5.4, yRoof: 6.2, seg: 8, planes: 2 },
        points: 46,
    };

    /* ── El corredor humano ────────────────────────────────────────────────
       Un campo de visión: un punto de fuga fuera de eje, radios con reparto
       irregular (nunca alícuota) y anillos que respiran. Su versión racional
       —reparto uniforme, sección circular, sin deriva— es el destino de la
       síntesis: el mismo cuerpo, ya medido. */
    const HZ_NEAR = -1.2;
    const HZ_FAR = -108;    /* más allá del alcance de la niebla: se pierde */

    function hLevel(i) { return i / (cfg.levels - 1); }
    function hAngle(j, rational) {
        if (rational) return (j / cfg.rays) * TAU;
        return (j / cfg.rays) * TAU + 0.22 * Math.sin(j * 2.37) + 0.07 * Math.sin(j * 5.9 + 0.6);
    }
    function hRadius(v) {
        /* El radio no llega nunca a cero: el corredor se lee como un espacio
           que se aleja, no como un embudo que se cierra en el eje. */
        return 8.1 * (1 - 0.46 * v) * (1 + 0.085 * Math.sin(v * 3.35 + 0.7));
    }
    function hWobble(j, v) {
        return 0.34 * Math.sin(v * 3.9 + j * 1.31)
             + 0.20 * Math.sin(v * 8.7 - j * 0.63 + 1.4)
             + 0.11 * Math.sin(v * 17.3 + j * 2.1);
    }
    function hAxis(v) {
        /* El eje del corredor humano: una curva que sale del centro del
           encuadre y se pierde por un lado. Un espacio sin un único punto de
           fuga se lee como arquitectura, no como túnel. */
        return [
            3.1 * Math.sin(v * 1.75 + 0.25) - 0.30 * v,
            -1.9 * Math.sin(v * 2.35 + 1.05) + 0.55 * v,
        ];
    }
    function hPoint(j, i, rational) {
        const v = hLevel(i);
        const ang = hAngle(j, rational);
        const rBase = hRadius(v);
        const r = rational
            ? rBase
            : rBase * (1 + hWobble(j, v) * 0.085) + hWobble(j, v) * 0.52;
        const axis = hAxis(v);
        const cx = rational ? 0 : axis[0];
        const cy = rational ? 0 : axis[1];
        const ex = rational ? 1 : 1.09 + 0.05 * Math.sin(v * 2.2 + j * 0.21);
        const ey = rational ? 1 : 0.93 + 0.05 * Math.cos(v * 1.7 + j * 0.33);
        const z = HZ_NEAR + (HZ_FAR - HZ_NEAR) * v + (rational ? 0 : 0.35 * Math.sin(j * 0.9 + v * 2.0));
        return [cx + Math.cos(ang) * r * ex, cy + Math.sin(ang) * r * ey, z];
    }

    /* ── El huso reglado (doble familia) ───────────────────────────────────
       x² + z² = a²(1 + t²), y = c·t: por cada punto del ecuador pasan dos
       rectas exactas. Es el cuerpo matemático del sistema artificial y, al
       plegarse, el armazón de la escultura híbrida. */
    function spirePoint(u, t, sign, centerY) {
        const a = cfg.spire.a;
        const c = cfg.spire.c;
        return [
            a * Math.cos(u) - t * a * Math.sin(u) * sign,
            centerY + c * t,
            a * Math.sin(u) + t * a * Math.cos(u) * sign,
        ];
    }

    /* ── Constructores de búfer ───────────────────────────────────────────
       Vértice: 18 floats — dos estados en parejas y los parámetros. */
    const STRIDE = 18;

    function makeSink() {
        return { data: [], index: [], verts: 0, segs: 0, quads: 0 };
    }

    /* Un segmento son cuatro vértices que comparten la recta (extremo inicial
       y final en sus dos estados) y sólo se diferencian en la esquina del
       quad: (lado, avance) = (-1,0), (1,0), (-1,1), (1,1). El ancho real lo
       decide el shader, así que la línea mantiene su grosor en píxeles con
       cualquier profundidad. */
    function pushSegment(sink, a0, a1, b0, b1, role, birth, chan, inten) {
        const base = sink.verts;
        for (let k = 0; k < 4; k++) {
            sink.data.push(
                a0[0], a0[1], a0[2], a1[0], a1[1], a1[2],
                b0[0], b0[1], b0[2], b1[0], b1[1], b1[2],
                role, birth, chan, inten,
                (k === 0 || k === 2) ? -1 : 1, k < 2 ? 0 : 1
            );
        }
        sink.index.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        sink.verts += 4;
        sink.segs++;
    }

    /* Un plano: cada vértice lleva su propia esquina en los dos estados y su
       (u, v) en [-1,1], que el fragmento usa para encender las aristas. */
    function pushQuad(sink, corners, bCorners, role, birth, chan, inten) {
        const base = sink.verts;
        const uv = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (let k = 0; k < 4; k++) {
            const a = corners[k];
            const b = bCorners[k];
            sink.data.push(
                a[0], a[1], a[2], a[0], a[1], a[2],
                b[0], b[1], b[2], b[0], b[1], b[2],
                role, birth, chan, inten,
                uv[k][0], uv[k][1]
            );
        }
        sink.index.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        sink.verts += 4;
        sink.quads++;
    }

    /* Sink secundario para planos: mismo formato, otro programa de dibujo. */
    const lines = makeSink();
    const planes = makeSink();
    const points = [];   /* aH(3) aA(3) param(4) corner(2) */

    function pushPoint(h, a, birth, seed, size, inten) {
        const base = points.length / 12;
        const uv = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (let k = 0; k < 4; k++) {
            points.push(h[0], h[1], h[2], a[0], a[1], a[2], birth, seed, size, inten, uv[k][0], uv[k][1]);
        }
        return base;
    }

    const rnd = mulberry32(20261004);

    /* ── 01/02 · El origen y el corredor humano ──────────────────────────── */
    const ORIGIN = [0, 0, -13.5];

    function buildHuman() {
        /* Las primeras líneas: nacen del punto y se extienden hacia fuera. */
        const seedCount = mobile ? 6 : 9;
        for (let s = 0; s < seedCount; s++) {
            const ang = (s / seedCount) * TAU + 0.4;
            const reach = 12 + rnd() * 9;
            const end = [ORIGIN[0] + Math.cos(ang) * reach, ORIGIN[1] + Math.sin(ang) * reach * 0.62, ORIGIN[2] - 4 - rnd() * 16];
            pushSegment(lines, ORIGIN.slice(), end, ORIGIN.slice(), end, 0, 0.02 + s * 0.035, 0, 0.30);
        }

        /* Radios: el esqueleto en perspectiva. Una parte (los cercanos a la
           cámara) son los que arrancan en la fase 01. */
        for (let j = 0; j < cfg.rays; j++) {
            for (let i = 0; i < cfg.levels - 1; i++) {
                const v = hLevel(i);
                const a0 = hPoint(j, i, false);
                const a1 = hPoint(j, i + 1, false);
                const b0 = hPoint(j, i, true);
                const b1 = hPoint(j, i + 1, true);
                /* Hacia el fondo, una de cada dos: en la síntesis esa mitad
                   se pliega sobre el centro y sólo añade madeja. */
                if (v > 0.42 && i % 2 === 1) continue;
                const chan = (j % 6 === 0 && i < 4) ? 0 : 1;
                const birth = chan === 0 ? 0.06 + i * 0.07 : 0.06 + 0.74 * v + (j % 5) * 0.012;
                pushSegment(lines, a0, a1, b0, b1, 0, Math.min(birth, 0.94), chan, 0.22);
            }
        }

        /* Anillos: la sección del espacio. Sólo uno de cada ringEvery —los
           suficientes para leer la perspectiva y no convertirla en escalera. */
        for (let i = cfg.ringEvery + 1; i < cfg.levels; i += cfg.ringEvery) {
            const v = hLevel(i);
            for (let j = 0; j < cfg.rays; j++) {
                const k = (j + 1) % cfg.rays;
                const a0 = hPoint(j, i, false);
                const a1 = hPoint(k, i, false);
                const b0 = hPoint(j, i, true);
                const b1 = hPoint(k, i, true);
                const birth = 0.10 + 0.70 * v + (j % 7) * 0.010;
                pushSegment(lines, a0, a1, b0, b1, 1, Math.min(birth, 0.94), 1, 0.26);
            }
        }

        /* Planos del corredor: celdas de la propia superficie, dobladas. */
        for (let p = 0; p < cfg.panelsH; p++) {
            const i0 = 2 + rnd() * (cfg.levels - 6);
            const j0 = rnd() * cfg.rays;
            const spanI = 1.6 + rnd() * 1.8;
            const spanJ = 1.6 + rnd() * 1.8;
            const grid = cfg.panelGrid;
            for (let gi = 0; gi < grid; gi++) {
                for (let gj = 0; gj < grid; gj++) {
                    const iA = i0 + (spanI * gi) / grid;
                    const iB = i0 + (spanI * (gi + 1)) / grid;
                    const jA = j0 + (spanJ * gj) / grid;
                    const jB = j0 + (spanJ * (gj + 1)) / grid;
                    const corn = [
                        hPoint(jA, iA, false), hPoint(jB, iA, false),
                        hPoint(jA, iB, false), hPoint(jB, iB, false),
                    ];
                    const bc = [
                        hPoint(jA, iA, true), hPoint(jB, iA, true),
                        hPoint(jA, iB, true), hPoint(jB, iB, true),
                    ];
                    /* Un abombamiento suave: la celda no es un rectángulo. */
                    for (const c of corn) {
                        const bulge = 0.5 + 0.5 * Math.sin(c[2] * 0.6 + c[0] * 0.3);
                        c[0] *= 1 + 0.05 * bulge;
                        c[1] *= 1 + 0.05 * bulge;
                    }
                    pushQuad(planes, corn, bc, 2, Math.min(0.24 + 0.5 * hLevel(iA) + p * 0.02, 0.9), 1, 0.9 + p * 0.05);
                }
            }
        }
    }

    /* ── 03 · El sistema artificial ──────────────────────────────────────── */
    function buildArtificial() {
        const sp = cfg.spire;
        /* Huso reglado: dos familias de rectas exactas, ensambladas desde el
           ecuador hacia los extremos. */
        for (let fam = 0; fam < 2; fam++) {
            const sign = fam === 0 ? 1 : -1;
            for (let k = 0; k < sp.n; k++) {
                const u = (k / sp.n) * TAU + (fam === 1 ? TAU / (2 * sp.n) : 0);
                const birth = 0.05 + 0.55 * (k / sp.n);
                for (let s = 0; s < sp.seg; s++) {
                    const t0 = -sp.mu + (2 * sp.mu * s) / sp.seg;
                    const t1 = -sp.mu + (2 * sp.mu * (s + 1)) / sp.seg;
                    const outer0 = Math.abs(t0), outer1 = Math.abs(t1);
                    let a0 = spirePoint(u, t0, sign, sp.y);
                    let a1 = spirePoint(u, t1, sign, sp.y);
                    /* Crece desde el ecuador: el extremo más cercano al centro
                       es el origen del trazo. */
                    if (outer0 > outer1) { const tmp = a0; a0 = a1; a1 = tmp; }
                    const inten = 0.42 * (1 - 0.35 * Math.max(outer0, outer1) / sp.mu);
                    pushSegment(lines, a0, a1, a0.slice(), a1.slice(), 3,
                        Math.min(birth + s * 0.03, 0.93), 2, inten);
                }
            }
        }

        /* Aros exactos: ecuador y bordes. */
        const rims = [
            [0, sp.a, 0.62],                       /* ecuador */
            [sp.mu, sp.a * Math.sqrt(1 + sp.mu * sp.mu), 0.86],
            [-sp.mu, sp.a * Math.sqrt(1 + sp.mu * sp.mu), 0.86],
        ];
        for (const [t, radius, birth] of rims) {
            const n = mobile ? 26 : 44;
            for (let k = 0; k < n; k++) {
                const u0 = (k / n) * TAU;
                const u1 = ((k + 1) / n) * TAU;
                const a0 = [radius * Math.cos(u0), sp.y + sp.c * t, radius * Math.sin(u0)];
                const a1 = [radius * Math.cos(u1), sp.y + sp.c * t, radius * Math.sin(u1)];
                pushSegment(lines, a0, a1, a0.slice(), a1.slice(), 5,
                    Math.min(birth + 0.06 * (k / n), 0.94), 2, 0.42);
            }
        }

        /* Celosía medida: una retícula cúbica recortada por una cáscara
           cilíndrica. Las líneas no se dibujan enteras: existen sólo donde
           la cáscara las corta, y de ahí salen las teselas exactas. */
        const sh = cfg.shell;
        const reach = Math.ceil((sh.r + sh.band) / sh.step) + 1;
        const yMax = sh.yMax;
        const yLevels = Math.floor(yMax / sh.step);
        for (let gy = -yLevels; gy <= yLevels; gy++) {
            const y = gy * sh.step;
            const birthY = 0.10 + 0.52 * (1 - (y + yMax) / (2 * yMax));
            for (let g = -reach; g <= reach; g++) {
                const off = g * sh.step;
                /* Rectas paralelas a X y a Z: existen donde cortan la cáscara. */
                for (let axis = 0; axis < 2; axis++) {
                    const fixed = off;
                    const inner = Math.max(0, (sh.r - sh.band) * (sh.r - sh.band) - fixed * fixed);
                    const outer = Math.max(0, (sh.r + sh.band) * (sh.r + sh.band) - fixed * fixed);
                    const x0 = Math.sqrt(inner), x1 = Math.sqrt(outer);
                    if (x1 < 0.05) continue;
                    for (const side of [-1, 1]) {
                        const s0 = side * x0, s1 = side * x1;
                        const steps = Math.max(1, Math.round(Math.abs(s1 - s0) / 0.9));
                        for (let s = 0; s < steps; s++) {
                            const f0 = s0 + (s1 - s0) * (s / steps);
                            const f1 = s0 + (s1 - s0) * ((s + 1) / steps);
                            let a0, a1;
                            if (axis === 0) {
                                a0 = [f0, y, fixed];
                                a1 = [f1, y, fixed];
                            } else {
                                a0 = [fixed, y, f0];
                                a1 = [fixed, y, f1];
                            }
                            const jitter = ((Math.abs(g * 7 + gy * 13 + axis * 29) % 11) / 11) * 0.09;
                            pushSegment(lines, a0, a1, a0.slice(), a1.slice(), 4,
                                Math.min(birthY + jitter, 0.95), 2, 0.20);
                        }
                    }
                }
            }
        }
        /* Montantes verticales de la cáscara. */
        for (let gx = -reach; gx <= reach; gx++) {
            for (let gz = -reach; gz <= reach; gz++) {
                const x = gx * sh.step, z = gz * sh.step;
                const r = Math.hypot(x, z);
                if (Math.abs(r - sh.r) > sh.band) continue;
                const steps = Math.max(2, Math.round((2 * yMax) / 1.1));
                for (let s = 0; s < steps; s++) {
                    const y0 = -yMax + (2 * yMax * s) / steps;
                    const y1 = -yMax + (2 * yMax * (s + 1)) / steps;
                    const birth = 0.10 + 0.52 * (1 - (y0 + yMax) / (2 * yMax)) + ((gx * 3 + gz * 5) % 7) * 0.012;
                    pushSegment(lines, [x, y0, z], [x, y1, z], [x, y0, z], [x, y1, z], 4,
                        Math.min(birth, 0.95), 2, 0.22);
                }
            }
        }

        /* Planos de retícula uniformes: suelo y dosel inclinado. Son los que
           dan escala —se salen del encuadre— y se apagan con la distancia y
           hacia el centro, donde vive el titular. */
        const gr = cfg.grid;
        const count = Math.floor(gr.span / gr.step);
        for (let p = 0; p < gr.planes; p++) {
            const slope = p === 0 ? 0 : 0.075;
            const yBase = p === 0 ? gr.yFloor : gr.yRoof;
            for (let n = -count; n <= count; n++) {
                const c = n * gr.step;
                for (let axis = 0; axis < 2; axis++) {
                    const steps = gr.seg;
                    for (let s = 0; s < steps; s++) {
                        const f0 = -gr.span + (2 * gr.span * s) / steps;
                        const f1 = -gr.span + (2 * gr.span * (s + 1)) / steps;
                        let a0, a1;
                        if (axis === 0) {
                            a0 = [f0, yBase + slope * c, c];
                            a1 = [f1, yBase + slope * c, c];
                        } else {
                            a0 = [c, yBase + slope * f0, f0];
                            a1 = [c, yBase + slope * f1, f1];
                        }
                        const midR = Math.hypot((a0[0] + a1[0]) * 0.5, (a0[2] + a1[2]) * 0.5);
                        const inten = 0.115 * Math.min(1, midR / 16);
                        if (inten < 0.012) continue;
                        const birth = 0.42 + 0.30 * Math.min(1, (Math.abs(c) + gr.span) / (2 * gr.span));
                        pushSegment(lines, a0, a1, a0.slice(), a1.slice(), 4,
                            Math.min(birth + (s % 3) * 0.02, 0.95), 2, inten);
                    }
                }
            }
        }

        /* Planos de vidrio exactos: paralelos a la retícula, sin doblar. */
        const glass = mobile ? 3 : 6;
        for (let k = 0; k < glass; k++) {
            const y0 = -3.2 + k * 1.35;
            const z0 = -2 - k * 2.4;
            const w = 3.4 + (k % 3) * 0.9;
            const h = 2.1 + (k % 2) * 0.7;
            const corn = [
                [-w, y0, z0], [w, y0, z0], [-w, y0 + h, z0], [w, y0 + h, z0],
            ];
            pushQuad(planes, corn, corn.map((c) => c.slice()), 6,
                Math.min(0.44 + k * 0.06, 0.9), 2, 0.85);
        }
    }

    /* ── 04/05 · La síntesis y la apertura ───────────────────────────────── */
    function buildHybrid() {
        /* Aristas del plegado: cinco hélices que recorren los lomos del
           plegado quíntuple (cos(5a + z·0.26) = 1), con el giro del espacio
           ya descontado para que el scroll las deje justo sobre el lomo. */
        const ridges = 5;
        const lomo = (k, v) => {
            const z = HZ_NEAR + (HZ_FAR - HZ_NEAR) * v;
            const depth = Math.min(Math.max((z + 46) / 92, 0), 1);
            return (TAU * k - 0.26 * z) / 5 - 1.18 * (1 - 0.70 * depth);
        };
        for (let k = 0; k < ridges; k++) {
            for (let i = 0; i < cfg.levels - 2; i++) {
                const v0 = hLevel(i);
                const v1 = hLevel(i + 1);
                const at = (v) => {
                    /* Radio y ángulo del lomo en el espacio sin girar: el
                       shader añade después el giro y el plegado. */
                    const r = hRadius(v) * 1.28;
                    const ang = lomo(k, v);
                    const cx = hAxis(v)[0];
                    const cy = hAxis(v)[1];
                    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, HZ_NEAR + (HZ_FAR - HZ_NEAR) * v];
                };
                const a0 = at(v0), a1 = at(v1);
                pushSegment(lines, a0, a1, a0.slice(), a1.slice(), 7,
                    0.02 + 0.42 * v0 + k * 0.02, 3, 0.55);
            }
        }

        /* La apertura: dos estrellas de cinco puntas giradas media punta —
           un diafragma— alrededor del antiguo punto de fuga. */
        /* Un poco más lejos de la cámara: la apertura vive DENTRO de la
           escultura, no delante de ella como un rótulo. */
        const cx = 0, cy = 0, z = -7.2;
        for (let ring = 0; ring < 2; ring++) {
            const rIn = ring === 0 ? 3.0 : 5.2;
            const rOut = ring === 0 ? 4.9 : 7.6;
            const phase = ring * (Math.PI / 5);
            for (let k = 0; k < 5; k++) {
                const a0 = phase + (k / 5) * TAU;
                const a1 = phase + ((k + 1) / 5) * TAU;
                const am = (a0 + a1) * 0.5;
                const pt = (ang, r) => [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, z];
                const inten = ring === 0 ? 0.40 : 0.32;
                pushSegment(lines, pt(a0, rIn), pt(am, rOut), pt(a0, rIn), pt(am, rOut), 8,
                    0.04 + k * 0.03 + ring * 0.05, 3, inten);
                pushSegment(lines, pt(am, rOut), pt(a1, rIn), pt(am, rOut), pt(a1, rIn), 8,
                    0.06 + k * 0.03 + ring * 0.05, 3, inten);
            }
        }

        /* Los pétalos: cinco planos que se cierran alrededor del eje y, al
           final, se despliegan hacia fuera. Cerrado es un capullo tenso;
           abierto, una flor arquitectónica que se sale del encuadre. */
        const petals = 5;
        const grid = mobile ? 2 : 3;
        /* Cerrado: una banda tensa alrededor del eje. Abierto: el mismo plano
           tumbado hacia la cámara, separado y saliéndose del encuadre. */
        const petalAt = (ang, u, v) => {
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const r = 3.0 + u * 4.4;
            const closed = [dx * r, -2.7 + v * 4.8, -4.4 + dy * r - v * 1.1];
            const r2 = 3.0 + u * 13.5;
            const open = [
                dx * r2 * 1.03,
                -3.8 + v * 4.4 + u * 1.7 + 0.5 * Math.sin(ang * 3.0),
                -2.4 + dy * r2 - u * 2.4,
            ];
            return [closed, open];
        };
        for (let k = 0; k < petals; k++) {
            const ang = (k / petals) * TAU + 0.12;
            for (let gu = 0; gu < grid; gu++) {
                for (let gv = 0; gv < grid; gv++) {
                    const c = [
                        petalAt(ang, gu / grid, gv / grid),
                        petalAt(ang, (gu + 1) / grid, gv / grid),
                        petalAt(ang, gu / grid, (gv + 1) / grid),
                        petalAt(ang, (gu + 1) / grid, (gv + 1) / grid),
                    ];
                    pushQuad(planes,
                        [c[0][0], c[1][0], c[2][0], c[3][0]],
                        [c[0][1], c[1][1], c[2][1], c[3][1]],
                        8, 0.50 + 0.30 * (gu / grid), 3, 1.15);
                }
            }
        }
    }

    /* ── Nodos de encuentro ───────────────────────────────────────────────
       Se calculan de verdad: se buscan los puntos donde el corredor humano
       pasa cerca del huso o de la cáscara. Cada nodo guarda sus dos anclajes
       y viaja de uno a otro cuando el sistema artificial se ensambla. */
    function buildNodes() {
        const sp = cfg.spire;
        const samples = [];
        for (let j = 0; j < cfg.rays; j += 2) {
            for (let i = 1; i < cfg.levels; i++) {
                samples.push(hPoint(j, i, false));
            }
        }
        /* Dos juegos de nodos, y el orden importa:
           · Los de ENCUENTRO son los que se calculan de verdad: puntos donde el
             corredor humano pasa por donde está el huso o la cáscara. Ahí es
             donde «algo se encuentra» y por eso se encienden.
           · Los del REPARTO reparten el resto por el corredor —siempre a más de
             un radio del huso, para que un nodo suelto no parezca un error—
             hasta completar el número que pide el reparto. */
        const wanted = cfg.points - 1;
        const found = [];
        const taken = [];
        const minGap = 2.6;
        const far = (s) => {
            const rad = Math.hypot(s[0], s[2]);
            const gapSpire = Math.abs(rad - sp.a * Math.sqrt(1 + Math.pow((s[1] - sp.y) / sp.c, 2)));
            const gapShell = Math.abs(rad - cfg.shell.r);
            return { gap: Math.min(gapSpire, gapShell), rad };
        };
        const roomy = (s) => !taken.some((t) => Math.hypot(t[0] - s[0], t[1] - s[1], t[2] - s[2]) < minGap);

        for (const s of samples) {
            if (found.length >= Math.round(wanted * 0.62)) break;
            if (far(s).gap > 0.6 || !roomy(s)) continue;
            found.push(s);
            taken.push(s);
        }
        for (let k = 0; found.length < wanted && k < samples.length * 2; k++) {
            const s = samples[(k * 7 + 3) % samples.length];
            if (far(s).gap < 1.1 || !roomy(s)) continue;
            found.push(s);
            taken.push(s);
        }
        /* El primero es la semilla: el punto de luz fría del arranque. */
        pushPoint(ORIGIN.slice(), ORIGIN.slice(), 0.03, 0.13, 13, 1.55);
        const flow = (s) => Math.min(1, Math.max(0, (s[2] + 44) / 88));
        found.forEach((s, k) => {
            const rad = Math.hypot(s[0], s[2]);
            const ai = [s[0] * (cfg.shell.r / Math.max(rad, 0.001)), s[1], s[2] * (cfg.shell.r / Math.max(rad, 0.001))];
            const birth = 0.36 + 0.52 * flow(s) + (k % 5) * 0.006;
            pushPoint(s, ai, Math.min(birth, 0.95), (k * 0.37) % 1, 3.4 + (k % 3) * 0.7, 0.85);
        });
    }

    buildHuman();
    buildArtificial();
    buildHybrid();
    buildNodes();

    const lineBuffer = buffer(new Float32Array(lines.data));
    const lineIndex = indexBuffer(new Uint16Array(lines.index));
    const planeBuffer = buffer(new Float32Array(planes.data));
    const planeIndex = indexBuffer(new Uint16Array(planes.index));
    const pointBuffer = buffer(new Float32Array(points));

    /* ══════════════════════════════════════════════════════════════════════
       5. Cámara y fases
       ══════════════════════════════════════════════════════════════════════ */
    const CAM_DESKTOP = [
        { t: 0.00, pos: [0.00, 0.10, 13.6], tgt: [0.00, 0.00, -8.0], fov: 40 },
        { t: 0.15, pos: [0.30, 0.20, 11.2], tgt: [0.85, 0.05, -12.0], fov: 40 },
        { t: 0.35, pos: [2.10, 0.45, 6.6], tgt: [-0.60, -0.30, -15.0], fov: 43 },
        { t: 0.55, pos: [2.60, -0.60, 2.4], tgt: [-1.60, 0.45, -11.0], fov: 45 },
        { t: 0.80, pos: [1.70, 1.25, 7.8], tgt: [0.20, 0.15, -8.5], fov: 42 },
        { t: 1.00, pos: [2.45, 0.60, 15.2], tgt: [0.15, 0.20, -7.5], fov: 41 },
    ];
    const CAM_MOBILE = [
        { t: 0.00, pos: [0.00, 0.20, 18.5], tgt: [0.00, 0.55, -7.0], fov: 42 },
        { t: 0.15, pos: [0.22, 0.32, 16.0], tgt: [0.55, 0.40, -10.0], fov: 42 },
        { t: 0.35, pos: [1.50, 0.30, 10.0], tgt: [-0.40, 0.10, -15.0], fov: 46 },
        { t: 0.55, pos: [2.05, -0.45, 4.8], tgt: [-1.10, 0.45, -11.0], fov: 48 },
        { t: 0.80, pos: [1.30, 1.35, 10.4], tgt: [0.20, 0.30, -8.5], fov: 46 },
        { t: 1.00, pos: [1.95, 0.75, 18.5], tgt: [0.10, 0.25, -7.5], fov: 44 },
    ];
    const CAM = mobile ? CAM_MOBILE : CAM_DESKTOP;

    /* Catmull-Rom con extremos duplicados: la cámara no se detiene en cada
       clave, sólo cambia de dirección —nunca da tirones. */
    function spline(keys, comp, t) {
        const n = keys.length;
        let i = 0;
        while (i < n - 2 && t > keys[i + 1].t) i++;
        const t0 = keys[i].t, t1 = keys[i + 1].t;
        const u = t1 > t0 ? Math.min(Math.max((t - t0) / (t1 - t0), 0), 1) : 0;
        const at = (idx) => keys[Math.max(0, Math.min(n - 1, idx))][comp];
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        const u2 = u * u, u3 = u2 * u;
        const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        if (comp === "fov") return cr(p0, p1, p2, p3);
        return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
    }

    const ss = (a, b, x) => {
        const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
        return t * t * (3 - 2 * t);
    };

    /* Todo el estado visual es función pura del progreso. */
    function stateAt(p, time) {
        const ph1 = ss(0.000, 0.150, p);
        const ph2 = ss(0.130, 0.360, p);
        const ph3 = ss(0.340, 0.560, p);
        const ph4 = ss(0.540, 0.800, p);
        const ph5 = ss(0.800, 1.000, p);
        const open = ss(0.800, 0.950, p);
        const morph = ss(0.500, 0.880, p);
        const deform = ss(0.560, 0.920, p);
        const wave = ss(0.840, 1.000, p);
        return {
            ph1, ph2, ph3, ph4, ph5,
            rev: [
                ss(0.004, 0.115, p),
                ss(0.090, 0.345, p),
                ss(0.330, 0.640, p),
                ss(0.500, 0.880, p),
            ],
            morph: [morph, deform],
            open: [open, -0.30 + wave * 1.55, Math.pow(Math.sin(Math.min(wave, 1) * Math.PI), 1.3) * 1.15],
            bloom: 0.55 + 0.55 * ph3 + 0.35 * ph4 + 0.55 * ph5,
            time,
        };
    }

    /* ══════════════════════════════════════════════════════════════════════
       6. Recursos de programa
       ══════════════════════════════════════════════════════════════════════ */
    const pLine = program(LINE_VS, LINE_FS);
    const pPoint = program(POINT_VS, POINT_FS);
    const pBright = program(QUAD_VS, BRIGHT_FS);
    const pBlur = program(QUAD_VS, BLUR_FS);
    const pComp = program(QUAD_VS, COMP_FS);
    if (!pLine || !pPoint || !pBright || !pBlur || !pComp) {
        canvas.remove();
        stage.classList.add("is-fallback");
        return;
    }

    const quadBuffer = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, -1, 1, 1, 1]));

    function attribs(p, list) {
        const out = {};
        for (const name of list) out[name] = gl.getAttribLocation(p, name);
        return out;
    }
    const aLine = attribs(pLine, ["aA0", "aA1", "aB0", "aB1", "aParam", "aCorner"]);
    const aPoint = attribs(pPoint, ["aH", "aA", "aParam", "aCorner"]);
    const aQuad = gl.getAttribLocation(pBright, "aPos");
    /* Las localizaciones de uniformes se resuelven una vez, no por fotograma. */
    const uni = (p, names) => {
        const out = {};
        for (const n of names) out[n] = gl.getUniformLocation(p, n);
        return out;
    };
    const U_LINE = uni(pLine, ["uVP", "uCam", "uRes", "uTime", "uLineW", "uMode", "uRev", "uMorph", "uOpen"]);
    const U_POINT = uni(pPoint, ["uVP", "uCam", "uRes", "uTime", "uProg", "uRev", "uMorph", "uOpen"]);
    const U_BRIGHT = uni(pBright, ["uTex", "uThresh"]);
    const U_BLUR = uni(pBlur, ["uTex", "uDir"]);
    const U_COMP = uni(pComp, ["uScene", "uGlow", "uRes", "uSafe", "uBloom", "uTime"]);

    /* ══════════════════════════════════════════════════════════════════════
       7. Tamaño, posproceso y ciclo de dibujo
       ══════════════════════════════════════════════════════════════════════ */
    const MAX_PIXELS = mobile ? 1100000 : 2600000;
    let W = 0, H = 0, GW = 0, GH = 0, dpr = 1;
    let sceneTex = null, sceneFbo = null, glowTexA = null, glowFboA = null, glowTexB = null, glowFboB = null;
    let useBloom = !mobile;
    let quality = 1;
    let safe = [0.5, 0.5, 0.6, 0.4];

    const mProj = new Float32Array(16);
    const mView = new Float32Array(16);
    const mVP = new Float32Array(16);

    function perspective(fov, aspect, near, far, out) {
        const f = 1 / Math.tan((fov * Math.PI / 180) / 2);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = (far + near) / (near - far);
        out[11] = -1;
        out[14] = (2 * far * near) / (near - far);
        return out;
    }

    function lookAt(eye, center, up, out) {
        let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
        let zl = Math.hypot(zx, zy, zz) || 1;
        zx /= zl; zy /= zl; zz /= zl;
        let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
        let xl = Math.hypot(xx, xy, xz) || 1;
        xx /= xl; xy /= xl; xz /= xl;
        const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
        out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
        out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
        out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
        out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
        out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
        out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
        out[15] = 1;
        return out;
    }

    function multiply(a, b, out) {
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
            }
        }
        return out;
    }

    function resize() {
        const rect = stage.getBoundingClientRect();
        const cssW = Math.max(1, Math.round(rect.width || window.innerWidth));
        const cssH = Math.max(1, Math.round(rect.height || window.innerHeight));
        let ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2) * quality;
        if (cssW * cssH * ratio * ratio > MAX_PIXELS) ratio = Math.sqrt(MAX_PIXELS / (cssW * cssH));
        ratio = Math.max(0.75, Math.min(ratio, mobile ? 1.5 : 2));
        const w = Math.max(1, Math.round(cssW * ratio));
        const h = Math.max(1, Math.round(cssH * ratio));
        if (w === W && h === H) return;
        W = w; H = h; dpr = ratio;
        GW = Math.max(8, Math.round(W / 4));
        GH = Math.max(8, Math.round(H / 4));
        canvas.width = W;
        canvas.height = H;

        if (!sceneTex) {
            sceneTex = texture(); sceneFbo = target(sceneTex, W, H);
            glowTexA = texture(); glowFboA = target(glowTexA, GW, GH);
            glowTexB = texture(); glowFboB = target(glowTexB, GW, GH);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, sceneTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindTexture(gl.TEXTURE_2D, glowTexA);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindTexture(gl.TEXTURE_2D, glowTexB);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        measureSafe();
    }

    /* La franja que ocupa el titular, en UV: debajo de ella la geometría se
       apaga para que el texto nunca pierda contraste. */
    function measureSafe() {
        if (!text) return;
        const r = text.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        if (!r.width || !s.width) return;
        const cx = (r.left + r.width / 2 - s.left) / s.width;
        const cy = 1 - (r.top + r.height / 2 - s.top) / s.height;
        const rx = (r.width / 2 / s.width) * 1.42 + 0.05;
        const ry = (r.height / 2 / s.height) * 1.85 + 0.06;
        safe = [cx, cy, rx, ry];
    }

    /* Los atributos se declaran sin asignar nada por fotograma: la tabla
       [localización, tamaño, desplazamiento] es constante y sólo se recorre
       con el buffer ya enlazado. */
    const LINE_LAYOUT = [
        [aLine.aA0, 3, 0], [aLine.aA1, 3, 12], [aLine.aB0, 3, 24], [aLine.aB1, 3, 36],
        [aLine.aParam, 4, 48], [aLine.aCorner, 2, 64],
    ];
    const POINT_LAYOUT = [
        [aPoint.aH, 3, 0], [aPoint.aA, 3, 12], [aPoint.aParam, 4, 24], [aPoint.aCorner, 2, 40],
    ];
    const LINE_STRIDE = STRIDE * 4;
    const POINT_STRIDE = 12 * 4;

    function setAttribs(layout, stride) {
        for (let i = 0; i < layout.length; i++) {
            const loc = layout[i][0];
            if (loc < 0) continue;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, layout[i][1], gl.FLOAT, false, stride, layout[i][2]);
        }
    }

    function setFullscreenAttrib(loc) {
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    function drawFullscreen(p, loc) {
        gl.useProgram(p);
        setFullscreenAttrib(loc);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    let lastProgress = -1;
    let lastTime = 0;

    function render(st, time) {
        const cam = spline(CAM, "pos", lastProgress);
        const tgt = spline(CAM, "tgt", lastProgress);
        const fov = spline(CAM, "fov", lastProgress);
        /* Deriva mínima: incluso en reposo la pieza respira. */
        const pos = [
            cam[0] + Math.sin(time * 0.11) * 0.06,
            cam[1] + Math.sin(time * 0.09 + 1.3) * 0.05,
            cam[2],
        ];
        const aspect = W / H;
        perspective(fov, aspect, 0.1, 260, mProj);
        lookAt(pos, tgt, [0, 1, 0], mView);
        multiply(mProj, mView, mVP);

        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);

        /* ─ Líneas: un solo draw call para toda la arquitectura ─ */
        gl.useProgram(pLine);
        gl.uniformMatrix4fv(U_LINE.uVP, false, mVP);
        gl.uniform3fv(U_LINE.uCam, pos);
        gl.uniform2f(U_LINE.uRes, W, H);
        gl.uniform1f(U_LINE.uTime, time);
        gl.uniform1f(U_LINE.uLineW, (mobile ? 0.95 : 1.08) * Math.min(dpr, 1.6));
        gl.uniform1f(U_LINE.uMode, 0);
        gl.uniform4fv(U_LINE.uRev, st.rev);
        gl.uniform2fv(U_LINE.uMorph, st.morph);
        gl.uniform3fv(U_LINE.uOpen, st.open);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        setAttribs(LINE_LAYOUT, LINE_STRIDE);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndex);
        gl.drawElements(gl.TRIANGLES, lines.index.length, gl.UNSIGNED_SHORT, 0);

        /* ─ Nodos de encuentro ─ */
        gl.useProgram(pPoint);
        gl.uniformMatrix4fv(U_POINT.uVP, false, mVP);
        gl.uniform3fv(U_POINT.uCam, pos);
        gl.uniform2f(U_POINT.uRes, W, H);
        gl.uniform1f(U_POINT.uTime, time);
        gl.uniform1f(U_POINT.uProg, lastProgress);
        gl.uniform4fv(U_POINT.uRev, st.rev);
        gl.uniform2fv(U_POINT.uMorph, st.morph);
        gl.uniform3fv(U_POINT.uOpen, st.open);
        gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
        setAttribs(POINT_LAYOUT, POINT_STRIDE);
        gl.drawArrays(gl.TRIANGLES, 0, points.length / 12);

        /* ─ Planos translúcidos ─ */
        gl.useProgram(pLine);
        gl.uniform1f(U_LINE.uMode, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, planeBuffer);
        setAttribs(LINE_LAYOUT, LINE_STRIDE);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, planeIndex);
        gl.drawElements(gl.TRIANGLES, planes.index.length, gl.UNSIGNED_SHORT, 0);

        gl.disable(gl.BLEND);

        /* ─ Brillo contenido a un cuarto de resolución ─ */
        if (useBloom) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, glowFboA);
            gl.viewport(0, 0, GW, GH);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(pBright);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, sceneTex);
            gl.uniform1i(U_BRIGHT.uTex, 0);
            gl.uniform1f(U_BRIGHT.uThresh, 0.22);
            setFullscreenAttrib(aQuad);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            gl.useProgram(pBlur);
            gl.uniform1i(U_BLUR.uTex, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, glowFboB);
            gl.bindTexture(gl.TEXTURE_2D, glowTexA);
            gl.uniform2f(U_BLUR.uDir, 1.35 / GW, 0);
            setFullscreenAttrib(gl.getAttribLocation(pBlur, "aPos"));
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            gl.bindFramebuffer(gl.FRAMEBUFFER, glowFboA);
            gl.bindTexture(gl.TEXTURE_2D, glowTexB);
            gl.uniform2f(U_BLUR.uDir, 0, 1.35 / GH);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        /* ─ Composición ─ */
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.useProgram(pComp);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.uniform1i(U_COMP.uScene, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, useBloom ? glowTexA : sceneTex);
        gl.uniform1i(U_COMP.uGlow, 1);
        gl.uniform2f(U_COMP.uRes, W, H);
        gl.uniform4fv(U_COMP.uSafe, safe);
        gl.uniform1f(U_COMP.uBloom, useBloom ? st.bloom : 0.0);
        gl.uniform1f(U_COMP.uTime, time);
        setFullscreenAttrib(gl.getAttribLocation(pComp, "aPos"));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.activeTexture(gl.TEXTURE0);
    }

    /* ══════════════════════════════════════════════════════════════════════
       8. Bucle, visibilidad y limpieza
       ══════════════════════════════════════════════════════════════════════ */
    let progress = 0;      /* suavizado, el que se dibuja */
    let visible = false;
    let running = false;
    let raf = 0;
    let lastFrame = 0;
    let slowFrames = 0;
    let adapted = 0;

    function progressFromScroll() {
        const rect = section.getBoundingClientRect();
        const travel = rect.height - window.innerHeight;
        if (!(travel > 1)) return reduced ? 0.86 : 0;
        return Math.min(Math.max(-rect.top / travel, 0), 1);
    }

    function frame(now) {
        raf = 0;
        const dt = lastFrame ? Math.min(now - lastFrame, 64) : 16.7;
        lastFrame = now;
        const target = progressFromScroll();
        /* Amortiguado exponencial —la solución exacta, no una fracción por
           frame—: igual de suave a 60 y a 120 Hz, y sin retraso perceptible. */
        const k = reduced ? 0 : Math.exp(-dt / 62);
        progress = target + (progress - target) * k;
        if (Math.abs(target - progress) < 0.0004) progress = target;
        lastProgress = progress;

        render(stateAt(progress, now / 1000), now / 1000);

        /* Calidad adaptativa: si el fotograma se atasca, se baja la densidad
           de muestreo una vez (y se apaga el brillo si hace falta). */
        if (!reduced && dt > 26 && adapted < 2) {
            slowFrames++;
            if (slowFrames > 36) {
                slowFrames = 0;
                adapted++;
                if (useBloom && !mobile && adapted === 1) useBloom = false;
                else { quality = Math.max(0.72, quality * 0.82); resize(); }
            }
        } else if (slowFrames > 0) {
            slowFrames = Math.max(0, slowFrames - 1);
        }

        if (running) raf = requestAnimationFrame(frame);
    }

    function start() {
        if (running || reduced) return;
        running = true;
        lastFrame = 0;
        progress = progressFromScroll();
        if (!raf) raf = requestAnimationFrame(frame);
    }

    function stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        lastFrame = 0;
    }

    /* Una sola pasada para quien pide no moverse: la escultura terminada,
       quieta, sin bucle ni gasto de GPU. */
    function renderStill() {
        resize();
        const p = 0.86;
        progress = p;
        lastProgress = p;
        render(stateAt(p, 0), 0);
    }

    /* La caja del titular cambia cuando llegan las tipografías web: la franja
       protegida se vuelve a medir y, con «reducir movimiento», se repinta. */
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { measureSafe(); if (reduced) renderStill(); });
    }
    window.addEventListener("load", () => { measureSafe(); if (reduced) renderStill(); }, { once: true });

    const observer = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible && !document.hidden) start();
        else stop();
    }, { rootMargin: "220px 0px" });

    function onVisibility() {
        if (document.hidden) stop();
        else if (visible) start();
    }

    let resizeTimer = 0;
    function onResize() {
        if (reduced) { renderStill(); return; }
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { resize(); if (visible) start(); }, 120);
    }

    /* Pérdida de contexto: se para el bucle y, si el navegador lo devuelve,
       se rehacen sólo los objetivos de render (la geometría sigue en la GPU
       de la mano del driver, que la restaura él mismo). */
    const onLost = (event) => {
        event.preventDefault();
        stop();
        stage.classList.remove("has-canvas");     // se descubre el respaldo CSS
    };
    const onRestored = () => {
        sceneTex = sceneFbo = glowTexA = glowFboA = glowTexB = glowFboB = null;
        W = H = 0;
        resize();
        stage.classList.add("has-canvas");
        if (reduced) renderStill();
        else if (visible) start();
    };
    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("webglcontextrestored", onRestored, false);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    resize();

    if (reduced) {
        renderStill();
    } else {
        start();     /* el primer frame ya se pinta; el observador sólo lo sostiene */
        observer.observe(stage);
    }
    /* La clase se añade cuando hay un fotograma de verdad: mientras tanto se
       ve la composición de respaldo y no hay parpadeo de negro. */
    stage.classList.add("has-canvas");

    /* Superficie de inspección: sólo en el preview de desarrollo, como el
       contador de la intro y el recargador. */
    if (DEV) {
        window.__hfPerception = {
            progress: () => progress,
            state: (p) => stateAt(typeof p === "number" ? p : progress, 0),
            camera: (p) => ({
                pos: spline(CAM, "pos", typeof p === "number" ? p : progress),
                tgt: spline(CAM, "tgt", typeof p === "number" ? p : progress),
                fov: spline(CAM, "fov", typeof p === "number" ? p : progress),
            }),
            geometry: () => ({
                lines: lines.data, lineIndex: lines.index, segments: lines.segs,
                planes: planes.data, planeIndex: planes.index, quads: planes.quads,
                points, roles: { line: 18, point: 12 },
            }),
            dispose,
        };
    }

    function dispose() {
        stop();
        observer.disconnect();
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        for (const p of [pLine, pPoint, pBright, pBlur, pComp]) if (p) gl.deleteProgram(p);
        for (const b of [lineBuffer, lineIndex, planeBuffer, planeIndex, pointBuffer, quadBuffer]) if (b) gl.deleteBuffer(b);
        for (const t of [sceneTex, glowTexA, glowTexB]) if (t) gl.deleteTexture(t);
        for (const f of [sceneFbo, glowFboA, glowFboB]) if (f) gl.deleteFramebuffer(f);
        canvas.remove();
        if (DEV && window.__hfPerception) delete window.__hfPerception;
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
    }

    window.addEventListener("pagehide", dispose, { once: true });
})();
