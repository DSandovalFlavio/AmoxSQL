/**
 * «Other projects» en el explorador de base (5.14, J1; Dec-51).
 *
 * Cruzar con los datos de un proyecto hermano sin cerrar el tuyo: **Look at
 * another project…** lista los del mismo workspace que tienen base; al elegir
 * uno, su base se adjunta en sólo lectura con su nombre y sus tablas salen aquí,
 * listas para arrastrar como `"cierre_norte".main.ventas`. Dura lo que la sesión.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    LuFolderTree, LuChevronRight, LuChevronDown, LuPlus, LuClipboard, LuCode, LuX, LuTable, LuEye, LuLock,
} from 'react-icons/lu';
import { useToast } from './ToastProvider';
import { API_BASE } from '../api.js';
import { useEtiqueta } from '../etiqueta';

const ident = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${String(s).replace(/"/g, '""')}"`);
const ref = (alias, t) => `"${alias}".${ident(t.esquema)}.${ident(t.nombre)}`;

async function pedir(ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, cuerpo === undefined ? undefined : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
}

export default function OtrosProyectos({ onSelectQuery, refresco, busqueda = '', getTypeMeta }) {
    const [lista, setLista] = useState({ workspace: null, proyectos: [] });
    const [tablas, setTablas] = useState({});          // alias → [{ esquema, nombre, tipo, columnas }]
    const [abierta, setAbierta] = useState(true);
    const [abiertas, setAbiertas] = useState({});      // `${alias}.${esquema}.${tabla}` → bool
    const [eligiendo, setEligiendo] = useState(null);  // { x, y }
    const [menu, setMenu] = useState(null);            // { x, y, alias, tabla }
    const [ocupado, setOcupado] = useState(null);
    const toast = useToast();
    const e = useEtiqueta();

    const cargar = useCallback(async () => {
        try {
            const d = await pedir('/api/proyecto/hermanos');
            setLista(d);
            const adjuntos = d.proyectos.filter(p => p.adjunto);
            const pares = await Promise.all(adjuntos.map(p => pedir(`/api/proyecto/hermanos/tablas?alias=${encodeURIComponent(p.alias)}`)
                .then(r => [p.alias, r.tablas]).catch(() => [p.alias, []])));
            setTablas(Object.fromEntries(pares));
        } catch { /* sin proyecto o sin base central: la sección no sale */ }
    }, []);

    useEffect(() => { cargar(); }, [cargar, refresco]);
    useEffect(() => {
        const cerrar = () => { setMenu(null); setEligiendo(null); };
        document.addEventListener('click', cerrar);
        return () => document.removeEventListener('click', cerrar);
    }, []);

    const mirar = async (p) => {
        setEligiendo(null);
        setOcupado(p.ruta);
        try {
            const r = await pedir('/api/proyecto/hermanos/mirar', { ruta: p.ruta });
            setTablas(t => ({ ...t, [r.alias]: r.tablas }));
            setAbierta(true);
            await cargar();
            toast.success(`${p.nombre} is attached read-only as "${r.alias}"`);
        } catch (err) { toast.error(err.message); }
        finally { setOcupado(null); }
    };

    const soltar = async (alias) => {
        try { await pedir('/api/proyecto/hermanos/soltar', { alias }); await cargar(); }
        catch (err) { toast.error(err.message); }
    };

    const adjuntos = lista.proyectos.filter(p => p.adjunto);
    const candidatos = lista.proyectos.filter(p => !p.adjunto);
    if (!lista.workspace || !lista.proyectos.length) return null;

    const q = busqueda.trim().toLowerCase();
    const filtrar = (ts) => (ts || []).filter(t => !q || t.nombre.toLowerCase().includes(q) || t.columnas.some(c => c.nombre.toLowerCase().includes(q)));
    if (q && !adjuntos.some(p => filtrar(tablas[p.alias]).length)) return null;

    return (
        <div className="db-schema-group otp-grupo">
            <div className="db-schema-row" onClick={() => setAbierta(a => !a)}>
                <div className="db-chevron">{abierta || q ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}</div>
                <LuFolderTree size={13} className="db-schema-icon otp-icono" />
                <span className="db-schema-name">Other projects</span>
                {adjuntos.length > 0 && <span className="db-schema-count">{adjuntos.length}</span>}
                <button className="db-schema-er-btn" title={`Look at another project of ${lista.workspace.nombre || `this ${e.s}`}… (read-only)`}
                    onClick={(ev) => { ev.stopPropagation(); const b = ev.currentTarget.getBoundingClientRect(); setEligiendo({ x: b.left, y: b.bottom + 4 }); }}>
                    <LuPlus size={13} />
                </button>
            </div>

            {(abierta || q) && (
                <div className="db-schema-children tree-reveal">
                    {!adjuntos.length && (
                        <div className="fnt-vacio">
                            Cross with the data of another project of {lista.workspace.nombre || `this ${e.s}`}, read-only.{' '}
                            <button type="button" className="fnt-enlace" onClick={(ev) => { ev.stopPropagation(); const b = ev.currentTarget.getBoundingClientRect(); setEligiendo({ x: b.left, y: b.bottom + 4 }); }}>Look at another project…</button>
                        </div>
                    )}
                    {adjuntos.map(p => {
                        const ts = filtrar(tablas[p.alias]);
                        return (
                            <div key={p.alias} className="otp-proyecto">
                                <div className="db-table-row otp-cabeza" title={`${p.nombre} · ${p.base}\nRead-only: query it as "${p.alias}".main.<table>`}>
                                    <LuLock size={12} className="otp-candado" />
                                    <span className="db-table-name">{p.alias}</span>
                                    {p.alias !== p.nombre && <span className="otp-nombre">{p.nombre}</span>}
                                    <span className="db-copy-btn" onClick={() => soltar(p.alias)} title="Stop looking (detach it)"><LuX size={12} /></span>
                                </div>
                                {!ts.length && <div className="fnt-vacio">No tables.</div>}
                                {ts.map(t => {
                                    const k = `${p.alias}.${t.esquema}.${t.nombre}`;
                                    const expandida = !!abiertas[k] || (q && !t.nombre.toLowerCase().includes(q));
                                    const r = ref(p.alias, t);
                                    return (
                                        <div key={k} className="db-table-item">
                                            <div
                                                className="db-table-row otp-tabla"
                                                draggable
                                                onDragStart={(ev) => {
                                                    ev.dataTransfer.setData('text/plain', r);
                                                    ev.dataTransfer.setData('application/json', JSON.stringify({ type: 'table', name: t.nombre, schema: t.esquema, ref: r }));
                                                }}
                                                onClick={() => setAbiertas(a => ({ ...a, [k]: !a[k] }))}
                                                onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); setMenu({ x: ev.clientX, y: ev.clientY, ref: r }); }}
                                                title={`${r}\nDrag to the editor or right click for options`}
                                            >
                                                <div className="db-chevron">{expandida ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}</div>
                                                {/VIEW/i.test(t.tipo) ? <LuEye size={14} /> : <LuTable size={14} />}
                                                <span className="db-table-name">{t.esquema === 'main' ? t.nombre : `${t.esquema}.${t.nombre}`}</span>
                                                <span className="db-copy-btn" onClick={(ev) => { ev.stopPropagation(); navigator.clipboard.writeText(r); }} title="Copy reference">
                                                    <LuClipboard size={12} />
                                                </span>
                                            </div>
                                            {expandida && (
                                                <div className="db-columns tree-reveal">
                                                    {t.columnas.map((c, i) => {
                                                        const meta = getTypeMeta ? getTypeMeta(c.tipo) : null;
                                                        return (
                                                            <div key={`${c.nombre}-${i}`} className="db-column-row" draggable
                                                                onDragStart={(ev) => { ev.dataTransfer.setData('text/plain', c.nombre); ev.stopPropagation(); }}>
                                                                <div className="db-column-left">
                                                                    {meta && <div className="db-column-icon" style={{ color: meta.color }}>{meta.icon}</div>}
                                                                    <span className="db-column-name">{c.nombre}</span>
                                                                </div>
                                                                <div className="db-column-right">
                                                                    <span className="db-column-type">{String(c.tipo).toLowerCase()}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* En un portal: la barra lateral recorta y desplaza lo que es `fixed` dentro de ella. */}
            {eligiendo && createPortal((
                <div className="ctx-menu otp-elegir" style={{ top: eligiendo.y, left: eligiendo.x }} onClick={(ev) => ev.stopPropagation()}>
                    <div className="otp-elegir-titulo">Look at another project (read-only)</div>
                    {!candidatos.length && <div className="otp-elegir-nada">You are already looking at all of them.</div>}
                    {candidatos.map(p => (
                        <div
                            key={p.ruta}
                            className={`ctx-menu-item${p.base && !p.esLaAbierta ? '' : ' otp-no'}`}
                            onClick={() => { if (p.base && !p.esLaAbierta && !ocupado) mirar(p); }}
                            title={p.ruta}
                        >
                            <LuFolderTree size={14} />
                            <span className="otp-elegir-nombre">{p.nombre}</span>
                            <span className="otp-elegir-meta">{ocupado === p.ruta ? 'Attaching…' : p.esLaAbierta ? 'same database as this one' : (p.base || p.motivo)}</span>
                        </div>
                    ))}
                </div>
            ), document.body)}

            {menu && createPortal((
                <div className="ctx-menu" style={{ top: menu.y, left: menu.x }}>
                    <div className="ctx-menu-item" onClick={() => { onSelectQuery?.(`SELECT * FROM ${menu.ref} LIMIT 100; `); setMenu(null); }}>
                        <LuCode size={14} /> Select Top 100
                    </div>
                    <div className="ctx-menu-item" onClick={() => { navigator.clipboard.writeText(menu.ref); setMenu(null); }}>
                        <LuClipboard size={14} /> Copy reference
                    </div>
                </div>
            ), document.body)}
        </div>
    );
}
