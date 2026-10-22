import { useCallback, useEffect, useState } from 'react';
import { LuPlus, LuShieldAlert, LuLoader } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

const API = `${API_BASE}/api`;

/**
 * El target de dbt con el que se trabaja (5.12, fase 2; I4, Dec-29).
 *
 * Un proyecto nuevo empieza con `prod`, marcado como producción; `dev` existe sólo
 * si el ingeniero lo crea («Create a dev target»). Con producción activa, la barra lo
 * dice en rojo. Lo elegido se guarda en el proyecto: también lo usan una programación
 * y la línea de comandos.
 */
const BarraTarget = ({ onCambio, showToast = () => {}, recargar = 0 }) => {
    const [t, setT] = useState(null);
    const [creando, setCreando] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch(`${API}/dbt/targets`).then(x => x.json());
            setT(r);
            if (r?.existe) onCambio?.(r.activo || '', r);
        } catch { setT(null); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { cargar(); }, [cargar, recargar]);

    const guardar = async (cambios) => {
        const r = await fetch(`${API}/dbt/proyecto`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios) });
        if (!r.ok) { showToast((await r.json().catch(() => ({}))).error || 'Could not save', 'error'); return; }
        await cargar();
    };

    const crearDev = async () => {
        setCreando(true);
        try {
            const r = await fetch(`${API}/dbt/targets/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            showToast(`Target «dev» created${d.creado?.path ? `: ${d.creado.path}` : ''}`);
            await cargar();
        } catch (e) { showToast(e.message, 'error'); }
        setCreando(false);
    };

    if (!t?.existe || !t.targets?.length) return null;
    const enProduccion = !!t.produccion?.includes(t.activo);
    const soloUno = t.targets.length === 1;
    return (
        <div className={`dbt-target-bar ${enProduccion ? 'dbt-target-bar--prod' : ''}`}>
            <label>Target</label>
            <select value={t.activo || ''} onChange={e => guardar({ target: e.target.value })} aria-label="dbt target">
                {t.targets.map(x => <option key={x.nombre} value={x.nombre}>{x.nombre}{x.nombre === t.porDefecto ? ' (default)' : ''}</option>)}
            </select>
            {enProduccion && (
                <span className="dbt-target-prod" title={soloUno ? 'This is the only target: commands write to production.' : 'Commands that write ask you to type the target name first.'}>
                    <LuShieldAlert size={12} /> PRODUCTION
                </span>
            )}
            {soloUno && (
                <button className="dbt-btn dbt-btn--ghost" onClick={crearDev} disabled={creando} title="Add a dev target with its own database, to try changes before production">
                    {creando ? <LuLoader size={12} className="dbt-spin" /> : <LuPlus size={12} />} Create a dev target
                </button>
            )}
            {t.produccion === null && (
                <span className="dbt-target-pregunta">
                    Which target is production?{' '}
                    {(t.propuesta.length ? t.propuesta : [t.activo]).map(n => (
                        <button key={n} className="dbt-btn dbt-btn--ghost" onClick={() => guardar({ produccion: [n] })}>Mark «{n}»</button>
                    ))}
                    <button className="dbt-btn dbt-btn--ghost" onClick={() => guardar({ produccion: [] })}>None</button>
                </span>
            )}
        </div>
    );
};

export default BarraTarget;
