/**
 * Una celda de código: el editor arriba y el resultado debajo (6.0.1); lado a
 * lado, si se pide desde el menú de la celda.
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
 * ## La altura se sabe sin montar nada
 *
 * Lado a lado mide 520 px fijos. Apilada (6.0.1, lo normal) mide lo que pide su
 * contenido —las líneas del SQL y las filas del resultado— con topes, y esa
 * cuenta sale de datos que ya están en memoria: el hueco de una celda mide lo
 * mismo esté montada o no, así que el desplazamiento no salta. Si la consulta
 * pasa del tope, se desplaza por dentro; la vía de escape es la pantalla
 * completa o el tirador.
 */
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { LuDatabase, LuLayers, LuTriangleAlert, LuHistory, LuArrowUpFromLine, LuPencilLine, LuWrench, LuPlay, LuCircleAlert } from 'react-icons/lu';
import SqlEditor from '../SqlEditor';
import ResultsTable from '../ResultsTable';
import { MODOS } from './modos.js';
import { useCerca, useLejos } from './useCerca.js';
import { CANVAS_SIZES } from '../DataVisualizer/constants';

// Medido contra la tabla de resultados de verdad, no estimado: la fila de
// títulos lleva el tipo debajo, de ahí los 44.
const ALTO_CAB = 30;            // la cabecera de la celda
const ALTO_CABEZA_TABLA = 44;   // la fila de títulos de la tabla
const ALTO_FILA = 28;
const ALTO_PIE = 21;            // el pie de páginas, sólo con más de una
/**
 * Unos píxeles de más para la tabla.
 *
 * La fila de títulos no siempre mide lo mismo —depende de lo largo que sea el
 * nombre de la columna y de si el tipo cabe debajo—, así que la cuenta se queda
 * corta por unos pocos píxeles según los datos. Equivocarse por arriba deja un
 * dedo de aire; equivocarse por abajo saca una barra de desplazamiento dentro de
 * una tabla que cabía entera. No son simétricos.
 */
const HOLGURA_TABLA = 10;

/*
 * Apilada (6.0.1): las medidas del editor y del resultado. El editor de SQL usa
 * 14 px de letra (19 de línea) y 16 de aire arriba; 14 más abajo dejan sitio a la
 * barra de desplazamiento horizontal.
 */
const ALTO_LINEA = 19;
const AIRE_EDITOR = 16 + 14;
const LINEAS_MIN = 3;
const LINEAS_MAX = 16;
const ALTO_TIRADOR = 7;
// La barra de herramientas de la tabla, al editar: dos filas en una celda de
// menos de ~700 px (medido: 73). En una más ancha cabe en una y sobra un dedo.
const ALTO_BARRA_RES = 73;
const FILAS_MAX = 10;           // las que se ven sin desplazarse dentro
const ALTO_SIN_RES = 44;        // «Not run yet»
const ALTO_ERROR = 132;
const ALTO_GRAFICO = 520;

/** El alto del editor apilado: sus líneas, entre 3 y 16. */
function altoDeEditor(sql) {
    const lineas = String(sql || '').split('\n').length;
    return Math.min(LINEAS_MAX, Math.max(LINEAS_MIN, lineas)) * ALTO_LINEA + AIRE_EDITOR;
}

/** El alto del resultado apilado, sin montarlo. */
function altoDeResultado(resultado, vista) {
    if (!resultado) return ALTO_SIN_RES;
    if (resultado.faltan?.length) return 96 + 34 * Math.min(resultado.faltan.length, 4);
    if (resultado.error) return ALTO_ERROR;
    if (!resultado.data) return ALTO_SIN_RES;
    if (vista === 'chart') return ALTO_GRAFICO;
    const filas = resultado.data.length;
    const enPantalla = Math.max(1, Math.min(filas, FILAS_MAX));
    const pie = filas > 50 ? ALTO_PIE : 0;
    return ALTO_BARRA_RES + ALTO_CABEZA_TABLA + enPantalla * ALTO_FILA + pie + HOLGURA_TABLA;
}

/**
 * Un parámetro sin valor (6.0.1, U17): se dice cuál y se le da ahí mismo. La
 * celda no llegó al motor, así que no hay un error que leer.
 */
function SinValor({ faltan, onDar }) {
    const [valores, setValores] = useState({});
    const listo = faltan.every((n) => String(valores[n] ?? '').trim());
    const dar = (e) => {
        e.preventDefault();
        if (!listo || !onDar) return;
        onDar(Object.fromEntries(faltan.map((n) => [n, String(valores[n]).trim()])));
    };
    return (
        <form className="cdn-sinvalor" onSubmit={dar}>
            <div className="cdn-sinvalor-titulo">
                <LuCircleAlert size={13} />
                {faltan.length === 1
                    ? <span><code>{`{{${faltan[0]}}}`}</code> has no value yet</span>
                    : <span>{faltan.length} parameters have no value yet</span>}
            </div>
            {faltan.slice(0, 4).map((n) => (
                <label key={n} className="cdn-sinvalor-fila">
                    <code>{n}</code>
                    <input
                        className="input-field"
                        value={valores[n] ?? ''}
                        placeholder="value"
                        onChange={(e) => setValores((v) => ({ ...v, [n]: e.target.value }))}
                        autoFocus={n === faltan[0]}
                    />
                </label>
            ))}
            {onDar && (
                <div>
                    <button type="submit" className="btn-primario btn--peq" disabled={!listo}>
                        <LuPlay size={11} /> Set and run
                    </button>
                </div>
            )}
        </form>
    );
}

