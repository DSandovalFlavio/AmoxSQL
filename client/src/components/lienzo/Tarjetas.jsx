/**
 * Las tarjetas del Canvas (5.15, fase 1; Dec-56): Source, Query, Note, Text y
 * Frame. Chart y Number llegan en la fase 2.
 *
 * Lo que cambia de una tarjeta a otra vive en el contexto del lienzo (`LienzoCtx`)
 * y no en los datos del nodo: así mover una tarjeta no reconstruye las demás, y
 * un resultado nuevo sólo repinta la suya.
 *
 * ## El editor de código, sólo en la que se edita
 *
 * Un lienzo de veinte consultas con veinte editores montados se arrastra (lo
 * midió el cuaderno). Aquí el SQL se pinta como texto con color y **el editor de
 * verdad se monta sólo en la tarjeta que se está editando**; al salir, vuelve a
 * ser texto.
 */
import { createContext, lazy, memo, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import {
    LuPlay, LuLoaderCircle, LuInbox, LuDatabase, LuStickyNote, LuType, LuFrame,
    LuCode, LuTable, LuColumns2, LuTriangleAlert, LuHistory, LuLayers, LuChartBar, LuHash, LuPencil,
    LuTrendingUp, LuTrendingDown,
} from 'react-icons/lu';
import SqlEditor from '../SqlEditor';
import MarkdownPreview from '../markdown/MarkdownPreview';

// Story Flow sólo se carga si el lienzo tiene un gráfico.
const DataVisualizer = lazy(() => import('../DataVisualizer'));

export const LienzoCtx = createContext(null);

const PALABRAS = /\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|HAVING|LIMIT|JOIN|LEFT|RIGHT|INNER|FULL|OUTER|CROSS|ON|USING|AS|AND|OR|NOT|IN|IS|NULL|CASE|WHEN|THEN|ELSE|END|WITH|UNION|ALL|DISTINCT|BETWEEN|LIKE|ILIKE|DESC|ASC|QUALIFY|OVER|PARTITION|EXCLUDE|REPLACE)\b/gi;

/** El SQL pintado con color, sin editor: barato de montar por docenas. */
function SqlPintado({ sql }) {
    const partes = [];
    const s = String(sql || '');
    // Cadenas, comentarios y palabras clave; el resto tal cual.
    const re = /('(?:[^']|'')*')|(--[^\n]*)|(\{\{\s*[\w-]+\s*\}\})|([A-Za-z_]\w*)/g;
    let ultimo = 0;
    let m;
    let k = 0;
    while ((m = re.exec(s)) !== null) {
        if (m.index > ultimo) partes.push(s.slice(ultimo, m.index));
        if (m[1]) partes.push(<span key={k++} className="lz-st">{m[1]}</span>);
        else if (m[2]) partes.push(<span key={k++} className="lz-co">{m[2]}</span>);
        else if (m[3]) partes.push(<span key={k++} className="lz-pa">{m[3]}</span>);
        else if (PALABRAS.test(m[4])) partes.push(<span key={k++} className="lz-kw">{m[4]}</span>);
        else partes.push(m[4]);
        PALABRAS.lastIndex = 0;
        ultimo = m.index + m[0].length;
    }
    if (ultimo < s.length) partes.push(s.slice(ultimo));
    return <pre className="lz-sql">{partes.length ? partes : <span className="lz-co">-- empty</span>}</pre>;
}

