import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '../../api.js';

/**
 * Correr un comando de dbt desde cualquier pantalla (5.12): lee la salida, se queda
 * con el resumen, pide confirmar si escribe en producción (Dec-29) y avisa a los demás
 * de que dbt cambió algo (`amox_dbt_cambio`: el completado y el linaje se refrescan).
 *
 *   const dbt = useCorrerDbt();
 *   dbt.correr('dbt run --select x+');   dbt.ocupado · dbt.resumen · dbt.error · dbt.confirmar
 *   dbt.confirmarCon('prod');            dbt.parar();
 */
export default function useCorrerDbt({ alTerminar } = {}) {
    const [ocupado, setOcupado] = useState(null);
    const [resumen, setResumen] = useState(null);
    const [error, setError] = useState(null);
    const [confirmar, setConfirmar] = useState(null);   // { target, motivo, comando }
    const corte = useRef(null);

    const correr = useCallback(async (comando, confirmarProduccion = null) => {
        setOcupado(comando); setError(null); setResumen(null); setConfirmar(null);
        const c = new AbortController();
        corte.current = c;
        let r = null;
        try {
            const res = await fetch(`${API_BASE}/api/dbt/execute`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: c.signal,
                body: JSON.stringify({ command: comando, ...(confirmarProduccion ? { confirmarProduccion } : {}) }),
            });
            if (!res.ok && !String(res.headers.get('content-type') || '').includes('event-stream')) {
                const d = await res.json().catch(() => ({}));
                if (res.status === 409 && d.necesitaConfirmar) { setConfirmar({ target: d.target, motivo: d.motivo, comando }); return null; }
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
                    if (d.type === 'resumen') { r = d.resumen; setResumen(d.resumen); }
                }
            }
            window.dispatchEvent(new Event('amox_dbt_cambio'));
            alTerminar?.(r);
        } catch (e) {
            if (e.name !== 'AbortError') setError(e.message);
        } finally {
            corte.current = null;
            setOcupado(null);
        }
        return r;
    }, [alTerminar]);

    return {
        ocupado, resumen, error, confirmar,
        correr,
        confirmarCon: (target) => confirmar && correr(confirmar.comando, target),
        cancelarConfirmacion: () => setConfirmar(null),
        parar: () => corte.current?.abort(),
        limpiar: () => { setResumen(null); setError(null); },
    };
}
