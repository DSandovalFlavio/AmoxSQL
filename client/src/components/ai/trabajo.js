import { esPropuesta } from './propuestas.js';

/**
 * El trabajo de una respuesta, en una línea (E6/A5): «Ran 2 queries · read 1 table ·
 * proposed 1 change». En el Assistant la respuesta va primero y esto, plegado debajo.
 */
export function resumenDelTrabajo(toolCalls = []) {
    const n = (f) => toolCalls.filter(f).length;
    const plural = (k, uno, varios) => (k === 1 ? uno : varios.replace('#', k));
    const partes = [];
    const consultas = n(tc => tc.toolName === 'execute_sql');
    const fallidas = n(tc => tc.toolName === 'execute_sql' && (tc.result?.error || !tc.result));
    if (consultas) partes.push(`${plural(consultas, 'ran 1 query', 'ran # queries')}${fallidas ? ` (${fallidas} failed)` : ''}`);
    const tablas = n(tc => tc.toolName === 'describe_table' || tc.toolName === 'list_tables' || tc.toolName === 'profile_data');
    if (tablas) partes.push(plural(tablas, 'looked at 1 table', 'looked at # tables'));
    const archivos = n(tc => tc.toolName === 'read_file' || tc.toolName === 'attach_file');
    if (archivos) partes.push(plural(archivos, 'read 1 file', 'read # files'));
    const docs = n(tc => tc.toolName === 'lookup_duckdb_docs');
    if (docs) partes.push('checked the DuckDB docs');
    const propuestas = n(esPropuesta);
    if (propuestas) partes.push(plural(propuestas, 'proposed 1 change', 'proposed # changes'));
    const conocidas = new Set(['execute_sql', 'describe_table', 'list_tables', 'profile_data', 'read_file', 'attach_file', 'lookup_duckdb_docs', 'suggest_followups', 'display_chart', 'final_answer', 'build_notebook']);
    const otras = n(tc => !conocidas.has(tc.toolName) && !esPropuesta(tc));
    if (otras) partes.push(plural(otras, '1 more step', '# more steps'));
    const t = partes.join(' · ');
    return t ? t[0].toUpperCase() + t.slice(1) : '';
}
