/**
 * AmoxSQL — Report Flow deck → PowerPoint (.pptx) export.
 *
 * Charts are re-fetched and re-queried fresh (same `.amoxvis` → {{var}} →
 * /api/query pipeline as "Refresh all"), independent of what's on screen —
 * so an export always reflects current data, not a stale render. Chart
 * types with a native pptxgenjs mapping (bar/line/area/pie/donut/combo)
 * become real, editable PowerPoint charts; everything else (and anything
 * when the caller passes chartMode:'image') falls back to a PNG snapshot of
 * the already-mounted chart in the deck's Present view — which is why
 * export requires Present view: it's where every slide's chart is actually
 * rendered in the DOM to capture.
 *
 * Text is flattened to native pptx text runs (headings/bold/italic/bullets);
 * GFM tables become native pptx tables, and the slide's data blocks (kpis,
 * metric, steps, actions, rank) become native text boxes and tables — before,
 * `markdownToTextRuns` discarded anything fenced and the deck exported without
 * them, in silence.
 *
 * Formulas and Mermaid diagrams have no PowerPoint equivalent, so they are
 * captured already rendered from the Present view, like a chart type without a
 * native mapping. Inline images and code blocks are still out of scope.
 */
import { API_BASE } from '../api.js';
import html2canvas from 'html2canvas-pro';
import PptxGenJS from 'pptxgenjs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { injectEnvironmentVariables } from './injectEnvironmentVariables';
import yaml from 'js-yaml';
import { parseAmoxChartBlock, DECK_LAYOUT_ALIASES, resolveFooterFields } from './deckParser';
import { splitSlideContent } from './deckTemplates';
import { isNativeChartType, buildNativeSlideChartSpec } from './officeChartMapper';
import { COLOR_PALETTES } from '../components/DataVisualizer/constants';

const remarkProcessor = unified().use(remarkParse).use(remarkGfm);

// `\r?\n` y no `\n`: en Windows un .amoxdeck guardado por cualquier editor
// llega con CRLF, y con el salto sin contemplar el retorno esta expresion no
// casaba. El grafico seguia dibujandose (lo pinta MarkdownPreview por su cuenta),
// asi que el fallo era invisible: lo unico que se perdia era el reparto en dos
// columnas de la lamina, que caia al cuerpo generico sin decir nada.
const AMOXCHART_FENCE_RE = /```amoxchart\r?\n([\s\S]*?)```/;
// Speaker notes (Fase 5 — el slide como lienzo): same fenced-block convention
// as deckTemplates.js's NOTES_FENCE_RE, kept as a local copy here rather than
// importing — same "each export module is self-contained" pattern already
// used for AMOXCHART_FENCE_RE above.
const NOTES_FENCE_RE = /```notes\r?\n([\s\S]*?)```/;

const SLIDE_W = 13.333; // LAYOUT_WIDE (16:9 widescreen), inches
const SLIDE_H = 7.5;
const MARGIN = 0.5;
const COL_GAP = 0.4;
const FOOT_H = 0.3;     // la banda de procedencia, al pie

// Los bloques de dato de la lámina. Sin esto, `markdownToTextRuns` los ignora
// —descarta todo lo que sea código— y la diapositiva salía del export SIN sus
// KPIs, sin su cifra y sin su tabla clasificada, en silencio.
const DECK_BLOCK_RE = /```(kpis|metric|steps|actions|rank)\r?\n([\s\S]*?)```/g;

// Fórmulas en bloque y diagramas: se sacan del texto y entran como imagen.
const MATH_BLOCK_RE = /\$\$[\s\S]*?\$\$/g;
const MERMAID_FENCE_RE = /```mermaid\r?\n[\s\S]*?```/g;

/** ¿Hay fórmula en bloque o diagrama? Sin `/g`: `.test` sobre una expresión
 *  global avanza `lastIndex` y devuelve true y false alternativamente. */
