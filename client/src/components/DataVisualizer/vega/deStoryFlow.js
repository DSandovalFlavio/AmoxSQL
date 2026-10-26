/**
 * Story Flow → Vega-Lite (Dec-69/70, plan_graficos_vega_lite.md).
 *
 * Traduce el estado de los paneles (las claves de DEFAULT_CONFIG) a un spec de
 * Vega-Lite v6 que se puede llevar a cualquier sitio que hable Vega-Lite. Es una
 * función PURA: no toca el DOM ni el tema. El aspecto (fuente, colores del eje,
 * rejilla) lo pone `tema.js` al dibujar, así que el spec queda limpio.
 *
 * Reglas que vienen de lo que fallaba con el sistema anterior:
 *   - Los datos llegan por nombre (`dataset`) y SIN tocar: la agregación es una
 *     transformación del spec, y solo la hacen los tipos que la necesitan. La
 *     dispersión dibuja cada fila; antes sumaba las que compartían X.
 *   - `limit` solo recorta rankings (barras, anillo, embudo, mapa de rectángulos).
 *     Antes cortaba también una serie diaria en sus primeros 50 días.
 *   - Las capas (meta, referencia, banda, anotación, tendencia) son capas de
 *     verdad, y por eso funcionan en todos los tipos con ejes.
 *
 * El treemap no existe en Vega-Lite: sale como spec de Vega (decisión del autor).
 */
import { isDateColumn } from '../utils/dataProcessing';
import { DEFAULT_CONFIG } from '../constants';

export const ESQUEMA_VL = 'https://vega.github.io/schema/vega-lite/v6.json';
export const ESQUEMA_VEGA = 'https://vega.github.io/schema/vega/v6.json';
/** El tipo de formato que registra FiguraVega: `formatNumber` de Story Flow. */
export const FORMATO_AMOX = 'amoxNumero';

const UNIDAD = { day: 'yearmonthdate', week: 'yearweek', month: 'yearmonth', quarter: 'yearquarter', year: 'year' };
const FORMATO_FECHA = { yearmonthdate: '%d %b %Y', yearweek: '%d %b %Y', yearmonth: '%b %Y', yearquarter: 'Q%q %Y', year: '%Y' };
const MAX_PUNTOS = 60;

/** En Vega-Lite un punto o un corchete en `field` significa anidado. */
export const campo = (n) => String(n).replace(/([.[\]\\])/g, '\\$1');
/** Una columna leída desde una expresión. */
const dato = (n) => `datum[${JSON.stringify(String(n))}]`;
const texto = (v) => JSON.stringify(String(v));

/** El tipo efectivo: los compuestos de barras se separan en tipo + apilado. */
export function tipoEfectivo(c) {
    const t = c.chartType || 'bar';
    if (t === 'bar-stacked') return { tipo: 'bar', apilado: 'stack', horizontal: false };
    if (t === 'bar-100') return { tipo: 'bar', apilado: 'expand', horizontal: false };
    if (t === 'bar-horizontal-stacked') return { tipo: 'bar', apilado: 'stack', horizontal: true };
    if (t === 'bar-horizontal-100') return { tipo: 'bar', apilado: 'expand', horizontal: true };
    if (t === 'bar-horizontal') return { tipo: 'bar', apilado: c.barStackMode || 'none', horizontal: true };
    if (t === 'bar') return { tipo: 'bar', apilado: c.barStackMode || 'none', horizontal: false };
    if (t === 'bubble') return { tipo: 'scatter', apilado: 'none', horizontal: false, burbuja: true };
    return { tipo: t, apilado: 'none', horizontal: false };
}

