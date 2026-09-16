/**
 * Una celda de texto.
 *
 * **Se ajusta a su contenido, con 420 px de tope.** Ésa es la única diferencia
 * de forma con una de código, y no es un capricho: un encabezado suelto no debe
 * reservar 420 px de vacío, y un texto largo no debe empujar el resto del
 * cuaderno fuera de la pantalla. Crece hasta el tope y ahí se desplaza por
 * dentro.
 *
 * ## El mando es el mismo que en una celda de código
 *
 * Tres posiciones: la fuente, el texto compuesto, o las dos. No es una analogía
 * forzada — en una celda de SQL son «lo que escribo», «lo que sale» y «las dos
 * cosas», y aquí también. Una sola distinción que recordar para todo el
 * cuaderno, y se recuerda al cerrar y abrir igual que la de las otras.
 *
 * ## Para la prosa larga está la pantalla completa
 *
 * Documentar un análisis a fondo —el contexto, la metodología, lo que se
 * descartó— no cabe en una celda, y no debe: aquí se reconoce de qué va la sección,
 * y para escribirla se pide la pantalla entera, igual que con una consulta de
 * cuarenta líneas.
 */
import { memo } from 'react';
import {
    LuEye, LuCode, LuColumns2, LuTrash2, LuChevronUp, LuChevronDown, LuFileText, LuMaximize2,
} from 'react-icons/lu';
import MarkdownPreview from '../markdown/MarkdownPreview';
import { MODOS } from './modos.js';
// El markdown se ve igual en todo el producto: se trae la hoja del editor de
// documentos en vez de escribir una propia. Sin ella, el ancla de los
// encabezados —que alli se oculta hasta pasar el raton— sale como una almohadilla
// suelta delante del titulo.
//
// `widthMode="full"` porque la vista previa trae de serie la maquetacion de una
// PAGINA: 860 px centrados con margenes automaticos. En un documento es lo
// correcto; dentro de una celda dejaba 177 px muertos a cada lado.
import '../MarkdownEditor.css';

const CeldaTexto = ({
    celda,
    estado = {},
    seleccionada,
    onCambiar,
    onEstado,
    onBorrar,
    onSubir,
    onBajar,
    onSeleccionar,
    onAmpliar,
}) => {
    // Una celda de texto se lee más de lo que se escribe, así que por omisión se
    // enseña compuesta y no la fuente. Es al revés que en una de SQL, donde lo
    // normal es estar escribiendo.
    const modo = estado.modo || MODOS.RESULTADO;
    const vacia = !String(celda.contenido || '').trim();

    const mando = (valor, Icono, ayuda) => (
        <button
            type="button"
            className={`cdn-btn cdn-btn--icono${modo === valor ? ' cdn-btn--on' : ''}`}
            onClick={() => onEstado(celda.id, { modo: valor })}
            title={ayuda}
        ><Icono size={13} /></button>
    );

    const fuente = (
        <textarea
            className="cdn-texto-fuente"
            value={celda.contenido || ''}
            spellCheck
            placeholder="Escribe aquí. Los encabezados (#, ##, ###) construyen el índice de la derecha."
            onChange={(e) => onCambiar(celda.id, { contenido: e.target.value })}
        />
    );

    const compuesto = (
        <div
            className="cdn-md"
            onDoubleClick={() => onEstado(celda.id, { modo: MODOS.AMBOS })}
            title="Doble clic para escribir"
        >
            {vacia
                ? <span style={{ color: 'var(--text-disabled)', fontSize: 12 }}>Doble clic para escribir</span>
                : <MarkdownPreview content={celda.contenido} widthMode="full" />}
        </div>
    );

    return (
        <div
            className={`cdn-celda cdn-celda--texto${seleccionada ? ' cdn-celda--sel' : ''}`}
            onFocusCapture={() => onSeleccionar?.(celda.id)}
        >
            <div className="cdn-cab">
                <LuFileText size={12} style={{ color: 'var(--text-disabled)', flex: 'none' }} />
                <span className="cdn-desc" style={{ color: 'var(--text-secondary)' }}>
                    {primeraLinea(celda.contenido) || 'Texto'}
                </span>
                <span className="cdn-sp" />

                <div className="cdn-grupo">
                    {mando(MODOS.AMBOS, LuColumns2, 'Fuente y texto')}
                    {mando(MODOS.CODIGO, LuCode, 'Sólo la fuente')}
                    {mando(MODOS.RESULTADO, LuEye, 'Sólo el texto')}
                </div>

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
            </div>

            {modo === MODOS.AMBOS ? (
                <div className="cdn-texto-dos">
                    <div className="cdn-texto-cuerpo">{fuente}</div>
                    <div className="cdn-texto-cuerpo">{compuesto}</div>
                </div>
            ) : (
                <div className="cdn-texto-cuerpo">
                    {modo === MODOS.CODIGO ? fuente : compuesto}
                </div>
            )}
        </div>
    );
};

/** El primer encabezado o la primera línea, para la cabecera de la celda. */
function primeraLinea(texto) {
    for (const linea of String(texto || '').split('\n')) {
        const t = linea.trim();
        if (!t) continue;
        return t.replace(/^#{1,6}\s*/, '').slice(0, 70);
    }
    return '';
}

export default memo(CeldaTexto);