const tieneMateOdiagrama = (t) => /\$\$[\s\S]*?\$\$/.test(t) || /```mermaid/.test(t);

const ESTADOS_PPT = { ok: 'On target', risk: 'At risk', bad: 'Off track' };
const VERDE = '17A673';
const ROJO = 'D9484D';
const GRIS = '6B7885';
const TINTA = '17202A';

/** Saca los bloques de dato del markdown y los devuelve ya parseados. */
export function extractDeckBlocks(markdown) {
    const bloques = [];
    const prosa = (markdown || '').replace(DECK_BLOCK_RE, (_, lang, cuerpo) => {
        try {
            bloques.push({ lang, datos: yaml.load(cuerpo) });
        } catch {
            // Un bloque mal escrito no puede tumbar el export entero: se
            // ignora aquí igual que la lámina enseña su error en pantalla.
        }
        return '';
    });
    return { prosa: prosa.replace(/\n{3,}/g, '\n\n').trim(), bloques };
}

const comoLista = (d) => (Array.isArray(d) ? d : (d?.items || []));

/** El color de una variación: lo decide el autor, no el signo. */
function colorDelta(trend, delta) {
    if (trend === 'good') return VERDE;
    if (trend === 'bad') return ROJO;
    if (trend === 'flat' || trend === 'neutral') return GRIS;
    const t = String(delta ?? '').trim();
    if (t.startsWith('-') || t.startsWith('−')) return ROJO;
    if (t.startsWith('+')) return VERDE;
    return GRIS;
}

/**
 * Pinta un bloque de dato dentro de `caja` y devuelve el alto consumido.
 * Se apila con un cursor vertical porque pptxgenjs coloca en absoluto: no hay
 * flujo que reparta el espacio por nosotros.
 */
function addBloque(slide, bloque, caja) {
    const { lang, datos } = bloque;

    if (lang === 'kpis') {
        const items = comoLista(datos).slice(0, 5);
        if (!items.length) return 0;
        const ancho = (caja.w - 0.2 * (items.length - 1)) / items.length;
        items.forEach((k, i) => {
            const x = caja.x + i * (ancho + 0.2);
            const runs = [];
            if (k?.label) runs.push({ text: String(k.label).toUpperCase() + '\n', options: { fontSize: 9, color: GRIS, bold: true, charSpacing: 1 } });
            runs.push({ text: String(k?.value ?? '—'), options: { fontSize: 28, bold: true, color: TINTA } });
            if (k?.delta) runs.push({ text: '  ' + k.delta, options: { fontSize: 12, bold: true, color: colorDelta(k.trend, k.delta) } });
            if (k?.base) runs.push({ text: '\n' + k.base, options: { fontSize: 9, color: GRIS } });
            slide.addText(runs, { x, y: caja.y, w: ancho, h: 1.0, valign: 'top' });
        });
        return 1.15;
    }

    if (lang === 'metric') {
        if (!datos || datos.value === undefined) return 0;
        slide.addText([
            { text: String(datos.value), options: { fontSize: 66, bold: true, color: TINTA } },
            ...(datos.unit ? [{ text: String(datos.unit), options: { fontSize: 28, bold: true, color: TINTA } }] : []),
            ...(datos.label ? [{ text: '\n' + String(datos.label).toUpperCase(), options: { fontSize: 10, color: GRIS, charSpacing: 1 } }] : []),
        ], { ...caja, h: 1.9, valign: 'top' });
        return 2.0;
    }

    if (lang === 'steps') {
        const items = comoLista(datos);
        if (!items.length) return 0;
        const ancho = (caja.w - 0.25 * (items.length - 1)) / items.length;
        items.forEach((p, i) => {
            slide.addText([
                { text: String(i + 1).padStart(2, '0') + (p?.when ? ' · ' + p.when : '') + '\n', options: { fontSize: 9, bold: true, color: GRIS, charSpacing: 1 } },
                { text: String(p?.title ?? '—'), options: { fontSize: 14, bold: true, color: TINTA } },
                ...(p?.detail ? [{ text: '\n' + p.detail, options: { fontSize: 10, color: GRIS } }] : []),
            ], { x: caja.x + i * (ancho + 0.25), y: caja.y, w: ancho, h: 1.3, valign: 'top' });
        });
        return 1.45;
    }

    if (lang === 'actions') {
        const items = comoLista(datos);
        if (!items.length) return 0;
        const alto = 0.62;
        items.forEach((a, i) => {
            const quien = [a?.owner, a?.due].filter(Boolean).join(' · ');
            slide.addText([
                { text: String(i + 1).padStart(2, '0') + '   ', options: { fontSize: 11, bold: true, color: GRIS } },
                { text: String(a?.action ?? '—'), options: { fontSize: 14, bold: true, color: TINTA } },
                ...(quien ? [{ text: '   ' + quien, options: { fontSize: 10, color: GRIS } }] : []),
                ...(a?.why ? [{ text: '\n        ' + a.why, options: { fontSize: 10, color: GRIS } }] : []),
            ], { x: caja.x, y: caja.y + i * alto, w: caja.w, h: alto, valign: 'top' });
        });
        return items.length * alto + 0.1;
    }

    if (lang === 'rank') {
        const columnas = datos?.columns;
        const filas = datos?.rows;
        if (!Array.isArray(columnas) || !Array.isArray(filas)) return 0;
        const iEstado = datos.status ? columnas.indexOf(datos.status) : -1;
        const iBarra = datos.bar ? columnas.indexOf(datos.bar) : -1;
        const maximo = iBarra >= 0 ? Math.max(...filas.map((f) => Math.abs(Number(f?.[iBarra])) || 0), 0) : 0;

        const cuerpo = filas.map((fila) => columnas.map((_, c) => {
            if (c === iEstado) {
                const e = String(fila?.[c] ?? '').trim().toLowerCase();
                return { text: ESTADOS_PPT[e] || String(fila?.[c] ?? ''), options: { color: e === 'ok' ? VERDE : e === 'bad' ? ROJO : GRIS, bold: true } };
            }
            // La barra no existe en PowerPoint: se aplana a su porcentaje, que
            // dice lo mismo sin fingir un dibujo que el formato no tiene.
            if (c === iBarra) {
                const v = Math.abs(Number(fila?.[c])) || 0;
                return { text: maximo > 0 ? Math.round((v / maximo) * 100) + '%' : '', options: { align: 'right' } };
            }
            return { text: String(fila?.[c] ?? '') };
        }));
        const cabecera = columnas.map((c) => ({ text: String(c), options: { bold: true, fill: { color: 'F1F3F5' } } }));
        const alto = Math.min(caja.h, 0.34 + filas.length * 0.3);
        slide.addTable([cabecera, ...cuerpo], {
            x: caja.x, y: caja.y, w: caja.w, h: alto,
            fontSize: 11, border: { type: 'solid', color: 'E4E8EC', pt: 0.5 },
        });
        return alto + 0.15;
    }

    return 0;
}

// ── Markdown → native pptx text runs ────────────────────────────────────────
// PowerPoint text boxes render a flat run list, not arbitrary markdown — this
// covers the common subset (headings, paragraphs, bold/italic, bullets,
// blockquotes). Tables are handled separately (see markdownTables); code
// blocks/images/math/Mermaid inside slide text are not flattened here.
function walkInlineToRuns(nodes, style, runs) {
    for (const node of nodes || []) {
        switch (node.type) {
            case 'text':
                if (node.value) runs.push({ text: node.value, options: { ...style } });
                break;
            case 'strong':
                walkInlineToRuns(node.children, { ...style, bold: true }, runs);
                break;
            case 'emphasis':
                walkInlineToRuns(node.children, { ...style, italic: true }, runs);
                break;
            case 'inlineCode':
                if (node.value) runs.push({ text: node.value, options: { ...style, fontFace: 'Consolas' } });
                break;
            case 'break':
                runs.push({ text: '', options: { ...style, breakLine: true } });
                break;
            default:
                if (node.children) walkInlineToRuns(node.children, style, runs);
        }
    }
}

export function markdownToTextRuns(markdown) {
    const tree = remarkProcessor.parse(markdown || '');
    const runs = [];
    for (const node of tree.children || []) {
        switch (node.type) {
            case 'heading': {
                const size = node.depth === 1 ? 28 : node.depth === 2 ? 22 : 18;
                const start = runs.length;
                walkInlineToRuns(node.children, { bold: true, fontSize: size }, runs);
                if (runs.length > start) runs[runs.length - 1].options.breakLine = true;
                break;
            }
            case 'paragraph': {
                const start = runs.length;
                walkInlineToRuns(node.children, {}, runs);
                if (runs.length > start) runs[runs.length - 1].options.breakLine = true;
                break;
            }
            case 'list': {
                for (const item of node.children) {
                    for (const child of item.children) {
                        if (child.type !== 'paragraph') continue;
                        const start = runs.length;
                        walkInlineToRuns(child.children, { bullet: true }, runs);
                        if (runs.length > start) runs[runs.length - 1].options.breakLine = true;
                    }
                }
                break;
            }
            case 'blockquote': {
                for (const child of node.children) {
                    if (child.type !== 'paragraph') continue;
                    const start = runs.length;
                    walkInlineToRuns(child.children, { italic: true, color: '666666' }, runs);
                    if (runs.length > start) runs[runs.length - 1].options.breakLine = true;
                }
                break;
            }
            default:
                break; // tables/code/images/thematicBreak — not flattened into text runs
        }
    }
    return runs;
}

// ── GFM tables → pptxgenjs rows (first table in the slide's text only) ─────
function firstMarkdownTable(markdown) {
    const tree = remarkProcessor.parse(markdown || '');
    const tableNode = (tree.children || []).find((n) => n.type === 'table');
    if (!tableNode) return null;
    return tableNode.children.map((rowNode, r) => rowNode.children.map((cellNode) => ({
        text: cellNode.children.map((c) => c.value || '').join(''),
        options: r === 0 ? { bold: true, fill: { color: 'F1F3F5' } } : {},
    })));
}

// ── Live chart data — re-fetch + re-run, independent of the DOM ────────────
async function loadChartData(src, variables) {
    const cleanPath = (src || '').replace(/^(\.\/|\/)/, '');
    const fileRes = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(cleanPath)}`);
    const fileData = await fileRes.json();
    if (fileData.error) throw new Error(fileData.error);

    const config = JSON.parse(fileData.content);
    const query = injectEnvironmentVariables(config.query || '', variables);
    if (!query.trim()) throw new Error('No stored query');

    const queryRes = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    const queryData = await queryRes.json();
    if (!queryRes.ok) throw new Error(queryData.error || 'Query failed');
    return { data: queryData.data, config };
}

