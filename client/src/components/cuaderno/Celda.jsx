/**
 * Una celda de código: editor a la izquierda, resultado a la derecha.
 *
 * ## La cabecera dice qué deja detrás
 *
 * El nombre no es una etiqueta: es el de la vista que la celda pone en la sesión
 * al ejecutarse. Al lado, un distintivo apagado mientras esa vista **no exista
 * de verdad** —una vista existe porque alguien ejecutó la celda, no porque esté
 * escrita—, y encendido cuando el motor confirma que está viva.
 *
 * Una celda que no se puede envolver lo dice —«no deja vista»— sin tratarlo como
 * un fallo, porque no lo es: hay celdas que están para cargar o para escribir. Y
 * si escribe en el disco lo avisa aparte, porque eso no se deshace al cerrar.
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
 * 500 px, fijos. Si la consulta tiene cuarenta líneas, se desplaza por dentro:
 * la vía de escape es la pantalla completa, no que la celda crezca. Con
 * celdas que crecen, un cuaderno de veinte deja de poder recorrerse.
 */
import { memo, useCallback, useRef, useState } from 'react';
import {
    LuPlay, LuColumns2, LuCode, LuTable, LuTrash2, LuChevronUp, LuChevronDown, LuLoaderCircle,
    LuDatabase, LuLayers, LuTriangleAlert, LuHistory, LuMaximize2,
} from 'react-icons/lu';
import SqlEditor from '../SqlEditor';
import ResultsTable from '../ResultsTable';
import { MODOS } from './modos.js';

