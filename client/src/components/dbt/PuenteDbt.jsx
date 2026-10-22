import { useCallback, useEffect, useState } from 'react';
import { LuLoader, LuCircleAlert, LuCheck, LuArrowUpFromLine, LuX } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

const API = `${API_BASE}/api`;

/**
 * Las fuentes con nombre de AmoxSQL en dbt (5.12, fase 6; I7, Dec-31). Una tarjeta en
 * DBT Studio → Sources: marcar cuáles van a `models/sources/amoxsql.yml` y guardar.
 * Su ubicación en esta máquina no se escribe: AmoxSQL la pasa al correr dbt.
 */
export function FuentesEnDbt({ showToast = () => {} }) {
    const [e, setE] = useState(null);
    const [marcadas, setMarcadas] = useState(new Set());
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch(`${API}/dbt/fuentes`).then(x => x.json());
            setE(r);
            setMarcadas(new Set((r.fuentes || []).filter(f => f.enDbt).map(f => f.nombre)));
        } catch { setE(null); }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);

    if (!e) return null;
    const cambiado = (e.fuentes || []).some(f => f.enDbt !== marcadas.has(f.nombre));
    const guardar = async () => {
        setGuardando(true);
        try {
            const r = await fetch(`${API}/dbt/fuentes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombres: [...marcadas] }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setE(d);
            showToast(`Saved in ${d.archivo}`);
            window.dispatchEvent(new Event('amox_dbt_cambio'));
        } catch (x) { showToast(x.message, 'error'); }
        setGuardando(false);
    };

    return (
        <div className="dbt-card">
            <div className="dbt-card-header"><span>AmoxSQL sources in dbt</span></div>
            {!e.fuentes?.length ? (
                <p className="dbt-subtle-text">This project has no named sources. Create them in the database explorer (Sources), and they can be used here as {"{{ source('amoxsql', '…') }}"}.</p>
            ) : (
                <>
                    <p className="dbt-subtle-text">
                        Each one becomes {"{{ source('amoxsql', 'name') }}"}, read exactly as AmoxSQL reads it. Its location on this computer is not written in the file: AmoxSQL passes it when it runs dbt.
                    </p>
                    <ul className="dbt-puente-lista">
                        {e.fuentes.map(f => (
                            <li key={f.nombre} title={f.motivo || f.descripcion || ''}>
                                <label className={f.usable ? '' : 'dbt-puente-no'}>
                                    <input type="checkbox" disabled={!f.usable} checked={marcadas.has(f.nombre)}
                                        onChange={ev => setMarcadas(prev => { const n = new Set(prev); if (ev.target.checked) n.add(f.nombre); else n.delete(f.nombre); return n; })} />
                                    <span>{f.nombre}</span>
                                    <code>{`source('amoxsql', '${f.nombreEnDbt}')`}</code>
                                </label>
                                {!f.usable && <em>{f.motivo}</em>}
                            </li>
                        ))}
                    </ul>
                    <button className="dbt-btn dbt-btn--primary" disabled={!cambiado || guardando} onClick={guardar}>
                        {guardando ? <LuLoader size={13} className="dbt-spin" /> : <LuCheck size={13} />} Save to {e.archivo}
                    </button>
                </>
            )}
        </div>
    );
}

/**
 * «Promote to dbt model» (5.12, fase 6; I6, Dec-32): una consulta suelta se convierte en
 * `models/<capa>/<nombre>.sql` con sus ref() y source(). La consulta original no cambia.
 */
export function PromoverAModelo({ sql, origen, onOpenFile, onCerrar }) {
    const [nombre, setNombre] = useState(() => String(origen || '').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase());
    const [capa, setCapa] = useState('marts');
    const [ocupado, setOcupado] = useState(false);
    const [r, setR] = useState(null);
    const [error, setError] = useState(null);
    const promover = async () => {
        setOcupado(true); setError(null);
        try {
            const res = await fetch(`${API}/dbt/promover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, nombre, capa, origen }) });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            setR(d);
            window.dispatchEvent(new Event('amox_dbt_cambio'));
            onOpenFile?.(d.archivo);
        } catch (x) { setError(x.message); }
        setOcupado(false);
    };
    return (
        <div className="dbt-modelo-aviso dbt-promover">
            <LuArrowUpFromLine size={13} />
            {!r ? (
                <>
                    <span>Promote to a dbt model:</span>
                    <select value={capa} onChange={e => setCapa(e.target.value)} aria-label="Layer">
                        <option value="staging">staging</option>
                        <option value="intermediate">intermediate</option>
                        <option value="marts">marts</option>
                    </select>
                    <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="model_name" aria-label="Model name" />
                    <button type="button" className="dbt-modelo-btn" disabled={ocupado || !nombre.trim()} onClick={promover}>
                        {ocupado ? <LuLoader size={12} className="dbt-spin" /> : null} Create model
                    </button>
                </>
            ) : (
                <span>
                    {`${r.archivo} created${r.cambios.length ? ` · ${r.cambios.length} table${r.cambios.length === 1 ? '' : 's'} as ref()/source()` : ''}`}
                    {r.fuentesNuevas.length ? ` · added to dbt: ${r.fuentesNuevas.join(', ')}` : ''}
                    {r.dudas.length ? ` · check: ${r.dudas.join(', ')}` : ''}
                </span>
            )}
            {error && <span className="dbt-promover-error"><LuCircleAlert size={12} /> {error}</span>}
            <button type="button" className="dbt-modelo-btn" onClick={onCerrar} title="Close"><LuX size={12} /></button>
        </div>
    );
}
