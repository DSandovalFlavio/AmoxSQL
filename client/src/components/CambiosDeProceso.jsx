/**
 * Qué cambió en un proceso (5.14, J9; Dec-53), dicho en pasos.
 *
 * `CambiosDeProceso` es la lista; `VentanaCambiosDeProceso`, la ventana que abre
 * **What changed** en Data Flow (frente al último commit). El panel de Git usa
 * la lista dentro de su propia ventana de diff.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuGitCompareArrows, LuX, LuPlus, LuMinus, LuPencil, LuLink, LuUnlink, LuSlidersHorizontal, LuVariable, LuTriangleAlert } from 'react-icons/lu';
import { API_BASE } from '../api.js';

/** `a` → `b` con los valores entre comillas inversas como código. */
function Valor({ v }) {
    const s = String(v ?? '');
    return s.startsWith('`') ? <code>{s.slice(1, -1)}</code> : <em>{s}</em>;
}

const valor = (v) => {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '(empty)';
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    const s = (typeof v === 'string' ? v : JSON.stringify(v)).replace(/\s+/g, ' ').trim();
    return `\`${s.length > 90 ? `${s.slice(0, 87)}…` : s}\``;
};

function Campo({ c }) {
    return (
        <li className="cdp-campo">
            <span className="cdp-nombre">{c.campo}</span>
            <Valor v={valor(c.antes)} /> <span className="cdp-flecha">→</span> <Valor v={valor(c.despues)} />
        </li>
    );
}

export function CambiosDeProceso({ ruta, antes = 'HEAD', despues = 'disco' }) {
    const [d, setD] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        setD(null); setError(null);
        fetch(`${API_BASE}/api/procesos/cambios?ruta=${encodeURIComponent(ruta)}&antes=${antes}&despues=${despues}`)
            .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); })
            .catch(e => setError(e.message));
    }, [ruta, antes, despues]);

    if (error) return <p className="cdp-error"><LuTriangleAlert size={13} /> {error}</p>;
    if (!d) return <p className="cdp-nada">Reading the two versions…</p>;
    if (d.igual) return <p className="cdp-nada">{d.nuevo ? 'This process is not in any commit yet, and it is empty.' : 'Nothing changed in the process (moving steps on the canvas does not count).'}</p>;

    const { nodos, conexiones, parametros, variables, proceso } = d;
    return (
        <div className="cdp">
            {d.nuevo && <p className="cdp-nota">Not in any commit yet: everything is new.</p>}
            {d.borrado && <p className="cdp-nota">The file was deleted.</p>}
            {proceso.length > 0 && (
                <section>
                    <h4 className="cdp-h"><LuSlidersHorizontal size={12} /> Process</h4>
                    <ul className="cdp-campos">{proceso.map((c, i) => <Campo key={i} c={c} />)}</ul>
                </section>
            )}
            {(nodos.anadidos.length + nodos.quitados.length + nodos.cambiados.length) > 0 && (
                <section>
                    <h4 className="cdp-h">Steps</h4>
                    <ul className="cdp-lista">
                        {nodos.anadidos.map(n => <li key={`a${n.id}`} className="cdp-paso cdp-paso--mas"><LuPlus size={12} /> <strong>{n.etiqueta}</strong> <small>{n.tipo} · added</small></li>)}
                        {nodos.quitados.map(n => <li key={`q${n.id}`} className="cdp-paso cdp-paso--menos"><LuMinus size={12} /> <strong>{n.etiqueta}</strong> <small>{n.tipo} · removed</small></li>)}
                        {nodos.cambiados.map(n => (
                            <li key={`c${n.id}`} className="cdp-paso">
                                <LuPencil size={12} /> <strong>{n.etiqueta}</strong> <small>{n.tipo}</small>
                                <ul className="cdp-campos">{n.campos.map((c, i) => <Campo key={i} c={c} />)}</ul>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {(conexiones.anadidas.length + conexiones.quitadas.length) > 0 && (
                <section>
                    <h4 className="cdp-h">Connections</h4>
                    <ul className="cdp-lista">
                        {conexiones.anadidas.map((e, i) => <li key={`ea${i}`} className="cdp-paso cdp-paso--mas"><LuLink size={12} /> {e.de} → {e.a}</li>)}
                        {conexiones.quitadas.map((e, i) => <li key={`eq${i}`} className="cdp-paso cdp-paso--menos"><LuUnlink size={12} /> {e.de} → {e.a}</li>)}
                    </ul>
                </section>
            )}
            {(parametros.anadidos.length + parametros.quitados.length + parametros.cambiados.length + variables.anadidas.length + variables.quitadas.length + variables.cambiadas.length) > 0 && (
                <section>
                    <h4 className="cdp-h"><LuVariable size={12} /> Parameters and variables</h4>
                    <ul className="cdp-lista">
                        {parametros.anadidos.map(p => <li key={`pa${p}`} className="cdp-paso cdp-paso--mas"><LuPlus size={12} /> parameter <code>{p}</code></li>)}
                        {parametros.quitados.map(p => <li key={`pq${p}`} className="cdp-paso cdp-paso--menos"><LuMinus size={12} /> parameter <code>{p}</code></li>)}
                        {parametros.cambiados.map(p => <li key={`pc${p.nombre}`} className="cdp-paso"><LuPencil size={12} /> parameter <code>{p.nombre}</code><ul className="cdp-campos">{p.campos.map((c, i) => <Campo key={i} c={c} />)}</ul></li>)}
                        {variables.anadidas.map(v => <li key={`va${v.nombre}`} className="cdp-paso cdp-paso--mas"><LuPlus size={12} /> <code>{v.nombre}</code> = <Valor v={valor(v.valor)} /></li>)}
                        {variables.quitadas.map(v => <li key={`vq${v.nombre}`} className="cdp-paso cdp-paso--menos"><LuMinus size={12} /> <code>{v.nombre}</code></li>)}
                        {variables.cambiadas.map(v => <li key={`vc${v.nombre}`} className="cdp-paso"><LuPencil size={12} /> <code>{v.nombre}</code>: <Valor v={valor(v.antes)} /> <span className="cdp-flecha">→</span> <Valor v={valor(v.despues)} /></li>)}
                    </ul>
                </section>
            )}
        </div>
    );
}

export default function VentanaCambiosDeProceso({ ruta, onClose }) {
    return createPortal((
        <div className="ww-backdrop" onClick={onClose}>
            <div className="ww-card cdp-card" role="dialog" aria-modal="true" aria-labelledby="cdp-titulo" onClick={e => e.stopPropagation()}>
                <div className="ww-header">
                    <div className="ww-header-icon"><LuGitCompareArrows size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="cdp-titulo">What changed</h2>
                        <p className="ww-subtitle">This process as it is now, against its last commit.</p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={onClose} title="Close"><LuX size={16} /></button>
                </div>
                <div className="wsx-cuerpo cdp-cuerpo"><CambiosDeProceso ruta={ruta} /></div>
                <div className="ww-actions wsx-actions">
                    <span style={{ marginLeft: 'auto' }} />
                    <button className="ww-btn-create" type="button" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    ), document.body);
}
