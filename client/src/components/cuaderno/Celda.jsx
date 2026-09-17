/**
 * Una celda de código: editor a la izquierda, resultado a la derecha.
 *
 * ## La cabecera sólo IDENTIFICA
 *
 * Nombre, descripción y qué deja detrás. Nada más — los mandos viven en el
 * canalón (`Canalon.jsx`) y aparecen al pasar el ratón. Antes había aquí diez
 * controles siempre visibles, que en un cuaderno de ocho celdas son ochenta
 * botones compitiendo con el análisis, y el que de verdad se usa —Ejecutar—
 * competía con nueve vecinos en vez de ser el único encendido.
 *
 * El nombre no es una etiqueta: es el de la vista que la celda pone en la sesión
 * al ejecutarse. Al lado, un distintivo apagado mientras esa vista **no exista
 * de verdad** —una vista existe porque alguien ejecutó la celda, no porque esté
 * escrita— y encendido cuando el motor confirma que está viva.
 *
 * Una celda que no se puede envolver lo dice —«no deja vista»— sin tratarlo como
 * un fallo, porque no lo es: hay celdas que están para cargar o para escribir. Y
 * si escribe en el disco lo avisa aparte, porque eso no se deshace al cerrar.
 *
 * ## La altura no es negociable
 *
 * 520 px, fijos. Si la consulta tiene cuarenta líneas, se desplaza por dentro:
 * la vía de escape es la pantalla completa, no que la celda crezca. Con celdas
 * que crecen, un cuaderno de veinte deja de poder recorrerse.
 */
import { memo, useCallback, useRef, useState } from 'react';
import { LuDatabase, LuLayers, LuTriangleAlert, LuHistory } from 'react-icons/lu';
import SqlEditor from '../SqlEditor';
import ResultsTable from '../ResultsTable';
import { MODOS } from './modos.js';
import { useCerca } from './useCerca.js';

// Medido contra la tabla de resultados de verdad, no estimado: la fila de
// títulos lleva el tipo debajo, de ahí los 44.
const ALTO_CABEZA_TABLA = 44;   // la fila de títulos de la tabla
const ALTO_FILA = 28;
const ALTO_PIE = 21;            // el pie de páginas, sólo con más de una

