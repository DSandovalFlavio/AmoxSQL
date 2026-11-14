/**
 * El canalón izquierdo de una celda: estado arriba, mandos debajo.
 *
 * ## Por qué los mandos no están en la cabecera
 *
 * Porque estaban **todos, siempre**. Diez controles por celda son ochenta en un
 * cuaderno de ocho, y en esa pantalla no hay análisis: hay una cabina. Peor aún,
 * el mando que de verdad se usa —Ejecutar— competía con nueve vecinos en vez de
 * ser el único encendido.
 *
 * Aquí el canalón está siempre, pero en reposo sólo lleva **el punto de estado**,
 * que es información y no un botón. Los mandos aparecen al pasar el ratón o al
 * seleccionar la celda. Es lo que hacen los cuadernos que se leen bien, y hace
 * que la cabecera de la celda pueda dedicarse a lo único que importa de lejos:
 * cómo se llama y qué deja detrás.
 *
 * ## El punto tiene cuatro estados, no dos
 *
 * Y es nuestro, no de las referencias: ninguna distingue «ejecutada» de
 * «ejecutada y luego editada». Ésa es justo la que deja un número viejo con
 * pinta de nuevo.
 */
import { memo, useEffect, useRef, useState } from 'react';
import {
    LuPlay, LuLoaderCircle, LuColumns2, LuCode, LuTable, LuEye, LuDatabase,
    LuMaximize2, LuChevronUp, LuChevronDown, LuTrash2, LuPencilLine,
    LuSparkles, LuMessageCircleQuestion, LuWrench, LuChartColumn, LuWandSparkles, LuPenLine, LuEllipsis,
} from 'react-icons/lu';
import { MODOS } from './modos.js';

/** Qué color tiene el punto, y qué se dice al posarse en él. */
function estadoDelPunto(resultado, frescura) {
    if (resultado?.error) return ['falla', 'Failed'];
    if (frescura === 'cambiada') return ['vieja', 'Edited after it ran: what you see is from before'];
    if (frescura === 'arriba') return ['vieja', 'Something it depends on changed: what you see is from before'];
    if (frescura === 'dia') return ['dia', 'Up to date'];
    return ['nunca', 'Never run'];
}

