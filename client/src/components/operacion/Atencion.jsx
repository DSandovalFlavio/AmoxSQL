/**
 * «Needs attention» (5.13, Dec-45): lo que falló, o terminó con un aviso, sin
 * nadie delante (programado, línea de comandos, lote) y que nadie ha mirado.
 *
 * Va en la bienvenida (de todos los workspaces) y en la ficha de cada workspace
 * (las suyas). Si no hay nada, no se pinta: la bienvenida queda como estaba.
 * Cada fila dice la razón en una línea, con Open (la ficha, que la da por vista),
 * Run again y Dismiss.
 */
import { useCallback, useEffect, useState } from 'react';
import { LuCircleAlert, LuTriangleAlert, LuRotateCcw, LuX, LuArrowRight } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, { method: metodo, headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
}

/** Cuánto hace, en palabras cortas. */
function haceCuanto(iso) {
    if (!iso) return '';
    // `inicio` y `fin` de una ejecución son hora local, como en Operations.
    const fecha = new Date(String(iso).replace(' ', 'T'));
    const min = Math.round((Date.now() - fecha.getTime()) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h ago`;
    return fecha.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const ORIGEN = { programada: 'Scheduled', linea_de_comandos: 'Command line', lote: 'Run for each' };

/** Avisa a quien enseñe «Needs attention» (y al botón de Operations) de que cambió. */
export const avisarAtencion = () => window.dispatchEvent(new CustomEvent('amox_atencion_cambio'));

/** Dar por vistas unas ejecuciones (al abrir su ficha, o «Dismiss»). */
export const marcarVistas = (ids) => pedir('POST', '/api/operacion/atencion/vista', { ids }).then(avisarAtencion).catch(() => {});

export default function Atencion({ workspaceId = null, mostrarGrupo = true, className = '' }) {
    const [lista, setLista] = useState([]);
    const [repitiendo, setRepitiendo] = useState(null);

    const cargar = useCallback(() => {
        pedir('GET', `/api/operacion/atencion${workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : ''}`)
            .then(d => setLista(d.atencion || []))
            .catch(() => setLista([]));
    }, [workspaceId]);

    useEffect(() => {
        cargar();
        const t = setInterval(cargar, 60000);
        window.addEventListener('amox_atencion_cambio', cargar);
        window.addEventListener('focus', cargar);
        return () => { clearInterval(t); window.removeEventListener('amox_atencion_cambio', cargar); window.removeEventListener('focus', cargar); };
    }, [cargar]);

    if (!lista.length) return null;

    const abrir = (x) => {
        window.dispatchEvent(new CustomEvent('amox_abrir_ejecucion', { detail: { runId: x.id } }));
        marcarVistas([x.id]);
    };
    const repetir = async (x) => {
        setRepitiendo(x.id);
        try {
            const r = await pedir('POST', `/api/ejecuciones/${encodeURIComponent(x.id)}/repetir`);
            if (r?.runId) window.dispatchEvent(new CustomEvent('amox_abrir_ejecucion', { detail: { runId: r.runId } }));
        } catch { /* la ficha lo dirá si se abre */ }
        finally { setRepitiendo(null); cargar(); avisarAtencion(); }
    };

    return (
        <section className={`atn ${className}`} aria-label="Needs attention">
            <header className="atn-cab">
                <LuCircleAlert size={14} />
                <span>Needs attention</span>
                <span className="atn-cuenta">{lista.length}</span>
                {lista.length > 1 && (
                    <button type="button" className="atn-todas" onClick={() => marcarVistas(lista.map(x => x.id)).then(cargar)}>Dismiss all</button>
                )}
            </header>
            <ul className="atn-lista">
                {lista.slice(0, 8).map(x => (
                    <li key={x.id} className={`atn-fila atn-fila--${x.estado}`}>
                        <span className="atn-icono" title={x.estado === 'fallo' ? 'Failed' : 'Finished with a warning'}>
                            {x.estado === 'fallo' ? <LuCircleAlert size={14} /> : <LuTriangleAlert size={14} />}
                        </span>
                        <div className="atn-texto">
                            <div className="atn-linea1">
                                <strong>{x.nombre}</strong>
                                <span className="atn-meta">
                                    {[mostrarGrupo && x.workspaceNombre, x.proyectoNombre, ORIGEN[x.origen] || null, haceCuanto(x.cuando)].filter(Boolean).join(' · ')}
                                </span>
                            </div>
                            <div className="atn-razon" title={x.razon}>{x.razon}</div>
                        </div>
                        <div className="atn-acciones">
                            <button type="button" className="atn-btn" onClick={() => abrir(x)} title="What happened, step by step">
                                Open <LuArrowRight size={12} />
                            </button>
                            <button type="button" className="atn-btn" onClick={() => repetir(x)} disabled={repitiendo === x.id} title="Run it again with the same values">
                                <LuRotateCcw size={12} /> {repitiendo === x.id ? 'Running…' : 'Run again'}
                            </button>
                            <button type="button" className="atn-quitar" onClick={() => marcarVistas([x.id]).then(cargar)} title="Dismiss: I have seen it">
                                <LuX size={13} />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
            {lista.length > 8 && (
                <button type="button" className="atn-mas" onClick={() => window.dispatchEvent(new CustomEvent('amox_abrir_operacion'))}>
                    {lista.length - 8} more in Operations
                </button>
            )}
        </section>
    );
}
