/* SYNTHETIC PERCEPTION — fondo generativo 3D del statement («Synthesizing human
   vision and artificial intelligence to construct new visual realities»).

   Qué es: una escultura digital en tiempo real, dibujada con WebGL nativo (sin
   Three.js ni ninguna otra dependencia: el sitio es estático y se sirve tal
   cual, igual que statement-liquid.js). Dos sistemas geométricos —la visión
   humana, una bóveda de perspectiva orgánica y levemente imperfecta, y la
   inteligencia artificial, una retícula espacial exacta— nacen por separado,
   se cruzan, se deforman el uno al otro y acaban colapsando en una tercera
   geometría que no pertenece a ninguno de los dos. Al final se abre como un
   pórtico hacia un fondo más profundo.

   Cómo se mueve: nada tiene línea de tiempo propia. Todo (cámara, construcción
   de la geometría, morfología, luz) lo gobierna el avance del scroll dentro de
   la sección anclada, normalizado a 0 → 1, así que subir rehace la secuencia
   exactamente al revés. El único suavizado es un amortiguado corto normalizado
   por tiempo, el mismo criterio que usa el resto del sitio.

   Cómo se dibuja: un único buffer de instancias para TODAS las líneas (una
   llamada de dibujo) y otro para los planos translúcidos. La geometría se
   genera una sola vez, de forma determinista, con sus dos estados —origen e
   híbrido— metidos en el mismo vértice; el shader interpola entre ellos. En
   scroll no se crea ni se destruye nada.

   Fuera de pantalla no se dibuja; con «reducir movimiento» se pinta un único
   fotograma estable; sin WebGL el canvas se retira y la sección se queda como
   estaba. (04/10/2026) */
