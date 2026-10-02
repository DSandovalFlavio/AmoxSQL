/**
 * Crear o editar una fuente con nombre (C1, fase 1.5 del plan de la 5.10).
 *
 * Un solo formulario, en el orden en que se piensa: dónde vive la definición
 * (el proyecto o su workspace), qué archivo es, cómo se llama, y —si es un
 * Excel o un CSV— cómo se lee. «Preview» lo lee de verdad, sin guardar nada.
 *
 * La ubicación del archivo es de ESTA máquina (Dec-9): otra máquina pone la
 * suya. Salvo que el archivo esté dentro del proyecto: entonces va relativa en
 * la definición y vale en todas.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuInbox, LuX, LuFolderOpen, LuPlay, LuCheck, LuTriangleAlert } from 'react-icons/lu';
import { useEtiqueta } from '../../etiqueta';
import {
    guardarFuente, probarFuente, hojasDeExcel, elegirArchivo, sugerirNombre, formatoDe, NOMBRE_VALIDO, avisarCambio,
} from './api';

const FORMATOS = { xlsx: 'Excel', csv: 'CSV', parquet: 'Parquet', json: 'JSON' };

export default function EditorDeFuente({ fuente = null, workspaceId = null, workspaceNombre = null, enProyecto = true, onClose }) {
    const e = useEtiqueta();
    const editando = !!fuente;
    // Dónde vive la definición. Al editar no se cambia: sería otra fuente.
    const [destino, setDestino] = useState(
        editando ? (fuente.origen === 'workspace' ? 'workspace' : 'proyecto') : (enProyecto ? 'proyecto' : 'workspace')
    );
    const [ruta, setRuta] = useState(fuente?.ubicacionAqui || '');
    const [nombre, setNombre] = useState(fuente?.nombre || '');
    const [nombreTocado, setNombreTocado] = useState(editando);
    const [descripcion, setDescripcion] = useState(fuente?.descripcion || '');
    const [hojas, setHojas] = useState([]);
    const [hoja, setHoja] = useState(fuente?.excel?.hoja || '');
    const [rango, setRango] = useState(fuente?.excel?.rango || '');
    const [encabezado, setEncabezado] = useState(fuente?.excel?.encabezado !== false && fuente?.csv?.encabezado !== false);
    const [delimitador, setDelimitador] = useState(fuente?.csv?.delimitador || '');
    const [vista, setVista] = useState(null);       // { columnas, filas }
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);

    const formato = fuente?.formato || formatoDe(ruta);
    const puedeElegirDestino = !editando && enProyecto && !!workspaceId;

    // El nombre sale del archivo hasta que el usuario lo escribe.
    useEffect(() => {
        if (!nombreTocado && ruta) setNombre(sugerirNombre(ruta));
    }, [ruta, nombreTocado]);

    // Las hojas de un Excel, para elegir.
    useEffect(() => {
        setHojas([]);
        if (formato !== 'xlsx' || !ruta) return;
        let vivo = true;
        hojasDeExcel(ruta).then(h => { if (vivo) { setHojas(h); if (!hoja && h[0]) setHoja(h[0]); } }).catch(() => {});
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ruta, formato]);

    const definicion = useMemo(() => {
        const d = { nombre: nombre.trim(), descripcion: descripcion.trim() || null, tipo: 'archivo' };
        if (formato === 'xlsx') d.excel = { hoja: hoja || undefined, rango: rango.trim() || undefined, encabezado };
        if (formato === 'csv') d.csv = { delimitador: delimitador || undefined, encabezado };
        // Al editar una fuente cuya ruta va en la definición, se conserva.
        if (editando && fuente.como !== 'local' && fuente.ubicacion && ruta === fuente.ubicacionAqui) d.ubicacion = fuente.ubicacion;
        return d;
    }, [nombre, descripcion, formato, hoja, rango, encabezado, delimitador, editando, fuente, ruta]);

    // Lo que cambia la lectura invalida la vista previa.
    useEffect(() => { setVista(null); }, [ruta, hoja, rango, encabezado, delimitador]);

    const nombreValido = NOMBRE_VALIDO.test(nombre.trim());
    const listo = nombreValido && !!ruta.trim() && !ocupado;

    const elegir = async () => {
        const r = await elegirArchivo();
        if (r) setRuta(r);
    };

    const previsualizar = async () => {
        setOcupado(true); setError(null);
        try { setVista(await probarFuente({ ...definicion, nombre: nombreValido ? definicion.nombre : 'vista-previa' }, ruta.trim())); }
        catch (e) { setError(e.message); setVista(null); }
        finally { setOcupado(false); }
    };

    const guardar = async () => {
        setOcupado(true); setError(null);
        try {
            const { fuente: guardada } = await guardarFuente({
                workspaceId: destino === 'workspace' ? workspaceId : undefined,
                definicion,
                anterior: editando ? fuente.nombre : null,
                ubicacionAqui: ruta.trim() !== (fuente?.ubicacionAqui || '') || !editando ? ruta.trim() : undefined,
            });
            avisarCambio();
            onClose?.(guardada);
        } catch (e) {
            setError(e.message);
            setOcupado(false);
        }
    };

    // En un portal: el panel lateral donde vive el explorador crea su propio
    // bloque contenedor, y un position: fixed dentro de él quedaría encajonado.
    return createPortal((
        <div className="ww-backdrop">
            <div className="ww-card fnt-card" role="dialog" aria-modal="true" aria-labelledby="fnt-editor-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuInbox size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="fnt-editor-titulo">{editando ? `Edit ${fuente.nombre}` : 'New source'}</h2>
                        <p className="ww-subtitle">A file you set up once and then use by name, anywhere: the editor, notebooks, Data Flow and the assistant.</p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={() => onClose?.(null)} title="Close"><LuX size={16} /></button>
                </div>

                <div className="wsx-cuerpo fnt-cuerpo">
                    {puedeElegirDestino && (
                        <div className="fnt-campo">
                            <span className="fnt-etiqueta">Belongs to</span>
                            <div className="fnt-segmento" role="radiogroup">
                                <button type="button" role="radio" aria-checked={destino === 'proyecto'}
                                    className={`fnt-segmento-op${destino === 'proyecto' ? ' fnt-segmento-op--on' : ''}`}
                                    onClick={() => setDestino('proyecto')}>This project</button>
                                <button type="button" role="radio" aria-checked={destino === 'workspace'}
                                    className={`fnt-segmento-op${destino === 'workspace' ? ' fnt-segmento-op--on' : ''}`}
                                    onClick={() => setDestino('workspace')}>{workspaceNombre || `Its ${e.s}`}</button>
                            </div>
                            <span className="fnt-nota">
                                {destino === 'workspace'
                                    ? `Every project of ${workspaceNombre || `the ${e.s}`} sees it.`
                                    : `Only this project sees it. With the same name, it replaces the one from ${workspaceNombre || `the ${e.s}`}.`}
                            </span>
                        </div>
                    )}

                    <label className="fnt-campo">
                        <span className="fnt-etiqueta">File</span>
                        <div className="fnt-archivo">
                            <input className="wsx-input fnt-mono" value={ruta} onChange={e => setRuta(e.target.value)}
                                placeholder="C:\Data\incoming\weekly-sales.xlsx" spellCheck={false} />
                            {window.electronAPI?.openFileDialog && (
                                <button type="button" className="ww-btn-skip fnt-btn" onClick={elegir}><LuFolderOpen size={14} /> Choose…</button>
                            )}
                        </div>
                        <span className="fnt-nota">
                            {destino === 'workspace' || !enProyecto
                                ? 'Where the file is on this machine. Other machines set their own location.'
                                : 'A file inside the project is saved relative to it and works on every machine.'}
                            {formato && <> · {FORMATOS[formato]}</>}
                        </span>
                    </label>

                    <div className="fnt-fila">
                        <label className="fnt-campo fnt-crece">
                            <span className="fnt-etiqueta">Name</span>
                            <input className="wsx-input fnt-mono" value={nombre} spellCheck={false}
                                onChange={e => { setNombre(e.target.value.toLowerCase()); setNombreTocado(true); }}
                                placeholder="weekly-sales" />
                            <span className={`fnt-nota${nombre && !nombreValido ? ' fnt-nota--mal' : ''}`}>
                                {nombre && !nombreValido
                                    ? 'Lowercase letters, digits and hyphens only.'
                                    : <>Query it as <code>fuentes."{nombre || 'name'}"</code></>}
                            </span>
                        </label>
                    </div>

                    <label className="fnt-campo">
                        <span className="fnt-etiqueta">Description <small>(optional, the assistant reads it)</small></span>
                        <input className="wsx-input" value={descripcion} onChange={e => setDescripcion(e.target.value)}
                            placeholder="Sales per store, arrives every Monday" />
                    </label>

                    {formato === 'xlsx' && (
                        <div className="fnt-fila">
                            <label className="fnt-campo fnt-crece">
                                <span className="fnt-etiqueta">Sheet</span>
                                {hojas.length ? (
                                    <select className="wsx-input" value={hoja} onChange={e => setHoja(e.target.value)}>
                                        {hojas.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                ) : (
                                    <input className="wsx-input" value={hoja} onChange={e => setHoja(e.target.value)} placeholder="First sheet" />
                                )}
                            </label>
                            <label className="fnt-campo">
                                <span className="fnt-etiqueta">Range</span>
                                <input className="wsx-input wsx-input--corto fnt-mono" value={rango} spellCheck={false}
                                    onChange={e => setRango(e.target.value.toUpperCase())} placeholder="A4:E" />
                            </label>
                        </div>
                    )}
                    {formato === 'xlsx' && (
                        <span className="fnt-nota fnt-nota--suelta">
                            Leave the range empty to read the whole sheet. <code>A4:E</code> reads from row 4 down to the first empty row — the usual shape of a report with a title on top and notes below.
                        </span>
                    )}

                    {formato === 'csv' && (
                        <div className="fnt-fila">
                            <label className="fnt-campo">
                                <span className="fnt-etiqueta">Delimiter</span>
                                <input className="wsx-input wsx-input--corto fnt-mono" value={delimitador} maxLength={4}
                                    onChange={e => setDelimitador(e.target.value)} placeholder="Detect" />
                            </label>
                        </div>
                    )}

                    {(formato === 'xlsx' || formato === 'csv') && (
                        <label className="wsx-check fnt-check">
                            <input type="checkbox" checked={encabezado} onChange={e => setEncabezado(e.target.checked)} />
                            The first row holds the column names
                        </label>
                    )}

                    {vista && (
                        <div className="fnt-vista">
                            <div className="fnt-vista-titulo">
                                <LuCheck size={13} /> {vista.columnas.length} columns · first {vista.filas.length} rows
                            </div>
                            <div className="fnt-vista-tabla">
                                <table>
                                    <thead><tr>{vista.columnas.map(c => <th key={c.nombre} title={c.tipo}>{c.nombre}<small>{c.tipo.toLowerCase()}</small></th>)}</tr></thead>
                                    <tbody>
                                        {vista.filas.map((f, i) => (
                                            <tr key={i}>{vista.columnas.map(c => <td key={c.nombre}>{f[c.nombre] === null || f[c.nombre] === undefined ? <span className="fnt-nulo">null</span> : String(f[c.nombre])}</td>)}</tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {error && <p className="wsx-error fnt-error"><LuTriangleAlert size={13} /> {error}</p>}
                </div>

                <div className="ww-actions wsx-actions">
                    <button className="ww-btn-skip fnt-btn" type="button" style={{ marginRight: 'auto' }}
                        onClick={previsualizar} disabled={!ruta.trim() || ocupado}>
                        <LuPlay size={13} /> Preview
                    </button>
                    <button className="ww-btn-skip" type="button" onClick={() => onClose?.(null)}>Cancel</button>
                    <button className="ww-btn-create" type="button" onClick={guardar} disabled={!listo}>
                        <LuCheck size={14} /> {editando ? 'Save' : 'Create source'}
                    </button>
                </div>
            </div>
        </div>
    ), document.body);
}
