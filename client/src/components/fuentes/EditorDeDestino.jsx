/**
 * EditorDeDestino — create or change a delivery destination (5.11, D6).
 *
 * A destination is a named folder where processes leave what they produce:
 * "client-delivery" is G:\Clients\North\Reports on this machine and another
 * folder on the next one. The name, description and a dated subfolder travel
 * with the workspace (or the project); the folder is this machine's.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { LuFolderOpen, LuSend, LuX } from 'react-icons/lu';
import { guardarDestino, elegirCarpeta, avisarCambioDestinos, NOMBRE_VALIDO } from './api';

const hoyCon = (plantilla) => {
    const d = new Date();
    const dos = (n) => String(n).padStart(2, '0');
    return plantilla
        .replace(/\{fecha(?::([^}]+))?\}/g, (_, f) => (f || 'AAAA-MM-DD')
            .replace(/AAAA|YYYY/g, d.getFullYear()).replace(/MM/g, dos(d.getMonth() + 1)).replace(/DD/g, dos(d.getDate())));
};

export default function EditorDeDestino({ destino = null, workspaceId = null, workspaceNombre = null, enProyecto = true, onClose }) {
    const [nombre, setNombre] = useState(destino?.nombre || '');
    const [descripcion, setDescripcion] = useState(destino?.descripcion || '');
    const [subcarpeta, setSubcarpeta] = useState(destino?.subcarpeta || '');
    const [carpeta, setCarpeta] = useState(destino?.ubicacionAqui || '');
    const [donde, setDonde] = useState(destino ? (destino.origen === 'workspace' ? 'workspace' : 'proyecto') : (enProyecto ? 'proyecto' : 'workspace'));
    const [error, setError] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const nombreMalo = nombre && !NOMBRE_VALIDO.test(nombre);

    const elegir = async () => { const r = await elegirCarpeta(); if (r) setCarpeta(r); };

    const guardar = async (e) => {
        e.preventDefault();
        setGuardando(true); setError(null);
        try {
            await guardarDestino({
                workspaceId: donde === 'workspace' ? workspaceId : undefined,
                definicion: { nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, subcarpeta: subcarpeta.trim() || undefined, ...(/^[a-z0-9]+:\/\//i.test(carpeta) ? { ubicacion: carpeta.trim() } : {}) },
                ubicacionAqui: /^[a-z0-9]+:\/\//i.test(carpeta) ? undefined : (carpeta.trim() || null),
            });
            avisarCambioDestinos();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setGuardando(false);
        }
    };

    return createPortal(
        <div className="modal-overlay cvp-fondo" onClick={onClose}>
            <form className="modal-panel cvp-panel edd-panel" role="dialog" aria-labelledby="edd-titulo" onClick={e => e.stopPropagation()} onSubmit={guardar}>
                <div className="cvp-cabecera">
                    <div className="cvp-titulo"><LuSend size={15} /><span id="edd-titulo">{destino ? `Destination ${destino.nombre}` : 'New destination'}</span></div>
                    <button type="button" className="cvp-cerrar" onClick={onClose} aria-label="Close"><LuX size={15} /></button>
                </div>
                <div className="cvp-cuerpo">
                    <p className="cvp-intro">
                        A folder with a name where processes leave what they produce — an Excel, a CSV, a published file.
                        Processes say <code>{nombre || 'client-delivery'}</code>, not a path, so they work the same on every machine.
                    </p>
                    <label className="lote-campo">
                        <span>Name</span>
                        <input className={`cvp-input cvp-mono${nombreMalo ? ' cvp-input--mal' : ''}`} value={nombre} disabled={!!destino}
                            onChange={e => setNombre(e.target.value.toLowerCase())} placeholder="client-delivery" spellCheck={false} required />
                        {nombreMalo && <small className="cvp-aviso">Lowercase letters, digits and hyphens.</small>}
                    </label>
                    <label className="lote-campo">
                        <span>Description <small>(optional)</small></span>
                        <input className="cvp-input" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="The client's shared folder for monthly reports" />
                    </label>
                    <label className="lote-campo">
                        <span>Folder on this machine</span>
                        <div className="edd-fila">
                            <input className="cvp-input cvp-mono" value={carpeta} onChange={e => setCarpeta(e.target.value)} placeholder="G:\Clients\North\Reports" spellCheck={false} />
                            {window.electronAPI?.selectFolder && <button type="button" className="cvp-anadir" onClick={elegir}><LuFolderOpen size={13} /> Choose</button>}
                        </div>
                        <small className="cvp-nota">Only this machine knows it. On another one, the destination asks for its folder the first time.</small>
                    </label>
                    <label className="lote-campo">
                        <span>Subfolder by date <small>(optional)</small></span>
                        <input className="cvp-input cvp-mono" value={subcarpeta} onChange={e => setSubcarpeta(e.target.value)} placeholder="{fecha:AAAA}/{fecha:MM}" spellCheck={false} />
                        {subcarpeta && <small className="cvp-nota">Today: <code>{hoyCon(subcarpeta)}</code>. A scheduled run uses the date it was due.</small>}
                    </label>
                    {!destino && workspaceId && (
                        <div className="lote-campo">
                            <span>Who sees it</span>
                            <div className="xls-modo" role="radiogroup" aria-label="Who sees it">
                                <button type="button" role="radio" aria-checked={donde === 'workspace'} className={donde === 'workspace' ? 'activo' : ''} onClick={() => setDonde('workspace')}>Every project of {workspaceNombre || 'the group'}</button>
                                {enProyecto && <button type="button" role="radio" aria-checked={donde === 'proyecto'} className={donde === 'proyecto' ? 'activo' : ''} onClick={() => setDonde('proyecto')}>Only this project</button>}
                            </div>
                        </div>
                    )}
                    {error && <p className="chain-config-hint-error">{error}</p>}
                    <div className="lote-pie">
                        <span />
                        <button type="submit" className="lote-correr" disabled={guardando || !nombre || nombreMalo}>{destino ? 'Save' : 'Create destination'}</button>
                    </div>
                </div>
            </form>
        </div>,
        document.body
    );
}
