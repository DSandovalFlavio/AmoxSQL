/**
 * AmoxSQL AI — Chart Story Generator
 *
 * Computes descriptive stats in code and templates a structured story.
 * Numbers come from code; the AI only writes narrative prose on top.
 *
 * Public API: generateChartStory(data, options) → StoryResult
 */

'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────

function percentile(sorted, p) {
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Un SOLO estilo numerico para toda la figura.
 *
 * La version anterior decidia el formato con `Number.isInteger()`, asi que dos
 * numeros del mismo rango se imprimian distinto segun si uno caia redondo, y
 * por debajo de 1000 sacaba dos decimales mientras los grandes iban compactos.
 * El resultado en una misma linea era "Peak: 4.6M | Low: 422.67 | Average: 2.8M":
 * tres numeros con tres estilos.
 *
 * Ahora: compacto con un decimal a partir de 1000, y por debajo se redondea —
 * con tres cifras enteras no se imprimen decimales, porque al lado de un "4.6M"
 * los centimos no aportan nada y rompen la lectura de la fila.
 */
function formatNum(n) {
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    if (abs >= 100)       return String(Math.round(n));
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(abs >= 10 ? 1 : 2);
}

/** Una fecha se enseña como fecha: "2020-03-01 00:00:00" -> "2020-03-01". */
function limpiarFecha(v) {
    const s = String(v);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ]00:00:00/);
    return m ? m[1] : s;
}

