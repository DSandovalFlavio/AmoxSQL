/**
 * **El Assistant en cada tipo de archivo** (plan del Assistant, E2).
 *
 * Una pieza por tipo responde lo mismo: qué ofrece al empezar (`inicio`), dónde
 * está el usuario (`foco`), cómo se aplica y se describe una propuesta. En E2 lo
 * tienen completo el `.sql` y el texto; los demás tipos solo su inicio, hasta su
 * fase (notebook y Markdown en E3, Report Flow y gráfico en E4, Data Flow,
 * Canvas y diagrama en E5).
 *
 * Puro: no toca React ni Monaco.
 */
import { splitSqlStatements } from '../../../utils/sqlSplitter.js';
import { aplicarRango, describirRango, esDeRango } from './rango.js';

/** El tipo del Assistant para el `type` de una pestaña (el mismo que usa el servidor). */
export function tipoDePestana(type, ruta = '') {
    const t = String(type || '').toLowerCase();
    const porTipo = { sql: 'sql', sqlnb: 'cuaderno', notebook: 'cuaderno', md: 'markdown', amoxdeck: 'deck', amoxvis: 'grafico', sqlchain: 'flujo', chain: 'flujo', amoxcanvas: 'lienzo', amoxdiagram: 'diagrama', texto: 'texto' };
    if (porTipo[t]) return porTipo[t];
    const ext = String(ruta).toLowerCase().split('.').pop();
    return { sql: 'sql', sqlnb: 'cuaderno', md: 'markdown', amoxdeck: 'deck', amoxvis: 'grafico', sqlchain: 'flujo', amoxcanvas: 'lienzo', amoxdiagram: 'diagrama' }[ext] || 'texto';
}

/** ¿Se trabaja por líneas, con la revisión en el editor? */
export const porLineas = (tipo) => tipo === 'sql' || tipo === 'texto';

/**
 * La sentencia que contiene una línea (la misma que corre Ctrl+Alt+Enter).
 * @returns {{ desde: number, hasta: number } | null}
 */
export function sentenciaEn(texto, linea) {
    const stmts = splitSqlStatements(texto || '');
    if (!stmts.length) return null;
    let s = stmts[0];
    for (const x of stmts) { if (x.startLine <= linea) s = x; else break; }
    return { desde: s.startLine, hasta: s.startLine + s.raw.split('\n').length - 1 };
}

/**
 * El foco de un editor por líneas: la selección (si tiene más que espacios) y, en
 * SQL, la sentencia bajo el cursor.
 * @param {object} p - { texto, tipo, seleccion: { texto, desde, hasta } | null, lineaCursor }
 */
export function focoDeEditor({ texto, tipo, seleccion = null, lineaCursor = 1 }) {
    const conSeleccion = seleccion && String(seleccion.texto || '').trim() ? seleccion : null;
    return {
        seleccion: conSeleccion ? { texto: conSeleccion.texto, desde: conSeleccion.desde, hasta: conSeleccion.hasta } : null,
        sentencia: tipo === 'sql' ? sentenciaEn(texto, lineaCursor) : null,
    };
}

/** ¿La selección merece la barra? Más de una palabra (decisión 1). */
export function seleccionConBarra(texto) {
    return /\S\s+\S/.test(String(texto || '').trim());
}

// ── Lo que se ofrece al empezar (A6) ────────────────────────────────────────

const ARCHIVOS_CONOCIDOS = [
    [/(^|\/)context\/metrics\.ya?ml$/i, [['Add a measure', 'Add a measure to this file. Ask me which one if it is not clear.'], ['Check the measures', 'Check every measure in this file: does each one run, and is its definition clear?']]],
    [/(^|\/)context\/joins\.ya?ml$/i, [['Check the joins', 'Check the joins in this file against the tables of the database: do the keys exist and are they unique where they should be?']]],
    [/(^|\/)(models|snapshots|seeds)\/.*\.ya?ml$/i, [['Describe the columns', 'Write descriptions for the columns of these models that have none, based on the data.'], ['Suggest tests', 'Suggest dbt tests for these models (unique, not_null, accepted_values) based on the data.']]],
];

