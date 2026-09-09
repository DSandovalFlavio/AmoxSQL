/**
 * AmoxSQL — Report Flow deck templates & snippet builders.
 *
 * Starter markdown for each deck layout (inserted from the Studio's Layouts
 * panel) plus small helpers to build a chart block or a whole new slide chunk,
 * and to split/rebuild a single slide (prose vs. chart) so the visual Design
 * editor can edit one slide at a time and re-serialize losslessly. The
 * markdown stays the single source of truth — the user never edits the raw
 * `.amoxdeck` directly (same relationship Story Flow has with its `.amoxvis`
 * JSON).
 */
import { parseAmoxChartBlock } from './deckParser';

const CHART_PLACEHOLDER = 'charts/example.amoxvis';
// `\r?\n` y no `\n`: en Windows un .amoxdeck guardado por cualquier editor
// llega con CRLF, y con el salto sin contemplar el retorno esta expresion no
// casaba. El grafico seguia dibujandose (lo pinta MarkdownPreview por su cuenta),
// asi que el fallo era invisible: lo unico que se perdia era el reparto en dos
// columnas de la lamina, que caia al cuerpo generico sin decir nada.
const AMOXCHART_FENCE_RE = /```amoxchart\r?\n([\s\S]*?)```/;
// Speaker notes (Fase 5): a fenced block, not an HTML comment, so multi-line
// notes containing arbitrary text (including a literal `-->`) round-trip
// without escaping — same reasoning as the amoxchart block above.
const NOTES_FENCE_RE = /```notes\r?\n([\s\S]*?)```/;

// La cerca de un bloque va por variable y no escrita a mano: tres acentos
// graves dentro de un template literal de JS hay que escaparlos uno a uno, y
// eso se rompe en cuanto alguien edita la plantilla.
const F = '`' + '`' + '`';

/** Body markdown (WITHOUT the layout directive) seeded for each layout. */
export const DECK_LAYOUT_TEMPLATES = {
    // ── Apertura ──
    cover: `# Deck title

## What this answers, in one line`,

    section: `# Section name`,

    closing: `# Thank you

## Questions, or the detail behind any number`,

    // ── Evidencia ──
    finding: `## The claim this slide can defend

Short narrative. The query re-runs on **Refresh all**, so the chart stays
current without redoing the analysis.

${F}amoxchart
src: ${CHART_PLACEHOLDER}
${F}`,

    'chart-full': `## A chart that needs the whole width

${F}amoxchart
src: ${CHART_PLACEHOLDER}
${F}`,

    'chart-grid': `## Same shape, one per category

Small multiples share one vertical scale — otherwise the comparison lies.

${F}amoxchart
src: ${CHART_PLACEHOLDER}
${F}`,

    compare: `## Before and after, and which one wins

${F}amoxchart
src: ${CHART_PLACEHOLDER}
${F}`,

    // ── Dato ──
    summary: `## If you only read one slide, read this

${F}kpis
- label: Total cost
  value: $1.24M
  delta: +18.4%
  trend: bad
  base: vs. previous period
- label: Clicks
  value: 486K
  delta: +6.1%
${F}

- First finding
- Second finding
- Third finding`,

    metric: `${F}metric
value: 64
unit: "%"
label: What this number means
${F}`,

    table: `## The detail, ranked

${F}rank
columns: [Name, Value, Weight]
bar: Weight
highlight: 2
rows:
  - [First, $284K, 59]
  - [Second, $231K, 41]
  - [Third, $198K, 28]
${F}`,

    steps: `## How we get there

${F}steps
- title: First phase
  when: IN PROGRESS
  detail: What happens here
  state: active
- title: Second phase
  when: WEEK 2
- title: Decide
  when: WEEK 3
${F}`,

    actions: `## What we propose

${F}actions
- action: Do this first
  why: What it buys us, quantified
  owner: Team
  due: 8 Oct
- action: Then this
  owner: Team
  due: 15 Oct
${F}`,

    // ── Texto ──
    content: `## Section heading

Write your point here.

- First point
- Second point
- Third point`,

    statement: `# The one sentence you want remembered`,

    'two-col': `## Left column

- Point A
- Point B

<!-- col -->

## Right column

- Point C
- Point D`,

    method: `## How this is calculated

- **Metric** defined here, aggregated before dividing.
- **Period** compared against the previous one, both complete.
- **Exclusions** and why they were left out.

> [!warning]
> What this analysis does NOT say.`,
};

/**
 * A fenced amoxchart block referencing a `.amoxvis` file by project path.
 * `slot` coloca la figura en un hueco concreto de las láminas de varias
 * figuras; `card` fuerza o quita su tarjeta.
 */
