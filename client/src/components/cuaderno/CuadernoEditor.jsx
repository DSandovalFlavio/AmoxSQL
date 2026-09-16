/**
 * El cuaderno.
 *
 * Sigue siendo una lista de celdas que se recorre hacia abajo —quitar eso fue un
 * error de la primera versión del rediseño: en pleno análisis hace falta echar
 * la vista atrás a ver qué clasificó aquel `CASE`—. Lo que cambia es que **las
 * celdas miden todas lo mismo**, que cada una decide qué enseña, y que a la
 * derecha hay un índice que se mantiene solo.
 *
 * ## Lo que esta fase trae y lo que no
 *
 * Trae la celda: su altura, su mando de tres posiciones, su reparto y el índice.
 * **La vista implícita es la fase 2**, así que por ahora una celda se ejecuta tal
 * cual se escribe; el nombre ya se puede poner y es lo que después creará la
 * vista.
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
import { LuPlus, LuFileText, LuSave, LuBot, LuX } from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { leerCuaderno, escribirCuaderno, indiceDe } from '../../utils/cuadernoFile.js';
import { analizarCelda } from '../../utils/celdaSql.js';
import Celda from './Celda.jsx';
import CeldaTexto from './CeldaTexto.jsx';
import { claveDeCelda, reclavar } from './claves.js';
import './cuaderno.css';

const idNuevo = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const CuadernoEditor = ({
    content,
    onChange,
    onRunQuery,
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

    // ── análisis de cada celda: de aquí salen la descripción y, en la fase 4,
    //    el grafo. Se recalcula sólo cuando cambia el SQL. ────────────────────
    const analisis = useMemo(() => {
        const mapa = {};
        for (const c of doc.celdas) {
            if (c.tipo === 'sql') mapa[c.id] = analizarCelda(c.contenido);
        }
        return mapa;
    }, [doc.celdas]);

    const indice = useMemo(() => indiceDe(doc), [doc]);

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

    const ejecutar = useCallback(async (id) => {
        const celda = doc.celdas.find((c) => c.id === id);
        if (!celda || celda.tipo !== 'sql' || !celda.contenido.trim()) return;
        setCorriendo(id);
        try {
            const r = await onRunQuery?.(celda.contenido);
            setResultados((prev) => ({ ...prev, [id]: { ...(r || {}), consulta: celda.contenido } }));
        } finally {
            setCorriendo(null);
        }
    }, [doc.celdas, onRunQuery]);

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

            {/* La barra derecha. En esta fase sólo el índice; las vistas vivas y
                los parámetros llegan en la fase 3, cuando haya vistas que listar. */}
            <div className="cdn-lado">
                <div className="cdn-seccion">
                    Índice <span className="cdn-sp" /><span className="cdn-n">{indice.length}</span>
                </div>
                {indice.length > 0 ? (
                    <div className="cdn-indice">
                        {indice.map((e, i) => (
                            <button
                                key={`${e.celda}-${i}`}
                                type="button"
                                className={`cdn-idx cdn-idx--${e.nivel}`}
                                onClick={() => irA(e.celda)}
                                title={e.texto}
                            >
                                {e.texto}
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="cdn-lista-vacia">
                        Los encabezados de las celdas de texto —<code>#</code>, <code>##</code>,
                        <code> ###</code>— construyen este índice.
                    </p>
                )}
            </div>
        </div>
    );
};

export default CuadernoEditor;
