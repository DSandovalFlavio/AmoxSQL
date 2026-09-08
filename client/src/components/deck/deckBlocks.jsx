/**
 * Los objetos de dato de una lámina de Report Flow.
 *
 * Todos siguen la misma línea que `amoxchart` y `notes`: bloques cercados con
 * YAML dentro. Nada de un editor visual que escriba HTML — el `.amoxdeck` tiene
 * que seguir leyéndose en un diff y escribiéndose a mano rápido.
 *
 *   ```kpis      de 2 a 5 métricas con valor, variación y base de comparación
 *   ```metric    la cifra ancla: un número a tamaño display
 *   ```steps     un proceso o un plan por fases, con la fase activa marcada
 *   ```actions   recomendaciones con responsable y fecha
 *   ```rank      la tabla clasificada, con barra dentro de la celda
 *
 * Un bloque mal escrito no rompe la lámina: se enseña el error dentro de la
 * diapositiva, que es donde el autor lo va a ver.
 */
import yaml from 'js-yaml';
import { LuTriangleAlert } from 'react-icons/lu';

/** Los cinco lenguajes que Report Flow reclama del gancho `renderBlock`. */
export const DECK_BLOCK_LANGS = ['kpis', 'metric', 'steps', 'actions', 'rank'];

// Con seis KPIs cada uno baja de 240 unidades de ancho y el valor deja de
// leerse desde el fondo de la sala. Seis métricas son dos láminas.
const MAX_KPIS = 5;

// El semáforo de una tabla clasificada. Tres estados y no cinco: a tres metros
// nadie distingue cinco tonos, y un cuarto estado siempre acaba significando
// "no lo sé", que se dice mejor dejando la celda vacía.
const ESTADOS = { ok: 'On target', risk: 'At risk', bad: 'Off track' };

function ErrorDeBloque({ lang, mensaje }) {
    return (
        <div className="deck-bloque-error">
            <LuTriangleAlert size={13} />
            <span><code>{lang}</code> — {mensaje}</span>
        </div>
    );
}

/** Aviso que sólo se ve mientras se diseña: no sale en Present ni en el export. */
function AvisoDeDiseno({ children }) {
    return (
        <span className="deck-aviso">
            <LuTriangleAlert size={11} />
            {children}
        </span>
    );
}

function parseYaml(raw) {
    try {
        return { datos: yaml.load(raw), error: null };
    } catch (e) {
        return { datos: null, error: e.message.split('\n')[0] };
    }
}

/**
 * El signo de la variación no decide el color: lo decide el autor.
 * "+18 %" es bueno en ingresos y malo en coste. Sin `trend` se infiere del
 * signo — el mismo criterio que ya usa el KPI de la figura, porque dos reglas
 * distintas para el mismo dibujo serían peor que una regla imperfecta.
 */
function claseDeTendencia(trend, delta) {
    if (trend === 'good') return 'deck-kpi-delta--pos';
    if (trend === 'bad') return 'deck-kpi-delta--neg';
    if (trend === 'flat' || trend === 'neutral') return '';
    const t = String(delta ?? '').trim();
    if (t.startsWith('-') || t.startsWith('−')) return 'deck-kpi-delta--neg';
    if (t.startsWith('+')) return 'deck-kpi-delta--pos';
    return '';
}

// ── ```kpis ────────────────────────────────────────────────────────────────
function BloqueKpis({ raw }) {
    const { datos, error } = parseYaml(raw);
    if (error) return <ErrorDeBloque lang="kpis" mensaje={error} />;
    const items = Array.isArray(datos) ? datos : (datos?.items || []);
    if (!items.length) return <ErrorDeBloque lang="kpis" mensaje="sin métricas — escribe una lista" />;

    return (
        <>
            <div className="deck-kpis" style={{ '--n': Math.min(items.length, MAX_KPIS) }}>
                {items.map((k, i) => (
                    <div key={i} className={`deck-kpi${k?.highlight ? ' deck-kpi--destacado' : ''}`}>
                        {k?.label && <u className="deck-kpi-etiqueta">{k.label}</u>}
                        <div className="deck-kpi-linea">
                            <b className="deck-kpi-valor">{k?.value ?? '—'}</b>
                            {k?.delta && (
                                <s className={`deck-kpi-delta ${claseDeTendencia(k.trend, k.delta)}`.trim()}>{k.delta}</s>
                            )}
                        </div>
                        {k?.base && <em className="deck-kpi-base">{k.base}</em>}
                    </div>
                ))}
            </div>
            {items.length > MAX_KPIS && (
                <AvisoDeDiseno>
                    {items.length} métricas: con más de {MAX_KPIS} el valor deja de leerse a distancia. Parte la lámina.
                </AvisoDeDiseno>
            )}
        </>
    );
}

