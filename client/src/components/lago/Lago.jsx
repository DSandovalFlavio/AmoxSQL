import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuHistory, LuChevronDown, LuChevronRight, LuX, LuLoader, LuWrench, LuWaves, LuTriangleAlert } from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { useToast } from '../ToastProvider';

/**
 * DuckLake de primera clase (5.12, fase 8; I8, Dec-33): crear un lago, ver sus versiones,
 * consultar una tabla «como estaba» y qué cambió, y el mantenimiento con lo que borra a
 * la vista antes de hacerlo.
 */
const API = `${API_BASE}/api/lago`;
const pedir = async (ruta, cuerpo) => {
    const r = await fetch(`${API}${ruta}`, cuerpo === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
    return d;
};
export const esLago = (db) => /\.ducklake(\.sqlite)?$/i.test(String(db || ''));
const fechaCorta = (f) => { const d = new Date(String(f).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? String(f) : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const mb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Modal({ titulo, onClose, children }) {
    return createPortal(
        <div className="modal-overlay cvp-fondo" onClick={onClose}>
            <div className="modal-panel cvp-panel lago-modal" role="dialog" onClick={e => e.stopPropagation()}>
                <div className="cvp-cabecera">
                    <div className="cvp-titulo"><LuWaves size={15} /><span>{titulo}</span></div>
                    <button className="cvp-cerrar" onClick={onClose} aria-label="Close"><LuX size={15} /></button>
                </div>
                <div className="cvp-cuerpo">{children}</div>
            </div>
        </div>,
        document.body,
    );
}

/** «New lake…»: un catálogo y su carpeta de datos, en la carpeta del proyecto. */
export function NuevoLago({ onClose }) {
    const toast = useToast();
    const [nombre, setNombre] = useState('lake');
    const [catalogo, setCatalogo] = useState('duckdb');
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const crear = async () => {
        setOcupado(true); setError(null);
        try {
            const r = await pedir('/crear', { nombre, catalogo });
            toast.success(`${r.archivo} created. Open it from the database selector in the title bar.`);
            window.dispatchEvent(new Event('amox_files_changed'));
            onClose();
        } catch (e) { setError(e.message); }
        setOcupado(false);
    };
    return (
        <Modal titulo="New lake" onClose={onClose}>
            <p className="lago-texto">A DuckLake lake keeps every change as a version: you can query a table as it was yesterday, see what changed, and go back. It lives in the project folder: a catalog file and a folder with the data.</p>
            <label className="lago-campo">Name <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus /></label>
            <div className="lago-opciones" role="radiogroup" aria-label="Catalog">
                <label><input type="radio" checked={catalogo === 'duckdb'} onChange={() => setCatalogo('duckdb')} /> <b>Simple</b> — the catalog is one file (<code>{nombre || 'lake'}.ducklake</code>). Only one program writes at a time.</label>
                <label><input type="radio" checked={catalogo === 'sqlite'} onChange={() => setCatalogo('sqlite')} /> <b>Shared with dbt</b> — a SQLite catalog (<code>{nombre || 'lake'}.ducklake.sqlite</code>): dbt can write while AmoxSQL has it open.</label>
            </div>
            {error && <p className="lago-error">{error}</p>}
            <div className="lago-pie">
                <button className="lote-correr" disabled={ocupado || !nombre.trim()} onClick={crear}>{ocupado ? <LuLoader size={13} className="lote-gira" /> : null} Create lake</button>
            </div>
        </Modal>
    );
}

/** Mantenimiento (Dec-33): compactar no borra; expirar y limpiar sí, y lo dice antes. */
function Mantenimiento({ onClose, onHecho }) {
    const toast = useToast();
    const [dias, setDias] = useState(30);
    const [expirar, setExpirar] = useState(true);
    const [limpiar, setLimpiar] = useState(true);
    const [vista, setVista] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        let vivo = true;
        const t = setTimeout(() => pedir('/mantenimiento/previsualizar', { dias }).then(v => vivo && setVista(v)).catch(e => vivo && setError(e.message)), 250);
        return () => { vivo = false; clearTimeout(t); };
    }, [dias]);
    const hacer = async () => {
        setOcupado(true); setError(null);
        try {
            const r = await pedir('/mantenimiento', { compactar: true, expirarDias: expirar ? dias : null, limpiar });
            toast.success(`Lake maintained: ${r.compactados} files compacted, ${r.expiradas} versions expired, ${r.borrados} files removed${r.bytes ? ` (${mb(r.bytes)})` : ''}.`);
            onHecho?.();
            onClose();
        } catch (e) { setError(e.message); }
        setOcupado(false);
    };
    const borra = (expirar && vista?.versiones?.expiran > 0) || (limpiar && vista?.archivos?.cuantos > 0);
    return (
        <Modal titulo="Maintain the lake" onClose={onClose}>
            <p className="lago-texto"><b>Compact</b> joins small data files into bigger ones: queries get faster and nothing is lost.</p>
            <label className="lago-check"><input type="checkbox" checked={expirar} onChange={e => setExpirar(e.target.checked)} /> Expire versions older than <input type="number" min="0" value={dias} onChange={e => setDias(Math.max(0, Number(e.target.value) || 0))} /> days</label>
            <label className="lago-check"><input type="checkbox" checked={limpiar} onChange={e => setLimpiar(e.target.checked)} /> Remove data files no version uses any more</label>
            {vista && (
                <div className={`lago-vista${borra ? ' lago-vista--borra' : ''}`}>
                    {borra && <LuTriangleAlert size={13} />}
                    <span>
                        {expirar ? `${vista.versiones.expiran} of ${vista.versiones.total} versions expire` : 'No version expires'}
                        {limpiar ? ` · ${vista.archivos.cuantos} files (${mb(vista.archivos.bytes || 0)}) are removed now` : ''}
                        {expirar && vista.versiones.expiran > 0 && vista.consultableDesde ? `. After this, the oldest you can query «as it was» is ${fechaCorta(vista.consultableDesde)}.` : '.'}
                        {borra ? ' This cannot be undone.' : ''}
                    </span>
                </div>
            )}
            {error && <p className="lago-error">{error}</p>}
            <div className="lago-pie">
                <button className={`lote-correr${borra ? ' lago-peligro' : ''}`} disabled={ocupado || !vista} onClick={hacer}>
                    {ocupado ? <LuLoader size={13} className="lote-gira" /> : null}{borra ? 'Compact and remove' : 'Compact'}
                </button>
            </div>
        </Modal>
    );
}

/** Las versiones del lago abierto, en el explorador. */
export function VersionesDelLago({ refresco, onSelectQuery }) {
    const [abierto, setAbierto] = useState(false);
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [manteniendo, setManteniendo] = useState(false);
    const cargar = useCallback(() => {
        pedir('/versiones').then(d => { setDatos(d); setError(null); }).catch(e => setError(e.message));
    }, []);
    useEffect(() => { cargar(); }, [cargar, refresco]);
    if (!datos?.lago) return null;
    const lista = datos.versiones || [];
    const consulta = async (ruta, cuerpo) => {
        try { const d = await pedir(ruta, cuerpo); onSelectQuery?.(d.sql); } catch (e) { setError(e.message); }
    };
    const separar = (t) => { const i = t.indexOf('.'); return i > 0 ? { schema: t.slice(0, i), tabla: t.slice(i + 1) } : { schema: 'main', tabla: t }; };
    return (
        <div className="lago-versiones">
            <div className="db-schema-row" onClick={() => setAbierto(a => !a)}>
                <div className="db-chevron">{abierto ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}</div>
                <LuHistory size={13} className="db-schema-icon" />
                <span className="db-schema-name">Lake versions</span>
                <span className="db-schema-count">{lista.length}</span>
                <button className="db-schema-er-btn" title="Maintain the lake: compact files, expire old versions" onClick={(e) => { e.stopPropagation(); setManteniendo(true); }}><LuWrench size={13} /></button>
            </div>
            {abierto && (
                <div className="db-schema-children tree-reveal">
                    {error && <div className="lago-error">{error}</div>}
                    {lista.map(v => (
                        <div key={v.version} className="lago-version">
                            <div className="lago-version-cab"><b>v{v.version}</b><span>{fechaCorta(v.fecha)}</span>{v.autor && <em>{v.autor}</em>}</div>
                            {v.mensaje && <div className="lago-version-msj">{v.mensaje}</div>}
                            <div className="lago-version-cambios" title={v.cambios}>{v.cambios || 'no changes'}</div>
                            {v.tablas.filter(t => !/^\d+$/.test(t)).map(t => (
                                <div key={t} className="lago-version-tabla">
                                    <span>{t}</span>
                                    <button type="button" onClick={() => consulta('/como-estaba', { ...separar(t), version: v.version })} title={`Query ${t} as it was in version ${v.version}`}>As it was</button>
                                    {v.version > 0 && <button type="button" onClick={() => consulta('/que-cambio', { ...separar(t), desde: v.version - 1, hasta: v.version })} title={`Rows added, removed or updated in ${t} by version ${v.version}`}>What changed</button>}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            {manteniendo && <Mantenimiento onClose={() => setManteniendo(false)} onHecho={cargar} />}
        </div>
    );
}

/** «As it was…» desde el menú de una tabla: por versión o por fecha. */
export function ComoEstaba({ tabla, schema, onClose, onSelectQuery }) {
    const [versiones, setVersiones] = useState([]);
    const [modo, setModo] = useState('version');
    const [version, setVersion] = useState('');
    const [fecha, setFecha] = useState(() => new Date(Date.now() - 86400000).toISOString().slice(0, 16));
    const [error, setError] = useState(null);
    useEffect(() => { pedir('/versiones').then(d => { setVersiones(d.versiones || []); setVersion(String(d.versiones?.[1]?.version ?? d.versiones?.[0]?.version ?? '')); }).catch(e => setError(e.message)); }, []);
    const abrir = async () => {
        try {
            const d = await pedir('/como-estaba', { schema, tabla, ...(modo === 'version' ? { version } : { fecha: new Date(fecha).toISOString() }) });
            onSelectQuery?.(d.sql);
            onClose();
        } catch (e) { setError(e.message); }
    };
    return (
        <Modal titulo={`${tabla} as it was`} onClose={onClose}>
            <div className="lago-opciones" role="radiogroup">
                <label><input type="radio" checked={modo === 'version'} onChange={() => setModo('version')} /> In version
                    <select value={version} onChange={e => setVersion(e.target.value)} disabled={modo !== 'version'}>
                        {versiones.map(v => <option key={v.version} value={v.version}>{`v${v.version} · ${fechaCorta(v.fecha)}${v.cambios ? ` · ${v.cambios.slice(0, 60)}` : ''}`}</option>)}
                    </select>
                </label>
                <label><input type="radio" checked={modo === 'fecha'} onChange={() => setModo('fecha')} /> On <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} disabled={modo !== 'fecha'} /></label>
            </div>
            {error && <p className="lago-error">{error}</p>}
            <div className="lago-pie"><button className="lote-correr" onClick={abrir}>Open the query</button></div>
        </Modal>
    );
}
