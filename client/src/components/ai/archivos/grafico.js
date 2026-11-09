/**
 * **El Assistant en un gráfico de Story Flow** (plan del Assistant, E4).
 *
 * Reescribir el JSON de un `.amoxvis` es la operación equivocada (V1): en modo
 * interfaz el spec se rehace desde los paneles al abrir, así que lo escrito a mano
 * se pierde. El Assistant propone lo mismo que tocaría el usuario: **cambios de
 * paneles**, con las claves que guarda Story Flow (`chartType`, `xAxisKey`,
 * `highlightConfig`, `takeaway`…). En la vista Code puede proponer además un
 * Vega-Lite entero (`spec`), que se asimila como si lo hubiera escrito el usuario.
 *
 * Un panel que el tipo de gráfico no dibuja se rechaza (la tabla es
 * `capacidades`, la misma que consultan los paneles): un cambio que se acepta y no
 * hace nada es peor que no proponerlo.
 *
 * Puro. Lo usan el panel (estado), la pestaña del gráfico (que lo aplica) y las
 * pruebas.
 */
import { DEFAULT_CONFIG, CHART_TYPES } from '../../DataVisualizer/constants.js';
import { capacidades } from '../../DataVisualizer/panels/capacidades.js';

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Las claves que no son de los paneles, o que el Assistant no toca. */
const AJENAS = new Set(['modo', 'spec', 'extras', 'brandColors', 'query', 'source', 'cardStyle', 'seriesConfig']);

/** Las claves que nombran columnas del resultado. */
export const CLAVES_DE_COLUMNA = ['xAxisKey', 'yAxisKeys', 'rightYAxisKey', 'splitByKey', 'bubbleSizeKey',
    'errorLowKey', 'errorHighKey', 'bandLowKey', 'bandHighKey', 'facetKey', 'tooltipFields', 'comboLineKeys'];

/** Qué pieza de `capacidades` hace falta para que un panel se dibuje. */
export const FUNCION_DE_CLAVE = {
    highlightConfig: 'resalte', refLine: 'referencias', goalLine: 'referencias', refArea: 'referencias',
    trendLine: 'tendencia', annotations: 'anotaciones', splitByKey: 'partir', bubbleSizeKey: 'tamano',
    rightYAxisKey: 'derecha', bandLowKey: 'banda', bandHighKey: 'banda', showLabels: 'etiquetas',
    facetKey: 'facetas', isCumulative: 'acumulado', endLabels: 'finales',
};

/** Los tipos compuestos del selector: tipo + apilado (lo mismo que hace el panel Type). */
const COMPUESTOS = {
    'bar-stacked': { chartType: 'bar', barStackMode: 'stack' },
    'bar-100': { chartType: 'bar', barStackMode: 'expand' },
    'bar-horizontal-stacked': { chartType: 'bar-horizontal', barStackMode: 'stack' },
    'bar-horizontal-100': { chartType: 'bar-horizontal', barStackMode: 'expand' },
    bubble: { chartType: 'scatter' },
};

/** Los tipos que se guardan en `chartType`. */
export const TIPOS_DE_GRAFICO = CHART_TYPES.map(t => t.key).filter(k => !COMPUESTOS[k]);

/** El tipo de valor de cada clave, para validar sin conocer cada panel. */
export function tiposDeClave() {
    const out = {};
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
        if (AJENAS.has(k)) continue;
        out[k] = Array.isArray(v) ? 'array' : v === null ? 'any' : typeof v;
    }
    return out;
}

/** Para cada pieza de `capacidades` que importa al Assistant, los tipos que la dibujan. */
export function tablaDeCapacidades() {
    const piezas = [...new Set(Object.values(FUNCION_DE_CLAVE))];
    return Object.fromEntries(piezas.map(p => [p, TIPOS_DE_GRAFICO.filter(t => capacidades(t)[p])]));
}

/** Solo lo que difiere de fábrica (sin las claves ajenas). */
export function panelesElegidos(config) {
    const r = {};
    for (const [k, v] of Object.entries(config || {})) {
        if (AJENAS.has(k) || v === undefined || !(k in DEFAULT_CONFIG)) continue;
        if (igual(DEFAULT_CONFIG[k], v)) continue;
        r[k] = v;
    }
    return r;
}

