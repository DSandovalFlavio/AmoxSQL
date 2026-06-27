import { API_BASE } from '../api.js';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
    LuHash, LuType, LuCalendar, LuKey, LuToggleLeft, LuLoader, LuMaximize, LuMinimize,
    LuTriangleAlert, LuInfo, LuCircleCheck, LuLightbulb, LuChevronRight, LuChevronDown, LuSparkles,
    LuDownload, LuChartColumnBig,
} from 'react-icons/lu';
import { useModalA11y } from '../hooks/useModalA11y';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

/**
 * DataProfiler — storytelling-driven EDA report for a query result.
 * Leads with a plain-language verdict + ranked findings, then per-column detail on demand.
 */

const NUMERIC_TYPES = ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'TINYINT', 'SMALLINT', 'UINTEGER', 'UBIGINT'];
const isNumericType = (t) => NUMERIC_TYPES.some((x) => (t || '').toUpperCase().includes(x));

const SEV = {
    critical: { rank: 3, color: 'var(--color-error)', label: 'Critical' },
    warning: { rank: 2, color: 'var(--color-warning)', label: 'Warning' },
    info: { rank: 1, color: 'var(--color-info)', label: 'Info' },
};

const fmt = (n) => {
    if (n === undefined || n === null || n === '') return '—';
    const num = typeof n === 'number' ? n : Number(n);
    if (Number.isNaN(num)) return String(n);
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toLocaleString(undefined, { maximumFractionDigits: 3 });
};
const pct1 = (n) => `${Number(n).toFixed(1)}%`;
const fmtAxis = (v) => {
    const n = Number(v);
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3)}k`;
    return String(n);
};

// ── Semantic type detection (beyond the raw SQL type) ──
function semanticType(col) {
    const name = (col.column || '').toLowerCase();
    const raw = (col.rawType || '').toUpperCase();
    if (raw.includes('DATE') || raw.includes('TIME')) return { key: 'date', label: 'Date', Icon: LuCalendar };
    if (raw.includes('BOOL')) return { key: 'bool', label: 'Boolean', Icon: LuToggleLeft };
    const looksUnique = col.uniqueCount > 0 && col.total > 20 && col.uniqueCount >= col.total * 0.98;
    if (/(^|_)(id|uuid|guid|key)s?$/.test(name) || looksUnique) return { key: 'id', label: 'Identifier', Icon: LuKey };
    if (col.dtype === 'numeric') return { key: 'number', label: 'Number', Icon: LuHash };
    if (/mail/.test(name) || (col.emailLike > 0 && col.nonNull > 0 && col.emailLike / col.nonNull > 0.7)) return { key: 'email', label: 'Email', Icon: LuType };
    if (col.uniqueCount > 0 && col.uniqueCount <= 50) return { key: 'category', label: 'Category', Icon: LuType };
    return { key: 'text', label: 'Text', Icon: LuType };
}

// ── Findings engine: stats → ranked, actionable diagnostics ──
function buildFindings(profile, globalStats, correlations) {
    const out = [];
    const total = globalStats?.totalRows || 0;
    const add = (severity, column, title, detail) => out.push({ severity, column, title, detail });

    if (globalStats?.duplicateRows > 0) {
        const p = total > 0 ? (globalStats.duplicateRows / total) * 100 : 0;
        add(p > 5 ? 'warning' : 'info', null, `${fmt(globalStats.duplicateRows)} duplicate rows`,
            `${pct1(p)} of rows are exact duplicates — they inflate counts and averages. Add DISTINCT or de-duplicate before aggregating.`);
    }

    profile.forEach((col) => {
        const nullPct = parseFloat(col.nullPct);
        if (nullPct >= 95) add('critical', col.column, 'Almost entirely empty', `${pct1(nullPct)} of values are missing — this column carries little information.`);
        else if (nullPct > 50) add('warning', col.column, 'Mostly missing', `${pct1(nullPct)} missing. Filter or impute before relying on it.`);
        else if (nullPct > 5) add('info', col.column, 'Some missing values', `${pct1(nullPct)} missing — watch aggregations and joins.`);

        if (col.uniqueCount === 1) add('warning', col.column, 'Constant value', 'Only one distinct value — no signal; consider dropping it.');

        const st = col.semantic;
        if (st?.key === 'id') add('info', col.column, 'Looks like an identifier', `${pct1(parseFloat(col.uniquePct))} unique — likely a key. Good for joins, not for aggregation.`);
        else if (col.dtype === 'text' && col.total > 100 && parseFloat(col.uniquePct) > 90 && parseFloat(col.uniquePct) < 100) {
            add('info', col.column, 'High cardinality', `${pct1(parseFloat(col.uniquePct))} unique — too granular to group by directly.`);
        }

        if (col.dtype === 'numeric' && col.skewness !== null && Math.abs(col.skewness) > 3) {
            add('info', col.column, 'Highly skewed', `Skew ${col.skewness.toFixed(1)} — the mean is misleading here; prefer the median (${fmt(col.median)}).`);
        }
        if (col.dtype === 'numeric' && col.zeros > 0 && (col.zeros / col.total) > 0.5) {
            add('info', col.column, 'Mostly zeros', `${pct1((col.zeros / col.total) * 100)} of values are 0.`);
        }
        if (col.dtype === 'numeric' && col.negatives > 0 && /(price|amount|qty|quantity|count|total|sales|revenue|cost)/.test(col.column.toLowerCase())) {
            add('warning', col.column, 'Unexpected negatives', `${fmt(col.negatives)} negative values in a field that's usually non-negative — possible data issue.`);
        }
        if (col.outliers > 0) {
            const op = col.total > 0 ? (col.outliers / col.total) * 100 : 0;
            add('info', col.column, 'Outliers detected', `${fmt(col.outliers)} value${col.outliers === 1 ? '' : 's'} (${pct1(op)}) fall beyond the 1.5×IQR range — worth a look.`);
        } else if (col.outliers === null && col.outlierHint) {
            add('info', col.column, 'Possible outliers', `The maximum (${fmt(col.max)}) sits far above the typical range — check for outliers.`);
        }

        if (col.semantic?.key === 'date' && col.dayspan != null && col.dayspan > 0) {
            add('info', col.column, 'Date range', `Spans ${col.min} → ${col.max} (${fmt(col.dayspan)} days).`);
            if (col.distinctDates != null) {
                const expected = col.dayspan + 1;
                const ratio = expected > 0 ? col.distinctDates / expected : 1;
                if (ratio >= 0.7 && ratio < 0.99) {
                    add('info', col.column, 'Possible date gaps', `${fmt(col.distinctDates)} distinct dates over a ${fmt(expected)}-day span — some dates appear to be missing.`);
                }
            }
        }

        const top = col.topValues && col.topValues[0];
        if (top && col.dtype === 'text' && col.uniqueCount > 1 && parseFloat(top.pct) > 80) {
            add('info', col.column, 'Dominated by one value', `"${top.value}" accounts for ${top.pct}% of rows.`);
        }
    });

    if (globalStats?.candidateKey && globalStats.candidateKey.length === 2) {
        add('info', null, 'Candidate key', `"${globalStats.candidateKey[0]}" + "${globalStats.candidateKey[1]}" together uniquely identify each row.`);
    }

    (correlations || []).forEach((p) => {
        if (Math.abs(p.score) > 0.95 && Math.abs(p.score) < 1) {
            add('info', null, 'Strong correlation', `"${p.col1}" and "${p.col2}" move together (r=${p.score.toFixed(2)}) — likely redundant.`);
        }
    });

    return out.sort((a, b) => SEV[b.severity].rank - SEV[a.severity].rank);
}

