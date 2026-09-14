/**
 * DeckInspector — la columna derecha del Studio: qué he seleccionado y qué
 * puedo hacerle.
 *
 * Fase 1 del rediseño (docs/dev/plan_studio_deck.md). El panel izquierdo de
 * antes contestaba *«¿qué objetos hay?»* con cuatro pestañas —láminas,
 * disposiciones, gráficos, imágenes— y esa es una pregunta que el usuario no
 * se hace. La que sí se hace es *«tengo esto delante, ¿cómo lo cambio?»*, y no
 * tenía dónde contestarse: la disposición, el tono y los campos del pie eran
 * tres directivas HTML que había que saberse de memoria y escribir a mano en
 * la vista Source.
 *
 * El reparto queda así: **izquierda navegación, derecha propiedades.** Las
 * disposiciones se mudan aquí porque son una propiedad de la lámina activa, no
 * un catálogo que se consulta.
 *
 * No lleva pestañas a propósito. Una pestaña es algo que el usuario tiene que
 * elegir; el contexto no se elige, se tiene.
 */
import { useMemo } from 'react';
import {
    LuLayoutTemplate, LuChartBar, LuHash, LuExternalLink, LuRefreshCw,
    LuPanelRightClose, LuPanelRightOpen, LuTriangleAlert, LuCheck,
} from 'react-icons/lu';
import { DECK_LAYOUT_GALLERY_BY_FAMILY, DECK_LAYOUT_META } from './deckLayoutPreviews';
import { FOOTER_FIELDS, resolveFooterFields, resolveTone } from '../../utils/deckParser';
import { regionesDe } from './deckRegions';

/** Cómo se llama cada campo del pie donde lo lee una persona. */
const NOMBRE_CAMPO = {
    source: 'Fuente',
    query: 'Consulta',
    rows: 'Filas devueltas',
    vars: 'Variables activas',
    refreshed: 'Refresco',
    number: 'Número de lámina',
};

const TONOS = [
    { id: 'theme', label: 'del tema' },
    { id: 'light', label: 'claro' },
    { id: 'dark', label: 'oscuro' },
];

function Grupo({ titulo, children }) {
    return (
        <div className="dki-grupo">
            <div className="dki-grupo-titulo">{titulo}</div>
            {children}
        </div>
    );
}

function Campo({ etiqueta, children }) {
    return (
        <div className="dki-campo">
            <span className="dki-campo-etiqueta">{etiqueta}</span>
            {children}
        </div>
    );
}

/**
 * Cuántas figuras se quedarían sin hueco al cambiar de disposición.
 *
 * El aviso es sobre FIGURAS y no sobre texto, y eso costó una corrección: la
 * primera versión comparaba qué partes de la prosa tenía cada disposición y
 * avisaba cuando no coincidían. Se veía razonable y estaba mal — las partes no
 * son trozos distintos de texto, son **vistas del mismo string**, y entre
 * todas cubren siempre la prosa entera. Pasar de hallazgo a portada no pierde
 * nada: `todo` renderiza lo mismo que `cabecera` + `resto` juntos. El aviso
 * saltaba en la mitad de la galería sin motivo, que es la forma más rápida de
 * enseñar a ignorar un aviso.
 *
 * Con las figuras sí ocurre de verdad: una rejilla admite cuatro y un hallazgo
 * una, así que al cambiar hay tres bloques ```amoxchart que se quedan en el
 * archivo sin nadie que los pinte.
 */
function figurasSinHueco(layoutNuevo, charts) {
    const cuantas = Array.isArray(charts) ? charts.length : 0;
    if (!cuantas) return 0;
    const hueco = regionesDe(layoutNuevo).find((r) => r.tipo === 'figura' || r.tipo === 'figuras');
    const capacidad = !hueco ? 0 : (hueco.tipo === 'figura' ? 1 : (hueco.tope || 4));
    return Math.max(0, cuantas - capacidad);
}

