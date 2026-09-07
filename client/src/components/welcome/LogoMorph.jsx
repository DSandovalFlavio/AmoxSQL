import { useEffect, useRef } from 'react';

/**
 * Lienzo de la bienvenida: UN SOLO sistema de partículas que se transforma.
 *
 * La marca se condensa, se disgrega y las MISMAS partículas se reorganizan en
 * las cosas que hace la aplicación —filas de tabla, barras, un grafo de nodos,
 * celdas de notebook— antes de volver a la marca. Que sea un único sistema, y
 * no cuatro animaciones apiladas, es lo que hace que se lea como diseño y no
 * como adorno.
 *
 * La forma del logo se MUESTREA del path SVG real (getPointAtLength sobre los
 * mismos dos paths de Logo.jsx), no se aproxima a mano: así nunca se desincroniza
 * si la marca cambia.
 */

const N = 430;                 // partículas
const HOLD = 2600;             // ms quieta en cada forma
const MORPH = 1500;            // ms de transición
const DPR_CAP = 2;             // más resolución no se nota y cuesta batería

// Los dos paths de Logo.jsx y su viewBox, para normalizar a 0..1.
const LOGO_PATHS = [
    'M 135 285 Q 125 290 115 275 L 185 75 Q 200 45 215 75 L 285 275 Q 275 290 265 285',
    'M 130 210 Q 200 330 270 210',
];
const VIEW = { x: 55, y: 28, size: 290 };

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// ── Formas ────────────────────────────────────────────────────────────────
// Cada generadora devuelve puntos normalizados 0..1; `fit` los reparte hasta N.

const sampleLogo = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `${VIEW.x} ${VIEW.y} ${VIEW.size} ${VIEW.size}`);
    svg.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
    const paths = LOGO_PATHS.map((d) => {
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', d);
        svg.appendChild(p);
        return p;
    });
    document.body.appendChild(svg);

    const lens = paths.map((p) => p.getTotalLength());
    const total = lens.reduce((a, b) => a + b, 0);
    const pts = [];
    paths.forEach((p, i) => {
        const count = Math.max(1, Math.round((N * lens[i]) / total));
        for (let k = 0; k < count; k++) {
            const pt = p.getPointAtLength((lens[i] * k) / count);
            pts.push([(pt.x - VIEW.x) / VIEW.size, (pt.y - VIEW.y) / VIEW.size]);
        }
    });
    svg.remove();
    return pts;
};

const shapeTable = () => {
    const pts = [];
    const rows = 10, cols = 26;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            pts.push([0.2 + (c / (cols - 1)) * 0.6, 0.24 + (r / (rows - 1)) * 0.52]);
        }
    }
    return pts;
};

const shapeBars = () => {
    const pts = [];
    const heights = [0.42, 0.68, 0.34, 0.86, 0.55, 0.74];
    const base = 0.78;
    heights.forEach((h, b) => {
        const x = 0.22 + (b / (heights.length - 1)) * 0.56;
        const top = base - h * 0.5;
        const steps = 20;
        for (let i = 0; i <= steps; i++) {          // los dos lados de la barra
            const y = base - (i / steps) * (base - top);
            pts.push([x - 0.028, y], [x + 0.028, y]);
        }
        pts.push([x, top]);                          // el remate
    });
    return pts;
};

const shapeGraph = () => {
    const hubs = [[0.24, 0.3], [0.24, 0.7], [0.5, 0.5], [0.76, 0.28], [0.76, 0.72]];
    const edges = [[0, 2], [1, 2], [2, 3], [2, 4]];
    const pts = [];
    edges.forEach(([a, b]) => {
        for (let i = 1; i < 17; i++) {                // el cable
            const t = i / 17;
            pts.push([
                hubs[a][0] + (hubs[b][0] - hubs[a][0]) * t,
                hubs[a][1] + (hubs[b][1] - hubs[a][1]) * t,
            ]);
        }
    });
    hubs.forEach(([hx, hy]) => {
        for (let i = 0; i < 30; i++) {               // el nodo
            const a = (i / 30) * Math.PI * 2;
            pts.push([hx + Math.cos(a) * 0.055, hy + Math.sin(a) * 0.055]);
        }
    });
    return pts;
};

const shapeNotebook = () => {
    const pts = [];
    const w = 0.56, h = 0.15, x0 = 0.22;
    for (let c = 0; c < 3; c++) {
        const y0 = 0.2 + c * 0.23;
        const per = 2 * (w + h);
        const steps = 68;
        for (let i = 0; i < steps; i++) {            // el contorno de la celda
            const d = (i / steps) * per;
            if (d < w) pts.push([x0 + d, y0]);
            else if (d < w + h) pts.push([x0 + w, y0 + (d - w)]);
            else if (d < 2 * w + h) pts.push([x0 + w - (d - w - h), y0 + h]);
            else pts.push([x0, y0 + h - (d - 2 * w - h)]);
        }
    }
    return pts;
};

/**
 * Repite o recorta hasta dejar exactamente N puntos.
 * Las generadoras estan calibradas para rendir del orden de 200-300 puntos: con
 * muchos menos, fit() repetiria cada posicion 4 o 5 veces y las particulas
 * quedarian exactamente superpuestas, que se ve como una retícula de puntos
 * brillantes en vez de un enjambre.
 */
