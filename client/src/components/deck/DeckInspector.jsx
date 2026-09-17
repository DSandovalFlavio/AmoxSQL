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
import { useMemo, useState, useEffect, useRef } from 'react';
import {
    LuLayoutTemplate, LuChartBar, LuHash, LuExternalLink, LuRefreshCw,
    LuPanelRightClose, LuPanelRightOpen, LuTriangleAlert, LuCheck, LuPalette,
} from 'react-icons/lu';
import { DECK_LAYOUT_GALLERY_BY_FAMILY, DECK_LAYOUT_META } from './deckLayoutPreviews';
import { FOOTER_FIELDS, resolveFooterFields, resolveTone } from '../../utils/deckParser';
import { regionesDe, leerParte, escribirParte } from './deckRegions';
import { bloquesDe, BLOQUES } from './deckBlockModel';
import DeckBlockForm from './DeckBlockForm';
import { VIBRANT_ACCENTS, SOBER_ACCENTS } from '../../accents.js';
import { COLOR_PALETTES } from '../DataVisualizer/constants';
import { medirAcentos, PISO_CONTRASTE } from './deckColor';

/** Cómo se llama cada campo del pie donde lo lee una persona. */
const NOMBRE_CAMPO = {
    source: 'Source',
    query: 'Query',
    rows: 'Rows returned',
    vars: 'Active variables',
    refreshed: 'Refreshed',
    number: 'Slide number',
};

const TONOS = [
    { id: 'theme', label: 'from the theme' },
    { id: 'light', label: 'light' },
    { id: 'dark', label: 'dark' },
];

/**
 * Un campo de texto del front-matter. Confirma al salir y con Intro, y `Esc`
 * devuelve lo que habia: escribir en la cabecera del archivo en cada pulsacion
 * reescribiria el documento entero letra a letra.
 */
function CampoTexto({ etiqueta, valor, placeholder, onCommit }) {
    const [borrador, setBorrador] = useState(valor || '');
    const refValor = useRef(valor);
    useEffect(() => { if (refValor.current !== valor) { refValor.current = valor; setBorrador(valor || ''); } }, [valor]);

    const confirmar = () => {
        const limpio = borrador.trim();
        if (limpio === (valor || '')) return;
        onCommit(limpio || null);
    };

    return (
        <div className="dki-texto">
            <span className="dki-campo-etiqueta">{etiqueta}</span>
            <input
                type="text"
                value={borrador}
                placeholder={placeholder}
                onChange={(e) => setBorrador(e.target.value)}
                onBlur={confirmar}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.currentTarget.blur(); }
                    if (e.key === 'Escape') { setBorrador(valor || ''); e.currentTarget.blur(); }
                }}
            />
        </div>
    );
}

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


/**
 * El ámbito «deck»: lo que vale para toda la presentación y no para una lámina.
 *
 * Es el hueco más grande de los cinco de la auditoría porque hasta ahora **no
 * existía interfaz**: acento, paleta, tono, autor, periodo y fecha se tocaban
 * escribiendo YAML en la vista Source, con la ortografía exacta de cada clave.
 *
 * Todo lo de aquí escribe en el front-matter y nada más; ver la nota de
 * `setFrontMatterKeys` sobre por qué se edita línea a línea.
 */