const DeckInspector = ({
    colapsado, onAlternarColapso,
    slide, layout, chartSrc, charts, frontMatter, deckFooter,
    seleccion, procedencia,
    onApplyLayout, onSetTone, onSetFooter, onRemoveChart, onRequestAddChart,
    onOpenFile,
}) => {
    const regiones = useMemo(() => regionesDe(layout), [layout]);
    const region = seleccion ? regiones.find((r) => r.id === seleccion) : null;
    const tono = resolveTone({ slideTone: slide?.tone, deckTone: frontMatter?.tone });
    const camposActivos = useMemo(
        () => resolveFooterFields({ slideFooter: slide?.footer, deckFooter, layout, hasChart: !!chartSrc }),
        [slide?.footer, deckFooter, layout, chartSrc],
    );
    const sinPie = layout === 'cover' || layout === 'closing';

    if (colapsado) {
        return (
            <div className="deck-inspector deck-inspector--colapsado">
                <button type="button" className="deck-inspector-expandir" onClick={onAlternarColapso} title="Mostrar el inspector">
                    <LuPanelRightOpen size={16} />
                </button>
            </div>
        );
    }

    if (!slide) {
        return (
            <div className="deck-inspector">
                <div className="deck-inspector-cabecera">
                    <span>Inspector</span>
                    <button type="button" onClick={onAlternarColapso} title="Ocultar el inspector"><LuPanelRightClose size={15} /></button>
                </div>
                <div className="deck-inspector-vacio">Sin lámina activa.</div>
            </div>
        );
    }

    // ── Qué se está mirando ──────────────────────────────────────────────
    const esFigura = region?.tipo === 'figura' || region?.tipo === 'figuras';
    const titulo = region ? region.nombre : (DECK_LAYOUT_META[layout]?.label || layout);
    const Icono = esFigura ? LuChartBar : (region ? LuHash : LuLayoutTemplate);

    const alternarCampo = (campo) => {
        const siguiente = camposActivos.includes(campo)
            ? camposActivos.filter((c) => c !== campo)
            : FOOTER_FIELDS.filter((c) => camposActivos.includes(c) || c === campo);
        // Lista vacía y `false` significan lo mismo para el lector del pie,
        // pero `false` es lo que el formato ya sabía decir.
        onSetFooter(siguiente.length ? siguiente : false);
    };

    return (
        <div className="deck-inspector">
            <div className="deck-inspector-cabecera">
                <Icono size={13} />
                <span>{titulo}</span>
                <button type="button" onClick={onAlternarColapso} title="Ocultar el inspector"><LuPanelRightClose size={15} /></button>
            </div>

            <div className="deck-inspector-cuerpo">

                {/* ── La región seleccionada ── */}
                {region && !esFigura && (
                    <Grupo titulo="La región">
                        <p className="dki-nota">{region.pista}</p>
                        <p className="dki-nota dki-nota--tenue">
                            Intro para editarla · Tab para pasar a la siguiente
                        </p>
                    </Grupo>
                )}

                {/* ── La figura ── */}
                {esFigura && (
                    <>
                        <Grupo titulo="Origen">
                            {chartSrc ? (
                                <>
                                    <div className="dki-valor dki-valor--mono">{chartSrc.split('/').pop()}</div>
                                    <div className="dki-botonera">
                                        <button type="button" onClick={onRequestAddChart}>Sustituir</button>
                                        <button type="button" onClick={() => onOpenFile?.(chartSrc)} title="Abrir el .amoxvis en Story Flow">
                                            <LuExternalLink size={12} /> Abrir
                                        </button>
                                    </div>
                                    <div className="dki-botonera">
                                        <button type="button" className="dki-boton--quitar" onClick={onRemoveChart}>Quitar la figura</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="dki-nota">Este hueco está vacío.</p>
                                    <div className="dki-botonera">
                                        <button type="button" onClick={onRequestAddChart}>Elegir una figura</button>
                                    </div>
                                </>
                            )}
                        </Grupo>

                        {chartSrc && (
                            <Grupo titulo="Presentación">
                                <p className="dki-nota dki-nota--tenue">
                                    La figura entra sin su tarjeta: la lámina ya es la tarjeta. Se recupera
                                    con <code>card: true</code> en el bloque, y el interruptor llega con los
                                    formularios de bloque.
                                </p>
                            </Grupo>
                        )}

                        {procedencia && (
                            <Grupo titulo="Frescura">
                                <Campo etiqueta="Filas">
                                    <span className="dki-valor">
                                        {procedencia.rows ?? '—'}{procedencia.limited ? ' (recortadas)' : ''}
                                    </span>
                                </Campo>
                                <Campo etiqueta="Ejecutada">
                                    <span className="dki-valor">
                                        {procedencia.at ? new Date(procedencia.at).toLocaleString() : '—'}
                                    </span>
                                </Campo>
                                <p className="dki-nota dki-nota--tenue">
                                    <LuRefreshCw size={10} /> «Refrescar» vuelve a ejecutar la consulta de todas las figuras.
                                </p>
                            </Grupo>
                        )}
                    </>
                )}

                {/* ── La lámina ── siempre, porque siempre hay una */}
                <Grupo titulo="Disposición">
                    {DECK_LAYOUT_GALLERY_BY_FAMILY.map((familia) => (
                        <div key={familia.key} className="dki-familia">
                            <div className="dki-familia-label">{familia.label}</div>
                            <div className="dki-rejilla">
                                {familia.items.map((item) => {
                                    const sueltas = item.id === layout ? 0 : figurasSinHueco(item.id, charts);
                                    const aviso = sueltas === 1
                                        ? 'Una figura se quedaría sin hueco donde pintarse (no se borra del archivo).'
                                        : `${sueltas} figuras se quedarían sin hueco donde pintarse (no se borran del archivo).`;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={`dki-lay${item.id === layout ? ' dki-lay--on' : ''}`}
                                            onClick={() => onApplyLayout(item.id)}
                                            title={sueltas ? `${item.hint}\n\nOjo: ${aviso}` : item.hint}
                                        >
                                            {item.Preview ? <item.Preview /> : null}
                                            <span className="dki-lay-label">{item.label}</span>
                                            {sueltas > 0 && (
                                                <span className="dki-lay-aviso" title={aviso}>
                                                    <LuTriangleAlert size={10} />
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </Grupo>

                <Grupo titulo="Tono">
                    <div className="dki-seg">
                        {TONOS.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                className={tono === t.id ? 'dki-seg--on' : ''}
                                onClick={() => onSetTone(t.id === 'theme' ? null : t.id)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <p className="dki-nota dki-nota--tenue">
                        «Del tema» sigue al claro u oscuro de la aplicación. Los otros dos mandan pase donde pase.
                    </p>
                </Grupo>

                <Grupo titulo="Pie de procedencia">
                    {sinPie ? (
                        <p className="dki-nota dki-nota--tenue">
                            Ni la portada ni el cierre llevan pie: ya enseñan fuente y fecha en grande.
                        </p>
                    ) : (
                        FOOTER_FIELDS.map((campo) => (
                            <label key={campo} className="dki-casilla">
                                <input
                                    type="checkbox"
                                    checked={camposActivos.includes(campo)}
                                    onChange={() => alternarCampo(campo)}
                                />
                                <i>{camposActivos.includes(campo) && <LuCheck size={10} />}</i>
                                {NOMBRE_CAMPO[campo]}
                            </label>
                        ))
                    )}
                </Grupo>

            </div>
        </div>
    );
};

export default DeckInspector;
