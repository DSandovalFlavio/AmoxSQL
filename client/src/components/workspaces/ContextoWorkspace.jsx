/**
 * El contexto de un workspace (B2, 7.2): sus archivos de texto —reglas,
 * métricas, joins, glosario, ejemplos y skills—, editables sin proyecto
 * abierto. Valen para todos sus proyectos; cada proyecto puede sobrescribir
 * por nombre.
 *
 * Y, con un proyecto abierto, «Share» sube una de sus métricas aquí: es la
 * forma natural de pasar lo que ya existe a nivel de cliente.
 */
import { useCallback, useEffect, useState } from 'react';
import { LuX, LuSave, LuPlus, LuFileText, LuShare2, LuLoader } from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { useEtiqueta } from '../../etiqueta';

const QUE_ES = {
    'RULES.md': 'Rules for the assistant',
    'contexto/metrics.yml': 'Metrics',
    'contexto/joins.yml': 'Canonical joins',
    'contexto/glossary.md': 'Glossary',
};
const describir = (ruta) => QUE_ES[ruta]
    || (ruta.startsWith('contexto/examples/') ? `Example · ${ruta.split('/').pop()}` : null)
    || (ruta.startsWith('skills/') ? `Skill · ${ruta.split('/')[1]}` : ruta);

const PLANTILLAS = {
    'RULES.md': '# Rules\n\n- \n',
    'contexto/metrics.yml': 'metrics:\n  - name: revenue\n    sql: "SUM(amount)"\n    description: \n',
    'contexto/joins.yml': 'joins:\n  - from: orders\n    to: customers\n    on: "orders.customer_id = customers.id"\n    type: LEFT\n',
    'contexto/glossary.md': '# Glossary\n\n- **Term**: meaning\n',
};

async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, {
        method: metodo,
        headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
}

