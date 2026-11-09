/**
 * **El Assistant en cada tipo de archivo** (plan del Assistant, E2).
 *
 * Una pieza por tipo responde lo mismo: qué ofrece al empezar (`inicio`), dónde
 * está el usuario (`foco`), cómo se aplica y se describe una propuesta. En E2 lo
 * tienen completo el `.sql` y el texto; el notebook y Markdown en E3; Report Flow
 * y el gráfico en E4; Data Flow, Canvas y diagrama, solo su inicio hasta E5.
 *
 * Puro: no toca React ni Monaco.
 */
import { splitSqlStatements } from '../../../utils/sqlSplitter.js';
import { aplicarRango, describirRango, esDeRango } from './rango.js';
import { esDeCelda, describirCelda } from './cuaderno.js';
import { esDeLamina, describirLamina } from './deck.js';
import { esDeGrafico, describirGrafico } from './grafico.js';
import { esDePasos, describirPasos } from './flujo.js';
import { esDeTarjeta, describirTarjeta } from './lienzo.js';
import { esDeDiagrama, describirDiagrama } from './diagrama.js';

/** El tipo del Assistant para el `type` de una pestaña (el mismo que usa el servidor). */
export function tipoDePestana(type, ruta = '') {
    const t = String(type || '').toLowerCase();
    const porTipo = { sql: 'sql', sqlnb: 'cuaderno', notebook: 'cuaderno', md: 'markdown', amoxdeck: 'deck', amoxvis: 'grafico', sqlchain: 'flujo', chain: 'flujo', amoxcanvas: 'lienzo', amoxdiagram: 'diagrama', texto: 'texto' };
    if (porTipo[t]) return porTipo[t];
    const ext = String(ruta).toLowerCase().split('.').pop();
    return { sql: 'sql', sqlnb: 'cuaderno', md: 'markdown', amoxdeck: 'deck', amoxvis: 'grafico', sqlchain: 'flujo', amoxcanvas: 'lienzo', amoxdiagram: 'diagrama' }[ext] || 'texto';
}

/** ¿Se trabaja por líneas, con la revisión en el editor? (Markdown desde E3) */
export const porLineas = (tipo) => tipo === 'sql' || tipo === 'texto' || tipo === 'markdown';

/**
 * La sección de Markdown que contiene una línea: del encabezado anterior al
 * siguiente del mismo nivel o de uno mayor (M2). Los `#` dentro de un bloque de
 * código no cuentan. Sin encabezado antes, la sección es el principio del documento.
 * @returns {{ desde: number, hasta: number, titulo: string|null }}
 */
