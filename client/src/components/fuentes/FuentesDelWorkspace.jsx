/**
 * Las fuentes de un workspace, en su ficha de la vista de workspaces (C1, 1.5).
 *
 * Se gestionan sin abrir ningún proyecto, como su contexto (B2): todas sus
 * carpetas las ven. La ubicación de cada archivo es de esta máquina; la
 * definición viaja en el .amoxworkspace.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { LuInbox, LuPlus, LuFolderOpen, LuPencil, LuTrash2 } from 'react-icons/lu';
import EditorDeFuente from './EditorDeFuente';
import DeleteConfirmModal from '../DeleteConfirmModal';
import { listarFuentes, borrarFuente, ubicarFuente, elegirArchivo, avisarCambio, TEXTO_ESTADO } from './api';

export default function FuentesDelWorkspace({ workspace, avisar }) {
    const [lista, setLista] = useState(null);
    const [editor, setEditor] = useState(null);
    // `avisar` cambia en cada render de la vista: por ref, para no recargar en bucle.
    const avisarRef = useRef(avisar);
    avisarRef.current = avisar;
    const aviso = (t) => avisarRef.current?.(t);

    const cargar = useCallback(async () => {
        try { setLista((await listarFuentes(workspace.id)).fuentes); }
        catch (e) { setLista([]); avisarRef.current?.(e.message); }
    }, [workspace.id]);

    useEffect(() => { cargar(); }, [cargar]);
    useEffect(() => {
        window.addEventListener('amox_fuentes_cambiaron', cargar);
        return () => window.removeEventListener('amox_fuentes_cambiaron', cargar);
    }, [cargar]);

    const ubicar = async (f) => {
        const r = await elegirArchivo();
        if (!r) return;
        try { await ubicarFuente(f.nombre, r, workspace.id); avisarCambio(); }
        catch (e) { aviso(e.message); }
    };

    const [aBorrar, setABorrar] = useState(null);
    const borrar = async () => {
        const f = aBorrar;
        try { await borrarFuente(f.nombre, workspace.id); setABorrar(null); avisarCambio(); }
        catch (e) { setABorrar(null); aviso(e.message); }
    };

    return (
        <>
            <div className="wsv-etq fnt-etq">
                <LuInbox size={12} />Sources
                <button className="wsv-btn wsv-btn--fant fnt-etq-btn" type="button" onClick={() => setEditor({ nueva: true })}>
                    <LuPlus size={13} />New source
                </button>
            </div>
            <div className="wsv-caja">
                <table className="wsv-tabla">
                    <thead><tr><th>Source</th><th>File on this machine</th><th>Status</th><th /></tr></thead>
                    <tbody>
                        {lista && lista.length === 0 && (
                            <tr><td colSpan={4} className="wsv-vacio">
                                No sources yet. A source is a file you name once — <code>weekly-sales</code> — and every project of {workspace.nombre} reads it as <code>fuentes."weekly-sales"</code>.
                            </td></tr>
                        )}
                        {(lista || []).map(f => {
                            const problema = TEXTO_ESTADO[f.estado];
                            return (
                                <tr key={f.nombre}>
                                    <td><b className="wsv-mono">{f.nombre}</b>{f.descripcion && <small>{f.descripcion}</small>}</td>
                                    <td>
                                        <small className="wsv-mono fnt-ruta">{f.ubicacionAqui || '—'}</small>
                                        {f.actual && (
                                            <small className="fnt-actual">
                                                {f.criterio === 'todos' ? `${f.leidos} files combined, newest ` : 'Reading '}
                                                <span className="wsv-mono">{f.actual.nombre}</span> · {new Date(f.actual.modificada).toLocaleString()}
                                            </small>
                                        )}
                                    </td>
                                    <td>
                                        {problema
                                            ? <span className="wsv-chip wsv-chip--warn">{problema.toLowerCase()}</span>
                                            : <span className="wsv-chip">{f.estado === 'remota' ? 'remote' : 'found'}</span>}
                                    </td>
                                    <td className="wsv-td-acciones">
                                        <button className="wsv-btn" type="button" onClick={() => ubicar(f)} title="Set where the file is on this machine"><LuFolderOpen size={13} />Locate</button>
                                        <button className="wsv-btn" type="button" onClick={() => setEditor({ fuente: f })} aria-label={`Edit ${f.nombre}`}><LuPencil size={13} /></button>
                                        <button className="wsv-btn wsv-btn--fant" type="button" onClick={() => setABorrar(f)} aria-label={`Remove ${f.nombre}`}><LuTrash2 size={13} /></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {editor && (
                <EditorDeFuente
                    fuente={editor.fuente || null}
                    workspaceId={workspace.id}
                    workspaceNombre={workspace.nombre}
                    enProyecto={false}
                    onClose={() => setEditor(null)}
                />
            )}

            <DeleteConfirmModal
                isOpen={!!aBorrar}
                onClose={() => setABorrar(null)}
                onConfirm={borrar}
                itemName={aBorrar ? `${aBorrar.nombre} (every project of ${workspace.nombre} loses it; the file is not touched)` : ''}
                itemType="Source"
            />
        </>
    );
}
