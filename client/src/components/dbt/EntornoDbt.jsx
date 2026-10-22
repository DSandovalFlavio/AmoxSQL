import { useEffect, useState, useCallback } from 'react';
import { LuLoader, LuCircleAlert, LuCheck, LuDownload, LuX } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

const API = `${API_BASE}/api`;

/**
 * El entorno de dbt del proyecto (5.12, fase 1; Dec-27 y Dec-36).
 *
 * Lo elegido se guarda en el proyecto (`project.json → dbt.entorno`), no en el
 * navegador: así lo usan también una programación y la línea de comandos. Ofrece el
 * entorno de AmoxSQL —con el mismo motor que la aplicación— y «Set up dbt…» para
 * crearlo; los entornos conda que haya y el dbt del sistema siguen ahí.
 *
 * `valor`: 'amoxsql' · 'none' (el del sistema) · el nombre de un entorno conda.
 */
const EntornoDbt = ({ condaEnvs = [], condaPath = null, valor, onCambio, compacto = false, showToast = () => {} }) => {
    const [propio, setPropio] = useState(null);          // { existe, versiones, carpeta }
    const [montando, setMontando] = useState(false);     // «Set up dbt…» abierto
    const [pythons, setPythons] = useState(null);
    const [python, setPython] = useState('');
    const [progreso, setProgreso] = useState([]);
    const [creando, setCreando] = useState(false);
    const [error, setError] = useState(null);
    const [carpetaPython, setCarpetaPython] = useState(null);   // un entorno de Python por su carpeta

    const valorDe = (e) => (!e ? null : e.tipo === 'amoxsql' ? 'amoxsql' : e.tipo === 'conda' ? e.nombre : e.tipo === 'python' ? `python:${e.ruta}` : 'none');

    const cargar = useCallback(async () => {
        try {
            const r = await fetch(`${API}/dbt/proyecto`).then(x => x.json());
            setPropio(r.entornoPropio || null);
            if (r.dbt?.entorno?.tipo === 'python') setCarpetaPython(r.dbt.entorno.ruta);
            const v = valorDe(r.dbt?.entorno);
            if (v && v !== valor) onCambio?.(v, false);
        } catch { /* sin servidor: se queda como está */ }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { cargar(); }, [cargar]);

    const guardar = async (v) => {
        onCambio?.(v, true);
        const env = condaEnvs.find(e => e.name === v);
        const entorno = v === 'amoxsql' ? { tipo: 'amoxsql' }
            : v === 'none' ? { tipo: 'sistema' }
            : v.startsWith('python:') ? { tipo: 'python', ruta: v.slice(7) }
                : { tipo: 'conda', nombre: v, ...(env?.path ? { ruta: env.path } : {}), ...(condaPath && condaPath !== 'conda' ? { conda: condaPath } : {}) };
        try {
            const r = await fetch(`${API}/dbt/proyecto`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entorno }) });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The environment could not be saved.');
            showToast('dbt environment saved for this project');
        } catch (e) { showToast(e.message, 'error'); }
    };

    const abrirMontar = async () => {
        setMontando(true); setError(null); setProgreso([]);
        try {
            const r = await fetch(`${API}/dbt/entorno-propio`).then(x => x.json());
            setPythons(r.pythons || []);
            const bueno = (r.pythons || []).find(p => p.admitida);
            setPython(bueno?.ruta || '');
        } catch (e) { setError(e.message); }
    };

    const crear = async () => {
        if (!python || creando) return;
        setCreando(true); setError(null); setProgreso([]);
        try {
            const res = await fetch(`${API}/dbt/entorno-propio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ python }) });
            const lector = res.body.getReader();
            const dec = new TextDecoder();
            let buf = '', listo = false;
            for (;;) {
                const { done, value } = await lector.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const partes = buf.split('\n\n'); buf = partes.pop() || '';
                for (const p of partes) {
                    if (!p.startsWith('data: ')) continue;
                    const d = JSON.parse(p.slice(6));
                    if (d.type === 'progreso') setProgreso(prev => [...prev.slice(-6), d.texto]);
                    if (d.type === 'error') setError(d.text);
                    if (d.type === 'listo') listo = true;
                }
            }
            if (listo) {
                await cargar();
                await guardar('amoxsql');
                setMontando(false);
            }
        } catch (e) { setError(e.message); }
        setCreando(false);
    };

    const motor = propio?.versiones?.duckdb;
    return (
        <div className="dbt-form-field">
            <label style={{ margin: 0 }}>dbt environment{compacto ? '' : ' for this project'}</label>
            <select value={valor} onChange={e => guardar(e.target.value)} disabled={creando}>
                <option value="amoxsql">
                    {`AmoxSQL's dbt${motor ? ` (DuckDB ${motor})` : ''}${propio && !propio.existe ? ' — not set up' : ''}`}
                </option>
                {condaEnvs.map(env => (
                    <option key={env.name} value={env.name}>{`conda: ${env.name}${env.hasDbt ? ' — has dbt' : ''}`}</option>
                ))}
                {carpetaPython && <option value={`python:${carpetaPython}`}>{`Python environment: ${carpetaPython}`}</option>}
                <option value="none">dbt on the system PATH</option>
            </select>

            {!compacto && valor === 'amoxsql' && propio && !propio.existe && !montando && (
                <div className="dbt-hint">
                    <LuCircleAlert size={12} />
                    <span>
                        AmoxSQL can set up its own dbt, with the same engine as the app, so the databases and lakes dbt writes always open here.{' '}
                        <button className="dbt-btn dbt-btn--primary" style={{ marginTop: 6 }} onClick={abrirMontar}><LuDownload size={12} /> Set up dbt…</button>
                    </span>
                </div>
            )}
            {!compacto && valor === 'amoxsql' && propio?.existe && (
                <span className="dbt-subtle-text"><LuCheck size={11} /> {`dbt ${propio.versiones?.['dbt-core'] || ''} with DuckDB ${motor || ''}, ready`}</span>
            )}

            {montando && (
                <div className="dbt-card" style={{ marginTop: 6 }}>
                    <div className="dbt-card-header">
                        <span>Set up dbt</span>
                        {!creando && <button className="dbt-icon-btn" onClick={() => setMontando(false)} title="Close"><LuX size={13} /></button>}
                    </div>
                    <span className="dbt-subtle-text">
                        {`AmoxSQL downloads dbt ${propio?.versiones?.['dbt-core'] || ''}, its DuckDB adapter and DuckDB ${motor || ''} once, from the internet, into its own folder. Your other Python environments are not touched.`}
                    </span>
                    {pythons === null ? (
                        <div className="dbt-loading"><LuLoader size={12} className="dbt-spin" /> Looking for Python…</div>
                    ) : pythons.length === 0 ? (
                        <div className="dbt-hint"><LuCircleAlert size={12} /><span>No Python was found on this computer. Install Python 3.10 to 3.13 and try again.</span></div>
                    ) : (
                        <>
                            <div className="dbt-form-field">
                                <label>Python</label>
                                <select value={python} onChange={e => setPython(e.target.value)} disabled={creando}>
                                    {pythons.map(p => (
                                        <option key={p.ruta} value={p.ruta} disabled={!p.admitida}>{`Python ${p.version} — ${p.ruta}${p.admitida ? '' : ' (not supported by dbt)'}`}</option>
                                    ))}
                                </select>
                            </div>
                            {!pythons.some(p => p.admitida) && (
                                <div className="dbt-hint"><LuCircleAlert size={12} /><span>{pythons[0]?.motivo || 'No supported Python was found.'} Install Python 3.13 and try again.</span></div>
                            )}
                            <button className="dbt-btn dbt-btn--primary" onClick={crear} disabled={creando || !python}>
                                {creando ? <><LuLoader size={12} className="dbt-spin" /> Setting up…</> : <><LuDownload size={12} /> Set up</>}
                            </button>
                        </>
                    )}
                    {progreso.length > 0 && (
                        <div className="dbt-output" style={{ maxHeight: 120 }}>
                            {progreso.map((l, i) => <div key={i} className="dbt-output-line">{l}</div>)}
                        </div>
                    )}
                    {error && <div className="dbt-hint"><LuCircleAlert size={12} /><span>{error}</span></div>}
                </div>
            )}
        </div>
    );
};

export default EntornoDbt;