const fit = (pts) => {
    const out = new Array(N);
    for (let i = 0; i < N; i++) out[i] = pts[i % pts.length];
    return out;
};

// ── Color ─────────────────────────────────────────────────────────────────
// Las partículas toman el degradado del logo, interpolado por su altura: el
// sistema se ve del mismo material que la marca, sea cual sea el acento.

const parseOklch = (css) => {
    const m = String(css).match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.-]+)/i);
    if (!m) return null;
    const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    return { L, C: parseFloat(m[2]), H: parseFloat(m[3]) };
};

const STEPS = 24;

const buildPalette = () => {
    const cs = getComputedStyle(document.body);
    const rawA = cs.getPropertyValue('--logo-grad-a').trim();
    const rawB = cs.getPropertyValue('--logo-grad-b').trim();
    const a = parseOklch(rawA);
    const b = parseOklch(rawB);
    if (!a || !b) return { key: rawA + rawB, colors: new Array(STEPS).fill(rawA || '#00ECFF') };

    // Interpolación de tono por el camino corto, igual que hace oklch.
    let dH = b.H - a.H;
    if (dH > 180) dH -= 360;
    if (dH < -180) dH += 360;

    const colors = [];
    for (let i = 0; i < STEPS; i++) {
        const t = i / (STEPS - 1);
        colors.push(
            `oklch(${(a.L + (b.L - a.L) * t).toFixed(3)} ` +
            `${(a.C + (b.C - a.C) * t).toFixed(3)} ` +
            `${(a.H + dH * t).toFixed(1)})`
        );
    }
    return { key: rawA + rawB, colors };
};

// ──────────────────────────────────────────────────────────────────────────
const LogoMorph = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const shapes = [sampleLogo(), shapeTable(), shapeBars(), shapeGraph(), shapeNotebook()].map(fit);

        const P = Array.from({ length: N }, (_, i) => ({
            x: shapes[0][i][0], y: shapes[0][i][1],
            fx: shapes[0][i][0], fy: shapes[0][i][1],
            tx: shapes[0][i][0], ty: shapes[0][i][1],
            delay: Math.random() * 0.35,          // escalona la salida
            size: 0.8 + Math.random() * 1.3,
        }));

        let W = 0, H = 0, dpr = 1;
        const resize = () => {
            const w = canvas.clientWidth, h = canvas.clientHeight;
            if (!w || !h) return;
            dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
            W = w; H = h;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);
        resize();

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let palette = buildPalette();
        let lastPaletteCheck = 0;
        let shapeIndex = 0;
        let phaseStart = performance.now();
        let holding = true;
        let raf = 0;

        const frame = (now) => {
            raf = requestAnimationFrame(frame);
            if (!W || !H) return;

            // El acento puede cambiar sin desmontar esto (ajustes): se revisa de
            // vez en cuando en vez de observar el DOM.
            if (now - lastPaletteCheck > 500) {
                lastPaletteCheck = now;
                const next = buildPalette();
                if (next.key !== palette.key) palette = next;
            }

            const elapsed = now - phaseStart;
            if (!reduce) {
                if (holding && elapsed > HOLD) {
                    holding = false;
                    phaseStart = now;
                    shapeIndex = (shapeIndex + 1) % shapes.length;
                    for (let i = 0; i < N; i++) {
                        const p = P[i];
                        p.fx = p.x; p.fy = p.y;
                        p.tx = shapes[shapeIndex][i][0];
                        p.ty = shapes[shapeIndex][i][1];
                    }
                } else if (!holding && elapsed > MORPH) {
                    holding = true;
                    phaseStart = now;
                }
            }

            ctx.clearRect(0, 0, W, H);

            const S = Math.min(W, H) * 0.62;
            const ox = (W - S) / 2;
            const oy = (H - S) / 2;
            const progress = holding ? 1 : Math.min(1, elapsed / MORPH);

            for (let i = 0; i < N; i++) {
                const p = P[i];
                if (!holding) {
                    const span = 1 - p.delay * 0.5;
                    const k = Math.min(1, Math.max(0, (progress - p.delay * 0.5) / span));
                    const e = easeInOut(k);
                    p.x = p.fx + (p.tx - p.fx) * e;
                    p.y = p.fy + (p.ty - p.fy) * e;
                }
                // Deriva mínima en reposo para que no parezca una imagen fija.
                const drift = holding && !reduce ? Math.sin(now / 1400 + i) * 0.0014 : 0;

                ctx.fillStyle = palette.colors[Math.min(STEPS - 1, Math.max(0, Math.round(p.y * (STEPS - 1))))];
                ctx.globalAlpha = 0.35 + (i % 5) * 0.13;
                ctx.beginPath();
                ctx.arc(ox + (p.x + drift) * S, oy + (p.y + drift) * S, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };

        raf = requestAnimationFrame(frame);

        // Sin esto el bucle seguiría vivo tras entrar al IDE: es la fuga más
        // fácil de dejar aquí, y cuesta bateria para siempre.
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, []);

    return <canvas ref={canvasRef} className="ws-morph" aria-hidden="true" />;
};

export default LogoMorph;
