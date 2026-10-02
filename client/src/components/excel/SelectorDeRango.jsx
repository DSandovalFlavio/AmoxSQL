/**
 * Elegir sobre la hoja dónde empieza la tabla (C2, 2.3).
 *
 * Enseña la hoja tal como es —texto, con la letra de cada columna y el número
 * de cada fila— y deja marcar con dos clics lo que a una persona le cuesta
 * escribir: la fila de los encabezados (clic en su número) y la última columna
 * (clic en su letra). La primera columna es la primera con algo escrito en esa
 * fila. Por defecto se lee hasta la primera fila vacía; el rango se puede
 * escribir a mano igual.
 *
 * Las fechas se ven aquí como el número que guarda Excel: es la hoja sin
 * interpretar. La vista previa de lo elegido ya las enseña como fechas.
 */
import { useEffect, useState } from 'react';
import { LuLoader, LuTriangleAlert } from 'react-icons/lu';
import { vistaCruda, leerRango, escribirRango, columnaANumero } from './api';

export default function SelectorDeRango({ ruta, hoja, rango, onRango }) {
    const [vista, setVista] = useState(null);
    const [error, setError] = useState(null);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        if (!ruta) return;
        let vivo = true;
        setCargando(true); setError(null);
        vistaCruda(ruta, hoja || null)
            .then(v => { if (vivo) setVista(v); })
            .catch(e => { if (vivo) { setVista(null); setError(e.message); } })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [ruta, hoja]);

    const r = leerRango(rango);
    const dentro = (fila, letra) => {
        if (!r) return false;
        const c = columnaANumero(letra);
        return fila >= r.fila && (!r.filaFinal || fila <= r.filaFinal)
            && c >= columnaANumero(r.desde) && c <= columnaANumero(r.hasta);
    };

    /** Clic en el número de una fila: ahí están los encabezados. */
    const elegirFila = (i) => {
        const fila = i + 1;
        const valores = vista.filas[i] || [];
        const primera = valores.findIndex(v => v !== null && v !== '');
        let ultima = -1;
        valores.forEach((v, k) => { if (v !== null && v !== '') ultima = k; });
        const desde = vista.columnas[Math.max(primera, 0)];
        const hasta = r && columnaANumero(r.hasta) > columnaANumero(desde) ? r.hasta : vista.columnas[Math.max(ultima, 0)];
        onRango(escribirRango({ desde, fila, hasta, filaFinal: null }));
    };

    /** Clic en una letra: la última columna. */
    const elegirColumna = (letra) => {
        const base = r || { desde: vista.columnas[0], fila: 1, filaFinal: null };
        const desde = columnaANumero(letra) < columnaANumero(base.desde) ? letra : base.desde;
        onRango(escribirRango({ ...base, desde, hasta: letra }));
    };

    if (cargando && !vista) return <div className="xsr-estado"><LuLoader size={14} className="stg-spin" /> Reading the sheet…</div>;
    if (error) return <div className="xsr-estado xsr-estado--mal"><LuTriangleAlert size={14} /> {error}</div>;
    if (!vista) return null;
    if (!vista.columnas.length) return <div className="xsr-estado">This sheet is empty.</div>;

    return (
        <div className="xsr">
            <div className="xsr-ayuda">
                Click the <b>row number</b> where the column names are, and the <b>letter</b> of the last column.
                {r && <> Reading <code>{rango}</code>{r.filaFinal ? '' : ' down to the first empty row'}.</>}
            </div>
            <div className="xsr-hoja">
                <table>
                    <thead>
                        <tr>
                            <th className="xsr-esquina" />
                            {vista.columnas.map(l => (
                                <th key={l} className={`xsr-letra${r && l === r.hasta ? ' xsr-letra--fin' : ''}`}>
                                    <button type="button" onClick={() => elegirColumna(l)} title={`Last column: ${l}`}>{l}</button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {vista.filas.map((f, i) => {
                            const esEncabezado = r && r.fila === i + 1;
                            return (
                                <tr key={i} className={esEncabezado ? 'xsr-fila--encabezado' : ''}>
                                    <th className="xsr-num">
                                        <button type="button" onClick={() => elegirFila(i)} title={`The column names are in row ${i + 1}`}>{i + 1}</button>
                                    </th>
                                    {vista.columnas.map((l, k) => (
                                        <td key={l} className={dentro(i + 1, l) ? 'xsr-dentro' : ''}>{f[k] ?? ''}</td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {vista.recortada && <div className="xsr-pie">First {vista.filas.length} rows of the sheet.</div>}
        </div>
    );
}
