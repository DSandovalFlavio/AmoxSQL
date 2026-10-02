/**
 * Una credencial de nube con nombre (C4, 5.1), para las fuentes en un bucket o
 * un lago. Se escribe una vez y no vuelve nunca: el servidor la cifra con el
 * llavero del sistema y sólo devuelve su nombre.
 */
import { useState } from 'react';
import { LuCloud, LuCheck } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

const VACIA = { nombre: '', proveedor: 's3', accessKeyId: '', secretKey: '', region: '', endpoint: '', urlStyle: '' };

export default function NuevaCredencialNube({ onCreada }) {
    const [abierta, setAbierta] = useState(false);
    const [c, setC] = useState(VACIA);
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const cambiar = (k) => (e) => setC(prev => ({ ...prev, [k]: e.target.value }));

    const guardar = async () => {
        setOcupado(true); setError(null);
        try {
            const r = await fetch(`${API_BASE}/api/secretos/nube`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'Could not save it.');
            setC(VACIA); setAbierta(false);
            onCreada?.(d.nombre);
        } catch (e) {
            setError(e.message);
        } finally {
            setOcupado(false);
        }
    };

    if (!abierta) {
        return (
            <button className="stg-btn" type="button" style={{ marginTop: 12 }} onClick={() => setAbierta(true)}>
                <LuCloud size={14} /> New cloud credential
            </button>
        );
    }

    const s3 = c.proveedor === 's3';
    return (
        <div className="stg-group stg-group--mt14 ncn">
            <p className="stg-row-desc">
                For a source in a bucket or a lake. Give it a name your sources will use — <code>bucket-stores</code> —:
                each one only opens the folder its source points to, so several can live side by side.
            </p>
            <div className="ncn-rejilla">
                <label className="ncn-campo"><span>Name</span>
                    <input className="stg-input stg-input--mono" value={c.nombre} onChange={cambiar('nombre')} placeholder="bucket-stores" spellCheck={false} />
                </label>
                <label className="ncn-campo"><span>Provider</span>
                    <select className="stg-select" value={c.proveedor} onChange={cambiar('proveedor')}>
                        <option value="s3">S3 or S3-compatible</option>
                        <option value="gcs">Google Cloud Storage (HMAC key)</option>
                    </select>
                </label>
                <label className="ncn-campo"><span>Key id</span>
                    <input className="stg-input stg-input--mono" value={c.accessKeyId} onChange={cambiar('accessKeyId')} autoComplete="off" spellCheck={false} />
                </label>
                <label className="ncn-campo"><span>Secret</span>
                    <input className="stg-input stg-input--mono" type="password" value={c.secretKey} onChange={cambiar('secretKey')} autoComplete="new-password" />
                </label>
                {s3 && (
                    <>
                        <label className="ncn-campo"><span>Region <small>(optional)</small></span>
                            <input className="stg-input stg-input--mono" value={c.region} onChange={cambiar('region')} placeholder="us-east-1" spellCheck={false} />
                        </label>
                        <label className="ncn-campo"><span>Endpoint <small>(S3-compatible only)</small></span>
                            <input className="stg-input stg-input--mono" value={c.endpoint} onChange={cambiar('endpoint')} placeholder="storage.example.com" spellCheck={false} />
                        </label>
                        <label className="ncn-campo"><span>URL style</span>
                            <select className="stg-select" value={c.urlStyle} onChange={cambiar('urlStyle')}>
                                <option value="">Default</option>
                                <option value="path">Path (most S3-compatible servers)</option>
                                <option value="vhost">Virtual host</option>
                            </select>
                        </label>
                    </>
                )}
            </div>
            {error && <p className="stg-row-desc" role="alert" style={{ color: 'var(--feedback-error-text)' }}>{error}</p>}
            <div className="ncn-botones">
                <button className="stg-btn" type="button" onClick={() => { setAbierta(false); setError(null); }}>Cancel</button>
                <button className="stg-btn stg-btn--primary" type="button" onClick={guardar}
                    disabled={ocupado || !c.nombre.trim() || !c.accessKeyId || !c.secretKey}>
                    <LuCheck size={14} /> Save to the keychain
                </button>
            </div>
        </div>
    );
}
