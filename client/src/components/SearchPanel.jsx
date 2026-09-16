/**
 * SearchPanel — buscar texto dentro de los archivos del proyecto.
 *
 * Hasta ahora el explorador solo filtraba por NOMBRE, así que "¿dónde escribí
 * lo de la marca de agua?" no tenía respuesta dentro de la app.
 *
 * Busca en la FUENTE por defecto (lo que escribió una persona). Los archivos de
 * datos son opt-in y el interruptor enseña cuánto pesan antes de activarse:
 * en un proyecto real son 261 MB que tardan seis segundos en leerse para no
 * encontrar nada. Los binarios no se leen nunca.
 *
 * Lo omitido se dice en voz alta: si un archivo se salta por tamaño o por
 * ámbito, se muestra. Omitir en silencio es peor que no buscar, porque el
 * usuario concluye que su texto no existe cuando nadie lo miró.
 */
import { API_BASE } from '../api.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    LuSearch, LuLoaderCircle, LuTriangleAlert, LuChevronDown, LuChevronRight,
    LuFileText, LuDatabase, LuInfo,
} from 'react-icons/lu';
import './SearchPanel.css';

const MB = 1024 * 1024;

/** Resalta el fragmento encontrado sin meter HTML por medio. */
function Linea({ text, col, largo }) {
    if (col < 0) return <span className="sp-linea">{text}</span>;
    // El texto ya viene recortado por el servidor; se centra la coincidencia
    // para que se vea aunque esté al final de una línea larga.
    const desde = Math.max(0, col - 28);
    const visible = desde > 0 ? `…${text.slice(desde)}` : text;
    const ajuste = desde > 0 ? col - desde + 1 : col;
    return (
        <span className="sp-linea">
            {visible.slice(0, ajuste)}
            <mark>{visible.slice(ajuste, ajuste + largo)}</mark>
            {visible.slice(ajuste + largo)}
        </span>
    );
}

