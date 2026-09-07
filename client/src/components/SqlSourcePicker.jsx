/**
 * SqlSourcePicker — elige la query a la que se asocia un gráfico nuevo.
 *
 * El flujo de antes para llegar a un .amoxvis eran cuatro pasos: abrir una
 * query, ejecutarla, ir a la sección de gráficos y guardar. Eso está bien
 * cuando ya estás mirando unos resultados, pero no cuando lo que quieres es
 * partir de una query que ya existe.
 *
 * Dos decisiones que salieron de probarlo con archivos reales:
 *
 *  - Es un BUSCADOR y no una lista de botones: el proyecto de prueba tenía 34
 *    archivos .sql, y un diálogo de opciones habría sido un muro.
 *
 *  - Un .sql NO es una query. Muchos son archivos de trabajo con varias
 *    sentencias y comentarios; meter el archivo entero como query del gráfico
 *    daba "No data to display". Si hay más de una sentencia se pregunta cuál,
 *    que es justo lo que hacías tú al ejecutar una sola en el editor.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LuSearch, LuFileCode2, LuChartBar, LuChevronLeft } from 'react-icons/lu';
import { API_BASE } from '../api.js';
import { splitSqlStatements } from '../utils/sqlSplitter';

/**
 * ¿Esta sentencia devuelve filas? Un gráfico de un CREATE TABLE no significa
 * nada. Se mira el primer verbo del código ya sin comentarios.
 */
const devuelveFilas = (code) => /^\s*(select|with|from|values|show|describe|desc|pragma|summarize|table)\b/i.test(code);

const unaLinea = (s, max = 120) => s.replace(/\s+/g, ' ').trim().slice(0, max);

const SqlSourcePicker = ({ onPick, onClose }) => {
    const [files, setFiles] = useState(null);      // null = aún cargando
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [paso2, setPaso2] = useState(null);      // { path, statements } | null
    const [cargandoArchivo, setCargandoArchivo] = useState(false);
    const [error, setError] = useState(null);
    const boxRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`${API_BASE}/api/files/find-by-extension?ext=.sql`)
            .then(r => r.json())
            .then(d => {
                if (cancelled) return;
                setFiles((Array.isArray(d) ? d : d.files || [])
                    .map(f => (typeof f === 'string' ? f : f.path || f.name))
                    .filter(Boolean));
            })
            .catch(() => { if (!cancelled) setFiles([]); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => { if (!paso2) inputRef.current?.focus(); }, [paso2]);

    useEffect(() => {
        const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose(); };
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            // Esc en el segundo paso vuelve al primero, no cancela del todo.
            if (paso2) setPaso2(null); else onClose();
        };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [onClose, paso2]);

    const filtrados = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!files) return [];
        return q ? files.filter(f => f.toLowerCase().includes(q)) : files;
    }, [files, query]);

    useEffect(() => { setActive(0); }, [query, paso2]);

    const elegirArchivo = async (path) => {
        setCargandoArchivo(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            const contenido = data.content || '';
            const todas = splitSqlStatements(contenido);
            const utiles = todas.filter(s => devuelveFilas(s.code));
            // Si ninguna devuelve filas se ofrecen todas: mejor dejar decidir que
            // afirmar que el archivo no sirve por una heurística.
            const candidatas = utiles.length > 0 ? utiles : todas;

            if (candidatas.length === 0) onPick({ path, query: contenido });
            else if (candidatas.length === 1) onPick({ path, query: candidatas[0].raw });
            else setPaso2({ path, statements: candidatas });
        } catch (err) {
            setError(`No se pudo leer ${path}: ${err.message}`);
        } finally {
            setCargandoArchivo(false);
        }
    };

    const lista = paso2 ? paso2.statements : filtrados;

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, lista.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' && lista[active]) {
            e.preventDefault();
            if (paso2) onPick({ path: paso2.path, query: lista[active].raw });
            else elegirArchivo(lista[active]);
        }
    };

    const cargando = files === null;
    const sinArchivos = files !== null && files.length === 0;

    return createPortal(
        <div className="ssp-backdrop">
            <div className="ssp" ref={boxRef} role="dialog" aria-label="Choose a query for this chart">
                <div className="ssp-head">
                    {paso2 ? (
                        <button className="ssp-back" onClick={() => setPaso2(null)} title="Back to the file list">
                            <LuChevronLeft size={14} />
                        </button>
                    ) : <LuChartBar size={14} />}
                    <span>{paso2 ? paso2.path.split('/').pop() : 'New chart'}</span>
                </div>

                <p className="ssp-sub">
                    {paso2
                        ? `This file has ${paso2.statements.length} queries. Which one should the chart show?`
                        : sinArchivos
                            ? 'This project has no .sql files yet.'
                            : 'Which query should this chart show?'}
                </p>

                {error && <p className="ssp-error">{error}</p>}

                {!paso2 && !sinArchivos && (
                    <div className="ssp-search">
                        <LuSearch size={13} />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search .sql files…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onKeyDown}
                            spellCheck={false}
                        />
                    </div>
                )}

                <div className="ssp-list">
                    {(cargando || cargandoArchivo) && <div className="ssp-empty">Loading…</div>}

                    {!paso2 && !cargando && !sinArchivos && filtrados.length === 0 && (
                        <div className="ssp-empty">No .sql file matches that.</div>
                    )}

                    {!paso2 && filtrados.map((f, i) => (
                        <button
                            key={f}
                            className={`ssp-item${i === active ? ' ssp-item--active' : ''}`}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => elegirArchivo(f)}
                            title={f}
                        >
                            <LuFileCode2 size={12} />
                            <span className="ssp-item-name">{f.split('/').pop()}</span>
                            <span className="ssp-item-path">{f}</span>
                        </button>
                    ))}

                    {paso2 && paso2.statements.map((st, i) => (
                        <button
                            key={`${st.startLine}-${i}`}
                            className={`ssp-stmt${i === active ? ' ssp-item--active' : ''}`}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => onPick({ path: paso2.path, query: st.raw })}
                            title={st.code}
                        >
                            <span className="ssp-stmt-line">L{st.startLine}</span>
                            <span className="ssp-stmt-code">{unaLinea(st.code)}</span>
                        </button>
                    ))}
                </div>

                {!paso2 && (
                    /* La salida de siempre: un gráfico en blanco, que era lo único
                       que se podía hacer antes desde aquí. */
                    <button className="ssp-blank" onClick={() => onPick(null)}>
                        Start without a query
                    </button>
                )}
            </div>
        </div>,
        document.body
    );
};

export default SqlSourcePicker;