/** Un color de la paleta con transparencia (los de la paleta son #rrggbb). */
function conAlfa(color, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(color || '');
    if (!m) return color;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const formato = (c) => ({ format: `${c.numberFormat || 'compact'}|${c.decimalPlaces ?? -1}`, formatType: FORMATO_AMOX });

function leyenda(c) {
    const pos = c.legendPosition;
    if (!pos || pos === 'inline' || pos === 'none') return null;
    return { orient: pos, title: null };
}

/** Los colores de cada serie, con los que el usuario eligió a mano encima. */
function rangoDeSeries(series, c, colores) {
    return series.map((s, i) => c.seriesConfig?.[s]?.color || colores[i % colores.length]);
}

/** Las series en el orden en que salen en la leyenda tejida (el mismo que antes). */
function seriesDe(c, filas, plegado) {
    if (c.splitByKey) {
        const vistas = new Set();
        for (const f of filas) {
            const v = f[c.splitByKey];
            if (v != null) vistas.add(String(v).split('T')[0]);
        }
        return [...vistas].sort();
    }
    return plegado ? [...c.yAxisKeys] : [];
}

/**
 * @param {object} config  El estado de Story Flow (se completa con DEFAULT_CONFIG).
 * @param {object} op
 * @param {object[]} [op.filas]   Una muestra de los datos: para saber qué es fecha y qué número.
 * @param {string[]} [op.colores] La paleta activa.
 * @returns {object} spec de Vega-Lite (o de Vega para el treemap), con `data: {name: 'dataset'}`.
 */
export function deStoryFlow(config, { filas = [], colores = ['#9b87f5'] } = {}) {
    const c = { ...DEFAULT_CONFIG, ...config };
    const { tipo, apilado, horizontal, burbuja } = tipoEfectivo(c);
    const X = c.xAxisKey;
    const Ys = (c.yAxisKeys || []).filter(Boolean);

    if (tipo === 'treemap') return treemapVega(c, colores);

    const base = { $schema: ESQUEMA_VL, data: { name: 'dataset' } };
    if (c.chartTitle || c.chartSubtitle) {
        base.title = { text: c.chartTitle || '', ...(c.chartSubtitle ? { subtitle: c.chartSubtitle } : {}) };
    }
    if (!X || !Ys.length) return { ...base, mark: 'point' };

    const muestra = filas.slice(0, 200);
    const valorX = muestra.find(f => f[X] != null)?.[X];
    const xEsFecha = muestra.length ? isDateColumn(muestra, X) : (c.dateAggregation && c.dateAggregation !== 'none');
    const xEsNumero = !xEsFecha && (typeof valorX === 'number' || (typeof valorX === 'string' && valorX !== '' && !isNaN(Number(valorX)) && !/^0\d/.test(valorX)));
    const unidad = xEsFecha && c.dateAggregation && c.dateAggregation !== 'none' ? UNIDAD[c.dateAggregation] : null;

    // ── Series: partir por una columna, varias Y plegadas, o una sola ──
    const plegado = !c.splitByKey && Ys.length > 1;
    // La misma columna en X y en Y: se suma una copia, si no la agregación pisa la X.
    const copiaDeX = !plegado && Ys[0] === X;
    const valor = c.splitByKey ? Ys[0] : (plegado ? 'valor' : (copiaDeX ? `${X} (valor)` : Ys[0]));
    const serie = c.splitByKey || (plegado ? 'serie' : null);
    const series = seriesDe(c, filas, plegado);
    const colorUnico = c.seriesConfig?.[Ys[0]]?.color || colores[0];

    const T = [];
    if (plegado) T.push({ fold: Ys, as: ['serie', 'valor'] });
    if (copiaDeX) T.push({ calculate: dato(X), as: valor });

    // ── Transformaciones comunes ──
    const agrega = !['scatter', 'heatmap'].includes(tipo);
    if (unidad) T.push({ timeUnit: unidad, field: campo(X), as: X });
    if (agrega) {
        T.push({ aggregate: [{ op: 'sum', field: campo(valor), as: valor }], groupby: [X, ...(serie ? [serie] : [])].map(String) });
    }
    if (c.isCumulative && (tipo === 'line' || tipo === 'area')) {
        T.push({ window: [{ op: 'sum', field: campo(valor), as: valor }], sort: [{ field: campo(X) }], groupby: serie ? [serie] : [], frame: [null, 0] });
    }
    const esRanking = (tipo === 'bar' || tipo === 'donut' || tipo === 'pie' || tipo === 'funnel');
    if (esRanking && Number(c.limit) > 0 && c.sortMode !== 'natural') {
        const orden = c.sortMode === 'y-asc' ? [{ field: '__total', order: 'ascending' }]
            : c.sortMode === 'x-asc' ? [{ field: campo(X), order: 'ascending' }]
                : c.sortMode === 'x-desc' ? [{ field: campo(X), order: 'descending' }]
                    : [{ field: '__total', order: 'descending' }];
        T.push({ joinaggregate: [{ op: 'sum', field: campo(valor), as: '__total' }], groupby: [String(X)] });
        T.push({ window: [{ op: 'dense_rank', as: '__puesto' }], sort: orden });
        T.push({ filter: `datum.__puesto <= ${Number(c.limit)}` });
    }

    if (tipo === 'donut' || tipo === 'pie') return conCapas(base, T, anillo(c, { X, valor, colores, tipo }));
    if (tipo === 'funnel') return conCapas(base, T, embudo(c, { X, valor, colores }));
    if (tipo === 'heatmap') return mapaDeCalor(base, c, { X, Ys, colores, filas });

    // ── Ejes ──
    const cat = horizontal ? 'y' : 'x';
    const val = horizontal ? 'x' : 'y';
    const gridH = c.gridMode === 'both' || c.gridMode === 'horizontal';
    const gridV = c.gridMode === 'both' || c.gridMode === 'vertical';
    const tituloX = (tipo === 'scatter' || c.showXAxisTitle) ? (c.customAxisTitles?.x || X) : null;
    const tituloY = (tipo === 'scatter' || c.showYAxisTitle) ? (c.customAxisTitles?.y || Ys.join(', ')) : null;

    const ejeCat = {
        title: tituloX,
        grid: horizontal ? gridH : gridV,
        domain: !!c.showAxisLines,
        ...(c.xAxisLabelAngle ? { labelAngle: -Number(c.xAxisLabelAngle) } : {}),
        ...(c.axisLabelMaxChars > 0 ? { labelLimit: Math.round(c.axisLabelMaxChars * 6.5) } : {}),
    };
    const continuo = tipo === 'line' || tipo === 'area' || tipo === 'scatter';
    let encCat;
    if (xEsFecha) {
        encCat = continuo
            ? { field: campo(X), type: 'temporal', ...(unidad ? { timeUnit: unidad } : {}) }
            : { field: campo(X), type: 'ordinal', timeUnit: unidad || 'yearmonthdate' };
        if (!continuo || unidad) ejeCat.format = FORMATO_FECHA[unidad || 'yearmonthdate'];
    } else if (tipo === 'scatter' && xEsNumero) {
        encCat = { field: campo(X), type: 'quantitative' };
        Object.assign(ejeCat, formato(c));
    } else {
        encCat = { field: campo(X), type: xEsNumero ? 'ordinal' : 'nominal' };
    }
    encCat.axis = ejeCat;
    if (encCat.type !== 'temporal' && encCat.type !== 'quantitative') {
        encCat.sort = c.sortMode === 'x-asc' ? 'ascending'
            : c.sortMode === 'x-desc' ? 'descending'
                : c.sortMode === 'y-desc' ? { op: 'sum', field: campo(valor), order: 'descending' }
                    : c.sortMode === 'y-asc' ? { op: 'sum', field: campo(valor), order: 'ascending' }
                        : null;
    }

    const normalizado = tipo === 'bar' && apilado === 'expand';
    const escalaVal = {};
    if (c.yLogScale) escalaVal.type = 'log';
    const dom = c.yAxisDomain || ['auto', 'auto'];
    if (dom[0] !== 'auto' && dom[0] !== '' && dom[1] !== 'auto' && dom[1] !== '') escalaVal.domain = [Number(dom[0]), Number(dom[1])];
    if (tipo === 'scatter' || tipo === 'line') escalaVal.zero = false;
    const encVal = {
        field: campo(valor), type: 'quantitative',
        axis: { title: tituloY, grid: horizontal ? gridV : gridH, domain: !!c.showAxisLines, ...(normalizado ? { format: '.0%' } : formato(c)) },
        ...(Object.keys(escalaVal).length ? { scale: escalaVal } : {}),
    };

    // ── Color ──
    let encColor = null;
    const leg = leyenda(c);
    if (serie) {
        encColor = { field: campo(serie), type: 'nominal', scale: { domain: series, range: rangoDeSeries(series, c, colores) }, legend: leg };
    }

    const enc = { [cat]: encCat, [val]: encVal };
    if (encColor) enc.color = encColor;
    const tooltip = [
        { field: campo(X), type: encCat.type, ...(encCat.timeUnit ? { timeUnit: encCat.timeUnit } : {}), title: X },
        ...(serie ? [{ field: campo(serie), type: 'nominal', title: c.splitByKey || 'serie' }] : []),
        { field: campo(valor), type: 'quantitative', title: plegado ? 'valor' : valor, ...formato(c) },
    ];
    enc.tooltip = tooltip;

    const capas = [];
    const nPuntos = filas.length;

    // ━━━ Barras ━━━
    if (tipo === 'bar') {
        const mark = { type: 'bar', ...(c.barRadius ? { cornerRadiusEnd: Number(c.barRadius) } : {}) };
        const e = { ...enc };
        if (serie) {
            if (apilado === 'none') { e[horizontal ? 'yOffset' : 'xOffset'] = { field: campo(serie), scale: { domain: series } }; e[val] = { ...encVal, stack: null }; }
            else e[val] = { ...encVal, stack: apilado === 'expand' ? 'normalize' : 'zero' };
        } else {
            if (c.barColorMode === 'dimension') e.color = { field: campo(X), type: 'nominal', scale: { range: colores }, legend: null };
            else if (c.barColorMode === 'intensity') { mark.color = colorUnico; e.opacity = { field: campo(valor), type: 'quantitative', scale: { range: [0.35, 1] }, legend: null }; }
            else mark.color = colorUnico;
            e[val] = { ...encVal, ...(apilado === 'expand' ? { stack: 'normalize' } : {}) };
        }
        const resalte = condicionDeResalte(c, { X, valor });
        if (resalte) {
            T.push(...resalte.transform);
            e.color = { ...(e.color || {}), condition: { test: resalte.test, value: c.highlightConfig.color || '#ef4444' }, ...(e.color ? {} : { value: colorUnico }) };
        }
        capas.push({ mark, encoding: e });
        if (c.showLabels && apilado === 'none') {
            capas.push({
                mark: { type: 'text', fontSize: Number(c.dataLabelSize) || 11, ...(horizontal ? { align: 'left', dx: 4 } : { baseline: 'bottom', dy: -4 }) },
                encoding: { ...enc, ...(serie ? { [horizontal ? 'yOffset' : 'xOffset']: { field: campo(serie), scale: { domain: series } } } : {}), [val]: { ...encVal, stack: null }, text: { field: campo(valor), ...formato(c) }, color: undefined },
            });
        }
    }

    // ━━━ Línea y área ━━━
    if (tipo === 'line' || tipo === 'area') {
        const interpolate = c.lineType === 'step' ? 'step-after' : (c.lineType || 'monotone');
        const puntos = c.showDots && nPuntos <= MAX_PUNTOS * Math.max(1, series.length || 1);
        // Un área de UNA serie se ha dibujado siempre como línea con su degradado
        // debajo; apilar solo tiene sentido con varias.
        if (tipo === 'area' && serie) {
            capas.push({ mark: { type: 'area', interpolate, opacity: 0.85, ...(serie ? {} : { color: colorUnico }) }, encoding: { ...enc, [val]: { ...encVal, stack: 'zero' } } });
        } else {
            if (c.lineAreaFill || tipo === 'area') {
                const relleno = serie
                    ? { type: 'area', interpolate, opacity: 0.12 }
                    : {
                        type: 'area', interpolate,
                        // El degradado de siempre: del color arriba a transparente en la base.
                        color: c.fillStyle === 'solid' ? colorUnico : {
                            gradient: 'linear', x1: 1, y1: 1, x2: 1, y2: 0,
                            stops: [{ offset: 0, color: conAlfa(colorUnico, 0) }, { offset: 1, color: conAlfa(colorUnico, 0.38) }],
                        },
                        opacity: c.fillStyle === 'solid' ? 0.25 : 1,
                    };
                capas.push({ mark: relleno, encoding: { ...enc, [val]: { ...encVal, stack: null }, tooltip: undefined } });
            }
            capas.push({
                mark: { type: 'line', interpolate, strokeWidth: 2, ...(serie ? {} : { color: colorUnico }), ...(puntos ? { point: { filled: true, size: 28 } } : {}) },
                encoding: { ...enc, [val]: { ...encVal, stack: null } },
            });
        }
        const resalte = condicionDeResalte(c, { X, valor });
        if (resalte) {
            capas.push({
                transform: [...resalte.transform, { filter: resalte.test }],
                mark: { type: 'point', filled: true, size: 110, color: c.highlightConfig.color || '#ef4444', opacity: 1 },
                encoding: { [cat]: encCat, [val]: { ...encVal, stack: null } },
            });
        }
        if (c.showLabels) {
            capas.push({ mark: { type: 'text', fontSize: Number(c.dataLabelSize) || 11, baseline: 'bottom', dy: -6 }, encoding: { [cat]: encCat, [val]: { ...encVal, stack: null }, text: { field: campo(valor), ...formato(c) } } });
        }
    }

    // ━━━ Combo: barras + líneas ━━━
    if (tipo === 'combo') {
        const lineas = (c.comboLineKeys?.length ? c.comboLineKeys : Ys.slice(-1)).filter(k => Ys.includes(k));
        const barras = Ys.filter(k => !lineas.includes(k));
        const enLista = (lista) => `indexof(${JSON.stringify(lista)}, datum.serie) >= 0`;
        if (plegado) {
            capas.push({ transform: [{ filter: enLista(barras) }], mark: { type: 'bar', ...(c.barRadius ? { cornerRadiusEnd: Number(c.barRadius) } : {}) }, encoding: { ...enc, xOffset: { field: 'serie', scale: { domain: barras } }, [val]: { ...encVal, stack: null } } });
            capas.push({ transform: [{ filter: enLista(lineas) }], mark: { type: 'line', interpolate: c.lineType || 'monotone', strokeWidth: 2, point: { filled: true, size: 28 } }, encoding: { ...enc, [val]: { ...encVal, stack: null } } });
        } else {
            capas.push({ mark: { type: 'bar', color: colorUnico }, encoding: enc });
        }
    }

    // ━━━ Cascada ━━━
    if (tipo === 'waterfall') {
        T.push({ window: [{ op: 'sum', field: campo(valor), as: '__fin' }], ...(c.sortMode === 'x-asc' || c.sortMode === 'x-desc' ? { sort: [{ field: campo(X), order: c.sortMode === 'x-desc' ? 'descending' : 'ascending' }] } : {}), frame: [null, 0] });
        T.push({ calculate: `datum.__fin - ${dato(valor)}`, as: '__inicio' });
        const pos = colores[4] || '#34d399', neg = colores[1] || '#f87171';
        capas.push({
            mark: { type: 'bar', ...(c.barRadius ? { cornerRadius: Number(c.barRadius) } : {}) },
            encoding: {
                x: { ...encCat, sort: null }, y: { field: '__inicio', type: 'quantitative', axis: encVal.axis }, y2: { field: '__fin' },
                color: { condition: { test: `${dato(valor)} < 0`, value: neg }, value: pos }, tooltip,
            },
        });
        if (c.showLabels) capas.push({ mark: { type: 'text', baseline: 'bottom', dy: -4, fontSize: Number(c.dataLabelSize) || 11 }, encoding: { x: { ...encCat, sort: null }, y: { field: '__fin', type: 'quantitative' }, text: { field: campo(valor), ...formato(c) } } });
    }

    // ━━━ Dispersión y burbujas ━━━
    if (tipo === 'scatter') {
        const e = { ...enc, [val]: { ...encVal } };
        if (!serie) e.color = undefined;
        if ((burbuja || c.bubbleSizeKey) && c.bubbleSizeKey) e.size = { field: campo(c.bubbleSizeKey), type: 'quantitative', scale: { range: [60, 600] }, legend: null };
        capas.push({ mark: { type: 'circle', opacity: 0.85, size: 60, ...(serie ? {} : { color: colorUnico }) }, encoding: e });
        if (c.scatterQuadrants) {
            capas.push({ mark: { type: 'rule', strokeDash: [5, 5], color: '#888' }, encoding: { x: { aggregate: 'mean', field: campo(X), type: 'quantitative' } } });
            capas.push({ mark: { type: 'rule', strokeDash: [5, 5], color: '#888' }, encoding: { y: { aggregate: 'mean', field: campo(valor), type: 'quantitative' } } });
        }
    }

    // ━━━ Tendencia (una sola serie) ━━━
    const t = c.trendLine || {};
    if (t.type && t.type !== 'none' && !serie && ['bar', 'line', 'area', 'scatter'].includes(tipo)) {
        capas.push({
            transform: tendencia(t, { X, valor }),
            mark: { type: 'line', color: t.color || '#fbbf24', strokeWidth: 2, strokeDash: [6, 4] },
            encoding: { [cat]: encCat, [val]: { field: '__tendencia', type: 'quantitative' } },
        });
    }

    capas.push(...capasDeReferencia(c, { cat, val, encCat, horizontal }));

    return conCapas(base, T, capas);
}

function conCapas(base, transform, capas) {
    const spec = { ...base };
    if (transform.length) spec.transform = transform;
    const limpias = capas.map(limpiar);
    if (limpias.length === 1 && !limpias[0].data && !limpias[0].transform) Object.assign(spec, limpias[0]);
    else spec.layer = limpias;
    return spec;
}

/** Quita las claves `undefined` que dejan los `{...enc, color: undefined}`. */
function limpiar(o) {
    if (Array.isArray(o)) return o.map(limpiar);
    if (!o || typeof o !== 'object') return o;
    const r = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = limpiar(v);
    return r;
}

function condicionDeResalte(c, { X, valor }) {
    const h = c.highlightConfig || {};
    if (!h.type || h.type === 'none') return null;
    if (h.type === 'max') return { transform: [{ joinaggregate: [{ op: 'max', field: campo(valor), as: '__max' }] }], test: `${dato(valor)} === datum.__max` };
    if (h.type === 'min') return { transform: [{ joinaggregate: [{ op: 'min', field: campo(valor), as: '__min' }] }], test: `${dato(valor)} === datum.__min` };
    if (h.type === 'exact' && h.value !== '' && h.value != null) {
        const v = texto(h.value);
        return { transform: [], test: `(isDate(${dato(X)}) ? timeFormat(${dato(X)}, '%Y-%m-%d') : '' + ${dato(X)}) === ${v}` };
    }
    return null;
}

/**
 * La recta de tendencia sin depender del tipo del eje X. Una regresión de
 * Vega-Lite pierde la columna X cuando es texto; esto la calcula sobre la
 * posición (1, 2, 3…) y conserva X, así funciona igual en barras por categoría.
 */
function tendencia(t, { X, valor }) {
    const orden = [{ field: campo(X) }];
    if (t.type === 'moving-average') {
        const w = Math.max(2, Number(t.windowSize) || 3);
        return [{ window: [{ op: 'mean', field: campo(valor), as: '__tendencia' }], sort: orden, frame: [-(w - 1), 0] }];
    }
    return [
        { window: [{ op: 'row_number', as: '__i' }], sort: orden },
        { joinaggregate: [{ op: 'mean', field: '__i', as: '__mi' }, { op: 'mean', field: campo(valor), as: '__mv' }] },
        { calculate: `(datum.__i - datum.__mi) * (${dato(valor)} - datum.__mv)`, as: '__sxy' },
        { calculate: '(datum.__i - datum.__mi) * (datum.__i - datum.__mi)', as: '__sxx' },
        { joinaggregate: [{ op: 'sum', field: '__sxy', as: '__Sxy' }, { op: 'sum', field: '__sxx', as: '__Sxx' }] },
        { calculate: 'datum.__mv + (datum.__Sxx ? datum.__Sxy / datum.__Sxx : 0) * (datum.__i - datum.__mi)', as: '__tendencia' },
    ];
}

const trazo = (estilo) => (estilo === 'dashed' ? [6, 4] : estilo === 'dotted' ? [2, 3] : []);
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const valorDeEje = (v) => (num(v) !== null ? Number(v) : String(v));

/**
 * Meta, línea de referencia, banda y anotaciones. Cada una es una capa con su
 * propio dato de una fila: sin eso, una regla con solo `datum` se dibuja una vez
 * por cada fila del conjunto.
 */
function capasDeReferencia(c, { cat, val }) {
    const capas = [];
    const una = { values: [{}] };
    const regla = (valor, color, estilo, etiqueta, grosor = 1.5) => {
        capas.push({ data: una, mark: { type: 'rule', color, strokeWidth: grosor, strokeDash: trazo(estilo) }, encoding: { [val]: { datum: valor } } });
        if (etiqueta) capas.push({ data: una, mark: { type: 'text', color, align: 'right', baseline: 'bottom', dy: -3, fontWeight: 600, [cat === 'x' ? 'x' : 'y']: { expr: cat === 'x' ? 'width' : '0' } }, encoding: { [val]: { datum: valor }, text: { value: etiqueta } } });
    };
    if (num(c.refLine?.value) !== null) regla(num(c.refLine.value), c.refLine.color || '#ff4444', c.refLine.style || 'dashed', c.refLine.label);
    if (c.goalLine?.enabled && num(c.goalLine.value) !== null) regla(num(c.goalLine.value), c.goalLine.color || '#22c55e', c.goalLine.style || 'dashed', c.goalLine.label, 2);

    const a = c.refArea || {};
    const hayX = a.x1 !== '' && a.x1 != null && a.x2 !== '' && a.x2 != null;
    const hayY = num(a.y1) !== null && num(a.y2) !== null;
    if (hayX || hayY) {
        const enc = {};
        if (hayX) { enc[cat] = { datum: valorDeEje(a.x1) }; enc[`${cat}2`] = { datum: valorDeEje(a.x2) }; }
        if (hayY) { enc[val] = { datum: num(a.y1) }; enc[`${val}2`] = { datum: num(a.y2) }; }
        capas.push({ data: una, mark: { type: 'rect', color: a.color || '#ffffff', opacity: a.opacity || 0.1 }, encoding: enc });
    }

    for (const n of c.annotations || []) {
        if (n.x === '' || n.x == null) continue;
        const color = n.color || '#f59e0b';
        if (n.type === 'box') {
            const enc = { [cat]: { datum: valorDeEje(n.x) }, [`${cat}2`]: { datum: valorDeEje(n.x2 ?? n.x) } };
            if (num(n.y) !== null && num(n.y2) !== null) { enc[val] = { datum: num(n.y) }; enc[`${val}2`] = { datum: num(n.y2) }; }
            capas.push({ data: una, mark: { type: 'rect', color, opacity: 0.12, stroke: color, strokeOpacity: 0.5 }, encoding: enc });
            if (n.text) capas.push({ data: una, mark: { type: 'text', color, align: 'left', baseline: 'top', dx: 4, dy: 4, fontWeight: 600, [val === 'y' ? 'y' : 'x']: 0 }, encoding: { [cat]: { datum: valorDeEje(n.x) }, text: { value: n.text } } });
        } else if (num(n.y) !== null) {
            const enc = { [cat]: { datum: valorDeEje(n.x) }, [val]: { datum: num(n.y) } };
            capas.push({ data: una, mark: { type: 'point', filled: true, color, size: 50 }, encoding: enc });
            if (n.text) capas.push({ data: una, mark: { type: 'text', color, baseline: 'bottom', dy: -8, fontWeight: 600 }, encoding: { ...enc, text: { value: n.text } } });
        }
    }
    return capas;
}

function anillo(c, { X, valor, colores, tipo }) {
    const proporcion = tipo === 'pie' ? 0 : Math.min(0.85, Math.max(0.2, (Number(c.donutThickness) || 60) / 100));
    const radio = 'min(width, height) / 2 * 0.82';
    const leg = c.legendPosition === 'none' ? null : { orient: ['top', 'bottom', 'left', 'right'].includes(c.legendPosition) ? c.legendPosition : 'right', title: null };
    const theta = { field: campo(valor), type: 'quantitative', stack: true };
    const color = { field: campo(X), type: 'nominal', scale: { range: colores }, legend: leg, sort: { field: campo(valor), order: 'descending' } };
    const orden = { field: campo(valor), order: 'descending' };
    const capas = [{
        mark: { type: 'arc', outerRadius: { expr: radio }, ...(proporcion ? { innerRadius: { expr: `${radio} * ${proporcion}` } } : {}), stroke: null, padAngle: proporcion ? 0.01 : 0 },
        encoding: { theta, color, order: orden, tooltip: [{ field: campo(X), type: 'nominal' }, { field: campo(valor), type: 'quantitative', ...formato(c) }] },
    }];
    if (c.showLabels) {
        const contenido = {
            percent: 'format(datum.__pct, ".1%")', value: `${FORMATO_AMOX}(${dato(valor)}, ${texto(`${c.numberFormat}|${c.decimalPlaces}`)})`,
            name: dato(X), name_value: `${dato(X)} + ' ' + ${FORMATO_AMOX}(${dato(valor)}, ${texto(`${c.numberFormat}|${c.decimalPlaces}`)})`,
        }[c.donutLabelContent] || `${dato(X)} + ' ' + format(datum.__pct, '.1%')`;
        capas.push({
            transform: [{ joinaggregate: [{ op: 'sum', field: campo(valor), as: '__total' }] }, { calculate: `${dato(valor)} / datum.__total`, as: '__pct' }, { calculate: contenido, as: '__etiqueta' }],
            mark: { type: 'text', radius: { expr: c.donutLabelPosition === 'inside' ? `${radio} * ${(1 + proporcion) / 2}` : `${radio} + 16` }, fontSize: Number(c.dataLabelSize) || 11 },
            encoding: { theta, order: orden, text: { field: '__etiqueta' } },
        });
    }
    if (tipo === 'donut' && c.donutCenterKpi && c.donutCenterKpi !== 'none' && proporcion > 0.3) {
        capas.push({
            transform: [{ aggregate: [{ op: 'sum', field: campo(valor), as: '__total' }] }],
            mark: { type: 'text', fontSize: 22, fontWeight: 700, x: { expr: 'width / 2' }, y: { expr: 'height / 2' } },
            encoding: { text: { field: '__total', ...formato(c) } },
        });
    }
    return capas;
}

function embudo(c, { X, valor, colores }) {
    const orden = { field: campo(valor), order: 'descending' };
    const y = { field: campo(X), type: 'nominal', sort: orden, axis: { title: null, domain: false, ticks: false } };
    return [
        {
            transform: [{ calculate: `-${dato(valor)} / 2`, as: '__a' }, { calculate: `${dato(valor)} / 2`, as: '__b' }],
            mark: { type: 'bar', cornerRadius: 3 },
            encoding: {
                y, x: { field: '__a', type: 'quantitative', axis: null }, x2: { field: '__b' },
                color: { field: campo(X), type: 'nominal', scale: { range: colores }, legend: null, sort: orden },
                tooltip: [{ field: campo(X), type: 'nominal' }, { field: campo(valor), type: 'quantitative', ...formato(c) }],
            },
        },
        ...(c.showLabels ? [{ mark: { type: 'text', fontWeight: 600 }, encoding: { y, x: { datum: 0, type: 'quantitative' }, text: { field: campo(valor), ...formato(c) } } }] : []),
    ];
}

function mapaDeCalor(base, c, { X, Ys, colores, filas }) {
    let min = Infinity, max = -Infinity;
    for (const f of filas) for (const k of Ys) { const v = Number(f[k]); if (!isNaN(v)) { min = Math.min(min, v); max = Math.max(max, v); } }
    const divergente = min < 0 && max > 0;
    const extremo = colores[Math.min(colores.length - 1, 3)] || colores[0];
    const escala = divergente ? { domainMid: 0, range: [colores[0], '#f4f6f8', extremo] } : { range: [colores[0], extremo] };
    const enc = {
        x: { field: 'serie', type: 'nominal', sort: Ys, axis: { title: null, orient: 'top', labelAngle: 0, domain: false, ticks: false } },
        y: { field: campo(X), type: 'nominal', sort: null, axis: { title: null, domain: false, ticks: false } },
    };
    return {
        ...base,
        transform: [{ fold: Ys, as: ['serie', 'valor'] }],
        encoding: enc,
        layer: [
            { mark: { type: 'rect', cornerRadius: 2 }, encoding: { color: { field: 'valor', type: 'quantitative', scale: escala, legend: leyenda(c) ? { orient: 'top', direction: 'horizontal', title: null } : null }, tooltip: [{ field: campo(X), type: 'nominal' }, { field: 'serie', type: 'nominal' }, { field: 'valor', type: 'quantitative', ...formato(c) }] } },
            // El mapa de calor siempre lleva la cifra en la celda: sin ella el color no se lee.
            { mark: { type: 'text', fontSize: Number(c.dataLabelSize) || 11 }, encoding: { text: { field: 'valor', ...formato(c) } } },
        ],
    };
}

/** El mapa de rectángulos, en Vega: Vega-Lite no tiene diseño jerárquico. */
function treemapVega(c, colores) {
    const X = c.xAxisKey, Y = (c.yAxisKeys || [])[0];
    const spec = {
        $schema: ESQUEMA_VEGA,
        ...(c.chartTitle ? { title: { text: c.chartTitle, ...(c.chartSubtitle ? { subtitle: c.chartSubtitle } : {}) } } : {}),
        data: [
            { name: 'dataset' },
            {
                name: 'hojas', source: 'dataset',
                transform: [
                    { type: 'aggregate', groupby: [X], fields: [Y], ops: ['sum'], as: ['valor'] },
                    { type: 'formula', expr: `'' + ${dato(X)}`, as: 'id' },
                    { type: 'formula', expr: "'__raiz'", as: 'padre' },
                ],
            },
            { name: 'raiz', values: [{ id: '__raiz', padre: null }] },
            {
                name: 'arbol', source: ['raiz', 'hojas'],
                transform: [
                    { type: 'stratify', key: 'id', parentKey: 'padre' },
                    { type: 'treemap', field: 'valor', sort: { field: 'value', order: 'descending' }, round: true, method: 'squarify', size: [{ signal: 'width' }, { signal: 'height' }], paddingInner: 2 },
                    { type: 'filter', expr: "datum.id !== '__raiz'" },
                ],
            },
        ],
        scales: [{ name: 'color', type: 'ordinal', domain: { data: 'arbol', field: 'id' }, range: colores }],
        marks: [
            {
                type: 'rect', from: { data: 'arbol' },
                encode: {
                    enter: { fill: { scale: 'color', field: 'id' }, tooltip: { signal: `{'${X}': datum.id, '${Y}': ${FORMATO_AMOX}(datum.valor, ${texto(`${c.numberFormat}|${c.decimalPlaces}`)})}` }, cornerRadius: { value: 3 } },
                    update: { x: { field: 'x0' }, y: { field: 'y0' }, x2: { field: 'x1' }, y2: { field: 'y1' } },
                },
            },
            {
                type: 'text', from: { data: 'arbol' }, interactive: false,
                encode: {
                    enter: { fill: { value: '#ffffff' }, fontWeight: { value: 600 }, align: { value: 'left' }, baseline: { value: 'top' } },
                    update: {
                        x: { signal: 'datum.x0 + 6' }, y: { signal: 'datum.y0 + 6' },
                        text: { signal: `(datum.x1 - datum.x0) > 50 && (datum.y1 - datum.y0) > 18 ? datum.id : ''` },
                    },
                },
            },
        ],
    };
    return spec;
}