/**
 * Lo que el Assistant ve del gráfico (V2): el tipo, los paneles elegidos, la
 * consulta, las columnas, la etapa de Story Flow en la que está y, para validar,
 * qué claves existen y qué tipos dibujan cada cosa. Las filas NO van aquí: viajan
 * como resultado y pasan por la política de IA.
 */
export function estructuraDeGrafico({ config = {}, columnas = [], etapa = null, vista = 'paneles', spec = null } = {}) {
    const c = { ...DEFAULT_CONFIG, ...config };
    const codigo = c.modo === 'codigo' || vista === 'codigo';
    let specTexto = null;
    if (codigo && spec) {
        try { specTexto = JSON.stringify(spec, null, 2).slice(0, 12000); } catch { /* sin spec */ }
    }
    return {
        tipo: c.chartType,
        modo: c.modo === 'codigo' ? 'codigo' : 'interfaz',
        vista: vista === 'codigo' ? 'codigo' : 'paneles',
        etapa: etapa || null,
        paneles: panelesElegidos(c),
        valores: Object.fromEntries(Object.keys(tiposDeClave()).map(k => [k, c[k]])),
        consulta: String(c.query || '').slice(0, 6000),
        origen: c.source || null,
        columnas: (columnas || []).slice(0, 200).map(x => (typeof x === 'string' ? { name: x } : { name: x.name, ...(x.type ? { type: x.type } : {}) })),
        conExtras: !!c.extras,
        spec: specTexto,
        claves: tiposDeClave(),
        tipos: TIPOS_DE_GRAFICO,
        admite: tablaDeCapacidades(),
    };
}

/**
 * Comprueba unos cambios contra el gráfico de hoy: claves que existen, con el tipo
 * de valor que toca, columnas que están en el resultado y paneles que el tipo
 * (el nuevo, si cambia) dibuja. Devuelve los cambios normalizados (un tipo
 * compuesto como `bar-stacked` pasa a tipo + apilado) y los errores.
 */
export function validarCambios(config, cambios, columnas = []) {
    const errores = [];
    const tipos = tiposDeClave();
    const cols = new Set((columnas || []).map(x => (typeof x === 'string' ? x : x.name)));
    let out = {};
    for (const [k, v] of Object.entries(cambios || {})) {
        if (k === 'chartType' && COMPUESTOS[v]) { out = { ...out, ...COMPUESTOS[v] }; continue; }
        if (!(k in tipos)) { errores.push(`"${k}" is not a Story Flow setting.`); continue; }
        const t = tipos[k];
        if (t !== 'any' && !(t === 'array' ? Array.isArray(v) : typeof v === t)) { errores.push(`"${k}" must be ${t === 'array' ? 'a list' : `a ${t}`}.`); continue; }
        out[k] = v;
    }
    if (out.chartType && !TIPOS_DE_GRAFICO.includes(out.chartType)) {
        errores.push(`"${out.chartType}" is not a chart type. Use one of: ${TIPOS_DE_GRAFICO.join(', ')}.`);
        delete out.chartType;
    }
    if (cols.size) {
        for (const k of CLAVES_DE_COLUMNA) {
            if (!(k in out)) continue;
            const lista = (Array.isArray(out[k]) ? out[k] : [out[k]]).filter(x => x !== '' && x != null);
            const fuera = lista.filter(x => !cols.has(x));
            if (fuera.length) { errores.push(`${k}: ${fuera.join(', ')} ${fuera.length > 1 ? 'are' : 'is'} not a column of the result (${[...cols].join(', ')}).`); delete out[k]; }
        }
    }
    const tipo = out.chartType || config?.chartType || 'bar';
    const cap = capacidades(tipo);
    for (const [k, pieza] of Object.entries(FUNCION_DE_CLAVE)) {
        if (!(k in out)) continue;
        const v = out[k];
        const apaga = v === '' || v === false || (Array.isArray(v) && !v.length) || (esObjeto(v) && (v.type === 'none' || v.enabled === false));
        if (!apaga && !cap[pieza]) { errores.push(`A ${tipo} chart does not draw ${k}.`); delete out[k]; }
    }
    return { cambios: out, errores };
}

