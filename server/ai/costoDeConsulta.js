/**
 * El Assistant cuida el costo (6.0, fase 3; O6).
 *
 * Antes de correr una consulta que escribió el Assistant, el plan ESTIMADO
 * (`EXPLAIN (FORMAT json)`, no lee datos) dice cuántas filas va a mover: lo que leen
 * las hojas del plan (tablas, archivos, `range`) y el operador más grande (un join que
 * se multiplica). Si pasa del umbral, la herramienta no la corre: devuelve la
 * estimación y le pide al modelo que pregunte al usuario o la acote, y sólo la corre
 * cuando vuelve con `confirmed: true`. Lo mismo que hace el modo agente de la CLI del
 * motor. Lo que no se puede estimar (un error del plan, algo que no es una consulta)
 * no se frena: se corre como siempre.
 */
const { normalizar, deFilas } = require('../planDeEjecucion');

const UMBRAL_FILAS = 50_000_000;
const DEVUELVE_FILAS = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*\(*\s*(SELECT|WITH|FROM|VALUES|TABLE|PIVOT|UNPIVOT)\b/i;

const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Del árbol estimado: { filasLeidas, mayor, fuentes: [{ operador, detalle, filas }] }. */
function medir(plan) {
    let filasLeidas = 0, mayor = 0;
    const fuentes = [];
    const recorrer = (n) => {
        if (!n) return;
        const filas = numero(n.estimated_cardinality);
        mayor = Math.max(mayor, filas);
        if (!n.children?.length) {
            filasLeidas += filas;
            const ei = n.extra_info || {};
            fuentes.push({ operador: n.name, detalle: ei.Table || ei.Function || ei.Text || null, filas });
        }
        (n.children || []).forEach(recorrer);
    };
    recorrer(plan);
    return { filasLeidas, mayor, fuentes: fuentes.sort((a, b) => b.filas - a.filas).slice(0, 5) };
}

/**
 * ¿Hay que preguntar antes de correrla? null si no (o si no se pudo estimar); si sí,
 * lo que la herramienta devuelve al modelo.
 */
async function antesDeCorrer(db, query, { umbral = UMBRAL_FILAS } = {}) {
    if (typeof query !== 'string' || !DEVUELVE_FILAS.test(query)) return null;
    let m;
    try {
        const filas = await db.systemQuery(`EXPLAIN (FORMAT json) ${query.trim().replace(/;+\s*$/, '')}`, { lane: 'ai' });
        m = medir(normalizar(deFilas(filas), 'explain').plan);
    } catch { return null; }
    const costo = Math.max(m.filasLeidas, m.mayor);
    if (costo <= umbral) return null;
    const millones = (x) => `${(x / 1e6).toFixed(x >= 1e8 ? 0 : 1)} million`;
    return {
        needs_confirmation: true,
        estimated_rows_read: Math.round(m.filasLeidas),
        estimated_largest_step: Math.round(m.mayor),
        biggest_sources: m.fuentes.map(f => ({ source: f.detalle || f.operador, estimated_rows: Math.round(f.filas) })),
        message: `Not run: the engine estimates this query moves about ${millones(costo)} rows (more than ${millones(umbral)}). Do NOT run it again on your own. Tell the user what it would read and ask whether to run it as is, or propose a narrower version (a WHERE on a date or key, a sample with USING SAMPLE, fewer columns, a pre-aggregated table). If the user agrees to run it, call execute_sql again with the same query and confirmed: true.`,
    };
}

module.exports = { antesDeCorrer, medir, UMBRAL_FILAS };
