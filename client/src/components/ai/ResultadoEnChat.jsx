import { useCallback, useRef, useState } from 'react';
import { LuLoader, LuX, LuExternalLink, LuTriangleAlert } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

/**
 * **«Run» corre en el chat** (plan del Assistant, E6/A7, decisión 3).
 *
 * Antes, «Run» en una consulta del chat abría una pestaña «Untitled» nueva cada
 * vez: tres pruebas, tres pestañas. Ahora la consulta corre aquí mismo y el
 * resultado se ve debajo, con las primeras filas; **Open in editor** la lleva a
 * una pestaña cuando de verdad se quiere seguir con ella.
 */

const FILAS = 20;

/** El estado de una consulta corrida en el chat: `{ estado, correr, cerrar }`. */
export function useConsultaEnChat() {
    const [estado, setEstado] = useState(null);   // null | { cargando } | { filas, columnas, total, ms, recortado } | { error }
    const peticion = useRef(null);
    const correr = useCallback(async (sql) => {
        peticion.current?.abort();
        const p = new AbortController();
        peticion.current = p;
        setEstado({ cargando: true });
        const t0 = performance.now();
        try {
            const r = await fetch(`${API_BASE}/api/query`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: p.signal,
                body: JSON.stringify({ query: sql, limit: 200 }),
            });
            const d = await r.json();
            if (!r.ok || d.error) { setEstado({ error: d.error || `The query failed (${r.status}).` }); return; }
            const filas = Array.isArray(d.data) ? d.data : [];
            const columnas = d.types ? Object.keys(d.types) : (filas[0] ? Object.keys(filas[0]) : []);
            setEstado({ filas, columnas, total: d.rowCount ?? filas.length, ms: Math.round(performance.now() - t0), recortado: !!d.truncated });
        } catch (e) {
            if (!p.signal.aborted) setEstado({ error: e.message });
        }
    }, []);
    const cerrar = useCallback(() => { peticion.current?.abort(); setEstado(null); }, []);
    return { estado, correr, cerrar };
}

const celda = (v) => (v === null || v === undefined ? <span className="ai-null-value">NULL</span>
    : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** El resultado debajo de la consulta. */
export function ResultadoEnChat({ estado, onCerrar, onAbrirEnEditor }) {
    if (!estado) return null;
    if (estado.cargando) {
        return <div className="ai-chat-resultado ai-chat-resultado--cargando"><LuLoader size={12} className="ai-tool-spinner" /> Running…</div>;
    }
    const pie = (
        <span className="ai-chat-resultado-acciones">
            {onAbrirEnEditor && (
                <button type="button" className="ai-code-action-btn" onClick={onAbrirEnEditor} title="Open the query in a new editor tab">
                    <LuExternalLink size={11} /> Open in editor
                </button>
            )}
            <button type="button" className="ai-code-action-btn" onClick={onCerrar} title="Hide the result">
                <LuX size={11} />
            </button>
        </span>
    );
    if (estado.error) {
        return (
            <div className="ai-chat-resultado ai-chat-resultado--error">
                <div className="ai-chat-resultado-cab"><LuTriangleAlert size={12} /> <span className="ai-chat-resultado-error">{estado.error}</span>{pie}</div>
            </div>
        );
    }
    const { filas, columnas, total, ms, recortado } = estado;
    return (
        <div className="ai-chat-resultado">
            <div className="ai-chat-resultado-cab">
                <span>{total} row{total === 1 ? '' : 's'}{recortado ? '+' : ''} · {ms} ms{total > FILAS ? ` · first ${FILAS}` : ''}</span>
                {pie}
            </div>
            {filas.length > 0 && (
                <div className="ai-msg-table-wrap">
                    <table>
                        <thead><tr>{columnas.map(c => <th key={c}>{c}</th>)}</tr></thead>
                        <tbody>
                            {filas.slice(0, FILAS).map((f, i) => (
                                <tr key={i}>{columnas.map(c => <td key={c}>{celda(f[c])}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