const Canalon = ({
    celda,
    analisis,
    resultado,
    frescura,
    estado = {},
    corriendo,
    onEstado,
    onEjecutar,
    onCambiar,
    onSubir,
    onBajar,
    onBorrar,
    onAmpliar,
    onAsistir,          // E3: (id, accion) → la pregunta al Assistant sobre esta celda
    resultadoArriba,    // E3: una celda de texto con un resultado justo encima
}) => {
    const esSql = celda.tipo === 'sql';
    // El menú «…» de la celda (Assist incluido). Se cierra al pulsar fuera.
    const [menu, setMenu] = useState(false);
    const zona = useRef(null);
    useEffect(() => {
        if (!menu) return undefined;
        const fuera = (e) => { if (!zona.current?.contains(e.target)) setMenu(false); };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [menu]);
    const pedir = (accion) => { setMenu(false); onAsistir?.(celda.id, accion); };
    const hacer = (fn) => { setMenu(false); fn(); };
    const [clase, ayuda] = esSql
        ? estadoDelPunto(resultado, frescura)
        : [null, null];
    const modo = estado.modo || (esSql ? MODOS.AMBOS : MODOS.RESULTADO);
    const puedeDejarVista = !!analisis?.envolvible;

    const mando = (Icono, ayudaBoton, alPulsar, extra = '') => (
        <button
            type="button"
            className={`cdn-mando${extra}`}
            onClick={alPulsar}
            title={ayudaBoton}
        ><Icono size={13} /></button>
    );

    return (
        <div className="cdn-canalon">
            {/* El punto de estado y «Ejecutar» comparten la primera ranura: en
                reposo se ve el punto, al acercarse se ve el botón. Ocupan el
                mismo sitio a propósito —el sitio donde miras para saber cómo
                está la celda es el mismo al que vas a pulsar para arreglarlo— y
                además así la ranura queda centrada con la cabecera de la celda.
                Antes el punto iba ENCIMA y empujaba el botón 16 px hacia abajo,
                que es lo que se veía torcido. */}
            {esSql && (
                <div className="cdn-ranura">
                    <span className={`cdn-est cdn-est--${clase}`} title={ayuda} />
                    <div className="cdn-mandos">
                        <button
                            type="button"
                            className="cdn-mando cdn-mando--corre"
                            onClick={() => onEjecutar(celda.id)}
                            disabled={corriendo || analisis?.vacia}
                            title="Run (Ctrl+Enter)"
                        >
                            {corriendo ? <LuLoaderCircle size={13} className="spin" /> : <LuPlay size={12} />}
                        </button>
                    </div>
                </div>
            )}

            <div className="cdn-mandos">
                {/* 6.0 (M5, U6): three controls instead of ten — Run (above), the view and
                    «…». The view is one button that steps through its positions; its tooltip
                    says what you see and what the next click shows. */}
                {esSql ? (() => {
                    const VISTAS = [
                        [MODOS.AMBOS, LuColumns2, 'Code and result'],
                        [MODOS.CODIGO, LuCode, 'Code only'],
                        [MODOS.RESULTADO, LuTable, 'Result only'],
                    ];
                    const i = Math.max(0, VISTAS.findIndex(v => v[0] === modo));
                    const [, Icono, nombre] = VISTAS[i];
                    const [sig, , nombreSig] = VISTAS[(i + 1) % VISTAS.length];
                    return mando(Icono, `${nombre} — click for ${nombreSig.toLowerCase()}`, () => onEstado(celda.id, { modo: sig }));
                })() : (
                    /* En una celda de texto sólo hay dos sitios donde estar: el
                       texto o su fuente. */
                    mando(
                        modo === MODOS.CODIGO ? LuEye : LuCode,
                        modo === MODOS.CODIGO ? 'Show the text' : 'Show the source',
                        () => onEstado(celda.id, { modo: modo === MODOS.CODIGO ? MODOS.RESULTADO : MODOS.CODIGO }),
                    )
                )}

                {/* Everything else, named, in one menu. */}
                <div ref={zona} style={{ position: 'relative' }}>
                    {mando(LuEllipsis, 'More: Assist, materialize, draft, move, delete', () => setMenu(v => !v), ` cdn-mando--sep${menu ? ' cdn-mando--on' : ''}`)}
                    {menu && (
                        <div className="cdn-asistir-menu" role="menu">
                            {/* E3: preguntar al Assistant por ESTA celda (N2). */}
                            {onAsistir && (esSql ? (
                                <>
                                    {resultado?.error && <button type="button" onClick={() => pedir('arreglar_celda')}><LuWrench size={13} /> Fix the error</button>}
                                    <button type="button" onClick={() => pedir('explicar_celda')}><LuMessageCircleQuestion size={13} /> Explain this cell</button>
                                    {resultado?.data?.length > 0 && <button type="button" onClick={() => pedir('graficar_celda')}><LuChartColumn size={13} /> Chart the result</button>}
                                </>
                            ) : (
                                <>
                                    {resultadoArriba && <button type="button" onClick={() => pedir('escribir_texto')}><LuPenLine size={13} /> Write from the result above</button>}
                                    <button type="button" onClick={() => pedir('mejorar_celda')}><LuWandSparkles size={13} /> Improve this text</button>
                                </>
                            ))}
                            {onAsistir && <div className="cdn-menu-sep" />}
                            <button type="button" onClick={() => hacer(() => onAmpliar?.(celda.id))}><LuMaximize2 size={13} /> Take the whole tab</button>
                            {esSql && puedeDejarVista && (
                                <button type="button" aria-pressed={!!celda.materializada}
                                    title={celda.materializada ? 'The result is stored. Run it again if the source data changes' : 'Store the result instead of recomputing it on every read'}
                                    onClick={() => hacer(() => onCambiar(celda.id, { materializada: !celda.materializada }))}>
                                    <LuDatabase size={13} /> {celda.materializada ? 'Materialized (click to undo)' : 'Materialize'}
                                </button>
                            )}
                            {/* 5.14 (J6): un borrador sigue corriendo, pero no se exporta. */}
                            <button type="button" aria-pressed={!!celda.borrador}
                                title={celda.borrador ? 'It runs, but stays out of Word and the deck' : 'It keeps running, but stays out of what you export'}
                                onClick={() => hacer(() => onCambiar(celda.id, { borrador: !celda.borrador }))}>
                                <LuPencilLine size={13} /> {celda.borrador ? 'Draft (click to include it again)' : 'Mark as draft'}
                            </button>
                            <div className="cdn-menu-sep" />
                            <button type="button" onClick={() => hacer(() => onSubir(celda.id))}><LuChevronUp size={13} /> Move up</button>
                            <button type="button" onClick={() => hacer(() => onBajar(celda.id))}><LuChevronDown size={13} /> Move down</button>
                            <button type="button" className="cdn-menu-peligro" onClick={() => hacer(() => onBorrar(celda.id))}><LuTrash2 size={13} /> Delete</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default memo(Canalon);
