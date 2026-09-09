/**
 * AmoxSQL — Report Flow deck parser (.amoxdeck)
 *
 * A deck is plain markdown with:
 *   - An optional YAML front-matter block (title, theme, aspect, variables).
 *   - Slides separated by a line containing exactly `---` (same convention
 *     as Marp/reveal-md — a horizontal-rule line is reserved as the slide
 *     separator; it is never treated as a "real" thematic break inside a
 *     slide).
 *   - An optional `<!-- layout: NAME -->` directive as the first line of a
 *     slide, choosing one of DECK_LAYOUTS (defaults to "content").
 *   - Charts embedded as fenced ```amoxchart blocks referencing a `.amoxvis`
 *     file by path (`src: charts/foo.amoxvis`), rendered inline by
 *     MarkdownPreview via its `renderChartBlock` hook.
 */
import yaml from 'js-yaml';

/**
 * Las quince disposiciones, agrupadas por familia. El orden es el del
 * catálogo del contrato (docs/dev/sistema_deck.html, apartado 06).
 *
 * Los identificadores van en inglés aunque los comentarios estén en español:
 * el formato ya lo estaba, y mezclar dos idiomas dentro del mismo archivo
 * sería peor que elegir uno. Lo que se traduce es lo que el usuario ve en el
 * Studio, no lo que se escribe en el `.amoxdeck`.
 */
export const DECK_LAYOUT_FAMILIES = [
    { key: 'apertura', label: 'Opening', layouts: ['cover', 'section', 'closing'] },
    { key: 'evidencia', label: 'Evidence', layouts: ['finding', 'chart-full', 'chart-grid', 'compare'] },
    { key: 'dato', label: 'Data', layouts: ['summary', 'metric', 'table', 'steps', 'actions'] },
    { key: 'texto', label: 'Text', layouts: ['content', 'statement', 'two-col', 'method'] },
];

export const DECK_LAYOUTS = DECK_LAYOUT_FAMILIES.flatMap((f) => f.layouts);

/**
 * Nombres antiguos que siguen abriéndose. Un `.amoxdeck` escrito antes del
 * catálogo no puede dejar de funcionar; al editar la lámina se reescribe con
 * el nombre nuevo, así que la migración ocurre sola y sin pedir permiso.
 */
export const DECK_LAYOUT_ALIASES = {
    title: 'cover',
    'content-chart': 'finding',
};

const DEFAULT_LAYOUT = 'content';
const LAYOUT_DIRECTIVE_RE = /^\s*<!--\s*layout:\s*([\w-]+)\s*-->\s*\n?/;
// Antetítulo: el hilo del deck (sección o periodo) que se repite lámina a
// lámina. Sale del front-matter (`section:`) y una lámina suelta puede
// sobreescribirlo con su propia directiva.
const EYEBROW_DIRECTIVE_RE = /^\s*<!--\s*eyebrow:\s*([^\n]*?)\s*-->\s*\n?/;
// Pie de procedencia: qué campos enseña esta lámina. `false` lo apaga.
const FOOTER_DIRECTIVE_RE = /^\s*<!--\s*footer:\s*([^\n]*?)\s*-->\s*\n?/;
// Tono: sobre qué fondo se lee la lámina.
const TONE_DIRECTIVE_RE = /^\s*<!--\s*tone:\s*([\w-]+)\s*-->\s*\n?/;

/**
 * El tono de una lámina.
 *
 *   theme   sigue el tema de la app (el defecto — nunca sorprende)
 *   invert  cambia tinta por papel: el separador clásico
 *   dark    fondo oscuro pase lo que pase
 *   light   fondo claro pase lo que pase
 *
 * `dark` y `light` no son una inversión por sí mismos: piden un color de
 * fondo, así que sólo invierten cuando el modo de la app es el contrario.
 */
export const DECK_TONES = ['theme', 'invert', 'dark', 'light'];

export function resolveTone({ slideTone, deckTone } = {}) {
    const t = String(slideTone ?? deckTone ?? '').trim().toLowerCase();
    return DECK_TONES.includes(t) ? t : 'theme';
}

/** Los campos del pie, en el orden en que se pintan. */
export const FOOTER_FIELDS = ['source', 'query', 'rows', 'vars', 'refreshed', 'number'];

