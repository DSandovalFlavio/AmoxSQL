/**
 * La sección «Sources» del explorador de base (C1, fase 1.5).
 *
 * Las fuentes que ve el proyecto abierto —las suyas y las de su workspace—,
 * con sus columnas como las de una tabla. Se arrastran al editor como
 * `fuentes."nombre"`. Una que aquí no tiene ubicación, o cuyo archivo no está,
 * lo dice en su fila y ofrece ubicarla.
 */
import { useCallback, useEffect, useState } from 'react';
import {
    LuInbox, LuChevronRight, LuChevronDown, LuPlus, LuClipboard, LuCode, LuPencil,
    LuFolderOpen, LuTrash2, LuTriangleAlert,
} from 'react-icons/lu';
import DeleteConfirmModal from '../DeleteConfirmModal';
import { useToast } from '../ToastProvider';
import { API_BASE } from '../../api.js';
import { useEtiqueta } from '../../etiqueta';
import EditorDeFuente from './EditorDeFuente';
import {
    listarFuentes, columnasDeFuentes, borrarFuente, ubicarFuente, elegirArchivo, avisarCambio, TEXTO_ESTADO,
} from './api';

const ref = (nombre) => `fuentes."${nombre}"`;

export default function FuentesExplorador({ onSelectQuery, refresco, busqueda = '', getTypeMeta }) {
    const [datos, setDatos] = useState({ fuentes: [], workspaceId: null, esquemaHomonimo: false });
    const [columnas, setColumnas] = useState({});
    const [abierta, setAbierta] = useState(true);
    const [abiertas, setAbiertas] = useState({});
    const [menu, setMenu] = useState(null);           // { x, y, fuente }
    const [editor, setEditor] = useState(null);       // { fuente } | { nueva: true }
    const [aBorrar, setABorrar] = useState(null);
    const [workspaceNombre, setWorkspaceNombre] = useState(null);
    const toast = useToast();
    const e = useEtiqueta();

    const cargar = useCallback(async () => {
        try {
            const [lista, cols] = await Promise.all([listarFuentes(), columnasDeFuentes().catch(() => [])]);
            setDatos(lista);
            setColumnas(Object.fromEntries(cols.map(c => [c.nombre, c.columnas])));
            if (lista.workspaceId) {
                fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(lista.workspaceId)}`)
                    .then(r => (r.ok ? r.json() : null)).then(w => setWorkspaceNombre(w?.nombre || null)).catch(() => {});
            } else {
                setWorkspaceNombre(null);
            }
        } catch { /* sin proyecto o sin base: la sección queda vacía */ }
    }, []);

    useEffect(() => { cargar(); }, [cargar, refresco]);
    useEffect(() => {
        const h = () => cargar();
        window.addEventListener('amox_fuentes_cambiaron', h);
        return () => window.removeEventListener('amox_fuentes_cambiaron', h);
    }, [cargar]);
    useEffect(() => {
        const cerrar = () => setMenu(null);
        document.addEventListener('click', cerrar);
        return () => document.removeEventListener('click', cerrar);
    }, []);

    const ubicar = async (f) => {
        const r = await elegirArchivo();
        if (!r) return;
        try {
            await ubicarFuente(f.nombre, r, f.origen === 'workspace' ? datos.workspaceId : undefined);
            avisarCambio();
        } catch (e) { toast.error(e.message); }
    };

    const q = busqueda.trim().toLowerCase();
    const visibles = datos.fuentes.filter(f => !q || f.nombre.includes(q)
        || (columnas[f.nombre] || []).some(c => c.nombre.toLowerCase().includes(q)));
    if (q && !visibles.length) return null;

    return (
        <div className="db-schema-group fnt-grupo">
            <div className="db-schema-row" onClick={() => setAbierta(a => !a)}>
                <div className="db-chevron">{abierta || q ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}</div>
                <LuInbox size={13} className="db-schema-icon fnt-icono" />
                <span className="db-schema-name">Sources</span>
                <span className="db-schema-count">{datos.fuentes.length}</span>
                <button className="db-schema-er-btn fnt-nueva" title="New source"
                    onClick={(e) => { e.stopPropagation(); setEditor({ nueva: true }); }}>
                    <LuPlus size={13} />
                </button>
            </div>

            {(abierta || q) && (
                <div className="db-schema-children tree-reveal">
                    {datos.esquemaHomonimo && (
                        <div className="fnt-aviso"><LuTriangleAlert size={12} /> The database has a schema named «fuentes»: write <code>fuentes.main."name"</code> to reach a source.</div>
                    )}
                    {!datos.fuentes.length && (
                        <div className="fnt-vacio">
                            Name a file once and use it everywhere.{' '}
                            <button type="button" className="fnt-enlace" onClick={() => setEditor({ nueva: true })}>New source</button>
                        </div>
                    )}
                    {visibles.map(f => {
                        const problema = TEXTO_ESTADO[f.estado] || (f.error ? 'Cannot be read' : null);
                        const cols = columnas[f.nombre] || [];
                        const expandida = !!abiertas[f.nombre] || (q && !f.nombre.includes(q));
                        return (
                            <div key={f.nombre} className="db-table-item">
                                <div
                                    className="db-table-row"
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', ref(f.nombre));
                                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'table', name: f.nombre, schema: 'fuentes', ref: ref(f.nombre) }));
                                    }}
                                    onClick={() => setAbiertas(a => ({ ...a, [f.nombre]: !a[f.nombre] }))}
                                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, fuente: f }); }}
                                    title={`${ref(f.nombre)}${f.descripcion ? ` — ${f.descripcion}` : ''}${f.ubicacionAqui ? `\n${f.ubicacionAqui}` : ''}\nDrag to the editor or right click for options`}
                                >
                                    <div className="db-chevron">{expandida ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}</div>
                                    <LuInbox size={14} className="fnt-icono" />
                                    <span className="db-table-name">{f.nombre}</span>
                                    {f.origen === 'workspace' && <span className="fnt-origen" title={`From ${workspaceNombre || `the ${e.s}`}`}>{workspaceNombre ? workspaceNombre.slice(0, 1).toUpperCase() : 'W'}</span>}
                                    {problema && <LuTriangleAlert size={12} className="fnt-problema" title={problema} />}
                                    <span className="db-copy-btn" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(ref(f.nombre)); }} title="Copy reference">
                                        <LuClipboard size={12} />
                                    </span>
                                </div>
                                {expandida && (
                                    <div className="db-columns tree-reveal">
                                        {problema ? (
                                            <div className="fnt-problema-fila">
                                                <span>{f.error && !TEXTO_ESTADO[f.estado] ? f.error : problema}</span>
                                                <button type="button" className="fnt-enlace" onClick={() => ubicar(f)}>Set location…</button>
                                            </div>
                                        ) : cols.map((c, i) => {
                                            const meta = getTypeMeta ? getTypeMeta(c.tipo) : null;
                                            return (
                                                <div key={`${c.nombre}-${i}`} className="db-column-row" draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData('text/plain', c.nombre);
                                                        e.stopPropagation();
                                                    }}>
                                                    <div className="db-column-left">
                                                        {meta && <div className="db-column-icon" style={{ color: meta.color }}>{meta.icon}</div>}
                                                        <span className="db-column-name">{c.nombre}</span>
                                                    </div>
                                                    <div className="db-column-right">
                                                        <span className="db-column-type">{String(c.tipo).toLowerCase()}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {menu && (
                <div className="ctx-menu" style={{ top: menu.y, left: menu.x }}>
                    <div className="ctx-menu-item" onClick={() => { onSelectQuery?.(`SELECT * FROM ${ref(menu.fuente.nombre)} LIMIT 100; `); setMenu(null); }}>
                        <LuCode size={14} /> Select Top 100
                    </div>
                    <div className="ctx-menu-item" onClick={() => { navigator.clipboard.writeText(ref(menu.fuente.nombre)); setMenu(null); }}>
                        <LuClipboard size={14} /> Copy reference
                    </div>
                    <div className="ctx-menu-item" onClick={() => { const f = menu.fuente; setMenu(null); ubicar(f); }}>
                        <LuFolderOpen size={14} /> Set location on this machine…
                    </div>
                    <div className="ctx-menu-item" onClick={() => { setEditor({ fuente: menu.fuente }); setMenu(null); }}>
                        <LuPencil size={14} /> Edit…
                    </div>
                    <div className="ctx-menu-separator" />
                    <div className="ctx-menu-item danger" onClick={() => { setABorrar(menu.fuente); setMenu(null); }}>
                        <LuTrash2 size={14} /> Remove source…
                    </div>
                </div>
            )}

            {editor && (
                <EditorDeFuente
                    fuente={editor.fuente || null}
                    workspaceId={datos.workspaceId}
                    workspaceNombre={workspaceNombre}
                    enProyecto
                    onClose={() => setEditor(null)}
                />
            )}

            <DeleteConfirmModal
                isOpen={!!aBorrar}
                onClose={() => setABorrar(null)}
                onConfirm={async () => {
                    await borrarFuente(aBorrar.nombre, aBorrar.origen === 'workspace' ? datos.workspaceId : undefined);
                    setABorrar(null);
                    avisarCambio();
                }}
                itemName={aBorrar ? `${aBorrar.nombre}${aBorrar.origen === 'workspace' ? ` (from ${workspaceNombre || `the ${e.s}`}: every project loses it)` : ''}` : ''}
                itemType="Source"
            />
        </div>
    );
}
