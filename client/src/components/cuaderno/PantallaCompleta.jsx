/**
 * Una celda sola, ocupando la pestaña entera.
 *
 * ## Para qué existe
 *
 * Porque la celda tiene un alto fijo **y eso no se negocia**: con celdas que crecen, un
 * cuaderno de veinte deja de poder recorrerse. La vía de escape no es que la
 * celda engorde, es pedir la pantalla entera para la que estás trabajando.
 *
 * Los dos estados sirven a cosas distintas y por eso conviven. En la lista se
 * **reconoce** un paso al pasar; aquí se **trabaja**: una consulta de cuarenta
 * líneas cabe, y «sólo resultado» es un gráfico del tamaño de la pantalla con
 * sitio para afinarlo antes de mandarlo a un tablero.
 *
 * ## El mando es el mismo, y en las de texto también
 *
 * Tres posiciones, las mismas tres. En una celda de SQL son código, resultado o
 * los dos; en una de texto son la fuente, el texto compuesto o los dos. No es
 * una analogía forzada: en ambos casos es «lo que escribo», «lo que sale» y
 * «las dos cosas», que es la única distinción que hace falta recordar.
 *
 * ## Por qué aquí no se monta el editor de documentos del producto
 *
 * Se anunció en la fase 1 que se montaría aquí, y no se hace. Mirado de cerca,
 * ese editor está atado a **un archivo**: pide los cambios de git de ese
 * archivo, busca sus retroenlaces y escribe su nombre en la barra. Con la ruta
 * del cuaderno etiquetaría la celda con el nombre del cuaderno entero y pediría
 * diffs que no le corresponden; sin ella pone «documento sin guardar», que es
 * una mentira en pantalla.
 *
 * Lo que de verdad hacía falta para escribir prosa larga era **sitio**, y eso sí
 * está: fuente y texto compuesto, lado a lado, en toda la pantalla.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    LuPlay, LuColumns2, LuCode, LuTable, LuMinimize2, LuLoaderCircle, LuEye,
} from 'react-icons/lu';
import SqlEditor from '../SqlEditor';
import ResultsTable from '../ResultsTable';
import MarkdownPreview from '../markdown/MarkdownPreview';
import { MODOS } from './modos.js';
import '../MarkdownEditor.css';

const PantallaCompleta = ({
    celda,
    analisis,
    resultado,
    estado = {},
    corriendo,
    theme,
    editorSettings,
    onCambiar,
    onEstado,
    onEjecutar,
    onCerrar,
    onCreateNew,
}) => {
    const esTexto = celda.tipo === 'texto';
    const modo = estado.modo || MODOS.AMBOS;
    const reparto = estado.reparto ?? 0.5;
    const raiz = useRef(null);
    const [arrastrando, setArrastrando] = useState(false);

    // Escape cierra. Se escucha en la ventana y no en el contenedor porque el
    // foco suele estar dentro del editor de código, que se come los eventos.
    useEffect(() => {
        const alPulsar = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            onCerrar();
        };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, [onCerrar]);

    const empezarArrastre = useCallback((e) => {
        e.preventDefault();
        const cuerpo = raiz.current?.querySelector('.cdn-pc-cuerpo');
        if (!cuerpo) return;
        setArrastrando(true);
        const mover = (ev) => {
            const caja = cuerpo.getBoundingClientRect();
            onEstado(celda.id, {
                reparto: Math.min(0.85, Math.max(0.15, (ev.clientX - caja.left) / caja.width)),
            });
        };
        const soltar = () => {
            setArrastrando(false);
            window.removeEventListener('mousemove', mover);
            window.removeEventListener('mouseup', soltar);
        };
        window.addEventListener('mousemove', mover);
        window.addEventListener('mouseup', soltar);
    }, [celda.id, onEstado]);

    // Mismo motivo que en `Celda`: una flecha escrita en el render re-arma el
    // avisador de Story Flow en cada pintado.
    const alCambiarVista = useCallback((v) => onEstado(celda.id, { vista: v }), [celda.id, onEstado]);
    const alCambiarGrafico = useCallback((cfg) => {
        if (estado.vista !== 'chart') return;
        onEstado(celda.id, { grafico: cfg });
    }, [celda.id, onEstado, estado.vista]);

    const soloUno = modo !== MODOS.AMBOS;
    const titulo = esTexto
        ? (primeraLinea(celda.contenido) || 'Texto')
        : (String(celda.nombre || '').trim() || 'sin nombre');

    const mando = (valor, Icono, ayuda) => (
        <button
            type="button"
            className={`cdn-btn cdn-btn--icono${modo === valor ? ' cdn-btn--on' : ''}`}
            onClick={() => onEstado(celda.id, { modo: valor })}
            title={ayuda}
        ><Icono size={13} /></button>
    );

    return (
        <div className="cdn-pc" ref={raiz}>
            <div className="cdn-cab">
                <button
                    type="button"
                    className="cdn-btn cdn-btn--icono"
                    onClick={onCerrar}
                    title="Volver al cuaderno (Esc)"
                ><LuMinimize2 size={13} /></button>

                <span className={esTexto ? 'cdn-desc' : 'cdn-pc-nombre'}>{titulo}</span>
                {!esTexto && analisis?.comentario && (
                    <span className="cdn-desc" title={analisis.comentario}>
                        {analisis.comentario.split('\n')[0]}
                    </span>
                )}
                <span className="cdn-sp" />

                <div className="cdn-grupo">
                    {mando(MODOS.AMBOS, LuColumns2, esTexto ? 'Fuente y texto' : 'Código y resultado')}
                    {mando(MODOS.CODIGO, LuCode, esTexto ? 'Sólo la fuente' : 'Sólo el código')}
                    {mando(MODOS.RESULTADO, esTexto ? LuEye : LuTable, esTexto ? 'Sólo el texto' : 'Sólo el resultado')}
                </div>

                {!esTexto && (
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
                )}
            </div>

            <div
                className={`cdn-pc-cuerpo${soloUno ? ' cdn-cuerpo--solo' : ''}`}
                style={soloUno ? undefined : { '--cdn-izq': `${reparto}fr`, '--cdn-der': `${1 - reparto}fr` }}
            >
                {modo !== MODOS.RESULTADO && (
                    <div className="cdn-editor">
                        {esTexto ? (
                            <textarea
                                className="cdn-texto-fuente"
                                value={celda.contenido || ''}
                                spellCheck
                                placeholder="Aquí cabe el contexto, la metodología y lo que se descartó. Los encabezados construyen el índice de la derecha."
                                onChange={(e) => onCambiar(celda.id, { contenido: e.target.value })}
                            />
                        ) : (
                            <SqlEditor
                                tabId={`pc-${celda.id}`}
                                value={celda.contenido}
                                language="sql"
                                onChange={(v) => onCambiar(celda.id, { contenido: v ?? '' })}
                                onRunQuery={() => onEjecutar(celda.id)}
                                theme={theme}
                                editorSettings={editorSettings}
                            />
                        )}
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
                        {esTexto ? (
                            <div className="cdn-pc-md">
                                {/* Aqui SI se quiere la maquetacion de pagina que
                                    trae la vista previa —860 px centrados—: es una
                                    pantalla entera y una linea de borde a borde no
                                    se lee. */}
                                <MarkdownPreview content={celda.contenido || ''} />
                            </div>
                        ) : resultado?.error ? (
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
                                onViewModeChange={alCambiarVista}
                                onConfigChange={alCambiarGrafico}
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

/** El primer encabezado o la primera línea, para la cabecera. */
function primeraLinea(texto) {
    for (const linea of String(texto || '').split('\n')) {
        const t = linea.trim();
        if (!t) continue;
        return t.replace(/^#{1,6}\s*/, '').slice(0, 90);
    }
    return '';
}

export default memo(PantallaCompleta);
