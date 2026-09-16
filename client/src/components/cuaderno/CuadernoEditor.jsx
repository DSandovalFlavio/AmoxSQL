/**
 * El cuaderno.
 *
 * Sigue siendo una lista de celdas que se recorre hacia abajo —quitar eso fue un
 * error de la primera versión del rediseño: en pleno análisis hace falta echar
 * la vista atrás a ver qué clasificó aquel `CASE`—. Lo que cambia es que **las
 * celdas miden todas lo mismo**, que cada una decide qué enseña, y que a la
 * derecha hay un índice que se mantiene solo.
 *
 * ## La vista implícita
 *
 * Es lo que justifica que el cuaderno sea un formato y no un `.sql` con adornos:
 * **nadie escribe `CREATE OR REPLACE TEMP VIEW`**. Se escribe la consulta, la
 * celda le pone nombre —uno puesto a mano, o `paso_N` si se ejecuta sin él— y la
 * celda de abajo ya puede escribir `FROM ese_nombre`. El comentario de arriba de
 * la consulta se convierte en la descripción de la vista, y se guarda en el
 * motor, no sólo en el documento.
 *
 * Esto no inventa nada: la sesión de AmoxSQL ya era una conexión viva donde una
 * vista temporal sobrevive de una consulta a la siguiente. Lo único que faltaba
 * era que la interfaz lo contara.
 *
 * ## El estado visual va aparte, y por identidad
 *
 * El modo, el reparto y la configuración del gráfico se guardan en el archivo de
 * estado (`.state.json`), **nunca en el documento**: son del que mira, no del
 * análisis.
 *
 * La clave con la que se guardan es el nombre de la celda, y la posición sólo
 * mientras no tenga uno; el porqué y el cómo están en `claves.js`. Lo que
 * importa aquí es que **la posición, cuando se usa, se reescribe al reordenar**
 * — la notebook de hoy no lo hace, y por eso mover dos celdas les intercambia
 * el gráfico.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    LuPlus, LuFileText, LuSave, LuBot, LuX, LuRefreshCw, LuFileType2, LuPresentation, LuLoaderCircle,
} from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { leerCuaderno, escribirCuaderno, indiceDe, tituloDe } from '../../utils/cuadernoFile.js';
import { analizarCelda } from '../../utils/celdaSql.js';
import { componerCelda, nombrePorOmision } from '../../utils/vistaDeCelda.js';
import { useDialog } from '../dialogs/DialogProvider';
import { useToast } from '../ToastProvider';
import { openTour, hasSeenTour } from '../onboarding/tourRegistry';
import Celda from './Celda.jsx';
import Barra from './Barra.jsx';
import CeldaTexto from './CeldaTexto.jsx';
import Canalon from './Canalon.jsx';
import PantallaCompleta from './PantallaCompleta.jsx';
import { claveDeCelda, reclavar } from './claves.js';
import { cruzarVistas, parametrosUsados, sustituirParametros } from './vistasVivas.js';
import { construirGrafo, frescura, queActualizar, celdasEnCiclo } from './grafo.js';
import { celdasParaExportar, graficosQueNoSalen, planDeTablero } from './exportar.js';
import { buildSlideRaw } from '../../utils/deckTemplates';
import { serializeDeck } from '../../utils/deckParser';
import './cuaderno.css';

const idNuevo = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Una llamada al servidor que **explica lo que pasó** cuando no pasa lo previsto.
 *
 * Sin esto, un servidor que no conoce la ruta devuelve su página de error en
 * HTML, `r.json()` se atraganta con el primer `<`, y lo que llega a la celda es
 * «Unexpected token '<'». Eso no dice nada de lo que hay que hacer.
 *
 * Y el caso no es raro: el servidor vive en un proceso aparte que **no se
 * recarga en caliente**, así que una aplicación abierta desde antes de que la
 * ruta existiera tiene el cliente al día y el servidor de ayer. Merece la pena
 * decirlo con esas palabras.
 */
async function pedirJson(ruta, opciones) {
    let r;
    try {
        r = await fetch(`${API_BASE}${ruta}`, opciones);
    } catch (e) {
        throw new Error(`No se pudo hablar con el servidor de AmoxSQL (${API_BASE}). ${e?.message || e}`);
    }
    const tipo = r.headers.get('content-type') || '';
    if (!tipo.includes('application/json')) {
        if (r.status === 404) {
            throw new Error(
                `El servidor no conoce «${ruta}». Suele pasar cuando la aplicación lleva `
                + 'abierta desde antes de que esa ruta existiera: el servidor va en un proceso '
                + 'aparte y no se recarga solo. Cierra AmoxSQL y vuelve a abrirlo.',
            );
        }
        throw new Error(`El servidor respondió ${r.status} sin JSON al pedir «${ruta}».`);
    }
    const cuerpo = await r.json();
    // Un 500 del endpoint SÍ trae JSON con `error`: eso se devuelve tal cual,
    // porque es el mensaje del motor y es lo que hay que leer.
    return cuerpo;
}

