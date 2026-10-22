/**
 * Un proyecto nuevo desde un `.amoxproject` (5.14, G2 + G3; Dec-48).
 *
 * Se elige el paquete (se ve lo que trae sin extraerlo), una carpeta nueva y un
 * nombre; se extrae con un id propio y se dice lo que le falta en esta máquina:
 * credenciales (por su nombre), extensiones y fuentes sin ubicar.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { LuPackageOpen, LuX, LuFolderOpen, LuTriangleAlert, LuCheck, LuKeyRound, LuInbox, LuPuzzle } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

async function pedir(ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
}

const MOTIVO = { sin_definicion: 'not defined here', sin_ubicar: 'no location on this machine', no_encontrada: 'its file is not here' };

export default function DesdePaquete({ onAbrir, onClose }) {
    const [paquete, setPaquete] = useState(null);       // { ruta, manifiesto, entradas }
    const [carpeta, setCarpeta] = useState('');
    const [nombre, setNombre] = useState('');
    const [creado, setCreado] = useState(null);
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);

    const elegirPaquete = async () => {
        const r = await window.electronAPI?.openFileDialog?.({ title: 'Choose a project package', filters: [{ name: 'AmoxSQL project', extensions: ['amoxproject'] }] });
        const ruta = r && !r.canceled ? r.filePaths?.[0] : null;
        if (!ruta) return;
        setError(null);
        try {
            const d = await pedir('/api/paquete/leer', { ruta });
            setPaquete({ ruta, ...d });
            setNombre(d.manifiesto?.nombre ? `${d.manifiesto.nombre}${d.manifiesto.plantilla ? '' : '-copy'}` : 'project');
        } catch (e) { setError(e.message); setPaquete(null); }
    };

    const elegirCarpeta = async () => {
        const r = await window.electronAPI?.selectFolder?.();
        const dir = typeof r === 'string' ? r : (r && !r.canceled ? r.filePaths?.[0] : null);
        if (dir) setCarpeta(dir);
    };

    const destino = carpeta && nombre.trim() ? `${carpeta.replace(/[\\/]+$/, '')}${carpeta.includes('\\') ? '\\' : '/'}${nombre.trim()}` : '';

    const crear = async () => {
        setOcupado(true); setError(null);
        try { setCreado(await pedir('/api/proyecto/desde-paquete', { paquete: paquete.ruta, carpeta: destino })); }
        catch (e) { setError(e.message); }
        finally { setOcupado(false); }
    };

    const m = paquete?.manifiesto;
    const req = m?.requiere || {};
    const f = creado?.faltan;
    const faltaAlgo = f && (f.credenciales?.length || f.extensiones?.length || f.fuentes?.length);

    return createPortal((
        <div className="ww-backdrop">
            <div className="ww-card pqt-card" role="dialog" aria-modal="true" aria-labelledby="dpq-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuPackageOpen size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="dpq-titulo">New project from a package</h2>
                        <p className="ww-subtitle">Start from a project someone exported, or from a template: its processes, queries and notebooks, in a new folder.</p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={onClose} title="Close"><LuX size={16} /></button>
                </div>

                <div className="wsx-cuerpo fnt-cuerpo">
                    {!creado && (
                        <>
                            <div className="fnt-campo">
                                <span className="fnt-etiqueta">Package</span>
                                <button type="button" className="ww-btn-skip pqt-elegir" onClick={elegirPaquete}><LuFolderOpen size={13} /> {paquete ? paquete.ruta : 'Choose a .amoxproject…'}</button>
                            </div>
                            {m && (
                                <div className="pqt-resumen">
                                    <strong>{m.nombre}</strong>{m.plantilla ? ' · template' : ''} · {m.archivos} files{m.datos?.length ? ` · ${m.datos.length} data file${m.datos.length === 1 ? '' : 's'}` : ' · no data'}
                                    {(req.credenciales?.length > 0 || req.fuentes?.length > 0) && (
                                        <div className="pqt-meta">Needs {[req.credenciales?.length ? `credentials: ${req.credenciales.map(c => c.nombre).join(', ')}` : null, req.fuentes?.length ? `sources: ${req.fuentes.join(', ')}` : null].filter(Boolean).join(' · ')}</div>
                                    )}
                                </div>
                            )}
                            {m && (
                                <div className="fnt-fila">
                                    <label className="fnt-campo fnt-crece">
                                        <span className="fnt-etiqueta">Inside</span>
                                        <button type="button" className="ww-btn-skip pqt-elegir" onClick={elegirCarpeta}><LuFolderOpen size={13} /> {carpeta || 'Choose a folder…'}</button>
                                    </label>
                                    <label className="fnt-campo">
                                        <span className="fnt-etiqueta">Project name</span>
                                        <input className="wsx-input" value={nombre} onChange={e => setNombre(e.target.value.replace(/[\\/:*?"<>|]+/g, ''))} />
                                    </label>
                                </div>
                            )}
                            {destino && <p className="fnt-nota">It will be created in <code>{destino}</code> (a new, empty folder).</p>}
                        </>
                    )}
                    {creado && (
                        <>
                            <div className="pqt-hecho"><LuCheck size={15} /><div><strong>Created</strong>: {creado.archivos} files in <span className="pqt-ruta">{creado.raiz}</span></div></div>
                            {faltaAlgo ? (
                                <div className="pqt-faltan">
                                    <strong>On this computer it still needs</strong>
                                    <ul>
                                        {f.credenciales.map(c => <li key={`c-${c.nombre}`}><LuKeyRound size={12} /> the credential <strong>{c.nombre}</strong>: add it in Settings → Credentials</li>)}
                                        {f.extensiones.map(x => <li key={`e-${x}`}><LuPuzzle size={12} /> the extension <strong>{x}</strong> (it installs itself the first time, with internet)</li>)}
                                        {f.fuentes.map(x => <li key={`f-${x.nombre}`}><LuInbox size={12} /> the source <strong>{x.nombre}</strong>: {MOTIVO[x.motivo] || x.motivo}</li>)}
                                    </ul>
                                </div>
                            ) : <p className="fnt-nota">It has everything it needs on this computer.</p>}
                        </>
                    )}
                    {error && <p className="wsx-error fnt-error"><LuTriangleAlert size={13} /> {error}</p>}
                </div>

                <div className="ww-actions wsx-actions">
                    <span style={{ marginLeft: 'auto' }} />
                    {creado ? (
                        <button className="ww-btn-create" type="button" onClick={() => onAbrir?.(creado.raiz)}>Open project</button>
                    ) : (
                        <>
                            <button className="ww-btn-skip" type="button" onClick={onClose}>Cancel</button>
                            <button className="ww-btn-create" type="button" onClick={crear} disabled={!m || !destino || ocupado}>
                                <LuPackageOpen size={14} /> {ocupado ? 'Creating…' : 'Create project'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    ), document.body);
}
