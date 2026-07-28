import { API_BASE } from '../api.js';
import { useState, useEffect, useMemo, useRef } from 'react';
import { LuSearch, LuCopy, LuCheck, LuX, LuBookOpen, LuTriangleAlert } from 'react-icons/lu';
import './FunctionReference.css';

/**
 * FunctionReference — a searchable browser of DuckDB's function catalog.
 *
 * Powered entirely by /api/functions/catalog, which merges the live
 * duckdb_functions() list with the curated docs bundled in the installer — so
 * this works fully offline. No DB write, no query execution: pure reference,
 * for when you're mid-query and forget a function's name or its parameters.
 */

// Strip Monaco snippet placeholders (${1:foo} / $1) down to their label.
function cleanSnippet(s) {
    return s.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\{?\d+\}?/g, '');
}

// Build a human-readable signature from the catalog fields.
function buildSignature(fn) {
    // Real parameter metadata (from duckdb_functions()) wins when present.
    const params = Array.isArray(fn.parameters) ? fn.parameters : [];
    const types = Array.isArray(fn.parameter_types) ? fn.parameter_types : [];
    if (params.length || types.length) {
        const inner = params.length
            ? params.map((p, i) => (types[i] ? `${p} ${types[i]}` : p)).join(', ')
            : types.join(', ');
        return `${fn.function_name}(${inner})`;
    }
    if (fn.snippet && /\(/.test(fn.snippet)) return cleanSnippet(fn.snippet);
    return `${fn.function_name}()`;
}

// A short call template to copy/paste.
function callTemplate(fn) {
    if (fn.snippet && /\(/.test(fn.snippet)) return cleanSnippet(fn.snippet);
    const n = Array.isArray(fn.parameters) ? fn.parameters.length
        : (Array.isArray(fn.parameter_types) ? fn.parameter_types.length : 0);
    return `${fn.function_name}(${Array(n).fill('').map((_, i) => `arg${i + 1}`).join(', ')})`;
}

// The curated `doc` field is markdown: a description followed by ```sql fenced
// examples. Split it so we can show prose as text and code as example blocks.
function parseDoc(doc) {
    if (!doc) return { text: '', blocks: [] };
    const blocks = [];
    const text = doc.replace(/```[a-z]*\n?([\s\S]*?)```/gi, (_, code) => {
        blocks.push(code.trim());
        return '';
    }).trim();
    return { text, blocks };
}

const TYPE_LABEL = {
    scalar: 'Scalar', aggregate: 'Aggregate', table: 'Table',
    pragma: 'Pragma', macro: 'Macro',
};

export default function FunctionReference() {
    const [all, setAll] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [q, setQ] = useState('');
    const [category, setCategory] = useState('all');
    const [selected, setSelected] = useState(null);
    const [copied, setCopied] = useState('');
    const searchRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        // Dedupe by name (the catalog lists one row per overload).
        const dedupe = (functions) => {
            const byName = new Map();
            for (const f of (functions || [])) {
                if (!f.function_name) continue;
                const cur = byName.get(f.function_name);
                if (!cur) byName.set(f.function_name, f);
                else if (!cur.documented && f.documented) byName.set(f.function_name, f);
            }
            return [...byName.values()];
        };

        const load = async ({ allowRefresh } = {}) => {
            try {
                let res = await fetch(`${API_BASE}/api/functions/catalog`);
                let data = await res.json();
                if (data.error) throw new Error(data.error);

                // Without the per-project introspection cache the catalog is
                // curated-only (~95 entries). Build it once from the live engine
                // so the browser lists everything DuckDB actually exposes. Needs
                // a connected DB; if it fails we keep the curated list.
                if (allowRefresh && data.source === 'curated-only') {
                    try {
                        await fetch(`${API_BASE}/api/functions/refresh`, { method: 'POST' });
                        res = await fetch(`${API_BASE}/api/functions/catalog`);
                        const refreshed = await res.json();
                        if (!refreshed.error) data = refreshed;
                    } catch { /* keep curated-only */ }
                }

                if (cancelled) return;
                setAll(dedupe(data.functions));
                setError(null);
            } catch (e) {
                if (!cancelled) setError(e.message || 'Failed to load functions');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load({ allowRefresh: true });

        // Settings has a "refresh function catalog" action — stay in sync.
        const onRefreshed = () => load();
        window.addEventListener('amox_catalog_refreshed', onRefreshed);
        return () => {
            cancelled = true;
            window.removeEventListener('amox_catalog_refreshed', onRefreshed);
        };
    }, []);

    const categories = useMemo(() => {
        const set = new Set();
        all.forEach(f => { if (f.category) set.add(f.category); });
        return ['all', ...[...set].sort()];
    }, [all]);

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        let list = category === 'all' ? all : all.filter(f => f.category === category);
        if (term) {
            list = list.filter(f =>
                f.function_name.toLowerCase().includes(term) ||
                (f.description || '').toLowerCase().includes(term)
            );
            list = [...list].sort((a, b) => {
                const an = a.function_name.toLowerCase(), bn = b.function_name.toLowerCase();
                const as = an.startsWith(term) ? 0 : 1, bs = bn.startsWith(term) ? 0 : 1;
                return as - bs || an.localeCompare(bn);
            });
        } else {
            list = [...list].sort((a, b) => a.function_name.localeCompare(b.function_name));
        }
        return list;
    }, [all, q, category]);

    // Description + examples for the selected function. Curated entries carry a
    // markdown `doc` with fenced SQL examples inside; engine-only entries just
    // have a plain `description`. Both paths converge here.
    const detail = useMemo(() => {
        if (!selected) return { text: '', examples: [] };
        const { text, blocks } = parseDoc(selected.doc);
        const extra = (Array.isArray(selected.examples) ? selected.examples : [])
            .map(ex => (typeof ex === 'string' ? ex : (ex.query || ex.sql || ex.code || '')))
            .filter(Boolean);
        return {
            text: text || selected.description || '',
            examples: [...blocks, ...extra],
        };
    }, [selected]);

    const copy = async (text, key) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(c => (c === key ? '' : c)), 1500);
        } catch { /* noop */ }
    };

    return (
        <div className="fnref">
            <div className="fnref-header">
                <div className="fnref-title"><LuBookOpen size={14} /> Functions</div>
                <div className="fnref-search">
                    <LuSearch size={13} />
                    <input
                        ref={searchRef}
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Search functions…"
                        spellCheck={false}
                    />
                    {q && <button className="fnref-clear" onClick={() => { setQ(''); searchRef.current?.focus(); }} title="Clear"><LuX size={12} /></button>}
                </div>
                {categories.length > 1 && (
                    <select className="fnref-cat" value={category} onChange={e => setCategory(e.target.value)}>
                        {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
                    </select>
                )}
            </div>

            {loading ? (
                <div className="fnref-empty">Loading DuckDB functions…</div>
            ) : error ? (
                <div className="fnref-empty fnref-error"><LuTriangleAlert size={15} /> {error}</div>
            ) : (
                <div className="fnref-body">
                    <div className="fnref-list">
                        <div className="fnref-count">{filtered.length} function{filtered.length === 1 ? '' : 's'}</div>
                        {filtered.map(fn => (
                            <button
                                key={fn.function_name}
                                className={`fnref-item${selected?.function_name === fn.function_name ? ' fnref-item--active' : ''}`}
                                onClick={() => setSelected(fn)}
                            >
                                <span className="fnref-item-name">{fn.function_name}</span>
                                {fn.function_type && <span className="fnref-item-type">{TYPE_LABEL[fn.function_type] || fn.function_type}</span>}
                            </button>
                        ))}
                        {filtered.length === 0 && <div className="fnref-empty">No matches for “{q}”.</div>}
                    </div>

                    {selected && (
                        <div className="fnref-detail">
                            <div className="fnref-detail-head">
                                <span className="fnref-detail-name">{selected.function_name}</span>
                                <div className="fnref-detail-badges">
                                    {selected.function_type && <span className="fnref-badge">{TYPE_LABEL[selected.function_type] || selected.function_type}</span>}
                                    {selected.category && <span className="fnref-badge fnref-badge--cat">{selected.category}</span>}
                                    {selected.documented === false && <span className="fnref-badge fnref-badge--undoc" title="Auto-generated from the engine (no curated doc)">auto</span>}
                                </div>
                                <button className="fnref-detail-close" onClick={() => setSelected(null)} title="Close"><LuX size={14} /></button>
                            </div>

                            <div className="fnref-sig-row">
                                <code className="fnref-sig">{buildSignature(selected)}</code>
                                <button className="fnref-copy" onClick={() => copy(callTemplate(selected), 'sig')} title="Copy call">
                                    {copied === 'sig' ? <LuCheck size={13} /> : <LuCopy size={13} />}
                                </button>
                            </div>

                            {selected.return_type && (
                                <div className="fnref-ret"><span>Returns</span> <code>{selected.return_type}</code></div>
                            )}

                            {detail.text && <p className="fnref-desc">{detail.text}</p>}

                            {detail.examples.length > 0 && (
                                <div className="fnref-examples">
                                    <div className="fnref-examples-title">Examples</div>
                                    {detail.examples.map((text, i) => (
                                        <div className="fnref-example" key={i}>
                                            <code>{text}</code>
                                            <button className="fnref-copy" onClick={() => copy(text, `ex${i}`)} title="Copy example">
                                                {copied === `ex${i}` ? <LuCheck size={12} /> : <LuCopy size={12} />}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
