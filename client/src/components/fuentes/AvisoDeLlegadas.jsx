/**
 * «Llegó el archivo» (C3, 3.3). Escucha las llegadas a las carpetas de las
 * fuentes del proyecto abierto y lo dice una vez por archivo: la vista ya está
 * rehecha cuando el aviso llega, así que la próxima consulta lee lo nuevo.
 *
 * No pinta nada: sólo avisa con un toast y pide a quien enseña fuentes (el
 * explorador, la ficha del workspace) que se ponga al día.
 */
import { useEffect } from 'react';
import { API_BASE } from '../../api.js';
import { useToast } from '../ToastProvider';
import { avisarCambio } from './api';

export default function AvisoDeLlegadas() {
    const toast = useToast();
    useEffect(() => {
        let fuente = null;
        let reintento = null;
        const conectar = () => {
            try { fuente = new EventSource(`${API_BASE}/api/fuentes/llegadas`); } catch { return; }
            fuente.onmessage = (e) => {
                let aviso;
                try { aviso = JSON.parse(e.data); } catch { return; }
                if (aviso.tipo !== 'llegada') return;
                const quien = (aviso.fuentes || []).join(', ');
                toast.info(`${quien}: “${aviso.archivo}” arrived. Queries on it now read the new file.`, 8000);
                avisarCambio();
            };
            // Si el servidor se reinicia, se vuelve a conectar con calma (como el vigilante del disco).
            fuente.onerror = () => {
                try { fuente.close(); } catch { /* ya estaba cerrada */ }
                fuente = null;
                clearTimeout(reintento);
                reintento = setTimeout(conectar, 5000);
            };
        };
        conectar();
        return () => {
            clearTimeout(reintento);
            try { fuente?.close(); } catch { /* ya estaba cerrada */ }
        };
    }, [toast]);
    return null;
}
