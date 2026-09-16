/**
 * Una celda de código: editor a la izquierda, resultado a la derecha.
 *
 * ## El mando de tres posiciones
 *
 * Código y resultado / sólo código / sólo resultado. Existe porque **no siempre
 * quieres lo mismo**: mientras escribes quieres las dos mitades; al repasar el
 * análisis, sólo los resultados; al revisar la lógica de un `CASE`, sólo el
 * código. Hoy eso se resolvía arrastrando una caja de 300 px, que es pedirle al
 * usuario que haga a mano lo que la aplicación puede decidir con un botón.
 *
 * Se recuerda, y **con él se recuerda si el resultado estaba en tabla o en
 * gráfico** — volver a un cuaderno y encontrarse todas las figuras convertidas
 * en tablas es perder el trabajo de haberlas configurado.
 *
 * ## La altura no es negociable
 *
 * 280 px, fijos. Si la consulta tiene cuarenta líneas, se desplaza por dentro:
 * la vía de escape es la pantalla completa (fase 5), no que la celda crezca. Con
 * celdas que crecen, un cuaderno de veinte deja de poder recorrerse.
 */
import { memo, useCallback, useRef, useState } from 'react';
import {
    LuPlay, LuColumns2, LuCode, LuTable, LuTrash2, LuChevronUp, LuChevronDown, LuLoaderCircle,
} from 'react-icons/lu';
import SqlEditor from '../SqlEditor';
import ResultsTable from '../ResultsTable';
import { MODOS } from './modos.js';

