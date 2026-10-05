/**
 * AvisoProgramador — what the schedules did while AmoxSQL was closed (5.11, D1).
 *
 * When AmoxSQL opens, the first tick catches up (Dec-17): the latest missed
 * occurrence of each schedule runs. This says it once, as a toast: "While
 * AmoxSQL was closed: Monthly close ran (2 earlier runs were missed)."
 */
import { useEffect, useRef } from 'react';
import { useToast } from './ToastProvider';
import { API_BASE } from '../api.js';

export default function AvisoProgramador() {
    const toast = useToast();
    const dicho = useRef(false);

    useEffect(() => {
        let vivo = true;
        // El primer tick va unos segundos después de arrancar: se pregunta un par de veces.
        const mirar = async (intento = 0) => {
            if (!vivo || dicho.current) return;
            try {
                const d = await fetch(`${API_BASE}/api/programaciones`).then(r => r.json());
                const a = d.alAbrir;
                if (!a) { if (intento < 6) setTimeout(() => mirar(intento + 1), 5000); return; }
                dicho.current = true;
                const corridas = a.corridas || [];
                const saltadas = (a.saltadas || []).filter(s => s.perdidas > 0);
                if (!corridas.length && !saltadas.length) return;
                const partes = corridas.map(c => `${c.nombre} ${c.estado === 'ok' ? 'ran' : 'failed'}${c.perdidas ? ` (${c.perdidas} earlier run${c.perdidas === 1 ? ' was' : 's were'} missed)` : ''}`);
                for (const s of saltadas) partes.push(`${s.nombre}: ${s.perdidas} missed, not run (${s.motivo})`);
                const fallo = corridas.some(c => c.estado !== 'ok');
                (fallo ? toast.error : toast.info)(`While AmoxSQL was closed: ${partes.join('; ')}.`);
            } catch { /* sin servidor todavía */ }
        };
        const t = setTimeout(() => mirar(), 6000);
        return () => { vivo = false; clearTimeout(t); };
    }, [toast]);

    return null;
}
