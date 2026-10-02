/**
 * Importar un Excel a la base (C2, fase 2 del plan de la 5.10).
 *
 * El Excel que llega de un cliente no empieza en A1: lleva un título, una línea
 * de «generado el…», los encabezados en la fila 4 y notas al pie. Aquí se ve la
 * hoja tal como es, se marca dónde está la tabla con dos clics, y se ve al
 * momento lo que se va a leer. Lo elegido se recuerda en el proyecto, así que la
 * próxima vez sale ya elegido (y Data Flow lo usa).
 *
 * Varias hojas con la misma forma (una por mes) se unen en una tabla con la
 * columna `_hoja`, o se importan como tablas sueltas.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuSheet, LuX, LuCheck, LuTriangleAlert, LuFileText, LuLoader } from 'react-icons/lu';
import LecturaExcel from './excel/LecturaExcel';
import { hojasDelLibro, lecturaRecordada } from './excel/api';

const nombreDeTabla = (ruta) => (ruta.split(/[/\\]/).pop() || 'datos').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'datos';

const ImportExcelModal = ({ isOpen, onClose, onImport, initialFile = '' }) => {
    const [hojas, setHojas] = useState([]);
    const [elegidas, setElegidas] = useState([]);
    const [activa, setActiva] = useState(null);
    const [opciones, setOpciones] = useState({});
    const [modo, setModo] = useState('MERGE');
    const [tabla, setTabla] = useState('');
    const [error, setError] = useState(null);
    const [codigo, setCodigo] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [importando, setImportando] = useState(false);
    const [hecho, setHecho] = useState(null);
    const [recordado, setRecordado] = useState(false);

    useEffect(() => {
        if (!isOpen || !initialFile) return;
        let vivo = true;
        setHecho(null); setError(null); setCodigo(null); setHojas([]); setElegidas([]); setActiva(null);
        setOpciones({}); setRecordado(false); setTabla(nombreDeTabla(initialFile));
        setCargando(true);
        (async () => {
            try {
                const lista = await hojasDelLibro(initialFile);
                if (!vivo) return;
                setHojas(lista);
                const antes = await lecturaRecordada(initialFile).catch(() => null);
                if (!vivo) return;
                if (antes) {
                    const previas = (antes.hojas || (antes.hoja ? [antes.hoja] : [])).filter(h => lista.includes(h));
                    setElegidas(previas.length ? previas : [lista[0]]);
                    setActiva(previas[0] || lista[0]);
                    const { hoja: _h, hojas: _hs, ...resto } = antes;
                    setOpciones(resto);
                    setRecordado(true);
                } else {
                    setElegidas([lista[0]]);
                    setActiva(lista[0]);
                }
            } catch (e) {
                if (vivo) { setError(e.message); setCodigo(e.codigo || null); }
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [isOpen, initialFile]);

    if (!isOpen) return null;

    const alternar = (h) => {
        const nuevas = elegidas.includes(h) ? elegidas.filter(x => x !== h) : hojas.filter(x => x === h || elegidas.includes(x));
        setElegidas(nuevas);
        if (!elegidas.includes(h)) setActiva(h);              // la que se añade se enseña
        else if (activa === h) setActiva(nuevas[0] || null);  // la que se quita deja de enseñarse
    };

    const varias = elegidas.length > 1;
    const unir = varias && modo === 'MERGE';

    const importar = async (extra = {}) => {
        setImportando(true); setError(null);
        try {
            const r = await onImport({
                filePath: initialFile,
                mode: varias ? modo : 'MERGE',
                sheets: elegidas,
                tableName: tabla.trim(),
                opciones,
                ...extra,
            });
            if (r?.success) setHecho(r.summary || 'Imported.');
            else setError(r?.error || 'The import failed.');
        } catch (e) {
            setError(e.message);
        } finally {
            setImportando(false);
        }
    };

    const listo = elegidas.length > 0 && (!(!varias || modo === 'MERGE') || tabla.trim()) && !importando;

    return createPortal((
        <div className="ww-backdrop">
            <div className="ww-card xim-card" role="dialog" aria-modal="true" aria-labelledby="xim-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuSheet size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="xim-titulo">{hecho ? 'Import completed' : 'Import Excel'}</h2>
                        <p className="ww-subtitle xim-archivo">{initialFile}</p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={onClose} title="Close"><LuX size={16} /></button>
                </div>

                {hecho ? (
                    <div className="wsx-cuerpo">
                        <div className="xim-hecho"><LuCheck size={16} /><span>{hecho}</span></div>
                        <p className="fnt-nota">How it was read is remembered in this project: next time it comes pre-selected, and Data Flow reads the file the same way.</p>
                    </div>
                ) : (
                    <div className="wsx-cuerpo xim-cuerpo">
                        {cargando && <div className="xsr-estado"><LuLoader size={14} className="stg-spin" /> Opening the workbook…</div>}
                        {error && (
                            <div className="xim-error">
                                <p className="wsx-error fnt-error"><LuTriangleAlert size={13} /> {error}</p>
                                {codigo === 'csv_disfrazado' && (
                                    <div className="xim-csv">
                                        <input className="wsx-input fnt-mono" value={tabla} onChange={e => setTabla(e.target.value)} aria-label="Table name" />
                                        <button type="button" className="ww-btn-create" disabled={!tabla.trim() || importando}
                                            onClick={() => importar({ comoCsv: true })}>
                                            <LuFileText size={14} /> Import as CSV
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {hojas.length > 0 && (
                            <div className="xim-cuerpo-grid">
                                <aside className="xim-hojas">
                                    <span className="fnt-etiqueta">Sheets</span>
                                    {hojas.map(h => (
                                        <div key={h} className={`xim-hoja${activa === h ? ' xim-hoja--activa' : ''}`}>
                                            <input type="checkbox" checked={elegidas.includes(h)} onChange={() => alternar(h)} aria-label={`Import ${h}`} />
                                            <button type="button" onClick={() => setActiva(h)} title="Show this sheet">{h}</button>
                                        </div>
                                    ))}
                                    {recordado && <span className="fnt-nota xim-recordado">Last time's choices, remembered.</span>}
                                </aside>
                                <div className="xim-lectura">
                                    {activa && (
                                        <LecturaExcel
                                            ruta={initialFile}
                                            hoja={unir ? null : activa}
                                            hojas={unir ? [activa, ...elegidas.filter(h => h !== activa)] : null}
                                            opciones={opciones}
                                            onOpciones={setOpciones}
                                        />
                                    )}
                                </div>
                            </div>
                        )}

                        {hojas.length > 0 && (
                            <div className="xim-destino">
                                {varias && (
                                    <div className="fnt-segmento" role="radiogroup" aria-label="How to import the sheets">
                                        <button type="button" role="radio" aria-checked={modo === 'MERGE'}
                                            className={`fnt-segmento-op${modo === 'MERGE' ? ' fnt-segmento-op--on' : ''}`}
                                            onClick={() => setModo('MERGE')}>One table, with a _hoja column</button>
                                        <button type="button" role="radio" aria-checked={modo === 'INDIVIDUAL'}
                                            className={`fnt-segmento-op${modo === 'INDIVIDUAL' ? ' fnt-segmento-op--on' : ''}`}
                                            onClick={() => setModo('INDIVIDUAL')}>One table per sheet</button>
                                    </div>
                                )}
                                {(!varias || modo === 'MERGE') && (
                                    <label className="fnt-campo xim-tabla">
                                        <span className="fnt-etiqueta">Table</span>
                                        <input className="wsx-input fnt-mono" value={tabla} onChange={e => setTabla(e.target.value)} />
                                    </label>
                                )}
                                {varias && modo === 'INDIVIDUAL' && (
                                    <span className="fnt-nota">Each sheet becomes a table named after it, read with the same range and options.</span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="ww-actions wsx-actions">
                    {hecho ? (
                        <button className="ww-btn-create" type="button" onClick={onClose}>Close</button>
                    ) : (
                        <>
                            <button className="ww-btn-skip" type="button" onClick={onClose}>Cancel</button>
                            {hojas.length > 0 && (
                                <button className="ww-btn-create" type="button" onClick={() => importar()} disabled={!listo}>
                                    {importando ? <LuLoader size={14} className="stg-spin" /> : <LuCheck size={14} />}
                                    Import {elegidas.length > 1 ? `${elegidas.length} sheets` : ''}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    ), document.body);
};

export default ImportExcelModal;
