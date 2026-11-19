/**
 * Extensiones propias (6.0.1): las que el usuario compiló o recibió como
 * archivo, sin la firma de los repositorios oficial y community.
 *
 * Dos piezas, al pie del panel Extensions:
 * - «Allow unsigned extensions»: el motor sólo las carga si NACE permitiéndolo,
 *   así que cambiarlo reinicia el motor (la base abierta vuelve; las vistas
 *   temporales de la sesión no). Se confirma aquí mismo, diciendo el riesgo.
 * - «Install from file…»: elige el `.duckdb_extension`, lo instala y lo carga;
 *   desde entonces se carga por nombre, también al abrir AmoxSQL.
 *
 * El servidor: `server/motor.js → permiteSinFirma`, `/api/db/extensions/sin-firma`
 * y `/api/db/extensions/install-file` (`server/api/base.js`).
 */
import { useCallback, useEffect, useState } from 'react';
import { LuFileUp, LuLoader, LuShieldAlert } from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { useToast } from '../ToastProvider';

async function pedir(url, cuerpo) {
    const res = await fetch(`${API_BASE}${url}`, cuerpo === undefined ? undefined : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
    });
    const datos = await res.json().catch(() => ({}));
    return { ok: res.ok, datos };
}

export default function ExtensionesPropias({ onCambio }) {
    const toast = useToast();
    const [estado, setEstado] = useState({ guardado: false, activo: false });
    const [confirmando, setConfirmando] = useState(false);
    const [ocupado, setOcupado] = useState(null);   // 'ajuste' | 'archivo' | null

    useEffect(() => {
        pedir('/api/db/extensions/sin-firma').then(({ ok, datos }) => { if (ok) setEstado(datos); });
    }, []);

    const cambiar = useCallback(async (activo) => {
        setConfirmando(false);
        setOcupado('ajuste');
        try {
            const { ok, datos } = await pedir('/api/db/extensions/sin-firma', { activo });
            if (!ok) { toast.error(datos.details || datos.error, 8000); return; }
            setEstado({ guardado: datos.guardado, activo: datos.activo });
            toast.success(activo
                ? 'Unsigned extensions allowed. The engine restarted with your database open.'
                : 'Unsigned extensions are no longer allowed. The engine restarted.', 5000);
            onCambio?.();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setOcupado(null);
        }
    }, [toast, onCambio]);

    const instalarArchivo = useCallback(async () => {
        const elegir = window.electronAPI?.openFileDialog;
        if (!elegir) { toast.info('Installing from a file needs the desktop app.', 4000); return; }
        const r = await elegir({
            title: 'Install extension from file',
            filters: [{ name: 'Engine extension', extensions: ['duckdb_extension', 'gz'] }],
        });
        const ruta = r?.canceled ? null : r?.filePaths?.[0];
        if (!ruta) return;
        setOcupado('archivo');
        try {
            const { ok, datos } = await pedir('/api/db/extensions/install-file', { ruta });
            if (ok) {
                toast.success(datos.message);
                onCambio?.();
            } else {
                toast.error(datos.details || datos.error, 9000);
            }
        } catch (e) {
            toast.error(e.message);
        } finally {
            setOcupado(null);
        }
    }, [toast, onCambio]);

    const encendido = estado.guardado;
    // Guardado pero el motor aún no lo tiene (otro proceso lo cambió, o falló el reinicio).
    const pendiente = estado.guardado !== estado.activo;

    return (
        <div className="ext-propias">
            <div className="ext-propias-titulo">Your own extensions</div>

            <label className="ext-propias-ajuste">
                <input
                    type="checkbox"
                    checked={encendido || confirmando}
                    disabled={!!ocupado}
                    onChange={(e) => (e.target.checked ? setConfirmando(true) : cambiar(false))}
                />
                <span>Allow unsigned extensions</span>
                {ocupado === 'ajuste' && <LuLoader size={11} className="ext-spin" />}
            </label>

            {confirmando && (
                <div className="ext-propias-aviso" role="alert">
                    <LuShieldAlert size={13} />
                    <div className="columna hueco-2">
                        <span>
                            An unsigned extension runs code that nobody has verified, with your permissions.
                            Only allow it for extensions you built or trust.
                        </span>
                        <span className="texto-tenue">
                            The engine restarts: your database stays open, temporary views (notebook cells) are cleared.
                        </span>
                        <div className="fila hueco-2">
                            <button className="btn-primario btn--peq" onClick={() => cambiar(true)}>Allow and restart engine</button>
                            <button className="btn-texto btn--peq" onClick={() => setConfirmando(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {pendiente && !confirmando && (
                <div className="ext-propias-nota texto-tenue">
                    {estado.guardado ? 'Saved, but the engine is not using it yet.' : 'The engine still allows them until it restarts.'}
                    {' '}
                    <button className="btn-texto btn--peq" disabled={!!ocupado} onClick={() => cambiar(estado.guardado)}>Restart engine</button>
                </div>
            )}

            <button className="btn-secundario btn--peq ext-propias-boton" disabled={!!ocupado} onClick={instalarArchivo}>
                {ocupado === 'archivo' ? <LuLoader size={12} className="ext-spin" /> : <LuFileUp size={12} />}
                Install from file…
            </button>
        </div>
    );
}
