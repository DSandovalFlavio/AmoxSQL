/**
 * Settings → Credentials (A1, fase 2.7 del plan de la 5.9).
 *
 * Lo que hay en el llavero: nombre, tipo, cuándo se guardó y cuándo se usó por
 * última vez. NUNCA el valor: el servidor no lo manda. Desde aquí sólo se
 * borra; las claves se escriben donde siempre (AI, Store Integrations), y las
 * credenciales con nombre para fuentes llegan con la 5.10.
 */
import { useCallback, useEffect, useState } from 'react';
import { LuKeyRound, LuTrash2, LuShieldCheck, LuTriangleAlert, LuLoader } from 'react-icons/lu';
import { API_BASE } from '../api.js';
import { useDialog } from './dialogs/DialogProvider.jsx';

/** Lo que es cada credencial que crea la propia aplicación. */
const QUE_ES = {
    'ia-gemini': 'Gemini API key',
    'ia-anthropic': 'Anthropic API key',
    'ia-minimax': 'MiniMax API key',
    'nube-s3': 'Amazon S3 — cloud export and Data Flow',
    'nube-gcs': 'Google Cloud Storage — cloud export and Data Flow',
};

/** Las fechas llegan como TIMESTAMP sin zona, en UTC. */
const fecha = (t) => {
    if (!t) return '—';
    const d = new Date(String(t).replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function CredentialsPanel() {
    const dialog = useDialog();
    const [estado, setEstado] = useState({ cargando: true, modo: null, credenciales: [], error: null });

    const cargar = useCallback(async () => {
        try {
            const r = await fetch(`${API_BASE}/api/secretos`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Could not read the keychain.');
            setEstado({ cargando: false, modo: d.modo, credenciales: d.credenciales || [], error: null });
        } catch (e) {
            setEstado(s => ({ ...s, cargando: false, error: e.message }));
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const borrar = async (c) => {
        const ok = await dialog.confirmAsync({
            title: `Delete ${c.nombre}?`,
            message: `${QUE_ES[c.nombre] || 'This credential'} will be removed from your system keychain. ` +
                'Anything that uses it stops working until you enter it again.',
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!ok) return;
        try {
            const r = await fetch(`${API_BASE}/api/secretos/${encodeURIComponent(c.nombre)}`, { method: 'DELETE' });
            if (!r.ok) throw new Error((await r.json()).error || 'Could not delete it.');
        } catch (e) {
            setEstado(s => ({ ...s, error: e.message }));
        }
        cargar();
    };

    if (estado.cargando) {
        return <div className="stg-section"><LuLoader size={14} className="stg-spin" /> Reading the keychain…</div>;
    }

    return (
        <div className="stg-section">
            <h3 className="stg-section-title">Credentials</h3>
            <p className="stg-row-desc stg-row-desc--mb14">
                API keys and cloud keys are encrypted with your system keychain. AmoxSQL never shows a saved
                value again — to change one, type the new value where you entered it (AI, Store Integrations).
            </p>

            {estado.modo === 'texto' && (
                <div className="stg-row" role="status">
                    <LuTriangleAlert size={16} style={{ color: 'var(--feedback-warning)', flex: 'none' }} />
                    <p className="stg-row-desc">
                        The system keychain isn't available here, so keys stay in <code>config.json</code> as in
                        earlier versions.
                    </p>
                </div>
            )}
            {estado.modo === 'pendiente' && (
                <p className="stg-row-desc">The keychain is still getting ready. Open this section again in a moment.</p>
            )}
            {estado.error && (
                <p className="stg-row-desc" role="alert" style={{ color: 'var(--feedback-error-text)' }}>{estado.error}</p>
            )}

            {estado.modo === 'llavero' && (
                <div className="stg-group stg-group--mt14">
                    {estado.credenciales.length === 0 && (
                        <div className="stg-row">
                            <p className="stg-row-desc">
                                No credentials yet. Keys you enter under AI and Store Integrations are saved here.
                            </p>
                        </div>
                    )}
                    {estado.credenciales.map(c => (
                        <div key={c.nombre} className="stg-row">
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                                {c.legible
                                    ? <LuShieldCheck size={16} style={{ color: 'var(--feedback-success)', flex: 'none', marginTop: 2 }} />
                                    : <LuTriangleAlert size={16} style={{ color: 'var(--feedback-warning)', flex: 'none', marginTop: 2 }} />}
                                <div style={{ minWidth: 0 }}>
                                    <span className="stg-row-label" style={{ fontFamily: 'var(--font-mono)' }}>{c.nombre}</span>
                                    <p className="stg-row-desc">
                                        {QUE_ES[c.nombre] || c.tipo}
                                        {' · '}saved {fecha(c.creada)}
                                        {' · '}{c.ultimo_uso ? `last used ${fecha(c.ultimo_uso)}` : 'never used'}
                                    </p>
                                    {!c.legible && (
                                        <p className="stg-row-desc" style={{ color: 'var(--feedback-warning-text)' }}>
                                            It can't be decrypted on this machine or with this Windows user. Enter it again.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                className="stg-btn stg-btn--danger-text"
                                onClick={() => borrar(c)}
                                title={`Delete ${c.nombre}`}
                                aria-label={`Delete ${c.nombre}`}
                            >
                                <LuTrash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <p className="stg-row-desc" style={{ marginTop: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                <LuKeyRound size={13} style={{ flex: 'none' }} />
                <span>Projects only record credential <em>names</em>, so a shared project never carries a key.</span>
            </p>
        </div>
    );
}
