import { RESULT_TYPE_LABELS } from '../components/chains/chainNodeTypes';

// Result types that are side-effects (no table to show) — a DML/DDL statement.
// A statement of one of these types renders as a one-line summary badge instead
// of an empty grid with a stray "Count" column.
export const SIDE_EFFECT_TYPES = new Set([
    'rows_updated', 'rows_inserted', 'rows_deleted',
    'table_created', 'view_created', 'table_dropped', 'view_dropped',
    'extension_installed', 'extension_loaded', 'file_exported',
]);

export const isSideEffectType = (t) => SIDE_EFFECT_TYPES.has(t);

/**
 * Human summary of a single execution result, folding in the affected-row count
 * and object name: "5 rows updated", "Table created: t", "Extension loaded: spatial".
 * `r` is anything shaped like { resultType, rowsAffected, rowCount, truncated, details }.
 */
export function describeResult(r) {
    if (!r) return '';
    const { resultType, rowsAffected, rowCount, truncated, details } = r;
    switch (resultType) {
        case 'rows_updated':
        case 'rows_inserted':
        case 'rows_deleted': {
            const verb = { rows_updated: 'updated', rows_inserted: 'inserted', rows_deleted: 'deleted' }[resultType];
            if (rowsAffected != null) return `${rowsAffected.toLocaleString()} row${rowsAffected === 1 ? '' : 's'} ${verb}`;
            return RESULT_TYPE_LABELS[resultType] || 'Done';
        }
        case 'table_created':       return details?.table ? `Table created: ${details.table}` : 'Table created';
        case 'view_created':        return details?.view ? `View created: ${details.view}` : 'View created';
        case 'table_dropped':       return details?.table ? `Table dropped: ${details.table}` : 'Table dropped';
        case 'view_dropped':        return details?.view ? `View dropped: ${details.view}` : 'View dropped';
        case 'extension_installed': return details?.extension ? `Extension installed: ${details.extension}` : 'Extension installed';
        case 'extension_loaded':    return details?.extension ? `Extension loaded: ${details.extension}` : 'Extension loaded';
        case 'file_exported':       return 'File exported';
        case 'query_result': {
            const n = rowCount ?? 0;
            return `${n.toLocaleString()}${truncated ? '+' : ''} row${n === 1 ? '' : 's'} returned`;
        }
        default: return RESULT_TYPE_LABELS[resultType] || 'Executed';
    }
}