const fmt = (v) => {
    if (v === null || v === undefined) return <span className="lz-null">NULL</span>;
    if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

/**
 * Las filas de una tarjeta: las del último resultado de esta sesión, o las de
 * la foto guardada (marcadas «as of»). Nunca más de 50: el lienzo no es la
 * tabla de resultados.
 */
function Filas({ resultado, foto }) {
    const vivo = resultado && !resultado.error && Array.isArray(resultado.data);
    const columnas = vivo
        ? (resultado.data[0] ? Object.keys(resultado.data[0]) : (resultado.types ? Object.keys(resultado.types) : []))
        : (foto?.columnas || []);
    const filas = vivo
        ? resultado.data.slice(0, 50).map(f => columnas.map(c => f[c]))
        : (foto?.muestra || []);
    if (!columnas.length) return <div className="lz-vacio">No rows yet</div>;
    return (
        <div className="lz-tabla nowheel nodrag">
            <table>
                <thead><tr>{columnas.map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                    {filas.map((f, i) => (
                        <tr key={i}>{f.map((v, j) => <td key={j} className={typeof v === 'number' ? 'n' : undefined}>{fmt(v)}</td>)}</tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const cuando = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/** El punto de estado, como el del cuaderno, con su palabra. */
const PUNTO = {
    dia: ['dia', 'Up to date'],
    cambiada: ['vieja', 'Edited after it ran: what you see is from before'],
    arriba: ['vieja', 'Something it reads changed: what you see is from before'],
    foto: ['foto', 'A snapshot from the last time: Refresh to bring it up to date'],
    nunca: ['nunca', 'Not run in this session'],
    falla: ['falla', 'Failed'],
};

/** El nombre de la tarjeta; doble clic lo edita y al confirmar se renombra todo lo que la lee. */
function Nombre({ tarjeta }) {
    const ctx = useContext(LienzoCtx);
    const [editando, setEditando] = useState(false);
    const [valor, setValor] = useState(tarjeta.id);
    const ref = useRef(null);
    useEffect(() => { if (editando) ref.current?.select(); }, [editando]);
    if (editando) {
        const terminar = async (aceptar) => {
            setEditando(false);
            if (aceptar && valor.trim() && valor.trim() !== tarjeta.id) await ctx.renombrar(tarjeta.id, valor.trim());
            else setValor(tarjeta.id);
        };
        return (
            <input
                ref={ref}
                className="lz-nombre-input nodrag"
                value={valor}
                onChange={e => setValor(e.target.value)}
                onBlur={() => terminar(true)}
                onKeyDown={e => { if (e.key === 'Enter') terminar(true); if (e.key === 'Escape') terminar(false); }}
            />
        );
    }
    return (
        <span className="lz-nombre nodrag" title={`${tarjeta.id}\nDouble-click to rename (the cards that read it are rewritten)`} onDoubleClick={() => { setValor(tarjeta.id); setEditando(true); }}>
            {tarjeta.id}
        </span>
    );
}

/** Source y Query: dejan una vista con su nombre. */
export const TarjetaDatos = memo(({ id, data, selected }) => {
    const ctx = useContext(LienzoCtx);
    const t = data.tarjeta;
    const res = ctx.resultados[id];
    const estado = res?.error ? 'falla' : (ctx.estados.get(id) || (t.foto ? 'foto' : 'nunca'));
    const [clase, ayuda] = PUNTO[estado] || PUNTO.nunca;
    const corriendo = ctx.corriendo === id;
    const editando = ctx.editando === id;
    const modo = t.modo || (t.tipo === 'source' ? 'resultado' : 'ambos');
    const problema = ctx.problemas[id];
    const esSource = t.tipo === 'source';
    const Icono = esSource ? LuInbox : LuDatabase;
    const origen = t.origen || {};
    const filasTxt = res && !res.error
        ? `${Number(res.rowCount ?? res.data?.length ?? 0).toLocaleString()} rows${res.truncated ? '+' : ''}${res.executionTime ? ` · ${Math.round(res.executionTime)} ms` : ''}`
        : t.foto ? `${Number(t.foto.filas ?? 0).toLocaleString()} rows · as of ${cuando(t.foto.cuando)}` : '';

    return (
        <div className={`lz-tarjeta lz-datos${selected ? ' lz-sel' : ''}${data.resaltada ? ' lz-lit' : ''}`}>
            <NodeResizer isVisible={selected} minWidth={220} minHeight={110} lineClassName="lz-resizer" handleClassName="lz-resizer-asa" onResizeEnd={(_, p) => ctx.redimensionar(id, p)} />
            <Handle type="target" position={Position.Left} className="lz-asa lz-asa-in" isConnectable={false} />
            <div className="lz-cab">
                <span className={`lz-est lz-est--${clase}`} title={ayuda} />
                <Icono size={13} className="lz-cab-icono" />
                <Nombre tarjeta={t} />
                <span className="lz-sp" />
                {estado === 'cambiada' || estado === 'arriba' ? <span className="lz-chip lz-chip--vieja" title={ayuda}><LuHistory size={10} />{estado === 'cambiada' ? 'edited' : 'stale'}</span> : null}
                {t.materializada && <span className="lz-chip" title="Materialized: stored as a temporary table"><LuLayers size={10} />table</span>}
                {!esSource && (
                    <span className="lz-modos nodrag">
                        <button type="button" className={modo === 'ambos' ? 'on' : ''} title="Code and result" onClick={() => ctx.cambiar(id, { modo: 'ambos' })}><LuColumns2 size={11} /></button>
                        <button type="button" className={modo === 'codigo' ? 'on' : ''} title="Code only" onClick={() => ctx.cambiar(id, { modo: 'codigo' })}><LuCode size={11} /></button>
                        <button type="button" className={modo === 'resultado' ? 'on' : ''} title="Result only" onClick={() => ctx.cambiar(id, { modo: 'resultado' })}><LuTable size={11} /></button>
                    </span>
                )}
                <button type="button" className="lz-correr nodrag" disabled={corriendo || !!problema} onClick={() => ctx.correr(id)} title={problema || 'Run (Ctrl+Enter)'}>
                    {corriendo ? <LuLoaderCircle size={12} className="spin" /> : <LuPlay size={11} />}
                </button>
            </div>
            {esSource && (
                <div className="lz-origen" title={ctx.sqlDe(t)}>
                    {origen.tipo === 'fuente' ? <>Source <code>fuentes."{origen.nombre}"</code></>
                        : origen.tipo === 'archivo' ? <>File <code>{origen.ruta}</code></>
                            : <>Table <code>{origen.nombre}</code></>}
                </div>
            )}
            {!esSource && modo !== 'resultado' && (
                <div
                    className={`lz-codigo${editando ? ' lz-codigo--editando nodrag nowheel' : ''}`}
                    style={modo === 'ambos' ? { flex: '0 0 auto', maxHeight: editando ? '55%' : '45%' } : undefined}
                    onDoubleClick={() => ctx.setEditando(id)}
                    title={editando ? undefined : 'Double-click to edit'}
                >
                    {editando ? (
                        <SqlEditor
                            tabId={`lienzo-${id}`}
                            value={t.sql || ''}
                            language="sql"
                            onChange={(v) => ctx.cambiar(id, { sql: v ?? '' })}
                            onRunQuery={() => ctx.correr(id)}
                            theme={ctx.theme}
                            editorSettings={ctx.editorSettings}
                        />
                    ) : <SqlPintado sql={t.sql} />}
                </div>
            )}
            {problema && <div className="lz-problema"><LuTriangleAlert size={12} /> {problema}</div>}
            {res?.error ? (
                <div className="lz-error nowheel nodrag">{res.error}</div>
            ) : modo !== 'codigo' ? (
                <Filas resultado={res} foto={t.foto} />
            ) : null}
            <div className="lz-pie">
                <span>{filasTxt}</span>
                <span className="lz-sp" />
                <span title="It leaves a view with this name that other cards can read">{t.materializada ? 'temp table' : 'view'}</span>
            </div>
            <Handle type="source" position={Position.Right} className="lz-asa" title="Drag to a gap: a new card that reads this one" />
        </div>
    );
});
TarjetaDatos.displayName = 'TarjetaDatos';

/** Una nota adhesiva: texto corto, se edita con doble clic. */
export const TarjetaNota = memo(({ id, data, selected }) => {
    const ctx = useContext(LienzoCtx);
    const t = data.tarjeta;
    const editando = ctx.editando === id;
    return (
        <div className={`lz-nota${selected ? ' lz-sel' : ''}`} style={t.color ? { '--lz-nota': t.color } : undefined} onDoubleClick={() => ctx.setEditando(id)}>
            <NodeResizer isVisible={selected} minWidth={120} minHeight={70} lineClassName="lz-resizer" handleClassName="lz-resizer-asa" onResizeEnd={(_, p) => ctx.redimensionar(id, p)} />
            <span className="lz-nota-tipo"><LuStickyNote size={11} />note</span>
            {editando ? (
                <textarea autoFocus className="lz-nota-edit nodrag nowheel" value={t.texto || ''} onChange={e => ctx.cambiar(id, { texto: e.target.value })} onBlur={() => ctx.setEditando(null)} />
            ) : <p>{t.texto || 'Double-click to write'}</p>}
        </div>
    );
});
TarjetaNota.displayName = 'TarjetaNota';

/** Un título o un párrafo, en markdown, sin caja. */
export const TarjetaTexto = memo(({ id, data, selected }) => {
    const ctx = useContext(LienzoCtx);
    const t = data.tarjeta;
    const editando = ctx.editando === id;
    return (
        <div className={`lz-texto${selected ? ' lz-sel' : ''}`} onDoubleClick={() => ctx.setEditando(id)}>
            <NodeResizer isVisible={selected} minWidth={160} minHeight={40} lineClassName="lz-resizer" handleClassName="lz-resizer-asa" onResizeEnd={(_, p) => ctx.redimensionar(id, p)} />
            {editando ? (
                <textarea autoFocus className="lz-texto-edit nodrag nowheel" value={t.texto || ''} onChange={e => ctx.cambiar(id, { texto: e.target.value })} onBlur={() => ctx.setEditando(null)} placeholder="# A title&#10;&#10;A paragraph in markdown" />
            ) : (t.texto ? <MarkdownPreview content={t.texto} widthMode="full" /> : <p className="lz-vacio"><LuType size={12} /> Double-click to write</p>)}
        </div>
    );
});
TarjetaTexto.displayName = 'TarjetaTexto';

/** Un marco: agrupa lo que tiene dentro (se mueve con él) y se presenta como una diapositiva. */
export const TarjetaMarco = memo(({ id, data, selected }) => {
    const ctx = useContext(LienzoCtx);
    const t = data.tarjeta;
    const [editando, setEditando] = useState(false);
    return (
        <div className={`lz-marco${selected ? ' lz-sel' : ''}`}>
            <NodeResizer isVisible={selected} minWidth={240} minHeight={160} lineClassName="lz-resizer" handleClassName="lz-resizer-asa" onResizeEnd={(_, p) => ctx.redimensionar(id, p)} />
            <div className="lz-marco-titulo" onDoubleClick={() => setEditando(true)}>
                <LuFrame size={12} />
                {editando ? (
                    <input autoFocus className="lz-nombre-input nodrag" defaultValue={t.titulo || ''} onBlur={e => { ctx.cambiar(id, { titulo: e.target.value }); setEditando(false); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
                ) : <span>{t.titulo || 'Frame'}</span>}
            </div>
        </div>
    );
});
TarjetaMarco.displayName = 'TarjetaMarco';

/** Un tipo que esta versión no sabe pintar (llegará después): se conserva y se dice. */
export const TarjetaDesconocida = memo(({ data }) => (
    <div className="lz-tarjeta lz-desconocida">
        <div className="lz-cab"><LuTriangleAlert size={12} /><span className="lz-nombre">{data.tarjeta.id}</span></div>
        <div className="lz-vacio">A “{data.tarjeta.tipo}” card, from a newer AmoxSQL. It is kept as it is.</div>
    </div>
));
TarjetaDesconocida.displayName = 'TarjetaDesconocida';

/** Las filas de una tarjeta visual: las de esta sesión, o las de su foto. */
export function filasDeVisual(resultado, foto) {
    if (resultado && !resultado.error && Array.isArray(resultado.data)) return resultado.data;
    const cols = foto?.columnas || [];
    return (foto?.puntos || foto?.muestra || []).map(f => Object.fromEntries(cols.map((c, i) => [c, f[i]])));
}

/** La cabecera de Chart y Number: punto, icono, nombre, de qué tarjeta lee y Run. */
function CabeceraVisual({ id, t, Icono, estado, ctx, onEditar }) {
    const [clase, ayuda] = PUNTO[estado] || PUNTO.nunca;
    return (
        <div className="lz-cab">
            <span className={`lz-est lz-est--${clase}`} title={ayuda} />
            <Icono size={13} className="lz-cab-icono" />
            <Nombre tarjeta={t} />
            <span className="lz-sp" />
            {t.desde && <span className="lz-chip" title={`It shows "${t.desde}"`}>{t.desde}</span>}
            <button type="button" className="lz-modos-uno nodrag" onClick={onEditar} title="Configure"><LuPencil size={11} /></button>
            <button type="button" className="lz-correr nodrag" disabled={ctx.corriendo === id || !t.desde} onClick={() => ctx.correr(id)} title={t.desde ? 'Run' : 'Connect a card to it first'}>
                {ctx.corriendo === id ? <LuLoaderCircle size={12} className="spin" /> : <LuPlay size={11} />}
            </button>
        </div>
    );
}

const sinOrigen = <div className="lz-vacio">Drag from the edge of a Source or a Query onto this card to show its data.</div>;

/** Un gráfico de Story Flow sobre las filas de otra tarjeta. */
export const TarjetaGrafico = memo(({ id, data, selected }) => {
    const ctx = useContext(LienzoCtx);
    const t = data.tarjeta;
    const res = ctx.resultados[id];
    const estado = res?.error ? 'falla' : (ctx.estados.get(id) || (t.foto ? 'foto' : 'nunca'));
    const filas = filasDeVisual(res, t.foto);
    return (
        <div className={`lz-tarjeta lz-visual${selected ? ' lz-sel' : ''}${data.resaltada ? ' lz-lit' : ''}`}>
            <NodeResizer isVisible={selected} minWidth={240} minHeight={180} lineClassName="lz-resizer" handleClassName="lz-resizer-asa" onResizeEnd={(_, p) => ctx.redimensionar(id, p)} />
            <Handle type="target" position={Position.Left} className="lz-asa lz-asa-in" />
            <CabeceraVisual id={id} t={t} Icono={LuChartBar} estado={estado} ctx={ctx} onEditar={() => ctx.editarGrafico(id)} />
            {!t.desde ? sinOrigen : res?.error ? <div className="lz-error nowheel nodrag">{res.error}</div> : filas.length ? (
                <div className="lz-grafico nodrag nowheel" onDoubleClick={() => ctx.editarGrafico(id)}>
                    <Suspense fallback={<div className="lz-vacio"><LuLoaderCircle size={12} className="spin" /> Loading the chart…</div>}>
                        <DataVisualizer key={ctx.versionDeGrafico(id)} data={filas} initialChartConfig={t.grafico || null} isReportMode chrome="none" />
                    </Suspense>
                </div>
            ) : <div className="lz-vacio">Run it to draw the chart.</div>}
            <div className="lz-pie">
                <span>{res && !res.error ? `${filas.length.toLocaleString()} rows` : t.foto ? `as of ${cuando(t.foto.cuando)}` : ''}</span>
            </div>
        </div>
    );
});
TarjetaGrafico.displayName = 'TarjetaGrafico';

const AGREGADOS = [['sum', 'Sum'], ['avg', 'Average'], ['count', 'Count'], ['min', 'Minimum'], ['max', 'Maximum'], ['primero', 'First row']];
const numero = (v, decimales) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))
    ? (v ?? '—')
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: decimales ?? 2 }));

/** Una cifra (y su variación frente a otra tarjeta). */
export const TarjetaCifra = memo(({ id, data, selected }) => {
    const ctx = useContext(LienzoCtx);
    const t = data.tarjeta;
    const c = t.cifra || {};
    const res = ctx.resultados[id];
    const estado = res?.error ? 'falla' : (ctx.estados.get(id) || (t.foto ? 'foto' : 'nunca'));
    const [editando, setEditando] = useState(false);
    const valor = res && !res.error ? res.data?.[0]?.valor : t.foto?.valor;
    const base = res && !res.error ? res.data?.[0]?.base : t.foto?.base;
    const variacion = c.comparar && Number.isFinite(Number(valor)) && Number.isFinite(Number(base)) && Number(base) !== 0
        ? (Number(valor) - Number(base)) / Math.abs(Number(base)) : null;
    const columnas = ctx.columnasDe(t.desde);
    const datos = ctx.tarjetasDeDatos.filter(x => x !== t.desde);
    const etiquetaPorOmision = `${(AGREGADOS.find(a => a[0] === (c.agregado || 'sum')) || [])[1] || ''} of ${c.columna || 'rows'}`;
    return (
        <div className={`lz-tarjeta lz-visual${selected ? ' lz-sel' : ''}${data.resaltada ? ' lz-lit' : ''}`}>
            <NodeResizer isVisible={selected} minWidth={170} minHeight={120} lineClassName="lz-resizer" handleClassName="lz-resizer-asa" onResizeEnd={(_, p) => ctx.redimensionar(id, p)} />
            <Handle type="target" position={Position.Left} className="lz-asa lz-asa-in" />
            <CabeceraVisual id={id} t={t} Icono={LuHash} estado={estado} ctx={ctx} onEditar={() => setEditando(e => !e)} />
            {!t.desde ? sinOrigen : editando ? (
                <div className="lz-cifra-form nodrag nowheel">
                    <label>Of <select value={c.columna || ''} onChange={e => ctx.cambiar(id, { cifra: { ...c, columna: e.target.value || undefined } })}>
                        <option value="">(rows)</option>
                        {columnas.map(x => <option key={x} value={x}>{x}</option>)}
                    </select></label>
                    <label>As <select value={c.agregado || 'sum'} onChange={e => ctx.cambiar(id, { cifra: { ...c, agregado: e.target.value } })}>
                        {AGREGADOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select></label>
                    <label>Label <input value={c.etiqueta || ''} placeholder={etiquetaPorOmision} onChange={e => ctx.cambiar(id, { cifra: { ...c, etiqueta: e.target.value || undefined } })} /></label>
                    <label>Compare with <select value={c.comparar || ''} onChange={e => ctx.cambiar(id, { cifra: { ...c, comparar: e.target.value || undefined } })}>
                        <option value="">(nothing)</option>
                        {datos.map(x => <option key={x} value={x}>{x}</option>)}
                    </select></label>
                    <button type="button" className="lz-btn" onClick={() => { setEditando(false); ctx.correr(id); }}>Done</button>
                </div>
            ) : res?.error ? <div className="lz-error nowheel nodrag">{res.error}</div> : (
                <div className="lz-cifra" onDoubleClick={() => setEditando(true)}>
                    <div className="lz-cifra-valor">{valor === undefined ? '—' : numero(valor, c.decimales)}</div>
                    <div className="lz-cifra-etq">{c.etiqueta || etiquetaPorOmision}</div>
                    {variacion !== null && (
                        <div className={`lz-cifra-var ${variacion >= 0 ? 'sube' : 'baja'}`}>
                            {variacion >= 0 ? <LuTrendingUp size={13} /> : <LuTrendingDown size={13} />}
                            {variacion >= 0 ? '+' : ''}{(variacion * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}% vs {c.comparar}
                        </div>
                    )}
                </div>
            )}
            <div className="lz-pie"><span>{res && !res.error ? 'up to date' : t.foto ? `as of ${cuando(t.foto.cuando)}` : ''}</span></div>
        </div>
    );
});
TarjetaCifra.displayName = 'TarjetaCifra';