// ── Plain-language verdict ──
function buildHeadline(profile, globalStats, findings) {
    if (!profile.length) return '';
    const rows = globalStats?.totalRows || 0;
    const cols = profile.length;
    const numeric = profile.filter((c) => c.dtype === 'numeric').length;
    const withNulls = profile.filter((c) => parseFloat(c.nullPct) > 0);
    const avgNull = profile.reduce((a, c) => a + parseFloat(c.nullPct), 0) / cols;

    let s = `${fmt(rows)} rows × ${cols} columns (${numeric} numeric). `;
    if (avgNull < 0.5 && !globalStats?.duplicateRows) s += 'The data looks clean. ';
    else if (withNulls.length) s += `${withNulls.length} column${withNulls.length > 1 ? 's have' : ' has'} missing values${avgNull > 5 ? ` (${pct1(avgNull)} overall)` : ''}. `;
    if (globalStats?.duplicateRows > 0) s += `${fmt(globalStats.duplicateRows)} duplicate rows. `;

    const topConcentration = profile
        .map((c) => ({ c, top: c.topValues && c.topValues[0] }))
        .filter((x) => x.top && parseFloat(x.top.pct) > 50)
        .sort((a, b) => parseFloat(b.top.pct) - parseFloat(a.top.pct))[0];
    if (topConcentration) s += `"${topConcentration.c.column}" is concentrated — ${topConcentration.top.pct}% is "${topConcentration.top.value}". `;

    const crit = findings.find((f) => f.severity === 'critical');
    if (crit) s += `Heads-up: ${crit.title.toLowerCase()} in "${crit.column}".`;
    return s.trim();
}