(() => {
    "use strict";

    /* ═══════════ 1. Matemática determinista ═══════════════════════════════ */

    const TAU = Math.PI * 2;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (t) => t * t * (3 - 2 * t);
    const span = (t, a, b) => clamp01((t - a) / (b - a));
    const ease = (t, a, b) => smooth(span(t, a, b));

    // Generador reproducible: la misma escena en cada carga y en cada máquina.
    function rng(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6d2b79f5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Ruido de valor suave: da la imperfección orgánica del sistema humano sin
    // caer en el azar visible (es continuo, y por tanto deformable).
    const hash3 = (x, y, z) => {
        const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
        return n - Math.floor(n);
    };
    function noise3(x, y, z) {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        const xf = x - xi, yf = y - yi, zf = z - zi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
        let r = 0;
        for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
            const weight = (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
            r += weight * hash3(xi + i, yi + j, zi + k);
        }
        return r * 2 - 1;
    }
    const fbm = (x, y, z) => noise3(x, y, z) * 0.62 + noise3(x * 2.1 + 5.2, y * 2.1 - 1.3, z * 2.1 + 9.7) * 0.28
        + noise3(x * 4.3 - 3.1, y * 4.3 + 7.7, z * 4.3 - 2.2) * 0.1;

    /* ═══════════ 2. Álgebra de cámara ═════════════════════════════════════ */

    function perspective(out, fovy, aspect, near, far, shiftX, shiftY) {
        const f = 1 / Math.tan(fovy / 2);
        out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
        // El desplazamiento de la proyección corre la composición sin girar la
        // cámara: la escultura se aparta del titular sin perder la perspectiva.
        out[8] = shiftX; out[9] = shiftY; out[10] = (far + near) / (near - far); out[11] = -1;
        out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
        return out;
    }
    function lookAt(out, eye, center, upY) {
        let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
        let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
        let xx = upY[1] * zz - upY[2] * zy, xy = upY[2] * zx - upY[0] * zz, xz = upY[0] * zy - upY[1] * zx;
        l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
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
    function multiply(out, a, b) {
        for (let c = 0; c < 4; c++) {
            const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
            out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
            out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
            out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
            out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
        }
        return out;
    }

    /* ═══════════ 3. El mapa híbrido ═══════════════════════════════════════ */

    /* La síntesis no mezcla dos formas: aplica a las dos la MISMA ley del
       espacio. Cualquier punto, venga de la bóveda humana o de la retícula
       algorítmica, se pliega aquí sobre unas capas radiales discretas, unos
       ejes de simetría de orden cinco y un cizallamiento que curva la
       perspectiva. El resultado es una tercera geometría —precisa como la
       máquina, irregular como el ojo— en la que las dos acaban compartiendo
       aristas. Es continua y determinista: se puede interpolar hacia ella y
       volver sin saltos. */
    const CENTER_Z = -20;
    function hybridMap(x, y, z, out) {
        let px = x, py = y, pz = z - CENTER_Z;
        // 1. El espacio infinito se dobla sobre un volumen habitable. No una
        //    esfera: una proporción arquitectónica, más ancha que alta.
        px = 15.5 * Math.tanh(px / 17);
        py = 9.6 * Math.tanh(py / 13);
        pz = 16.5 * Math.tanh(pz / 19);
        // 2. Torsión con la profundidad: las verticales dejan de ser paralelas
        //    y la perspectiva empieza a obedecer otra regla.
        const ang = 0.058 * pz + 0.022 * py;
        const c = Math.cos(ang), s = Math.sin(ang);
        let rx = c * px - s * py;
        let ry = s * px + c * py;
        let rz = pz;
        // 3. Cristalización: atracción continua hacia una retícula de planos.
        //    De aquí salen las aristas alineadas y las facetas limpias; es la
        //    parte «máquina» de la geometría nueva.
        const G = 3.75, A = 0.84;
        rx += A * Math.sin((TAU * rx) / G);
        ry += A * 0.82 * Math.sin((TAU * ry) / (G * 0.86));
        rz += A * Math.sin((TAU * rz) / (G * 1.3));
        // 4. Pliegue oblicuo: medio espacio se refleja sobre el otro medio y
        //    los dos sistemas acaban compartiendo aristas imposibles.
        const nx = 0.56, ny = 0.39, nz = 0.73;
        const d = rx * nx + ry * ny + rz * nz;
        const soft = Math.sqrt(d * d + 3.2);
        const fold = 0.46 * (d - soft);
        rx -= nx * fold; ry -= ny * fold; rz -= nz * fold;
        // 5. Cizallamiento final: lo que impide que se lea como un sólido.
        const sx = rx, sz = rz;
        rx += 0.95 * Math.sin(sz * 0.34);
        ry += 0.75 * Math.sin(sx * 0.3);
        rz += 0.55 * Math.sin(ry * 0.26);
        out[0] = rx; out[1] = ry - 1.2; out[2] = rz + CENTER_Z;
        return out;
    }

    /* ═══════════ 4. Construcción de la escena ═════════════════════════════ */

    /* Grupos: 0 origen · 1 visión humana · 2 inteligencia artificial · 3 pórtico.
       Cada segmento viaja al GPU como 16 flotantes:
       [ ax ay az order | bx by bz intensity | hax hay haz group | hbx hby hbz contact ] */
    const FLOATS = 16;

    const PRESETS = {
        desktop: { rings: 26, ringSeg: 58, ribStep: 3, lattice: [6, 5, 7], hexRings: 9, portal: 16, floor: 11, planes: 1 },
        laptop: { rings: 21, ringSeg: 46, ribStep: 4, lattice: [5, 4, 6], hexRings: 7, portal: 13, floor: 9, planes: 0.8 },
        mobile: { rings: 14, ringSeg: 32, ribStep: 5, lattice: [4, 3, 5], hexRings: 5, portal: 10, floor: 6, planes: 0.5 },
    };

    function buildScene(preset) {
        const q = PRESETS[preset] || PRESETS.desktop;
        const lines = [];
        const quads = [];
        const h0 = [0, 0, 0], h1 = [0, 0, 0];
        const random = rng(0x5e7110);

        const pushLine = (a, b, group, order, intensity, contact) => {
            hybridMap(a[0], a[1], a[2], h0);
            hybridMap(b[0], b[1], b[2], h1);
            lines.push(
                a[0], a[1], a[2], order,
                b[0], b[1], b[2], intensity,
                h0[0], h0[1], h0[2], group,
                h1[0], h1[1], h1[2], contact || 0,
            );
        };
        const pushQuad = (c0, c1, c2, c3, group, order, intensity) => {
            quads.push({ corners: [c0, c1, c2, c3], group, order, intensity });
        };

        /* ── 4a. Origen: el punto que se vuelve espacio ─────────────────────
           No hay estrella de rayos (eso sería velocidad, no percepción): lo que
           nace del punto de luz es una LEY de perspectiva —un suelo y un techo
           implícitos— que se dibuja desde el punto de fuga hacia el observador.
           Pocas líneas, muy largas, muy tenues. */
        const FLOOR_Y = -15.5, ROOF_Y = 15.5;
        const GZ_FAR = -132, GZ_NEAR = 26;
        for (let i = 0; i < q.floor; i++) {
            const u = q.floor === 1 ? 0.5 : i / (q.floor - 1);
            const x = mix(-54, 54, u);
            // De lejos a cerca: la línea crece desde el punto de fuga.
            pushLine([x * 0.12, FLOOR_Y, GZ_FAR], [x, FLOOR_Y, GZ_NEAR], 0, Math.abs(u - 0.5) * 1.3, 0.3 + 0.22 * (1 - Math.abs(u - 0.5) * 2), 0);
            if (i % 2 === 0) pushLine([x * 0.12, ROOF_Y, GZ_FAR], [x, ROOF_Y, GZ_NEAR], 0, 0.2 + Math.abs(u - 0.5) * 1.3, 0.2, 0);
        }
        // Travesaños: la profundidad se vuelve medible.
        for (let k = 1; k < 9; k++) {
            const z = mix(GZ_FAR, GZ_NEAR, Math.pow(k / 9, 2.1));
            const w = mix(7, 54, Math.pow(k / 9, 2.1));
            pushLine([-w, FLOOR_Y, z], [w, FLOOR_Y, z], 0, 0.1 + 0.08 * k, 0.26, 0);
            if (k % 2 === 1) pushLine([-w, ROOF_Y, z], [w, ROOF_Y, z], 0, 0.14 + 0.08 * k, 0.16, 0);
        }

        /* ── 4b. Visión humana: la bóveda perceptiva ────────────────────────
           Anillos de profundidad que no son círculos y costillas que no son
           rectas: el eje se desvía, el radio respira, cada anillo se desalinea
           un poco respecto al anterior y hay tramos que la mirada no completa.
           El eje de la bóveda va oblicuo: su fuga no coincide con el centro de
           la pantalla, y por eso se lee como un espacio y no como un túnel. */
        const Z_NEAR = 16, Z_FAR = -118;
        const AXIS_YAW = 0.13, AXIS_PITCH = -0.07;
        const tilt = (p) => {
            const cy = Math.cos(AXIS_YAW), sy = Math.sin(AXIS_YAW);
            const x = cy * p[0] + sy * (p[2] - CENTER_Z);
            const z = -sy * p[0] + cy * (p[2] - CENTER_Z);
            const cx = Math.cos(AXIS_PITCH), sx = Math.sin(AXIS_PITCH);
            const y = cx * p[1] - sx * z;
            const z2 = sx * p[1] + cx * z;
            return [x, y, z2 + CENTER_Z];
        };
        const ringPoint = (kn, j) => {
            const z = mix(Z_NEAR, Z_FAR, Math.pow(kn, 1.5));
            const cx = 4.6 * fbm(kn * 2.3, 0.4, 1.7);
            const cy = 3.0 * fbm(kn * 2.1 + 9.3, 2.8, 0.6);
            const th = (j / q.ringSeg) * TAU;
            const base = 21 + 5.2 * fbm(kn * 1.7 + 2.2, 0.8, 4.1);
            const wobble = 1 + 0.15 * fbm(Math.cos(th) * 1.25, Math.sin(th) * 1.25, kn * 3.4);
            const skew = 0.09 * fbm(Math.cos(th) * 0.8, Math.sin(th) * 0.8, kn * 1.1 + 6.6);
            const r = base * wobble * (1 + 0.07 * Math.sin(th * 3 + kn * 2.1));
            return tilt([
                cx + r * Math.cos(th + skew),
                cy + r * 0.82 * Math.sin(th + skew * 0.6),
                z + 3.2 * fbm(Math.cos(th), Math.sin(th), kn * 2.6 + 3.3),
            ]);
        };
        const humanRings = [];
        for (let k = 0; k < q.rings; k++) {
            // Ritmo desigual entre anillos: la percepción no mide, estima.
            const kn = (k / (q.rings - 1)) * (0.92 + 0.08 * fbm(k * 0.6, 3.1, 0.2));
            const ring = [];
            for (let j = 0; j < q.ringSeg; j++) ring.push(ringPoint(kn, j));
            humanRings.push(ring);
        }
        const humanOrder = (k) => (1 - k / (q.rings - 1)) * 0.84;
        for (let k = 0; k < q.rings; k++) {
            const ring = humanRings[k];
            const order = humanOrder(k);
            const depth = k / (q.rings - 1);
            const lit = 0.2 + 0.26 * (1 - depth);
            for (let j = 0; j < q.ringSeg; j++) {
                // La mirada no completa todo lo que ve: el anillo se apaga por
                // arcos enteros en vez de romperse en puntadas. Es atenuación,
                // no recorte, así que la línea sigue siendo una línea.
                const arc = fbm(Math.cos((j / q.ringSeg) * TAU) * 0.62, Math.sin((j / q.ringSeg) * TAU) * 0.62, k * 0.38);
                const presence = 1 - Math.min(1, Math.max(0, (arc + 0.12) / 0.5));
                if (presence < 0.06) continue;
                pushLine(ring[j], ring[(j + 1) % q.ringSeg], 1, order, lit * (0.18 + 0.82 * presence), 0);
            }
        }
        // Cada costilla se recorre entera dentro de su tramo: la mirada sigue
        // una línea continua, no una serie de puntadas sueltas.
        for (let j = 0; j < q.ringSeg; j += q.ribStep) {
            const jn = j / q.ringSeg;
            const from = Math.floor(Math.abs(fbm(Math.cos(jn * TAU), Math.sin(jn * TAU), 5.5)) * (q.rings * 0.45));
            const to = q.rings - 1 - Math.floor(Math.abs(fbm(Math.cos(jn * TAU) * 1.3, Math.sin(jn * TAU) * 1.3, 9.1)) * (q.rings * 0.3));
            for (let k = from; k < to; k++) {
                pushLine(humanRings[k][j], humanRings[k + 1][j], 1, humanOrder(k + 1), 0.15 + 0.18 * (1 - k / q.rings), 0);
            }
        }
        // Velos perceptivos: planos translúcidos tendidos entre dos costillas.
        const sheetCount = Math.round(6 * q.planes);
        for (let s = 0; s < sheetCount; s++) {
            const j = Math.floor(random() * q.ringSeg);
            const j2 = (j + 2 + Math.floor(random() * 2)) % q.ringSeg;
            const k = 2 + Math.floor(random() * Math.max(1, q.rings - 6));
            const k2 = k + 2;
            pushQuad(humanRings[k][j], humanRings[k][j2], humanRings[k2][j2], humanRings[k2][j], 1, humanOrder(k2), 0.32 + random() * 0.26);
        }

        /* ── 4c. Inteligencia: la retícula exacta ───────────────────────────
           Nada aquí es irregular: nodos equidistantes, arriostrado medido,
           polígonos repetidos. Se construye por barrido, plano a plano, no por
           partículas que vuelan a su sitio. Y ocupa exactamente el mismo
           volumen que el centro de la bóveda humana. */
        const [NX, NY, NZ] = q.lattice;
        const SX = 4.5, SY = 4.1, SZ = 4.9;
        const node = (i, j, k) => [
            (i - (NX - 1) / 2) * SX,
            (j - (NY - 1) / 2) * SY,
            CENTER_Z + (k - (NZ - 1) / 2) * SZ,
        ];
        const aiOrder = (i) => (i / (NX - 1)) * 0.9;
        // Sólo la envolvente: una celosía hueca se lee como arquitectura; un
        // volumen macizo de aristas se lee como ruido.
        const onShell = (i, j, k) => (i === 0 || i === NX - 1 ? 1 : 0) + (j === 0 || j === NY - 1 ? 1 : 0) + (k === 0 || k === NZ - 1 ? 1 : 0);
        for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
            const p = node(i, j, k);
            const fade = 0.3;
            const edge = (i2, j2, k2, lit) => {
                if (!onShell(i, j, k) || !onShell(i2, j2, k2)) return;
                pushLine(p, node(i2, j2, k2), 2, aiOrder(i), lit, 0);
            };
            if (i < NX - 1) edge(i + 1, j, k, fade);
            if (j < NY - 1) edge(i, j + 1, k, fade * 0.72);
            if (k < NZ - 1) edge(i, j, k + 1, fade * 0.8);
            // Arriostrado alterno: la diagonal exacta que delata una estructura
            // calculada, no dibujada.
            if (i < NX - 1 && k < NZ - 1 && (i + j + k) % 2 === 0) edge(i + 1, j, k + 1, fade * 0.38);
        }
        // Polígonos repetidos, perfectamente alineados sobre el eje de fuga:
        // la medida del espacio, frente a la estimación de la bóveda.
        let prevHex = null;
        for (let h = 0; h < q.hexRings; h++) {
            const hn = h / (q.hexRings - 1);
            const z = mix(CENTER_Z + 22, CENTER_Z - 34, hn);
            const R = 10.5;
            const hex = [];
            for (let s = 0; s < 6; s++) {
                const a = (s / 6) * TAU + Math.PI / 12;
                hex.push([Math.cos(a) * R, Math.sin(a) * R * 0.9, z]);
            }
            for (let s = 0; s < 6; s++) pushLine(hex[s], hex[(s + 1) % 6], 2, 0.3 + 0.6 * hn, 0.26, 0);
            if (prevHex) for (let s = 0; s < 6; s += 2) pushLine(prevHex[s], hex[s], 2, 0.3 + 0.6 * hn, 0.17, 0);
            prevHex = hex;
        }
        // Superficies paramétricas: paneles de vidrio sobre caras de la retícula.
        const panelCount = Math.round(7 * q.planes);
        for (let s = 0; s < panelCount; s++) {
            const i = Math.floor(random() * (NX - 1));
            const j = Math.floor(random() * (NY - 1));
            const k = Math.floor(random() * (NZ - 1));
            pushQuad(node(i, j, k), node(i + 1, j, k), node(i + 1, j + 1, k), node(i, j + 1, k), 2, aiOrder(i), 0.26 + random() * 0.2);
        }

        /* ── 4c bis. El núcleo híbrido: la tercera geometría ───────────────
           Ni bóveda ni retícula. Dos superficies REGLADAS que se atraviesan:
           cada una tiene un borde estimado a mano alzada y otro medido al
           grado, y entre ellos sólo hay rectas. La curvatura nace de líneas
           rectas —percepción y cálculo generando una forma que ninguno de los
           dos contenía— y las dos familias de generatrices se tejen en blanco
           y en cian sobre el mismo objeto.
           Su estado de origen está colapsado en el punto de luz inicial, así
           que la escultura CRECE desde el germen durante la síntesis en lugar
           de aparecer de la nada (y al subir, vuelve a él). */
        const facet = (p, amp) => {
            // El mismo idioma cristalino del mapa híbrido, en voz baja: las
            // aristas se alinean sobre una retícula de planos y el conjunto
            // deja de leerse como un sólido de revolución.
            const G = 3.75;
            const x = p[0] + amp * Math.sin((TAU * p[0]) / G);
            const y = p[1] + amp * 0.82 * Math.sin((TAU * p[1]) / (G * 0.86));
            const z = p[2] - CENTER_Z + amp * Math.sin((TAU * (p[2] - CENTER_Z)) / (G * 1.3));
            return [
                x + 0.55 * Math.sin(z * 0.34),
                y + 0.45 * Math.sin(x * 0.3),
                z + 0.35 * Math.sin(y * 0.26) + CENTER_Z,
            ];
        };
        const CORE_N = Math.max(14, Math.round(q.ringSeg * 0.44));
        const seedOf = (p) => [p[0] * 0.0025, p[1] * 0.0025, (p[2] - CENTER_Z) * 0.0025];
        const pushCore = (a, b, group, intensity) => {
            const sa = seedOf(a), sb = seedOf(b);
            lines.push(
                sa[0], sa[1], sa[2], 0,
                sb[0], sb[1], sb[2], intensity,
                a[0], a[1], a[2], group,
                b[0], b[1], b[2], 0.55,
            );
        };

        /* Una superficie reglada: eje propio, cintura, torsión y dos bordes de
           naturaleza distinta. Se construye dos veces, cruzadas. */
        function ruled(cfg) {
            const { R, H, twist, lean, spin, waistK, phase, taper } = cfg;
            const ring = (v) => {
                const pts = [];
                for (let i = 0; i < CORE_N; i++) {
                    const a = (i / CORE_N) * TAU + twist * (v - 0.5) + phase;
                    const human = 1 + 0.13 * fbm(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 2.7 + phase);
                    const exact = 1 + 0.09 * Math.cos(a * 5 + phase);
                    const waist = waistK + (1 - waistK) * Math.abs(v - 0.5) * 2;
                    const r = R * mix(human, exact, v) * waist * mix(1, taper, v);
                    // Coordenadas locales: anillo en el plano XY, apilado en Z local.
                    const lx = r * Math.cos(a);
                    const ly = r * Math.sin(a);
                    const lz = mix(H, -H, v) + 0.8 * fbm(Math.cos(a), Math.sin(a), v * 2.2) * (1 - v);
                    // Orientación: inclinación y giro propios. Nada queda
                    // alineado con los ejes de la pantalla.
                    const cl = Math.cos(lean), sl = Math.sin(lean);
                    const cs = Math.cos(spin), ss = Math.sin(spin);
                    const ax = lx, ay = cl * ly - sl * lz, az = sl * ly + cl * lz;
                    pts.push(facet([
                        cs * ax - ss * az,
                        ay,
                        CENTER_Z + ss * ax + cs * az,
                    ], 0.55));
                }
                return pts;
            };
            const top = ring(0), bottom = ring(1);
            const skew = Math.max(3, Math.round(CORE_N / 4));
            for (let i = 0; i < CORE_N; i++) {
                pushCore(top[i], bottom[(i + skew) % CORE_N], 1, 0.46);
                pushCore(top[i], bottom[(i - skew + CORE_N) % CORE_N], 2, 0.42);
            }
            for (const l of [0, 0.5, 1]) {
                const contour = ring(l);
                for (let i = 0; i < CORE_N; i++) {
                    pushCore(contour[i], contour[(i + 1) % CORE_N], l === 0.5 ? 2 : 1, l === 0.5 ? 0.24 : 0.4);
                }
            }
            // Velos de vidrio entre generatrices: la luz necesita superficie.
            for (let s = 0; s < Math.round(3 * q.planes); s++) {
                const i = Math.floor((s / 3) * CORE_N);
                const j = (i + skew) % CORE_N;
                quads.push({
                    corners: [top[i], top[(i + 2) % CORE_N], bottom[(j + 2) % CORE_N], bottom[j]],
                    group: s % 2 ? 2 : 1, order: 0, intensity: 0.26, core: true,
                });
            }
        }
        // Dos cuerpos que se atraviesan: uno erguido y escorado, otro tendido
        // en profundidad. Donde se cruzan, la forma deja de ser reconocible.
        ruled({ R: 9.2, H: 9.4, twist: 0.92, lean: 1.36, spin: 0.34, waistK: 0.58, phase: 0, taper: 0.48 });

        /* Y tres planos exactos que la atraviesan en diagonal: el gesto de la
           máquina sobre la forma estimada. Son el contrapunto limpio de las
           generatrices —aristas rectas, ángulos medidos— y dejan ver el vidrio
           por donde la luz viajará en la última fase. */
        const blades = [
            { u: [0.94, 0.18, 0.28], v: [-0.2, 0.96, -0.18], w: 15.5, h: 9.4, at: [0.4, 1.6, 2.2] },
            { u: [0.32, -0.42, 0.85], v: [0.3, 0.9, 0.33], w: 12.5, h: 11.2, at: [-1.8, -1.2, -3.1] },
            { u: [0.72, 0.55, -0.42], v: [-0.5, 0.83, 0.23], w: 13.5, h: 7.6, at: [1.6, -3.4, 1.4] },
        ];
        blades.forEach((b, index) => {
            const corner = (sx, sy) => facet([
                b.at[0] + b.u[0] * b.w * sx + b.v[0] * b.h * sy,
                b.at[1] + b.u[1] * b.w * sx + b.v[1] * b.h * sy,
                CENTER_Z + b.at[2] + b.u[2] * b.w * sx + b.v[2] * b.h * sy,
            ], 0.18);
            const c = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
            for (let i = 0; i < 4; i++) pushCore(c[i], c[(i + 1) % 4], 2, 0.4);
            // Una subdivisión interna: el plano está medido, no improvisado.
            pushCore(corner(-1, 0), corner(1, 0), index % 2 ? 1 : 2, 0.2);
            pushCore(corner(0, -1), corner(0, 1), 2, 0.16);
            quads.push({ corners: c, group: index === 1 ? 1 : 2, order: 0, intensity: 0.22, core: true });
        });

        /* ── 4d. Pórtico: lo que hay detrás del punto de fuga ───────────────
           Marcos concéntricos que sólo se encienden cuando la escultura se
           abre. Es el espacio nuevo, no un túnel: los marcos crecen y giran. */
        const P = q.portal;
        const portalFrame = (f) => {
            const fn = f / (P - 1);
            const z = mix(CENTER_Z - 16, -190, Math.pow(fn, 1.1));
            const R = mix(6.5, 62, Math.pow(fn, 1.25));
            const spin = fn * 0.55;
            const pts = [];
            for (let s = 0; s < 12; s++) {
                const a = (s / 12) * TAU + spin;
                pts.push([Math.cos(a) * R, Math.sin(a) * R * 0.86, z]);
            }
            return pts;
        };
        let prevFrame = null;
        for (let f = 0; f < P; f++) {
            const pts = portalFrame(f);
            const order = f / (P - 1);
            for (let s = 0; s < 12; s++) pushLine(pts[s], pts[(s + 1) % 12], 3, order, 0.34, 0);
            if (prevFrame) for (let s = 0; s < 12; s += 3) pushLine(prevFrame[s], pts[s], 3, order, 0.2, 0);
            prevFrame = pts;
        }

        /* ── 4e. Contactos ─────────────────────────────────────────────────
           Dónde se tocan de verdad los dos sistemas. Se calcula una sola vez,
           aquí, con una rejilla espacial: en el shader sólo queda encender.
           Es el «intercambio de información» de la fase 3, dicho con geometría
           y no con datos dibujados. */
        const cell = 2.8;
        const grid = new Map();
        const key = (x, y, z) => `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
        for (let o = 0; o < lines.length; o += FLOATS) {
            if (lines[o + 11] !== 2) continue;
            const mx = (lines[o] + lines[o + 4]) / 2, my = (lines[o + 1] + lines[o + 5]) / 2, mz = (lines[o + 2] + lines[o + 6]) / 2;
            const k = key(mx, my, mz);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push([mx, my, mz]);
        }
        for (let o = 0; o < lines.length; o += FLOATS) {
            if (lines[o + 11] !== 1) continue;
            const mx = (lines[o] + lines[o + 4]) / 2, my = (lines[o + 1] + lines[o + 5]) / 2, mz = (lines[o + 2] + lines[o + 6]) / 2;
            let best = Infinity;
            const ci = Math.round(mx / cell), cj = Math.round(my / cell), ck = Math.round(mz / cell);
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
                const bucket = grid.get(`${ci + a},${cj + b},${ck + c}`);
                if (!bucket) continue;
                for (const p of bucket) {
                    const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2 + (p[2] - mz) ** 2;
                    if (d < best) best = d;
                }
            }
            if (best < 2.0 * 2.0) {
                const contact = 1 - Math.sqrt(best) / 2.0;
                lines[o + 15] = contact;
                // El nodo algorítmico más próximo también se entera.
            }
        }

        /* Planos → buffer de vértices (dos triángulos, con sus dos estados). */
        const PLANE_FLOATS = 11; // src(3) hyb(3) uv(2) meta(3)
        const planeData = new Float32Array(quads.length * 6 * PLANE_FLOATS);
        const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
        const tri = [0, 1, 2, 0, 2, 3];
        let pi = 0;
        for (const quad of quads) {
            for (const corner of tri) {
                const c = quad.corners[corner];
                // El núcleo ya ES la geometría nueva: su estado híbrido es él
                // mismo y su origen, el germen colapsado.
                if (quad.core) { h0[0] = c[0]; h0[1] = c[1]; h0[2] = c[2]; }
                else hybridMap(c[0], c[1], c[2], h0);
                const src0 = quad.core ? [c[0] * 0.0025, c[1] * 0.0025, (c[2] - CENTER_Z) * 0.0025] : c;
                planeData[pi++] = src0[0]; planeData[pi++] = src0[1]; planeData[pi++] = src0[2];
                planeData[pi++] = h0[0]; planeData[pi++] = h0[1]; planeData[pi++] = h0[2];
                planeData[pi++] = uvs[corner][0]; planeData[pi++] = uvs[corner][1];
                planeData[pi++] = quad.group; planeData[pi++] = quad.order; planeData[pi++] = quad.intensity;
            }
        }

        return {
            lineData: new Float32Array(lines),
            lineCount: lines.length / FLOATS,
            planeData,
            planeVerts: quads.length * 6,
        };
    }

    /* ═══════════ 5. El guion: scroll → estado visual ══════════════════════ */

    /* Un único sitio donde vive la dramaturgia. Todo son funciones puras del
       avance t (0 → 1): no hay estado acumulado, así que ir hacia atrás
       reconstruye exactamente lo mismo. */
    function stateAt(t, aspect, compact) {
        const s = {};
        // Fase 1 (0–15 %): el punto y sus primeras líneas.
        s.seed = ease(t, 0.0, 0.11) * (1 - ease(t, 0.26, 0.6) * 0.84);
        s.revealOrigin = ease(t, 0.005, 0.16);
        s.alphaOrigin = ease(t, 0.0, 0.05) * (1 - 0.72 * ease(t, 0.3, 0.55));
        // Fase 2 (15–35 %): la bóveda humana.
        s.revealHuman = ease(t, 0.10, 0.38);
        s.alphaHuman = ease(t, 0.09, 0.2) * (1 - 0.45 * ease(t, 0.84, 1.0));
        // Fase 3 (35–55 %): la retícula, que entra desde otro eje y se alinea.
        s.revealAi = ease(t, 0.33, 0.57);
        s.alphaAi = ease(t, 0.32, 0.44);
        const settle = ease(t, 0.36, 0.60);
        s.aiOffset = [mix(26, 0, settle), mix(-7, 0, settle), mix(14, 0, settle)];
        s.aiYaw = mix(0.42, 0, settle);
        // El destello de los contactos: breve, en el momento en que se cruzan.
        s.contact = ease(t, 0.40, 0.54) * (1 - ease(t, 0.56, 0.80) * 0.92);
        // Fase 4 (55–80 %): síntesis. Las dos leyes se vuelven una.
        s.morph = ease(t, 0.52, 0.80);
        s.warp = ease(t, 0.5, 0.68) * (1 - ease(t, 0.74, 0.95)) * 1.0;
        // Fase 5 (80–100 %): apertura, pórtico y la onda de luz.
        s.open = ease(t, 0.80, 1.0);
        s.revealPortal = ease(t, 0.78, 0.97);
        s.alphaPortal = ease(t, 0.77, 0.9);
        const wave = span(t, 0.80, 0.99);
        s.wave = mix(-6, 62, wave);
        s.waveAmp = Math.sin(clamp01(wave) * Math.PI) * 1.25 + ease(t, 0.95, 1.0) * 0.12;
        // El acento frío crece despacio y nunca se desborda.
        s.accent = ease(t, 0.34, 0.6) * 0.55 + ease(t, 0.62, 0.92) * 0.45;
        s.exposure = mix(0.82, 1.06, ease(t, 0.1, 0.85));

        /* Cámara: un avance contenido por el eje de fuga y una deriva lateral
           mínima mientras la retícula entra. Nunca atraviesa la escultura: se
           acerca a ella, la rodea apenas y al final la cruza de lado para
           asomarse al pórtico. Sin sacudidas ni giros de videojuego. */
        const dolly = 52
            - 4.0 * ease(t, 0.0, 0.17)
            - 6.0 * ease(t, 0.15, 0.38)
            - 4.0 * ease(t, 0.35, 0.58)
            - 1.5 * ease(t, 0.55, 0.80)
            - 1.5 * ease(t, 0.78, 1.0);
        // En vertical la cámara se retira un poco: el mismo objeto, pero
        // compuesto para una pantalla alta y estrecha.
        const z = CENTER_Z + (dolly - CENTER_Z) * (compact ? 1.16 : 1);
        const x = 1.6 * ease(t, 0.05, 0.3) - 6.4 * ease(t, 0.34, 0.62) + 3.6 * ease(t, 0.62, 0.92);
        const y = 1.6 * ease(t, 0.12, 0.4) - 0.8 * ease(t, 0.55, 0.85) + 0.9 * ease(t, 0.85, 1.0);
        s.eye = [x, y, z];
        s.target = [x * 0.22, y * 0.2 - 0.4, CENTER_Z - 4 - 5 * ease(t, 0.8, 1.0)];
        s.fov = (compact ? 52 : 42) * Math.PI / 180;
        // Composición: en pantallas anchas la escultura vive a la derecha del
        // titular; en vertical sube para dejar el texto sobre fondo limpio.
        s.shiftX = compact ? 0.0 : -mix(0.14, 0.34, ease(t, 0.2, 0.8)) * Math.min(1, aspect / 1.6);
        s.shiftY = compact ? -0.24 : -0.01;
        s.roll = 0.02 * Math.sin(t * Math.PI * 1.2);
        return s;
    }

    /* ═══════════ 6. Node: sólo la geometría (herramienta de previsualización) */

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { buildScene, stateAt, hybridMap, perspective, lookAt, multiply, PRESETS, FLOATS };
        return;
    }

    /* ═══════════ 7. Integración en la página ══════════════════════════════ */

    const host = document.querySelector(".statement .perception");
    if (!host) return;
    const canvas = host.querySelector(".perception-canvas");
    const section = host.closest("section");
    if (!canvas || !section) return;

    const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
    const compactQuery = matchMedia("(max-width: 820px)");

    const gl = canvas.getContext("webgl2", {
        alpha: true, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: true, powerPreference: "high-performance",
        preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false,
    }) || canvas.getContext("webgl", {
        alpha: true, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: true, powerPreference: "high-performance",
    });

    // Sin WebGL (o sin instanciado en WebGL 1) la sección se queda exactamente
    // como estaba: negro limpio y titular legible.
    const isGL2 = !!(gl && typeof gl.drawArraysInstanced === "function");
    const instExt = gl && !isGL2 ? gl.getExtension("ANGLE_instanced_arrays") : null;
    if (!gl || (!isGL2 && !instExt)) { host.classList.add("is-unsupported"); return; }

    const drawInstanced = isGL2
        ? (mode, first, count, prims) => gl.drawArraysInstanced(mode, first, count, prims)
        : (mode, first, count, prims) => instExt.drawArraysInstancedANGLE(mode, first, count, prims);
    const divisor = isGL2
        ? (loc, d) => gl.vertexAttribDivisor(loc, d)
        : (loc, d) => instExt.vertexAttribDivisorANGLE(loc, d);

    /* ── 7a. Shaders ──────────────────────────────────────────────────────
       Las líneas no se dibujan con gl.LINES (grosor de 1 px, sin suavizado y
       sin halo): cada segmento es una cinta de dos triángulos expandida en
       espacio de pantalla, con una caída gaussiana a lo ancho. De ahí salen el
       trazo finísimo, el antialias y el resplandor contenido, sin una sola
       pasada de postproceso. */
    const COMMON = `
    uniform mat4 uVP;
    uniform vec3 uEye;
    uniform vec4 uReveal;       // por grupo
    uniform vec4 uAlpha;        // por grupo
    uniform float uMorph;
    uniform float uWarp;
    uniform float uOpen;
    uniform float uWave;
    uniform float uWaveAmp;
    uniform float uContact;
    uniform float uAccent;
    uniform float uExposure;
    uniform vec3 uAiOffset;
    uniform float uAiYaw;
    uniform float uFog;

    const vec3 CENTER = vec3(0.0, 0.0, ${CENTER_Z.toFixed(1)});

    vec4 oneHot(float g) {
        return vec4(
            step(g, 0.5),
            step(0.5, g) * step(g, 1.5),
            step(1.5, g) * step(g, 2.5),
            step(2.5, g));
    }

    vec3 place(vec3 src, vec3 hyb, float g, vec4 oh) {
        vec3 p = src;
        // La retícula llega desde otro eje y se alinea al entrar en la escena.
        // El núcleo híbrido, que nace colapsado en el origen, no viaja con
        // ella aunque comparta color: se queda en el germen.
        float isAi = oh.z * step(0.5, length(src));
        float c = cos(uAiYaw), s = sin(uAiYaw);
        vec3 rotated = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z) + uAiOffset;
        p = mix(p, rotated, isAi);
        // Síntesis: sólo los dos sistemas originales se pliegan, y sólo lo
        // que está cerca del núcleo. Lo lejano no colapsa: se queda como
        // espacio, deformado, alrededor de la escultura que nace.
        float reach = 1.0 - smoothstep(24.0, 58.0, length(src - CENTER));
        float m = uMorph * (oh.y + oh.z) * reach;
        p = mix(p, hyb, m);
        // El espacio alrededor se reorganiza: las rectas dejan de serlo.
        p += uWarp * (oh.y + oh.z) * vec3(
            1.5 * sin(p.z * 0.075 + p.y * 0.05),
            1.2 * sin(p.x * 0.065 - p.z * 0.055),
            0.9 * sin(p.y * 0.055 + p.x * 0.045));
        // Apertura: la escultura se despliega hacia el observador y más allá.
        vec3 rad = p - CENTER;
        float rl = length(rad) + 1e-4;
        float push = uOpen * (1.0 - oh.w) * (1.0 + 5.5 * smoothstep(0.0, 22.0, rl)) * (1.0 - smoothstep(26.0, 52.0, rl));
        p += (rad / rl) * push;
        return p;
    }

    float revealOf(vec4 oh, float order) {
        float reveal = dot(uReveal, oh);
        return clamp((reveal - order * 0.92) * 4.5, 0.0, 1.0);
    }

    // Onda de luz de la fase 5: un frente esférico que recorre la estructura.
    float waveAt(vec3 p) {
        float d = distance(p, CENTER);
        float f = (d - uWave) / 9.0;
        return exp(-f * f) * uWaveAmp;
    }

    float fogAt(vec3 p) {
        float d = distance(p, uEye);
        return exp(-max(d - 7.0, 0.0) * uFog) * smoothstep(0.35, 3.0, d);
    }`;

    const LINE_VS = `
    precision highp float;
    attribute vec2 aCorner;
    attribute vec4 iA;
    attribute vec4 iB;
    attribute vec4 iHA;
    attribute vec4 iHB;
    uniform vec2 uViewport;
    uniform float uWidth;
    uniform mat4 uColors;
    varying float vAcross;
    varying float vGlow;
    varying vec3 vTint;
    ${COMMON}
    void main() {
        float group = iHA.w;
        vec4 oh = oneHot(group);
        vec3 a = place(iA.xyz, iHA.xyz, group, oh);
        vec3 b = place(iB.xyz, iHB.xyz, group, oh);
        // Construcción geométrica: el segmento CRECE desde su origen, no
        // aparece entero ni vuela hasta su sitio.
        float grow = revealOf(oh, iA.w);
        b = mix(a, b, grow);

        vec4 ca = uVP * vec4(a, 1.0);
        vec4 cb = uVP * vec4(b, 1.0);
        const float NEAR = 0.08;
        if (ca.w < NEAR && cb.w < NEAR) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vGlow = 0.0; vAcross = 0.0; vTint = vec3(0.0); return; }
        if (ca.w < NEAR) ca = mix(ca, cb, (NEAR - ca.w) / (cb.w - ca.w));
        else if (cb.w < NEAR) cb = mix(cb, ca, (NEAR - cb.w) / (ca.w - cb.w));

        vec2 halfVp = uViewport * 0.5;
        vec2 sa = (ca.xy / ca.w) * halfVp;
        vec2 sb = (cb.xy / cb.w) * halfVp;
        vec2 delta = sb - sa;
        float len = length(delta);
        vec2 dir = len > 1e-4 ? delta / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);

        vec4 clip = mix(ca, cb, aCorner.x);
        vec3 world = mix(a, b, aCorner.x);
        float w = uWidth;
        clip.xy += ((nrm * aCorner.y * w) + dir * (aCorner.x * 2.0 - 1.0) * w * 0.5) / halfVp * clip.w;
        gl_Position = clip;

        float fog = fogAt(world);
        float appear = smoothstep(0.0, 0.3, grow);
        float flash = iHB.w * uContact * 2.6;
        float lum = iB.w * dot(uAlpha, oh) * fog * appear;
        vGlow = (lum + flash * fog * 0.6 + waveAt(world) * fog * 0.9) * uExposure;
        vAcross = aCorner.y;
        vec3 base = (uColors * oh).rgb;
        // El acento frío sólo aparece donde la geometría se encuentra.
        vTint = base + vec3(0.03, 0.16, 0.34) * (flash * 0.5 + waveAt(world) * 0.55) * uAccent;
    }`;

    const PRECISION = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif`;

    const LINE_FS = `${PRECISION}
    varying float vAcross;
    varying float vGlow;
    varying vec3 vTint;
    void main() {
        float d = abs(vAcross);
        // Núcleo finísimo + halo muy corto: el «bloom» vive en la propia línea.
        float core = exp(-d * d * 7.5);
        float halo = exp(-d * 2.3) * 0.2;
        float a = (core + halo) * vGlow;
        if (a < 0.0015) discard;
        gl_FragColor = vec4(vTint * a, a);
    }`;

    const PLANE_VS = `
    precision highp float;
    attribute vec3 aSrc;
    attribute vec3 aHyb;
    attribute vec2 aUv;
    attribute vec3 aMeta;   // group, order, intensity
    uniform mat4 uColors;
    varying vec2 vUv;
    varying float vGlow;
    varying vec3 vTint;
    ${COMMON}
    void main() {
        float group = aMeta.x;
        vec4 oh = oneHot(group);
        vec3 p = place(aSrc, aHyb, group, oh);
        float grow = revealOf(oh, aMeta.y);
        gl_Position = uVP * vec4(p, 1.0);
        float fog = fogAt(p);
        vUv = aUv;
        vGlow = aMeta.z * dot(uAlpha, oh) * fog * smoothstep(0.1, 0.9, grow) * uExposure;
        vGlow += waveAt(p) * fog * 0.5;
        vTint = (uColors * oh).rgb + vec3(0.02, 0.12, 0.3) * uAccent * 0.6;
    }`;

    const PLANE_FS = `${PRECISION}
    varying vec2 vUv;
    varying float vGlow;
    varying vec3 vTint;
    void main() {
        // Vidrio: un velo casi inexistente y un borde iluminado.
        vec2 d = min(vUv, 1.0 - vUv);
        float edge = min(d.x, d.y);
        float film = 0.028 + 0.26 * exp(-edge * 16.0);
        float a = film * vGlow;
        if (a < 0.0015) discard;
        gl_FragColor = vec4(vTint * a, a);
    }`;

    const SEED_VS = `
    precision highp float;
    attribute vec2 aCorner;
    uniform mat4 uVP;
    uniform vec2 uViewport;
    uniform float uSeedSize;
    varying vec2 vUv;
    void main() {
        vec4 clip = uVP * vec4(0.0, 0.0, 0.0, 1.0);
        vUv = aCorner;
        vec2 px = aCorner * uSeedSize;
        clip.xy += px / (uViewport * 0.5) * clip.w;
        gl_Position = clip;
    }`;
    const SEED_FS = `${PRECISION}
    uniform float uSeedGlow;
    varying vec2 vUv;
    void main() {
        float r = length(vUv);
        float core = exp(-r * r * 22.0);
        float halo = exp(-r * 3.6) * 0.3;
        float a = (core + halo) * uSeedGlow;
        if (a < 0.002) discard;
        vec3 tint = mix(vec3(0.95, 0.97, 1.0), vec3(0.52, 0.76, 0.98), smoothstep(0.1, 0.9, r));
        gl_FragColor = vec4(tint * a, a);
    }`;

    function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn("perception shader", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
    function program(vsSource, fsSource) {
        const vs = compile(gl.VERTEX_SHADER, vsSource);
        const fs = compile(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn("perception link", gl.getProgramInfoLog(prog));
            return null;
        }
        const uniforms = {};
        const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            const info = gl.getActiveUniform(prog, i);
            uniforms[info.name.replace("[0]", "")] = gl.getUniformLocation(prog, info.name);
        }
        const attribs = {};
        const aCount = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
        for (let i = 0; i < aCount; i++) {
            const info = gl.getActiveAttrib(prog, i);
            const loc = gl.getAttribLocation(prog, info.name);
            if (loc >= 0) attribs[info.name] = loc;
        }
        return { prog, uniforms, attribs };
    }

    const lineProg = program(LINE_VS, LINE_FS);
    const planeProg = program(PLANE_VS, PLANE_FS);
    const seedProg = program(SEED_VS, SEED_FS);
    if (!lineProg || !planeProg || !seedProg) { host.classList.add("is-unsupported"); return; }

    /* ── 7b. Buffers (se llenan una vez) ─────────────────────────────────── */
    let preset = compactQuery.matches ? "mobile" : innerWidth < 1400 ? "laptop" : "desktop";
    let scene = buildScene(preset);

    const cornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);

    const seedBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const lineBuffer = gl.createBuffer();
    const planeBuffer = gl.createBuffer();
    function uploadScene() {
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, scene.lineData, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, planeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, scene.planeData, gl.STATIC_DRAW);
    }
    uploadScene();

    const COLORS = new Float32Array([
        0.886, 0.925, 0.976, 0,   // origen — blanco frío
        0.800, 0.855, 0.925, 0,   // visión humana — blanco apagado
        0.400, 0.706, 0.878, 0,   // inteligencia — cian eléctrico
        0.510, 0.459, 0.910, 0,   // pórtico — ultravioleta muy contenido
    ]);

    const vp = new Float32Array(16);
    const proj = new Float32Array(16);
    const view = new Float32Array(16);

    /* ── 7c. Tamaño y densidad de píxel ──────────────────────────────────── */
    let width = 0, height = 0, dpr = 1;
    function resize() {
        const rect = host.getBoundingClientRect();
        const cssW = Math.max(1, Math.round(rect.width));
        const cssH = Math.max(1, Math.round(rect.height));
        const cap = compactQuery.matches ? 2 : 1.75;
        const next = Math.min(devicePixelRatio || 1, cap);
        if (cssW === width && cssH === height && next === dpr) return false;
        width = cssW; height = cssH; dpr = next;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        gl.viewport(0, 0, canvas.width, canvas.height);
        return true;
    }

    /* ── 7d. Avance del scroll ───────────────────────────────────────────── */
    /* El recorrido es el de la sección anclada: desde que el escenario se pega
       arriba hasta que el ancla se suelta. Fuera de ese tramo el valor se queda
       pegado a 0 o a 1, así que ni al entrar ni al salir hay salto. */
    const STATIC_T = 0.86;       // fotograma único para «reducir movimiento»
    let target = 0, shown = 0, lastFrame = 0, raf = 0, visible = false, settled = false;
    let reduced = reducedQuery.matches;

    function readProgress() {
        const rect = section.getBoundingClientRect();
        const stage = host.getBoundingClientRect().height || innerHeight;
        const travel = Math.max(1, rect.height - stage);
        return clamp01(-rect.top / travel);
    }

    function request() {
        if (!raf) { lastFrame = 0; raf = requestAnimationFrame(frame); }
    }

    function onScroll() {
        // Fuera de pantalla no se mide nada: ni una lectura de geometría por
        // evento de scroll (el observador vuelve a sincronizar al entrar).
        if (reduced || !visible) return;
        target = readProgress();
        settled = false;
        request();
    }

    /* ── 7e. Dibujo ──────────────────────────────────────────────────────── */
    function draw(t) {
        const aspect = canvas.width / canvas.height;
        const s = stateAt(t, aspect, compactQuery.matches);

        perspective(proj, s.fov, aspect, 0.1, 420, s.shiftX, s.shiftY);
        lookAt(view, s.eye, s.target, [Math.sin(s.roll), Math.cos(s.roll), 0]);
        multiply(vp, proj, view);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        // Aditivo premultiplicado: la luz se suma, nunca tapa. Ningún orden de
        // dibujo que resolver y, por tanto, ninguna ordenación por frame.
        gl.blendFunc(gl.ONE, gl.ONE);

        const reveal = [s.revealOrigin, s.revealHuman, s.revealAi, s.revealPortal];
        const alpha = [s.alphaOrigin, s.alphaHuman, s.alphaAi, s.alphaPortal];

        const shared = (p) => {
            gl.uniformMatrix4fv(p.uniforms.uVP, false, vp);
            gl.uniform3fv(p.uniforms.uEye, s.eye);
            gl.uniform4fv(p.uniforms.uReveal, reveal);
            gl.uniform4fv(p.uniforms.uAlpha, alpha);
            gl.uniform1f(p.uniforms.uMorph, s.morph);
            gl.uniform1f(p.uniforms.uWarp, s.warp);
            gl.uniform1f(p.uniforms.uOpen, s.open);
            gl.uniform1f(p.uniforms.uWave, s.wave);
            gl.uniform1f(p.uniforms.uWaveAmp, s.waveAmp);
            gl.uniform1f(p.uniforms.uContact, s.contact);
            gl.uniform1f(p.uniforms.uAccent, s.accent);
            gl.uniform1f(p.uniforms.uExposure, s.exposure);
            gl.uniform3fv(p.uniforms.uAiOffset, s.aiOffset);
            gl.uniform1f(p.uniforms.uAiYaw, s.aiYaw);
            gl.uniform1f(p.uniforms.uFog, compactQuery.matches ? 0.021 : 0.017);
            gl.uniformMatrix4fv(p.uniforms.uColors, false, COLORS);
            gl.uniform2f(p.uniforms.uViewport, canvas.width, canvas.height);
        };

        // Un atributo que el compilador haya descartado no existe: se omite en
        // lugar de pedirle al driver un índice inválido (y un error de consola).
        const bind = (loc, size, stride, offset, div) => {
            if (loc === undefined) return false;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
            divisor(loc, div);
            return true;
        };
        const unbind = (loc) => {
            if (loc === undefined) return;
            divisor(loc, 0);
            gl.disableVertexAttribArray(loc);
        };

        // Planos translúcidos primero: son el aire de la escena.
        gl.useProgram(planeProg.prog);
        shared(planeProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, planeBuffer);
        const PS = 11 * 4;
        const pa = planeProg.attribs;
        bind(pa.aSrc, 3, PS, 0, 0);
        bind(pa.aHyb, 3, PS, 12, 0);
        bind(pa.aUv, 2, PS, 24, 0);
        bind(pa.aMeta, 3, PS, 32, 0);
        gl.drawArrays(gl.TRIANGLES, 0, scene.planeVerts);
        [pa.aSrc, pa.aHyb, pa.aUv, pa.aMeta].forEach(unbind);

        // Todas las líneas de la pieza, en una sola llamada de dibujo.
        gl.useProgram(lineProg.prog);
        shared(lineProg);
        gl.uniform1f(lineProg.uniforms.uWidth, (compactQuery.matches ? 1.5 : 1.35) * dpr);
        const la = lineProg.attribs;
        gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
        bind(la.aCorner, 2, 0, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        const LS = 16 * 4;
        [["iA", 0], ["iB", 16], ["iHA", 32], ["iHB", 48]].forEach(([name, offset]) => bind(la[name], 4, LS, offset, 1));
        drawInstanced(gl.TRIANGLE_STRIP, 0, 4, scene.lineCount);
        [la.iA, la.iB, la.iHA, la.iHB, la.aCorner].forEach(unbind);

        // El punto de origen: lo primero que se ve y el corazón de la escultura.
        if (s.seed > 0.002) {
            gl.useProgram(seedProg.prog);
            gl.uniformMatrix4fv(seedProg.uniforms.uVP, false, vp);
            gl.uniform2f(seedProg.uniforms.uViewport, canvas.width, canvas.height);
            gl.uniform1f(seedProg.uniforms.uSeedSize, (compactQuery.matches ? 42 : 64) * dpr);
            gl.uniform1f(seedProg.uniforms.uSeedGlow, s.seed * 1.1);
            gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
            bind(seedProg.attribs.aCorner, 2, 0, 0, 0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            unbind(seedProg.attribs.aCorner);
        }
    }

    /* ── 7f. Bucle ───────────────────────────────────────────────────────── */
    /* Amortiguado exponencial normalizado por tiempo (misma ley que el resto
       del sitio): a 60 y a 120 Hz el retraso es el mismo, y un scroll brusco
       no se traduce en un salto. Cuando el valor pintado alcanza al del scroll
       no queda ni un rAF pendiente: en reposo la sección no consume GPU. */
    function frame(now) {
        raf = 0;
        const dt = lastFrame ? Math.min(now - lastFrame, 80) : 16.7;
        lastFrame = now;
        const k = Math.exp(-dt / 95);
        shown = target + (shown - target) * k;
        if (Math.abs(target - shown) < 0.0004) { shown = target; settled = true; }
        draw(shown);
        if (!settled && visible) request();
    }

    /* ── 7g. Ciclo de vida ───────────────────────────────────────────────── */
    const observer = new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        host.classList.toggle("is-live", visible);
        if (visible) { onScroll(); settled = false; request(); }
        else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { rootMargin: "120px 0px" });
    observer.observe(section);

    const onResize = () => {
        const nextPreset = compactQuery.matches ? "mobile" : innerWidth < 1400 ? "laptop" : "desktop";
        if (nextPreset !== preset) { preset = nextPreset; scene = buildScene(preset); uploadScene(); }
        resize();
        target = reduced ? STATIC_T : readProgress();
        if (reduced) shown = STATIC_T;
        settled = false;
        request();
    };

    function applyReducedMotion() {
        reduced = reducedQuery.matches;
        if (reduced) {
            // Composición única, estable y coherente con el final de la
            // secuencia: ni cámara en movimiento ni destellos.
            target = STATIC_T; shown = STATIC_T; settled = false;
            request();
        } else {
            target = readProgress();
            settled = false;
            request();
        }
    }

    let resizeTick = 0;
    const scheduleResize = () => {
        if (resizeTick) return;
        resizeTick = requestAnimationFrame(() => { resizeTick = 0; onResize(); });
    };

    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", scheduleResize, { passive: true });
    addEventListener("orientationchange", scheduleResize, { passive: true });
    if (reducedQuery.addEventListener) reducedQuery.addEventListener("change", applyReducedMotion);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleResize) : null;
    if (ro) ro.observe(host);

    // Pérdida de contexto: se detiene el bucle y se recupera al volver.
    canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        host.classList.add("is-lost");
    });
    canvas.addEventListener("webglcontextrestored", () => {
        host.classList.remove("is-lost");
        location.reload();
    });

    addEventListener("pagehide", () => {
        if (raf) cancelAnimationFrame(raf);
        observer.disconnect();
        if (ro) ro.disconnect();
        removeEventListener("scroll", onScroll);
        removeEventListener("resize", scheduleResize);
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
    }, { once: true });

    resize();
    host.classList.add("is-ready");
    applyReducedMotion();
    request();
})();