function PanelDeck({ frontMatter, onSetFrontMatter }) {
    const fm = frontMatter || {};
    const tonoDeck = ['light', 'dark'].includes(String(fm.tone || '').toLowerCase())
        ? String(fm.tone).toLowerCase() : 'theme';

    // Se mide contra la lámina de verdad, no contra el tema: una lámina con el
    // tono invertido tiene el lienzo al revés y el acento que ahí se lee es
    // otro. Se recalcula cuando cambia el tono, que es cuando cambia el fondo.
    // La lámina se busca en el DOM en vez de encadenar un `ref` por tres
    // componentes para una medición: es exactamente el elemento que queremos y
    // nadie más lo pinta.
    //
    // Y se mide en un efecto, no en un `useMemo`. Un memo se evalúa DURANTE el
    // render, cuando el navegador todavía no ha repintado la lámina con el tono
    // nuevo: el contraste saldría medido contra el fondo anterior y el aviso
    // llegaría siempre un paso tarde. Medir el DOM es sincronizarse con un
    // sistema externo, que es justo para lo que está un efecto.
    const [medidas, setMedidas] = useState(() => new Map());
    useEffect(() => {
        setMedidas(medirAcentos(
            [...VIBRANT_ACCENTS, ...SOBER_ACCENTS],
            document.querySelector('.deck-design-canvas .deck-slide'),
        ));
    }, [tonoDeck, fm.accent]);

    const paletas = useMemo(() => Object.keys(COLOR_PALETTES), []);
    const paletaActual = fm.palette && COLOR_PALETTES[fm.palette] ? fm.palette : '';

    const muestra = (acento) => {
        const m = medidas.get(acento.id);
        const elegido = fm.accent === acento.id;
        return (
            <button
                key={acento.id}
                type="button"
                className={`dki-muestra${elegido ? ' dki-muestra--on' : ''}${m && !m.pasa ? ' dki-muestra--flojo' : ''}`}
                style={{ backgroundColor: m?.color || acento.color }}
                onClick={() => onSetFrontMatter({ accent: elegido ? null : acento.id })}
                title={m?.razon
                    ? `${acento.label} — ${m.razon.toFixed(2)}:1 sobre el lienzo${m.pasa ? '' : `, por debajo del piso de ${PISO_CONTRASTE}:1`}`
                    : acento.label}
            >
                {m && !m.pasa && <LuTriangleAlert size={9} />}
            </button>
        );
    };

    const flojos = [...VIBRANT_ACCENTS, ...SOBER_ACCENTS]
        .filter((a) => medidas.get(a.id) && !medidas.get(a.id).pasa).length;

    return (
        <>
            <Grupo titulo="Identity">
                <CampoTexto etiqueta="Title" valor={fm.title} placeholder="The deck title" onCommit={(v) => onSetFrontMatter({ title: v })} />
                <CampoTexto etiqueta="Section thread" valor={fm.section} placeholder="Shows up as the eyebrow" onCommit={(v) => onSetFrontMatter({ section: v })} />
            </Grupo>

            <Grupo titulo="Colour">
                <span className="dki-campo-etiqueta">Accent</span>
                <div className="dki-muestras">
                    {VIBRANT_ACCENTS.map(muestra)}
                    {SOBER_ACCENTS.map(muestra)}
                </div>
                {flojos > 0 && (
                    <p className="dki-nota dki-nota--aviso">
                        <LuTriangleAlert size={10} /> {flojos} {flojos === 1 ? 'accent does not reach' : 'accents do not reach'}
                        {' '}{PISO_CONTRASTE}:1 on this canvas. Projected in a room they disappear.
                    </p>
                )}
                <p className="dki-nota dki-nota--tenue">With no accent chosen, the deck follows the app.</p>

                <span className="dki-campo-etiqueta">Figure palette</span>
                <select
                    className="dki-select"
                    value={paletaActual}
                    onChange={(e) => onSetFrontMatter({ palette: e.target.value || null })}
                >
                    <option value="">each figure keeps its own</option>
                    {paletas.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {paletaActual && (
                    <div className="dki-tira">
                        {COLOR_PALETTES[paletaActual].slice(0, 8).map((c, i) => (
                            <i key={`${c}-${i}`} style={{ backgroundColor: c }} />
                        ))}
                    </div>
                )}
                <p className="dki-nota dki-nota--tenue">
                    La paleta del deck manda sobre la que traiga cada `.amoxvis`: si no, dos figuras
                    guardadas en sesiones distintas discrepan dentro de la misma lámina.
                </p>

                <span className="dki-campo-etiqueta">Tone</span>
                <div className="dki-seg">
                    {TONOS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            className={tonoDeck === t.id ? 'dki-seg--on' : ''}
                            onClick={() => onSetFrontMatter({ tone: t.id === 'theme' ? null : t.id })}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </Grupo>

            <Grupo titulo="Provenance">
                <CampoTexto etiqueta="Author" valor={fm.author} placeholder="Who signs the analysis" onCommit={(v) => onSetFrontMatter({ author: v })} />
                <CampoTexto etiqueta="Period" valor={fm.period} placeholder="Feb–Aug 2024" onCommit={(v) => onSetFrontMatter({ period: v })} />
                <CampoTexto etiqueta="Data cutoff" valor={fm.date} placeholder="14 Aug 2024" onCommit={(v) => onSetFrontMatter({ date: v })} />
                <CampoTexto etiqueta="Source" valor={fm.source} placeholder="Data/dataset.csv" onCommit={(v) => onSetFrontMatter({ source: v })} />
                <p className="dki-nota dki-nota--tenue">
                    All four show large on the cover. Each slide's footer derives its own from the
                    query it ran, not from here.
                </p>
            </Grupo>
        </>
    );
}

const DeckInspector = ({
    colapsado, onAlternarColapso,
    slide, layout, prose, chartSrc, charts, frontMatter, deckFooter,
    seleccion, procedencia,
    onApplyLayout, onSetTone, onSetFooter, onRemoveChart, onRequestAddChart,
    onOpenFile, onSetFrontMatter, onEditProse,
}) => {
    // Lámina o deck. No es una pestaña de contexto —eso seguiría estando mal—
    // sino de ÁMBITO: son dos objetos distintos, y el deck no se puede
    // seleccionar en el lienzo porque no está dibujado en ninguna parte.
    const [ambito, setAmbito] = useState('lamina');
    // Qué bloque de dato tiene el formulario abierto, por su orden dentro de la
    // región. Por índice y no por objeto: el bloque se reescribe en cada
    // pulsación y el objeto de antes deja de existir.
    const [bloqueAbierto, setBloqueAbierto] = useState(null);
    useEffect(() => { setBloqueAbierto(null); }, [seleccion, slide?.id]);
    const regiones = useMemo(() => regionesDe(layout), [layout]);
    const region = seleccion ? regiones.find((r) => r.id === seleccion) : null;
    const tono = resolveTone({ slideTone: slide?.tone, deckTone: frontMatter?.tone });
    const camposActivos = useMemo(
        () => resolveFooterFields({ slideFooter: slide?.footer, deckFooter, layout, hasChart: !!chartSrc }),
        [slide?.footer, deckFooter, layout, chartSrc],
    );
    const sinPie = layout === 'cover' || layout === 'closing';

    // Los bloques de dato de la región seleccionada. El formulario trabaja
    // sobre la prosa CONFIRMADA: mientras se escribe manda el cuadro de texto,
    // y dos escritores sobre la misma cadena es como se pierde lo tecleado.
    const regionSel = seleccion ? regionesDe(layout).find((r) => r.id === seleccion) : null;
    const textoRegion = regionSel?.tipo === 'texto' ? leerParte(prose, regionSel.parte) : '';
    const bloques = useMemo(() => bloquesDe(textoRegion), [textoRegion]);

    /** Escribe el texto de la región de vuelta en la prosa completa. */
    const escribirRegion = (nuevoTexto) => onEditProse?.(escribirParte(prose, regionSel.parte, nuevoTexto));

    if (colapsado) {
        return (
            <div className="deck-inspector deck-inspector--colapsado">
                <button type="button" className="deck-inspector-expandir" onClick={onAlternarColapso} title="Show the inspector">
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
                    <button type="button" onClick={onAlternarColapso} title="Hide the inspector"><LuPanelRightClose size={15} /></button>
                </div>
                <div className="deck-inspector-vacio">No slide is active.</div>
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
                {ambito === 'deck' ? <LuPalette size={13} /> : <Icono size={13} />}
                <span>{ambito === 'deck' ? 'El deck' : titulo}</span>
                <button type="button" onClick={onAlternarColapso} title="Hide the inspector"><LuPanelRightClose size={15} /></button>
            </div>

            <div className="deck-inspector-ambito">
                <button type="button" className={ambito === 'lamina' ? 'dki-ambito--on' : ''} onClick={() => setAmbito('lamina')}>Slide</button>
                <button type="button" className={ambito === 'deck' ? 'dki-ambito--on' : ''} onClick={() => setAmbito('deck')}>Deck</button>
            </div>

            <div className="deck-inspector-cuerpo">

                {ambito === 'deck' && (
                    <PanelDeck frontMatter={frontMatter} onSetFrontMatter={onSetFrontMatter} />
                )}

                {/* ── La región seleccionada ── */}
                {ambito === 'lamina' && region && !esFigura && (
                    <Grupo titulo="The region">
                        <p className="dki-nota">{region.pista}</p>
                        <p className="dki-nota dki-nota--tenue">
                            Intro para editarla · Tab para pasar a la siguiente
                        </p>
                    </Grupo>
                )}

                {/* ── Los bloques de dato de esta región ── */}
                {ambito === 'lamina' && regionSel?.tipo === 'texto' && bloques.length > 0 && (
                    <Grupo titulo={`Bloques de dato · ${bloques.length}`}>
                        <div className="dkb-lista">
                            {bloques.map((b, i) => (
                                <button
                                    key={`${b.lang}-${b.desde}`}
                                    type="button"
                                    className={`dkb-solapa${bloqueAbierto === i ? ' dkb-solapa--on' : ''}`}
                                    onClick={() => setBloqueAbierto(bloqueAbierto === i ? null : i)}
                                >
                                    {BLOQUES[b.lang]?.label || b.lang}
                                </button>
                            ))}
                        </div>
                        {bloqueAbierto === null && (
                            <p className="dki-nota dki-nota--tenue">
                                Pulsa uno para editarlo con campos en vez de YAML.
                            </p>
                        )}
                    </Grupo>
                )}

                {ambito === 'lamina' && bloqueAbierto !== null && bloques[bloqueAbierto] && (
                    <DeckBlockForm
                        prosa={textoRegion}
                        bloque={bloques[bloqueAbierto]}
                        onEscribir={escribirRegion}
                    />
                )}

                {/* ── La figura ── */}
                {ambito === 'lamina' && esFigura && (
                    <>
                        <Grupo titulo="Origin">
                            {chartSrc ? (
                                <>
                                    <div className="dki-valor dki-valor--mono">{chartSrc.split('/').pop()}</div>
                                    <div className="dki-botonera">
                                        <button type="button" onClick={onRequestAddChart}>Replace</button>
                                        <button type="button" onClick={() => onOpenFile?.(chartSrc)} title="Open the .amoxvis in Story Flow">
                                            <LuExternalLink size={12} /> Abrir
                                        </button>
                                    </div>
                                    <div className="dki-botonera">
                                        <button type="button" className="dki-boton--quitar" onClick={onRemoveChart}>Remove the figure</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="dki-nota">This slot is empty.</p>
                                    <div className="dki-botonera">
                                        <button type="button" onClick={onRequestAddChart}>Pick a figure</button>
                                    </div>
                                </>
                            )}
                        </Grupo>

                        {chartSrc && (
                            <Grupo titulo="Presentation">
                                <p className="dki-nota dki-nota--tenue">
                                    La figura entra sin su tarjeta: la lámina ya es la tarjeta. Se recupera
                                    con <code>card: true</code> en el bloque, y el interruptor llega con los
                                    formularios de bloque.
                                </p>
                            </Grupo>
                        )}

                        {procedencia && (
                            <Grupo titulo="Freshness">
                                <Campo etiqueta="Rows">
                                    <span className="dki-valor">
                                        {procedencia.rows ?? '—'}{procedencia.limited ? ' (trimmed)' : ''}
                                    </span>
                                </Campo>
                                <Campo etiqueta="Ran at">
                                    <span className="dki-valor">
                                        {procedencia.at ? new Date(procedencia.at).toLocaleString() : '—'}
                                    </span>
                                </Campo>
                                <p className="dki-nota dki-nota--tenue">
                                    <LuRefreshCw size={10} /> "Refresh" re-runs the query behind every figure.
                                </p>
                            </Grupo>
                        )}
                    </>
                )}

                {/* ── La lámina ── siempre, porque siempre hay una */}
                {ambito === 'lamina' && (<>
                <Grupo titulo="Layout">
                    {DECK_LAYOUT_GALLERY_BY_FAMILY.map((familia) => (
                        <div key={familia.key} className="dki-familia">
                            <div className="dki-familia-label">{familia.label}</div>
                            <div className="dki-rejilla">
                                {familia.items.map((item) => {
                                    const sueltas = item.id === layout ? 0 : figurasSinHueco(item.id, charts);
                                    const aviso = sueltas === 1
                                        ? 'One figure would be left with no slot to draw in (it is not removed from the file).'
                                        : `${sueltas} figures would be left with no slot to draw in (they are not removed from the file).`;
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

                <Grupo titulo="Tone">
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
                        "From the theme" follows the app's light or dark. The other two win wherever it plays.
                    </p>
                </Grupo>

                <Grupo titulo="Provenance footer">
                    {sinPie ? (
                        <p className="dki-nota dki-nota--tenue">
                            Neither the cover nor the closing carries a footer: they already show source and date large.
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
                </>)}

            </div>
        </div>
    );
};

export default DeckInspector;
