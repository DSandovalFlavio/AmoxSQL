/**
 * AmoxSQL — Report Flow layout gallery metadata.
 *
 * Tiny schematic previews (pure CSS blocks, no SVG/asset deps) for each deck
 * layout, plus a one-line "when to use" hint. Lets a user recognize what a
 * layout looks like before inserting it — without needing to already know
 * the `<!-- layout: X -->` directive names by heart.
 *
 * Quince entradas en una lista plana no se eligen, se sufren: la galería se
 * agrupa por familia (apertura · evidencia · dato · texto), que es también el
 * orden en que aparecen en un deck real.
 */
import { DECK_LAYOUT_FAMILIES } from '../../utils/deckParser';

/* ── Piezas del esquema ─────────────────────────────────────────────────── */
const Barra = ({ mod = '' }) => <div className={`dlp-bar${mod ? ` dlp-bar--${mod}` : ''}`} />;
const Linea = ({ corta }) => <div className={`dlp-line${corta ? ' dlp-line--short' : ''}`} />;
const Caja = ({ mod = '' }) => <div className={`dlp-chart-box${mod ? ` dlp-chart-box--${mod}` : ''}`} />;

const Esquema = ({ mod = '', children }) => (
    <div className={`dlp-schema${mod ? ` dlp-schema--${mod}` : ''}`}>{children}</div>
);

/* ── Apertura ───────────────────────────────────────────────────────────── */
const Cover = () => (
    <Esquema mod="cover"><Barra mod="lg" /><Linea corta /></Esquema>
);
const Section = () => (
    <Esquema mod="section"><div className="dlp-index" /><Barra mod="md" /></Esquema>
);
const Closing = () => (
    <Esquema mod="cover"><Barra mod="lg" /></Esquema>
);

/* ── Evidencia ──────────────────────────────────────────────────────────── */
const Finding = () => (
    <Esquema mod="split">
        <div className="dlp-col"><Barra mod="md" /><Linea /><Linea corta /></div>
        <div className="dlp-col dlp-col--chart"><Caja /></div>
    </Esquema>
);
const ChartFull = () => (
    <Esquema mod="full"><Caja mod="full" /></Esquema>
);
const ChartGrid = () => (
    <Esquema mod="grid">
        <Caja /><Caja /><Caja /><Caja />
    </Esquema>
);
const Compare = () => (
    <Esquema mod="split"><Caja /><Caja /></Esquema>
);

/* ── Dato ───────────────────────────────────────────────────────────────── */
const Summary = () => (
    <Esquema mod="content">
        <div className="dlp-kpis"><i /><i /><i /><i /></div>
        <Linea /><Linea corta />
    </Esquema>
);
const Metric = () => (
    <Esquema mod="metric"><div className="dlp-cifra" /><Linea corta /></Esquema>
);
const Table = () => (
    <Esquema mod="content"><Barra mod="md" /><div className="dlp-rows"><i /><i /><i /><i /></div></Esquema>
);
const Steps = () => (
    <Esquema mod="content"><Barra mod="md" /><div className="dlp-steps"><i /><i /><i /></div></Esquema>
);
const Actions = () => (
    <Esquema mod="content"><Barra mod="md" /><Linea /><Linea /><Linea corta /></Esquema>
);

/* ── Texto ──────────────────────────────────────────────────────────────── */
const Content = () => (
    <Esquema mod="content"><Barra mod="md" /><Linea /><Linea /><Linea corta /></Esquema>
);
const Statement = () => (
    <Esquema mod="statement"><Barra mod="lg" /><Barra mod="lg" /></Esquema>
);
const TwoCol = () => (
    <Esquema mod="split">
        <div className="dlp-col"><Linea /><Linea corta /></div>
        <div className="dlp-col"><Linea /><Linea corta /></div>
    </Esquema>
);
const Method = () => (
    <Esquema mod="content"><Barra mod="md" /><Linea corta /><Linea corta /><div className="dlp-nota" /></Esquema>
);

export const DECK_LAYOUT_META = {
    // Apertura
    cover: { label: 'Cover', hint: 'Period, source, author and cut-off date', Preview: Cover },
    section: { label: 'Section', hint: 'A break between blocks — inverted', Preview: Section },
    closing: { label: 'Closing', hint: 'Where the conversation continues', Preview: Closing },

    // Evidencia
    finding: { label: 'Finding', hint: 'One claim, one chart beside it', Preview: Finding },
    'chart-full': { label: 'Chart (full width)', hint: 'A chart that needs room', Preview: ChartFull },
    'chart-grid': { label: 'Small multiples', hint: 'Same shape, one per category', Preview: ChartGrid },
    compare: { label: 'Compare', hint: 'Before/after, plan/actual, A/B', Preview: Compare },

    // Dato
    summary: { label: 'Summary', hint: 'If you only read one slide', Preview: Summary },
    metric: { label: 'Anchor number', hint: 'The figure to remember tomorrow', Preview: Metric },
    table: { label: 'Ranked table', hint: 'Top N with a bar in the cell', Preview: Table },
    steps: { label: 'Steps', hint: 'A process or a plan by phases', Preview: Steps },
    actions: { label: 'Actions', hint: 'Recommendations with an owner', Preview: Actions },

    // Texto
    content: { label: 'Content', hint: 'Text, bullets, or a table', Preview: Content },
    statement: { label: 'Statement', hint: 'One sentence, display size', Preview: Statement },
    'two-col': { label: 'Two columns', hint: 'Compare two ideas, not two figures', Preview: TwoCol },
    method: { label: 'Method', hint: 'Definitions, exclusions, and caveats', Preview: Method },
};

/** La galería, agrupada por familia y en el orden del catálogo. */
export const DECK_LAYOUT_GALLERY_BY_FAMILY = DECK_LAYOUT_FAMILIES.map((family) => ({
    ...family,
    items: family.layouts.map((id) => ({ id, ...DECK_LAYOUT_META[id] })),
}));

/** Plana, para quien sólo necesita recorrerlas todas. */
export const DECK_LAYOUT_GALLERY = DECK_LAYOUT_GALLERY_BY_FAMILY.flatMap((f) => f.items);
