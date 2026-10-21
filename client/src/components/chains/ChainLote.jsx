/**
 * ChainLote — "Run for each…" (5.11, D4): the same process once per value of a
 * parameter. The values come from a list written here, or from the distinct
 * values of a column of a named source or a table ("each store"). Runs go one
 * after another on the server (/api/chains/lote); this dialog shows each one as
 * it starts and ends, and Stop ends the batch after the run in progress.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuCheck, LuLoader, LuPlay, LuRepeat, LuSquare, LuX } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

const ChainLote = ({ chainDefinition, chainFile, onClose }) => {
    const defs = useMemo(() => new Map((chainDefinition.parametros || []).map(p => [p.nombre, p])), [chainDefinition]);
    const nombres = useMemo(() => [...new Set([...defs.keys(), ...Object.keys(chainDefinition.variables || {})])], [defs, chainDefinition]);
    const [param, setParam] = useState(nombres[0] || '');
    const [origen, setOrigen] = useState('lista');
    const [texto, setTexto] = useState('');
    const [tablas, setTablas] = useState([]);
    const [tabla, setTabla] = useState('');
    const [columnas, setColumnas] = useState([]);
    const [columna, setColumna] = useState('');
    const [deColumna, setDeColumna] = useState([]);
    const [error, setError] = useState(null);
    const [runs, setRuns] = useState(null);         // [{ valor, estado, error }]
    const [resumen, setResumen] = useState(null);
    const corriendo = runs && !resumen;
    const abortar = useRef(null);

    // A list parameter starts with its options.
    useEffect(() => {
        const d = defs.get(param);
        if (d?.tipo === 'lista' && d.opciones?.length) setTexto(d.opciones.join('\n'));
    }, [param, defs]);

    // Sources and tables to take the values from.
    useEffect(() => {
        if (origen !== 'columna' || tablas.length) return;
        Promise.all([
            fetch(`${API_BASE}/api/fuentes`).then(r => r.json()).catch(() => ({})),
            fetch(`${API_BASE}/api/db/tables`).then(r => r.json()).catch(() => []),
        ]).then(([f, t]) => {
            setTablas([
                ...(f.fuentes || []).map(x => ({ ref: `fuentes.${ident(x.nombre)}`, etiqueta: `${x.nombre} (source)` })),
                ...(Array.isArray(t) ? t : []).map(x => ({ ref: x.schema && x.schema !== 'main' ? `${ident(x.schema)}.${ident(x.name)}` : ident(x.name), etiqueta: x.name })),
            ]);
        });
    }, [origen, tablas.length]);

    const consultar = async (sql) => {
        const r = await fetch(`${API_BASE}/api/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || 'The query failed');
        return d.data || [];
    };

    useEffect(() => {
        setColumnas([]); setColumna(''); setDeColumna([]);
        if (!tabla) return;
        consultar(`DESCRIBE SELECT * FROM ${tabla}`).then(c => setColumnas(c.map(x => x.column_name))).catch(e => setError(e.message));
    }, [tabla]);

    useEffect(() => {
        setDeColumna([]);
        if (!tabla || !columna) return;
        consultar(`SELECT DISTINCT CAST(${ident(columna)} AS VARCHAR) AS v FROM ${tabla} WHERE ${ident(columna)} IS NOT NULL ORDER BY 1 LIMIT 501`)
            .then(f => { setDeColumna(f.map(x => x.v)); setError(f.length > 500 ? 'That column has more than 500 different values: at most 500 runs at once.' : null); })
            .catch(e => setError(e.message));
    }, [tabla, columna]);

    const valores = origen === 'lista'
        ? [...new Set(texto.split(/\r?\n/).map(s => s.trim()).filter(Boolean))]
        : deColumna.slice(0, 500);

    const correr = async () => {
        setError(null); setResumen(null);
        setRuns(valores.map(v => ({ valor: v, estado: 'espera' })));
        const ctl = new AbortController();
        abortar.current = ctl;
        try {
            const r = await fetch(`${API_BASE}/api/chains/lote`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
                body: JSON.stringify({ chainDefinition, chainFile, lote: valores.map(v => ({ [param]: v })) }),
            });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                setRuns(null);
                setError(d.error || (d.details || []).join('; ') || 'The batch could not start');
                return;
            }
            const lector = r.body.getReader();
            const dec = new TextDecoder();
            let resto = '';
            for (;;) {
                const { value, done } = await lector.read();
                if (done) break;
                resto += dec.decode(value, { stream: true });
                const partes = resto.split('\n\n');
                resto = partes.pop();
                for (const p of partes) {
                    if (!p.startsWith('data: ')) continue;
                    const e = JSON.parse(p.slice(6));
                    if (e.tipo === 'inicio') setRuns(rs => rs.map((x, k) => (k === e.i ? { ...x, estado: 'corre' } : x)));
                    if (e.tipo === 'fin') setRuns(rs => rs.map((x, k) => (k === e.i ? { ...x, estado: e.estado === 'completed' ? 'ok' : 'fallo', error: e.error } : x)));
                    if (e.tipo === 'resumen') setResumen(e);
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') setResumen(s => s || { cortado: true });
            else setError(e.message);
        }
    };

    const parar = () => abortar.current?.abort();
    const def = defs.get(param);

    const modal = (
        <div className="modal-overlay cvp-fondo" onClick={corriendo ? undefined : onClose}>
            <div className="modal-panel cvp-panel" role="dialog" aria-labelledby="lote-titulo" onClick={e => e.stopPropagation()}>
                <div className="cvp-cabecera">
                    <div className="cvp-titulo"><LuRepeat size={15} /><span id="lote-titulo">Run for each…</span></div>
                    <button className="cvp-cerrar" onClick={onClose} disabled={corriendo} aria-label="Close"><LuX size={15} /></button>
                </div>
                <div className="cvp-cuerpo">
                    {!nombres.length ? (
                        <p className="cvp-intro">This process has no parameters. Add one in <strong>Parameters</strong> and use it as <code>{'${name}'}</code> — for example in the name of the file it leaves.</p>
                    ) : !runs ? (
                        <>
                            <p className="cvp-intro">The process runs once per value, one after another. Use the parameter in a file name (<code>{`outputs/report_\${${param || 'store'}}.xlsx`}</code>) so each run leaves its own file.</p>
                            <label className="lote-campo">
                                <span>Parameter</span>
                                <select className="cvp-input" value={param} onChange={e => setParam(e.target.value)}>
                                    {nombres.map(n => <option key={n} value={n}>{defs.get(n)?.etiqueta || n}</option>)}
                                </select>
                            </label>
                            <div className="xls-modo lote-origen" role="radiogroup" aria-label="Where the values come from">
                                <button type="button" role="radio" aria-checked={origen === 'lista'} className={origen === 'lista' ? 'activo' : ''} onClick={() => setOrigen('lista')}>A list</button>
                                <button type="button" role="radio" aria-checked={origen === 'columna'} className={origen === 'columna' ? 'activo' : ''} onClick={() => setOrigen('columna')}>The values of a column</button>
                            </div>
                            {origen === 'lista' ? (
                                <label className="lote-campo">
                                    <span>One value per line</span>
                                    <textarea className="cvp-input lote-lista" rows={6} value={texto} onChange={e => setTexto(e.target.value)}
                                        placeholder={def?.tipo === 'fecha' ? '2026-09-01\n2026-09-08' : 'north\nsouth\ncenter'} />
                                </label>
                            ) : (
                                <div className="lote-columna">
                                    <label className="lote-campo">
                                        <span>Source or table</span>
                                        <select className="cvp-input" value={tabla} onChange={e => setTabla(e.target.value)}>
                                            <option value="">Choose…</option>
                                            {tablas.map(t => <option key={t.ref} value={t.ref}>{t.etiqueta}</option>)}
                                        </select>
                                    </label>
                                    <label className="lote-campo">
                                        <span>Column</span>
                                        <select className="cvp-input" value={columna} disabled={!columnas.length} onChange={e => setColumna(e.target.value)}>
                                            <option value="">Choose…</option>
                                            {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </label>
                                    {deColumna.length > 0 && <p className="cvp-nota">{deColumna.slice(0, 6).join(', ')}{deColumna.length > 6 ? `, … (${deColumna.length})` : ''}</p>}
                                </div>
                            )}
                            {error && <p className="chain-config-hint-error">{error}</p>}
                            <div className="lote-pie">
                                <span className="cvp-nota">{valores.length ? `${valores.length} run${valores.length === 1 ? '' : 's'}` : 'No values yet'}</span>
                                <button className="lote-correr" disabled={!valores.length || !param || valores.length > 500} onClick={correr}><LuPlay size={13} /> Run {valores.length || ''}</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <ol className="lote-runs" aria-live="polite">
                                {runs.map((x, k) => (
                                    <li key={k} className={`lote-run lote-run--${x.estado}`}>
                                        <span className="lote-icono" aria-hidden="true">
                                            {x.estado === 'ok' ? <LuCheck size={13} /> : x.estado === 'fallo' ? <LuX size={13} /> : x.estado === 'corre' ? <LuLoader size={13} className="lote-gira" /> : <span className="lote-punto" />}
                                        </span>
                                        <code>{param} = {x.valor}</code>
                                        <span className="lote-estado">{x.estado === 'ok' ? 'finished' : x.estado === 'fallo' ? (x.error || 'failed') : x.estado === 'corre' ? 'running' : 'waiting'}</span>
                                    </li>
                                ))}
                            </ol>
                            {error && <p className="chain-config-hint-error">{error}</p>}
                            <div className="lote-pie">
                                <span className="cvp-nota">
                                    {resumen ? (resumen.cortado ? 'Stopped. The run in progress finished; the rest did not start.' : `${resumen.bien} of ${resumen.total} finished. Each run is in the process history.`) : `Running ${runs.filter(x => x.estado === 'ok' || x.estado === 'fallo').length + 1} of ${runs.length}…`}
                                </span>
                                {corriendo
                                    ? <button className="lote-parar" onClick={parar}><LuSquare size={12} /> Stop</button>
                                    : <button className="lote-correr" onClick={onClose}>Close</button>}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
    return createPortal(modal, document.body);
};

export default ChainLote;