function isDateLike(values) {
    if (!values || values.length === 0) return false;
    const sample = String(values[0]);
    return /^\d{4}[-/]\d{2}|^\d{2}[-/]\d{2}[-/]\d{4}|^Q[1-4]\s\d{4}|^\w{3}\s\d{4}/.test(sample);
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * @param {Array<object>} data     - Query result rows
 * @param {object} options
 * @param {string} options.xKey    - X-axis column name
 * @param {string} options.yKey    - Primary Y-axis column name
 * @param {string} [options.chartType] - Chart type hint
 * @param {string} [options.titleHint] - Optional user-provided title hint
 * @param {boolean} [options.truncated] - true si `data` es un recorte del resultado
 * @returns {StoryResult}
 */
function generateChartStory(data, { xKey, yKey, chartType = 'bar', titleHint = '', truncated = false } = {}) {
    if (!data || data.length === 0 || !xKey || !yKey) {
        return { error: 'Insufficient data for story generation.' };
    }

    const rows = data.filter(r => r[yKey] !== null && r[yKey] !== undefined);
    const values = rows.map(r => Number(r[yKey])).filter(v => !isNaN(v));

    if (values.length === 0) {
        return { error: `Column "${yKey}" has no numeric values.` };
    }

    // ── Basic stats ───────────────────────────────────────────────────────────
    const total   = values.reduce((a, b) => a + b, 0);
    const mean    = total / values.length;
    const sorted  = [...values].sort((a, b) => a - b);
    const min     = sorted[0];
    const max     = sorted[sorted.length - 1];

    // IQR outliers
    const q1  = percentile(sorted, 25);
    const q3  = percentile(sorted, 75);
    const iqr = q3 - q1;
    const outlierRows = rows.filter(r => {
        const v = Number(r[yKey]);
        return v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr;
    });

    // ── Ranking ───────────────────────────────────────────────────────────────
    const ranked = [...rows].sort((a, b) => Number(b[yKey]) - Number(a[yKey]));
    const top1   = ranked[0];
    const top1Label = String(top1?.[xKey] ?? '');
    const top1Value = Number(top1?.[yKey] ?? 0);
    const top1Pct   = total !== 0 ? ((top1Value / total) * 100).toFixed(1) : null;

    const top3Share = ranked.slice(0, 3)
        .reduce((s, r) => s + Number(r[yKey]), 0);
    const top3Pct = total !== 0 ? ((top3Share / total) * 100).toFixed(1) : null;

    // ── Trend (time-series) ───────────────────────────────────────────────────
    const xValues   = rows.map(r => r[xKey]);
    const isTimeSeries = isDateLike(xValues) || chartType === 'line' || chartType === 'area';

    // "Primero" y "ultimo" solo significan algo si las filas estan ORDENADAS.
    // `data` llega sin garantia de orden, asi que en una serie temporal hay que
    // ordenarla antes: si no, la narrativa dice "crecio de X a Y" comparando dos
    // puntos elegidos por azar. Es el mismo fallo que el rango del subtitulo,
    // un nivel mas abajo.
    const enOrden = isTimeSeries
        ? [...rows].sort((a, b) => String(a[xKey]).localeCompare(String(b[xKey])))
        : rows;
    const serie     = enOrden.map(r => Number(r[yKey])).filter(v => !isNaN(v));
    const firstVal  = serie[0];
    const lastVal   = serie[serie.length - 1];
    const deltaPct  = firstVal !== 0
        ? ((lastVal - firstVal) / Math.abs(firstVal) * 100).toFixed(1)
        : null;
    const deltaDir  = lastVal >= firstVal ? 'grew' : 'fell';

    // ── Build structured story ────────────────────────────────────────────────
    let chart_title = titleHint;
    let chart_subtitle = '';
    let headline = '';
    const key_insights = [];

    if (isTimeSeries && deltaPct !== null) {
        // Trend pattern
        const dir = Number(deltaPct) >= 0 ? 'grew' : 'fell';
        chart_title = chart_title || `${yKey} ${dir} ${Math.abs(deltaPct)}% over the period`;
        headline    = `${formatNum(lastVal)} (${Number(deltaPct) >= 0 ? '+' : ''}${deltaPct}% vs start)`;
        key_insights.push(`${yKey} ${deltaDir} from ${formatNum(firstVal)} to ${formatNum(lastVal)} — a ${Math.abs(deltaPct)}% change.`);
        key_insights.push(`Peak: ${formatNum(max)} | Low: ${formatNum(min)} | Average: ${formatNum(mean)}.`);
    } else {
        // Ranking / distribution pattern
        chart_title = chart_title || (top1Pct
            ? `${top1Label} leads with ${top1Pct}% of total ${yKey}`
            : `${yKey} distribution`);
        headline    = `${formatNum(top1Value)} (${top1Pct ? top1Pct + '% of total' : 'top value'})`;
        key_insights.push(`"${top1Label}" leads with ${formatNum(top1Value)}${top1Pct ? ` (${top1Pct}% of total)` : ''}.`);
        if (top3Pct && rows.length > 3) {
            key_insights.push(`Top 3 entries account for ${top3Pct}% of total ${yKey}.`);
        }
    }

    // Outlier insight
    if (outlierRows.length > 0) {
        const outlierLabel = String(outlierRows[0][xKey]);
        const outlierVal   = Number(outlierRows[0][yKey]);
        const ratio        = mean !== 0 ? (outlierVal / mean).toFixed(1) : null;
        key_insights.push(
            `"${outlierLabel}" is a statistical outlier at ${formatNum(outlierVal)}${ratio ? ` (${ratio}× the mean)` : ''}.`
        );
    } else if (key_insights.length < 3) {
        key_insights.push(`${values.length} data points. Mean: ${formatNum(mean)} | Range: ${formatNum(min)} – ${formatNum(max)}.`);
    }

    // El rango sale de MIN y MAX, no de las posiciones primera y ultima.
    // `data` llega recortada a 500 filas y sin garantia de orden, asi que
    // `xValues[0]` no es el principio del periodo: era lo que hacia que la
    // cabecera dijera "2020-03 -> 2021-07" mientras el eje iba de 2019 a 2023.
    if (isTimeSeries) {
        const ordenadas = [...xValues].map(limpiarFecha).sort();
        const desde = ordenadas[0];
        const hasta = ordenadas[ordenadas.length - 1];
        // Si vino recortado, se dice. Un rango presentado como si fuera el del
        // conjunto completo cuando no lo es destruye la confianza en el resto.
        const recorte = truncated ? ` · primeras ${rows.length} filas` : '';
        chart_subtitle = `${desde} → ${hasta}${recorte}`;
    } else {
        chart_subtitle = `${values.length} ${values.length === 1 ? 'category' : 'categories'} | Total: ${formatNum(total)}`;
    }

    const footnote = `Generated by AmoxSQL AI · ${new Date().toLocaleDateString()}`;

    return {
        chart_title:   chart_title.substring(0, 120),
        chart_subtitle: chart_subtitle.substring(0, 80),
        headline,
        kpi_value:     formatNum(isTimeSeries ? lastVal : top1Value),
        kpi_delta_pct: deltaPct,
        key_insights:  key_insights.slice(0, 3),
        footnote,
        stats: { total, mean, min, max, q1, q3, outlierCount: outlierRows.length },
        is_time_series: isTimeSeries,
    };
}

module.exports = { generateChartStory };
