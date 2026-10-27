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

/* Todo en UTC: una fecha «2023-01-01» se lee como medianoche UTC, y pintarla en
   hora local la mostraba como 31 de diciembre en América. */
const UNIDAD = { day: 'utcyearmonthdate', week: 'utcyearweek', month: 'utcyearmonth', quarter: 'utcyearquarter', year: 'utcyear' };
const FORMATO_FECHA = { utcyearmonthdate: '%d %b %Y', utcyearweek: '%d %b %Y', utcyearmonth: '%b %Y', utcyearquarter: 'Q%q %Y', utcyear: '%Y' };
const MAX_PUNTOS = 60;
const ZOOM = { name: 'zoom', select: 'interval', bind: 'scales' };
const ZOOM_X = { name: 'zoom', select: { type: 'interval', encodings: ['x'] }, bind: 'scales' };

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
    // Piruleta y mancuerna: categorías a la izquierda salvo que se pida en vertical.
    if (t === 'lollipop' || t === 'dumbbell') return { tipo: t, apilado: 'none', horizontal: c.orientation !== 'vertical' };
    return { tipo: t, apilado: 'none', horizontal: false };
}

/** Un color de la paleta con transparencia (los de la paleta son #rrggbb). */
function conAlfa(color, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(color || '');
    if (!m) return color;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** La interpolación de línea de Story Flow en Vega-Lite (las tres de escalón incluidas). */
export const INTERPOLACION = { monotone: 'monotone', linear: 'linear', step: 'step', stepBefore: 'step-before', stepAfter: 'step-after' };

/** Los nombres que el usuario dio a las series, como `labelExpr` de la leyenda. */
function etiquetasDeSeries(c, series) {
    const pares = (series || []).filter(s => c.seriesConfig?.[s]?.label && c.seriesConfig[s].label !== s);
    if (!pares.length) return null;
    return pares.reduceRight((resto, s) => `datum.label === ${JSON.stringify(String(s))} ? ${JSON.stringify(c.seriesConfig[s].label)} : ${resto}`, 'datum.label');
}

const formato = (c) => ({ format: `${c.numberFormat || 'compact'}|${c.decimalPlaces ?? -1}`, formatType: FORMATO_AMOX });

function leyenda(c, series) {
    const pos = c.legendPosition;
    if (!pos || pos === 'inline' || pos === 'none') return null;
    const expr = etiquetasDeSeries(c, series);
    return { orient: pos, title: null, ...(expr ? { labelExpr: expr } : {}) };
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
            // Una fecha con hora se queda en el día; cualquier otro texto, tal cual.
            if (v != null) vistas.add(/^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? String(v).slice(0, 10) : String(v));
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
    // Distribución e intervalos: leen las filas tal cual, sin la suma por X. El
    // histograma solo necesita la X.
    if (tipo === 'histogram' && X) return histograma(base, c, { X, colores });
    if (tipo === 'density' && X) return densidad(base, c, { X, colores });
    if (!X || !Ys.length) return conCapas(base, [], [{ rol: 'principal', mark: 'point' }]);
    if (tipo === 'boxplot') return caja(base, c, { X, Y: Ys[0], colores });
    if (tipo === 'strip') return franjas(base, c, { X, Y: Ys[0], colores });
    if (tipo === 'errorbar') return intervalo(base, c, { X, Y: Ys[0], colores });

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
    const faceta = c.facetKey && c.facetKey !== X && c.facetKey !== serie ? c.facetKey : null;
    // Columnas extra para el tooltip: en un gráfico que suma solo pueden viajar
    // las numéricas (se suman también); en uno de filas sueltas, todas.
    const extraTooltip = (Array.isArray(c.tooltipFields) ? c.tooltipFields : []).filter(k => k && k !== X && k !== valor && k !== serie);
    const esNum = (k) => { const v = muestra.find(f => f[k] != null)?.[k]; return typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v))); };
    const extraSumable = agrega ? extraTooltip.filter(esNum) : extraTooltip;
    const banda = (tipo === 'line' || tipo === 'area') && !serie && c.bandLowKey && c.bandHighKey ? [c.bandLowKey, c.bandHighKey] : [];
    if (agrega) {
        T.push({
            aggregate: [
                { op: 'sum', field: campo(valor), as: valor },
                ...[...extraSumable, ...banda].filter(k => k !== valor).map(k => ({ op: 'sum', field: campo(k), as: k })),
            ],
            groupby: [X, ...(serie ? [serie] : []), ...(faceta ? [faceta] : [])].map(String),
        });
    }
    if (c.isCumulative && (tipo === 'line' || tipo === 'area')) {
        T.push({ window: [{ op: 'sum', field: campo(valor), as: valor }], sort: [{ field: campo(X) }], groupby: serie ? [serie] : [], frame: [null, 0] });
    }
    const esRanking = (tipo === 'bar' || tipo === 'lollipop' || tipo === 'donut' || tipo === 'pie' || tipo === 'funnel');
    if (esRanking && Number(c.limit) > 0 && c.sortMode !== 'natural') {
        const orden = c.sortMode === 'y-asc' ? [{ field: '__total', order: 'ascending' }]
            : c.sortMode === 'x-asc' ? [{ field: campo(X), order: 'ascending' }]
                : c.sortMode === 'x-desc' ? [{ field: campo(X), order: 'descending' }]
                    : [{ field: '__total', order: 'descending' }];
        T.push({ joinaggregate: [{ op: 'sum', field: campo(valor), as: '__total' }], groupby: [String(X)] });
        T.push({ window: [{ op: 'dense_rank', as: '__puesto' }], sort: orden, ...(faceta ? { groupby: [faceta] } : {}) });
        T.push({ filter: `datum.__puesto <= ${Number(c.limit)}` });
    }

    const pctTooltip = c.tooltipShowPercent && c.tooltipMode !== 'rich' && agrega;
    if (pctTooltip) {
        T.push({ joinaggregate: [{ op: 'sum', field: campo(valor), as: '__suma' }], ...(faceta ? { groupby: [faceta] } : {}) }, { calculate: `${dato(valor)} / datum.__suma`, as: '__pct' });
    }
    const deltaTooltip = c.tooltipMode === 'rich' && agrega && tipo !== 'donut' && tipo !== 'pie';
    if (deltaTooltip) {
        T.push(
            { window: [{ op: 'lag', field: campo(valor), as: '__previo' }], sort: [{ field: campo(X) }], groupby: [serie, faceta].filter(Boolean) },
            { calculate: `datum.__previo ? (${dato(valor)} - datum.__previo) / abs(datum.__previo) : null`, as: '__delta' },
        );
    }

    if ((tipo === 'donut' || tipo === 'pie') && Number(c.donutGroupingThreshold) > 0) {
        T.push(
            { joinaggregate: [{ op: 'sum', field: campo(valor), as: '__total' }] },
            { calculate: `${dato(valor)} / datum.__total * 100 < ${Number(c.donutGroupingThreshold)} ? 'Others' : ${dato(X)}`, as: X },
            { aggregate: [{ op: 'sum', field: campo(valor), as: valor }], groupby: [String(X)] },
        );
    }
    if (tipo === 'bump') T.push({ window: [{ op: 'rank', as: '__puesto' }], sort: [{ field: campo(valor), order: 'descending' }], groupby: [String(X)] });
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
            ? { field: campo(X), type: 'temporal', ...(unidad ? { timeUnit: unidad } : { scale: { type: 'utc' } }) }
            : { field: campo(X), type: 'ordinal', timeUnit: unidad || 'utcyearmonthdate' };
        if (!continuo || unidad) ejeCat.format = FORMATO_FECHA[unidad || 'utcyearmonthdate'];
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
    const tipoEscala = c.yScaleType && c.yScaleType !== 'linear' ? c.yScaleType : (c.yLogScale ? 'log' : null);
    if (tipoEscala) escalaVal.type = tipoEscala;
    const dom = c.yAxisDomain || ['auto', 'auto'];
    if (dom[0] !== 'auto' && dom[0] !== '' && dom[1] !== 'auto' && dom[1] !== '') escalaVal.domain = [Number(dom[0]), Number(dom[1])];
    if (tipo === 'scatter' || tipo === 'line' || tipo === 'dumbbell') escalaVal.zero = false;
    if (c.zeroBaseline === 'on') escalaVal.zero = true;
    else if (c.zeroBaseline === 'off') escalaVal.zero = false;
    const encVal = {
        field: campo(valor), type: 'quantitative',
        axis: { title: tituloY, grid: horizontal ? gridV : gridH, domain: !!c.showAxisLines, ...(normalizado ? { format: '.0%' } : formato(c)) },
        ...(Object.keys(escalaVal).length ? { scale: escalaVal } : {}),
    };

    // ── Color ──
    let encColor = null;
    const leg = leyenda(c);
    if (serie) {
        encColor = { field: campo(serie), type: 'nominal', scale: { domain: series, range: rangoDeSeries(series, c, colores) }, legend: leyenda(c, series) };
    }
    // Leyenda interactiva: clic en una serie para resaltarla (solo con la
    // leyenda de la figura; la tejida en el subtítulo es HTML de la tarjeta).
    const leyendaViva = !!(c.interactiveLegend && serie && encColor?.legend);
    const SELECCION = { name: 'serie_elegida', select: { type: 'point', fields: [String(serie)] }, bind: 'legend' };

    const enc = { [cat]: encCat, [val]: encVal };
    if (encColor) enc.color = encColor;
    const tooltip = [
        { field: campo(X), type: encCat.type, ...(encCat.timeUnit ? { timeUnit: encCat.timeUnit } : {}), title: X },
        ...(serie ? [{ field: campo(serie), type: 'nominal', title: c.splitByKey || 'serie' }] : []),
        { field: campo(valor), type: 'quantitative', title: plegado ? 'valor' : valor, ...formato(c) },
        ...(pctTooltip ? [{ field: '__pct', type: 'quantitative', title: '% of total', format: '.1%' }] : []),
        ...(deltaTooltip ? [{ field: '__delta', type: 'quantitative', title: 'vs previous', format: '+.1%' }] : []),
        ...extraSumable.map(k => ({ field: campo(k), title: k, ...(esNum(k) ? { type: 'quantitative', ...formato(c) } : { type: 'nominal' }) })),
    ];
    enc.tooltip = tooltip;
    // El eje derecho: una de las Y con su propia escala (líneas, áreas, columnas, combo).
    const derecha = plegado && !horizontal && c.rightYAxisKey && Ys.includes(c.rightYAxisKey)
        && ['line', 'area', 'bar', 'combo'].includes(tipo) && apilado === 'none' ? c.rightYAxisKey : null;
    const seriesOffset = derecha ? series.filter(x => x !== derecha) : series;

    const capas = [];
    const nPuntos = filas.length;

    // ━━━ Barras ━━━
    if (tipo === 'bar') {
        const mark = { type: 'bar', ...(c.barRadius ? { cornerRadiusEnd: Number(c.barRadius) } : {}) };
        const e = { ...enc };
        if (serie) {
            if (apilado === 'none') { e[horizontal ? 'yOffset' : 'xOffset'] = { field: campo(serie), scale: { domain: seriesOffset } }; e[val] = { ...encVal, stack: null }; }
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
        capas.push({ rol: 'principal', mark, encoding: e });
        if (c.showLabels && apilado === 'none') {
            // Fuera, al final de la barra (por defecto), o dentro de ella en blanco.
            const dentro = String(c.dataLabelPosition || '').startsWith('inside');
            const pos = horizontal
                ? (dentro ? { align: 'right', dx: -6, color: '#ffffff' } : { align: 'left', dx: 4 })
                : (dentro ? { baseline: 'top', dy: 6, color: '#ffffff' } : { baseline: 'bottom', dy: -4 });
            capas.push({
                rol: 'etiquetas',
                mark: { type: 'text', fontSize: Number(c.dataLabelSize) || 11, ...pos },
                encoding: { ...enc, ...(serie ? { [horizontal ? 'yOffset' : 'xOffset']: { field: campo(serie), scale: { domain: seriesOffset } } } : {}), [val]: { ...encVal, stack: null }, text: { field: campo(valor), ...formato(c) }, color: undefined },
            });
        }
    }

    // ━━━ Línea y área ━━━
    if (tipo === 'line' || tipo === 'area') {
        const interpolate = INTERPOLACION[c.lineType] || 'monotone';
        const puntos = c.showDots && nPuntos <= MAX_PUNTOS * Math.max(1, series.length || 1);
        // Un área de UNA serie se ha dibujado siempre como línea con su degradado
        // debajo; apilar solo tiene sentido con varias.
        if (tipo === 'area' && serie) {
            capas.push({ rol: 'principal', mark: { type: 'area', interpolate, opacity: 0.85, ...(serie ? {} : { color: colorUnico }) }, encoding: { ...enc, [val]: { ...encVal, stack: 'zero' } } });
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
                capas.push({ rol: 'relleno', mark: relleno, encoding: { ...enc, [val]: { ...encVal, stack: null }, tooltip: undefined } });
            }
            // El trazo de cada serie (Style → Series): continuo, discontinuo, punteado.
            const trazos = serie && series.some(x => c.seriesConfig?.[x]?.style && c.seriesConfig[x].style !== 'solid')
                ? { strokeDash: { field: campo(serie), type: 'nominal', scale: { domain: series, range: series.map(x => trazo(c.seriesConfig?.[x]?.style || 'solid')) }, legend: null } }
                : {};
            capas.push({
                rol: 'principal',
                mark: { type: 'line', interpolate, strokeWidth: 2, ...(serie ? {} : { color: colorUnico }), ...(puntos ? { point: { filled: true, size: 28 } } : {}) },
                encoding: { ...enc, [val]: { ...encVal, stack: null }, ...trazos },
            });
        }
        const resalte = condicionDeResalte(c, { X, valor });
        if (resalte?.tramo) {
            // Un tramo se resalta como LÍNEA encima, no como puntos sueltos.
            capas.push({
                rol: 'resalte',
                transform: [{ filter: resalte.test }],
                mark: { type: 'line', interpolate, strokeWidth: 3, color: c.highlightConfig.color || '#ef4444' },
                encoding: { [cat]: encCat, [val]: { ...encVal, stack: null }, ...(serie ? { detail: { field: campo(serie) } } : {}) },
            });
        } else if (resalte) {
            capas.push({
                rol: 'resalte',
                transform: [...resalte.transform, { filter: resalte.test }],
                mark: { type: 'point', filled: true, size: 110, color: c.highlightConfig.color || '#ef4444', opacity: 1 },
                encoding: { [cat]: encCat, [val]: { ...encVal, stack: null } },
            });
        }
        if (c.showLabels) {
            capas.push({ rol: 'etiquetas', mark: { type: 'text', fontSize: Number(c.dataLabelSize) || 11, baseline: 'bottom', dy: -6 }, encoding: { [cat]: encCat, [val]: { ...encVal, stack: null }, text: { field: campo(valor), ...formato(c) } } });
        }
    }

    // ━━━ Pendiente: de un momento a otro, una línea por categoría ━━━
    if (tipo === 'slope') {
        const e = { ...enc, [cat]: { ...encCat, axis: { ...ejeCat, grid: false, orient: 'top', title: null } }, [val]: { ...encVal, axis: null, stack: null } };
        capas.push({ rol: 'principal', mark: { type: 'line', strokeWidth: 2.5, point: { filled: true, size: 55 }, ...(serie ? {} : { color: colorUnico }) }, encoding: e });
        const etiqueta = `${serie ? `${dato(serie)} + '  ' + ` : ''}${FORMATO_AMOX}(${dato(valor)}, ${texto(`${c.numberFormat}|${c.decimalPlaces}`)})`;
        const extremo = (cual, align, dx) => ({
            rol: cual === 'min' ? 'extremo_inicio' : 'extremo_fin',
            transform: [{ joinaggregate: [{ op: cual, field: campo(X), as: '__extremo' }] }, { filter: `${dato(X)} === datum.__extremo` }, { calculate: etiqueta, as: '__etiqueta' }],
            mark: { type: 'text', align, dx, fontSize: Number(c.dataLabelSize) || 11 },
            encoding: { [cat]: encCat, [val]: { ...encVal, stack: null }, text: { field: '__etiqueta' }, ...(serie ? { color: encColor } : {}) },
        });
        capas.push(extremo('min', 'right', -8), extremo('max', 'left', 8));
    }

    // ━━━ Combo: barras + líneas ━━━
    if (tipo === 'combo') {
        const lineas = (c.comboLineKeys?.length ? c.comboLineKeys : Ys.slice(-1)).filter(k => Ys.includes(k));
        const barras = Ys.filter(k => !lineas.includes(k));
        const enLista = (lista) => `indexof(${JSON.stringify(lista)}, datum.serie) >= 0`;
        if (plegado) {
            capas.push({ rol: 'principal', transform: [{ filter: enLista(barras) }], mark: { type: 'bar', ...(c.barRadius ? { cornerRadiusEnd: Number(c.barRadius) } : {}) }, encoding: { ...enc, xOffset: { field: 'serie', scale: { domain: barras } }, [val]: { ...encVal, stack: null } } });
            capas.push({ rol: 'lineas', transform: [{ filter: enLista(lineas) }], mark: { type: 'line', interpolate: INTERPOLACION[c.lineType] || 'monotone', strokeWidth: 2, point: { filled: true, size: 28 } }, encoding: { ...enc, [val]: { ...encVal, stack: null } } });
        } else {
            capas.push({ rol: 'principal', mark: { type: 'bar', color: colorUnico }, encoding: enc });
        }
    }

    // ━━━ Cascada ━━━
    if (tipo === 'waterfall') {
        T.push({ window: [{ op: 'sum', field: campo(valor), as: '__fin' }], ...(c.sortMode === 'x-asc' || c.sortMode === 'x-desc' ? { sort: [{ field: campo(X), order: c.sortMode === 'x-desc' ? 'descending' : 'ascending' }] } : {}), frame: [null, 0] });
        T.push({ calculate: `datum.__fin - ${dato(valor)}`, as: '__inicio' });
        const pos = colores[4] || '#34d399', neg = colores[1] || '#f87171';
        capas.push({
            rol: 'principal',
            mark: { type: 'bar', ...(c.barRadius ? { cornerRadius: Number(c.barRadius) } : {}) },
            encoding: {
                x: { ...encCat, sort: null }, y: { field: '__inicio', type: 'quantitative', axis: encVal.axis }, y2: { field: '__fin' },
                color: { condition: { test: `${dato(valor)} < 0`, value: neg }, value: pos }, tooltip,
            },
        });
        if (c.showLabels) capas.push({ rol: 'etiquetas', mark: { type: 'text', baseline: 'bottom', dy: -4, fontSize: Number(c.dataLabelSize) || 11 }, encoding: { x: { ...encCat, sort: null }, y: { field: '__fin', type: 'quantitative' }, text: { field: campo(valor), ...formato(c) } } });
    }

    // ━━━ Dispersión y burbujas ━━━
    if (tipo === 'scatter') {
        const e = { ...enc, [val]: { ...encVal } };
        if (!serie) e.color = undefined;
        if ((burbuja || c.bubbleSizeKey) && c.bubbleSizeKey) e.size = { field: campo(c.bubbleSizeKey), type: 'quantitative', scale: { range: [60, 600] }, legend: null };
        // Rueda para acercar, arrastrar para moverse; doble clic vuelve (5.18).
        capas.push({ rol: 'principal', mark: { type: 'circle', opacity: 0.85, size: 60, ...(serie ? {} : { color: colorUnico }) }, encoding: e });
        if (c.scatterQuadrants) {
            capas.push({ rol: 'cuadrante_x', mark: { type: 'rule', strokeDash: [5, 5], color: '#888' }, encoding: { x: { aggregate: 'mean', field: campo(X), type: 'quantitative' } } });
            capas.push({ rol: 'cuadrante_y', mark: { type: 'rule', strokeDash: [5, 5], color: '#888' }, encoding: { y: { aggregate: 'mean', field: campo(valor), type: 'quantitative' } } });
        }
    }

    // ━━━ Piruleta: un ranking con menos tinta que la barra ━━━
    if (tipo === 'lollipop') {
        const resalte = condicionDeResalte(c, { X, valor });
        if (resalte) T.push(...resalte.transform);
        const color = resalte ? { condition: { test: resalte.test, value: c.highlightConfig.color || '#ef4444' }, value: colorUnico } : { value: colorUnico };
        capas.push({ rol: 'principal', mark: { type: 'rule', strokeWidth: 2 }, encoding: { [cat]: encCat, [val]: encVal, [`${val}2`]: { datum: 0 }, color } });
        capas.push({ rol: 'puntos', mark: { type: 'circle', size: 140, opacity: 1 }, encoding: { [cat]: encCat, [val]: { ...encVal, axis: undefined }, color, tooltip } });
        if (c.showLabels) capas.push({ rol: 'etiquetas', mark: { type: 'text', fontSize: Number(c.dataLabelSize) || 11, ...(horizontal ? { align: 'left', dx: 10 } : { baseline: 'bottom', dy: -10 }) }, encoding: { [cat]: encCat, [val]: encVal, text: { field: campo(valor), ...formato(c) } } });
    }

    // ━━━ Mancuerna: dos valores por categoría, unidos ━━━
    if (tipo === 'dumbbell' && plegado) {
        const [a, b] = Ys;
        capas.push({
            rol: 'principal',
            transform: [{ pivot: 'serie', value: 'valor', groupby: [String(X)] }],
            mark: { type: 'rule', strokeWidth: 3, color: '#9aa0aa', opacity: 0.6 },
            encoding: { [cat]: encCat, [val]: { field: campo(a), type: 'quantitative', axis: encVal.axis, scale: encVal.scale }, [`${val}2`]: { field: campo(b) } },
        });
        capas.push({ rol: 'puntos', mark: { type: 'circle', size: 150, opacity: 1 }, encoding: { [cat]: encCat, [val]: { ...encVal, axis: undefined }, color: encColor, tooltip } });
        if (c.showLabels) capas.push({ rol: 'etiquetas', mark: { type: 'text', fontSize: Number(c.dataLabelSize) || 11, baseline: 'bottom', dy: -10 }, encoding: { [cat]: encCat, [val]: encVal, text: { field: 'valor', ...formato(c) }, color: encColor } });
    }

    // ━━━ Bump: el puesto de cada categoría, momento a momento ━━━
    if (tipo === 'bump') {
        const puesto = { field: '__puesto', type: 'ordinal', axis: { title: tituloY ? 'Rank' : null, grid: false } };
        capas.push({
            rol: 'principal',
            mark: { type: 'line', interpolate: 'monotone', strokeWidth: 3, point: { filled: true, size: 70 }, ...(serie ? {} : { color: colorUnico }) },
            encoding: { [cat]: encCat, [val]: puesto, ...(encColor ? { color: encColor } : {}), tooltip: [...tooltip, { field: '__puesto', type: 'ordinal', title: 'Rank' }] },
        });
    }

    // ━━━ Tendencia (una sola serie) ━━━
    const t = c.trendLine || {};
    const ejeContinuo = encCat.type === 'quantitative' || encCat.type === 'temporal';
    if (t.type && t.type !== 'none' && !serie && ejeContinuo && (t.type === 'linear' || t.type === 'loess')) {
        // Regresión sobre el valor de X (dispersión, series de fechas): la recta de verdad.
        capas.push({
            rol: 'tendencia',
            transform: [{ [t.type === 'loess' ? 'loess' : 'regression']: campo(valor), on: campo(X) }],
            mark: { type: 'line', color: t.color || '#fbbf24', strokeWidth: 2, ...(tipo === 'scatter' ? {} : { strokeDash: [6, 4] }) },
            encoding: { [cat]: { field: campo(X), type: encCat.type }, [val]: { field: campo(valor), type: 'quantitative' } },
        });
    } else if (t.type && t.type !== 'none' && !serie && ['bar', 'line', 'area', 'scatter'].includes(tipo)) {
        capas.push({
            rol: 'tendencia',
            transform: tendencia(t, { X, valor }),
            mark: { type: 'line', color: t.color || '#fbbf24', strokeWidth: 2, strokeDash: [6, 4] },
            encoding: { [cat]: encCat, [val]: { field: '__tendencia', type: 'quantitative' } },
        });
    }

    // Banda de un intervalo bajo la línea (confianza, mínimo–máximo).
    if (banda.length) {
        capas.unshift({ rol: 'banda_error', mark: { type: 'errorband', opacity: 0.25, color: colorUnico, borders: false }, encoding: { [cat]: encCat, [val]: { field: campo(banda[0]), type: 'quantitative' }, [`${val}2`]: { field: campo(banda[1]) } } });
    }

    // Etiquetas al final de cada línea: el nombre de la serie (o el valor) junto
    // al último punto. Con ellas la leyenda sobra.
    if (c.endLabels && ['line', 'area', 'bump'].includes(tipo)) {
        const fin = serie ? `${dato(serie)} + '  ' + ${FORMATO_AMOX}(${dato(valor)}, ${texto(`${c.numberFormat}|${c.decimalPlaces}`)})` : `${FORMATO_AMOX}(${dato(valor)}, ${texto(`${c.numberFormat}|${c.decimalPlaces}`)})`;
        capas.push({
            rol: 'etiquetas_fin',
            transform: [{ window: [{ op: 'row_number', as: '__ultimo' }], sort: [{ field: campo(X), order: 'descending' }], groupby: serie ? [serie] : [] }, { filter: 'datum.__ultimo === 1' }, { calculate: fin, as: '__etiqueta_fin' }],
            mark: { type: 'text', align: 'left', dx: 8, fontWeight: 600, fontSize: Number(c.dataLabelSize) || 11 },
            encoding: { [cat]: encCat, [val]: tipo === 'bump' ? { field: '__puesto', type: 'ordinal' } : { ...encVal, stack: null }, text: { field: '__etiqueta_fin' }, ...(encColor ? { color: encColor } : {}) },
        });
    }

    // Eje derecho: la serie elegida sale de las demás capas y va en la suya.
    if (derecha) {
        for (const capa of capas) {
            if (capa.encoding?.[val]?.field === 'valor') capa.transform = [{ filter: `datum.serie !== ${texto(derecha)}` }, ...(capa.transform || [])];
        }
        const domD = c.rightYAxisDomain || ['auto', 'auto'];
        const conDominio = domD[0] !== 'auto' && domD[0] !== '' && domD[1] !== 'auto' && domD[1] !== '';
        capas.push({
            rol: 'secundaria',
            transform: [{ filter: `datum.serie === ${texto(derecha)}` }],
            mark: { type: 'line', interpolate: INTERPOLACION[c.lineType] || 'monotone', strokeWidth: 2, point: { filled: true, size: 28 } },
            encoding: {
                [cat]: encCat,
                [val]: { field: 'valor', type: 'quantitative', axis: { orient: 'right', title: c.seriesConfig?.[derecha]?.label || derecha, grid: false, domain: !!c.showAxisLines, ...formato(c) }, ...(conDominio ? { scale: { domain: [Number(domD[0]), Number(domD[1])], zero: false } } : { scale: { zero: false } }) },
                color: encColor, tooltip,
            },
        });
    }

    const principal = capas.find(x => x.rol === 'principal');
    if (principal) {
        const params = [];
        if (leyendaViva) {
            params.push(SELECCION);
            principal.encoding = { ...principal.encoding, opacity: { condition: { param: 'serie_elegida', value: 1 }, value: 0.15 } };
        }
        // Zoom: rueda y arrastre. «auto» = en dispersión y series de fechas largas.
        const zoomAuto = tipo === 'scatter' || (continuo && encCat.type === 'temporal' && nPuntos > MAX_PUNTOS);
        const zoom = c.zoomMode === 'on' ? (ejeContinuoDe(encCat) || tipo === 'scatter') : c.zoomMode === 'off' ? false : zoomAuto;
        principal.params = (principal.params || []).filter(p0 => p0.name !== 'zoom');
        if (zoom) params.push(tipo === 'scatter' ? ZOOM : ZOOM_X);
        if (params.length || principal.params.length) principal.params = [...principal.params, ...params];
        else delete principal.params;
    }

    capas.push(...capasDeReferencia(c, { cat, val, encCat, horizontal, valor, faceta }));

    const spec = conCapas(base, T, capas);
    if (derecha) spec.resolve = { scale: { [val]: 'independent' } };
    return faceta ? enFacetas(spec, c, faceta) : spec;
}

