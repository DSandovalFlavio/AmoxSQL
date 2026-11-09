import { useEffect, useState } from 'react';
import { LuVariable, LuPlus, LuPencil, LuTrash2, LuChevronDown, LuChevronRight } from 'react-icons/lu';
import { cargarVariables, guardarVariables, TIPOS, etiquetaDeTipo, valorEnTexto } from '../utils/variablesProyecto';

/**
 * La sección Variables de SQL Snippets (6.0, Dec-98): las variables del proyecto,
 * documentadas, para usarlas en cualquier consulta como `$nombre`. Es la misma lista
 * que la barra Variables del editor.
 */
const VACIA = { nombre: '', tipo: 'texto', valor: '', descripcion: '' };

function Formulario({ inicial, onGuardar, onCancelar, error }) {
    const [v, setV] = useState(() => ({
        ...VACIA, ...inicial,
        valor: inicial?.tipo === 'lista' ? (inicial.valor || []).join(', ') : (inicial?.valor ?? ''),
    }));
    const poner = (k, x) => setV(p => ({ ...p, [k]: x }));
    return (
        <form className="vp-form" onSubmit={(e) => { e.preventDefault(); onGuardar(v); }}>
            <div className="vp-fila">
                <span className="vp-dolar">$</span>
                <input autoFocus className="vp-input vp-nombre" value={v.nombre} placeholder="name"
                    onChange={e => poner('nombre', e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} aria-label="Variable name" />
                <select className="vp-input vp-tipo" value={v.tipo} aria-label="Type"
                    onChange={e => poner('tipo', e.target.value)}>
                    {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
            </div>
            {v.tipo === 'logico' ? (
                <label className="vp-check">
                    <input type="checkbox" checked={v.valor === true || v.valor === 'true'} onChange={e => poner('valor', e.target.checked)} /> Yes
                </label>
            ) : (
                <input className="vp-input" type={v.tipo === 'fecha' ? 'date' : 'text'} value={v.valor ?? ''}
                    inputMode={v.tipo === 'numero' ? 'decimal' : undefined}
                    placeholder={v.tipo === 'lista' ? 'north, south, east' : v.tipo === 'numero' ? '100' : 'value'}
                    onChange={e => poner('valor', e.target.value)} aria-label="Value" />
            )}
            <input className="vp-input" value={v.descripcion || ''} placeholder="What it is (optional)"
                onChange={e => poner('descripcion', e.target.value)} aria-label="Description" />
            {error && <div className="vp-error" role="alert">{error}</div>}
            <div className="vp-acciones">
                <button type="button" className="vp-btn" onClick={onCancelar}>Cancel</button>
                <button type="submit" className="vp-btn vp-btn-primario" disabled={!v.nombre}>Save</button>
            </div>
        </form>
    );
}

export default function VariablesDelProyecto({ busqueda = '', onInsert }) {
    const [variables, setVariables] = useState([]);
    const [proyecto, setProyecto] = useState(true);
    const [abierta, setAbierta] = useState(true);
    const [editando, setEditando] = useState(null);     // null | 'nueva' | índice
    const [error, setError] = useState(null);

    useEffect(() => {
        cargarVariables().then(d => { setVariables(d.variables); setProyecto(d.proyecto); });
        const alCambiar = (e) => setVariables(e.detail?.variables || []);
        window.addEventListener('amox_variables', alCambiar);
        return () => window.removeEventListener('amox_variables', alCambiar);
    }, []);

    const guardar = async (lista) => {
        const r = await guardarVariables(lista);
        if (r.error) { setError(r.error); return false; }
        setError(null);
        setVariables(r.variables);
        setEditando(null);
        return true;
    };
    const alGuardar = (v, i) => guardar(i === 'nueva' ? [...variables, v] : variables.map((x, k) => (k === i ? v : x)));
    const borrar = (i) => guardar(variables.filter((_, k) => k !== i));

    const q = busqueda.trim().toLowerCase();
    const visibles = variables.map((v, i) => ({ v, i })).filter(({ v }) => !q
        || v.nombre.toLowerCase().includes(q) || (v.descripcion || '').toLowerCase().includes(q));
    if (!proyecto || (q && !visibles.length)) return null;

    return (
        <div className="vp">
            <div className="vp-cabecera" onClick={() => setAbierta(a => !a)}>
                {abierta ? <LuChevronDown size={10} /> : <LuChevronRight size={10} />}
                Variables
                <div className="vp-linea" />
                <span className="vp-cuenta">{variables.length}</span>
                <button type="button" className="vp-nueva" title="New variable"
                    onClick={(e) => { e.stopPropagation(); setAbierta(true); setError(null); setEditando('nueva'); }}>
                    <LuPlus size={12} />
                </button>
            </div>
            {abierta && (
                <>
                    {editando === 'nueva' && (
                        <Formulario onGuardar={(v) => alGuardar(v, 'nueva')} onCancelar={() => { setEditando(null); setError(null); }} error={error} />
                    )}
                    {!variables.length && editando !== 'nueva' && (
                        <p className="vp-vacia">
                            Declare a value once and use it in any query as <code>$name</code>, with its type and no quotes:
                            {' '}<code>WHERE region = $region</code>. It is saved with the project.
                        </p>
                    )}
                    {visibles.map(({ v, i }) => editando === i ? (
                        <Formulario key={v.nombre} inicial={v} onGuardar={(x) => alGuardar(x, i)} onCancelar={() => { setEditando(null); setError(null); }} error={error} />
                    ) : (
                        <div key={v.nombre} className="file-item vp-item" onClick={() => onInsert?.(`$${v.nombre}`)}
                            title={`Click to insert $${v.nombre}`}>
                            <div className="vp-item-fila">
                                <LuVariable size={12} color="var(--accent-primary)" />
                                <span className="vp-item-nombre">${v.nombre}</span>
                                <span className="vp-item-tipo">{etiquetaDeTipo(v.tipo)}</span>
                                <span className="vp-item-valor">{valorEnTexto(v)}</span>
                                <span className="vp-item-btns">
                                    <button type="button" title="Edit" onClick={e => { e.stopPropagation(); setError(null); setEditando(i); }}><LuPencil size={11} /></button>
                                    <button type="button" title="Delete" className="vp-borrar" onClick={e => { e.stopPropagation(); borrar(i); }}><LuTrash2 size={11} /></button>
                                </span>
                            </div>
                            {v.descripcion && <span className="vp-item-desc">{v.descripcion}</span>}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
