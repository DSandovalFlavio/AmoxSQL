/**
 * FiguraVega — dibuja un spec de Vega-Lite (o de Vega) con los datos de la consulta.
 *
 * Es el lienzo de la tarjeta: el título, la conclusión, el KPI y la firma los pone
 * DataVisualizer alrededor. Aquí solo se compila, se aplica el tema y se dibuja.
 *
 *   - Los datos entran por nombre (`dataset`), igual que en cualquier herramienta
 *     que hable Vega-Lite. Se copian antes: Vega convierte las fechas EN SITIO y
 *     las filas son las mismas que pinta la tabla de resultados.
 *   - DuckDB entrega BIGINT, HUGEINT y DECIMAL como texto (para no perder
 *     precisión en JSON). Una columna cuyas celdas son TODAS número escrito como
 *     texto se convierte a número; un código con ceros a la izquierda no.
 *   - Si el spec no fija ancho y alto, la figura llena su hueco (`fit`).
 *   - Un error no deja la tarjeta en blanco: se muestra el mensaje y se avisa
 *     arriba (el editor de código lo pone debajo del texto).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as vega from 'vega';
import { temaVega } from './tema';
import { prepararFilas, compilarFigura, resolverVariables } from './motor';

/** Un tooltip propio, con los colores de la interfaz y sin depender de otro paquete. */
function crearTooltip() {
    let caja = null;
    const fuera = () => { if (caja) caja.style.display = 'none'; };
    const manejador = (_handler, evento, item, valor) => {
        if (valor == null || valor === '') { fuera(); return; }
        if (!caja) {
            caja = document.createElement('div');
            caja.className = 'figura-vega-tooltip';
            document.body.appendChild(caja);
        }
        caja.replaceChildren();
        if (typeof valor === 'object') {
            for (const [k, v] of Object.entries(valor)) {
                const fila = document.createElement('div');
                const a = document.createElement('span'); a.className = 'fvt-clave'; a.textContent = k;
                const b = document.createElement('span'); b.className = 'fvt-valor'; b.textContent = String(v);
                fila.append(a, b);
                caja.appendChild(fila);
            }
        } else {
            caja.textContent = String(valor);
        }
        caja.style.display = 'block';
        const { innerWidth: W, innerHeight: H } = window;
        const r = caja.getBoundingClientRect();
        let x = evento.clientX + 14, y = evento.clientY + 14;
        if (x + r.width > W - 8) x = evento.clientX - r.width - 14;
        if (y + r.height > H - 8) y = evento.clientY - r.height - 14;
        caja.style.left = `${Math.max(8, x)}px`;
        caja.style.top = `${Math.max(8, y)}px`;
    };
    return { manejador, fuera, quitar: () => { caja?.remove(); caja = null; } };
}

