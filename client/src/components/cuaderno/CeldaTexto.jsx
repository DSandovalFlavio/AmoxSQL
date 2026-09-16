/**
 * Una celda de texto. **Sin caja.**
 *
 * Ni borde, ni fondo, ni cabecera, ni tope de altura: es el documento. Es el
 * cambio que hace que un cuaderno parezca un cuaderno y no un panel de control,
 * y lo comparten todas las herramientas que se leen bien.
 *
 * ## Por qué pierde el tope de altura
 *
 * Lo tenía para que un texto largo no empujara el cuaderno fuera de la pantalla,
 * y esa regla se cae con la caja: cortar la prosa con una barra de
 * desplazamiento en mitad de una frase es peor que dejarla correr. Poder
 * **recorrer los pasos** sigue funcionando, porque los pasos son las celdas de
 * SQL y ésas siguen midiendo todas lo mismo. Un texto no es un paso.
 *
 * ## Escribir y leer son el mismo sitio
 *
 * Doble clic y se escribe, encima del propio texto y con la misma tipografía y
 * el mismo tamaño; al salir, se compone. No hay dos columnas ni dos modos entre
 * los que saltar: eso pedía una caja, y ya no hay caja. El mando del canalón
 * permite quedarse en la fuente a propósito, y la pantalla completa sí tiene
 * sitio para ver las dos cosas a la vez.
 */
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import MarkdownPreview from '../markdown/MarkdownPreview';
import { MODOS } from './modos.js';
// El markdown se ve igual en todo el producto: se trae la hoja del editor de
// documentos en vez de escribir una propia. Sin ella, el ancla de los
// encabezados —que alli se oculta hasta pasar el raton— sale como una almohadilla
// suelta delante del titulo.
//
// `widthMode="full"` porque la vista previa trae de serie la maquetacion de una
// PAGINA: 860 px centrados con margenes automaticos. Aqui el ancho lo pone la
// fila, que ya lleva la medida de lectura.
import '../MarkdownEditor.css';

const CeldaTexto = ({
    celda,
    estado = {},
    escribiendo,        // esta celda es la que se esta editando ahora
    onCambiar,
    onEscribir,         // (id | null)
}) => {
    // Por omisión se enseña compuesta: una celda de texto se lee mucho más de lo
    // que se escribe. Es al revés que en una de SQL.
    const fijadaEnFuente = (estado.modo || MODOS.RESULTADO) === MODOS.CODIGO;
    const enFuente = fijadaEnFuente || escribiendo;
    const vacia = !String(celda.contenido || '').trim();
    const caja = useRef(null);

    /** El textarea crece con el texto: dentro de un documento no hay barras. */
    const ajustar = () => {
        const el = caja.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };
    useLayoutEffect(ajustar, [celda.contenido, enFuente]);

    useEffect(() => {
        if (escribiendo) caja.current?.focus();
    }, [escribiendo]);

    if (enFuente) {
        return (
            <div className="cdn-celda cdn-celda--texto">
                <textarea
                    ref={caja}
                    className="cdn-texto-fuente"
                    value={celda.contenido || ''}
                    spellCheck
                    placeholder="Escribe aquí. Los encabezados (#, ##, ###) construyen el índice de la derecha."
                    onChange={(e) => { onCambiar(celda.id, { contenido: e.target.value }); ajustar(); }}
                    // Salir compone el texto, salvo que el mando del canalón la
                    // tenga fijada en la fuente a propósito.
                    onBlur={() => { if (!fijadaEnFuente) onEscribir?.(null); }}
                />
            </div>
        );
    }

    return (
        <div className="cdn-celda cdn-celda--texto">
            <div
                className="cdn-md"
                onDoubleClick={() => onEscribir?.(celda.id)}
                title="Doble clic para escribir"
            >
                {vacia
                    ? <p className="cdn-md-vacio">Doble clic para escribir</p>
                    : <MarkdownPreview content={celda.contenido} widthMode="full" />}
            </div>
        </div>
    );
};

export default memo(CeldaTexto);
