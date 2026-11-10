import { useEffect, useState } from 'react';
import { LuDatabaseZap } from 'react-icons/lu';
import { API_BASE } from '../api.js';
import { useDialog } from './dialogs/DialogProvider';
import { useToast } from './ToastProvider';

/**
 * «Upgrade the database format» (6.0, O4). Una línea en el explorador cuando la base
 * abierta está en el formato de la 5.x (DuckDB 1): la copia al formato actual (más
 * chica, lo de dentro igual) y deja la original al lado. Nunca automático: después,
 * la 5.x y un dbt con DuckDB 1 ya no abren el archivo actualizado.
 */
const mb = (b) => (b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function FormatoDeBase({ refresco, onActualizada }) {
    const [e, setE] = useState(null);
    const [trabajando, setTrabajando] = useState(false);
    const dialog = useDialog();
    const toast = useToast();

    useEffect(() => {
        let vivo = true;
        fetch(`${API_BASE}/api/db/formato`).then(r => r.json()).then(d => { if (vivo) setE(d); }).catch(() => { if (vivo) setE(null); });
        return () => { vivo = false; };
    }, [refresco]);

    if (!e?.aplicable || !e.anterior) return null;

    const actualizar = async () => {
        const respaldo = e.nombre.replace(/\.duckdb$/i, '') + '.before-6.duckdb';
        const ok = await dialog.confirmAsync({
            title: `Upgrade ${e.nombre}`,
            message: `AmoxSQL copies it into the current format: usually smaller, with everything inside kept (tables, views, macros, comments, sequences). The original stays next to it as ${respaldo}.\n\nAfter this, AmoxSQL 5 and dbt with DuckDB 1 can no longer open the upgraded file.`,
            confirmLabel: 'Upgrade',
        });
        if (!ok) return;
        setTrabajando(true);
        try {
            const r = await fetch(`${API_BASE}/api/db/formato/actualizar`, { method: 'POST' });
            const d = await r.json();
            if (!r.ok) { toast.error(d.error || 'The database could not be upgraded.'); return; }
            const nombreRespaldo = String(d.respaldo || '').split(/[\\/]/).pop();
            toast.success(`${d.nombre} upgraded: ${mb(d.antes)} → ${mb(d.despues)}. The original is kept as ${nombreRespaldo}.`);
            setE(x => ({ ...x, anterior: false }));
            onActualizada?.();
        } finally {
            setTrabajando(false);
        }
    };

    return (
        <div className="fdb" role="status">
            <LuDatabaseZap size={13} className="fdb-icono" />
            <span className="fdb-texto" title={`${e.nombre} uses the format of AmoxSQL 5 (DuckDB 1). Upgrading makes it smaller and keeps the original next to it.`}>
                <strong>{e.nombre}</strong> uses AmoxSQL 5's format{e.tamano ? ` · ${mb(e.tamano)}` : ''}
            </span>
            <button type="button" className="fdb-btn" onClick={actualizar} disabled={trabajando}
                title="Copy it into the current format (smaller); the original is kept">
                {trabajando ? 'Upgrading…' : 'Upgrade…'}
            </button>
        </div>
    );
}
