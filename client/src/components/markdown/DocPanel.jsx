/**
 * DocPanel — la columna derecha: todo lo que responde a «qué es este documento».
 *
 * Antes esto estaba repartido en tres sitios: una tira de metadatos sobre el
 * texto, un panel de pendientes escondido tras un botón y cuatro iconos sueltos
 * en la barra. Aquí va junto y en el orden en que un ingeniero lo pregunta:
 *
 *   de quién es y si vale  →  qué falta  →  con qué se conecta  →  qué puedo hacer
 *
 * Sin tarjetas: bloques separados por filetes, porque un panel de propiedades
 * no es una colección de objetos, es una sola cosa con apartados.
 *
 * **La regla del panel vacío.** Un `.md` recién creado no tiene cabecera, ni
 * tareas, ni enlaces. Tres bloques vacíos son peores que ningún panel, así que
 * lo que no tiene contenido no se dibuja, y el panel crece con el documento.
 */
import { memo, useState } from 'react';
import {
    LuDownload, LuSearch, LuSave, LuCheck, LuArrowRight, LuArrowLeft,
    LuFileText, LuWorkflow, LuNotebook, LuChartColumn, LuPresentation,
    LuDatabase, LuPlus, LuAlignCenter, LuStretchHorizontal,
} from 'react-icons/lu';
import DocHeader from './DocHeader';
import TasksPanel from './TasksPanel';

// Cada formato con su icono: el panel de enlaces se lee de un vistazo sin
// tener que descifrar la extensión.
const ICONO_POR_EXT = {
    sql: LuDatabase, sqlnb: LuNotebook, sqlchain: LuWorkflow,
    amoxvis: LuChartColumn, amoxdeck: LuPresentation, md: LuFileText,
};

function iconoDe(ruta) {
    return ICONO_POR_EXT[ruta.split('.').pop()?.toLowerCase()] || LuFileText;
}

function hoyIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function DocPanel({
    meta, umbralMeses, onCambiarMeta, onAnadirCabecera,
    tareas = [], onToggleTask, onIrALinea,
    enlaces = [], retroenlaces = [], onAbrir,
    currentPath, tasksToken,
    onBuscar, onExportar, exportando, onGuardarComo, widthMode, onAncho,
}) {
    const [pestana, setPestana] = useState('documento');

    const hechas = tareas.filter(t => t.done).length;
    const hoy = hoyIso();

    return (
        <aside className="mde-panel">

            {/* ── De quién es y si vale ── */}
            {meta ? (
                <div className="mde-panel-grp">
                    <div className="mde-panel-title"><span>Documento</span></div>
                    <DocHeader meta={meta} umbralMeses={umbralMeses} onCambiar={onCambiarMeta} />
                </div>
            ) : (
                <div className="mde-panel-grp">
                    <button className="mde-panel-vacio" onClick={onAnadirCabecera}>
                        <LuPlus size={12} />
                        Añadir dueño y fecha de revisión
                    </button>
                </div>
            )}

            {/* ── Qué falta ── */}
            {(tareas.length > 0 || pestana === 'proyecto') && (
                <div className="mde-panel-grp mde-panel-grp--tareas">
                    <div className="mde-panel-title">
                        <span>Tareas</span>
                        {pestana === 'documento' && tareas.length > 0 && (
                            <span className={`mde-panel-cnt${hechas === tareas.length ? ' ok' : ''}`}>
                                {hechas}/{tareas.length}
                            </span>
                        )}
                    </div>

                    {/* Los pendientes del proyecto eran un botón más de la barra.
                        Aquí son la otra cara de la misma pregunta: qué falta. */}
                    <div className="mde-panel-tabs">
                        <button
                            className={pestana === 'documento' ? 'on' : ''}
                            onClick={() => setPestana('documento')}
                        >
                            Este documento
                        </button>
                        <button
                            className={pestana === 'proyecto' ? 'on' : ''}
                            onClick={() => setPestana('proyecto')}
                        >
                            Proyecto
                        </button>
                    </div>

                    {pestana === 'documento' ? (
                        <div className="mde-panel-tareas">
                            {tareas.map(t => (
                                <div
                                    key={t.line}
                                    className={`mde-panel-tarea${t.done ? ' hecha' : ''}`}
                                    onClick={() => onIrALinea?.(t.line)}
                                    title={`Line ${t.line}`}
                                >
                                    <button
                                        className={`mde-panel-box${t.done ? ' on' : ''}`}
                                        title={t.done ? 'Desmarcar' : 'Marcar como hecha'}
                                        onClick={(e) => { e.stopPropagation(); onToggleTask?.(t.line); }}
                                    >
                                        {t.done && <LuCheck size={9} strokeWidth={3.5} />}
                                    </button>
                                    <span className="mde-panel-tarea-txt">
                                        {t.text}
                                        {t.owner && <span className="mde-panel-owner">@{t.owner}</span>}
                                        {t.due && (
                                            <span className={`mde-panel-due${!t.done && t.due < hoy ? ' vencida' : ''}`}>
                                                vence {t.due}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <TasksPanel onOpenFile={onAbrir} currentPath={currentPath} reloadToken={tasksToken} embebido />
                    )}
                </div>
            )}

            {/* ── Con qué se conecta ──
                Sale y entra se distinguen porque la pregunta real es «si toco
                esto, ¿a quién rompo?», y esa la contestan los que entran. */}
            {(enlaces.length > 0 || retroenlaces.length > 0) && (
                <div className="mde-panel-grp">
                    <div className="mde-panel-title"><span>Enlaces</span></div>
                    {enlaces.map(e => {
                        const Icono = iconoDe(e.path);
                        return (
                            <button key={`s-${e.path}`} className="mde-panel-link" title={e.path} onClick={() => onAbrir?.(e.path)}>
                                <Icono size={12} />
                                <span className="mde-panel-link-n">{e.text}</span>
                                <LuArrowRight size={10} className="mde-panel-link-d" />
                            </button>
                        );
                    })}
                    {retroenlaces.map(r => (
                        <button key={`e-${r.path}`} className="mde-panel-link" title={`${r.path} enlaza a este documento`} onClick={() => onAbrir?.(r.path)}>
                            <LuFileText size={12} />
                            <span className="mde-panel-link-n">{r.title || r.path.split('/').pop()}</span>
                            <LuArrowLeft size={10} className="mde-panel-link-d entra" />
                        </button>
                    ))}
                </div>
            )}

            {/* ── Qué puedo hacer con él ──
                Verbos con nombre, no iconos mudos: un icono de descarga a secas
                no dice si exporta el documento, la selección o el proyecto. */}
            <div className="mde-panel-grp">
                <div className="mde-panel-title"><span>Acciones</span></div>
                {onBuscar && (
                    <button className="mde-panel-act" onClick={onBuscar}>
                        <LuSearch size={13} /> <span>Buscar en el proyecto</span>
                        <kbd>Ctrl+Shift+F</kbd>
                    </button>
                )}
                <button className="mde-panel-act" onClick={onExportar} disabled={exportando}>
                    <LuDownload size={13} /> {exportando ? 'Exportando…' : 'Exportar a PDF'}
                </button>
                {onGuardarComo && (
                    <button className="mde-panel-act" onClick={onGuardarComo}>
                        <LuSave size={13} /> Guardar como…
                    </button>
                )}
                {/* La medida del lienzo es fija, así que el ancho solo afecta a
                    la lectura. Sobrevive como excepción para los documentos con
                    tablas anchas, que es justo cuando estorba leer a 66. */}
                {onAncho && (
                    <button className="mde-panel-act" onClick={onAncho}>
                        {widthMode === 'full' ? <LuAlignCenter size={13} /> : <LuStretchHorizontal size={13} />}
                        {widthMode === 'full' ? 'Ancho de lectura' : 'Ancho completo'}
                    </button>
                )}
            </div>
        </aside>
    );
}

/**
 * Memorizado a proposito. El contenedor de paneles guarda su ancho en estado en
 * cada fotograma mientras el arbol de archivos se pliega con su animacion, asi
 * que el editor entero se vuelve a dibujar quince veces por transicion. Esta
 * columna es cara —muchas filas, y cada icono es un elemento nuevo—, y nada
 * suyo cambia al mover ese borde: saltarse el render es lo que quita el tiron.
 */
export default memo(DocPanel);