const ejeContinuoDe = (enc) => enc?.type === 'quantitative' || enc?.type === 'temporal';

/**
 * Pequeños múltiplos: la misma figura repetida por cada valor de una columna.
 * Las capas con datos propios (una regla en un valor fijo) no caben dentro de una
 * faceta y se quedan fuera: la meta y la banda solo aplican sin facetas.
 */
function enFacetas(spec, c, faceta) {
    const { $schema, title, data, transform, layer, resolve } = spec;
    const capas = layer.filter(l => !l.data);
    return {
        $schema, ...(title ? { title } : {}), data, ...(transform ? { transform } : {}),
        facet: { field: campo(faceta), type: 'nominal', header: { title: null, labelFontWeight: 600 } },
        columns: Math.max(1, Number(c.facetColumns) || 3),
        spec: { layer: capas, ...(resolve ? { resolve } : {}) },
        resolve: { axis: { x: 'independent', y: 'independent' } },
    };
}

/**
 * La figura SIEMPRE en capas, y cada capa con nombre (`amox_<papel>`). Es lo que
 * permite comparar el código del usuario con lo que generan los paneles capa a
 * capa (vega/codigo.js): sin nombre no se sabría qué capa es la meta.
 */
export const PREFIJO_CAPA = 'amox_';
function conCapas(base, transform, capas) {
    const spec = { ...base };
    if (transform.length) spec.transform = transform;
    const usados = new Set();
    const hayPrincipal = capas.some(c => c.rol === 'principal');
    spec.layer = capas.map((capa, i) => {
        const { rol, ...resto } = capa;
        // Los ejes los configura SOLO la capa principal: las demás (relleno,
        // etiquetas, resalte…) comparten escala, y repetir el eje en cada una hacía
        // que cambiar un título en el código pareciera tocar varias capas.
        // Lo mismo con la escala. La excepción es el eje derecho, que tiene los suyos.
        if (hayPrincipal && rol !== 'principal' && rol !== 'secundaria' && resto.encoding) {
            const enc = { ...resto.encoding };
            for (const k of ['x', 'y']) {
                if (enc[k] && typeof enc[k] === 'object') { const { axis, scale, ...e } = enc[k]; enc[k] = e; }
            }
            resto.encoding = enc;
        }
        let nombre = `${PREFIJO_CAPA}${rol || `capa_${i + 1}`}`;
        for (let n = 2; usados.has(nombre); n++) nombre = `${PREFIJO_CAPA}${rol || 'capa'}_${n}`;
        usados.add(nombre);
        return limpiar({ name: nombre, ...resto });
    });
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
    if ((h.type === 'below' || h.type === 'above') && num(h.value) !== null) {
        return { transform: [], test: `${dato(valor)} ${h.type === 'below' ? '<' : '>'} ${num(h.value)}` };
    }
    if (h.type === 'range' && h.value !== '' && h.value != null) {
        const hasta = h.value2 !== '' && h.value2 != null ? h.value2 : h.value;
        const esFecha = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v));
        if (esFecha(h.value)) {
            const t = (v) => `time(toDate(${texto(String(v).slice(0, 10))}))`;
            return { transform: [], test: `time(toDate(${dato(X)})) >= ${t(h.value)} && time(toDate(${dato(X)})) <= ${t(hasta)}`, tramo: true };
        }
        const lado = (v) => (num(v) !== null ? String(num(v)) : texto(v));
        return { transform: [], test: `${dato(X)} >= ${lado(h.value)} && ${dato(X)} <= ${lado(hasta)}`, tramo: true };
    }
    if (h.type === 'exact' && h.value !== '' && h.value != null) {
        const v = texto(h.value);
        return { transform: [], test: `(isDate(${dato(X)}) ? utcFormat(${dato(X)}, '%Y-%m-%d') : '' + ${dato(X)}) === ${v}` };
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
const ESTADISTICOS = { mean: 'mean', media: 'mean', average: 'mean', median: 'median', mediana: 'median' };
/** «mean» o «median» en lugar de un número: la línea se calcula sobre los datos. */
const estadistico = (v) => ESTADISTICOS[String(v ?? '').trim().toLowerCase()] || null;

function capasDeReferencia(c, { cat, val, valor, faceta, encCat }) {
    const capas = [];
    const una = { values: [{}] };
    const regla = (rol, v, color, estilo, etiqueta, grosor = 1.5) => {
        const op = estadistico(v);
        // Con un estadístico la regla lee los datos de la figura (ya agregados por
        // X): la media de las barras, no la de las filas sueltas.
        const pos = op ? { aggregate: op, field: campo(valor), type: 'quantitative' } : { datum: num(v) };
        const desde = op ? {} : { data: una };
        capas.push({ rol, ...desde, mark: { type: 'rule', color, strokeWidth: grosor, strokeDash: trazo(estilo) }, encoding: { [val]: pos } });
        if (etiqueta) capas.push({ rol: `${rol}_etiqueta`, ...desde, mark: { type: 'text', color, align: 'right', baseline: 'bottom', dy: -3, fontWeight: 600, [cat === 'x' ? 'x' : 'y']: { expr: cat === 'x' ? 'width' : '0' } }, encoding: { [val]: pos, text: { value: etiqueta } } });
    };
    const vale = (v) => num(v) !== null || estadistico(v);
    if (vale(c.refLine?.value)) regla('referencia', c.refLine.value, c.refLine.color || '#ff4444', c.refLine.style || 'dashed', c.refLine.label);
    if (c.goalLine?.enabled && vale(c.goalLine.value)) regla('meta', c.goalLine.value, c.goalLine.color || '#22c55e', c.goalLine.style || 'dashed', c.goalLine.label, 2);

    const a = c.refArea || {};
    const hayX = a.x1 !== '' && a.x1 != null && a.x2 !== '' && a.x2 != null;
    const hayY = num(a.y1) !== null && num(a.y2) !== null;
    if (hayX || hayY) {
        const enc = {};
        if (hayX) { enc[cat] = { datum: valorDeEje(a.x1) }; enc[`${cat}2`] = { datum: valorDeEje(a.x2) }; }
        if (hayY) { enc[val] = { datum: num(a.y1) }; enc[`${val}2`] = { datum: num(a.y2) }; }
        capas.push({ rol: 'banda', data: una, mark: { type: 'rect', color: a.color || '#ffffff', opacity: a.opacity || 0.1 }, encoding: enc });
    }

    for (const [i, n] of (c.annotations || []).entries()) {
        if (n.x === '' || n.x == null) continue;
        const rol = `anotacion_${i + 1}`;
        const color = n.color || '#f59e0b';
        if (n.type === 'box') {
            const enc = { [cat]: { datum: valorDeEje(n.x) }, [`${cat}2`]: { datum: valorDeEje(n.x2 ?? n.x) } };
            if (num(n.y) !== null && num(n.y2) !== null) { enc[val] = { datum: num(n.y) }; enc[`${val}2`] = { datum: num(n.y2) }; }
            capas.push({ rol, data: una, mark: { type: 'rect', color, opacity: 0.12, stroke: color, strokeOpacity: 0.5 }, encoding: enc });
            if (n.text) capas.push({ rol: `${rol}_texto`, data: una, mark: { type: 'text', color, align: 'left', baseline: 'top', dx: 4, dy: 4, fontWeight: 600, [val === 'y' ? 'y' : 'x']: 0 }, encoding: { [cat]: { datum: valorDeEje(n.x) }, text: { value: n.text } } });
        } else if (num(n.y) === null && valor && !faceta) {
            // Sin Y: la marca va sobre el dato de esa X, leído de la figura.
            // Una fecha se compara por su comienzo: «2024-03» acierta en el 1 de marzo.
            const x = dato(c.xAxisKey);
            const test = `isDate(${x}) ? indexof(utcFormat(${x}, '%Y-%m-%d'), ${texto(n.x)}) === 0 : '' + ${x} === ${texto(n.x)}`;
            const { axis, ...ejeSinTitulo } = encCat || { field: campo(c.xAxisKey), type: 'nominal' };
            const enc = { [cat]: ejeSinTitulo, [val]: { field: campo(valor), type: 'quantitative' } };
            capas.push({ rol, transform: [{ filter: test }], mark: { type: 'point', filled: true, color, size: 60 }, encoding: enc });
            if (n.text) capas.push({ rol: `${rol}_texto`, transform: [{ filter: test }], mark: { type: 'text', color, baseline: 'bottom', dy: -9, fontWeight: 600 }, encoding: { ...enc, text: { value: n.text } } });
        } else if (num(n.y) !== null) {
            const enc = { [cat]: { datum: valorDeEje(n.x) }, [val]: { datum: num(n.y) } };
            capas.push({ rol, data: una, mark: { type: 'point', filled: true, color, size: 50 }, encoding: enc });
            if (n.text) capas.push({ rol: `${rol}_texto`, data: una, mark: { type: 'text', color, baseline: 'bottom', dy: -8, fontWeight: 600 }, encoding: { ...enc, text: { value: n.text } } });
        }
    }
    return capas;
}

/**
 * Histograma: la X es una columna numérica y la cuenta la hace Vega-Lite con
 * `bin`. Media y mediana (opcionales) son reglas sobre las MISMAS filas.
 */
function histograma(base, c, { X, colores }) {
    const cubos = Math.max(2, Number(c.binCount) || 20);
    const color = c.seriesConfig?.[X]?.color || colores[0];
    const ejeX = { title: c.showXAxisTitle === false ? null : (c.customAxisTitles?.x || X), grid: false, ...formato(c) };
    const ejeY = { title: c.showYAxisTitle ? (c.customAxisTitles?.y || 'Count') : null, grid: c.gridMode === 'both' || c.gridMode === 'horizontal' };
    const capas = [{
        rol: 'principal',
        mark: { type: 'bar', binSpacing: 1, ...(c.splitByKey ? {} : { color }) },
        encoding: {
            x: { field: campo(X), bin: { maxbins: cubos }, type: 'quantitative', axis: ejeX },
            y: { aggregate: 'count', type: 'quantitative', axis: ejeY },
            ...(c.splitByKey ? { color: { field: campo(c.splitByKey), type: 'nominal', scale: { range: colores }, legend: leyenda(c) } } : {}),
            tooltip: [{ field: campo(X), bin: { maxbins: cubos }, type: 'quantitative', title: X }, { aggregate: 'count', type: 'quantitative', title: 'Count' }],
        },
    }];
    const stats = Array.isArray(c.histogramStats) ? c.histogramStats : [];
    const colorStat = { mean: c.highlightConfig?.color && c.highlightConfig.type !== 'none' ? c.highlightConfig.color : '#ef4444', median: colores[1] || '#2a7ab9' };
    const nombres = { mean: 'Mean', median: 'Median' };
    for (const op of stats.filter(s => s === 'mean' || s === 'median')) {
        capas.push({ rol: op === 'mean' ? 'media' : 'mediana', mark: { type: 'rule', strokeWidth: 2, color: colorStat[op], ...(op === 'median' ? { strokeDash: [5, 3] } : {}) }, encoding: { x: { aggregate: op, field: campo(X), type: 'quantitative' } } });
        capas.push({
            rol: op === 'mean' ? 'media_texto' : 'mediana_texto',
            transform: [{ aggregate: [{ op, field: campo(X), as: '__v' }] }, { calculate: `${texto(nombres[op] + ' ')} + ${FORMATO_AMOX}(datum.__v, ${texto(`${c.numberFormat}|${c.decimalPlaces}`)})`, as: '__t' }],
            mark: { type: 'text', color: colorStat[op], align: 'left', dx: 4, baseline: 'top', fontWeight: 600, y: op === 'mean' ? 0 : 14 },
            encoding: { x: { field: '__v', type: 'quantitative' }, text: { field: '__t' } },
        });
    }
    return conCapas(base, [], capas);
}

/** Caja y bigotes: las filas sueltas, una caja por categoría. Horizontal por defecto. */
function caja(base, c, { X, Y, colores }) {
    if (!Y) return { ...base, mark: 'point' };
    const vertical = c.orientation === 'vertical';
    const cat = vertical ? 'x' : 'y', val = vertical ? 'y' : 'x';
    const color = c.seriesConfig?.[Y]?.color || colores[0];
    const resalte = c.highlightConfig?.type === 'exact' && c.highlightConfig.value !== '' ? c.highlightConfig : null;
    const enc = {
        [cat]: { field: campo(X), type: 'nominal', axis: { title: null, grid: false }, sort: c.sortMode === 'x-desc' ? 'descending' : c.sortMode === 'y-desc' ? { op: 'median', field: campo(Y), order: 'descending' } : c.sortMode === 'y-asc' ? { op: 'median', field: campo(Y), order: 'ascending' } : 'ascending' },
        [val]: { field: campo(Y), type: 'quantitative', scale: { zero: false }, axis: { title: c.showYAxisTitle ? (c.customAxisTitles?.y || Y) : null, ...formato(c) } },
        color: resalte ? { condition: { test: `'' + ${dato(X)} === ${texto(resalte.value)}`, value: resalte.color || '#ef4444' }, value: color } : { value: color },
    };
    return conCapas(base, [], [{ rol: 'principal', mark: { type: 'boxplot', extent: 1.5, size: 18, median: { color: '#1f2228' }, outliers: { size: 22 } }, encoding: enc }]);
}

/**
 * Barras con intervalo: el valor y, de otras dos columnas, el mínimo y el máximo
 * del intervalo (de confianza, de un rango, de un escenario). Horizontal por defecto.
 */
function intervalo(base, c, { X, Y, colores }) {
    if (!Y) return { ...base, mark: 'point' };
    const vertical = c.orientation === 'vertical';
    const cat = vertical ? 'x' : 'y', val = vertical ? 'y' : 'x';
    const color = c.seriesConfig?.[Y]?.color || colores[0];
    const resalte = condicionDeResalte(c, { X, valor: Y });
    const encCat = { field: campo(X), type: 'nominal', sort: c.sortMode === 'y-desc' ? { field: campo(Y), order: 'descending' } : c.sortMode === 'y-asc' ? { field: campo(Y), order: 'ascending' } : null, axis: { title: null, grid: false } };
    const capas = [{
        rol: 'principal',
        transform: resalte?.transform || [],
        mark: { type: 'bar', ...(c.barRadius ? { cornerRadiusEnd: Number(c.barRadius) } : {}) },
        encoding: {
            [cat]: encCat,
            [val]: { field: campo(Y), type: 'quantitative', axis: { title: c.showYAxisTitle ? (c.customAxisTitles?.y || Y) : null, ...formato(c) } },
            color: resalte ? { condition: { test: resalte.test, value: c.highlightConfig.color || '#ef4444' }, value: color } : { value: color },
            tooltip: [{ field: campo(X), type: 'nominal' }, { field: campo(Y), type: 'quantitative', ...formato(c) },
                ...(c.errorLowKey ? [{ field: campo(c.errorLowKey), type: 'quantitative', ...formato(c) }] : []),
                ...(c.errorHighKey ? [{ field: campo(c.errorHighKey), type: 'quantitative', ...formato(c) }] : [])],
        },
    }];
    if (c.errorLowKey && c.errorHighKey) {
        capas.push({
            rol: 'intervalo',
            mark: { type: 'errorbar', thickness: 1.5, ticks: true, color: '#555b66' },
            encoding: { [cat]: encCat, [val]: { field: campo(c.errorLowKey), type: 'quantitative' }, [`${val}2`]: { field: campo(c.errorHighKey) } },
        });
    }
    capas.push(...capasDeReferencia(c, { cat, val, valor: Y }));
    return conCapas(base, [], capas);
}

/** Franjas: cada fila es una raya en su categoría; se ve la forma del reparto sin resumirla. */
function franjas(base, c, { X, Y, colores }) {
    if (!Y) return conCapas(base, [], [{ rol: 'principal', mark: 'point' }]);
    const vertical = c.orientation === 'vertical';
    const cat = vertical ? 'x' : 'y', val = vertical ? 'y' : 'x';
    const color = c.seriesConfig?.[Y]?.color || colores[0];
    const resalte = c.highlightConfig?.type === 'exact' && c.highlightConfig.value !== '' ? c.highlightConfig : null;
    return conCapas(base, [], [{
        rol: 'principal',
        mark: { type: 'tick', thickness: 2, opacity: 0.55 },
        encoding: {
            [cat]: { field: campo(X), type: 'nominal', axis: { title: null, grid: false } },
            [val]: { field: campo(Y), type: 'quantitative', scale: { zero: false }, axis: { title: c.showYAxisTitle ? (c.customAxisTitles?.y || Y) : null, ...formato(c) } },
            color: resalte ? { condition: { test: `'' + ${dato(X)} === ${texto(resalte.value)}`, value: resalte.color || '#ef4444' }, value: color } : { value: color },
            tooltip: [{ field: campo(X), type: 'nominal' }, { field: campo(Y), type: 'quantitative', ...formato(c) }],
        },
    }, ...capasDeReferencia(c, { cat, val, valor: Y })]);
}

/**
 * Densidad: la forma suave de cómo se reparte una columna numérica (una curva por
 * grupo con «Split by»). Lo que el histograma dice con cubos, sin elegir cubos.
 */
function densidad(base, c, { X, colores }) {
    const grupo = c.splitByKey || null;
    return conCapas(base, [{ density: campo(X), ...(grupo ? { groupby: [String(grupo)] } : {}), as: ['__valor', '__densidad'] }], [{
        rol: 'principal',
        mark: { type: 'area', opacity: grupo ? 0.35 : 0.6, line: true, interpolate: 'monotone', ...(grupo ? {} : { color: c.seriesConfig?.[X]?.color || colores[0] }) },
        encoding: {
            x: { field: '__valor', type: 'quantitative', title: c.showXAxisTitle === false ? null : (c.customAxisTitles?.x || X), axis: { grid: false, ...formato(c) } },
            y: { field: '__densidad', type: 'quantitative', stack: null, axis: { title: c.showYAxisTitle ? (c.customAxisTitles?.y || 'Density') : null, labels: false, ticks: false, grid: c.gridMode === 'both' || c.gridMode === 'horizontal' } },
            ...(grupo ? { color: { field: campo(grupo), type: 'nominal', scale: { range: colores }, legend: leyenda(c) } } : {}),
        },
    }]);
}

function anillo(c, { X, valor, colores, tipo }) {
    const proporcion = tipo === 'pie' ? 0 : Math.min(0.85, Math.max(0.2, (Number(c.donutThickness) || 60) / 100));
    const radio = 'min(width, height) / 2 * 0.82';
    const leg = c.legendPosition === 'none' ? null : { orient: ['top', 'bottom', 'left', 'right'].includes(c.legendPosition) ? c.legendPosition : 'right', title: null };
    const theta = { field: campo(valor), type: 'quantitative', stack: true };
    const color = { field: campo(X), type: 'nominal', scale: { range: colores }, legend: leg, sort: { field: campo(valor), order: 'descending' } };
    const orden = { field: campo(valor), order: 'descending' };
    const capas = [{
        rol: 'principal',
        mark: { type: 'arc', outerRadius: { expr: radio }, ...(proporcion ? { innerRadius: { expr: `${radio} * ${proporcion}` } } : {}), stroke: null, padAngle: proporcion ? 0.01 : 0 },
        encoding: { theta, color, order: orden, tooltip: [{ field: campo(X), type: 'nominal' }, { field: campo(valor), type: 'quantitative', ...formato(c) }] },
    }];
    if (c.showLabels) {
        const contenido = {
            percent: 'format(datum.__pct, ".1%")', value: `${FORMATO_AMOX}(${dato(valor)}, ${texto(`${c.numberFormat}|${c.decimalPlaces}`)})`,
            name: dato(X), name_value: `${dato(X)} + ' ' + ${FORMATO_AMOX}(${dato(valor)}, ${texto(`${c.numberFormat}|${c.decimalPlaces}`)})`,
        }[c.donutLabelContent] || `${dato(X)} + ' ' + format(datum.__pct, '.1%')`;
        capas.push({
            rol: 'etiquetas',
            transform: [{ joinaggregate: [{ op: 'sum', field: campo(valor), as: '__total' }] }, { calculate: `${dato(valor)} / datum.__total`, as: '__pct' }, { calculate: contenido, as: '__etiqueta' }],
            mark: { type: 'text', radius: { expr: c.donutLabelPosition === 'inside' ? `${radio} * ${(1 + proporcion) / 2}` : `${radio} + 16` }, fontSize: Number(c.dataLabelSize) || 11 },
            encoding: { theta, order: orden, text: { field: '__etiqueta' } },
        });
    }
    if (tipo === 'donut' && c.donutCenterKpi && c.donutCenterKpi !== 'none' && proporcion > 0.3) {
        capas.push({
            rol: 'centro',
            transform: [{ aggregate: [{ op: c.donutCenterKpi === 'average' ? 'mean' : 'sum', field: campo(valor), as: '__total' }] }],
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
            rol: 'principal',
            transform: [{ calculate: `-${dato(valor)} / 2`, as: '__a' }, { calculate: `${dato(valor)} / 2`, as: '__b' }],
            mark: { type: 'bar', cornerRadius: 3 },
            encoding: {
                y, x: { field: '__a', type: 'quantitative', axis: null }, x2: { field: '__b' },
                color: { field: campo(X), type: 'nominal', scale: { range: colores }, legend: null, sort: orden },
                tooltip: [{ field: campo(X), type: 'nominal' }, { field: campo(valor), type: 'quantitative', ...formato(c) }],
            },
        },
        ...(c.showLabels ? [{ rol: 'etiquetas', mark: { type: 'text', fontWeight: 600 }, encoding: { y, x: { datum: 0, type: 'quantitative' }, text: { field: campo(valor), ...formato(c) } } }] : []),
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
            { name: `${PREFIJO_CAPA}principal`, mark: { type: 'rect', cornerRadius: 2 }, encoding: { color: { field: 'valor', type: 'quantitative', scale: escala, legend: leyenda(c) ? { orient: 'top', direction: 'horizontal', title: null } : null }, tooltip: [{ field: campo(X), type: 'nominal' }, { field: 'serie', type: 'nominal' }, { field: 'valor', type: 'quantitative', ...formato(c) }] } },
            // El mapa de calor siempre lleva la cifra en la celda: sin ella el color no se lee.
            { name: `${PREFIJO_CAPA}etiquetas`, mark: { type: 'text', fontSize: Number(c.dataLabelSize) || 11 }, encoding: { text: { field: 'valor', ...formato(c) } } },
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