const Celda = ({
    celda,
    analisis,
    resultado,
    viva,             // la vista de esta celda existe AHORA en la sesion
    frescura,         // 'nunca' | 'dia' | 'cambiada' | 'arriba'
    enCiclo,          // esta celda y otra se leen entre si
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
    onAmpliar,
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

    /**
     * El punto de la izquierda. Cinco estados, no dos.
     *
     * Antes se deducía del resultado —había resultado o no lo había— y eso
     * mentía en el caso que importa: una celda ejecutada ayer, editada hoy y no
     * vuelta a ejecutar tiene su resultado ahí, tan verde como el de al lado, y
     * el número que enseña ya no es el que su consulta daría.
     */
    const estadoPunto = resultado?.error ? 'falla'
        : frescura === 'cambiada' || frescura === 'arriba' ? 'vieja'
            : frescura === 'dia' ? 'dia' : 'nunca';
    const tituloPunto = {
        falla: 'Falló',
        vieja: frescura === 'cambiada'
            ? 'Se editó después de ejecutarla: lo que se ve es de antes'
            : 'Algo de lo que depende cambió: lo que se ve es de antes',
        dia: 'Al día',
        nunca: 'Sin ejecutar',
    }[estadoPunto];
    const soloUno = modo !== MODOS.AMBOS;
    /** ¿Esta celda puede dejar una vista con el nombre de la celda? */
    const puedeDejarVista = !!analisis?.envolvible;

    return (
        <div
            ref={raiz}
            className={`cdn-celda${seleccionada ? ' cdn-celda--sel' : ''}`}
            onFocusCapture={() => onSeleccionar?.(celda.id)}
        >
            <div className="cdn-cab">
                <span className={`cdn-est cdn-est--${estadoPunto}`} title={tituloPunto} />
                {/* El nombre se escribe aquí y NO en el SQL: es el de la vista
                    que la celda deja puesta al ejecutarse. Si se deja en blanco
                    se bautiza sola al ejecutar. */}
                <input
                    className="cdn-nombre"
                    value={celda.nombre || ''}
                    placeholder="sin nombre"
                    spellCheck={false}
                    onChange={(e) => onCambiar(celda.id, { nombre: e.target.value.trim() })}
                    title={celda.nombre
                        ? `La siguiente celda puede escribir FROM ${celda.nombre}`
                        : 'Se le pondrá uno al ejecutar'}
                />
                {/* Qué deja esta celda detrás. Apagado mientras no exista de
                    verdad: una vista existe porque alguien ejecutó la celda, no
                    porque esté escrita, y pintarla igual sería prometer algo
                    que la siguiente celda no podría leer. */}
                {puedeDejarVista && (
                    <span
                        className={`cdn-deja${viva ? ' cdn-deja--viva' : ''}`}
                        title={viva
                            ? `${celda.materializada ? 'Tabla' : 'Vista'} viva en la sesión`
                            : 'Aún no existe: ejecuta la celda'}
                    >
                        {celda.materializada ? <LuDatabase size={11} /> : <LuLayers size={11} />}
                        {celda.materializada ? 'tabla' : 'vista'}
                    </span>
                )}
                {/* Lo que no se puede envolver no deja nada, y eso no es un
                    fallo: hay celdas que están para cargar o para escribir. */}
                {analisis && !analisis.vacia && !puedeDejarVista && !analisis.vistaPropia && (
                    <span className="cdn-deja cdn-deja--nada" title={
                        analisis.sentencias > 1
                            ? 'Varias sentencias: se ejecutan tal cual'
                            : 'No es una consulta: se ejecuta tal cual'
                    }>no deja vista</span>
                )}
                {/* Que algo esté viejo se dice con palabras, no sólo con un
                    color: el punto se ve de lejos, pero no explica por qué. */}
                {(frescura === 'cambiada' || frescura === 'arriba') && (
                    <span className="cdn-deja cdn-deja--vieja" title={tituloPunto}>
                        <LuHistory size={11} />
                        {frescura === 'cambiada' ? 'editada' : 'desfasada'}
                    </span>
                )}
                {/* Un ciclo no tiene un orden correcto, así que «Actualizar» no
                    puede prometer nada sobre estas dos celdas. Mejor decirlo. */}
                {enCiclo && (
                    <span className="cdn-deja cdn-deja--escribe" title="Esta celda y otra se leen entre sí: no hay un orden correcto para ejecutarlas">
                        <LuTriangleAlert size={11} />
                        en bucle
                    </span>
                )}
                {/* Escribir en el disco no se deshace al cerrar, y la diferencia
                    con dejar una vista en la sesión es justo la que importa. */}
                {analisis?.escribe === 'disco' && (
                    <span className="cdn-deja cdn-deja--escribe" title="Esta celda modifica datos guardados, no sólo la sesión">
                        <LuTriangleAlert size={11} />
                        escribe
                    </span>
                )}
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

                {/* Materializar. Una vista es PEREZOSA: leerla vuelve a ejecutar
                    su cadena entera, asi que un paso caro del que cuelgan otros
                    cinco se paga cinco veces. Materializar lo cobra una vez —a
                    cambio de que el resultado pueda quedarse viejo, que es
                    exactamente lo que una vista nunca puede. */}
                {puedeDejarVista && (
                    <div className="cdn-grupo">
                        <button
                            type="button"
                            className={`cdn-btn cdn-btn--icono${celda.materializada ? ' cdn-btn--on' : ''}`}
                            onClick={() => onCambiar(celda.id, { materializada: !celda.materializada })}
                            title={celda.materializada
                                ? 'Materializada: el resultado se guarda. Vuelve a ejecutarla si cambian los datos de origen'
                                : 'Materializar: guarda el resultado en vez de recalcularlo cada vez que se lea'}
                        ><LuDatabase size={13} /></button>
                    </div>
                )}

                {/* La vía de escape del alto fijo. La celda no crece: se pide
                    la pantalla entera para la que se está trabajando. */}
                <div className="cdn-grupo">
                    <button
                        type="button"
                        className="cdn-btn cdn-btn--icono"
                        onClick={() => onAmpliar?.(celda.id)}
                        title="Ocupar la pestaña entera"
                    ><LuMaximize2 size={13} /></button>
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
                style={soloUno ? undefined : { '--cdn-izq': `${reparto}fr`, '--cdn-der': `${1 - reparto}fr` }}
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
