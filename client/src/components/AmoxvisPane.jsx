/**
 * AmoxvisPane — la pestaña de un `.amoxvis`.
 *
 * **Una pestaña es un documento** (Dec-80): lo que guarda Ctrl+S es el archivo
 * cuyo nombre ves arriba, siempre el `.amoxvis`. La consulta del gráfico es de
 * uno de dos sitios, y la miga de pan lo dice:
 *
 *   - `ventas.sql › ventas.amoxvis` — la consulta vive en el `.sql`. Se edita
 *     allí (el nombre del `.sql` lo abre) y el gráfico la sigue al guardarlo
 *     (Dec-81, `utils/seguirConsulta.js`).
 *   - `ventas.amoxvis · Own query` — la consulta es del gráfico. Se edita aquí
 *     mismo, en el panel **Query**, y se guarda con él. **Move to a .sql file…**
 *     la saca a un archivo y deja el gráfico vinculado.
 *
 * Antes, «Edit SQL» de un gráfico sin `.sql` abría una pestaña «Edit: x.amoxvis»
 * que parecía un `.sql` y guardaba en el gráfico.
 */
import { API_BASE } from '../api.js';
import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
    LuLoader, LuChevronDown, LuChevronRight, LuRefreshCw, LuBookOpen, LuSave, LuUnlink,
    LuFileCode, LuChartColumn, LuPlay, LuFileOutput, LuExternalLink, LuGitBranch,
} from 'react-icons/lu';
import DataVisualizer from './DataVisualizer';
import SaveQueryModal from './SaveQueryModal';
import { useToast } from './ToastProvider';
import { leerAmoxvis } from './DataVisualizer/vega/figura';
import { registerMonaco, MONACO_THEME_NAME } from '../monacoTheme.js';
import { splitSqlStatements } from '../utils/sqlSplitter';
import { consultaQueSigue, conConsulta } from '../utils/seguirConsulta';

const nombreDe = (ruta) => (ruta || '').split(/[/\\]/).pop();
const carpetaDe = (ruta) => { const p = (ruta || '').replace(/\\/g, '/'); const i = p.lastIndexOf('/'); return i > 0 ? p.slice(0, i) : ''; };
const primeraLinea = (sql) => (sql.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('--')) || sql.trim()).slice(0, 70);

/** La configuración con la que se abre: lo que hay en la pestaña (con sus cambios sin guardar). */
function configDe(tab) {
    if (tab.content) {
        try {
            const c = leerAmoxvis(tab.content);
            if (c && Object.keys(c).length) return c;
        } catch { /* se usa la que trae la pestaña */ }
    }
    return tab.chartConfig || tab.initialChartConfig || {};
}

