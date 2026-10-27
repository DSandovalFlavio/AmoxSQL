/**
 * La suma la hace DuckDB (5.18, Dec-71).
 *
 * El editor trae como mucho N filas del resultado (10 000 por defecto) y la figura
 * suma las que tiene: con una consulta de 2 millones de filas, una barra por mes
 * dibujaba la suma de las primeras 10 000 y no lo decía. Para los tipos que suman
 * por X, la figura pide a DuckDB esa misma agregación sobre la consulta ENTERA y
 * dibuja las filas agregadas. El spec no cambia: sumar filas que ya son una por
 * grupo da lo mismo, así que Vega-Lite llega al mismo resultado.
 *
 * Solo en modo interfaz (en modo código el spec es del usuario y no se toca) y solo
 * si la consulta se puede envolver: una SELECT/WITH sin variables por resolver.
 */
import { DEFAULT_CONFIG } from '../constants';

export const TIPOS_QUE_SUMAN = new Set([
    'bar', 'bar-stacked', 'bar-100', 'bar-horizontal', 'bar-horizontal-stacked', 'bar-horizontal-100',
    'line', 'area', 'combo', 'donut', 'pie', 'funnel', 'treemap', 'waterfall', 'slope',
]);
const UNIDAD = { day: 'day', week: 'week', month: 'month', quarter: 'quarter', year: 'year' };
const id = (n) => `"${String(n).replace(/"/g, '""')}"`;

/** La consulta, si se puede usar como subconsulta; si no, null. */
export function consultaEnvolvible(consulta) {
    if (typeof consulta !== 'string') return null;
    const sinComentarios = consulta.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!/^(select|with)\b/i.test(sinComentarios)) return null;
    if (/\$\{|\{\{/.test(sinComentarios)) return null;          // variables sin resolver
    if (/;\s*\S/.test(sinComentarios.replace(/'(?:[^']|'')*'/g, "''"))) return null; // más de una sentencia
    return consulta.trimEnd().replace(/;+\s*$/, '');
}

/**
 * @param {object} config  El estado de Story Flow.
 * @param {string} consulta La consulta del resultado.
 * @param {object} op
 * @param {boolean} op.xEsFecha  La X es una fecha (si no, la agrupación por mes no aplica).
 * @returns {string|null} La SELECT que agrega, o null si este gráfico no se puede agregar así.
 */
export function sqlDeAgregado(config, consulta, { xEsFecha = false } = {}) {
    const c = { ...DEFAULT_CONFIG, ...config };
    if (c.modo === 'codigo' || !TIPOS_QUE_SUMAN.has(c.chartType)) return null;
    const base = consultaEnvolvible(consulta);
    const X = c.xAxisKey;
    const Ys = [...new Set((c.yAxisKeys || []).filter(Boolean))];
    if (!base || !X || !Ys.length) return null;
    const medidas = c.splitByKey ? [Ys[0]] : Ys;
    if (medidas.includes(X) || (c.splitByKey && (c.splitByKey === X || medidas.includes(c.splitByKey)))) return null;

    const unidad = xEsFecha ? UNIDAD[c.dateAggregation] : null;
    const x = unidad ? `CAST(date_trunc('${unidad}', TRY_CAST(${id(X)} AS TIMESTAMP)) AS DATE) AS ${id(X)}` : id(X);
    const grupos = [x, ...(c.splitByKey ? [id(c.splitByKey)] : [])];
    const sumas = medidas.map(m => `sum(${id(m)}) AS ${id(m)}`);
    return `SELECT ${[...grupos, ...sumas].join(', ')}\nFROM (\n${base}\n) AS __figura\nGROUP BY ALL`;
}
