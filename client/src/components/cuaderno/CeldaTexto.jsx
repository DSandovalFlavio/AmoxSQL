/**
 * Una celda de texto.
 *
 * **Se ajusta a su contenido, con 280 px de tope.** Ésa es la única diferencia
 * de forma con una de código, y no es un capricho: un encabezado suelto no debe
 * reservar 280 px de vacío, y un texto largo no debe empujar el resto del
 * cuaderno fuera de la pantalla. Crece hasta el tope y ahí se desplaza por
 * dentro.
 *
 * ## Por qué aquí no se monta el editor de markdown entero
 *
 * El `MarkdownEditor` del producto trae tres columnas, índice, modo
 * concentración y su propia barra. Dentro de una caja de 280 px eso no cabe: se
 * vería el cromo y no el texto.
 *
 * Así que en la celda va **lo mínimo** —leer o escribir— y el editor completo se
 * monta en la pantalla completa (fase 5), que es donde hay sitio para él. Es la
 * misma idea que el resto del rediseño: en la lista se reconoce, y para trabajar
 * de verdad se pide espacio.
 */
import { memo, useState } from 'react';
import { LuEye, LuCode, LuTrash2, LuChevronUp, LuChevronDown, LuFileText } from 'react-icons/lu';
import MarkdownPreview from '../markdown/MarkdownPreview';
// El markdown se ve igual en todo el producto: se trae la hoja del editor de
// documentos en vez de escribir una propia. Sin ella, el ancla de los
// encabezados —que alli se oculta hasta pasar el raton— sale como una almohadilla
// suelta delante del titulo.
import '../MarkdownEditor.css';

const CeldaTexto = ({
    celda,
    seleccionada,
    onCambiar,
    onBorrar,
    onSubir,
    onBajar,
    onSeleccionar,
}) => {
    const [editando, setEditando] = useState(false);
    const vacia = !String(celda.contenido || '').trim();

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
                    <button
                        type="button"
                        className={`cdn-btn cdn-btn--icono${!editando ? ' cdn-btn--on' : ''}`}
                        onClick={() => setEditando(false)}
                        title="Leer"
                    ><LuEye size={13} /></button>
                    <button
                        type="button"
                        className={`cdn-btn cdn-btn--icono${editando ? ' cdn-btn--on' : ''}`}
                        onClick={() => setEditando(true)}
                        title="Escribir"
                    ><LuCode size={13} /></button>
                </div>
                <div className="cdn-grupo">
                    <button type="button" className="cdn-btn cdn-btn--icono" onClick={() => onSubir(celda.id)} title="Subir"><LuChevronUp size={13} /></button>
                    <button type="button" className="cdn-btn cdn-btn--icono" onClick={() => onBajar(celda.id)} title="Bajar"><LuChevronDown size={13} /></button>
                    <button type="button" className="cdn-btn cdn-btn--icono" onClick={() => onBorrar(celda.id)} title="Borrar"><LuTrash2 size={12} /></button>
                </div>
            </div>

            <div className="cdn-texto-cuerpo">
                {editando ? (
                    <textarea
                        className="cdn-texto-fuente"
                        value={celda.contenido || ''}
                        autoFocus
                        spellCheck
                        placeholder="Escribe aquí. Los encabezados (#, ##, ###) construyen el índice de la derecha."
                        onChange={(e) => onCambiar(celda.id, { contenido: e.target.value })}
                        // Al salir se vuelve a leer: escribir es el estado
                        // excepcional, leer es el normal.
                        onBlur={() => setEditando(false)}
                    />
                ) : (
                    <div
                        className="mde-preview-body cdn-md"
                        onDoubleClick={() => setEditando(true)}
                        title="Doble clic para escribir"
                    >
                        {vacia
                            ? <span style={{ color: 'var(--text-disabled)', fontSize: 12 }}>Doble clic para escribir</span>
                            : <MarkdownPreview content={celda.contenido} />}
                    </div>
                )}
            </div>
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
