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

function formatNum(n) {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
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
 * @returns {StoryResult}
 */
function generateChartStory(data, { xKey, yKey, chartType = 'bar', titleHint = '' } = {}) {
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
    const firstVal  = values[0];
    const lastVal   = values[values.length - 1];
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

    chart_subtitle = isTimeSeries
        ? `${xValues[0]} → ${xValues[xValues.length - 1]}`
        : `${values.length} ${values.length === 1 ? 'category' : 'categories'} | Total: ${formatNum(total)}`;

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
