import { API_BASE } from '../api.js';
import { useState, useEffect } from 'react';
import { LuSearch, LuClipboardCopy, LuPlus, LuTrash2, LuCode, LuChevronRight, LuChevronDown } from 'react-icons/lu';

const BUILT_IN_SNIPPETS = [
    {
        category: 'Window Functions',
        snippets: [
            { name: 'ROW_NUMBER', description: 'Assign row numbers within a partition', sql: `SELECT *,\n  ROW_NUMBER() OVER (\n    PARTITION BY \${partition_col}\n    ORDER BY \${order_col}\n  ) AS row_num\nFROM \${table_name}` },
            { name: 'Running Total', description: 'Cumulative sum over ordered rows', sql: `SELECT *,\n  SUM(\${value_col}) OVER (\n    PARTITION BY \${partition_col}\n    ORDER BY \${order_col}\n    ROWS UNBOUNDED PRECEDING\n  ) AS running_total\nFROM \${table_name}` },
            { name: 'LAG / LEAD', description: 'Access previous or next row values', sql: `SELECT *,\n  LAG(\${col}, 1) OVER (ORDER BY \${order_col}) AS prev_value,\n  LEAD(\${col}, 1) OVER (ORDER BY \${order_col}) AS next_value\nFROM \${table_name}` },
            { name: 'Percentile Rank', description: 'Rank as percentage within group', sql: `SELECT *,\n  PERCENT_RANK() OVER (\n    PARTITION BY \${partition_col}\n    ORDER BY \${value_col}\n  ) AS pct_rank\nFROM \${table_name}` },
        ]
    },
    {
        category: 'Aggregation Patterns',
        snippets: [
            { name: 'PIVOT (Crosstab)', description: 'Transform rows into columns', sql: `PIVOT \${table_name}\n  ON \${pivot_col}\n  USING SUM(\${value_col})\n  GROUP BY \${group_col}` },
            { name: 'UNPIVOT', description: 'Transform columns into rows', sql: `UNPIVOT \${table_name}\n  ON \${col1}, \${col2}, \${col3}\n  INTO\n    NAME category\n    VALUE amount` },
            { name: 'Year over Year', description: 'Compare metrics across years', sql: `SELECT\n  \${date_col},\n  \${metric},\n  LAG(\${metric}, 1) OVER (ORDER BY \${date_col}) AS prev_period,\n  ROUND((\${metric} - LAG(\${metric}, 1) OVER (ORDER BY \${date_col})) * 100.0\n    / NULLIF(LAG(\${metric}, 1) OVER (ORDER BY \${date_col}), 0), 2) AS pct_change\nFROM \${table_name}\nORDER BY \${date_col}` },
        ]
    },
    {
        category: 'Date Operations',
        snippets: [
            { name: 'Date Spine', description: 'Generate continuous date range', sql: `WITH date_spine AS (\n  SELECT UNNEST(\n    generate_series(\n      DATE '\${start_date}',\n      DATE '\${end_date}',\n      INTERVAL 1 DAY\n    )\n  ) AS date\n)\nSELECT * FROM date_spine` },
            { name: 'Date Truncate', description: 'Truncate dates by period', sql: `SELECT\n  DATE_TRUNC('\${period}', \${date_col}) AS period_start,\n  COUNT(*) AS count,\n  SUM(\${value_col}) AS total\nFROM \${table_name}\nGROUP BY 1\nORDER BY 1` },
        ]
    },
    {
        category: 'Data Quality',
        snippets: [
            { name: 'Null Check', description: 'Analyze null distribution per column', sql: `SELECT\n  COUNT(*) AS total_rows,\n  COUNT(\${col}) AS non_null,\n  COUNT(*) - COUNT(\${col}) AS null_count,\n  ROUND((COUNT(*) - COUNT(\${col})) * 100.0 / COUNT(*), 2) AS null_pct\nFROM \${table_name}` },
            { name: 'Duplicate Finder', description: 'Find duplicate rows by key', sql: `SELECT \${key_cols}, COUNT(*) AS dup_count\nFROM \${table_name}\nGROUP BY \${key_cols}\nHAVING COUNT(*) > 1\nORDER BY dup_count DESC` },
            { name: 'Outlier Detection (IQR)', description: 'Find outliers using interquartile range', sql: `WITH stats AS (\n  SELECT\n    QUANTILE_CONT(\${col}, 0.25) AS q1,\n    QUANTILE_CONT(\${col}, 0.75) AS q3\n  FROM \${table_name}\n)\nSELECT t.*\nFROM \${table_name} t, stats s\nWHERE t.\${col} < s.q1 - 1.5 * (s.q3 - s.q1)\n   OR t.\${col} > s.q3 + 1.5 * (s.q3 - s.q1)` },
        ]
    },
    {
        category: 'DuckDB Specific',
        snippets: [
            { name: 'Read CSV', description: 'Import CSV with auto-detection', sql: `SELECT * FROM read_csv_auto('\${file_path}')` },
            { name: 'Read Parquet', description: 'Query Parquet files directly', sql: `SELECT * FROM read_parquet('\${file_path}')` },
            { name: 'SUMMARIZE', description: 'Quick profile of a table', sql: `SUMMARIZE \${table_name}` },
            { name: 'Export to Parquet', description: 'Export query results to Parquet', sql: `COPY (\n  SELECT * FROM \${table_name}\n) TO '\${output_path}' (FORMAT PARQUET)` },
        ]
    },
    {
        category: 'DBT Models',
        snippets: [
            { name: 'Staging Model', description: 'Standard staging pattern with source ref', sql: `{{\n  config(\n    materialized='view'\n  )\n}}\n\nWITH source AS (\n    SELECT * FROM {{ source('source_name', 'table_name') }}\n),\n\nrenamed AS (\n    SELECT\n        id,\n        name,\n        created_at,\n        updated_at\n    FROM source\n)\n\nSELECT * FROM renamed` },
            { name: 'Intermediate Model', description: 'Join pattern with ref()', sql: `{{\n  config(\n    materialized='view'\n  )\n}}\n\nWITH model_a AS (\n    SELECT * FROM {{ ref('stg_model_a') }}\n),\n\nmodel_b AS (\n    SELECT * FROM {{ ref('stg_model_b') }}\n),\n\njoined AS (\n    SELECT\n        a.id,\n        a.name,\n        b.metric_value\n    FROM model_a a\n    LEFT JOIN model_b b ON a.id = b.foreign_id\n)\n\nSELECT * FROM joined` },
            { name: 'Mart Model', description: 'Final mart table with config', sql: `{{\n  config(\n    materialized='table'\n  )\n}}\n\nWITH final AS (\n    SELECT\n        id,\n        category,\n        status,\n        total_amount,\n        created_at\n    FROM {{ ref('int_model_name') }}\n)\n\nSELECT * FROM final` },
            { name: 'Incremental Model', description: 'Incremental with is_incremental() guard', sql: `{{\n  config(\n    materialized='incremental',\n    unique_key='id'\n  )\n}}\n\nSELECT\n    id,\n    status,\n    amount,\n    updated_at\nFROM {{ source('source_name', 'table_name') }}\n\n{% if is_incremental() %}\n    WHERE updated_at > (SELECT MAX(updated_at) FROM {{ this }})\n{% endif %}` },
            { name: 'Snapshot (SCD Type 2)', description: 'Snapshot with timestamp strategy', sql: `{% snapshot snap_orders %}\n\n{{\n  config(\n    target_schema='snapshots',\n    unique_key='id',\n    strategy='timestamp',\n    updated_at='updated_at'\n  )\n}}\n\nSELECT * FROM {{ source('source_name', 'orders') }}\n\n{% endsnapshot %}` },
            { name: 'Custom Test', description: 'Data test template', sql: `-- Custom data test: should return 0 rows to pass\n\nSELECT *\nFROM {{ ref('model_name') }}\nWHERE column_name IS NULL\n  AND required_flag = true` },
            { name: 'Macro Template', description: 'Reusable Jinja macro', sql: `{% macro generate_schema_name(custom_schema_name, node) %}\n    {% if custom_schema_name %}\n        {{ custom_schema_name | trim }}\n    {% else %}\n        {{ target.schema }}\n    {% endif %}\n{% endmacro %}` },
            { name: 'Source Config', description: 'Source YAML as SQL comment reference', sql: `-- sources.yml reference:\n-- version: 2\n-- sources:\n--   - name: raw_data\n--     schema: main\n--     tables:\n--       - name: orders\n--         description: Raw orders table\n--       - name: customers\n--         description: Raw customers table\n\nSELECT * FROM {{ source('raw_data', 'orders') }}` },
        ]
    },
];