// Ni la portada ni el cierre llevan pie: ya enseñan fuente y fecha en grande,
// y ahí el pie compite con ellas.
const SIN_PIE = new Set(['cover', 'closing']);

/**
 * Qué enseña el pie de una lámina. Se decide en el front-matter para todo el
 * deck y se afina lámina a lámina; lo que NO se decide aquí es el contenido de
 * cada campo, que siempre se deriva (ver DeckFooter).
 *
 * Por defecto: los seis campos donde hay una figura que citar, y sólo el número
 * donde no la hay.
 */
export function resolveFooterFields({ slideFooter, deckFooter, layout, hasChart }) {
    if (SIN_PIE.has(layout)) return [];

    const declared = (slideFooter !== null && slideFooter !== undefined) ? slideFooter : deckFooter;

    if (declared === false) return [];
    if (Array.isArray(declared)) return declared.filter((f) => FOOTER_FIELDS.includes(f));
    if (typeof declared === 'string') {
        const t = declared.trim().toLowerCase();
        if (t === 'false' || t === 'none' || t === 'off' || t === '') return [];
        if (t === 'true' || t === 'all') return [...FOOTER_FIELDS];
        return t.split(/[,\s]+/).filter((f) => FOOTER_FIELDS.includes(f));
    }
    if (declared === true) return [...FOOTER_FIELDS];

    return hasChart ? [...FOOTER_FIELDS] : ['number'];
}

/**
 * Consumes the leading `<!-- key: value -->` directives off a slide chunk, in
 * any order, and returns what they declared plus the remaining markdown.
 * Directives are metadata, never content: they must never reach MarkdownPreview.
 */
function readDirectives(raw) {
    let rest = raw;
    let layout = null;
    let eyebrow = null;
    let footer = null;
    let tone = null;

    for (let guard = 0; guard < 8; guard++) {
        const l = rest.match(LAYOUT_DIRECTIVE_RE);
        if (l) {
            const declared = DECK_LAYOUT_ALIASES[l[1].toLowerCase()] || l[1].toLowerCase();
            if (DECK_LAYOUTS.includes(declared)) layout = declared;
            rest = rest.slice(l[0].length);
            continue;
        }
        const e = rest.match(EYEBROW_DIRECTIVE_RE);
        if (e) {
            eyebrow = e[1] || '';
            rest = rest.slice(e[0].length);
            continue;
        }
        const f = rest.match(FOOTER_DIRECTIVE_RE);
        if (f) {
            footer = f[1] || '';
            rest = rest.slice(f[0].length);
            continue;
        }
        const t = rest.match(TONE_DIRECTIVE_RE);
        if (t) {
            tone = t[1].toLowerCase();
            rest = rest.slice(t[0].length);
            continue;
        }
        break;
    }
    return { layout, eyebrow, footer, tone, markdown: rest };
}

/**
 * Splits a `---`-delimited YAML front-matter block off the top of the content.
 * Returns the parsed object, the original front-matter TEXT (for lossless
 * re-serialization), the remaining body, and how many lines the front-matter
 * consumed (so slide line numbers can be made absolute for cursor jumps).
 */
