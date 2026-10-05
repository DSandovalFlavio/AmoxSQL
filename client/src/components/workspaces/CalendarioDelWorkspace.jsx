/**
 * CalendarioDelWorkspace — the group's working days and holidays (5.11, D1).
 * "The first business day of the month" is computed with it. It travels with
 * the workspace (calendario.json) like the rest of its context.
 */
import { useEffect, useState } from 'react';
import { LuCalendarDays, LuPlus, LuX } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

const DIAS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];

export default function CalendarioDelWorkspace({ workspace, avisar }) {
    const [cal, setCal] = useState(null);
    const [nuevo, setNuevo] = useState('');

    useEffect(() => {
        fetch(`${API_BASE}/api/calendario?workspaceId=${encodeURIComponent(workspace.id)}`)
            .then(r => r.json()).then(d => setCal(d.calendario || null)).catch(() => setCal(null));
    }, [workspace.id]);

    const guardar = async (c) => {
        setCal(c);
        try {
            const r = await fetch(`${API_BASE}/api/calendario`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId: workspace.id, calendario: { laborables: c.laborables, festivos: c.festivos } }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setCal(d.calendario);
        } catch (e) { avisar?.(e.message); }
    };

    if (!cal) return null;
    const toggle = (n) => guardar({ ...cal, laborables: cal.laborables.includes(n) ? cal.laborables.filter(x => x !== n) : [...cal.laborables, n].sort() });
    const anadir = () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevo) || cal.festivos.includes(nuevo)) return;
        guardar({ ...cal, festivos: [...cal.festivos, nuevo].sort() });
        setNuevo('');
    };
    const proximos = cal.festivos.filter(f => f >= new Date().toISOString().slice(0, 10));
    const pasados = cal.festivos.length - proximos.length;

    return (
        <>
            <div className="wsv-etq fnt-etq"><LuCalendarDays size={12} />Working days and holidays</div>
            <div className="wsv-caja cdw">
                <p className="cdw-intro">Schedules like «the first business day of the month» skip the days off and the holidays of {workspace.nombre}.</p>
                <div className="cdw-fila">
                    <span className="cdw-etq">Working days</span>
                    <div className="cpg-dias" role="group" aria-label="Working days">
                        {DIAS.map(([n, t]) => <button key={n} type="button" aria-pressed={cal.laborables.includes(n)} className={cal.laborables.includes(n) ? 'activo' : ''} onClick={() => toggle(n)}>{t}</button>)}
                    </div>
                </div>
                <div className="cdw-fila cdw-fila--arriba">
                    <span className="cdw-etq">Holidays</span>
                    <div className="cdw-festivos">
                        {proximos.length === 0 && <span className="cdw-vacio">None ahead.</span>}
                        {proximos.map(f => (
                            <span key={f} className="cdw-festivo">
                                {new Date(`${f}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                <button type="button" aria-label={`Remove ${f}`} onClick={() => guardar({ ...cal, festivos: cal.festivos.filter(x => x !== f) })}><LuX size={11} /></button>
                            </span>
                        ))}
                        <span className="cdw-anadir">
                            <input type="date" className="cvp-input" value={nuevo} onChange={e => setNuevo(e.target.value)} aria-label="New holiday" />
                            <button type="button" className="wsv-btn" disabled={!nuevo} onClick={anadir}><LuPlus size={13} />Add</button>
                        </span>
                        {pasados > 0 && <small className="cdw-vacio">{pasados} past holiday{pasados === 1 ? '' : 's'} kept.</small>}
                    </div>
                </div>
            </div>
        </>
    );
}