const Celda = ({
    celda,
    analisis,
    resultado,
    estado = {},
    seleccionada,
    corriendo,
    theme,
    editorSettings,
    onCambiar,        // (id, campos)
    onEstado,         // (id, parcial)
    onEjecutar,       // (id)
    onBorrar,
    onSubir,
    onBajar,
    onSeleccionar,
    onCreateNew,
}) => {
    const modo = estado.modo || MODOS.AMBOS;
    const reparto = estado.reparto ?? 0.5;
    const raiz = useRef(null);
    const [arrastrando, setArrastrando] = useState(false);

    /**
     * El tirador mueve el reparto de ESTA celda, no el del documento.
     *
     * Dos celdas distintas piden cosas distintas: una consulta larga con un
     * resultado de dos columnas no quiere el mismo reparto que una consulta de
     * tres líneas con una tabla ancha.
     */
    const empezarArrastre = useCallback((e) => {
        e.preventDefault();
        const cuerpo = raiz.current?.querySelector('.cdn-cuerpo');
        if (!cuerpo) return;
        setArrastrando(true);
        const mover = (ev) => {
            const caja = cuerpo.getBoundingClientRect();
            const apilado = window.innerWidth <= 1080;
            const frac = apilado
                ? (ev.clientY - caja.top) / caja.height
                : (ev.clientX - caja.left) / caja.width;
            onEstado(celda.id, { reparto: Math.min(0.85, Math.max(0.15, frac)) });
        };
        const soltar = () => {
            setArrastrando(false);
            window.removeEventListener('mousemove', mover);
            window.removeEventListener('mouseup', soltar);
        };
        window.addEventListener('mousemove', mover);
        window.addEventListener('mouseup', soltar);
    }, [celda.id, onEstado]);

    const estadoPunto = resultado?.error ? 'falla' : resultado ? 'dia' : 'nunca';
    const soloUno = modo !== MODOS.AMBOS;

    return (
        <div
            ref={raiz}
            className={`cdn-celda${seleccionada ? ' cdn-celda--sel' : ''}`}
            onFocusCapture={() => onSeleccionar?.(celda.id)}
        >
            <div className="cdn-cab">
                <span className={`cdn-est cdn-est--${estadoPunto}`} title={
                    estadoPunto === 'falla' ? 'Falló' : estadoPunto === 'dia' ? 'Ejecutada' : 'Sin ejecutar'
                } />
                {/* El nombre se escribe aquí y no en el SQL. En la fase 2 será el
                    de la vista que la celda crea sola; por ahora es la etiqueta
                    con la que aparece en el cuaderno. */}
                <input
                    className="cdn-nombre"
                    value={celda.nombre || ''}
                    placeholder="sin nombre"
                    spellCheck={false}
                    onChange={(e) => onCambiar(celda.id, { nombre: e.target.value.trim() })}
                    title="El nombre de esta celda"
                />
                {/* La descripción sale del comentario de cabecera de la consulta:
                    no se escribe dos veces. */}
                {analisis?.comentario && (
                    <span className="cdn-desc" title={analisis.comentario}>
                        {analisis.comentario.split('\n')[0]}
                    </span>
                )}
                <span className="cdn-sp" />

                <div className="cdn-grupo">
                    <button
                        type="button"
                        className={`cdn-btn cdn-btn--icono${modo === MODOS.AMBOS ? ' cdn-btn--on' : ''}`}
                        onClick={() => onEstado(celda.id, { modo: MODOS.AMBOS })}
                        title="Código y resultado"
                    ><LuColumns2 size={13} /></button>
                    <button
                        type="button"
                        className={`cdn-btn cdn-btn--icono${modo === MODOS.CODIGO ? ' cdn-btn--on' : ''}`}
                        onClick={() => onEstado(celda.id, { modo: MODOS.CODIGO })}
                        title="Sólo el código"
                    ><LuCode size={13} /></button>
                    <button
                        type="button"
                        className={`cdn-btn cdn-btn--icono${modo === MODOS.RESULTADO ? ' cdn-btn--on' : ''}`}
                        onClick={() => onEstado(celda.id, { modo: MODOS.RESULTADO })}
                        title="Sólo el resultado"
                    ><LuTable size={13} /></button>
                </div>

                <div className="cdn-grupo">
                    <button type="button" className="cdn-btn cdn-btn--icono" onClick={() => onSubir(celda.id)} title="Subir"><LuChevronUp size={13} /></button>
                    <button type="button" className="cdn-btn cdn-btn--icono" onClick={() => onBajar(celda.id)} title="Bajar"><LuChevronDown size={13} /></button>
                    <button type="button" className="cdn-btn cdn-btn--icono" onClick={() => onBorrar(celda.id)} title="Borrar"><LuTrash2 size={12} /></button>
                </div>

                <div className="cdn-grupo">
                    <button
                        type="button"
                        className="cdn-btn cdn-btn--corre"
                        onClick={() => onEjecutar(celda.id)}
                        disabled={corriendo || analisis?.vacia}
                        title="Ejecutar (Ctrl+Enter)"
                    >
                        {corriendo ? <LuLoaderCircle size={12} className="spin" /> : <LuPlay size={12} />}
                        Ejecutar
                    </button>
                </div>
            </div>

            <div
                className={`cdn-cuerpo${soloUno ? ' cdn-cuerpo--solo' : ''}`}
                style={soloUno ? undefined : { '--cdn-reparto': `${reparto}fr` }}
            >
                {modo !== MODOS.RESULTADO && (
                    <div className="cdn-editor">
                        <SqlEditor
                            tabId={celda.id}
                            value={celda.contenido}
                            language="sql"
                            onChange={(v) => onCambiar(celda.id, { contenido: v ?? '' })}
                            onRunQuery={() => onEjecutar(celda.id)}
                            theme={theme}
                            editorSettings={editorSettings}
                        />
                    </div>
                )}

                {modo === MODOS.AMBOS && (
                    <div
                        className="cdn-tirador"
                        onMouseDown={empezarArrastre}
                        style={arrastrando ? { background: 'var(--hover-bg)' } : undefined}
                    />
                )}

                {modo !== MODOS.CODIGO && (
                    <div className="cdn-res">
                        {resultado?.error ? (
                            <div className="cdn-error">{resultado.error}</div>
                        ) : resultado?.data ? (
                            <ResultsTable
                                data={resultado.data}
                                types={resultado.types}
                                executionTime={resultado.executionTime}
                                query={resultado.consulta || celda.contenido}
                                editorSettings={editorSettings}
                                truncated={resultado.truncated}
                                rowLimit={resultado.rowLimit}
                                onCreateNew={onCreateNew}
                                initialViewMode={estado.vista || null}
                                initialChartConfig={estado.grafico || null}
                                onViewModeChange={(v) => onEstado(celda.id, { vista: v })}
                                onConfigChange={(cfg) => onEstado(celda.id, { grafico: cfg })}
                            />
                        ) : (
                            <div className="cdn-vacio">Sin ejecutar</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default memo(Celda);
