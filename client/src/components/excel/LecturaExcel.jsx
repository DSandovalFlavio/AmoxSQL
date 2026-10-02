/**
 * Cómo se lee un Excel (C2): la hoja tal como es para marcar el rango, las
 * opciones, y lo que sale de verdad con esas opciones —columnas con su tipo y
 * las primeras filas—. Lo usan el diálogo de importar y el formulario de una
 * fuente, así que las dos cosas se eligen igual.
 *
 * `opciones` = { rango, encabezado, normalizar, rellenar }. La hoja (o las
 * hojas que se unen) la decide quien lo usa y llega en `hoja` / `hojas`.
 */
import { useEffect, useState } from 'react';
import { LuCheck, LuTriangleAlert, LuLoader, LuArrowDownToLine } from 'react-icons/lu';
import SelectorDeRango from './SelectorDeRango';
import { probarLectura } from './api';

export default function LecturaExcel({ ruta, hoja = null, hojas = null, opciones, onOpciones, onResultado }) {
    const [resultado, setResultado] = useState(null);
    const [error, setError] = useState(null);
    const [leyendo, setLeyendo] = useState(false);
    const [rangoEscrito, setRangoEscrito] = useState(opciones.rango || '');

    useEffect(() => { setRangoEscrito(opciones.rango || ''); }, [opciones.rango]);

    const cambiar = (parcial) => onOpciones({ ...opciones, ...parcial });
    const clave = JSON.stringify({ ruta, hoja, hojas, opciones });

    // Leer de verdad con lo elegido; un poco después del último cambio.
    useEffect(() => {
        if (!ruta) return;
        let vivo = true;
        const t = setTimeout(() => {
            setLeyendo(true);
            probarLectura(ruta, { ...opciones, hoja: hoja || undefined, hojas: hojas && hojas.length > 1 ? hojas : undefined })
                .then(r => { if (vivo) { setResultado(r); setError(null); onResultado?.(r); } })
                .catch(e => { if (vivo) { setResultado(null); setError(e.message); onResultado?.(null); } })
                .finally(() => { if (vivo) setLeyendo(false); });
        }, 250);
        return () => { vivo = false; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave]);

    const rellenar = opciones.rellenar || [];
    const alternarRelleno = (c) => cambiar({ rellenar: rellenar.includes(c) ? rellenar.filter(x => x !== c) : [...rellenar, c] });

    return (
        <div className="xle">
            <SelectorDeRango ruta={ruta} hoja={hoja || (hojas && hojas[0]) || null} rango={opciones.rango}
                onRango={(r) => cambiar({ rango: r })} />

            <div className="xle-opciones">
                <label className="fnt-campo xle-rango">
                    <span className="fnt-etiqueta">Range</span>
                    <input className="wsx-input wsx-input--corto fnt-mono" value={rangoEscrito} spellCheck={false}
                        placeholder="Whole sheet"
                        onChange={e => setRangoEscrito(e.target.value.toUpperCase())}
                        onBlur={() => { if (rangoEscrito !== (opciones.rango || '')) cambiar({ rango: rangoEscrito.trim() || undefined }); }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                </label>
                <label className="wsx-check">
                    <input type="checkbox" checked={opciones.encabezado !== false} onChange={e => cambiar({ encabezado: e.target.checked ? undefined : false })} />
                    The first row of the range holds the column names
                </label>
                <label className="wsx-check">
                    <input type="checkbox" checked={!!opciones.normalizar} onChange={e => cambiar({ normalizar: e.target.checked || undefined, rellenar: [] })} />
                    Clean column names (lowercase, no spaces)
                </label>
            </div>

            {resultado && resultado.columnas.length > 0 && (
                <div className="xle-relleno">
                    <span className="fnt-etiqueta"><LuArrowDownToLine size={11} /> Fill down</span>
                    <span className="fnt-nota">Merged cells arrive filled only in their first row. Pick the columns whose empty cells take the value above.</span>
                    <div className="xle-chips">
                        {resultado.columnas.filter(c => c.nombre !== '_hoja').map(c => (
                            <button key={c.nombre} type="button"
                                className={`xle-chip${rellenar.includes(c.nombre) ? ' xle-chip--on' : ''}`}
                                aria-pressed={rellenar.includes(c.nombre)}
                                onClick={() => alternarRelleno(c.nombre)}>{c.nombre}</button>
                        ))}
                    </div>
                </div>
            )}

            {error && <p className="wsx-error fnt-error"><LuTriangleAlert size={13} /> {error}</p>}
            {resultado && (
                <div className="fnt-vista">
                    <div className="fnt-vista-titulo">
                        {leyendo ? <LuLoader size={13} className="stg-spin" /> : <LuCheck size={13} />}
                        {resultado.columnas.length} columns · first {resultado.filas.length} rows, as they will be read
                    </div>
                    <div className="fnt-vista-tabla">
                        <table>
                            <thead><tr>{resultado.columnas.map(c => <th key={c.nombre} title={c.tipo}>{c.nombre}<small>{c.tipo.toLowerCase()}</small></th>)}</tr></thead>
                            <tbody>
                                {resultado.filas.map((f, i) => (
                                    <tr key={i}>{resultado.columnas.map(c => <td key={c.nombre}>{f[c.nombre] === null || f[c.nombre] === undefined ? <span className="fnt-nulo">null</span> : String(f[c.nombre])}</td>)}</tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