export function parseDeckFrontMatter(content) {
    const match = (content || '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!match) return { frontMatter: {}, frontMatterText: '', body: content || '', bodyOffsetLines: 0 };

    let frontMatter = {};
    try {
        frontMatter = yaml.load(match[1]) || {};
    } catch (e) {
        console.error('Failed to parse deck front matter:', e);
    }
    // Number of source lines the front-matter block occupies (the body's
    // first line sits at this 0-based index in the full document).
    const bodyOffsetLines = match[0].split('\n').length - 1;
    return { frontMatter, frontMatterText: match[0], body: content.slice(match[0].length), bodyOffsetLines };
}

/**
 * Parses a full .amoxdeck document into { frontMatter, frontMatterText, slides }.
 * Each slide is { id, layout, markdown, raw, startLine } where:
 *  - `markdown` is the slide body WITHOUT the `<!-- layout: X -->` directive,
 *  - `raw` is the trimmed chunk WITH the directive (used for lossless
 *    reorder/delete round-trips via serializeDeck),
 *  - `startLine` is the 1-based line number of the slide in the full document
 *    (used to move the editor cursor to a slide from the outline panel).
 */
export function parseDeck(content) {
    const { frontMatter, frontMatterText, body, bodyOffsetLines } = parseDeckFrontMatter(content);

    // Split into slides on a lone `---` line, skipping separators that
    // appear inside fenced code blocks (```...``` or ~~~...~~~). Track the
    // body-relative start line of each chunk for absolute cursor positioning.
    const lines = body.split('\n');
    const chunks = [];
    let current = [];
    let currentStart = 0;
    let inFence = false;
    let fenceMarker = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fenceMatch = line.match(/^\s*(```|~~~)/);
        if (fenceMatch) {
            if (!inFence) { inFence = true; fenceMarker = fenceMatch[1]; }
            else if (line.trim().startsWith(fenceMarker)) inFence = false;
            current.push(line);
            continue;
        }
        if (!inFence && line.trim() === '---') {
            chunks.push({ text: current.join('\n'), startLine: currentStart });
            current = [];
            currentStart = i + 1;
            continue;
        }
        current.push(line);
    }
    if (current.length) chunks.push({ text: current.join('\n'), startLine: currentStart });

    const slides = chunks
        .map((chunk) => ({ raw: chunk.text.trim(), startLine: chunk.startLine }))
        .filter((chunk) => chunk.raw.length > 0)
        .map((chunk, index) => {
            const declared = readDirectives(chunk.raw);
            return {
                id: `slide-${index}`,
                layout: declared.layout || DEFAULT_LAYOUT,
                eyebrow: declared.eyebrow,
                footer: declared.footer,
                tone: declared.tone,
                markdown: declared.markdown.trim(),
                raw: chunk.raw,
                // +1 → 1-based line numbers (Monaco convention).
                startLine: bodyOffsetLines + chunk.startLine + 1,
            };
        });

    return { frontMatter, frontMatterText, slides };
}

/**
 * Re-serializes a deck from its front-matter text + slides array. Lossless for
 * reorder/delete because each slide keeps its original `raw` chunk (directive
 * included); we only permute/drop whole chunks and rejoin with the canonical
 * `---` separator. Slides may also be plain `{ raw }` objects (or strings).
 */
export function serializeDeck(frontMatterText, slides) {
    const fm = frontMatterText ? `${frontMatterText.replace(/\s*$/, '')}\n\n` : '';
    const body = (slides || [])
        .map((s) => (typeof s === 'string' ? s : s.raw || ''))
        .map((raw) => raw.trim())
        .filter((raw) => raw.length > 0)
        .join('\n\n---\n\n');
    return `${fm}${body}\n`;
}

/** Parses the body of a fenced ```amoxchart block (YAML: `src`, optional overrides). */
export function parseAmoxChartBlock(raw) {
    try {
        const parsed = yaml.load(raw) || {};
        return { src: parsed.src || '', ...parsed };
    } catch (e) {
        return { src: '', error: e.message };
    }
}

/**
 * El deck que se crea de cero. No es una demo de las quince disposiciones: es
 * el arco mínimo de un análisis — portada, resumen, hallazgo, acciones — que
 * es lo que alguien copiaría de verdad. El resto se añade desde el panel de
 * Layouts cuando haga falta.
 */
export const DECK_STARTER_TEMPLATE = `---
title: New Deck
theme: dark
section: Section or period
author: Your name
period: Q3 2026
date: 30 Sep 2026
variables:
  region: "US"
---

<!-- layout: cover -->
# New Deck

## The question this answers, in one line

---

<!-- layout: summary -->
## If you only read one slide, read this

\`\`\`kpis
- label: Headline metric
  value: 1.24M
  delta: +18.4%
  trend: bad
  base: vs. previous period
- label: Second metric
  value: 486K
  delta: +6.1%
\`\`\`

- First finding
- Second finding
- Third finding

---

<!-- layout: finding -->
## The claim this slide can defend

Short narrative. Reference a chart saved from Story Flow — the query re-runs
each time you click **Refresh all**, so the chart stays current without
redoing the analysis.

\`\`\`amoxchart
src: charts/example.amoxvis
\`\`\`

---

<!-- layout: actions -->
## What we propose

\`\`\`actions
- action: Do this first
  why: What it buys us, quantified
  owner: Team
  due: 8 Oct
\`\`\`
`;
