/**
 * ChainFormulario — a process as a form (5.11, D5): for someone who doesn't
 * write SQL. The process's name and description, one field per declared
 * parameter (by its type), Run, and what the run left: the files, with Open and
 * Show in folder. Not one line of code on screen.
 *
 * Values go as "from outside" (`deFuera`): they are checked against their type
 * before running and can never change a query (server/parametros.js).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    LuCircleAlert, LuCircleCheck, LuExternalLink, LuFileSpreadsheet, LuFile, LuFolderOpen,
    LuLoader, LuPencil, LuPlay,
} from 'react-icons/lu';
import { API_BASE } from '../../api.js';

const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const tamano = (b) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const duracion = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);

function Campo({ def, valor, onChange, error }) {
    const id = `cf-${def.nombre}`;
    const etiqueta = def.etiqueta || def.nombre;
    const comun = { id, className: `cf-input${error ? ' cf-input--mal' : ''}`, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined };
    let control;
    if (def.tipo === 'fecha') control = <input type="date" {...comun} value={valor} onChange={e => onChange(e.target.value)} />;
    else if (def.tipo === 'numero') control = <input type="number" step="any" inputMode="decimal" {...comun} value={valor} onChange={e => onChange(e.target.value)} />;
    else if (def.tipo === 'lista') {
        control = (
            <select {...comun} value={valor} onChange={e => onChange(e.target.value)}>
                <option value="">Choose…</option>
                {(def.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        );
    } else if (def.tipo === 'logico') {
        control = (
            <div className="cf-sino" role="radiogroup" aria-labelledby={`${id}-label`}>
                {[['true', 'Yes'], ['false', 'No']].map(([v, t]) => (
                    <button key={v} type="button" role="radio" aria-checked={String(valor) === v} className={String(valor) === v ? 'activo' : ''} onClick={() => onChange(v)}>{t}</button>
                ))}
            </div>
        );
    } else control = <input type="text" {...comun} value={valor} onChange={e => onChange(e.target.value)} />;
    return (
        <div className="cf-campo">
            <label htmlFor={id} id={`${id}-label`}>{etiqueta}</label>
            {control}
            {def.ayuda && <small className="cf-ayuda">{def.ayuda}</small>}
            {error && <small className="cf-error" id={`${id}-error`}>{error}</small>}
        </div>
    );
}

const ChainFormulario = ({ chainDefinition, filePath, siempreFormulario, onSiempreFormulario, onEditar }) => {
    const defs = useMemo(() => chainDefinition.parametros || [], [chainDefinition]);
    const [valores, setValores] = useState(() => Object.fromEntries(defs.map(d => {
        const v = chainDefinition.variables?.[d.nombre];
        return [d.nombre, v != null && v !== '' ? String(v) : (d.tipo === 'fecha' ? hoy() : '')];
    })));
    const [estado, setEstado] = useState('listo');   // listo | corre | hecho
    const [errores, setErrores] = useState({});
    const [error, setError] = useState(null);
    const [resumen, setResumen] = useState(null);
    const [desde, setDesde] = useState(null);
    const [ahora, setAhora] = useState(Date.now());
    const titulo = useRef(null);

    useEffect(() => {
        if (estado !== 'corre') return;
        const t = setInterval(() => setAhora(Date.now()), 500);
        return () => clearInterval(t);
    }, [estado]);

    const correr = async (e) => {
        e?.preventDefault();
        // Lo que se puede ver aquí, sin preguntar al servidor.
        const faltan = {};
        for (const d of defs) if (d.requerido !== false && !String(valores[d.nombre] ?? '').trim()) faltan[d.nombre] = 'Needs a value.';
        setErrores(faltan);
        if (Object.keys(faltan).length) return;
        setError(null); setResumen(null); setEstado('corre'); setDesde(Date.now());
        try {
            const r = await fetch(`${API_BASE}/api/chains/run`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chainDefinition, chainFile: filePath, deFuera: valores }),
            });
            const d = await r.json();
            if (r.status === 400 && d.parametro) {
                setErrores({ [d.parametro]: d.error });
                setEstado('listo');
                return;
            }
            if (!r.ok) throw new Error(d.error || (d.details || []).join('; ') || 'The process could not run.');
            const rr = d.runId ? await fetch(`${API_BASE}/api/chains/run/${d.runId}/resumen`).then(x => x.json()).catch(() => null) : null;
            setResumen(rr || { estado: d.status === 'completed' ? 'ok' : 'fallo', fallo: d.error ? { error: d.error } : null, guardados: [], leidos: [] });
            setEstado('hecho');
            setTimeout(() => titulo.current?.focus(), 0);
        } catch (err) {
            setError(err.message);
            setEstado('listo');
        }
    };

    const abrir = (ruta) => window.electronAPI?.openPath?.(ruta);
    const mostrar = (ruta) => window.electronAPI?.showItemInFolder?.(ruta);
    const nombre = chainDefinition.name || (filePath || '').split(/[\\/]/).pop()?.replace(/\.sqlchain$/i, '') || 'Process';
    const ok = resumen?.estado === 'ok';

    return (
        <div className="cf">
            <div className="cf-hoja">
                <header className="cf-cabecera">
                    <div className="cf-tipo">Process</div>
                    <h1 className="cf-nombre">{nombre}</h1>
                    {chainDefinition.description && <p className="cf-descripcion">{chainDefinition.description}</p>}
                </header>

                <form className="cf-form" onSubmit={correr} noValidate>
                    {defs.length === 0 && <p className="cf-nada">This process asks for nothing. Press Run.</p>}
                    {defs.map(d => (
                        <Campo key={d.nombre} def={d} valor={valores[d.nombre] ?? ''} error={errores[d.nombre]}
                            onChange={(v) => { setValores(x => ({ ...x, [d.nombre]: v })); setErrores(x => ({ ...x, [d.nombre]: undefined })); }} />
                    ))}
                    <div className="cf-acciones">
                        <button type="submit" className="cf-correr" disabled={estado === 'corre'}>
                            {estado === 'corre' ? <><LuLoader size={15} className="lote-gira" /> Running… {duracion(ahora - desde)}</> : <><LuPlay size={15} /> Run</>}
                        </button>
                    </div>
                    {error && <p className="cf-error-general" role="alert">{error}</p>}
                </form>

                {resumen && (
                    <section className={`cf-resultado ${ok ? 'cf-resultado--ok' : 'cf-resultado--fallo'}`} aria-labelledby="cf-res">
                        <h2 id="cf-res" ref={titulo} tabIndex={-1}>
                            {ok ? <LuCircleCheck size={17} /> : <LuCircleAlert size={17} />}
                            {ok ? `Finished${resumen.duracionMs != null ? ` in ${duracion(resumen.duracionMs)}` : ''}` : 'It did not finish'}
                        </h2>
                        {!ok && resumen.fallo && (
                            <p className="cf-fallo">
                                {resumen.fallo.paso ? <>The step <strong>{resumen.fallo.paso}</strong> failed: </> : null}
                                {String(resumen.fallo.error || '').split('\n')[0]}
                            </p>
                        )}
                        {resumen.guardados?.length > 0 && (
                            <ul className="cf-archivos">
                                {resumen.guardados.map(g => {
                                    const nombreArchivo = g.ruta.split(/[\\/]/).pop();
                                    const Icono = /\.xls[xm]$/i.test(nombreArchivo) ? LuFileSpreadsheet : LuFile;
                                    return (
                                        <li key={g.ruta} className="cf-archivo">
                                            <Icono size={18} aria-hidden="true" />
                                            <div className="cf-archivo-texto">
                                                <strong title={g.ruta}>{nombreArchivo}</strong>
                                                <small>{[g.filas != null ? `${Number(g.filas).toLocaleString()} rows` : null, tamano(g.bytes), g.existe === false ? 'no longer there' : null].filter(Boolean).join(' · ')}</small>
                                            </div>
                                            {g.existe && !g.remoto && window.electronAPI?.openPath && (
                                                <button type="button" className="cf-boton" onClick={() => abrir(g.ruta)}><LuExternalLink size={13} /> Open</button>
                                            )}
                                            {g.existe && !g.remoto && window.electronAPI?.showItemInFolder && (
                                                <button type="button" className="cf-boton" onClick={() => mostrar(g.ruta)}><LuFolderOpen size={13} /> Show in folder</button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {ok && !resumen.guardados?.length && <p className="cf-nada">It finished without leaving a file.</p>}
                        {resumen.leidos?.length > 0 && (
                            <p className="cf-leidos">Read: {resumen.leidos.map(l => l.paso).join(', ')}.</p>
                        )}
                    </section>
                )}

                <footer className="cf-pie">
                    <label className="cf-siempre">
                        <input type="checkbox" checked={!!siempreFormulario} onChange={e => onSiempreFormulario?.(e.target.checked)} />
                        Always open this process as a form
                    </label>
                    <button type="button" className="cf-editar" onClick={onEditar}><LuPencil size={13} /> Edit the process</button>
                </footer>
            </div>
        </div>
    );
};

export default ChainFormulario;