export default function SearchPanel({ onOpenFile, projectPath }) {
    const [query, setQuery] = useState('');
    const [scope, setScope] = useState('fuente');
    const [res, setRes] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [cerrados, setCerrados] = useState(() => new Set());
    const peticion = useRef(0);

    const buscar = useCallback(async (q, ambito) => {
        if (!q.trim()) { setRes(null); setError(null); return; }
        const mia = ++peticion.current;
        setCargando(true);
        setError(null);
        try {
            const r = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}&scope=${ambito}`);
            if (!r.ok) throw new Error(`The server answered ${r.status}`);
            const data = await r.json();
            // Una respuesta vieja no puede pisar a una nueva.
            if (mia !== peticion.current) return;
            setRes(data);
            setCerrados(new Set());
        } catch (e) {
            if (mia === peticion.current) { setError(e.message); setRes(null); }
        } finally {
            if (mia === peticion.current) setCargando(false);
        }
    }, []);

    // Con retardo: escribir "diagnóstico" no son once búsquedas.
    useEffect(() => {
        const id = setTimeout(() => buscar(query, scope), 260);
        return () => clearTimeout(id);
    }, [query, scope, buscar]);

    // Cambiar de proyecto limpia lo que había.
    useEffect(() => { setQuery(''); setRes(null); }, [projectPath]);

    const grupos = [];
    if (res?.hits?.length) {
        const porArchivo = new Map();
        for (const h of res.hits) {
            if (!porArchivo.has(h.path)) porArchivo.set(h.path, []);
            porArchivo.get(h.path).push(h);
        }
        for (const [ruta, hits] of porArchivo) grupos.push({ ruta, hits });
    }

    // `'tamaño'` es el valor que manda el servidor, no texto de interfaz: se
    // compara tal cual y se traduce sólo lo que se enseña.
    const omitidosPorTamano = res?.omitidos?.filter(o => o.motivo === 'tamaño') || [];
    const datos = res?.datos;

    return (
        <div className="sp-panel">
            <div className="sp-head">
                <LuSearch size={13} />
                <span>Buscar en el proyecto</span>
            </div>

            <div className="sp-caja">
                <input
                    className="sp-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Texto a buscar…"
                    spellCheck={false}
                    autoComplete="off"
                />
                {cargando && <LuLoaderCircle size={12} className="sp-spin" />}
            </div>

            <div className="sp-ambito">
                <button
                    className={`sp-ambito-btn${scope === 'fuente' ? ' active' : ''}`}
                    onClick={() => setScope('fuente')}
                    title="Queries, documents, notebooks, chains and charts"
                >
                    Fuente
                </button>
                <button
                    className={`sp-ambito-btn${scope === 'todo' ? ' active' : ''}`}
                    onClick={() => setScope('todo')}
                    title={datos
                        ? `Includes ${datos.n} data files (${(datos.bytes / MB).toFixed(0)} MB). It will be noticeably slower.`
                        : 'Also includes the plain-text data files'}
                >
                    <LuDatabase size={11} /> + datos
                </button>
            </div>

            {scope === 'todo' && datos?.n > 0 && (
                <div className="sp-aviso">
                    <LuTriangleAlert size={12} />
                    <span>
                        Incluyendo {datos.n} archivos de datos ({(datos.bytes / MB).toFixed(0)} MB).
                        Los binarios y lo que pase de 2 MB se siguen saltando.
                    </span>
                </div>
            )}

            {error && (
                <div className="sp-aviso error">
                    <LuTriangleAlert size={12} />
                    <span>No se pudo buscar: {error}</span>
                </div>
            )}

            {res && !error && (
                <div className="sp-resumen">
                    {res.hits.length === 0
                        ? <>Sin coincidencias en {res.archivos} archivos</>
                        : <>{res.hits.length}{res.truncado ? '+' : ''} en {grupos.length} archivos · {res.ms} ms</>}
                </div>
            )}

            {res?.truncado && (
                <div className="sp-aviso">
                    <LuInfo size={12} />
                    <span>Se muestran los primeros {res.hits.length}. Afina la búsqueda para verlos todos.</span>
                </div>
            )}

            <div className="sp-resultados">
                {grupos.map(({ ruta, hits }) => {
                    const plegado = cerrados.has(ruta);
                    return (
                        <div key={ruta} className="sp-grupo">
                            <div
                                className="sp-archivo"
                                onClick={() => setCerrados(prev => {
                                    const s = new Set(prev);
                                    if (s.has(ruta)) s.delete(ruta); else s.add(ruta);
                                    return s;
                                })}
                                title={ruta}
                            >
                                {plegado ? <LuChevronRight size={11} /> : <LuChevronDown size={11} />}
                                <LuFileText size={11} />
                                <span className="sp-archivo-nombre">{ruta.split('/').pop()}</span>
                                <span className="sp-archivo-ruta">{ruta.split('/').slice(0, -1).join('/')}</span>
                                <span className="sp-archivo-n">
                                    {res.totalPorArchivo?.[ruta] > hits.length
                                        ? `${hits.length} de ${res.totalPorArchivo[ruta]}`
                                        : hits.length}
                                </span>
                            </div>
                            {!plegado && hits.map((h, i) => (
                                <div
                                    key={`${h.line}:${i}`}
                                    className="sp-hit"
                                    onClick={() => onOpenFile?.(ruta)}
                                    title={h.donde ? `${ruta} · ${h.donde}` : `${ruta}:${h.line}`}
                                >
                                    <span className="sp-hit-pos">{h.donde || h.line || '·'}</span>
                                    <Linea text={h.text} col={h.col} largo={query.trim().length} />
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {omitidosPorTamano.length > 0 && (
                <div className="sp-omitidos">
                    {omitidosPorTamano.length} file{omitidosPorTamano.length > 1 ? 's' : ''} skipped
                    {' '}for size
                    {omitidosPorTamano.length <= 3 && (
                        <>: {omitidosPorTamano.map(o => `${o.path.split('/').pop()} (${(o.size / MB).toFixed(0)} MB)`).join(', ')}</>
                    )}
                </div>
            )}

            {scope === 'fuente' && datos?.n > 0 && res && (
                <div className="sp-omitidos">
                    {datos.n} archivos de datos ({(datos.bytes / MB).toFixed(0)} MB) no incluidos — usa «+ datos».
                </div>
            )}
        </div>
    );
}