// ── ```metric ──────────────────────────────────────────────────────────────
function BloqueMetric({ raw }) {
    const { datos, error } = parseYaml(raw);
    if (error) return <ErrorDeBloque lang="metric" mensaje={error} />;
    if (!datos || datos.value === undefined) {
        return <ErrorDeBloque lang="metric" mensaje="falta `value`" />;
    }
    return (
        <div className="deck-cifra-bloque">
            <div className="deck-cifra">
                {datos.value}
                {datos.unit && <small className="deck-cifra-unidad">{datos.unit}</small>}
            </div>
            {datos.label && <div className="deck-cifra-pie">{datos.label}</div>}
        </div>
    );
}

// ── ```steps ───────────────────────────────────────────────────────────────
function BloqueSteps({ raw }) {
    const { datos, error } = parseYaml(raw);
    if (error) return <ErrorDeBloque lang="steps" mensaje={error} />;
    const items = Array.isArray(datos) ? datos : (datos?.items || []);
    if (!items.length) return <ErrorDeBloque lang="steps" mensaje="sin pasos — escribe una lista" />;

    return (
        <div className="deck-pasos" style={{ '--n': items.length }}>
            {items.map((p, i) => (
                <div key={i} className={`deck-paso${p?.state === 'active' ? ' deck-paso--activo' : ''}`}>
                    <u className="deck-paso-num">
                        {String(i + 1).padStart(2, '0')}{p?.when ? ` · ${p.when}` : ''}
                    </u>
                    <b className="deck-paso-titulo">{p?.title ?? '—'}</b>
                    {p?.detail && <span className="deck-paso-detalle">{p.detail}</span>}
                </div>
            ))}
        </div>
    );
}

// ── ```actions ─────────────────────────────────────────────────────────────
function BloqueActions({ raw }) {
    const { datos, error } = parseYaml(raw);
    if (error) return <ErrorDeBloque lang="actions" mensaje={error} />;
    const items = Array.isArray(datos) ? datos : (datos?.items || []);
    if (!items.length) return <ErrorDeBloque lang="actions" mensaje="sin acciones — escribe una lista" />;

    return (
        <div className="deck-acciones">
            {items.map((a, i) => {
                // Sin responsable no es una acción, es un deseo. Se avisa al
                // diseñar, no se esconde.
                const quien = [a?.owner, a?.due].filter(Boolean).join(' · ');
                return (
                    <div key={i} className="deck-accion">
                        <u className="deck-accion-num">{String(i + 1).padStart(2, '0')}</u>
                        <div className="deck-accion-cuerpo">
                            <b>{a?.action ?? '—'}</b>
                            {a?.why && <span>{a.why}</span>}
                        </div>
                        {quien
                            ? <span className="deck-accion-quien">{quien}</span>
                            : <AvisoDeDiseno>sin responsable</AvisoDeDiseno>}
                    </div>
                );
            })}
        </div>
    );
}

// ── ```rank ────────────────────────────────────────────────────────────────
/**
 * La tabla clasificada. Va como bloque y no como tabla GFM porque necesita algo
 * que el markdown no sabe decir: qué columna se dibuja como barra y qué filas
 * son de las que habla el título. Una tabla normal se sigue escribiendo con la
 * sintaxis de siempre; ésta es para el top N.
 */
