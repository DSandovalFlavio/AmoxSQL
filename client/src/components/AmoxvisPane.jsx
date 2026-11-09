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
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { recordarDatosDeGrafico, leerDatosDeGrafico, fijarProveedorDeFoco, fijarAplicador } from '../utils/memoriaDePestana';
import { suscribirPropuestas } from './ai/propuestasEnEditor.js';
import {
    estructuraDeGrafico, esDeGrafico, vigenteEnGrafico, aplicarCambios, validarCambios, describirCambios, describirGrafico,
} from './ai/archivos/grafico.js';
import AntesYPropuesta from './ai/revision/AntesYPropuesta.jsx';
import { mismoGrafico, escribirAmoxvis } from './DataVisualizer/vega/figura';
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
import { atajosGlobalesEnMonaco } from '../utils/atajosEnMonaco.js';
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

    const tabId = tab.id;
    const metaRef = useRef({ types: null, queryId: null, truncated: false });
    const avisadoRef = useRef(null);
    const peticionRef = useRef(null);
    // Irse de la pestaña detiene la lectura: si no, seguía ocupando el motor.
    useEffect(() => () => peticionRef.current?.abort(), []);

    const executeQuery = useCallback(async (q) => {
        peticionRef.current?.abort();
        const peticion = new AbortController();
        peticionRef.current = peticion;
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q }),
                signal: peticion.signal,
            });
            const result = await response.json();
            if (response.ok) {
                // Los tipos y el id del resultado, para el Assistant (E4).
                metaRef.current = { types: result.types || null, queryId: result.queryId || null, truncated: !!result.truncated };
                setData(result.data);
                setConsultaEjecutada(q);
                recordarDatosDeGrafico(tabId, q, result.data);
            } else {
                setError(result.error || 'Query failed');
            }
        } catch (err) {
            if (!peticion.signal.aborted) setError(err.message);
        } finally {
            if (peticionRef.current === peticion) setIsLoading(false);
        }
    }, [tabId]);

    // El documento cambió: la consulta, el vínculo o lo que avisa el gráfico.
    const avisar = useCallback((cambios = {}) => {
        if (!onConfigChange) return;
        const query = 'query' in cambios ? cambios.query : currentQuery;
        const source = 'source' in cambios ? cambios.source : sourceLink;
        const merged = { ...ultimoConfigRef.current, ...(cambios.config || {}), query: query || '' };
        if (source) merged.source = source; else delete merged.source;
        // Lo último que este gráfico escribió en la pestaña: lo que llegue distinto
        // vino de fuera (X3).
        avisadoRef.current = merged;
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
            if (cancelado || !currentQuery) return;
            const recordados = leerDatosDeGrafico(tabId, currentQuery);
            if (recordados) {
                setData(recordados);
                setConsultaEjecutada(currentQuery);
            } else {
                executeQuery(currentQuery);
            }
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
        atajosGlobalesEnMonaco(editor, monaco);
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

    // ── El Assistant en el gráfico (plan del Assistant, E4) ──────────────────
    // Lo último de cada cosa, para leerlo al enviar sin repintar el gráfico.
    const focoRef = useRef({ etapa: 'type', vista: 'paneles' });
    const alDia = useRef({});
    alDia.current = { data, consultaEjecutada };
    const alFoco = useCallback((f) => { focoRef.current = f; }, []);

    // El foco: los paneles, la consulta, las columnas y la etapa (V2). Las filas
    // van como resultado, por la política de IA.
    useEffect(() => fijarProveedorDeFoco(tabId, () => {
        const { data: filas } = alDia.current;
        const meta = metaRef.current;
        const cfg = ultimoConfigRef.current || {};
        const columnas = meta.types
            ? Object.entries(meta.types).map(([name, type]) => ({ name, type }))
            : (filas?.[0] ? Object.keys(filas[0]) : []);
        return {
            grafico: estructuraDeGrafico({ config: cfg, columnas, etapa: focoRef.current.etapa, vista: focoRef.current.vista, spec: cfg.spec }),
            resultado: filas?.length ? { data: filas, types: meta.types, queryId: meta.queryId, truncated: meta.truncated, rowCount: filas.length } : null,
        };
    }), [tabId]);

    /** Una pregunta sobre el gráfico, al panel. */
    const asistir = useCallback((accion) => {
        window.dispatchEvent(new CustomEvent('amox_asistir', { detail: { accion, tabId } }));
    }, [tabId]);

    // Aceptar: los paneles entran por el estado de Story Flow (como si los tocara el
    // usuario); un spec, como si lo escribiera en la vista Code.
    useEffect(() => fijarAplicador(tabId, (resultado) => {
        if (!esDeGrafico(resultado)) return { error: 'This proposal is not for a chart.' };
        if (!alDia.current.data?.length) return { error: 'Run the chart\'s query first: the chart is drawn from its result.' };
        if (resultado.objetivo.tipo === 'spec') {
            window.dispatchEvent(new CustomEvent('amox_update_chart_config', { detail: { tabId, spec: resultado.spec } }));
            toast.info('Applied the Vega-Lite spec. Save to keep it.');
            return { ok: true };
        }
        const actual = ultimoConfigRef.current || {};
        if (!vigenteEnGrafico(actual, resultado)) return { error: 'Those settings changed since this was proposed.' };
        const { cambios, errores } = validarCambios(actual, resultado.cambios, Object.keys(alDia.current.data[0] || {}));
        if (errores.length) return { error: errores.join(' ') };
        const nuevos = aplicarCambios(actual, cambios);
        const soloLosQueCambian = Object.fromEntries(Object.keys(cambios).map(k => [k, nuevos[k]]));
        window.dispatchEvent(new CustomEvent('amox_update_chart_config', { detail: { tabId, changes: soloLosQueCambian } }));
        toast.info(`Applied: ${describirCambios(resultado).join(' · ')}. Save to keep it.`);
        return { ok: true };
    }), [tabId, toast]);

    // Las propuestas pendientes de este gráfico.
    const [propuestas, setPropuestas] = useState({ propuestas: [], acciones: null });
    useEffect(() => (tab.path ? suscribirPropuestas(tab.path, (p) => setPropuestas({
        propuestas: (p.propuestas || []).filter(tc => esDeGrafico(tc.result)),
        acciones: p.acciones,
    })) : undefined), [tab.path]);
    const [revision, setRevision] = useState({ id: null, vista: 'propuesta' });
    const vigentes = propuestas.propuestas.filter(tc => vigenteEnGrafico(ultimoConfigRef.current, tc.result));
    const enRevision = vigentes.find(tc => tc.toolCallId === revision.id) || vigentes[0] || null;
    const vistaRevision = enRevision && enRevision.toolCallId === revision.id ? revision.vista : 'antes';
    useEffect(() => {
        const alRevisar = (e) => {
            const id = e.detail?.toolCallId;
            if (propuestas.propuestas.some(tc => tc.toolCallId === id)) setRevision({ id, vista: 'propuesta' });
        };
        window.addEventListener('amox_revisar_propuesta', alRevisar);
        return () => window.removeEventListener('amox_revisar_propuesta', alRevisar);
    }, [propuestas.propuestas]);
    // La figura propuesta: el gráfico de hoy con los cambios (o con el spec, que se asimila al dibujar).
    const configPropuesta = useMemo(() => {
        if (!enRevision) return null;
        const actual = ultimoConfigRef.current || {};
        const r = enRevision.result;
        if (r.objetivo.tipo === 'spec') return { ...actual, modo: 'codigo', spec: r.spec };
        return aplicarCambios(actual, validarCambios(actual, r.cambios, data?.[0] ? Object.keys(data[0]) : []).cambios);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enRevision, data]);

    // X3: el contenido de la pestaña cambió por fuera (otra herramienta, un archivo
    // que se recargó): el gráfico lo vuelve a leer en vez de seguir con lo viejo.
    useEffect(() => {
        const avisado = avisadoRef.current;
        if (!tab.content || !avisado) return;
        if (mismoGrafico(tab.content, escribirAmoxvis(avisado))) return;
        const nuevo = configDe(tab);
        avisadoRef.current = nuevo;
        // Solo cambió la consulta (el gráfico siguió a su .sql): ya se redibujó.
        if (mismoGrafico(tab.content, escribirAmoxvis({ ...avisado, query: nuevo.query || '' }))) return;
        ultimoConfigRef.current = nuevo;
        window.dispatchEvent(new CustomEvent('amox_update_chart_config', { detail: { tabId, reemplazar: nuevo } }));
        if ((nuevo.query || '') !== currentQuery) { setCurrentQuery(nuevo.query || ''); if (nuevo.query) executeQuery(nuevo.query); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab.content]);

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

            {/* ── Antes / Propuesta: lo que propone el Assistant (E4) ── */}
            {enRevision && data && data.length > 0 && (
                <div className="axp-revision">
                    <AntesYPropuesta
                        key={enRevision.toolCallId}
                        tc={enRevision}
                        acciones={propuestas.acciones}
                        titulo={describirGrafico(enRevision.result)}
                        resumen={enRevision.result.resumen}
                        cambios={describirCambios(enRevision.result)}
                        vista={vistaRevision}
                        onVista={(v) => setRevision({ id: enRevision.toolCallId, vista: v })}
                        indice={vigentes.indexOf(enRevision)}
                        total={vigentes.length}
                        onSiguiente={() => setRevision({ id: vigentes[(vigentes.indexOf(enRevision) + 1) % vigentes.length].toolCallId, vista: 'propuesta' })}
                    />
                </div>
            )}

            {/* ── El gráfico ── */}
            <div className="axp-figura">
                {isLoading && !data && (
                    <div className="axp-estado"><LuLoader size={18} className="spin" /> Executing query...</div>
                )}

                {error && <div className="axp-error">{error}</div>}

                {/* La figura propuesta, sin mandos; la editable sigue montada debajo
                    (oculta) para no perder su estado. */}
                {data && data.length > 0 && enRevision && vistaRevision === 'propuesta' && configPropuesta && (
                    <div className="axp-capa axp-capa--propuesta">
                        <span className="deck-propuesta-etiqueta">Proposal</span>
                        <DataVisualizer
                            key={`propuesta-${enRevision.toolCallId}`}
                            data={data}
                            query={currentQuery}
                            initialChartConfig={configPropuesta}
                            lectura
                        />
                    </div>
                )}

                {data && data.length > 0 && (
                    <div className={`axp-capa${enRevision && vistaRevision === 'propuesta' && configPropuesta ? ' axp-capa--oculta' : ''}`}>
                        <DataVisualizer
                            data={data}
                            query={currentQuery}
                            initialChartConfig={config}
                            onConfigChange={handleConfigChange}
                            onCreateNew={onCreateNew}
                            incluirSpec
                            onGuardar={onSave ? () => onSave() : null}
                            destinoIa={tabId}
                            onFoco={alFoco}
                            onAsistir={isReadOnly ? null : asistir}
                        />
                    </div>
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