// ── Tiny inline distribution sparkline ──
const Sparkline = ({ col }) => {
    const bars = col.dtype === 'numeric' && col.histogram
        ? col.histogram
        : (col.topValues || []).map((t) => t.count);
    if (!bars || !bars.length) return <div style={{ width: 70, height: 18 }} />;
    const max = Math.max(...bars, 1);
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, width: 70, height: 18 }}>
            {bars.slice(0, 6).map((b, i) => (
                <div key={i} style={{ flex: 1, height: `${Math.max(8, (b / max) * 100)}%`, background: 'var(--accent-primary)', opacity: 0.55, borderRadius: 1 }} />
            ))}
        </div>
    );
};

const StatBlock = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{value}</span>
    </div>
);

// ── Expanded per-column detail ──
const ColumnDetail = ({ col, onPlot }) => {
    const chartData = col.dtype === 'numeric' && col.histogram
        ? col.histogram.map((c, i) => ({ name: `Bin ${i + 1}`, count: Number(c) }))
        : (col.topValues || []).map((t) => ({ name: String(t.value) || '(empty)', count: Number(t.count) }));
    return (
        <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '28px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-base)' }}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {col.dtype === 'numeric' ? 'Value distribution' : 'Top values'}
                    </div>
                    {onPlot && (
                        <button
                            onClick={onPlot}
                            title="Open this result in the chart builder"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-md, 6px)', padding: '3px 9px', fontSize: '11px', cursor: 'pointer' }}
                        >
                            <LuChartColumnBig size={13} /> Plot
                        </button>
                    )}
                </div>
                <div style={{ flex: 1, minHeight: 150 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout={col.dtype === 'numeric' ? 'horizontal' : 'vertical'} margin={{ top: 4, right: 12, bottom: 4, left: col.dtype === 'numeric' ? 4 : 8 }}>
                            {col.dtype === 'numeric'
                                ? <><XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} /><YAxis width={42} tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} /></>
                                : <><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} /></>}
                            <Tooltip contentStyle={{ background: 'var(--surface-overlay)', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: 12 }} cursor={{ fill: 'var(--hover-bg)' }} />
                            <Bar dataKey="count" radius={[3, 3, 3, 3]}>
                                {chartData.map((_, i) => <Cell key={i} fill="var(--accent-primary)" fillOpacity={0.85} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Statistics</div>
                <StatBlock label="Distinct" value={`${fmt(col.uniqueCount)} (${col.uniquePct}%)`} />
                <StatBlock label="Missing" value={`${fmt(col.nullCount)} (${col.nullPct}%)`} />
                {col.dtype === 'numeric' ? (
                    <>
                        <StatBlock label="Min / Max" value={`${fmt(col.min)} / ${fmt(col.max)}`} />
                        <StatBlock label="Mean" value={fmt(col.mean)} />
                        <StatBlock label="Median" value={fmt(col.median)} />
                        <StatBlock label="Std. dev" value={fmt(col.stddev)} />
                        <StatBlock label="Skewness" value={col.skewness !== null ? col.skewness.toFixed(2) : '—'} />
                        <StatBlock label="Zeros / Negatives" value={`${fmt(col.zeros)} / ${fmt(col.negatives)}`} />
                    </>
                ) : (
                    <>
                        <StatBlock label="Length min/avg/max" value={`${fmt(col.minLength)} / ${fmt(col.avgLength && col.avgLength.toFixed(1))} / ${fmt(col.maxLength)}`} />
                        {col.topValues && col.topValues[0] && <StatBlock label="Most common" value={`"${col.topValues[0].value}" (${col.topValues[0].pct}%)`} />}
                    </>
                )}
            </div>
        </div>
    );
};

