/**
 * El motor de la figura, sin React: registrar el formato de Story Flow, preparar
 * las filas y compilar un spec con el tema. Separado del componente para poder
 * probarlo en Node (scripts/probarGraficos.mjs).
 */
import * as vega from 'vega';
import { compile } from 'vega-lite';
import { formatNumber } from '../utils/numberFormat';
import { esVegaCompleto } from './figura';
import { FORMATO_AMOX } from './deStoryFlow';
import { unirConfig } from './tema';

// El formato de número de Story Flow, disponible para cualquier spec como
// `formatType: "amoxNumero"` con `format: "<tipo>|<decimales>"`.
vega.expressionFunction(FORMATO_AMOX, (valor, formato) => {
    const [tipo, decimales] = String(formato ?? 'compact|-1').split('|');
    const n = Number(valor);
    return isNaN(n) ? String(valor ?? '') : formatNumber(n, tipo || 'compact', Number(decimales ?? -1));
});

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

const MARCAS = ['arc', 'area', 'bar', 'boxplot', 'circle', 'errorband', 'errorbar', 'geoshape', 'image', 'line', 'point', 'rect', 'rule', 'square', 'text', 'tick', 'trail'];

/** Vega-Lite responde a una marca desconocida con un error interno ilegible; esto lo dice claro. */
function revisarMarcas(s) {
    if (!s || typeof s !== 'object') return;
    const t = typeof s.mark === 'string' ? s.mark : s.mark?.type;
    if (s.mark && !MARCAS.includes(t)) throw new Error(`Unknown mark type "${t}". Use one of: ${MARCAS.join(', ')}.`);
    for (const k of ['layer', 'hconcat', 'vconcat', 'concat']) (s[k] || []).forEach(revisarMarcas);
    if (s.spec) revisarMarcas(s.spec);
}

const tieneComposicion = (s) => !!(s.hconcat || s.vconcat || s.concat || s.facet || s.repeat);

/** Spec + tema + tamaño → spec de Vega listo para `parse`. */
export function compilarFigura(spec, { tema, ancho, alto, avisos = [] }) {
    if (esVegaCompleto(spec)) {
        const { title, config, ...resto } = spec;
        return {
            ...resto,
            ...(resto.width == null ? { width: ancho } : {}),
            ...(resto.height == null ? { height: alto } : {}),
            autosize: resto.autosize || { type: 'fit', contains: 'padding' },
            config: unirConfig(tema, config),
        };
    }
    revisarMarcas(spec);
    const { title, config, ...resto } = spec;
    const llena = !tieneComposicion(resto);
    const s = {
        ...resto,
        ...(llena && resto.width == null ? { width: ancho } : {}),
        ...(llena && resto.height == null ? { height: alto } : {}),
        ...(llena && !resto.autosize ? { autosize: { type: 'fit', contains: 'padding' } } : {}),
    };
    const logger = {
        level() { return this; },
        warn: (...a) => avisos.push(a.join(' ')),
        info() { }, debug() { },
        error: (...a) => avisos.push(a.join(' ')),
    };
    return compile(s, { config: unirConfig(tema, config), logger }).spec;
}