// ── Image fallback — capture the already-mounted chart from Present view ──
async function captureChartImage(el) {
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, logging: false, useCORS: true });
    return canvas.toDataURL('image/png');
}

// ── Layout → slide region coordinates (inches) ─────────────────────────────
// Exported: also used by generateNotebookPptxReport.js, which reuses the
// exact same slide geometry so a notebook export and a deck export of an
// equivalent chart+text pairing come out sized the same way.
export function layoutBoxes(layout) {
    const full = { x: MARGIN, y: MARGIN, w: SLIDE_W - MARGIN * 2, h: SLIDE_H - MARGIN * 2 - FOOT_H };
    // Se aceptan también los nombres antiguos: esta función es pública y la
    // llama el export de notebooks con cadenas propias, no con las que ya
    // normalizó el parser del deck.
    const canonico = DECK_LAYOUT_ALIASES[layout] || layout;
    if (canonico === 'finding' || canonico === 'compare' || canonico === 'two-col') {
        const colW = (SLIDE_W - MARGIN * 2 - COL_GAP) / 2;
        return {
            text: { x: MARGIN, y: MARGIN, w: colW, h: SLIDE_H - MARGIN * 2 - FOOT_H },
            chart: { x: MARGIN + colW + COL_GAP, y: MARGIN, w: colW, h: SLIDE_H - MARGIN * 2 - FOOT_H },
        };
    }
    return { full };
}