const SnippetsPanel = ({ onInsert }) => {
    const [search, setSearch] = useState('');
    const [expandedCategories, setExpandedCategories] = useState({});
    const [customSnippets, setCustomSnippets] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newSnippet, setNewSnippet] = useState({ name: '', sql: '' });

    // Load custom snippets from server
    useEffect(() => {
        fetch(`${API_BASE}/api/snippets`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setCustomSnippets(data))
            .catch(() => { });
    }, []);

    const toggleCategory = (cat) => {
        setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    const handleCopy = (sql) => {
        navigator.clipboard.writeText(sql);
    };

    const handleInsert = (sql) => {
        if (onInsert) onInsert(sql);
    };

    const handleAddCustom = async () => {
        if (!newSnippet.name || !newSnippet.sql) return;
        const updated = [...customSnippets, { name: newSnippet.name, sql: newSnippet.sql, description: 'Custom snippet' }];
        setCustomSnippets(updated);
        setNewSnippet({ name: '', sql: '' });
        setShowAddForm(false);
        // Persist
        try {
            await fetch(`${API_BASE}/api/snippets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
            });
        } catch (e) { /* silent */ }
    };

    const handleDeleteCustom = async (idx) => {
        const updated = customSnippets.filter((_, i) => i !== idx);
        setCustomSnippets(updated);
        try {
            await fetch(`${API_BASE}/api/snippets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
            });
        } catch (e) { /* silent */ }
    };

    const allCategories = [
        ...BUILT_IN_SNIPPETS,
        ...(customSnippets.length > 0 ? [{ category: 'My Snippets', snippets: customSnippets }] : []),
    ];

    const q = search.toLowerCase();
    const filteredCategories = allCategories.map(cat => ({
        ...cat,
        snippets: cat.snippets.filter(s =>
            !q || s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q) || s.sql.toLowerCase().includes(q)
        ),
    })).filter(cat => cat.snippets.length > 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div className="sidebar-header">
                <span>SQL Snippets</span>
                <div className="fe-header-actions">
                    <button
                        className="fe-header-btn"
                        onClick={() => setShowAddForm(!showAddForm)}
                        title="Add Custom Snippet"
                    >
                        <LuPlus size={14} />
                    </button>
                </div>
            </div>

            {/* Search */}
            <div style={{ padding: '14px 14px 8px' }}>
                <div className="fe-search">
                    <LuSearch size={13} className="fe-search-icon" />
                    <input
                        type="text"
                        className="fe-search-input"
                        placeholder="Search snippets..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Add Custom Form */}
            {showAddForm && (
                <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                        type="text"
                        placeholder="Snippet name..."
                        value={newSnippet.name}
                        onChange={e => setNewSnippet(prev => ({ ...prev, name: e.target.value }))}
                        style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px 8px', fontSize: '11px' }}
                    />
                    <textarea
                        placeholder="SQL code..."
                        rows={4}
                        value={newSnippet.sql}
                        onChange={e => setNewSnippet(prev => ({ ...prev, sql: e.target.value }))}
                        style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", resize: 'vertical' }}
                    />
                    <button
                        onClick={handleAddCustom}
                        style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '600', backgroundColor: 'var(--accent-color-user)', color: 'var(--button-text-color)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Save Snippet
                    </button>
                </div>
            )}

            {/* Snippet List */}
            <div style={{ flex: 1, overflowY: 'auto', paddingTop: '6px' }}>
                {filteredCategories.map(cat => {
                    const isExpanded = expandedCategories[cat.category] !== false; // default expanded
                    return (
                        <div key={cat.category}>
                            <div
                                onClick={() => toggleCategory(cat.category)}
                                style={{
                                    padding: '10px 14px 4px', display: 'flex', alignItems: 'center', gap: '6px',
                                    cursor: 'pointer', fontSize: '10px', fontWeight: 600,
                                    color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.5px',
                                }}
                            >
                                {isExpanded ? <LuChevronDown size={10} /> : <LuChevronRight size={10} />}
                                {cat.category}
                                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
                                <span style={{ fontSize: '9px', color: 'var(--text-disabled)' }}>{cat.snippets.length}</span>
                            </div>
                            {isExpanded && cat.snippets.map((snip, idx) => (
                                <div
                                    key={`${cat.category}-${idx}`}
                                    className="file-item"
                                    style={{
                                        padding: '8px 14px 8px 28px', display: 'flex', flexDirection: 'column', gap: '3px',
                                        cursor: 'pointer', fontSize: '12px',
                                    }}
                                    onClick={() => handleInsert(snip.sql)}
                                    title="Click to insert into editor"
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <LuCode size={12} color="var(--accent-primary)" />
                                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{snip.name}</span>
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                                            <span
                                                onClick={e => { e.stopPropagation(); handleCopy(snip.sql); }}
                                                title="Copy SQL"
                                                style={{ opacity: 0.5, display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                                            >
                                                <LuClipboardCopy size={12} />
                                            </span>
                                            {cat.category === 'My Snippets' && (
                                                <span
                                                    onClick={e => { e.stopPropagation(); handleDeleteCustom(idx); }}
                                                    title="Delete"
                                                    style={{ opacity: 0.5, display: 'flex', alignItems: 'center', color: '#e06c75' }}
                                                >
                                                    <LuTrash2 size={12} />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {snip.description && (
                                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', paddingLeft: '18px' }}>{snip.description}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    );
                })}
                {filteredCategories.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                        No snippets found
                    </div>
                )}
            </div>
        </div>
    );
};

export default SnippetsPanel;