function BloqueRank({ raw }) {
    const { datos, error } = parseYaml(raw);
    if (error) return <ErrorDeBloque lang="rank" mensaje={error} />;
    const columnas = datos?.columns;
    const filas = datos?.rows;
    if (!Array.isArray(columnas) || !Array.isArray(filas)) {
        return <ErrorDeBloque lang="rank" mensaje="hacen falta `columns` y `rows`" />;
    }

    const iBarra = datos.bar ? columnas.indexOf(datos.bar) : -1;
    // El semáforo se declara igual que la barra —nombrando su columna— y no se
    // adivina por el contenido: una celda que diga "ok" puede ser un dato.
    const iEstado = datos.status ? columnas.indexOf(datos.status) : -1;
    const destacadas = Number(datos.highlight) || 0;

    // La barra se escala al mayor valor de su columna: sin eso, dos tablas de
    // la misma lámina compararían con reglas distintas.
    const maximo = iBarra >= 0
        ? Math.max(...filas.map((f) => Math.abs(Number(f?.[iBarra])) || 0), 0)
        : 0;

    /**
     * ¿Esta columna son cifras? Se alinean a la derecha para que los órdenes de
     * magnitud queden unos debajo de otros. Hay que aguantar cómo escribe la
     * gente los números en una tabla —«$284K», «+18,4 %», «−$4K»— sin tragarse
     * texto que sólo acaba en letra: «Q3» o «Marca Vídeo» no son cifras.
     */
    const esNumerica = (i) => i !== iBarra && i !== iEstado && filas.some((f) => {
        const v = String(f?.[i] ?? '')
            .replace(/[\s$€£¥%+,]/g, '')
            .replace(/[−–]/g, '-')
            .replace(/[KkMmBbTt]$/, '');
        return /^-?\d+(\.\d+)?$/.test(v);
    });

    /* Una fila con más o menos celdas que columnas no se ve: se ve una tabla
       con los datos corridos una posición. Pasa en cuanto alguien escribe una
       coma decimal sin comillas —`+28,4 %`— porque YAML parte la secuencia por
       la coma y esa fila crece en silencio. Me pasó escribiendo las pruebas. */
    const descuadradas = filas
        .map((f, i) => ({ i, n: Array.isArray(f) ? f.length : 0 }))
        .filter((f) => f.n !== columnas.length);

    return (
        <>
        {descuadradas.length > 0 && (
            <AvisoDeDiseno>
                {descuadradas.length === 1 ? 'La fila' : 'Las filas'}{' '}
                {descuadradas.map((f) => f.i + 1).join(', ')} no {descuadradas.length === 1 ? 'tiene' : 'tienen'}{' '}
                {columnas.length} celdas. Si hay una coma dentro de un valor, entrecomíllalo.
            </AvisoDeDiseno>
        )}
        <table className="deck-rank">
            <thead>
                <tr>
                    {columnas.map((c, i) => (
                        <th key={i} className={esNumerica(i) ? 'deck-rank-der' : undefined}>{c}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {filas.map((fila, r) => (
                    <tr key={r} className={r < destacadas ? 'deck-rank-fila--destacada' : undefined}>
                        {columnas.map((_, c) => {
                            if (c === iBarra) {
                                const v = Math.abs(Number(fila?.[c])) || 0;
                                const ancho = maximo > 0 ? Math.max(2, (v / maximo) * 100) : 0;
                                return (
                                    <td key={c} className="deck-rank-celda-barra">
                                        <div className="deck-rank-barra" style={{ width: `${ancho}%` }} />
                                    </td>
                                );
                            }
                            if (c === iEstado) {
                                const estado = String(fila?.[c] ?? '').trim().toLowerCase();
                                const conocido = ESTADOS[estado];
                                return (
                                    <td key={c}>
                                        {conocido
                                            ? <span className={`deck-estado deck-estado--${estado}`}>{conocido}</span>
                                            : (fila?.[c] ?? '')}
                                    </td>
                                );
                            }
                            return (
                                <td key={c} className={esNumerica(c) ? 'deck-rank-der' : undefined}>
                                    {fila?.[c] ?? ''}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
        </>
    );
}

const RENDERIZADORES = {
    kpis: BloqueKpis,
    metric: BloqueMetric,
    steps: BloqueSteps,
    actions: BloqueActions,
    rank: BloqueRank,
};

/**
 * El gancho que se le pasa a MarkdownPreview. Devuelve null para cualquier
 * lenguaje que no sea de la lámina, y entonces el bloque se pinta como código —
 * que es lo correcto fuera de un deck.
 */
export function renderDeckBlock(lang, raw) {
    const Comp = RENDERIZADORES[lang];
    return Comp ? <Comp raw={raw} /> : null;
}