/** El gráfico con los cambios: un objeto (un resalte, una línea) se mezcla con el de hoy. */
export function aplicarCambios(config, cambios) {
    const out = { ...(config || {}) };
    for (const [k, v] of Object.entries(cambios || {})) {
        out[k] = esObjeto(v) && esObjeto(out[k] ?? DEFAULT_CONFIG[k]) ? { ...(out[k] ?? DEFAULT_CONFIG[k]), ...v } : v;
    }
    return out;
}

/** ¿Es una propuesta para un gráfico? */
export const esDeGrafico = (r) => r?.action === 'propose_change' && (r.objetivo?.tipo === 'paneles' || r.objetivo?.tipo === 'spec');

/**
 * ¿Sigue valiendo? Los paneles que cambia tienen que seguir como estaban cuando se
 * propuso (si el usuario tocó el mismo, caducó). Un spec no caduca: lo que se ve
 * en Antes / Propuesta es lo que entra.
 */
export function vigenteEnGrafico(config, r) {
    if (!esDeGrafico(r)) return false;
    if (r.objetivo.tipo === 'spec') return true;
    const c = { ...DEFAULT_CONFIG, ...(config || {}) };
    return Object.entries(r.original || {}).every(([k, v]) => igual(c[k], v));
}

const ETIQUETAS = {
    chartType: 'Type', xAxisKey: 'X', yAxisKeys: 'Y', splitByKey: 'Split by', rightYAxisKey: 'Right axis',
    sortMode: 'Sort', limit: 'Limit', dateAggregation: 'Dates by', colorTheme: 'Palette', showLabels: 'Data labels',
    legendPosition: 'Legend', chartTitle: 'Title', chartSubtitle: 'Subtitle', takeaway: 'Takeaway',
    chartFootnote: 'Footnote', chartSource: 'Source', highlightConfig: 'Highlight', refLine: 'Reference line',
    goalLine: 'Goal', trendLine: 'Trend', annotations: 'Notes on the chart', headline: 'Headline KPI',
    numberFormat: 'Numbers', barStackMode: 'Stacking', barColorMode: 'Bar colors', facetKey: 'Small multiples',
    endLabels: 'End labels', isCumulative: 'Cumulative', lineType: 'Line', showDots: 'Dots',
};

const corto = (v) => {
    if (v === '' || v == null) return '—';
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    if (esObjeto(v)) {
        if ('type' in v) return v.type === 'none' ? 'off' : [v.type, v.value].filter(Boolean).join(' ');
        if ('enabled' in v) return v.enabled ? String(v.value ?? 'on') : 'off';
        if ('visible' in v) return v.visible ? (v.metric || 'on') : 'off';
        if ('value' in v) return v.value === '' ? 'off' : String(v.value);
        return 'changed';
    }
    const t = String(v);
    return t.length > 40 ? `“${t.slice(0, 38)}…”` : (typeof v === 'string' ? `“${t}”` : t);
};

/** La lista de lo que cambia: «Type: bar → line», «Highlight: max». */
export function describirCambios(r) {
    if (r?.objetivo?.tipo === 'spec') return ['The Vega-Lite spec (from the Code view)'];
    const o = r?.original || {};
    return Object.entries(r?.cambios || {}).map(([k, v]) => {
        const et = ETIQUETAS[k] || k;
        const antes = o[k];
        const despues = esObjeto(v) && esObjeto(antes) ? { ...antes, ...v } : v;
        return antes === undefined ? `${et}: ${corto(despues)}` : `${et}: ${corto(antes)} → ${corto(despues)}`;
    });
}

/** La línea del chat: «Change to the chart: Type, Title». */
export function describirGrafico(r) {
    if (r?.objetivo?.tipo === 'spec') return 'New Vega-Lite spec for this chart';
    const claves = Object.keys(r?.cambios || {}).map(k => ETIQUETAS[k] || k);
    return claves.length ? `Change to the chart: ${claves.slice(0, 4).join(', ')}${claves.length > 4 ? '…' : ''}` : 'Change to the chart';
}
