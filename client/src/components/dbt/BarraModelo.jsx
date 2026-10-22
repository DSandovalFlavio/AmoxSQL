import { useCallback, useEffect, useRef, useState } from 'react';
import { LuCode, LuEye, LuPlay, LuChevronsRight, LuChevronsLeft, LuFlaskConical, LuLoader, LuCircleAlert, LuCheck, LuX, LuTriangleAlert, LuCopy } from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { PromoverAModelo } from './PuenteDbt';

const API = `${API_BASE}/api`;

/**
 * La barra de un modelo de dbt, encima del editor (5.12, fase 3; I2, Dec-28).
 *
 *   Compiled          el SQL que dbt genera, debajo de la barra, de sólo lectura
 *   Preview           el compilado corre en AmoxSQL (sin lanzar dbt si no cambió)
 *   Run · +upstream · +downstream · Test   dbt con este modelo, con su resumen
 *
 * Escribir en producción pide confirmar como en DBT Studio (Dec-29).
 */
const BarraModelo = ({ archivo, onRunSql, version = 0, contenido = '', onOpenFile }) => {
    const [info, setInfo] = useState(null);
    const [suelto, setSuelto] = useState(false);       // 5.12 (I6): un .sql suelto en un proyecto dbt
    const [promoviendo, setPromoviendo] = useState(false);
    const [verCompilado, setVerCompilado] = useState(false);
    const [ocupado, setOcupado] = useState(null);       // 'compilar' | 'preview' | 'run'…
    const [error, setError] = useState(null);
    const [resumen, setResumen] = useState(null);
    const [confirmar, setConfirmar] = useState(null);   // { target, comando }
    const [texto, setTexto] = useState('');
    const corte = useRef(null);

    const cargar = useCallback(async () => {
        if (!archivo || !/\.sql$/i.test(archivo)) { setInfo(null); return; }
        try {
            const r = await fetch(`${API}/dbt/modelo?archivo=${encodeURIComponent(archivo)}`).then(x => x.json());
            setInfo(r?.esDbt && r.tipo === 'modelo' ? r : null);
            setSuelto(!!(r && !r.esDbt && r.proyectoDbt));
        } catch { setInfo(null); }
    }, [archivo]);

    useEffect(() => { cargar(); setResumen(null); setError(null); setVerCompilado(false); }, [cargar]);
    // Al guardar el archivo, el compilado deja de estar al día.
    useEffect(() => { if (version) cargar(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!info && suelto) {
        return (
            <div className="dbt-modelo">
                {promoviendo ? (
                    <PromoverAModelo sql={contenido} origen={String(archivo || '').split(/[\\/]/).pop()} onOpenFile={onOpenFile} onCerrar={() => setPromoviendo(false)} />
                ) : (
                    <div className="dbt-modelo-barra">
                        <span className="dbt-modelo-nombre">dbt project</span>
                        <button type="button" className="dbt-modelo-btn" onClick={() => setPromoviendo(true)} title="Turn this query into a dbt model, with its ref() and source()">Promote to dbt model</button>
                    </div>
                )}
            </div>
        );
    }
    if (!info) return null;

    const pedir = async (ruta, cuerpo) => {
        const r = await fetch(`${API}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        return d;
    };

    const compilado = async () => {
        if (verCompilado) { setVerCompilado(false); return; }
        setOcupado('compilar'); setError(null);
        try {
            const d = await pedir('/dbt/modelo/compilar', { archivo });
            setInfo(i => ({ ...i, ...d }));
            setVerCompilado(true);
            window.dispatchEvent(new Event('amox_dbt_cambio'));
        } catch (e) { setError(e.message); }
        setOcupado(null);
    };

    const vistaPrevia = async () => {
        setOcupado('preview'); setError(null);
        try {
            const d = await pedir('/dbt/modelo/vista-previa', { archivo });
            setInfo(i => ({ ...i, compilado: d.compilado, fresco: true }));
            await onRunSql?.(d.sql);
        } catch (e) { setError(e.message); }
        setOcupado(null);
    };

    const correr = async (comando, confirmarProduccion = null) => {
        setOcupado(comando); setError(null); setResumen(null); setConfirmar(null);
        const c = new AbortController();
        corte.current = c;
        try {
            const res = await fetch(`${API}/dbt/execute`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: c.signal,
                body: JSON.stringify({ command: comando, ...(confirmarProduccion ? { confirmarProduccion } : {}) }),
            });
            if (!res.ok && !String(res.headers.get('content-type') || '').includes('event-stream')) {
                const d = await res.json().catch(() => ({}));
                if (res.status === 409 && d.necesitaConfirmar) { setConfirmar({ target: d.target, comando, motivo: d.motivo }); setTexto(''); setOcupado(null); return; }
                throw new Error(d.error || `dbt could not start (${res.status})`);
            }
            const lector = res.body.getReader();
            const dec = new TextDecoder();
            let buf = '';
            for (;;) {
                const { done, value } = await lector.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const partes = buf.split('\n\n'); buf = partes.pop() || '';
                for (const p of partes) {
                    if (!p.startsWith('data: ')) continue;
                    const d = JSON.parse(p.slice(6));
                    if (d.type === 'resumen') setResumen(d.resumen);
                }
            }
            cargar();
            window.dispatchEvent(new Event('amox_dbt_cambio'));
        } catch (e) {
            if (e.name !== 'AbortError') setError(e.message);
        }
        corte.current = null;
        setOcupado(null);
    };

    const n = info.nombre;
    const boton = (clave, icono, etiqueta, accion, titulo) => (
        <button type="button" className="dbt-modelo-btn" onClick={accion} disabled={!!ocupado} title={titulo}>
            {ocupado === clave ? <LuLoader size={12} className="dbt-spin" /> : icono}<span>{etiqueta}</span>
        </button>
    );

    return (
        <div className="dbt-modelo">
            <div className="dbt-modelo-barra">
                <span className="dbt-modelo-nombre" title={info.descripcion || info.relacion || ''}>
                    dbt · <b>{n}</b>{info.materializado ? <span className="dbt-modelo-mat">{info.materializado}</span> : null}
                </span>
                {boton('compilar', <LuCode size={12} />, verCompilado ? 'Hide compiled' : 'Compiled', compilado, 'The SQL dbt generates for this model')}
                {boton('preview', <LuEye size={12} />, 'Preview', vistaPrevia, 'Runs the compiled SQL here, without building the model')}
                <span className="dbt-modelo-sep" />
                {boton(`dbt run --select ${n}`, <LuPlay size={12} />, 'Run', () => correr(`dbt run --select ${n}`), `dbt run --select ${n}`)}
                {boton(`dbt build --select +${n}`, <LuChevronsLeft size={12} />, '+Upstream', () => correr(`dbt build --select +${n}`), `This model and everything it depends on, seeds included: dbt build --select +${n}`)}
                {boton(`dbt run --select ${n}+`, <LuChevronsRight size={12} />, '+Downstream', () => correr(`dbt run --select ${n}+`), `This model and what depends on it: dbt run --select ${n}+`)}
                {boton(`dbt test --select ${n}`, <LuFlaskConical size={12} />, 'Test', () => correr(`dbt test --select ${n}`), `dbt test --select ${n}`)}
                {ocupado && ocupado.startsWith('dbt ') && (
                    <button type="button" className="dbt-modelo-btn" onClick={() => corte.current?.abort()} title="Stop dbt"><LuX size={12} /><span>Stop</span></button>
                )}
            </div>

            {confirmar && (
                <div className="dbt-modelo-aviso dbt-modelo-aviso--prod">
                    <LuTriangleAlert size={13} />
                    <span>{confirmar.motivo} Type <b>{confirmar.target}</b>:</span>
                    <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={confirmar.target} autoFocus aria-label="Target name"
                        onKeyDown={e => { if (e.key === 'Enter' && texto === confirmar.target) correr(confirmar.comando, confirmar.target); }} />
                    <button type="button" className="dbt-modelo-btn" disabled={texto !== confirmar.target} onClick={() => correr(confirmar.comando, confirmar.target)}>Run in {confirmar.target}</button>
                    <button type="button" className="dbt-modelo-btn" onClick={() => setConfirmar(null)}>Cancel</button>
                </div>
            )}
            {error && <div className="dbt-modelo-aviso dbt-modelo-aviso--error"><LuCircleAlert size={13} /><pre>{error}</pre><button type="button" className="dbt-modelo-btn" onClick={() => setError(null)}><LuX size={12} /></button></div>}
            {resumen && (
                <div className={`dbt-modelo-aviso dbt-modelo-aviso--${resumen.estado}`}>
                    {resumen.estado === 'ok' ? <LuCheck size={13} /> : <LuCircleAlert size={13} />}
                    <span>{resumen.linea}{resumen.fallidos?.length ? ` — ${resumen.fallidos.slice(0, 3).map(f => f.nombre).join(', ')}` : ''}</span>
                    {resumen.runId && <button type="button" className="dbt-modelo-btn" onClick={() => window.dispatchEvent(new CustomEvent('amox_abrir_ejecucion', { detail: { runId: resumen.runId } }))}>Details</button>}
                    <button type="button" className="dbt-modelo-btn" onClick={() => setResumen(null)}><LuX size={12} /></button>
                </div>
            )}
            {verCompilado && info.compilado && (
                <div className="dbt-modelo-compilado">
                    <div className="dbt-modelo-compilado-cab">
                        <span>Compiled SQL{info.relacion ? ` · ${info.relacion}` : ''}</span>
                        <button type="button" className="dbt-modelo-btn" onClick={() => navigator.clipboard?.writeText(info.compilado)} title="Copy"><LuCopy size={12} /></button>
                    </div>
                    <pre>{info.compilado}</pre>
                </div>
            )}
        </div>
    );
};

export default BarraModelo;
