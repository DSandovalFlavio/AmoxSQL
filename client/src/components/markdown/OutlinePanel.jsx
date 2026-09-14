/**
 * OutlinePanel — la estructura del documento, en el margen izquierdo.
 *
 * No es una tarjeta: es el margen. Sin fondo propio, sin borde, sin esquinas
 * redondeadas — solo tipografía sobre el fondo de la aplicación y un filete de
 * acento en la sección donde está el cursor. Una tarjeta se lee como un widget
 * aparcado encima del documento; esto se lee como parte del documento.
 *
 * Dice cuánto trabajo lleva cada sección y deja reordenarlas arrastrando:
 * mover un título se lleva su contenido y sus subtítulos, en una sola edición
 * que se deshace de una vez.
 */
import { memo, useState } from 'react';
import { LuGripVertical, LuChevronUp, LuChevronDown, LuChevronLeft, LuSearch } from 'react-icons/lu';

function OutlinePanel({
    sections, activeLine, onGo, onMove, onMoveBy, onBuscar, git, gitFiable, onPlegar,
}) {
    const [dragging, setDragging] = useState(null);   // headingLine que se arrastra
    const [over, setOver] = useState(null);           // headingLine sobre el que se soltaría

    // La sección que contiene el cursor: la última que empieza antes que él.
    const activa = sections.reduce(
        (best, s) => (activeLine >= s.startLine && activeLine <= s.endLine ? s : best),
        null,
    );

    const onDrop = (destino) => {
        if (dragging && destino && dragging !== destino) onMove?.(dragging, destino);
        setDragging(null);
        setOver(null);
    };

    return (
        <nav className="mde-rail">
            <div className="mde-rail-head">
                <span>Estructura</span>
                {git?.size > 0 && !gitFiable && (
                    <span className="mde-outline-git-off" title="Guarda el documento para ver qué ha cambiado por sección">
                        sin guardar
                    </span>
                )}
                {onPlegar && (
                    <button className="mde-rail-plegar" title="Ocultar la estructura (Ctrl+Shift+O)" onClick={onPlegar}>
                        <LuChevronLeft size={13} />
                    </button>
                )}
            </div>

            {!sections.length && (
                <div className="mde-rail-empty">Sin títulos todavía.</div>
            )}

            {sections.map((s) => (
                <div key={s.headingLine} className="mde-rail-slot">
                    <div
                        className={[
                            'mde-rail-item',
                            `l${Math.min(s.level, 4)}`,
                            activa?.headingLine === s.headingLine ? 'active' : '',
                            dragging === s.headingLine ? 'dragging' : '',
                            over === s.headingLine ? 'over' : '',
                        ].filter(Boolean).join(' ')}
                        title={`${s.text} · línea ${s.headingLine}`}
                        draggable
                        onClick={() => onGo?.(s)}
                        onDragStart={() => setDragging(s.headingLine)}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                        onDragOver={(e) => { e.preventDefault(); setOver(s.headingLine); }}
                        onDragLeave={() => setOver(o => (o === s.headingLine ? null : o))}
                        onDrop={(e) => { e.preventDefault(); onDrop(s.headingLine); }}
                    >
                        <LuGripVertical size={11} className="mde-rail-grip" />
                        <span className="mde-rail-text">{s.text}</span>

                        {/* Arrastrar es cómodo con el ratón puesto; los botones son
                            lo que hace la acción descubrible y accesible. */}
                        <span className="mde-rail-moves">
                            <button
                                className="mde-rail-move"
                                title="Subir esta sección"
                                onClick={(e) => { e.stopPropagation(); onMoveBy?.(s.headingLine, 'up'); }}
                            >
                                <LuChevronUp size={11} />
                            </button>
                            <button
                                className="mde-rail-move"
                                title="Bajar esta sección"
                                onClick={(e) => { e.stopPropagation(); onMoveBy?.(s.headingLine, 'down'); }}
                            >
                                <LuChevronDown size={11} />
                            </button>
                        </span>

                        {/* Lo que ha cambiado desde el último commit. Solo con el
                            documento guardado: el diff habla del archivo en disco y
                            esto del documento en memoria, así que con cambios sin
                            guardar los números se desplazarían. */}
                        {gitFiable && git?.get(s.headingLine) && (
                            <span className="mde-rail-git" title="Cambios desde el último commit">
                                {git.get(s.headingLine).mas > 0 && <b className="mas">+{git.get(s.headingLine).mas}</b>}
                                {git.get(s.headingLine).menos > 0 && <b className="menos">−{git.get(s.headingLine).menos}</b>}
                            </span>
                        )}

                        {s.total > 0 && (
                            <span className={`mde-rail-frac${s.done === s.total ? ' ok' : ''}`}>{s.done}/{s.total}</span>
                        )}
                    </div>

                    {/* El progreso como barra de 2 px en vez de insignia: se ve de
                        reojo sin tener que leer un número. */}
                    {s.total > 0 && (
                        <div className={`mde-rail-bar l${Math.min(s.level, 4)}`}>
                            <i style={{ width: `${Math.round((s.done / s.total) * 100)}%` }} />
                        </div>
                    )}
                </div>
            ))}

            {onBuscar && (
                <div className="mde-rail-foot">
                    <button className="mde-rail-link" onClick={onBuscar}>
                        <LuSearch size={12} /> Buscar en el proyecto
                    </button>
                </div>
            )}
        </nav>
    );
}

/**
 * Memorizado a proposito. El contenedor de paneles guarda su ancho en estado en
 * cada fotograma mientras el arbol de archivos se pliega con su animacion, asi
 * que el editor entero se vuelve a dibujar quince veces por transicion. Esta
 * columna es cara —muchas filas, y cada icono es un elemento nuevo—, y nada
 * suyo cambia al mover ese borde: saltarse el render es lo que quita el tiron.
 */
export default memo(OutlinePanel);
