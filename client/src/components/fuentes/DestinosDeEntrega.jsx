/**
 * DestinosDeEntrega — the delivery destinations (5.11, D6), in two places:
 *   - variante="tabla": the workspace's page in the workspaces view, under
 *     its sources (managed without opening a project);
 *   - variante="arbol": the database explorer, under Sources, for the open
 *     project (its own and its workspace's).
 * Each one shows where it is on this machine, and "Set folder" when it isn't.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { LuChevronDown, LuChevronRight, LuFolderOpen, LuPencil, LuPlus, LuSend, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import DeleteConfirmModal from '../DeleteConfirmModal';
import EditorDeDestino from './EditorDeDestino';
import { listarDestinos, borrarDestino, ubicarDestino, elegirCarpeta, avisarCambioDestinos, TEXTO_ESTADO_DESTINO } from './api';
import { API_BASE } from '../../api.js';

export default function DestinosDeEntrega({ variante = 'arbol', workspace = null, avisar }) {
    // En el explorador, el workspace del proyecto abierto (para ofrecer «todos sus proyectos»).
    const [delProyecto, setDelProyecto] = useState(null);
    useEffect(() => {
        if (variante !== 'arbol') return;
        fetch(`${API_BASE}/api/project/workspace`).then(r => (r.ok ? r.json() : null)).then(d => setDelProyecto(d?.workspace || null)).catch(() => {});
    }, [variante]);
    const workspaceIdDelProyecto = delProyecto?.id || null;
    const workspaceNombre = delProyecto?.nombre || null;
    const [lista, setLista] = useState(null);
    const [editor, setEditor] = useState(null);
    const [aBorrar, setABorrar] = useState(null);
    const [abierta, setAbierta] = useState(true);
    const avisarRef = useRef(avisar);
    avisarRef.current = avisar;
    const aviso = (t) => avisarRef.current?.(t);
    const wsId = workspace?.id || null;

    const cargar = useCallback(async () => {
        try { setLista(await listarDestinos(wsId || undefined)); }
        catch (e) { setLista([]); avisarRef.current?.(e.message); }
    }, [wsId]);
    useEffect(() => { cargar(); }, [cargar]);
    useEffect(() => {
        window.addEventListener('amox_destinos_cambiaron', cargar);
        return () => window.removeEventListener('amox_destinos_cambiaron', cargar);
    }, [cargar]);

    // Con un proyecto abierto, el servidor sabe si el destino es suyo o de su workspace.
    const dondeDe = () => wsId || undefined;
    const ubicar = async (d) => {
        const r = await elegirCarpeta();
        if (!r) return;
        try { await ubicarDestino(d.nombre, r, dondeDe(d)); avisarCambioDestinos(); }
        catch (e) { aviso(e.message); }
    };
    const borrar = async () => {
        const d = aBorrar;
        try { await borrarDestino(d.nombre, dondeDe(d)); setABorrar(null); avisarCambioDestinos(); }
        catch (e) { setABorrar(null); aviso(e.message); }
    };

    const modales = (
        <>
            {editor && (
                <EditorDeDestino
                    destino={editor.destino || null}
                    workspaceId={wsId || workspaceIdDelProyecto}
                    workspaceNombre={workspace?.nombre || workspaceNombre}
                    enProyecto={!wsId}
                    onClose={() => setEditor(null)}
                />
            )}
            <DeleteConfirmModal
                isOpen={!!aBorrar}
                onClose={() => setABorrar(null)}
                onConfirm={borrar}
                itemName={aBorrar ? `${aBorrar.nombre} (processes that deliver there will ask for another destination; no file is touched)` : ''}
                itemType="Destination"
            />
        </>
    );

    if (variante === 'tabla') {
        return (
            <>
                <div className="wsv-etq fnt-etq">
                    <LuSend size={12} />Destinations
                    <button className="wsv-btn wsv-btn--fant fnt-etq-btn" type="button" onClick={() => setEditor({})}><LuPlus size={13} />New destination</button>
                </div>
                <div className="wsv-caja">
                    <table className="wsv-tabla">
                        <thead><tr><th>Destination</th><th>Folder on this machine</th><th>Status</th><th /></tr></thead>
                        <tbody>
                            {lista && lista.length === 0 && (
                                <tr><td colSpan={4} className="wsv-vacio">
                                    No destinations yet. A destination is a folder you name once — <code>client-delivery</code> — where every process of {workspace?.nombre} leaves its files.
                                </td></tr>
                            )}
                            {(lista || []).map(d => {
                                const problema = TEXTO_ESTADO_DESTINO[d.estado];
                                return (
                                    <tr key={d.nombre}>
                                        <td><b className="wsv-mono">{d.nombre}</b>{d.descripcion && <small>{d.descripcion}</small>}</td>
                                        <td>
                                            <small className="wsv-mono fnt-ruta">{d.ubicacionAqui || '—'}</small>
                                            {d.subcarpeta && <small className="fnt-actual">then <span className="wsv-mono">{d.subcarpeta}</span></small>}
                                        </td>
                                        <td>{problema ? <span className="wsv-chip wsv-chip--warn">{problema.toLowerCase()}</span> : <span className="wsv-chip">ready</span>}</td>
                                        <td className="wsv-td-acciones">
                                            <button className="wsv-btn" type="button" onClick={() => ubicar(d)} title="Set the folder on this machine"><LuFolderOpen size={13} />Set folder</button>
                                            <button className="wsv-btn" type="button" onClick={() => setEditor({ destino: d })} aria-label={`Edit ${d.nombre}`}><LuPencil size={13} /></button>
                                            <button className="wsv-btn wsv-btn--fant" type="button" onClick={() => setABorrar(d)} aria-label={`Remove ${d.nombre}`}><LuTrash2 size={13} /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {modales}
            </>
        );
    }

    return (
        <div className="db-schema-group fnt-grupo">
            <div className="db-schema-row" onClick={() => setAbierta(a => !a)}>
                <div className="db-chevron">{abierta ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}</div>
                <LuSend size={13} className="db-schema-icon fnt-icono" />
                <span className="db-schema-name">Destinations</span>
                <span className="db-schema-count">{lista?.length ?? 0}</span>
                <button className="db-schema-er-btn fnt-nueva" title="New destination" onClick={(e) => { e.stopPropagation(); setEditor({}); }}>
                    <LuPlus size={13} />
                </button>
            </div>
            {abierta && (
                <div className="db-schema-children tree-reveal">
                    {lista && !lista.length && (
                        <div className="fnt-vacio">
                            Name a folder once and processes deliver there.{' '}
                            <button type="button" className="fnt-enlace" onClick={() => setEditor({})}>New destination</button>
                        </div>
                    )}
                    {(lista || []).map(d => {
                        const problema = TEXTO_ESTADO_DESTINO[d.estado];
                        return (
                            <div key={d.nombre} className="db-table-item">
                                <div className="db-table-row edd-fila-arbol" title={d.ubicacionAqui || ''}>
                                    <LuSend size={12} className="db-table-icon" />
                                    <span className="db-table-name">{d.nombre}</span>
                                    {problema && <span className="fnt-problema" title={problema}><LuTriangleAlert size={11} /> {problema}</span>}
                                    <span className="edd-acciones">
                                        <button type="button" className="edd-boton" onClick={() => ubicar(d)} title="Set the folder on this machine" aria-label={`Set the folder of ${d.nombre}`}><LuFolderOpen size={12} /></button>
                                        <button type="button" className="edd-boton" onClick={() => setEditor({ destino: d })} title="Edit" aria-label={`Edit ${d.nombre}`}><LuPencil size={12} /></button>
                                        <button type="button" className="edd-boton" onClick={() => setABorrar(d)} title="Remove" aria-label={`Remove ${d.nombre}`}><LuTrash2 size={12} /></button>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {modales}
        </div>
    );
}