/**
 * El alto que pide una figura de Story Flow, **sin montarla**.
 *
 * Son los mismos números que usa `DataVisualizer` para dar tamaño a la tarjeta:
 * `ancho = min(880, 620 × razón)` y `alto = ancho / razón`, o sea
 * `min(880 / razón, 620)`. Con 4:3 salen 620; con 16:9, 495.
 *
 * Están copiados a propósito, no importados: importar `DataVisualizer` desde
 * aquí traería Recharts entero a una celda que a lo mejor sólo enseña una tabla.
 * Lo que sí se importa es la lista de proporciones, que es un dato.
 */
const ANCHO_DISENO_FIGURA = 880;
const ALTO_DISENO_FIGURA = 620;
/** El aire de la tarjeta: 12 de relleno arriba y abajo, 14 + 16 de margen. */
const AIRE_FIGURA = 12 * 2 + 14 + 16;

function altoDeFigura(config) {
    const etiqueta = config?.canvasSize || '4:3';
    const prop = CANVAS_SIZES.find((c) => c.label === etiqueta);
    // «Libre» no fija tamaño: la tarjeta ocupa el hueco, así que manda el tope.
    if (!prop || !prop.w || !prop.h) return null;
    const razon = prop.w / prop.h;
    return Math.round(Math.min(ANCHO_DISENO_FIGURA / razon, ALTO_DISENO_FIGURA)) + AIRE_FIGURA;
}

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
    onPromover = null, // 5.12 (I6): (celda) -> promover esta celda a modelo de dbt
    onEstado,         // (id, parcial)
    onEjecutar,       // (id)
    onCreateNew,
    onAsistir = null, // E3: (id, accion) -> la pregunta al Assistant sobre esta celda
    onSeguir = null,   // 6.0.1: (id) Shift+Enter, ejecutar y pasar a la siguiente
    onInsertar = null, // 6.0.1: (id) Alt+Enter, ejecutar e insertar una debajo
    onTodo = null,     // 6.0.1: Ctrl+Shift+Enter, ejecutar todo
    onParametro = null, // 6.0.1: (valores, idCelda) dar valor a los parámetros y volver a ejecutar
    focoPedido = 0,    // 6.0.1: cambia cuando el cuaderno quiere el foco en esta celda
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
    /** 6.0.1 (U5): apilada salvo que se pida lado a lado desde el menú de la celda. */
    const apilada = !estado.lado;
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
    useLejos(raiz);

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
            // Apilada, el tirador fija el alto del editor en píxeles: la celda
            // crece o mengua con él, no se reparte un alto fijo.
            if (apilada) {
                onEstado(celda.id, { altoEditor: Math.round(Math.min(640, Math.max(60, ev.clientY - caja.top))) });
                return;
            }
            const frac = (ev.clientX - caja.left) / caja.width;
            onEstado(celda.id, { reparto: Math.min(0.85, Math.max(0.15, frac)) });
        };
        const soltar = () => {
            setArrastrando(false);
            window.removeEventListener('mousemove', mover);
            window.removeEventListener('mouseup', soltar);
        };
        window.addEventListener('mousemove', mover);
        window.addEventListener('mouseup', soltar);
    }, [celda.id, onEstado, apilada]);

    // Al editor, con identidad fija: `onCambiar` y `onEjecutar` ya lo son.
    const alEscribir = useCallback((v) => onCambiar(celda.id, { contenido: v ?? '' }), [celda.id, onCambiar]);
    const alEjecutar = useCallback(() => onEjecutar(celda.id), [celda.id, onEjecutar]);
    const alSeguir = useCallback(() => onSeguir?.(celda.id), [celda.id, onSeguir]);
    const alInsertar = useCallback(() => onInsertar?.(celda.id), [celda.id, onInsertar]);
    const alTodo = useCallback(() => onTodo?.(), [onTodo]);

    /** La línea del error, marcada en el editor (6.0.1, U12). */
    const marcaDeError = useMemo(() => (
        resultado?.lineaError ? { line: resultado.lineaError, column: 1, message: resultado.error } : null
    ), [resultado?.lineaError, resultado?.error]);

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
        if (!lectura) return altoAlEditar();
        // Sin filas (no corrió, falló o salió vacía): una línea que lo dice.
        if (!resultado?.data?.length) return `${ALTO_CAB + ALTO_SIN_RES}px`;

        // Una figura pide lo que pide. Si no se le da, la tarjeta no cabe en la
        // celda y aparece una barra de desplazamiento DENTRO del gráfico, que en
        // un documento no significa nada: lo que se lee es la figura entera o no
        // se lee. Aquí NO hay tope de 520 — el tope existe para poder recorrer
        // el cuaderno mientras se trabaja, y leyendo no se recorre, se lee.
        if (esFigura) {
            const alto = altoDeFigura(estado.grafico);
            return alto ? `${alto}px` : undefined;
        }

        const filas = resultado.data.length;
        const enPantalla = Math.min(filas, 50);          // lo que cabe en una página
        const pie = filas > 50 ? ALTO_PIE : 0;
        // La tabla SÍ conserva su caja y su cabecera: no trae título propio, así
        // que sin ellas se queda sin decir de qué paso viene.
        const cuerpo = ALTO_CAB + ALTO_CABEZA_TABLA + enPantalla * ALTO_FILA + pie + HOLGURA_TABLA;
        return `min(var(--cdn-alto), ${cuerpo}px)`;
    };

    /** En lectura, una figura y una tabla no se presentan igual. */
    const esFigura = estado.vista === 'chart';

    /**
     * Al editar y apilada: cabecera + editor + tirador + resultado, sin montar
     * nada. Lado a lado se queda con su alto fijo (`--cdn-alto`).
     */
    const altoEditor = estado.altoEditor || altoDeEditor(celda.contenido);
    function altoAlEditar() {
        if (!apilada) return undefined;
        const res = altoDeResultado(resultado, estado.vista);
        if (modo === MODOS.CODIGO) return `${ALTO_CAB + altoEditor}px`;
        if (modo === MODOS.RESULTADO) return `${ALTO_CAB + res}px`;
        return `${ALTO_CAB + altoEditor + ALTO_TIRADOR + res}px`;
    }

    const soloUno = modo !== MODOS.AMBOS;
    /** En lectura la cabecera es un pie de figura: nombre y descripción, nada más. */
    const marcas = !lectura;
    /** ¿Esta celda puede dejar una vista con el nombre de la celda? */
    const puedeDejarVista = !!analisis?.envolvible;
    const vieja = frescura === 'cambiada' || frescura === 'arriba';

    return (
        <div
            ref={raiz}
            className={`cdn-celda${lectura && esFigura ? ' cdn-celda--figura' : ''}`}
            style={{ height: altoDeLectura() }}
        >
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
                {onPromover && (
                    <button type="button" className="cdn-promover" onClick={() => onPromover(celda)} title="Promote this cell to a dbt model">
                        <LuArrowUpFromLine size={11} /> dbt
                    </button>
                )}

                {celda.borrador && (
                    <span className="cdn-deja cdn-deja--borrador" title="Draft: it runs and leaves its view, but stays out of Word and the deck">
                        <LuPencilLine size={11} />
                        draft
                    </span>
                )}

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
                className={`cdn-cuerpo${soloUno ? ' cdn-cuerpo--solo' : ''}${apilada ? ' cdn-cuerpo--apilado' : ''}`}
                style={soloUno ? undefined : apilada
                    ? { '--cdn-alto-editor': `${altoEditor}px` }
                    : { '--cdn-izq': `${reparto}fr`, '--cdn-der': `${1 - reparto}fr` }}
            >
                {modo !== MODOS.RESULTADO && (
                    <div className="cdn-editor">
                        {cerca && <SqlEditor
                            tabId={celda.id}
                            value={celda.contenido}
                            language="sql"
                            onChange={alEscribir}
                            onRunQuery={alEjecutar}
                            onRunAndNext={onSeguir ? alSeguir : undefined}
                            onRunAndInsert={onInsertar ? alInsertar : undefined}
                            onRunAll={onTodo ? alTodo : undefined}
                            errorMarker={marcaDeError}
                            focoPedido={focoPedido}
                            theme={theme}
                            editorSettings={editorSettings}
                            ajusteDiferido
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
                        {!cerca ? null : lectura && (resultado?.error || resultado?.faltan) ? (
                            /* 6.0.1 (U16): leyendo no se enseña el error del motor. */
                            <div className="cdn-vacio">This step failed. Switch to Edit to see why.</div>
                        ) : resultado?.faltan?.length ? (
                            <SinValor faltan={resultado.faltan} onDar={onParametro ? (valores) => onParametro(valores, celda.id) : null} />
                        ) : resultado?.error ? (
                            <div className="cdn-error">
                                {resultado.error}
                                {/* E3: el error es una puerta al Assistant, que ya lo conoce. */}
                                {onAsistir && !lectura && (
                                    <div>
                                        <button type="button" className="cdn-error-asistir" onClick={() => onAsistir(celda.id, 'arreglar_celda')}>
                                            <LuWrench size={12} /> Fix with Assist
                                        </button>
                                    </div>
                                )}
                            </div>
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