const DataProfiler = ({ data, isActive, query }) => {
    const [profile, setProfile] = useState([]);
    const [globalStats, setGlobalStats] = useState(null);
    const [correlations, setCorrelations] = useState([]);
    const [execTime, setExecTime] = useState(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [processedQueryRef, setProcessedQueryRef] = useState(null);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [expanded, setExpanded] = useState(null);
    const profilerRef = useRef(null);
    const { dialogProps } = useModalA11y(isFullScreen ? profilerRef : { current: null }, () => setIsFullScreen(false));

    useEffect(() => {
        if (!(isActive && processedQueryRef !== query)) return;
        if (!query || !data || data.length === 0) {
            setProfile([]); setGlobalStats(null); setCorrelations([]); setProcessedQueryRef(query);
            return;
        }
        const fetchProfile = async () => {
            setIsCalculating(true);
            try {
                const res = await fetch(`${API_BASE}/api/profile`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
                });
                const result = await res.json();
                if (result.profile && Array.isArray(result.profile)) {
                    const totalRows = result.global?.totalRows || data.length;
                    const adv = result.advanced || {};
                    const mapped = result.profile.map((col) => {
                        const numeric = isNumericType(col.column_type);
                        const colName = col.column_name;
                        const q25 = col.q25 != null ? parseFloat(col.q25) : null;
                        const q75 = col.q75 != null ? parseFloat(col.q75) : null;
                        const max = col.max != null ? parseFloat(col.max) : null;
                        const iqr = q25 != null && q75 != null ? q75 - q25 : null;
                        const outlierHint = numeric && iqr != null && iqr > 0 && max != null && max > q75 + 3 * iqr;
                        const o = {
                            column: colName, rawType: col.column_type, total: totalRows,
                            nullCount: Math.round((parseFloat(col.null_percentage) / 100) * totalRows),
                            nullPct: parseFloat(col.null_percentage).toFixed(1),
                            uniqueCount: Number.isNaN(parseInt(col.approx_unique)) ? 0 : parseInt(col.approx_unique),
                            uniquePct: totalRows > 0 ? ((col.approx_unique / totalRows) * 100).toFixed(1) : '0',
                            dtype: numeric ? 'numeric' : 'text',
                            min: col.min, max: col.max,
                            mean: col.avg != null ? parseFloat(col.avg) : null,
                            median: col.q50 != null ? parseFloat(col.q50) : null,
                            stddev: col.std != null ? parseFloat(col.std) : null,
                            q25, q75, outlierHint,
                            outliers: adv[`${colName}_outliers`] !== undefined ? parseInt(adv[`${colName}_outliers`]) : null,
                            emailLike: adv[`${colName}_emaillike`] !== undefined ? parseInt(adv[`${colName}_emaillike`]) : 0,
                            nonNull: col.count != null ? parseInt(col.count) : (totalRows - Math.round((parseFloat(col.null_percentage) / 100) * totalRows)),
                            dayspan: adv[`${colName}_dayspan`] !== undefined ? parseInt(adv[`${colName}_dayspan`]) : null,
                            distinctDates: adv[`${colName}_distinctdates`] !== undefined ? parseInt(adv[`${colName}_distinctdates`]) : null,
                            skewness: adv[`${colName}_skewness`] !== undefined ? parseFloat(adv[`${colName}_skewness`]) : null,
                            kurtosis: adv[`${colName}_kurtosis`] !== undefined ? parseFloat(adv[`${colName}_kurtosis`]) : null,
                            zeros: adv[`${colName}_zeros`] !== undefined ? parseInt(adv[`${colName}_zeros`]) : 0,
                            negatives: adv[`${colName}_negatives`] !== undefined ? parseInt(adv[`${colName}_negatives`]) : 0,
                            maxLength: adv[`${colName}_max_length`] !== undefined ? parseInt(adv[`${colName}_max_length`]) : null,
                            minLength: adv[`${colName}_min_length`] !== undefined ? parseInt(adv[`${colName}_min_length`]) : null,
                            avgLength: adv[`${colName}_avg_length`] !== undefined ? parseFloat(adv[`${colName}_avg_length`]) : null,
                            histogram: result.visuals?.[colName]?.type === 'histogram' ? result.visuals[colName].data : undefined,
                            topValues: result.visuals?.[colName]?.type === 'top' ? result.visuals[colName].data.map((tv) => ({
                                value: tv.value, count: tv.count, pct: totalRows > 0 ? ((tv.count / totalRows) * 100).toFixed(1) : '0',
                            })) : undefined,
                        };
                        o.semantic = semanticType(o);
                        return o;
                    });
                    setProfile(mapped);
                    setGlobalStats({ totalRows, duplicateRows: result.global?.duplicateRows || 0, cols: mapped.length, candidateKey: result.candidateKey || null });
                    setCorrelations(result.correlations || []);
                    setExecTime(result.executionTime || null);
                } else {
                    setProfile([]);
                }
            } catch (err) {
                console.error('DuckDB Profiler Error:', err);
                setProfile([]);
            }
            setIsCalculating(false);
            setProcessedQueryRef(query);
        };
        fetchProfile();
    }, [isActive, query, processedQueryRef, data]);

    const findings = useMemo(() => buildFindings(profile, globalStats, correlations), [profile, globalStats, correlations]);
    const headline = useMemo(() => buildHeadline(profile, globalStats, findings), [profile, globalStats, findings]);

    // Worst finding severity per column → status dot in the overview.
    const colSeverity = useMemo(() => {
        const m = {};
        findings.forEach((f) => {
            if (!f.column) return;
            if (!m[f.column] || SEV[f.severity].rank > SEV[m[f.column]].rank) m[f.column] = f.severity;
        });
        return m;
    }, [findings]);

    if (!data || data.length === 0) {
        return <div style={{ padding: '20px', color: 'var(--text-tertiary)', textAlign: 'center' }}>No data to profile</div>;
    }
    if (isCalculating || !processedQueryRef) {
        return (
            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', height: '100%' }}>
                <LuLoader size={22} className="dbt-spin" style={{ marginBottom: '12px', color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: '13px' }}>Profiling the result…</span>
            </div>
        );
    }

    const completeness = profile.length ? 100 - profile.reduce((a, c) => a + parseFloat(c.nullPct), 0) / profile.length : 100;
    const sevCounts = findings.reduce((a, f) => { a[f.severity] = (a[f.severity] || 0) + 1; return a; }, {});
    const numericCount = profile.filter((c) => c.dtype === 'numeric').length;

    const containerStyle = isFullScreen
        ? { position: 'fixed', inset: 0, background: 'var(--surface-base)', zIndex: 9999, padding: '24px 40px', overflowY: 'auto' }
        : { padding: '20px', overflowY: 'auto', height: '100%' };

    const card = { background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg, 12px)' };

    const narrateWithAi = () => {
        const fLines = findings.map((f) => `- [${f.severity}] ${f.title}${f.column ? ` (${f.column})` : ''}: ${f.detail}`).join('\n');
        const cLines = profile.map((c) => `- ${c.column} (${c.semantic.label}): ${fmt(c.uniqueCount)} distinct, ${c.nullPct}% null`).join('\n');
        const prompt = `Here is an automated profile of my query result. Write a short, plain-language narrative: what story does this data tell, what should I watch out for, and what's worth exploring next? Be concise.\n\nSummary: ${headline}\n\nFindings:\n${fLines || '(none)'}\n\nColumns (${profile.length}):\n${cLines}\n\nQuery:\n\`\`\`sql\n${query}\n\`\`\``;
        window.dispatchEvent(new CustomEvent('amox_ai_prompt', { detail: { prompt } }));
    };

    const buildReportHtml = () => {
        const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const sevC = { critical: '#c0392b', warning: '#b9770e', info: '#2471a3' };
        const findRows = findings.map((f) => `<li style="border-left:3px solid ${sevC[f.severity]};padding:8px 12px;margin:6px 0;background:#fafafa;list-style:none;border-radius:4px"><b style="color:${sevC[f.severity]};text-transform:uppercase;font-size:11px">${esc(SEV[f.severity].label)}</b> &middot; <b>${esc(f.title)}</b>${f.column ? ` <span style="color:#888">(${esc(f.column)})</span>` : ''}<br><span style="color:#555">${esc(f.detail)}</span></li>`).join('') || '<li style="color:#2e8b57">No data-quality issues detected.</li>';
        const colRows = profile.map((c) => `<tr><td>${esc(c.column)}</td><td>${esc(c.semantic.label)}</td><td style="text-align:right">${fmt(c.uniqueCount)}</td><td style="text-align:right">${c.nullPct}%</td><td>${c.dtype === 'numeric' ? `min ${fmt(c.min)} &middot; max ${fmt(c.max)} &middot; mean ${fmt(c.mean)} &middot; median ${fmt(c.median)}` : (c.topValues && c.topValues[0] ? `top "${esc(c.topValues[0].value)}" (${c.topValues[0].pct}%)` : '')}</td></tr>`).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Data profile</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:900px;margin:32px auto;padding:0 20px;color:#1a1a1a;line-height:1.5}h1{font-size:22px;margin:0 0 4px}.sub{color:#888;font-size:13px;margin-bottom:20px}.verdict{background:#f0f6ff;border:1px solid #d6e4ff;border-radius:8px;padding:14px 16px;margin-bottom:18px}.cards{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}.c{border:1px solid #e5e5e5;border-radius:8px;padding:10px 14px;min-width:120px}.c .l{font-size:10px;text-transform:uppercase;color:#999;letter-spacing:.05em}.c .v{font-size:20px;font-weight:600}h2{font-size:15px;margin:22px 0 8px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #eee}th{color:#888;font-weight:600;font-size:11px;text-transform:uppercase}ul{padding:0}.foot{color:#aaa;font-size:11px;margin-top:24px;border-top:1px solid #eee;padding-top:10px}</style></head><body>`
            + `<h1>Data profile</h1><div class="sub">Generated ${new Date().toLocaleString()}</div>`
            + (headline ? `<div class="verdict">${esc(headline)}</div>` : '')
            + `<div class="cards"><div class="c"><div class="l">Rows</div><div class="v">${fmt(globalStats?.totalRows)}</div></div><div class="c"><div class="l">Columns</div><div class="v">${globalStats?.cols}</div></div><div class="c"><div class="l">Completeness</div><div class="v">${pct1(completeness)}</div></div><div class="c"><div class="l">Duplicate rows</div><div class="v">${fmt(globalStats?.duplicateRows)}</div></div><div class="c"><div class="l">Findings</div><div class="v">${findings.length}</div></div></div>`
            + `<h2>Findings</h2><ul>${findRows}</ul>`
            + `<h2>Columns</h2><table><thead><tr><th>Column</th><th>Type</th><th style="text-align:right">Distinct</th><th style="text-align:right">Missing</th><th>Summary</th></tr></thead><tbody>${colRows}</tbody></table>`
            + `<div class="foot">Scanned ${fmt(globalStats?.totalRows)} rows &middot; ${profile.length} columns${execTime ? ` &middot; profiled in ${execTime} ms` : ''} &middot; AmoxSQL</div>`
            + `</body></html>`;
        return html;
    };
    const exportHtml = () => {
        const blob = new Blob([buildReportHtml()], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'data-profile.html';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    const exportPdf = () => {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(buildReportHtml());
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch (e) { /* noop */ } }, 350);
    };

    // Plot a column → build a DERIVED, aggregated query that produces exactly the chart data
    // (not the raw 1M-row query), then open it as a new editable .amoxvis tab.
    const plotColumn = (col) => {
        const src = (query || '').trim().replace(/;+$/, '');
        const name = col.column;
        const qn = `"${name.replace(/"/g, '""')}"`;
        let chartQuery;
        let config;
        const min = col.min != null ? parseFloat(col.min) : null;
        const max = col.max != null ? parseFloat(col.max) : null;

        if (col.dtype === 'numeric' && min != null && max != null && min !== max) {
            // Histogram: 20 even bins across the observed range.
            const bw = (max - min) / 20 || 1;
            chartQuery = `SELECT FLOOR((${qn} - ${min}) / ${bw}) * ${bw} + ${min} AS bucket, COUNT(*) AS count\nFROM (${src}) AS __amox_src\nWHERE ${qn} IS NOT NULL\nGROUP BY bucket\nORDER BY bucket`;
            config = { chartType: 'bar', xAxisKey: 'bucket', yAxisKeys: ['count'] };
        } else if (col.semantic?.key === 'date') {
            // Time series: count per period (day for short spans, month otherwise).
            const unit = (col.dayspan != null && col.dayspan <= 90) ? 'day' : 'month';
            chartQuery = `SELECT DATE_TRUNC('${unit}', ${qn}) AS period, COUNT(*) AS count\nFROM (${src}) AS __amox_src\nWHERE ${qn} IS NOT NULL\nGROUP BY period\nORDER BY period`;
            config = { chartType: 'line', xAxisKey: 'period', yAxisKeys: ['count'] };
        } else {
            // Categorical / text: top values by frequency.
            chartQuery = `SELECT ${qn} AS ${qn}, COUNT(*) AS count\nFROM (${src}) AS __amox_src\nWHERE ${qn} IS NOT NULL\nGROUP BY ${qn}\nORDER BY count DESC\nLIMIT 20`;
            config = { chartType: 'bar', xAxisKey: name, yAxisKeys: ['count'] };
        }
        window.dispatchEvent(new CustomEvent('amox_create_chart', {
            detail: { title: `${name} distribution`, query: chartQuery, config },
        }));
    };

    return (
        <div ref={profilerRef} style={containerStyle} {...(isFullScreen ? dialogProps : {})}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '16px' }}>
                <div>
                    <h2 style={{ fontSize: '18px', margin: '0 0 2px 0', color: 'var(--text-primary)', fontWeight: 600 }}>Data profile</h2>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Exploratory analysis of your query result</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button
                        onClick={narrateWithAi}
                        title="Ask the AI assistant to narrate this profile"
                        style={{ padding: '5px 11px', background: 'var(--accent-subtle, rgba(0,187,170,0.12))', border: '1px solid var(--border-default)', color: 'var(--text-active)', borderRadius: 'var(--radius-md, 6px)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                    >
                        <LuSparkles size={14} /> Narrate with AI
                    </button>
                    <button
                        onClick={exportHtml}
                        title="Download as a standalone HTML file"
                        style={{ padding: '5px 11px', background: 'var(--panel-bg)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-md, 6px)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                    >
                        <LuDownload size={14} /> HTML
                    </button>
                    <button
                        onClick={exportPdf}
                        title="Open a print view to save as PDF"
                        style={{ padding: '5px 11px', background: 'var(--panel-bg)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-md, 6px)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                    >
                        <LuDownload size={14} /> PDF
                    </button>
                    <button
                        onClick={() => setIsFullScreen(!isFullScreen)}
                        style={{ padding: '5px 11px', background: 'var(--panel-bg)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-md, 6px)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
                    >
                        {isFullScreen ? <LuMinimize size={14} /> : <LuMaximize size={14} />}
                        {isFullScreen ? 'Exit full screen' : 'Full screen'}
                    </button>
                </div>
            </div>

            {/* Headline verdict */}
            {headline && (
                <div style={{ ...card, padding: '14px 16px', marginBottom: '14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <LuLightbulb size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: 'var(--text-primary)' }}>{headline}</p>
                </div>
            )}

            {/* Scorecard */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                {[
                    { label: 'Rows', value: fmt(globalStats?.totalRows) },
                    { label: 'Columns', value: globalStats?.cols },
                    { label: 'Completeness', value: pct1(completeness), tone: completeness < 90 ? 'warning' : 'good' },
                    { label: 'Duplicate rows', value: fmt(globalStats?.duplicateRows), tone: globalStats?.duplicateRows > 0 ? 'warning' : 'good' },
                    { label: 'Findings', value: findings.length, tone: sevCounts.critical ? 'critical' : sevCounts.warning ? 'warning' : 'good' },
                ].map((s, i) => (
                    <div key={i} style={{ ...card, padding: '12px 14px' }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{s.label}</div>
                        <div style={{ fontSize: '20px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: s.tone === 'critical' ? 'var(--color-error)' : s.tone === 'warning' ? 'var(--color-warning)' : 'var(--text-primary)' }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Findings */}
            <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Findings
                    {findings.length > 0 && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>({findings.length})</span>}
                </div>
                {findings.length === 0 ? (
                    <div style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        <LuCircleCheck size={16} style={{ color: 'var(--color-success)' }} /> No data-quality issues detected.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        {findings.map((f, i) => {
                            const c = SEV[f.severity].color;
                            return (
                                <div key={i} style={{ ...card, padding: '10px 13px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                    {f.severity === 'info'
                                        ? <LuInfo size={15} style={{ color: c, flexShrink: 0, marginTop: '1px' }} />
                                        : <LuTriangleAlert size={15} style={{ color: c, flexShrink: 0, marginTop: '1px' }} />}
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: c }}>{SEV[f.severity].label}</span>
                                            {f.title}{f.column && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · {f.column}</span>}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.45 }}>{f.detail}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Columns overview (compact, expandable) */}
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Columns ({profile.length})</div>
            <div style={{ ...card, overflow: 'hidden', marginBottom: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '16px 1.6fr 110px 80px 1fr 80px 16px', gap: '12px', alignItems: 'center', padding: '8px 13px', borderBottom: '1px solid var(--border-subtle)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', background: 'var(--panel-bg)' }}>
                    <span />
                    <span>Column</span>
                    <span>Type</span>
                    <span>Distribution</span>
                    <span>Missing</span>
                    <span style={{ textAlign: 'right' }}>Distinct</span>
                    <span />
                </div>
                {profile.map((col, idx) => {
                    const open = expanded === col.column;
                    const sev = colSeverity[col.column];
                    const Icon = col.semantic.Icon;
                    const nullPctNum = parseFloat(col.nullPct);
                    return (
                        <div key={col.column} style={{ borderTop: idx ? '1px solid var(--border-subtle)' : 'none' }}>
                            <div
                                onClick={() => setExpanded(open ? null : col.column)}
                                style={{ display: 'grid', gridTemplateColumns: '16px 1.6fr 110px 80px 1fr 80px 16px', gap: '12px', alignItems: 'center', padding: '9px 13px', cursor: 'pointer' }}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: sev ? SEV[sev].color : 'var(--color-success)', justifySelf: 'center' }} title={sev ? SEV[sev].label : 'OK'} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                    <Icon size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.column}</span>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{col.semantic.label}</span>
                                <Sparkline col={col} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ flex: 1, height: 5, background: 'var(--panel-bg)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(100, nullPctNum)}%`, height: '100%', background: nullPctNum > 20 ? 'var(--color-warning)' : 'var(--text-muted)' }} />
                                    </div>
                                    <span style={{ fontSize: '11px', color: nullPctNum > 20 ? 'var(--color-warning)' : 'var(--text-tertiary)', width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{col.nullPct}%</span>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} title="Distinct values">{fmt(col.uniqueCount)}</span>
                                {open ? <LuChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} /> : <LuChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />}
                            </div>
                            {open && <ColumnDetail col={col} onPlot={() => plotColumn(col)} />}
                        </div>
                    );
                })}
            </div>

            {/* Correlations */}
            {correlations.length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Relationships</div>
                    <div style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[...correlations].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 6).map((p, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px' }}>
                                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, width: 46, color: Math.abs(p.score) > 0.7 ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>{p.score.toFixed(2)}</span>
                                <span style={{ color: 'var(--text-primary)' }}>{p.col1}</span>
                                <span style={{ color: 'var(--text-tertiary)' }}>↔</span>
                                <span style={{ color: 'var(--text-primary)' }}>{p.col2}</span>
                                {Math.abs(p.score) > 0.9 && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>— move together, possibly redundant</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Analysis journey */}
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', paddingTop: '4px', borderTop: '1px solid var(--border-subtle)', marginTop: '4px' }}>
                Scanned {fmt(globalStats?.totalRows)} rows · profiled {profile.length} columns ({numericCount} numeric) · {findings.length} finding{findings.length === 1 ? '' : 's'}
                {execTime ? ` · in ${execTime} ms` : ''}
            </div>
        </div>
    );
};

export default DataProfiler;
