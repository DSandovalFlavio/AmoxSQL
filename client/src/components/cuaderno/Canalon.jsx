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
import { memo } from 'react';
import {
    LuPlay, LuLoaderCircle, LuColumns2, LuCode, LuTable, LuEye, LuDatabase,
    LuMaximize2, LuChevronUp, LuChevronDown, LuTrash2,
} from 'react-icons/lu';
import { MODOS } from './modos.js';

/** Qué color tiene el punto, y qué se dice al posarse en él. */
function estadoDelPunto(resultado, frescura) {
    if (resultado?.error) return ['falla', 'Falló'];
    if (frescura === 'cambiada') return ['vieja', 'Se editó después de ejecutarla: lo que se ve es de antes'];
    if (frescura === 'arriba') return ['vieja', 'Algo de lo que depende cambió: lo que se ve es de antes'];
    if (frescura === 'dia') return ['dia', 'Al día'];
    return ['nunca', 'Sin ejecutar'];
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
}) => {
    const esSql = celda.tipo === 'sql';
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
                            title="Ejecutar (Ctrl+Enter)"
                        >
                            {corriendo ? <LuLoaderCircle size={13} className="spin" /> : <LuPlay size={12} />}
                        </button>
                    </div>
                </div>
            )}

            <div className="cdn-mandos">
                {/* El mando de tres posiciones, en vertical. Se lee peor así que
                    en horizontal, y es el precio de tener todo lo operativo en un
                    solo sitio en vez de repartido entre el canalón y la cabecera. */}
                {esSql ? (
                    <>
                        {mando(LuColumns2, 'Código y resultado', () => onEstado(celda.id, { modo: MODOS.AMBOS }),
                            modo === MODOS.AMBOS ? ' cdn-mando--on' : '')}
                        {mando(LuCode, 'Sólo el código', () => onEstado(celda.id, { modo: MODOS.CODIGO }),
                            modo === MODOS.CODIGO ? ' cdn-mando--on' : '')}
                        {mando(LuTable, 'Sólo el resultado', () => onEstado(celda.id, { modo: MODOS.RESULTADO }),
                            modo === MODOS.RESULTADO ? ' cdn-mando--on' : '')}
                    </>
                ) : (
                    /* En una celda de texto sólo hay dos sitios donde estar: el
                       texto o su fuente. Un tercero —las dos a la vez— dentro de
                       una prosa sin caja no significa nada; para eso está la
                       pantalla completa, que sí tiene sitio. */
                    mando(
                        modo === MODOS.CODIGO ? LuEye : LuCode,
                        modo === MODOS.CODIGO ? 'Ver el texto' : 'Ver la fuente',
                        () => onEstado(celda.id, { modo: modo === MODOS.CODIGO ? MODOS.RESULTADO : MODOS.CODIGO }),
                    )
                )}

                {esSql && puedeDejarVista && mando(
                    LuDatabase,
                    celda.materializada
                        ? 'Materializada: el resultado se guarda. Vuelve a ejecutarla si cambian los datos de origen'
                        : 'Materializar: guarda el resultado en vez de recalcularlo cada vez que se lea',
                    () => onCambiar(celda.id, { materializada: !celda.materializada }),
                    celda.materializada ? ' cdn-mando--on cdn-mando--sep' : ' cdn-mando--sep',
                )}

                {mando(LuMaximize2, 'Ocupar la pestaña entera', () => onAmpliar?.(celda.id),
                    esSql && puedeDejarVista ? '' : ' cdn-mando--sep')}

                {mando(LuChevronUp, 'Subir', () => onSubir(celda.id), ' cdn-mando--sep')}
                {mando(LuChevronDown, 'Bajar', () => onBajar(celda.id))}
                {mando(LuTrash2, 'Borrar', () => onBorrar(celda.id))}
            </div>
        </div>
    );
};

export default memo(Canalon);