/**
 * @param {{frontMatter, slides}} deck - result of deckParser.parseDeck()
 * @param {Object} opts
 * @param {'native'|'image'} [opts.chartMode] - default chart rendering mode
 * @param {Map<string,HTMLElement>} [opts.slideCardEls] - slideId → mounted
 *   `.deck-slide-card` element (from Present view), used for the image
 *   fallback path only.
 */
export async function generatePptxReport(deck, { chartMode = 'native', slideCardEls = new Map() } = {}) {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    if (deck.frontMatter?.title) pptx.title = deck.frontMatter.title;

    const variables = deck.frontMatter?.variables || {};

    for (const [indice, slideDef] of deck.slides.entries()) {
        const slide = pptx.addSlide();
        const boxes = layoutBoxes(slideDef.layout);

        // Mismo troceado que usa la lámina en pantalla: así el export no puede
        // discrepar de lo que el autor vio al diseñarla.
        const { prose, charts, notes: speakerNotes } = splitSlideContent(slideDef.markdown);
        const { prosa: prosaConMate, bloques } = extractDeckBlocks(prose);
        const chartSrc = charts[0]?.src || null;

        // Fórmulas y diagramas: PowerPoint no sabe de LaTeX ni de Mermaid, y
        // `markdownToTextRuns` los dejaba caer o los escupía como código. Se
        // capturan ya renderizados de la vista Present —igual que un gráfico
        // sin equivalencia nativa— y se quitan del texto para que no salgan
        // dos veces.
        const cardParaCaptura = slideCardEls.get(slideDef.id);
        const dibujados = [];
        const conMate = tieneMateOdiagrama(prosaConMate);
        if (conMate && cardParaCaptura) {
            for (const el of cardParaCaptura.querySelectorAll('.katex-display, .mde-mermaid-wrap')) {
                try {
                    dibujados.push({
                        data: await captureChartImage(el),
                        alto: el.classList.contains('katex-display') ? 0.6 : 1.8,
                    });
                } catch { /* si no se deja capturar, se queda el texto fuente */ }
            }
        }
        const textMarkdown = dibujados.length
            ? prosaConMate.replace(MATH_BLOCK_RE, '').replace(MERMAID_FENCE_RE, '').replace(/\n{3,}/g, '\n\n').trim()
            : prosaConMate;

        if (speakerNotes.trim()) slide.addNotes(speakerNotes);

        const textBox = boxes.text || boxes.full;
        const table = firstMarkdownTable(textMarkdown);

        // Cursor vertical: prosa, luego los bloques en el orden en que se
        // escribieron. pptxgenjs coloca en absoluto, así que el reparto lo
        // llevamos nosotros.
        let cursorY = textBox.y;
        const runs = markdownToTextRuns(textMarkdown);
        if (runs.length) {
            const altoProsa = bloques.length ? Math.min(textBox.h * 0.42, 2.2) : (table ? textBox.h * 0.4 : textBox.h);
            slide.addText(runs, {
                x: textBox.x, y: cursorY, w: textBox.w, h: altoProsa,
                fontSize: 14, color: '333333', valign: 'top',
                align: (slideDef.layout === 'cover' || slideDef.layout === 'closing' || slideDef.layout === 'section') ? 'center' : 'left',
            });
            cursorY += altoProsa + 0.1;
        }
        for (const dib of dibujados) {
            const restante = textBox.y + textBox.h - cursorY;
            if (restante <= 0.3) break;
            const alto = Math.min(dib.alto, restante);
            slide.addImage({ data: dib.data, x: textBox.x, y: cursorY, w: textBox.w, h: alto, sizing: { type: 'contain', w: textBox.w, h: alto } });
            cursorY += alto + 0.12;
        }
        for (const bloque of bloques) {
            const restante = textBox.y + textBox.h - cursorY;
            if (restante <= 0.3) break;
            cursorY += addBloque(slide, bloque, { x: textBox.x, y: cursorY, w: textBox.w, h: restante });
        }
        if (table) {
            slide.addTable(table, {
                x: textBox.x, y: Math.max(cursorY, textBox.y + textBox.h * 0.45), w: textBox.w, h: textBox.h * 0.5,
                fontSize: 10, border: { type: 'solid', color: 'D0D5DA', pt: 0.5 },
            });
        }

        // ── El pie de procedencia ──
        const camposPie = resolveFooterFields({
            slideFooter: slideDef.footer,
            deckFooter: deck.frontMatter?.footer,
            layout: slideDef.layout,
            hasChart: !!chartSrc,
        });
        const piePartes = [];
        if (camposPie.includes('vars')) {
            for (const [k, v] of Object.entries(variables)) piePartes.push(`${k} = ${v}`);
        }
        const pieDerecha = camposPie.includes('number') ? String(indice + 1).padStart(2, '0') : '';

        if (chartSrc) {
            const chartBox = boxes.chart || boxes.full;
            try {
                const { data, config } = await loadChartData(chartSrc, variables);
                if (camposPie.includes('source') && config.chartSource) piePartes.unshift(config.chartSource);
                if (camposPie.includes('query')) piePartes.push(chartSrc.replace(/^.*[/\\]/, ''));
                if (camposPie.includes('rows')) piePartes.push(`${data.length} rows`);
                const useNative = chartMode === 'native' && isNativeChartType(config.chartType) && data.length > 0;

                if (useNative) {
                    const colors = COLOR_PALETTES[config.colorTheme] || COLOR_PALETTES.default;
                    const spec = buildNativeSlideChartSpec(config, data, colors);
                    if (spec?.multi) {
                        const typedSpec = spec.multiSpec.map((m) => ({ ...m, type: pptx.ChartType[m.type] }));
                        slide.addChart(typedSpec, null, { ...chartBox, ...spec.sharedOptions });
                    } else if (spec) {
                        slide.addChart(pptx.ChartType[spec.pptxType], spec.data, { ...chartBox, ...spec.options });
                    }
                } else {
                    const cardEl = slideCardEls.get(slideDef.id);
                    const chartEl = cardEl?.querySelector('.amoxchart-embed');
                    if (chartEl) {
                        const dataUrl = await captureChartImage(chartEl);
                        slide.addImage({ data: dataUrl, ...chartBox, sizing: { type: 'contain', w: chartBox.w, h: chartBox.h } });
                    } else {
                        slide.addText(`[Chart not available for image export: ${chartSrc} — open Present view first]`, { ...chartBox, fontSize: 12, color: '999999', align: 'center', valign: 'middle' });
                    }
                }
            } catch (err) {
                slide.addText(`[Chart failed to load: ${chartSrc} — ${err.message}]`, { ...chartBox, fontSize: 11, color: 'C0392B', align: 'center', valign: 'middle' });
            }

            // Las figuras que no son la primera: PowerPoint no sabe repartir
            // una rejilla, así que se capturan de la vista Present tal cual se
            // ven. Sin esto se perdían en silencio, que es lo que hacía el
            // export antes con TODAS las figuras salvo una.
            if (charts.length > 1) {
                const cardEl = slideCardEls.get(slideDef.id);
                const figuras = [...(cardEl?.querySelectorAll('.deck-figura .amoxchart-embed') || [])];
                if (figuras.length === charts.length) {
                    const cols = Math.min(2, figuras.length);
                    const filas = Math.ceil(figuras.length / cols);
                    const cw = (chartBox.w - 0.2 * (cols - 1)) / cols;
                    const ch = (chartBox.h - 0.2 * (filas - 1)) / filas;
                    for (let i = 0; i < figuras.length; i++) {
                        try {
                            const dataUrl = await captureChartImage(figuras[i]);
                            slide.addImage({
                                data: dataUrl,
                                x: chartBox.x + (i % cols) * (cw + 0.2),
                                y: chartBox.y + Math.floor(i / cols) * (ch + 0.2),
                                w: cw, h: ch, sizing: { type: 'contain', w: cw, h: ch },
                            });
                        } catch { /* una figura que no se deja capturar no tumba el export */ }
                    }
                } else {
                    slide.addText(
                        `[${charts.length - 1} more chart(s) on this slide need Present view to export]`,
                        { x: chartBox.x, y: chartBox.y + chartBox.h - 0.35, w: chartBox.w, h: 0.3, fontSize: 10, color: '999999', align: 'center' },
                    );
                }
            }
        }

        // El pie va el último para que lo escriba sobre lo que haya, y sólo si
        // la lámina lo quiere: la portada y el cierre no lo llevan.
        if (piePartes.length || pieDerecha) {
            const y = SLIDE_H - MARGIN - FOOT_H + 0.05;
            if (piePartes.length) {
                slide.addText(piePartes.join('  ·  '), {
                    x: MARGIN, y, w: SLIDE_W - MARGIN * 2 - 0.6, h: FOOT_H,
                    fontSize: 9, color: GRIS, fontFace: 'Consolas', valign: 'middle',
                });
            }
            if (pieDerecha) {
                slide.addText(pieDerecha, {
                    x: SLIDE_W - MARGIN - 0.6, y, w: 0.6, h: FOOT_H,
                    fontSize: 9, color: GRIS, fontFace: 'Consolas', align: 'right', valign: 'middle',
                });
            }
        }
    }

    const filename = `${(deck.frontMatter?.title || 'amoxsql-deck').replace(/[^\w-]+/g, '_')}.pptx`;
    await pptx.writeFile({ fileName: filename });
}