const AmoxvisPane = ({ tab, onSave, onOpenAsSql, onConfigChange, onCreateNew, onActualizarPestana }) => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const isReadOnly = tab.readOnly || false;
    const toast = useToast();

    // Se lee una vez al montar: la pestaña se monta de nuevo al volver a ella
    // (key por pestaña) y entonces trae lo último.
    const [config] = useState(() => configDe(tab));
    const [currentQuery, setCurrentQuery] = useState(config.query || '');
    // Lo último que avisó el gráfico: para escribir otra consulta sin tocar el resto.
    const ultimoConfigRef = useRef(config);
    // La consulta que se dibujó (puede diferir de la que se está escribiendo).
    const [consultaEjecutada, setConsultaEjecutada] = useState(config.query || '');

    const [sourceLink, setSourceLink] = useState(config.source || null);
    // { sentencias } cuando el .sql cambió y no se sabe cuál de sus consultas seguir.
    const [sourceDrift, setSourceDrift] = useState(null);
    const [eleccion, setEleccion] = useState(0);
    const [queryExpanded, setQueryExpanded] = useState(!!tab.abrirConsulta && !config.source);
    const [moviendo, setMoviendo] = useState(false);

    const executeQuery = useCallback(async (q) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q }),
            });
            const result = await response.json();
            if (response.ok) {
                setData(result.data);
                setConsultaEjecutada(q);
            } else {
                setError(result.error || 'Query failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // El documento cambió: la consulta, el vínculo o lo que avisa el gráfico.
    const avisar = useCallback((cambios = {}) => {
        if (!onConfigChange) return;
        const query = 'query' in cambios ? cambios.query : currentQuery;
        const source = 'source' in cambios ? cambios.source : sourceLink;
        const merged = { ...ultimoConfigRef.current, ...(cambios.config || {}), query: query || '' };
        if (source) merged.source = source; else delete merged.source;
        onConfigChange(merged);
    }, [onConfigChange, currentQuery, sourceLink]);

    // Seguir una consulta nueva del .sql. Una pestaña sin cambios se escribe en
    // silencio (la copia de la consulta es la que usan el deck y Data Flow); con
    // cambios, la consulta va con ellos al guardar.
    const seguir = useCallback(async (q) => {
        setCurrentQuery(q);
        setSourceDrift(null);
        executeQuery(q);
        if (tab.dirty || !onActualizarPestana || !tab.path) { avisar({ query: q }); return; }
        const texto = conConsulta(tab.content, q);
        if (!texto) { avisar({ query: q }); return; }
        try {
            const r = await fetch(`${API_BASE}/api/file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: tab.path, content: texto, firmaEsperada: tab.firma || undefined }),
            });
            if (!r.ok) throw new Error('write');
            const d = await r.json().catch(() => ({}));
            onActualizarPestana({ content: texto, firma: d.firma || null, dirty: false });
        } catch {
            avisar({ query: q });
        }
    }, [tab.dirty, tab.path, tab.content, tab.firma, onActualizarPestana, executeQuery, avisar]);

    // Al abrir: se dibuja. Si está vinculado, se mira antes si el .sql siguió
    // adelante —editado fuera, o antes de que el gráfico supiera seguirlo—.
    useEffect(() => {
        let cancelado = false;
        (async () => {
            if (sourceLink) {
                try {
                    const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(sourceLink)}`);
                    const fileData = await res.json();
                    if (!cancelado && !fileData.error) {
                        const contenido = fileData.content || '';
                        const sigue = consultaQueSigue(config.query || '', null, contenido);
                        if (sigue.estado === 'sigue') { seguir(sigue.consulta); return; }
                        if (sigue.estado === 'dudosa') {
                            setSourceDrift({ sentencias: splitSqlStatements(contenido).map(st => st.raw) });
                        }
                    }
                } catch {
                    // El .sql se movió o se borró: se dibuja la copia del gráfico.
                }
            }
            if (!cancelado && currentQuery) executeQuery(currentQuery);
        })();
        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Guardado el .sql, LayoutManager ya escribió la consulta nueva: aquí solo se
    // redibuja.
    useEffect(() => {
        const alSeguir = (e) => {
            const { path, consulta } = e.detail || {};
            if (path !== tab.path || typeof consulta !== 'string') return;
            setCurrentQuery(consulta);
            setSourceDrift(null);
            executeQuery(consulta);
        };
        window.addEventListener('amox_consulta_seguida', alSeguir);
        return () => window.removeEventListener('amox_consulta_seguida', alSeguir);
    }, [tab.path, executeQuery]);

    // «Edit query» desde el explorador con la pestaña ya abierta.
    const abrirVista = useRef(tab.abrirConsulta);
    useEffect(() => {
        if (tab.abrirConsulta && tab.abrirConsulta !== abrirVista.current) {
            abrirVista.current = tab.abrirConsulta;
            setQueryExpanded(true);
        }
    }, [tab.abrirConsulta]);

    // Estable: si cambiara con cada render, Story Flow volvería a avisar sin que
    // nada cambiara y la pestaña se marcaría con cambios al abrirla.
    const avisarRef = useRef(avisar);
    avisarRef.current = avisar;
    const handleConfigChange = useCallback((newConfig) => {
        ultimoConfigRef.current = newConfig;
        avisarRef.current({ config: newConfig });
    }, []);

    const handleUnlinkSource = useCallback(() => {
        setSourceLink(null);
        setSourceDrift(null);
        avisar({ source: null });
        toast.info('The query is now part of this chart. Save to keep the change.');
    }, [avisar, toast]);

    const handleAbrirSql = useCallback(() => { if (onOpenAsSql) onOpenAsSql(tab); }, [onOpenAsSql, tab]);

    // ── Escribir la consulta propia ──
    const alEscribir = useCallback((valor) => {
        const q = valor ?? '';
        setCurrentQuery(q);
        avisar({ query: q });
    }, [avisar]);
    const ejecutarRef = useRef(null);
    ejecutarRef.current = () => executeQuery(currentQuery);
    const guardarRef = useRef(null);
    guardarRef.current = () => onSave && onSave();
    const alMontarEditor = useCallback((editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => ejecutarRef.current());
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => guardarRef.current());
    }, []);

    // ── Llevar la consulta a un .sql ──
    const moverASql = useCallback(async (ruta) => {
        const destino = /\.sql$/i.test(ruta) ? ruta : `${ruta}.sql`;
        try {
            const existe = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(destino)}`).then(r => r.json()).catch(() => ({ error: true }));
            if (!existe.error) return { success: false, error: `${nombreDe(destino)} already exists. Choose another name.` };
            const r = await fetch(`${API_BASE}/api/file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: destino, content: currentQuery.endsWith('\n') ? currentQuery : `${currentQuery}\n` }),
            });
            const d = await r.json();
            if (d.error) return { success: false, error: d.error };
            setMoviendo(false);
            setSourceLink(destino);
            setQueryExpanded(false);
            avisar({ source: destino });
            toast.success(`The query now lives in ${nombreDe(destino)}. Save the chart to keep the link.`);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }, [currentQuery, avisar, toast]);

    const sinEjecutar = currentQuery.trim() !== consultaEjecutada.trim();

    return (
        <div className="axp">
            <SaveQueryModal
                isOpen={moviendo}
                onClose={() => setMoviendo(false)}
                onSave={moverASql}
                initialName={`${nombreDe(tab.path).replace(/\.amoxvis$/i, '') || 'query'}.sql`}
                initialFolder={carpetaDe(tab.path)}
                title="Move the query to a .sql file"
                placeholder="query.sql"
                hideDescription
            />

            {/* ── La barra: qué documento es y de dónde sale su consulta ── */}
            <div className="axp-barra">
                {isReadOnly && (
                    <>
                        <span className="axp-galeria"><LuBookOpen size={12} /> Gallery Preview — Read Only</span>
                        <button
                            className="axp-btn axp-btn--primario"
                            onClick={async () => {
                                try {
                                    const chartId = tab.path.split(/[/\\]/).pop().replace('.amoxvis', '');
                                    const res = await fetch(`${API_BASE}/api/gallery/copy-to-workspace`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ chartId }),
                                    });
                                    const result = await res.json();
                                    if (result.success) toast.success(`Saved to project: ${chartId}.amoxvis`);
                                    else toast.error(result.error || 'Failed to save');
                                } catch {
                                    toast.error('Failed to save to project');
                                }
                            }}
                            title="Copy this chart to your current project"
                        >
                            <LuSave size={12} /> Save to Project
                        </button>
                    </>
                )}

                {!isReadOnly && (
                    <nav className="axp-miga" aria-label="Where this chart's query lives">
                        {sourceLink ? (
                            <>
                                <button className="axp-miga-sql" onClick={handleAbrirSql}
                                    title={`Edit the query in ${nombreDe(sourceLink)}. The chart follows it when you save that file.`}>
                                    <LuFileCode size={13} /> {nombreDe(sourceLink)}
                                </button>
                                <LuChevronRight size={12} className="axp-miga-sep" aria-hidden />
                            </>
                        ) : null}
                        <span className="axp-miga-doc" title={tab.path}>
                            <LuChartColumn size={13} /> {nombreDe(tab.path) || tab.name}
                            {tab.dirty && <span className="axp-punto" title="Unsaved changes (Ctrl+S)" />}
                        </span>
                        {!sourceLink && <span className="axp-miga-nota">Own query</span>}
                    </nav>
                )}

                <div className="axp-acciones">
                    <button className={`axp-btn${queryExpanded ? ' axp-btn--activo' : ''}`} onClick={() => setQueryExpanded(v => !v)}
                        aria-expanded={queryExpanded} title={sourceLink ? 'Show the query' : 'Show and edit the query'}>
                        {queryExpanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />} Query
                    </button>
                    {!isReadOnly && (
                        <button className="axp-btn" onClick={() => executeQuery(currentQuery)} disabled={isLoading || !currentQuery.trim()}
                            title="Run the query again with the latest data">
                            <LuRefreshCw size={12} className={isLoading ? 'spin' : ''} /> Refresh
                        </button>
                    )}
                </div>
            </div>

            {/* El .sql cambió y tiene varias consultas: cuál sigue este gráfico. */}
            {sourceDrift && (
                <div className="axp-deriva" role="status">
                    <LuGitBranch size={13} />
                    <span className="axp-deriva-texto">
                        <strong>{nombreDe(sourceLink)}</strong> changed and its query for this chart isn't there any more. Which one should it follow?
                    </span>
                    {sourceDrift.sentencias.length > 0 && (
                        <>
                            <select className="axp-deriva-select" value={eleccion} onChange={e => setEleccion(Number(e.target.value))} aria-label="Query to follow">
                                {sourceDrift.sentencias.map((s, i) => <option key={i} value={i}>{i + 1}. {primeraLinea(s)}</option>)}
                            </select>
                            <button className="axp-btn axp-btn--primario" onClick={() => seguir(sourceDrift.sentencias[eleccion])}>Follow</button>
                        </>
                    )}
                    <button className="axp-btn" onClick={handleUnlinkSource} title="Keep this chart's query as it is and stop following the file">
                        <LuUnlink size={11} /> Unlink
                    </button>
                </div>
            )}

            {/* ── La consulta, en la misma pestaña ── */}
            {queryExpanded && (
                <section className="axp-consulta" aria-label="Query">
                    <div className="axp-consulta-barra">
                        {sourceLink ? (
                            <>
                                <span className="axp-consulta-titulo">From <strong>{nombreDe(sourceLink)}</strong> — edit it there; the chart follows when you save it.</span>
                                <button className="axp-btn" onClick={handleAbrirSql}><LuExternalLink size={12} /> Open {nombreDe(sourceLink)}</button>
                                {!isReadOnly && <button className="axp-btn" onClick={handleUnlinkSource} title="Make the query part of this chart"><LuUnlink size={11} /> Unlink</button>}
                            </>
                        ) : (
                            <>
                                <span className="axp-consulta-titulo">
                                    Saved with this chart{sinEjecutar ? <em className="axp-sin-ejecutar"> · not run yet</em> : null}
                                </span>
                                {!isReadOnly && (
                                    <>
                                        <button className="axp-btn axp-btn--primario" onClick={() => executeQuery(currentQuery)} disabled={isLoading || !currentQuery.trim()} title="Run (Ctrl+Enter)">
                                            <LuPlay size={12} /> Run
                                        </button>
                                        <button className="axp-btn" onClick={() => setMoviendo(true)} disabled={!currentQuery.trim()}
                                            title="Save the query as a .sql file and link this chart to it">
                                            <LuFileOutput size={12} /> Move to a .sql file…
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    <div className="axp-consulta-editor">
                        <Editor
                            path={`inmemory://amoxsql/consulta-${tab.id}.sql`}
                            value={currentQuery}
                            language="sql"
                            theme={MONACO_THEME_NAME}
                            beforeMount={registerMonaco}
                            onMount={alMontarEditor}
                            onChange={sourceLink || isReadOnly ? undefined : alEscribir}
                            options={{
                                readOnly: !!sourceLink || isReadOnly, minimap: { enabled: false }, fontSize: 12,
                                wordWrap: 'on', scrollBeyondLastLine: false, automaticLayout: true,
                                lineNumbersMinChars: 3, renderLineHighlight: 'none', fixedOverflowWidgets: true,
                            }}
                        />
                    </div>
                </section>
            )}

            {/* ── El gráfico ── */}
            <div className="axp-figura">
                {isLoading && !data && (
                    <div className="axp-estado"><LuLoader size={18} className="spin" /> Executing query...</div>
                )}

                {error && <div className="axp-error">{error}</div>}

                {data && data.length > 0 && (
                    <DataVisualizer
                        data={data}
                        query={currentQuery}
                        initialChartConfig={config}
                        onConfigChange={handleConfigChange}
                        onCreateNew={onCreateNew}
                        incluirSpec
                        onGuardar={onSave ? () => onSave() : null}
                    />
                )}

                {data && data.length === 0 && !isLoading && (
                    <div className="axp-estado">Query returned no data.</div>
                )}

                {!data && !isLoading && !error && !currentQuery.trim() && (
                    <div className="axp-estado">This chart has no query yet. Open <strong>Query</strong> to write one.</div>
                )}
            </div>
        </div>
    );
};

export default AmoxvisPane;