/**
 * Las sugerencias del inicio para este archivo y este estado.
 * @param {object} info - lo que da `getActiveTabInfo()` (type, path, content, results, resultsError)
 * @returns {Array<{ etiqueta: string, pregunta: string, aviso?: boolean }>}
 */
export function inicioDe(info) {
    if (!info) return [];
    const tipo = tipoDePestana(info.type, info.path);
    const contenido = String(info.content || '').trim();
    const s = (etiqueta, pregunta, aviso = false) => ({ etiqueta, pregunta, aviso });

    if (tipo === 'sql') {
        if (!contenido) return [s('Write a query…', 'Help me write a query. Ask me what I want to see.'), s('Show all tables', 'Show me all tables'), s('Describe the schema', 'Describe the schema')];
        const out = [];
        if (info.resultsError) out.push(s('Fix the error', 'Fix the error of the last run.', true));
        out.push(s('Explain this query', 'Explain this query step by step.'));
        if (info.results?.data?.length) {
            out.push(s('What stands out?', 'Explain this result: what stands out?'));
            out.push(s('Chart the result', 'Chart this result.'));
        } else {
            out.push(s('Optimize it', 'Optimize this query without changing its result.'));
        }
        out.push(s('Comment it', 'Add short comments to this query that explain each step.'));
        return out;
    }
    if (tipo === 'texto') {
        const ruta = String(info.path || '').replace(/\\/g, '/');
        const conocido = ARCHIVOS_CONOCIDOS.find(([re]) => re.test(ruta));
        if (conocido) return conocido[1].map(([e, p]) => s(e, p));
        return contenido ? [s('Explain this file', 'Explain what this file does.'), s('Check it', 'Check this file for mistakes.')] : [];
    }
    const porTipo = {
        cuaderno: [['Summarize this notebook', 'Summarize what this notebook finds.'], ['What is missing?', 'What would you add to this analysis?']],
        markdown: [['Summarize it', 'Summarize this document in three lines.'], ['Tighten the writing', 'How can this document be clearer and shorter?']],
        deck: [['Review the story', 'Review this deck: does each slide make one clear point?'], ['Suggest a headline', 'Suggest a better headline for each slide.']],
        grafico: [['Explain this chart', 'Explain what this chart shows.'], ['Is it the right chart?', 'Is this the right chart for this data? What would you change?']],
        flujo: [['Explain this flow', 'Explain what this Data Flow does, step by step.'], ['What could fail?', 'What could fail in this flow, and how would I notice?']],
        lienzo: [['Explain this canvas', 'Explain what this canvas shows.'], ['What should I look at next?', 'What should I look at next, given these cards?']],
        diagrama: [['Explain this diagram', 'Explain this diagram.'], ['What is missing?', 'What is missing from this diagram?']],
    };
    return (porTipo[tipo] || []).map(([e, p]) => s(e, p));
}

// ── Las propuestas por líneas ───────────────────────────────────────────────

/** El texto nuevo del archivo con una propuesta, o `{ error }`. */
export function aplicarPropuesta(texto, resultado) {
    if (esDeRango(resultado)) return aplicarRango(texto, resultado);
    if (resultado?.action === 'edit_file') return { texto: resultado.content ?? '' };
    return { error: 'This proposal cannot be applied to this file.' };
}

/** La línea del chat: «Change to lines 18–20». */
export function describirPropuesta(resultado, donde = null) {
    if (esDeRango(resultado)) {
        const d = donde || resultado.objetivo;
        return d.hasta < d.desde ? `Insert ${describirRango(resultado, donde)}` : `Change to ${describirRango(resultado, donde)}`;
    }
    if (resultado?.action === 'propose_file') return `New file ${resultado.path}`;
    return 'Change to the file';
}