export function buildChartBlock(src, { slot = null, card = null } = {}) {
    const lineas = ['src: ' + (src || CHART_PLACEHOLDER)];
    if (slot) lineas.push('slot: ' + slot);
    if (card === true || card === false) lineas.push('card: ' + card);
    return '```amoxchart\n' + lineas.join('\n') + '\n```';
}

/** A fenced notes block holding this slide's speaker notes verbatim. */
export function buildNotesBlock(notes) {
    return '```notes\n' + notes + '\n```';
}

/**
 * A complete slide chunk (layout directive + starter body) ready to be
 * inserted as a new slide. `content` is emitted without a directive since it
 * is the parser default.
 */
export function buildSlideSnippet(layout) {
    const body = DECK_LAYOUT_TEMPLATES[layout] || DECK_LAYOUT_TEMPLATES.content;
    const directive = layout && layout !== 'content' ? `<!-- layout: ${layout} -->\n` : '';
    return `${directive}${body}`;
}

/**
 * Splits a slide's body markdown (layout directive already stripped by the
 * parser) into its editable prose, its single chart reference, and its
 * speaker notes. In this visual model a slide holds at most one chart and
 * one notes block; extra amoxchart/notes blocks (if a user hand-authored
 * them in Source view) are left inside `prose` untouched.
 */
export function splitSlideContent(markdown) {
    let rest = markdown || '';
    const charts = [];
    let notes = '';

    // Todas las figuras, no sólo la primera. Antes se tomaba una y las demás se
    // quedaban dentro de la prosa, donde se pintaban sueltas y sin sitio: por
    // eso una rejilla de small multiples era imposible de montar.
    const global = new RegExp(AMOXCHART_FENCE_RE.source, 'g');
    let m;
    const trozos = [];
    let cursor = 0;
    while ((m = global.exec(rest)) !== null) {
        const bloque = parseAmoxChartBlock(m[1]);
        if (bloque.src) {
            charts.push({
                src: bloque.src,
                slot: bloque.slot || null,
                card: bloque.card === true ? true : (bloque.card === false ? false : null),
            });
        }
        trozos.push(rest.slice(cursor, m.index));
        cursor = m.index + m[0].length;
    }
    trozos.push(rest.slice(cursor));
    rest = trozos.join('');

    const notesMatch = rest.match(NOTES_FENCE_RE);
    if (notesMatch) {
        notes = notesMatch[1].replace(/\r?\n$/, '');
        rest = rest.slice(0, notesMatch.index) + rest.slice(notesMatch.index + notesMatch[0].length);
    }

    // Sacar N bloques deja N huecos de líneas en blanco pegados. Se colapsan a
    // una línea vacía, que es lo que el autor escribió entre párrafos: si no,
    // la prosa vuelve al archivo con el hueco dentro y va creciendo con cada
    // edición.
    rest = rest.replace(/\n{3,}/g, '\n\n');

    // `chartSrc` se mantiene para todo lo que sólo entiende de una figura —el
    // hueco del diseñador, el pie, el export— y siempre es la primera.
    return { prose: rest.trim(), chartSrc: charts[0]?.src || null, charts, notes };
}

/**
 * Rebuilds a slide's raw chunk (directive + prose + optional chart block +
 * optional notes block) from its parts — the write-side counterpart to
 * splitSlideContent. `content` emits no directive since it's the parser
 * default. Notes are appended last so they never interrupt the prose/chart
 * reading order in Source view.
 */
export function buildSlideRaw({ layout, eyebrow, footer, tone, prose, chartSrc, charts, notes }) {
    const directive = layout && layout !== 'content' ? `<!-- layout: ${layout} -->\n` : '';
    // El antetítulo es una directiva, no prosa: si no se vuelve a escribir aquí,
    // editar el texto de la lámina lo borraría en silencio.
    const eyebrowDirective = (eyebrow !== null && eyebrow !== undefined)
        ? `<!-- eyebrow: ${eyebrow} -->\n`
        : '';
    const footerDirective = (footer !== null && footer !== undefined)
        ? `<!-- footer: ${footer} -->\n`
        : '';
    const toneDirective = tone ? `<!-- tone: ${tone} -->\n` : '';
    const parts = [];
    const trimmedProse = (prose || '').trim();
    if (trimmedProse) parts.push(trimmedProse);
    // `charts` manda cuando viene; `chartSrc` es el atajo de una sola figura y
    // se sigue aceptando para no tocar a quien ya lo usaba.
    if (Array.isArray(charts)) {
        for (const c of charts) {
            if (c?.src) parts.push(buildChartBlock(c.src, { slot: c.slot, card: c.card }));
        }
    } else if (chartSrc) {
        parts.push(buildChartBlock(chartSrc));
    }
    const trimmedNotes = (notes || '').trim();
    if (trimmedNotes) parts.push(buildNotesBlock(trimmedNotes));
    return `${directive}${eyebrowDirective}${footerDirective}${toneDirective}${parts.join('\n\n')}`.trim();
}