export default function ContextoWorkspace({ workspace, onClose }) {
    const e = useEtiqueta();
    const base = `/api/workspaces/${encodeURIComponent(workspace.id)}/contexto`;
    const [archivos, setArchivos] = useState(null);
    const [ruta, setRuta] = useState('RULES.md');
    const [texto, setTexto] = useState('');
    const [guardado, setGuardado] = useState('');
    const [nuevo, setNuevo] = useState(null);         // 'ejemplo' | 'skill' | null
    const [nombreNuevo, setNombreNuevo] = useState('');
    const [metricas, setMetricas] = useState([]);
    const [aviso, setAviso] = useState(null);
    const sucio = texto !== guardado;

    const cargarLista = useCallback(() => pedir('GET', base).then(d => setArchivos(d.archivos)).catch(err => setAviso(err.message)), [base]);

    const abrir = useCallback(async (r) => {
        setRuta(r); setAviso(null);
        try {
            const d = await pedir('GET', `${base}/archivo?ruta=${encodeURIComponent(r)}`);
            const t = d.texto || '';
            setGuardado(t);
            setTexto(t || PLANTILLAS[r] || '');
        } catch (err) { setAviso(err.message); }
    }, [base]);

    useEffect(() => {
        cargarLista();
        abrir('RULES.md');
        pedir('GET', '/api/project/metricas').then(d => setMetricas(d.metricas || [])).catch(() => {});
    }, [cargarLista, abrir]);

    const guardar = async () => {
        try {
            await pedir('PUT', `${base}/archivo`, { ruta, texto });
            setGuardado(texto);
            setAviso('Saved.');
            cargarLista();
        } catch (err) { setAviso(err.message); }
    };

    const crear = () => {
        const n = nombreNuevo.trim().toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
        if (!n) return;
        const r = nuevo === 'skill' ? `skills/${n}/SKILL.md` : `contexto/examples/${n}.sql`;
        const plantilla = nuevo === 'skill'
            ? `---\nname: ${nombreNuevo.trim()}\ndescription: When to use this skill\nkeywords: [${n}]\n---\n# ${nombreNuevo.trim()}\n\n1. \n`
            : `-- Q: The question this query answers\nSELECT 1;\n`;
        setRuta(r); setGuardado(''); setTexto(plantilla);
        setNuevo(null); setNombreNuevo('');
    };

    const compartir = async (nombre) => {
        try {
            await pedir('POST', `${base}/subir-metrica`, { nombre });
            setAviso(`“${nombre}” now applies to every project of this ${e.s}.`);
            if (ruta === 'contexto/metrics.yml') abrir(ruta);
            cargarLista();
        } catch (err) { setAviso(err.message); }
    };

    const lista = archivos || [];
    const enLista = lista.some(a => a.ruta === ruta);

    return (
        <div className="ww-backdrop">
            <div className="ww-card wsx-card wsx-card--contexto" role="dialog" aria-modal="true" aria-labelledby="wsx-contexto-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuFileText size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="wsx-contexto-titulo">Context of {workspace.nombre}</h2>
                        <p className="ww-subtitle">
                            It applies to every project of this {e.s}. A project can override a metric or a skill by using the same name.
                        </p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={onClose} title="Close"><LuX size={16} /></button>
                </div>

                <div className="wsx-contexto">
                    <nav className="wsx-contexto-lista" aria-label="Context files">
                        {archivos === null && <LuLoader size={14} className="stg-spin" />}
                        {lista.map(a => (
                            <button key={a.ruta} type="button"
                                className={`wsx-contexto-archivo ${a.ruta === ruta ? 'wsx-contexto-archivo--on' : ''} ${a.existe ? '' : 'wsx-contexto-archivo--vacio'}`}
                                onClick={() => abrir(a.ruta)}>
                                <span>{describir(a.ruta)}</span>
                                <small>{a.existe ? a.ruta : 'empty'}</small>
                            </button>
                        ))}
                        {!enLista && <div className="wsx-contexto-archivo wsx-contexto-archivo--on"><span>{describir(ruta)}</span><small>new</small></div>}
                        {nuevo ? (
                            <div className="wsx-contexto-nuevo">
                                <input className="wsx-input" autoFocus value={nombreNuevo} placeholder={nuevo === 'skill' ? 'Skill name' : 'Example name'}
                                    onChange={ev => setNombreNuevo(ev.target.value)}
                                    onKeyDown={ev => { if (ev.key === 'Enter') crear(); if (ev.key === 'Escape') setNuevo(null); }} />
                            </div>
                        ) : (
                            <div className="wsx-contexto-nuevo">
                                <button type="button" className="stg-btn" onClick={() => setNuevo('ejemplo')}><LuPlus size={12} /> Example</button>
                                <button type="button" className="stg-btn" onClick={() => setNuevo('skill')}><LuPlus size={12} /> Skill</button>
                            </div>
                        )}
                    </nav>

                    <div className="wsx-contexto-editor">
                        <div className="wsx-contexto-barra">
                            <code>{ruta}</code>
                            <button className="stg-btn stg-btn--primary" type="button" disabled={!sucio && enLista} onClick={guardar}>
                                <LuSave size={13} /> Save
                            </button>
                        </div>
                        <textarea className="wsx-contexto-texto" spellCheck={false} value={texto}
                            onChange={ev => setTexto(ev.target.value)}
                            onKeyDown={ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') { ev.preventDefault(); guardar(); } }}
                            aria-label={`Contents of ${ruta}`} />
                        {aviso && <p className="wsx-letra" role="status">{aviso}</p>}
                    </div>
                </div>

                {metricas.length > 0 && (
                    <div className="wsx-compartir">
                        <span className="wsx-bloque-titulo"><LuShare2 size={13} /> Share a metric from the open project</span>
                        <div className="wsx-compartir-lista">
                            {metricas.map(m => (
                                <button key={m.name} type="button" className="stg-btn" title={m.description || m.name} onClick={() => compartir(m.name)}>
                                    {m.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