const CuadernoEditor = ({
    content,
    onChange,
    onEjecutada,      // () -> solo para la marca de tiempo de la pestana
    onSave,
    filePath = null,
    theme,
    editorSettings,
    onToggleAi,
    showAiSidebar,
    onCreateNew,
}) => {
    const [doc, setDoc] = useState(() => leerCuaderno(content));
    const [resultados, setResultados] = useState({});
    const [estados, setEstados] = useState({});
    const [corriendo, setCorriendo] = useState(null);
    const [seleccionada, setSeleccionada] = useState(null);
    /**
     * Lo que está vivo en la sesión ahora mismo.
     *
     * No se deduce del documento, **se le pregunta al motor**: una vista existe
     * porque alguien ejecutó la celda, no porque esté escrita. Un cuaderno
     * recién abierto tiene todas sus celdas y ninguna vista, y enseñar lo
     * contrario sería mentir sobre lo que se puede consultar.
     */
    const [vivas, setVivas] = useState([]);
    /**
     * Qué se ejecutó y cuándo: `id -> {en, sql}`, con el SQL **ya resuelto**.
     *
     * Vive sólo en memoria y a propósito. Guardarlo en disco haría que al
     * reabrir mañana las celdas se dieran por ejecutadas mientras la sesión está
     * vacía — la mentira exacta que la barra derecha existe para no contar.
     */
    const [ejecuciones, setEjecuciones] = useState({});
    /** La celda que ocupa la pestaña entera, o `null`. */
    const [aPantalla, setAPantalla] = useState(null);
    /** `null`, `'word'` o `'tablero'` mientras se saca algo del cuaderno. */
    const [sacando, setSacando] = useState(null);
    /** La celda de texto que se está escribiendo ahora, o `null`. */
    const [escribiendo, setEscribiendo] = useState(null);
    const dialog = useDialog();
    const toast = useToast();

    const refrescarVistas = useCallback(() => {
        pedirJson('/api/cuaderno/vistas')
            .then((v) => setVivas(Array.isArray(v) ? v : []))
            // Sin listado se sigue trabajando: la barra dira que no hay vistas
            // vivas, que es menos util pero no impide nada.
            .catch(() => setVivas([]));
    }, []);

    useEffect(() => { refrescarVistas(); }, [refrescarVistas]);

    // El recorrido de la primera vez lo lanzaba el componente anterior; al
    // retirarlo se quedaba sin quien lo abriera.
    useEffect(() => {
        if (!hasSeenTour('notebooks')) openTour('notebooks');
    }, []);

    /**
     * El texto del documento se rehace al cambiar las celdas, no al revés.
     *
     * `content` sólo se vuelve a leer cuando llega **de fuera** —abrir el
     * archivo, traerlo del disco tras un cambio ajeno—; si se releyera en cada
     * pulsación, el cursor saltaría al principio a cada letra.
     */
    const ultimoTexto = useRef(content);
    useEffect(() => {
        if (content === ultimoTexto.current) return;
        ultimoTexto.current = content;
        setDoc(leerCuaderno(content));
    }, [content]);

    // ── el estado visual, en su archivo aparte ──────────────────────────────
    const guardarEstado = useRef(null);
    /**
     * Lo que ya habia en el archivo de estado y no es nuestro.
     *
     * El endpoint **reescribe el archivo entero**, no fusiona. El cuaderno
     * guarda su estado bajo `celdas`, pero el mismo archivo lleva el `cells`
     * indexado por posicion de la notebook anterior: escribir sin conservarlo
     * borraria del disco los graficos que alguien configuro alli, y quien
     * abriera su cuaderno de siempre perderia ese trabajo por el mero hecho de
     * abrirlo. Se guarda lo ajeno al leer y se devuelve intacto al escribir.
     */
    const ajeno = useRef({});
    const persistirEstado = useCallback((mapa) => {
        if (!filePath) return;
        clearTimeout(guardarEstado.current);
        guardarEstado.current = setTimeout(() => {
            fetch(`${API_BASE}/api/notebook-state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: filePath,
                    state: { ...ajeno.current, celdas: mapa },
                }),
            }).catch(() => { /* que no se guarde una preferencia no rompe nada */ });
        }, 800);
    }, [filePath]);

    useEffect(() => {
        if (!filePath) return;
        let vivo = true;
        ajeno.current = {};
        pedirJson(`/api/notebook-state?path=${encodeURIComponent(filePath)}`)
            .then((s) => {
                if (!vivo || !s || typeof s !== 'object') return;
                const { celdas, ...resto } = s;
                ajeno.current = resto;
                if (celdas) setEstados(celdas);
            })
            .catch(() => { /* sin estado guardado se empieza por omisión */ });
        return () => { vivo = false; };
    }, [filePath]);

    /** `id -> clave`, para no recorrer las celdas en cada cambio de estado. */
    const claves = useMemo(() => {
        const mapa = {};
        doc.celdas.forEach((c, i) => { mapa[c.id] = claveDeCelda(c, i); });
        return mapa;
    }, [doc.celdas]);

    /**
     * Toda modificacion del documento pasa por aqui, y aqui se **reclava** el
     * estado visual.
     *
     * Anadir, borrar, mover y renombrar cambian las claves de las celdas, asi
     * que el mapa se reescribe aqui —una sola vez, en el unico sitio por el que
     * pasan los cuatro— en lugar de un parche por operacion. El porque de las
     * claves esta en `claves.js`.
     */
    const emitir = useCallback((siguiente) => {
        const antes = doc.celdas;
        setDoc(siguiente);
        const texto = escribirCuaderno(siguiente);
        ultimoTexto.current = texto;
        onChange?.(texto);

        setEstados((prev) => {
            const salida = reclavar(antes, siguiente.celdas, prev);
            if (salida === prev) return prev;
            persistirEstado(salida);
            return salida;
        });
    }, [doc.celdas, onChange, persistirEstado]);

    /**
     * `cambiarEstado` NO puede cambiar de identidad, y por eso lee las claves de
     * una referencia en vez de depender de ellas.
     *
     * Las claves se recalculan al cambiar `doc.celdas`, o sea en **cada
     * pulsación** dentro de un editor. Si la identidad de esta función cambiara
     * con ellas, cambiaría también la de los callbacks que se le pasan a
     * `ResultsTable`; y el avisador de cambios de Story Flow depende de esa
     * identidad, así que se re-armaría en cada pintado y acabaría escribiendo
     * una configuración de gráfico, que provoca otro pintado. En bucle, en las
     * dieciséis celdas a la vez.
     */
    const clavesRef = useRef(claves);
    clavesRef.current = claves;

    const cambiarEstado = useCallback((id, parcial) => {
        const clave = clavesRef.current[id];
        if (!clave) return;
        setEstados((prev) => {
            const antes = prev[clave];
            const siguiente = { ...(antes || {}), ...parcial };
            // Si no cambia nada, no se toca el estado: un `setEstados` que
            // devuelve contenido igual sigue provocando un pintado.
            if (antes && Object.keys(siguiente).every(
                (k) => JSON.stringify(antes[k]) === JSON.stringify(siguiente[k]),
            )) return prev;
            const mapa = { ...prev, [clave]: siguiente };
            persistirEstado(mapa);
            return mapa;
        });
    }, [persistirEstado]);

    const indice = useMemo(() => indiceDe(doc), [doc]);

    // ── análisis de cada celda: de aquí salen la descripción y el grafo. Se
    //    recalcula sólo cuando cambia el SQL. ─────────────────────────────────
    const analisis = useMemo(() => {
        const mapa = {};
        for (const c of doc.celdas) {
            if (c.tipo === 'sql') mapa[c.id] = analizarCelda(c.contenido);
        }
        return mapa;
    }, [doc.celdas]);

    /**
     * El SQL de cada celda con los parámetros ya dentro.
     *
     * Es lo que se manda al motor y lo que se compara para saber si algo se ha
     * quedado viejo: cambiar un parámetro cambia la consulta sin tocar una letra
     * de la celda.
     */
    const textos = useMemo(() => {
        const mapa = {};
        for (const c of doc.celdas) {
            if (c.tipo === 'sql') mapa[c.id] = sustituirParametros(c.contenido, doc.meta?.parametros);
        }
        return mapa;
    }, [doc.celdas, doc.meta]);

    /** Lo que el documento declara, cruzado con lo que el motor tiene vivo. */
    const vistas = useMemo(() => cruzarVistas(doc.celdas, vivas), [doc.celdas, vivas]);
    const estanVivas = useMemo(
        () => new Set(vistas.propias.filter((v) => v.viva).map((v) => v.nombre.toLowerCase())),
        [vistas],
    );
    const usados = useMemo(() => parametrosUsados(doc.celdas), [doc.celdas]);

    // ── el grafo, y qué se ha quedado viejo ─────────────────────────────────
    const grafo = useMemo(() => construirGrafo(doc.celdas, analisis), [doc.celdas, analisis]);
    const frescuras = useMemo(
        () => frescura(doc.celdas, grafo, ejecuciones, textos),
        [doc.celdas, grafo, ejecuciones, textos],
    );
    const pendientes = useMemo(
        () => queActualizar(doc.celdas, grafo, frescuras, {
            vivas: new Set(vistas.propias.filter((v) => v.viva).map((v) => v.nombre.toLowerCase())),
            analisis,
        }),
        [doc.celdas, grafo, frescuras, vistas, analisis],
    );
    const ciclos = useMemo(() => celdasEnCiclo(doc.celdas, grafo), [doc.celdas, grafo]);
    const parametros = doc.meta?.parametros || {};

    /**
     * Los parámetros viven en la cabecera del archivo, no en el estado visual.
     *
     * Son parte del análisis —cambiarlos cambia el resultado— así que viajan con
     * el documento y llegan a quien lo abra. El modo de una celda no; un valor
     * de parámetro sí.
     */
    /**
     * El título y la descripción del documento, en la cabecera del archivo.
     *
     * El título ya existía (`titulo:`) y no se veía en ningún sitio; la
     * descripción es nueva y va al mismo sitio. Los dos viajan con el archivo,
     * que es lo que los distingue del estado visual.
     */
    const cambiarMeta = useCallback((clave, valor) => {
        emitir({ ...doc, meta: { ...(doc.meta || {}), [clave]: valor } });
    }, [doc, emitir]);

    const cambiarParametro = useCallback((nombre, valor) => {
        const previos = { ...(doc.meta?.parametros || {}) };
        if (valor === null) delete previos[nombre];
        else previos[nombre] = valor;
        emitir({ ...doc, meta: { ...(doc.meta || {}), parametros: previos } });
    }, [doc, emitir]);

    // ── operaciones sobre las celdas ────────────────────────────────────────
    const cambiarCelda = useCallback((id, campos) => {
        emitir({ ...doc, celdas: doc.celdas.map((c) => (c.id === id ? { ...c, ...campos } : c)) });
    }, [doc, emitir]);

    /**
     * Una celda nueva, **donde se pidió**.
     *
     * `donde` viene del hueco que se pulsó, así que la celda nace entre las dos
     * de al lado. Antes había una sola barra al final del cuaderno: meter una
     * celda entre la tercera y la cuarta obligaba a bajar hasta abajo, crearla y
     * subirla a mano.
     */
    const anadir = useCallback((tipo, donde) => {
        const nueva = tipo === 'texto'
            ? { id: idNuevo(), tipo: 'texto', contenido: '' }
            : { id: idNuevo(), tipo: 'sql', nombre: '', materializada: false, contenido: '' };
        const celdas = [...doc.celdas];
        const i = Number.isInteger(donde) ? donde : celdas.length;
        celdas.splice(Math.min(Math.max(i, 0), celdas.length), 0, nueva);
        emitir({ ...doc, celdas });
        setSeleccionada(nueva.id);
        // Una celda de texto recién creada entra escribiendo: nadie la crea para
        // mirarla vacía, y sin caja no hay nada que pulsar para empezar.
        if (tipo === 'texto') setEscribiendo(nueva.id);
    }, [doc, emitir]);

    // Se puede borrar la última: el hueco del final siempre está visible, así que
    // de un cuaderno vacío se sale añadiendo. Antes había que dejar una celda
    // huérfana porque no había otra forma de volver a tener una.
    const borrar = useCallback((id) => {
        emitir({ ...doc, celdas: doc.celdas.filter((c) => c.id !== id) });
    }, [doc, emitir]);

    const mover = useCallback((id, delta) => {
        const i = doc.celdas.findIndex((c) => c.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= doc.celdas.length) return;
        const celdas = [...doc.celdas];
        [celdas[i], celdas[j]] = [celdas[j], celdas[i]];
        emitir({ ...doc, celdas });
    }, [doc, emitir]);

    // Envueltas para que su identidad no cambie en cada pintado: `Canalon` es
    // `memo`, y una flecha escrita en el render lo deja sin efecto.
    const subir = useCallback((id) => mover(id, -1), [mover]);
    const bajar = useCallback((id) => mover(id, 1), [mover]);

    /**
     * Ejecuta una celda dejando su vista puesta.
     *
     * Ésta es la fase que justifica el formato: **nadie escribe un `CREATE`**.
     * Si la celda se puede envolver y no tiene nombre, se le pone uno aquí y
     * **se escribe en el documento**, porque a partir de ese momento existe de
     * verdad en la sesión y la celda de abajo puede escribir `FROM ese_nombre`.
     * Un nombre que viviera sólo en la memoria sería una vista fantasma.
     */
    const ejecutar = useCallback(async (id) => {
        const celda = doc.celdas.find((c) => c.id === id);
        if (!celda || celda.tipo !== 'sql' || !celda.contenido.trim()) return;

        // Los parámetros entran ANTES de analizar y de componer: lo que se
        // guarda en la vista es la consulta ya resuelta. Cambiar un parámetro
        // después no cambia la vista puesta, y por eso la celda pasa a estar
        // desactualizada y «Actualizar» la vuelve a poner.
        const texto = sustituirParametros(celda.contenido, doc.meta?.parametros);
        const an = analizarCelda(texto);

        // El bautizo, si hace falta, y antes de componer nada.
        let nombre = String(celda.nombre || '').trim();
        if (an.envolvible && !nombre) {
            const usados = doc.celdas.filter((c) => c.id !== id).map((c) => c.nombre);
            nombre = nombrePorOmision(usados);
            cambiarCelda(id, { nombre });
        }

        const { preparacion, lector, vista, deja } = componerCelda({
            sql: texto,
            analisis: an,
            nombre,
            descripcion: an.comentario,
            materializar: !!celda.materializada,
        });

        setCorriendo(id);
        onEjecutada?.();
        try {
            const pedir = (aceptarTapado) => pedirJson('/api/cuaderno/celda', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preparacion,
                    lector,
                    vista,
                    aceptarTapado,
                    limit: editorSettings?.queryResultLimit ?? 10000,
                }),
            });

            let r = await pedir(false);

            // El nombre tapa algo real. Se pregunta ANTES de haber ejecutado
            // nada: una vista temporal esconde a la tabla del mismo nombre
            // incluso escribiendo `main.ventas`, así que hacerlo en silencio
            // dejaría a quien escriba `FROM ventas` más abajo leyendo otra cosa
            // sin un solo error.
            if (r?.tapado) {
                const seguir = await dialog.confirmAsync({
                    title: `Ya existe ${r.tapado.tipo === 'tabla' ? 'una tabla' : 'una vista'} «${r.tapado.nombre}»`,
                    message: 'Si esta celda usa ese nombre, la tapará durante toda la sesión: '
                        + `lo que lea «FROM ${r.tapado.nombre}» verá el resultado de la celda y no `
                        + `${r.tapado.tipo === 'tabla' ? 'la tabla' : 'la vista'} original, `
                        + 'ni siquiera escribiendo el esquema delante. '
                        + 'Nada se borra, y al cerrar el proyecto vuelve todo a su sitio.',
                    confirmLabel: 'Taparla igualmente',
                    cancelLabel: 'Cambio el nombre',
                    destructive: true,
                });
                if (!seguir) { setCorriendo(null); return; }
                r = await pedir(true);
            }

            setResultados((prev) => ({
                ...prev,
                [id]: { ...(r || {}), consulta: texto, deja, vista },
            }));
            // Se anota lo ejecutado SÓLO si salió bien. Una celda que falló no
            // dejó su vista puesta, así que darla por ejecutada haría que las de
            // abajo se creyeran al día sobre algo que no existe.
            if (!r?.error) {
                setEjecuciones((prev) => ({ ...prev, [id]: { en: Date.now(), sql: texto } }));
            }
            if (preparacion) refrescarVistas();
            return !r?.error;
        } catch (e) {
            setResultados((prev) => ({ ...prev, [id]: { error: e?.message || String(e), consulta: texto, deja } }));
            return false;
        } finally {
            setCorriendo(null);
        }
    }, [doc.celdas, doc.meta, cambiarCelda, dialog, editorSettings, refrescarVistas, onEjecutada]);

    /**
     * Ejecuta lo que no está al día, en orden de dependencia.
     *
     * ## Por qué esto sustituye a «ejecutar todo» y a «ejecutar hacia abajo»
     *
     * Los dos suponían que **el orden de la pantalla es el de dependencia**, y
     * no lo es: una celda puede leer una vista que crea otra celda escrita más
     * abajo. Aquí el orden sale del grafo, así que da igual dónde estén.
     *
     * ## Por qué se dice antes de empezar
     *
     * Porque lo que va a pasar no se deduce mirando: son N celdas, en un orden
     * que no es el que se ve, y algunas quizá caras. Un botón que arranca a
     * ejecutar sin decir qué obliga a mirar el reloj y esperar a ver.
     */
    const actualizar = useCallback(async () => {
        const { orden, apartadas } = pendientes;
        if (!orden.length && !apartadas.length) return;

        const nombreDe = (id) => {
            const c = doc.celdas.find((x) => x.id === id);
            return String(c?.nombre || '').trim() || 'sin nombre';
        };

        const lineas = orden.map((id, i) => `${i + 1}. ${nombreDe(id)}`).join('\n');
        const aviso = apartadas.length
            ? `\n\nSe quedan fuera ${apartadas.length === 1 ? 'la celda' : `${apartadas.length} celdas`} `
              + `${apartadas.map((x) => `«${nombreDe(x.id)}»`).join(', ')}: `
              + 'escriben en el disco, y volver a ejecutarlas no es inofensivo. '
              + 'Si hace falta, se ejecutan a mano.'
            : '';

        // Sin nada que ejecutar el botón está apagado y esto no se alcanza; se
        // comprueba igual porque un botón apagado no es una garantía.
        if (!orden.length) return;

        const seguir = await dialog.confirmAsync({
            title: orden.length === 1 ? 'Actualizar una celda' : `Actualizar ${orden.length} celdas`,
            message: `En este orden, que es el de sus dependencias y no el de la pantalla:\n\n${lineas}${aviso}`,
            confirmLabel: 'Actualizar',
        });
        if (!seguir) return;

        for (const id of orden) {
            // En serie y parando al primer fallo: seguir ejecutando lo que
            // cuelga de algo que acaba de romperse sólo produce más errores, y
            // entierra el primero, que es el que explica todos los demás.
            if (!(await ejecutar(id))) break;
        }
    }, [pendientes, doc.celdas, dialog, ejecutar]);

    /**
     * Abrir y cerrar la pantalla completa, **volviendo por donde se estaba**.
     *
     * El desplazamiento de la lista se guarda al salir y se repone al volver.
     * Sin esto, ampliar la celda catorce y cerrar te devuelve al principio del
     * cuaderno, y hay que volver a buscarla: el precio de mirar una cosa de
     * cerca sería perder el sitio, que es exactamente lo que no debe costar.
     */
    const desplazamiento = useRef(0);
    const ampliar = useCallback((id) => {
        desplazamiento.current = document.querySelector('.cdn-lista')?.scrollTop ?? 0;
        setAPantalla(id);
    }, []);

    const volver = useCallback(() => {
        setAPantalla(null);
        // Tras el siguiente pintado: la lista todavía no existe en el DOM.
        requestAnimationFrame(() => {
            const lista = document.querySelector('.cdn-lista');
            if (lista) lista.scrollTop = desplazamiento.current;
        });
    }, []);

    const irA = useCallback((idCelda) => {
        // Desde la pantalla completa, ir a otra celda devuelve al cuaderno: es
        // lo que se está pidiendo al pulsar en el índice. Y el desplazamiento
        // espera al siguiente pintado, porque hasta entonces la lista no existe
        // en el DOM y `getElementById` devolvería nada.
        setAPantalla(null);
        setSeleccionada(idCelda);
        requestAnimationFrame(() => {
            document.getElementById(`cdn-${idCelda}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, []);

    /**
     * A un documento de Word.
     *
     * Se queda de todo lo que exportaba la notebook anterior, y es el unico que
     * se queda: **un tablero se proyecta, un documento circula**. Se comenta, se
     * firma, se adjunta, y el expediente de un analisis acaba muchas veces ahi.
     */
    const aWord = useCallback(async () => {
        if (sacando) return;

        // El exportador captura las figuras del DOM vivo, asi que una celda
        // plegada en «solo el codigo» no tiene nada que capturar. Se dice antes
        // y no despues: un grafico que falta en el documento no da ningun error
        // y se descubre cuando ya lo esta leyendo otra persona.
        const mudas = graficosQueNoSalen(doc.celdas, claves, estados);
        // `chooseAsync` y no `confirmAsync` porque hacen falta TRES salidas: con
        // el codigo, sin el, y no exportar. Con una pregunta de si o no, pulsar
        // Escape contaria como «sin el codigo» y el documento saldria igual.
        const elegido = await dialog.chooseAsync({
            title: 'Exportar a Word',
            options: [
                { value: 'con', label: 'Con las consultas', primary: true, description: 'El documento lleva el SQL de cada celda, como un anexo del analisis.' },
                { value: 'sin', label: 'Solo texto y resultados', description: 'Para quien lee las conclusiones y no el camino.' },
            ],
            cancelLabel: 'Ahora no',
            message: (mudas.length
                ? `${mudas.length === 1 ? 'La celda' : 'Las celdas'} ${mudas.map((n) => `«${n}»`).join(', ')} `
                  + `${mudas.length === 1 ? 'tiene' : 'tienen'} un grafico pero esta plegada en «solo el codigo», `
                  + 'asi que su figura no se puede capturar. Abrela antes si la quieres en el documento.\n\n'
                : '')
                + 'Cada celda aporta su texto y su tabla o su figura.',
        });
        if (!elegido?.value) return;

        setSacando('word');
        try {
            const { generateWordReport } = await import('../../utils/generateWordReport');
            await generateWordReport(
                celdasParaExportar(doc.celdas),
                resultados,
                elegido.value === 'sin',
                tituloDe(doc),
            );
        } catch (e) {
            toast.error(`No se pudo exportar: ${e?.message || e}`);
        } finally {
            setSacando(null);
        }
    }, [sacando, doc, claves, estados, resultados, dialog, toast]);

    /**
     * A un tablero de Report Flow.
     *
     * El texto se vuelve prosa y cada celda con grafico una diapositiva de
     * figura. **Que celdas tienen grafico se lee del estado, no de la pantalla**:
     * el puente anterior miraba el DOM, asi que una celda plegada o fuera de
     * vista no entraba y nadie sabia por que.
     */
    const aTablero = useCallback(async () => {
        if (sacando) return;
        const plan = planDeTablero(doc.celdas, claves, estados, resultados, tituloDe(doc));
        if (!plan.trozos.length) {
            toast.info(
                'Un tablero se hace con las celdas de texto y con las que tengan un grafico '
                + 'configurado y ejecutado. Escribe algo o construye una figura primero.',
            );
            return;
        }

        setSacando('tablero');
        try {
            const diapositivas = [];
            let carpeta = false;
            for (const t of plan.trozos) {
                if (t.clase === 'prosa') {
                    diapositivas.push({ raw: buildSlideRaw({ layout: 'content', prose: t.texto }) });
                    continue;
                }
                if (!carpeta) {
                    await fetch(`${API_BASE}/api/folder`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: 'charts' }),
                    });
                    carpeta = true;
                }
                await fetch(`${API_BASE}/api/file`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: t.archivo, content: t.contenido }),
                });
                diapositivas.push({ raw: buildSlideRaw({ layout: 'chart-full', chartSrc: t.archivo }) });
            }
            const cabecera = `---\ntitle: ${plan.nombre}\ntheme: dark\naspect: "16:9"\n---`;
            onCreateNew?.('amoxdeck', serializeDeck(cabecera, diapositivas));
        } catch (e) {
            toast.error(`No se pudo convertir: ${e?.message || e}`);
        } finally {
            setSacando(null);
        }
    }, [sacando, doc, claves, estados, resultados, toast, onCreateNew]);

    const ampliada = aPantalla ? doc.celdas.find((c) => c.id === aPantalla) : null;

    if (ampliada) {
        // La barra derecha se queda: el índice y las vistas vivas siguen siendo
        // útiles mientras se trabaja una celda de cerca, y quitarla convertiría
        // la pantalla completa en un sitio del que hay que salir para orientarse.
        return (
            <div className="cdn">
                <PantallaCompleta
                    celda={ampliada}
                    analisis={analisis[ampliada.id]}
                    resultado={resultados[ampliada.id]}
                    estado={estados[claves[ampliada.id]]}
                    corriendo={corriendo === ampliada.id}
                    theme={theme}
                    editorSettings={editorSettings}
                    onCambiar={cambiarCelda}
                    onEstado={cambiarEstado}
                    onEjecutar={ejecutar}
                    onCerrar={volver}
                    onCreateNew={onCreateNew}
                />
                <Barra
                    indice={indice}
                    vistas={vistas}
                    frescuras={frescuras}
                    usados={usados}
                    parametros={parametros}
                    onIrA={irA}
                    onRefrescar={refrescarVistas}
                    onParametro={cambiarParametro}
                />
            </div>
        );
    }

    /** El hueco entre dos celdas, que es donde se añade. */
    const hueco = (indice, fin = false) => (
        <div className={`cdn-hueco${fin ? ' cdn-hueco--fin' : ''}`} key={`h${indice}`}>
            <div className="cdn-hueco-btns">
                <button type="button" className="cdn-btn" onClick={() => anadir('sql', indice)}>
                    <LuPlus size={11} /> SQL
                </button>
                <button type="button" className="cdn-btn" onClick={() => anadir('texto', indice)}>
                    <LuFileText size={11} /> Texto
                </button>
            </div>
        </div>
    );

    return (
        <div className="cdn">
            <div className="cdn-lista">

                {/* ── la cabecera del documento ──────────────────────────────
                    Un cuaderno abierto dice primero cómo se llama y de qué va.
                    Las acciones del documento viven aquí y no al final de la
                    lista, donde flotaban a media página debajo de la última
                    celda. */}
                <div className="cdn-doc">
                    <div className="cdn-doc-txt">
                        <input
                            className="cdn-doc-titulo"
                            value={doc.meta?.titulo || ''}
                            placeholder="Sin título"
                            onChange={(e) => cambiarMeta('titulo', e.target.value)}
                        />
                        {/* Un `textarea` y no un `input`: una descripción larga
                            en un input se corta a media palabra, y lo único que
                            tiene que hacer esta línea es decirse entera de un
                            vistazo. Los saltos se quitan porque la cabecera del
                            archivo es de una línea por clave. */}
                        <textarea
                            className="cdn-doc-desc"
                            rows={1}
                            value={doc.meta?.descripcion || ''}
                            placeholder="Añade una descripción…"
                            onChange={(e) => cambiarMeta('descripcion', e.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
                            ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
                        />
                    </div>
                    <div className="cdn-doc-acciones">
                        {/* Sustituye a «ejecutar todo» y a «ejecutar hacia
                            abajo», que suponían que el orden de la pantalla es
                            el de dependencia. Aquí el orden lo pone el grafo. */}
                        <button
                            type="button"
                            className={`cdn-btn${pendientes.orden.length ? ' cdn-btn--pend' : ''}`}
                            onClick={actualizar}
                            disabled={!pendientes.orden.length}
                            title={pendientes.orden.length
                                ? 'Ejecutar lo que no está al día, en orden de dependencia'
                                : pendientes.apartadas.length
                                    ? 'Lo único que falta escribe en el disco: eso se ejecuta a mano'
                                    : 'Todo está al día'}
                        >
                            <LuRefreshCw size={12} />
                            Actualizar
                            {pendientes.orden.length > 0 && <span className="cdn-n">{pendientes.orden.length}</span>}
                        </button>
                        <button type="button" className="cdn-btn" onClick={() => onSave?.()} title="Guardar (Ctrl+S)">
                            <LuSave size={12} /> Guardar
                        </button>
                        <div className="cdn-grupo">
                            <button
                                type="button"
                                className="cdn-btn"
                                onClick={aWord}
                                disabled={!!sacando}
                                title="Un documento que circula: se comenta, se firma, se adjunta"
                            >
                                {sacando === 'word' ? <LuLoaderCircle size={12} className="spin" /> : <LuFileType2 size={12} />}
                                Word
                            </button>
                            <button
                                type="button"
                                className="cdn-btn"
                                onClick={aTablero}
                                disabled={!!sacando}
                                title="Llevar el texto y las figuras a un tablero de Report Flow"
                            >
                                {sacando === 'tablero' ? <LuLoaderCircle size={12} className="spin" /> : <LuPresentation size={12} />}
                                Tablero
                            </button>
                        </div>
                        {onToggleAi && (
                            <button type="button" className="cdn-btn" onClick={onToggleAi}>
                                {showAiSidebar ? <LuX size={12} /> : <LuBot size={12} />}
                                {showAiSidebar ? 'Cerrar Assist' : 'Assist'}
                            </button>
                        )}
                    </div>
                </div>

                {doc.celdas.map((c, i) => (
                    <Fragment key={c.id}>
                        {i > 0 && hueco(i)}
                        {/* `data-cell-id` es lo que busca el exportador a Word
                            para capturar la figura de cada celda. Sin el, el
                            documento sale con las tablas y sin ninguna figura, y
                            sin ningun error. */}
                        <div
                            id={`cdn-${c.id}`}
                            data-cell-id={c.id}
                            className={`cdn-fila${seleccionada === c.id ? ' cdn-fila--sel' : ''}`}
                            onFocusCapture={() => setSeleccionada(c.id)}
                            onMouseDown={() => setSeleccionada(c.id)}
                        >
                            <Canalon
                                celda={c}
                                analisis={analisis[c.id]}
                                resultado={resultados[c.id]}
                                frescura={frescuras.get(c.id)}
                                estado={estados[claves[c.id]]}
                                corriendo={corriendo === c.id}
                                onEstado={cambiarEstado}
                                onEjecutar={ejecutar}
                                onCambiar={cambiarCelda}
                                onSubir={subir}
                                onBajar={bajar}
                                onBorrar={borrar}
                                onAmpliar={ampliar}
                            />
                            {c.tipo === 'texto' ? (
                                <CeldaTexto
                                    celda={c}
                                    estado={estados[claves[c.id]]}
                                    escribiendo={escribiendo === c.id}
                                    onCambiar={cambiarCelda}
                                    onEscribir={setEscribiendo}
                                />
                            ) : (
                                <Celda
                                    celda={c}
                                    analisis={analisis[c.id]}
                                    resultado={resultados[c.id]}
                                    viva={estanVivas.has(String(c.nombre || '').toLowerCase())}
                                    frescura={frescuras.get(c.id)}
                                    enCiclo={ciclos.includes(c.id)}
                                    estado={estados[claves[c.id]]}
                                    theme={theme}
                                    editorSettings={editorSettings}
                                    onCambiar={cambiarCelda}
                                    onEstado={cambiarEstado}
                                    onEjecutar={ejecutar}
                                    onCreateNew={onCreateNew}
                                />
                            )}
                        </div>
                    </Fragment>
                ))}

                {/* El último hueco se queda siempre visible: es el «añadir al
                    final», y sin él un cuaderno vacío no tendría por dónde
                    empezar. */}
                {hueco(doc.celdas.length, true)}
            </div>

            <Barra
                indice={indice}
                vistas={vistas}
                frescuras={frescuras}
                usados={usados}
                parametros={parametros}
                onIrA={irA}
                onRefrescar={refrescarVistas}
                onParametro={cambiarParametro}
            />
        </div>
    );
};

export default CuadernoEditor;