const FiguraVega = ({ spec, filas, c, colores, fuente, escala = 1, onEstado = null, onVista = null }) => {
    const caja = useRef(null);
    const vistaRef = useRef(null);
    const [tam, setTam] = useState({ w: 0, h: 0 });
    const [error, setError] = useState(null);

    const datos = useMemo(() => prepararFilas(filas), [filas]);

    useEffect(() => {
        const el = caja.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        let t = null;
        const ro = new ResizeObserver(([e]) => {
            const { width, height } = e.contentRect;
            clearTimeout(t);
            t = setTimeout(() => setTam(p => (Math.abs(p.w - width) < 2 && Math.abs(p.h - height) < 2) ? p : { w: Math.floor(width), h: Math.floor(height) }), 60);
        });
        ro.observe(el);
        return () => { clearTimeout(t); ro.disconnect(); };
    }, []);

    /* El tema vive en los tokens CSS: al cambiar de claro a oscuro (o de acento)
       cambia una clase o un estilo en <html>/<body>, y la figura se vuelve a
       dibujar con los colores nuevos. */
    const [versionTema, setVersionTema] = useState(0);
    useEffect(() => {
        if (typeof MutationObserver === 'undefined') return undefined;
        // Solo cuenta si cambió un color: un estilo en <body> también cambia al
        // arrastrar o al hacer zoom, y redibujar cada figura por eso se notaría.
        const firma = () => { const cs = getComputedStyle(document.body); return ['--text-primary', '--border-color', '--chart-bg'].map(t => cs.getPropertyValue(t)).join('|'); };
        let ultima = firma();
        const mo = new MutationObserver(() => {
            const ahora = firma();
            if (ahora !== ultima) { ultima = ahora; setVersionTema(v => v + 1); }
        });
        const opciones = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] };
        mo.observe(document.documentElement, opciones);
        mo.observe(document.body, opciones);
        return () => mo.disconnect();
    }, []);

    // El tamaño entra por señales cuando solo cambia el tamaño: recompilar en
    // cada píxel de un arrastre se nota; mover dos señales no.
    const clave = useMemo(() => JSON.stringify(spec ?? null), [spec]);
    const temaClave = JSON.stringify([fuente, escala, colores, c?.axisLabelSize, c?.axisLabelOpacity, c?.axisLabelGap, c?.dataLabelSize, versionTema]);

    const tooltipRef = useRef(null);
    if (!tooltipRef.current) tooltipRef.current = crearTooltip();

    /* Una figura nueva se monta APARTE y solo sustituye a la anterior cuando ya
       se dibujó. Así un spec a medio escribir en el modo Código no deja la
       tarjeta en blanco: se queda la última buena y el error va debajo. */
    useEffect(() => {
        const el = caja.current;
        if (!el || !spec || tam.w < 20 || tam.h < 20) return undefined;
        let vivo = true;
        const avisos = [];
        const fallar = (e) => {
            const msg = e?.message || String(e);
            setError(msg);
            onEstado?.({ error: msg, avisos });
        };
        let nueva = null;
        const hoja = document.createElement('div');
        hoja.className = 'figura-vega-hoja';
        try {
            const tema = temaVega(el, { fuente, escala, colores, c: c || {} });
            const estilo = getComputedStyle(el);
            const propio = resolverVariables(spec, (n) => estilo.getPropertyValue(n).trim());
            const vg = compilarFigura(propio, { tema, ancho: tam.w, alto: tam.h, avisos });
            nueva = new vega.View(vega.parse(vg), { renderer: 'svg', hover: true, logLevel: vega.Error });
            nueva.tooltip(tooltipRef.current.manejador);
            try { nueva.data('dataset', datos); } catch { /* el spec trae sus propios datos */ }
            nueva.initialize(hoja);
        } catch (e) {
            nueva?.finalize();
            fallar(e);
            return () => { vivo = false; };
        }
        nueva.runAsync().then(() => {
            if (!vivo) { nueva.finalize(); return; }
            vistaRef.current?.finalize();
            el.replaceChildren(hoja);
            vistaRef.current = nueva;
            setError(null);
            onEstado?.({ error: null, avisos });
            onVista?.(nueva);
        }).catch((e) => {
            nueva.finalize();
            if (vivo) fallar(e);
        });
        return () => { vivo = false; };
        // tam va aparte: ver el efecto de abajo
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave, datos, temaClave, tam.w > 0 && tam.h > 0]);

    useEffect(() => () => {
        vistaRef.current?.finalize();
        vistaRef.current = null;
        tooltipRef.current?.quitar();
    }, []);

    useEffect(() => {
        const v = vistaRef.current;
        if (!v || tam.w < 20 || tam.h < 20) return;
        try {
            if (spec && spec.width == null) v.width(tam.w);
            if (spec && spec.height == null) v.height(tam.h);
            v.resize().runAsync();
        } catch { /* una composición sin señales de tamaño se queda como está */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tam.w, tam.h]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, minWidth: 0 }}>
            <div ref={caja} className="figura-vega" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
            {error && (
                <div className={`figura-vega-error${vistaRef.current ? ' figura-vega-error--franja' : ''}`} role="alert">
                    <strong>{vistaRef.current ? 'Showing the last chart that worked.' : 'The chart could not be drawn.'}</strong>
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
};

export default FiguraVega;
