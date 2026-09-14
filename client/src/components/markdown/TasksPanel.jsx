/**
 * TasksPanel — los pendientes de TODO el proyecto, no solo los del documento
 * abierto.
 *
 * Diez `.md` con casillas dentro son diez archivos que había que abrir uno a
 * uno para saber qué queda. Aquí se agregan por documento, con su responsable
 * y su vencimiento, y pulsando uno se abre el archivo que lo contiene.
 *
 * Los datos salen de `GET /api/docs/index`, el mismo recorrido que servirá
 * para los retroenlaces y la búsqueda: un único escaneo del proyecto,
 * cacheado por mtime en el servidor.
 */
import { API_BASE } from '../../api.js';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LuInbox, LuRefreshCw, LuLoaderCircle, LuTriangleAlert, LuUser, LuFileText,
} from 'react-icons/lu';

const FILTERS = [
    { id: 'pendientes', label: 'Pendientes' },
    { id: 'todas', label: 'Todas' },
    { id: 'vencidas', label: 'Vencidas' },
];

/** Hoy en ISO corto y local, para comparar con `vence:` sin cruzar zonas. */
function hoyIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * `embebido` — dentro de la columna del documento es una pestana mas del
 * bloque de tareas, asi que no repite ni el titulo ni el marco: ya los pone
 * el panel que lo contiene.
 */
export default function TasksPanel({ onOpenFile, currentPath, reloadToken = 0, embebido = false }) {
    const [docs, setDocs] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('pendientes');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/docs/index`);
            if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
            setDocs(await res.json());
        } catch (e) {
            setError(e.message);
            setDocs([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Se recarga al abrir el panel y cada vez que el documento se guarda: una
    // tarea recién escrita tiene que aparecer sin pedirlo a mano.
    useEffect(() => { load(); }, [load, reloadToken]);

    const hoy = hoyIso();

    const grupos = useMemo(() => {
        if (!docs) return [];
        return docs
            .map(doc => ({
                path: doc.path,
                title: doc.title,
                tasks: doc.tasks.filter(t => {
                    if (filter === 'todas') return true;
                    if (filter === 'vencidas') return !t.done && t.due && t.due < hoy;
                    return !t.done;
                }),
                total: doc.tasks.length,
                done: doc.tasks.filter(t => t.done).length,
            }))
            .filter(doc => doc.tasks.length)
            .sort((a, b) => a.path.localeCompare(b.path));
    }, [docs, filter, hoy]);

    const cuenta = grupos.reduce((n, g) => n + g.tasks.length, 0);

    return (
        <div className={`mde-tasks${embebido ? ' mde-tasks--embebido' : ''}`}>
            {!embebido && (
                <div className="mde-tasks-head">
                    <LuInbox size={13} />
                    <span>Pendientes del proyecto</span>
                    <span className="mde-tasks-count">{loading ? '…' : cuenta}</span>
                    <button className="mde-tasks-reload" title="Volver a escanear" onClick={load} disabled={loading}>
                        {loading ? <LuLoaderCircle size={12} className="mde-spin" /> : <LuRefreshCw size={12} />}
                    </button>
                </div>
            )}

            <div className="mde-tasks-filters">
                {FILTERS.map(f => (
                    <button
                        key={f.id}
                        className={`mde-tasks-filter${filter === f.id ? ' active' : ''}`}
                        onClick={() => setFilter(f.id)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="mde-tasks-empty">
                    <LuTriangleAlert size={13} /> No se pudo leer el proyecto: {error}
                </div>
            )}

            {!error && !loading && !grupos.length && (
                <div className="mde-tasks-empty">
                    {filter === 'vencidas' ? 'Nada vencido.' : 'Ninguna casilla pendiente en el proyecto.'}
                </div>
            )}

            {grupos.map(doc => (
                <div key={doc.path} className="mde-tasks-group">
                    <div
                        className={`mde-tasks-doc${doc.path === currentPath ? ' current' : ''}`}
                        onClick={() => onOpenFile?.(doc.path)}
                        title={doc.path}
                    >
                        <LuFileText size={11} />
                        <span className="mde-tasks-doc-name">{doc.path.split('/').pop()}</span>
                        <span className="mde-tasks-doc-count">{doc.done}/{doc.total}</span>
                    </div>
                    {doc.tasks.map(task => {
                        const vencida = !task.done && task.due && task.due < hoy;
                        return (
                            <div
                                key={`${doc.path}:${task.line}`}
                                className={`mde-tasks-item${task.done ? ' done' : ''}`}
                                onClick={() => onOpenFile?.(doc.path)}
                                title={`${doc.path}:${task.line}`}
                            >
                                <span className={`mde-tasks-box${task.done ? ' on' : ''}`} />
                                <span className="mde-tasks-text">{task.text}</span>
                                {task.owner && (
                                    <span className="mde-tasks-owner"><LuUser size={9} />{task.owner}</span>
                                )}
                                {task.due && (
                                    <span className={`mde-tasks-due${vencida ? ' late' : ''}`}>{task.due.slice(5)}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