export function seccionEn(texto, linea) {
    const lineas = String(texto || '').replace(/\r/g, '').split('\n');
    const encabezados = [];   // { linea, nivel, titulo }
    let enCodigo = false;
    lineas.forEach((l, i) => {
        if (/^\s*(```|~~~)/.test(l)) enCodigo = !enCodigo;
        if (enCodigo) return;
        const m = /^(#{1,6})\s+(.*)$/.exec(l);
        if (m) encabezados.push({ linea: i + 1, nivel: m[1].length, titulo: m[2].trim() });
    });
    const propio = [...encabezados].reverse().find(e => e.linea <= linea) || null;
    const desde = propio ? propio.linea : 1;
    const siguiente = encabezados.find(e => e.linea > desde && (!propio || e.nivel <= propio.nivel));
    let hasta = siguiente ? siguiente.linea - 1 : lineas.length;
    while (hasta > desde && !lineas[hasta - 1].trim()) hasta--;
    return { desde, hasta, titulo: propio ? propio.titulo : null };
}

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
        ...(tipo === 'markdown' ? { seccion: seccionEn(texto, lineaCursor) } : {}),
    };
}

/** ¿La selección merece la barra? Más de una palabra (decisión 1). */
export function seleccionConBarra(texto) {
    return /\S\s+\S/.test(String(texto || '').trim());
}

// ── Lo que se ofrece al empezar (A6) ────────────────────────────────────────

/** La pregunta de cada etapa de Story Flow (E4, V3): etiqueta y lo que se envía. */
export const PREGUNTA_DE_ETAPA = {
    type: ['Which chart tells this best?', 'Which chart type tells this data best? Propose it.'],
    data: ['What goes where?', 'Which columns should go on each axis of this chart? Propose them.'],
    format: ['Make it readable', 'Format this chart so its numbers and labels read at a glance.'],
    style: ['Make it readable in a slide', 'Make this chart readable in a slide: colors, labels and legend.'],
    story: ['Write the takeaway', 'Write the title and the takeaway of this chart from what the data shows.'],
    export: ['Is it ready to share?', 'Is this chart ready to share? What would you fix first?'],
};

const ARCHIVOS_CONOCIDOS = [
    [/(^|\/)context\/metrics\.ya?ml$/i, [['Add a measure', 'Add a measure to this file. Ask me which one if it is not clear.'], ['Check the measures', 'Check every measure in this file: does each one run, and is its definition clear?']]],
    [/(^|\/)context\/joins\.ya?ml$/i, [['Check the joins', 'Check the joins in this file against the tables of the database: do the keys exist and are they unique where they should be?']]],
    [/(^|\/)rules\.md$/i, [['Add a rule', 'Add a rule to this file. Ask me what it should say if it is not clear.'], ['Check the rules', 'Check these rules: are any unclear, contradictory or impossible to follow?']]],
    [/(^|\/)context\/glossary\.md$/i, [['Add a term', 'Add a term to this glossary. Ask me which one if it is not clear.'], ['Find missing terms', 'Which words used in the tables or queries of this project are missing from this glossary?']]],
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
    if (tipo === 'texto' || tipo === 'markdown') {
        // Los archivos del proyecto que son contexto de la IA (T3, M3) tienen lo suyo.
        const ruta = String(info.path || '').replace(/\\/g, '/');
        const conocido = ARCHIVOS_CONOCIDOS.find(([re]) => re.test(ruta));
        if (conocido) return conocido[1].map(([e, p]) => s(e, p));
        if (tipo === 'texto') return contenido ? [s('Explain this file', 'Explain what this file does.'), s('Check it', 'Check this file for mistakes.')] : [];
    }
    // E3: en el notebook, la celda en la que está cuenta (su error, su resultado).
    if (tipo === 'cuaderno') {
        const out = [];
        if (info.resultsError) out.push(s('Fix this cell', 'Fix the error in this cell.', true));
        if (info.results?.data?.length) out.push(s('Chart this cell', 'Chart the result of this cell.'));
        if (info.foco?.celda) out.push(s('Explain this cell', 'Explain this cell.'));
        out.push(s('Summarize this notebook', 'Summarize what this notebook finds.'), s('What is missing?', 'What would you add to this analysis?'));
        return out;
    }
    // E4: en un deck, la lámina en la que está; en un gráfico, la etapa de Story Flow.
    if (tipo === 'deck') {
        const out = [];
        if (info.foco?.lamina) {
            out.push(s('Tighten this slide', 'Tighten the text of this slide: one clear point, fewer words.'));
            out.push(s('Write the headline from the chart', 'Write the headline of this slide from what its chart shows.'));
        }
        out.push(s('Review the story', 'Review this deck: does each slide make one clear point?'), s('Add a slide after this one', 'Add a slide after this one that the story is missing.'));
        return out;
    }
    if (tipo === 'grafico') {
        const pregunta = PREGUNTA_DE_ETAPA[info.foco?.grafico?.etapa];
        const out = pregunta ? [s(pregunta[0], pregunta[1])] : [];
        out.push(s('Explain this chart', 'Explain what this chart shows.'), s('Is it the right chart?', 'Is this the right chart for this data? What would you change?'));
        return out;
    }
    // E5: el paso, la tarjeta o la caja en la que está.
    if (tipo === 'flujo') {
        const out = [];
        if (info.resultsError) out.push(s('Fix this step', 'Fix the error in this step.', true));
        if (info.foco?.paso) out.push(s('Explain this step', 'Explain what this step does.'));
        out.push(s('Explain this flow', 'Explain what this Data Flow does, step by step.'), s('What could fail?', 'What could fail in this flow, and how would I notice?'));
        return out;
    }
    if (tipo === 'lienzo') {
        const out = [];
        if (info.foco?.tarjeta) out.push(s('Ask about this card', 'What does this card show, and what stands out?'));
        out.push(s('What should I look at next?', 'What should I look at next, given these cards? Propose it as cards.'), s('Explain this canvas', 'Explain what this canvas shows.'));
        return out;
    }
    if (tipo === 'diagrama') {
        const out = [];
        if (info.foco?.nodo) out.push(s('Expand this step', 'Expand this box into the steps it is made of.'));
        out.push(s('Draw with Assist…', 'Draw this diagram for me. Ask me what it should show if it is not clear.'), s('What is missing?', 'What is missing from this diagram?'));
        return out;
    }
    const porTipo = {
        markdown: [['Summarize it', 'Summarize this document in three lines.'], ['Tighten the writing', 'How can this document be clearer and shorter?']],
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
    if (esDeCelda(resultado)) return describirCelda(resultado, donde);
    if (esDeLamina(resultado)) return describirLamina(resultado, donde);
    if (esDeGrafico(resultado)) return describirGrafico(resultado);
    if (esDePasos(resultado)) return describirPasos(resultado);
    if (esDeTarjeta(resultado)) return describirTarjeta(resultado);
    if (esDeDiagrama(resultado)) return describirDiagrama(resultado);
    if (resultado?.action === 'propose_file') return `New file ${resultado.path}`;
    return 'Change to the file';
}