const Celda = ({
    celda,
    analisis,
    resultado,
    viva,             // la vista de esta celda existe AHORA en la sesion
    frescura,         // 'nunca' | 'dia' | 'cambiada' | 'arriba'
    enCiclo,          // esta celda y otra se leen entre si
    precalentada,     // el cuaderno ya le dio turno: montate aunque estes lejos
    lectura,          // el cuaderno esta en modo lectura: solo el resultado
    estado = {},
    theme,
    editorSettings,
    onCambiar,        // (id, campos)
    onEstado,         // (id, parcial)
    onEjecutar,       // (id)
    onCreateNew,
}) => {
    /**
     * En lectura manda el cuaderno, no la celda.
     *
     * Y se impone al pintar, **sin escribirlo en el estado**: el mando de tres
     * posiciones de cada celda es una preferencia de quien trabaja el análisis, y
     * mirarlo en modo lectura no puede borrarla. Al salir, cada celda vuelve a
     * estar como estaba.
     */
    const modo = lectura ? MODOS.RESULTADO : (estado.modo || MODOS.AMBOS);
    /**
     * 40 % para el código y 60 % para el resultado.
     *
     * No es simetría lo que hace falta: el código de un paso cabe en pocas
     * líneas y el resultado trae columnas, y una tabla estrecha obliga a
     * desplazarse en horizontal, que es peor que leer el SQL en líneas más
     * cortas. El tirador sigue estando: esto es sólo de dónde se parte.
     */
    const reparto = estado.reparto ?? 0.4;
    const raiz = useRef(null);
    const [arrastrando, setArrastrando] = useState(false);
    /**
     * El cuerpo se monta al acercarse —o cuando el cuaderno le da turno— y ya
     * no se desmonta.
     *
     * La cabecera se pinta siempre —es barata y es lo que se lee al recorrer— y
     * la caja mide sus 520 px esté montada o no, así que el desplazamiento no se
     * entera. Lo que se aplaza es el editor de código y la tabla de resultados
     * con su motor de gráficos: eso es lo que cuesta, y multiplicado por
     * dieciséis celdas es lo que dejaba el cuaderno clavado.
     *
     * Lo que NO se hace es deshacerlo al alejarse: el porqué está en
     * `useCerca.js`, y el turno que reparte el cuaderno, en `CuadernoEditor`.
     */
    const cerca = useCerca(raiz, precalentada);

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
     * Los callbacks que van a `ResultsTable` **no pueden nacer en el render**.
     *
     * El avisador de cambios de Story Flow tiene su efecto dependiendo de la
     * identidad de `onConfigChange`. Con una flecha escrita en el JSX, esa
     * identidad cambia en cada pintado: el efecto se re-arma, a los 500 ms
     * escribe la configuración, eso provoca otro pintado, y vuelta a empezar.
     * Con dieciséis celdas montadas a la vez el cuaderno se queda clavado, y el
     * archivo de estado engorda hasta 54 KB de configuraciones que nadie pidió.
     */
    const alCambiarVista = useCallback(
        (v) => onEstado(celda.id, { vista: v }),
        [celda.id, onEstado],
    );

    /**
     * Y una configuración de gráfico sólo se guarda si la celda **está** en
     * gráfico.
     *
     * `DataVisualizer` se monta siempre —sólo se oculta por CSS— así que una
     * celda en tabla también deduce ejes y avisa. Guardar eso llenaba el archivo
     * de estado de gráficos que nunca se vieron.
     */
    const alCambiarGrafico = useCallback((cfg) => {
        if (estado.vista !== 'chart') return;
        onEstado(celda.id, { grafico: cfg });
    }, [celda.id, onEstado, estado.vista]);

    /**
     * En lectura, el alto lo pide el resultado. Y **se sabe sin montarlo**.
     *
     * El alto fijo es lo que hace barato recorrer el cuaderno: el hueco de una
     * celda mide lo mismo esté montada o no, así que la barra de desplazamiento
     * nunca salta. Eso vale mientras hay un editor al lado; en lectura no lo
     * hay, y una tabla de una fila dentro de una caja de 520 px no es una
     * decisión de diseño, es un agujero.
     *
     * Así que aquí el alto sale de la CUENTA DE FILAS, que ya está en memoria
     * antes de pintar nada. No se mide el DOM y no hace falta que la celda esté
     * montada: el hueco sigue siendo exacto y el desplazamiento sigue sin
     * saltar. Las medidas salen del motor de verdad, no de la cabeza:
     * cabecera 44, fila 28, pie de páginas 21.
     *
     * Una figura se queda con todo el alto: un gráfico aplastado no se lee, y
     * ahí el espacio no sobra, se usa.
     */
    const altoDeLectura = () => {
        if (!lectura || estado.vista === 'chart') return undefined;
        const filas = resultado?.data?.length;
        if (!filas) return undefined;
        const enPantalla = Math.min(filas, 50);          // lo que cabe en una página
        const pie = filas > 50 ? ALTO_PIE : 0;
        const cuerpo = ALTO_CABEZA_TABLA + enPantalla * ALTO_FILA + pie;
        // Sin sumar la cabecera: en lectura no hay. El tope sigue siendo el de
        // siempre y se lee del CSS, para que la pantalla estrecha —que lo sube a
        // 780— siga mandando.
        return `min(var(--cdn-alto), ${cuerpo}px)`;
    };

    const soloUno = modo !== MODOS.AMBOS;
    /** En lectura la cabecera es un pie de figura: nombre y descripción, nada más. */
    const marcas = !lectura;
    /** ¿Esta celda puede dejar una vista con el nombre de la celda? */
    const puedeDejarVista = !!analisis?.envolvible;
    const vieja = frescura === 'cambiada' || frescura === 'arriba';

    return (
        <div ref={raiz} className="cdn-celda" style={{ height: altoDeLectura() }}>
            <div className="cdn-cab">
                {/* El nombre se escribe aquí y NO en el SQL: es el de la vista
                    que la celda deja puesta al ejecutarse. Si se deja en blanco
                    se bautiza sola al ejecutar. */}
                <input
                    className="cdn-nombre"
                    value={celda.nombre || ''}
                    placeholder="unnamed"
                    spellCheck={false}
                    readOnly={lectura}
                    onChange={(e) => onCambiar(celda.id, { nombre: e.target.value.trim() })}
                    title={celda.nombre
                        ? `The next cell can write FROM ${celda.nombre}`
                        : 'It gets one when you run it'}
                />
                {/* La descripción sale del comentario de cabecera de la consulta:
                    no se escribe dos veces. */}
                {analisis?.comentario && (
                    <span className="cdn-desc" title={analisis.comentario}>
                        {analisis.comentario.split('\n')[0]}
                    </span>
                )}
                <span className="cdn-sp" />

                {/* Que algo esté viejo se dice con palabras, no sólo con el color
                    del punto del canalón: el punto se ve de lejos, pero no
                    explica por qué. */}
                {marcas && vieja && (
                    <span className="cdn-deja cdn-deja--vieja" title={frescura === 'cambiada'
                        ? 'Edited after it ran: what you see is from before'
                        : 'Something it depends on changed: what you see is from before'}>
                        <LuHistory size={11} />
                        {frescura === 'cambiada' ? 'edited' : 'stale'}
                    </span>
                )}
                {/* Un ciclo no tiene un orden correcto, así que «Actualizar» no
                    puede prometer nada sobre estas dos celdas. Mejor decirlo. */}
                {marcas && enCiclo && (
                    <span className="cdn-deja cdn-deja--escribe" title="This cell and another read each other: there is no correct order to run them in">
                        <LuTriangleAlert size={11} />
                        in a loop
                    </span>
                )}
                {/* Escribir en el disco no se deshace al cerrar, y la diferencia
                    con dejar una vista en la sesión es justo la que importa. */}
                {marcas && analisis?.escribe === 'disco' && (
                    <span className="cdn-deja cdn-deja--escribe" title="This cell changes stored data, not just the session">
                        <LuTriangleAlert size={11} />
                        writes
                    </span>
                )}
                {/* Qué deja esta celda detrás. Apagado mientras no exista de
                    verdad: una vista existe porque alguien ejecutó la celda, no
                    porque esté escrita, y pintarla igual sería prometer algo que
                    la siguiente celda no podría leer. */}
                {marcas && puedeDejarVista && (
                    <span
                        className={`cdn-deja${viva ? ' cdn-deja--viva' : ''}`}
                        title={viva
                            ? `${celda.materializada ? 'Table' : 'View'} live in the session`
                            : 'Does not exist yet: run the cell'}
                    >
                        {celda.materializada ? <LuDatabase size={11} /> : <LuLayers size={11} />}
                        {celda.materializada ? 'table' : 'view'}
                    </span>
                )}
                {/* Lo que no se puede envolver no deja nada, y eso no es un
                    fallo: hay celdas que están para cargar o para escribir. */}
                {marcas && analisis && !analisis.vacia && !puedeDejarVista && !analisis.vistaPropia && (
                    <span className="cdn-deja cdn-deja--nada" title={
                        analisis.sentencias > 1
                            ? 'Several statements: they run as written'
                            : 'Not a query: it runs as written'
                    }>leaves no view</span>
                )}
            </div>

            <div
                className={`cdn-cuerpo${soloUno ? ' cdn-cuerpo--solo' : ''}`}
                style={soloUno ? undefined : { '--cdn-izq': `${reparto}fr`, '--cdn-der': `${1 - reparto}fr` }}
            >
                {modo !== MODOS.RESULTADO && (
                    <div className="cdn-editor">
                        {cerca && <SqlEditor
                            tabId={celda.id}
                            value={celda.contenido}
                            language="sql"
                            onChange={(v) => onCambiar(celda.id, { contenido: v ?? '' })}
                            onRunQuery={() => onEjecutar(celda.id)}
                            theme={theme}
                            editorSettings={editorSettings}
                        />}
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
                        {!cerca ? null : resultado?.error ? (
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
                                lazyPanels
                                lectura={lectura}
                                initialViewMode={estado.vista || null}
                                initialChartConfig={estado.grafico || null}
                                onViewModeChange={alCambiarVista}
                                onConfigChange={alCambiarGrafico}
                            />
                        ) : (
                            <div className="cdn-vacio">Not run yet</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default memo(Celda);
