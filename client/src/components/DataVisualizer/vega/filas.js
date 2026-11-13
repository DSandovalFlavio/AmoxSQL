/**
 * Lo que la figura necesita antes de Vega: preparar las filas y resolver los
 * `var(--token)` del spec. Aparte de `motor.js` para que quien sólo necesita
 * esto no arrastre Vega al paquete de arranque (6.0, M8).
 */

const NUMERO = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const CERO_DELANTE = /^-?0\d/;

/** Copia las filas y convierte a número las columnas que solo traen números como texto. */
export function prepararFilas(filas) {
    if (!Array.isArray(filas) || !filas.length) return [];
    const columnas = Object.keys(filas[0] || {});
    const numericas = columnas.filter((k) => {
        let vistas = 0;
        for (let i = 0; i < filas.length && vistas < 50; i++) {
            const v = filas[i]?.[k];
            if (v == null || v === '') continue;
            if (typeof v === 'number') { vistas++; continue; }
            if (typeof v !== 'string' || !NUMERO.test(v) || CERO_DELANTE.test(v)) return false;
            vistas++;
        }
        return vistas > 0 && filas.some(f => typeof f?.[k] === 'string');
    });
    if (!numericas.length) return filas.map(f => ({ ...f }));
    return filas.map((f) => {
        const r = { ...f };
        for (const k of numericas) if (typeof r[k] === 'string' && r[k] !== '') r[k] = Number(r[k]);
        return r;
    });
}

const VARIABLE = /^var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)$/;

/**
 * Un color `var(--token)` funciona en CSS pero no como atributo de un SVG, que
 * es como lo escribe Vega: la marca salía negra. Se sustituye por su valor antes
 * de compilar (el asistente, por ejemplo, resalta con `var(--accent-primary)`).
 */
export function resolverVariables(spec, leer) {
    const ir = (v) => {
        if (typeof v === 'string') {
            const m = VARIABLE.exec(v.trim());
            return m ? (leer(m[1]) || (m[2] || '').trim() || v) : v;
        }
        if (Array.isArray(v)) return v.map(ir);
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ir(x)]));
        return v;
    };
    return ir(spec);
}
