/**
 * Config-driven column lineage for chain nodes.
 *
 * Derives a node's OUTPUT columns and where each one comes from, purely from the
 * node's config + its upstream INPUT columns — no SQL parsing, no run required.
 * This is deterministic for the transforms whose shape is config-defined; for
 * data-dependent shapes (pivot/unpivot/join) it returns null so the UI can say
 * "run to see the output".
 *
 * Returns an array of { name, type?, from? } or null when it can't be derived
 * statically. `from` is a short human description of the source.
 */
export function computeOutputColumns(nodeType, config = {}, inputColumns = []) {
    const typeOf = (n) => (inputColumns.find(c => c.name === n)?.type) || undefined;
    const passthrough = () => inputColumns.map(c => ({ name: c.name, type: c.type, from: c.name }));

    switch (nodeType) {
        // Same columns as input — only rows change.
        case 'filter':
        case 'sort':
        case 'sample':
        case 'deduplicate':
        case 'rename_table':
        case 'clean':
        case 'merge_tables':
            return passthrough();

        case 'select_columns': {
            const cols = config.columns || [];
            return cols.map(c => ({ name: c.alias || c.name, type: typeOf(c.name), from: c.name }));
        }

        case 'add_column': {
            const extra = (config.newColumns || []).map(c => ({ name: c.name, from: c.expression || 'expression' }));
            return [...passthrough(), ...extra];
        }

        case 'type_cast': {
            const casts = config.casts || [];
            const castNames = new Set(casts.map(c => c.column));
            const base = inputColumns
                .filter(c => !castNames.has(c.name))
                .map(c => ({ name: c.name, type: c.type, from: c.name }));
            const casted = casts.map(c => ({ name: c.alias || c.column, type: c.targetType, from: `cast(${c.column})` }));
            return [...base, ...casted];
        }

        case 'group_aggregate': {
            const groups = (config.groupColumns || []).map(g => ({ name: g, type: typeOf(g), from: g }));
            const aggs = (config.aggregations || []).map(a => ({
                name: a.alias || `${String(a.func || '').toLowerCase()}_${a.column}`,
                from: `${a.func}(${a.column})`,
            }));
            return [...groups, ...aggs];
        }

        case 'date_ops': {
            const ops = config.operations || [];
            const aliasOf = (o) => ((o.alias && o.alias.trim()) ? o.alias.trim() : `${o.column}_${o.op}`);
            const replaced = new Set(ops.filter(o => aliasOf(o) === o.column).map(o => o.column));
            const base = inputColumns.filter(c => !replaced.has(c.name)).map(c => ({ name: c.name, type: c.type, from: c.name }));
            const extra = ops.map(o => ({ name: aliasOf(o), from: `${o.op}(${o.column})` }));
            return [...base, ...extra];
        }

        case 'ai_enrich': {
            const outName = (config.outputColumn && config.outputColumn.trim()) ? config.outputColumn.trim() : 'ai_result';
            const replaced = inputColumns.some(c => c.name === outName);
            const base = inputColumns
                .filter(c => c.name !== outName)
                .map(c => ({ name: c.name, type: c.type, from: c.name }));
            return [...base, { name: outName, type: 'VARCHAR', from: `ai.${config.task || 'classify'}(${config.inputColumn || '…'})` }];
        }

        case 'window_functions': {
            const wins = (config.windows || []).map(w => ({
                name: w.alias || String(w.func || '').toLowerCase(),
                from: `${w.func}() over (…)`,
            }));
            return [...passthrough(), ...wins];
        }

        case 'flatten': {
            if ((config.mode || 'fields') === 'explode') return null; // cardinality changes with the data
            const extra = (config.paths || []).filter(p => p && p.path).map(p => ({
                name: (p.alias && p.alias.trim()) ? p.alias.trim() : String(p.path).replace(/[^a-zA-Z0-9_]/g, '_'),
                from: `${config.column}.${p.path}`,
            }));
            return [...inputColumns.map(c => ({ name: c.name, type: c.type, from: c.name })), ...extra];
        }

        // Shape depends on the data, not the config — can't derive statically.
        case 'pivot':
        case 'unpivot':
        case 'join_tables':
            return null;

        default:
            return null;
    }
}
