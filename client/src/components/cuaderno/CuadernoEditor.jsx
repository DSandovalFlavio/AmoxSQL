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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuPlus, LuFileText, LuSave, LuBot, LuX, LuRefreshCw } from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { leerCuaderno, escribirCuaderno, indiceDe } from '../../utils/cuadernoFile.js';
import { analizarCelda } from '../../utils/celdaSql.js';
import { componerCelda, nombrePorOmision } from '../../utils/vistaDeCelda.js';
import { useDialog } from '../dialogs/DialogProvider';
import Celda from './Celda.jsx';
import Barra from './Barra.jsx';
import CeldaTexto from './CeldaTexto.jsx';
import { claveDeCelda, reclavar } from './claves.js';
import { cruzarVistas, parametrosUsados, sustituirParametros } from './vistasVivas.js';
import { construirGrafo, frescura, queActualizar, celdasEnCiclo } from './grafo.js';
import './cuaderno.css';

const idNuevo = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

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
    const dialog = useDialog();

    const refrescarVistas = useCallback(() => {
        fetch(`${API_BASE}/api/cuaderno/vistas`)
            .then((r) => r.json())
            .then((v) => setVivas(Array.isArray(v) ? v : []))
            .catch(() => { /* sin listado se sigue trabajando igual */ });
    }, []);

    useEffect(() => { refrescarVistas(); }, [refrescarVistas]);

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
        fetch(`${API_BASE}/api/notebook-state?path=${encodeURIComponent(filePath)}`)
            .then((r) => r.json())
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

    const cambiarEstado = useCallback((id, parcial) => {
        const clave = claves[id];
        if (!clave) return;
        setEstados((prev) => {
            const siguiente = { ...prev, [clave]: { ...(prev[clave] || {}), ...parcial } };
            persistirEstado(siguiente);
            return siguiente;
        });
    }, [claves, persistirEstado]);

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

    const anadir = useCallback((tipo) => {
        const nueva = tipo === 'texto'
            ? { id: idNuevo(), tipo: 'texto', contenido: '' }
            : { id: idNuevo(), tipo: 'sql', nombre: '', materializada: false, contenido: '' };
        // Detrás de la seleccionada, o al final. Añadir siempre al final obliga a
        // bajar a por la celda nueva cuando estás trabajando por la mitad.
        const i = doc.celdas.findIndex((c) => c.id === seleccionada);
        const celdas = [...doc.celdas];
        celdas.splice(i < 0 ? celdas.length : i + 1, 0, nueva);
        emitir({ ...doc, celdas });
        setSeleccionada(nueva.id);
    }, [doc, emitir, seleccionada]);

    const borrar = useCallback((id) => {
        if (doc.celdas.length <= 1) return;
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
            const pedir = (aceptarTapado) => fetch(`${API_BASE}/api/cuaderno/celda`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preparacion,
                    lector,
                    vista,
                    aceptarTapado,
                    limit: editorSettings?.queryResultLimit ?? 10000,
                }),
            }).then((r) => r.json());

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

    const irA = useCallback((idCelda) => {
        const el = document.getElementById(`cdn-${idCelda}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setSeleccionada(idCelda);
    }, []);

    return (
        <div className="cdn">
            <div className="cdn-lista">
                {doc.celdas.map((c) => (
                    <div key={c.id} id={`cdn-${c.id}`}>
                        {c.tipo === 'texto' ? (
                            <CeldaTexto
                                celda={c}
                                seleccionada={seleccionada === c.id}
                                onCambiar={cambiarCelda}
                                onBorrar={borrar}
                                onSubir={(id) => mover(id, -1)}
                                onBajar={(id) => mover(id, 1)}
                                onSeleccionar={setSeleccionada}
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
                                seleccionada={seleccionada === c.id}
                                corriendo={corriendo === c.id}
                                theme={theme}
                                editorSettings={editorSettings}
                                onCambiar={cambiarCelda}
                                onEstado={cambiarEstado}
                                onEjecutar={ejecutar}
                                onBorrar={borrar}
                                onSubir={(id) => mover(id, -1)}
                                onBajar={(id) => mover(id, 1)}
                                onSeleccionar={setSeleccionada}
                                onCreateNew={onCreateNew}
                            />
                        )}
                    </div>
                ))}

                <div className="cdn-anadir">
                    <button type="button" className="cdn-btn" onClick={() => anadir('sql')}>
                        <LuPlus size={12} /> Celda de SQL
                    </button>
                    <button type="button" className="cdn-btn" onClick={() => anadir('texto')}>
                        <LuFileText size={12} /> Texto
                    </button>
                    <span className="cdn-sp" />
                    {/* Sustituye a «ejecutar todo» y a «ejecutar hacia abajo»,
                        que suponían que el orden de la pantalla es el de
                        dependencia. Aquí el orden lo pone el grafo. */}
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
                    <button type="button" className="cdn-btn" onClick={() => onSave?.()}>
                        <LuSave size={12} /> Guardar
                    </button>
                    {onToggleAi && (
                        <button type="button" className="cdn-btn" onClick={onToggleAi}>
                            {showAiSidebar ? <LuX size={12} /> : <LuBot size={12} />}
                            {showAiSidebar ? 'Cerrar Assist' : 'Assist'}
                        </button>
                    )}
                </div>
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
