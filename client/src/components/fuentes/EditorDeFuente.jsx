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
import LecturaExcel from '../excel/LecturaExcel';
import { lecturaRecordada } from '../excel/api';
import { archivosDeLaCarpeta, elegirCarpeta } from './api';

const FORMATOS = { xlsx: 'Excel', csv: 'CSV', parquet: 'Parquet', json: 'JSON' };

export default function EditorDeFuente({ fuente = null, workspaceId = null, workspaceNombre = null, enProyecto = true, onClose }) {
    const e = useEtiqueta();
    const editando = !!fuente;
    // Dónde vive la definición. Al editar no se cambia: sería otra fuente.
    const [destino, setDestino] = useState(
        editando ? (fuente.origen === 'workspace' ? 'workspace' : 'proyecto') : (enProyecto ? 'proyecto' : 'workspace')
    );
    const [ruta, setRuta] = useState(fuente?.ubicacionAqui || '');
    // C3: un archivo, o una carpeta donde llega (el más reciente, o todos unidos).
    const [tipo, setTipo] = useState(fuente?.tipo === 'carpeta' ? 'carpeta' : 'archivo');
    const [criterio, setCriterio] = useState(fuente?.criterio === 'todos' ? 'todos' : 'reciente');
    const [patron, setPatron] = useState(fuente?.patron || '*.xlsx');
    const [subcarpetas, setSubcarpetas] = useState(!!fuente?.subcarpetas);
    const [carpeta, setCarpeta] = useState(null);   // { archivos: [...] } de lo que hay ahora
    const [nombre, setNombre] = useState(fuente?.nombre || '');
    const [nombreTocado, setNombreTocado] = useState(editando);
    const [descripcion, setDescripcion] = useState(fuente?.descripcion || '');
    const [hojas, setHojas] = useState([]);
    // Las hojas que se leen: una, o varias que se unen con la columna _hoja (2.4).
    const [elegidas, setElegidas] = useState(fuente?.excel?.hojas || (fuente?.excel?.hoja ? [fuente.excel.hoja] : []));
    const [unir, setUnir] = useState((fuente?.excel?.hojas || []).length > 1);
    const [excelOpc, setExcelOpc] = useState(() => {
        const { hoja: _h, hojas: _hs, ...resto } = fuente?.excel || {};
        return resto;
    });
    const [encabezado, setEncabezado] = useState(fuente?.csv?.encabezado !== false);
    const [delimitador, setDelimitador] = useState(fuente?.csv?.delimitador || '');
    const [vista, setVista] = useState(null);       // { columnas, filas }
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);

    const esCarpeta = tipo === 'carpeta';
    const formato = esCarpeta ? (formatoDe(patron) || fuente?.formato) : (fuente?.formato || formatoDe(ruta));
    // El archivo sobre el que se eligen hoja y rango: el mismo, o el más reciente de la carpeta.
    const muestra = esCarpeta ? (carpeta?.archivos?.find(a => a.quieto)?.ruta || '') : ruta;

    // Lo que hay ahora en la carpeta, con este patrón.
    useEffect(() => {
        setCarpeta(null);
        if (!esCarpeta || !ruta.trim()) return;
        let vivo = true;
        const t = setTimeout(() => {
            archivosDeLaCarpeta(ruta.trim(), patron, subcarpetas)
                .then(r => { if (vivo) setCarpeta(r); })
                .catch(err => { if (vivo) setCarpeta({ error: err.message, archivos: [] }); });
        }, 250);
        return () => { vivo = false; clearTimeout(t); };
    }, [esCarpeta, ruta, patron, subcarpetas]);
    const puedeElegirDestino = !editando && enProyecto && !!workspaceId;

    // El nombre sale del archivo hasta que el usuario lo escribe.
    useEffect(() => {
        if (nombreTocado || !ruta) return;
        // Una carpeta se nombra por su patrón si dice algo («ventas*.xlsx» → ventas), si no por ella.
        const delPatron = patron.replace(/\.[^.]*$/, '').replace(/[*?]/g, ' ').trim();
        setNombre(sugerirNombre(esCarpeta ? (delPatron || ruta) : ruta));
    }, [ruta, nombreTocado, esCarpeta, patron]);

    // Las hojas de un Excel, para elegir; y, en una fuente nueva, cómo se leyó
    // ese archivo la última vez en el proyecto (lo recuerda el diálogo de importar).
    useEffect(() => {
        setHojas([]);
        if (formato !== 'xlsx' || !muestra) return;
        let vivo = true;
        hojasDeExcel(muestra).then(async h => {
            if (!vivo) return;
            setHojas(h);
            const antes = !editando ? await lecturaRecordada(muestra).catch(() => null) : null;
            if (!vivo) return;
            if (antes) {
                const previas = (antes.hojas || (antes.hoja ? [antes.hoja] : [])).filter(x => h.includes(x));
                setElegidas(previas.length ? previas : [h[0]]);
                setUnir(previas.length > 1);
                const { hoja: _h, hojas: _hs, ...resto } = antes;
                setExcelOpc(resto);
            } else {
                setElegidas(prev => (prev.length && prev.every(x => h.includes(x)) ? prev : [h[0]]));
            }
        }).catch(() => {});
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [muestra, formato]);

    const definicion = useMemo(() => {
        const d = { nombre: nombre.trim(), descripcion: descripcion.trim() || null, tipo };
        if (esCarpeta) Object.assign(d, { patron: patron.trim() || '*', criterio, subcarpetas: subcarpetas || undefined, formato: formato || undefined });
        if (formato === 'xlsx') {
            d.excel = { ...excelOpc };
            if (unir && elegidas.length > 1) d.excel.hojas = elegidas;
            else if (elegidas[0]) d.excel.hoja = elegidas[0];
        }
        if (formato === 'csv') d.csv = { delimitador: delimitador || undefined, encabezado };
        // Al editar una fuente cuya ruta va en la definición, se conserva.
        if (editando && fuente.como !== 'local' && fuente.ubicacion && ruta === fuente.ubicacionAqui) d.ubicacion = fuente.ubicacion;
        return d;
    }, [nombre, descripcion, tipo, esCarpeta, patron, criterio, subcarpetas, formato, excelOpc, elegidas, unir, encabezado, delimitador, editando, fuente, ruta]);

    // Lo que cambia la lectura invalida la vista previa (la de CSV, Parquet y
    // JSON; la de Excel se rehace sola dentro de LecturaExcel).
    useEffect(() => { setVista(null); }, [ruta, tipo, patron, criterio, subcarpetas, encabezado, delimitador]);

    const nombreValido = NOMBRE_VALIDO.test(nombre.trim());
    const listo = nombreValido && !!ruta.trim() && !ocupado;

    const elegir = async () => {
        const r = esCarpeta ? await elegirCarpeta() : await elegirArchivo();
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

                    <div className="fnt-campo">
                        <span className="fnt-etiqueta">What it reads</span>
                        <div className="fnt-segmento" role="radiogroup" aria-label="What the source reads">
                            {[['archivo', 'reciente', 'One file'], ['carpeta', 'reciente', 'Newest file in a folder'], ['carpeta', 'todos', 'All files in a folder']].map(([t, c, texto]) => {
                                const on = tipo === t && (t === 'archivo' || criterio === c);
                                return (
                                    <button key={texto} type="button" role="radio" aria-checked={on}
                                        className={`fnt-segmento-op${on ? ' fnt-segmento-op--on' : ''}`}
                                        onClick={() => { if (t !== tipo) setRuta(''); setTipo(t); setCriterio(c); }}>{texto}</button>
                                );
                            })}
                        </div>
                        <span className="fnt-nota">
                            {!esCarpeta && 'A file that stays put, or that is replaced in place.'}
                            {esCarpeta && criterio === 'reciente' && 'For a file that arrives with a new name each time (Sales Week 39.xlsx, Sales Week 40.xlsx…): the source is always the newest one, once it has finished arriving.'}
                            {esCarpeta && criterio === 'todos' && 'Every matching file, combined by column name, with an _archivo column that says where each row came from.'}
                        </span>
                    </div>

                    <label className="fnt-campo">
                        <span className="fnt-etiqueta">{esCarpeta ? 'Folder' : 'File'}</span>
                        <div className="fnt-archivo">
                            <input className="wsx-input fnt-mono" value={ruta} onChange={e => setRuta(e.target.value)}
                                placeholder={esCarpeta ? 'C:\\Data\\incoming' : 'C:\\Data\\incoming\\weekly-sales.xlsx'} spellCheck={false} />
                            {(esCarpeta ? window.electronAPI?.selectFolder : window.electronAPI?.openFileDialog) && (
                                <button type="button" className="ww-btn-skip fnt-btn" onClick={elegir}><LuFolderOpen size={14} /> Choose…</button>
                            )}
                        </div>
                        <span className="fnt-nota">
                            {destino === 'workspace' || !enProyecto
                                ? `Where the ${esCarpeta ? 'folder' : 'file'} is on this machine. Other machines set their own location.`
                                : `A ${esCarpeta ? 'folder' : 'file'} inside the project is saved relative to it and works on every machine.`}
                            {formato && <> · {FORMATOS[formato]}</>}
                        </span>
                    </label>

                    {esCarpeta && (
                        <div className="fnt-fila">
                            <label className="fnt-campo">
                                <span className="fnt-etiqueta">File name pattern</span>
                                <input className="wsx-input wsx-input--corto fnt-mono" value={patron} spellCheck={false}
                                    onChange={e => setPatron(e.target.value)} placeholder="sales*.xlsx" />
                            </label>
                            <label className="wsx-check fnt-check-fila">
                                <input type="checkbox" checked={subcarpetas} onChange={e => setSubcarpetas(e.target.checked)} />
                                Look in subfolders too
                            </label>
                        </div>
                    )}
                    {esCarpeta && carpeta && (
                        <div className="fnt-carpeta">
                            {carpeta.error ? <span className="fnt-nota fnt-nota--mal">{carpeta.error}</span>
                                : !carpeta.archivos.length ? <span className="fnt-nota">No file in this folder matches <code>{patron || '*'}</code> yet.</span>
                                : (
                                    <>
                                        <span className="fnt-nota">{carpeta.total} matching file{carpeta.total === 1 ? '' : 's'}{criterio === 'reciente' ? '; the source reads the newest:' : ', combined:'}</span>
                                        <ul>
                                            {carpeta.archivos.slice(0, 6).map((a, k) => (
                                                <li key={a.ruta} className={k === 0 && criterio === 'reciente' && a.quieto ? 'fnt-carpeta-actual' : ''}>
                                                    <span className="fnt-mono">{a.nombre}</span>
                                                    <small>{a.quieto ? new Date(a.modificada).toLocaleString() : 'still arriving'}</small>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                        </div>
                    )}

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

                    {formato === 'xlsx' && hojas.length > 0 && (
                        <div className="fnt-campo">
                            <span className="fnt-etiqueta">Sheet</span>
                            {!unir ? (
                                <select className="wsx-input" value={elegidas[0] || ''} onChange={e => setElegidas([e.target.value])}>
                                    {hojas.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            ) : (
                                <div className="fnt-hojas">
                                    {hojas.map(h => (
                                        <label key={h} className="wsx-check">
                                            <input type="checkbox" checked={elegidas.includes(h)}
                                                onChange={() => setElegidas(prev => prev.includes(h) ? prev.filter(x => x !== h) : hojas.filter(x => x === h || prev.includes(x)))} />
                                            {h}
                                        </label>
                                    ))}
                                </div>
                            )}
                            {hojas.length > 1 && (
                                <label className="wsx-check">
                                    <input type="checkbox" checked={unir} onChange={e => { setUnir(e.target.checked); if (!e.target.checked) setElegidas(prev => prev.slice(0, 1)); }} />
                                    Combine several sheets with the same columns (one per month, say) — a <code>_hoja</code> column says where each row came from
                                </label>
                            )}
                        </div>
                    )}
                    {formato === 'xlsx' && muestra && elegidas.length > 0 && (
                        <LecturaExcel
                            ruta={muestra}
                            hoja={unir && elegidas.length > 1 ? null : elegidas[0]}
                            hojas={unir && elegidas.length > 1 ? elegidas : null}
                            opciones={excelOpc}
                            onOpciones={setExcelOpc}
                        />
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

                    {formato === 'csv' && (
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
                    {formato === 'xlsx' ? <span style={{ marginRight: 'auto' }} /> : (
                        <button className="ww-btn-skip fnt-btn" type="button" style={{ marginRight: 'auto' }}
                            onClick={previsualizar} disabled={!ruta.trim() || ocupado}>
                            <LuPlay size={13} /> Preview
                        </button>
                    )}
                    <button className="ww-btn-skip" type="button" onClick={() => onClose?.(null)}>Cancel</button>
                    <button className="ww-btn-create" type="button" onClick={guardar} disabled={!listo}>
                        <LuCheck size={14} /> {editando ? 'Save' : 'Create source'}
                    </button>
                </div>
            </div>
        </div>
    ), document.body);
}
