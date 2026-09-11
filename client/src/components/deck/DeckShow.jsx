/**
 * DeckShow — el modo presentación de Report Flow.
 *
 * La vista Review enseña todas las láminas a la vez para revisarlas; esto es
 * lo contrario: una sola lámina, a pantalla completa, y el teclado como único
 * mando. Son dos trabajos distintos y por eso son dos cosas distintas.
 *
 * Tres decisiones que explican casi todo el archivo:
 *
 * 1. **El overlay va por portal a <body>.** La pestaña del deck vive dentro
 *    de paneles con `overflow: hidden`, y basta un `transform` en cualquier
 *    ancestro para que un `position: fixed` se recorte contra él en vez de
 *    contra la ventana. Portal a body y el problema no puede existir.
 *
 * 2. **La lámina se dimensiona con unidades de contenedor, no midiendo.** El
 *    escenario declara `container-type: size` y la tarjeta vale
 *    `min(100cqw, 100cqh * 16/9)`: el 16:9 más grande que cabe, resuelto por
 *    el navegador en cada repintado. Sin `ResizeObserver`, sin estado, y —lo
 *    que importa— sin la trampa de `max-height` sobre `aspect-ratio`, que ya
 *    nos deformó una figura a 827x284 en el lienzo de Story Flow.
 *
 * 3. **Se montan tres láminas, no una ni todas.** Cada figura ejecuta su
 *    consulta al montarse. Montarlas todas es el bloqueo conocido con N
 *    gráficos; montar sólo la actual enseña el «Loading…» en cada avance. Se
 *    monta la anterior, la actual y la siguiente: la que viene ya está
 *    dibujada cuando le toca, y al avanzar React conserva su instancia
 *    (misma `key`), así que la consulta no se repite.
 *
 * El Escape tiene dos tiempos a propósito: el primero abandona la pantalla
 * completa (lo consume el navegador, ni siquiera nos llega) y el segundo
 * cierra la presentación. Salir de las dos cosas de un golpe es justo lo que
 * nadie quiere cuando se le va el dedo delante de una sala.
 */
import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import {
    LuChevronLeft, LuChevronRight, LuGrid2X2, LuNotebookPen, LuMaximize,
    LuMinimize, LuKeyboard, LuX, LuTimer,
} from 'react-icons/lu';
import SlidePreview from './SlidePreview';
import MarkdownPreview from '../markdown/MarkdownPreview';
import { splitSlideContent, slideTitle } from '../../utils/deckTemplates';
import { DECK_LAYOUT_META } from './deckLayoutPreviews';
import './deckShow.css';

/** Milisegundos de quietud antes de que la barra y el cursor se retiren. */
const REPOSO_MS = 2600;
/** Ventana para teclear un número de lámina antes de que se olvide. */
const SALTO_MS = 1400;

/**
 * El cronómetro vive aparte y con su propio intervalo. Si el segundero
 * estuviera en el estado de DeckShow, la presentación entera —láminas,
 * figuras y todo— se volvería a pintar una vez por segundo.
 */
const Cronometro = memo(function Cronometro({ desde }) {
    const [ahora, setAhora] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setAhora(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const s = Math.max(0, Math.floor((ahora - desde) / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return <span className="deck-show-reloj"><LuTimer size={13} />{mm}:{ss}</span>;
});

/**
 * Una lámina montada. Memoizada porque el índice activo cambia en cada avance
 * y sin esto las tres capas —con sus figuras— se repintarían en cada uno.
 */
const Capa = memo(function Capa({ slide, eyebrow, deckFooter, slideNumber, refreshedAt, frontMatter, variables, refreshToken, theme }) {
    return (
        <SlidePreview
            slide={slide}
            eyebrow={eyebrow}
            deckFooter={deckFooter}
            slideNumber={slideNumber}
            refreshedAt={refreshedAt}
            frontMatter={frontMatter}
            variables={variables}
            refreshToken={refreshToken}
            theme={theme}
        />
    );
});

// Los comentarios van en español como todo el repositorio; lo que se lee en
// pantalla, en inglés como el resto de la interfaz.
const ATAJOS = [
    ['→  ↓  Space  Enter', 'Next slide'],
    ['←  ↑  Backspace', 'Previous slide'],
    ['Home  ·  End', 'First · last'],
    ['1…9 then Enter', 'Jump to that slide'],
    ['O', 'Overview'],
    ['S', 'Speaker notes'],
    ['B  ·  .', 'Blank the screen'],
    ['T', 'Reset the timer'],
    ['F', 'Full screen'],
    ['?', 'This list'],
    ['Esc', 'Leave full screen — press again to close'],
];

const DeckShow = ({
    slides, frontMatter, eyebrowOf, deckFooter, refreshedAt, refreshToken,
    variables, theme, startIndex = 0, onClose,
}) => {
    const total = slides.length;
    const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, total - 1)));
    const [panel, setPanel] = useState(null);      // null | 'overview' | 'help'
    const [notas, setNotas] = useState(false);
    const [negro, setNegro] = useState(false);
    const [pantallaCompleta, setPantallaCompleta] = useState(false);
    const [barraVisible, setBarraVisible] = useState(true);
    const [salto, setSalto] = useState('');
    const [inicioReloj, setInicioReloj] = useState(() => Date.now());

    const raizRef = useRef(null);
    const rejillaRef = useRef(null);
    const indiceAlAbrirRef = useRef(0);
    const saltoTimerRef = useRef(null);

    const ir = useCallback((n) => setIndex(Math.min(total - 1, Math.max(0, n))), [total]);
    const siguiente = useCallback(() => setIndex((i) => Math.min(total - 1, i + 1)), [total]);
    const anterior = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

    // ── Pantalla completa ────────────────────────────────────────────────
    const alternarPantallaCompleta = useCallback(() => {
        const doc = document;
        if (doc.fullscreenElement) {
            doc.exitFullscreen?.().catch(() => { /* ya está fuera */ });
        } else {
            raizRef.current?.requestFullscreen?.().catch((err) => {
                // Sin pantalla completa la presentación sigue siendo útil: el
                // overlay ya cubre la ventana entera. Se avisa y se sigue.
                console.warn('Report Flow: no se pudo entrar en pantalla completa —', err?.message || err);
            });
        }
    }, []);

    // Se entra en pantalla completa al abrir, y se sale al cerrar. El
    // `fullscreenchange` es la única fuente de verdad: el usuario puede salir
    // con F11 o con el primer Escape sin pasar por nuestro botón.
    useEffect(() => {
        raizRef.current?.focus();
        raizRef.current?.requestFullscreen?.().catch(() => { /* opcional */ });
        const sync = () => setPantallaCompleta(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', sync);
        return () => {
            document.removeEventListener('fullscreenchange', sync);
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        };
    }, []);

    // ── La barra se retira sola ──────────────────────────────────────────
    // Con un panel abierto no se retira: ahí el ratón es la herramienta.
    const hayPanel = panel !== null || notas;
    useEffect(() => {
        if (hayPanel) { setBarraVisible(true); return undefined; }
        let id;
        const despertar = () => {
            setBarraVisible(true);
            clearTimeout(id);
            id = setTimeout(() => setBarraVisible(false), REPOSO_MS);
        };
        despertar();
        window.addEventListener('mousemove', despertar);
        window.addEventListener('mousedown', despertar);
        return () => {
            clearTimeout(id);
            window.removeEventListener('mousemove', despertar);
            window.removeEventListener('mousedown', despertar);
        };
    }, [hayPanel]);

    // ── Vista general ────────────────────────────────────────────────────
    const abrirVistaGeneral = useCallback(() => {
        indiceAlAbrirRef.current = index;
        setPanel((p) => (p === 'overview' ? null : 'overview'));
    }, [index]);

    /**
     * Cuántas columnas tiene la rejilla ahora mismo. Se lee del layout ya
     * resuelto en vez de fijar un número aquí: la rejilla es `auto-fill` y
     * cambia con el ancho, y una constante duplicada se desincroniza con el
     * CSS a la primera que alguien toque el `minmax`.
     */
    const columnasVistaGeneral = useCallback(() => {
        const el = rejillaRef.current;
        if (!el) return 1;
        const cols = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
        return Math.max(1, cols);
    }, []);

    // ── Teclado ──────────────────────────────────────────────────────────
    // En captura y cortando la propagación de lo que consumimos: mientras se
    // presenta, los atajos de la aplicación (Ctrl+Tab cambia de pestaña, por
    // ejemplo) no deben llegar a nadie.
    useEffect(() => {
        const onKey = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key;
            let consumido = true;

            const cerrarSalto = () => {
                clearTimeout(saltoTimerRef.current);
                setSalto('');
            };

            if (/^[0-9]$/.test(k)) {
                clearTimeout(saltoTimerRef.current);
                setSalto((s) => (s + k).slice(0, 3));
                saltoTimerRef.current = setTimeout(() => setSalto(''), SALTO_MS);
            } else if (k === 'Enter') {
                if (salto) { ir(parseInt(salto, 10) - 1); cerrarSalto(); }
                else if (panel === 'overview') setPanel(null);
                else siguiente();
            } else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Spacebar') {
                if (panel === 'overview') ir(index + 1); else siguiente();
            } else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') {
                if (panel === 'overview') ir(index - 1); else anterior();
            } else if (k === 'ArrowDown') {
                if (panel === 'overview') ir(index + columnasVistaGeneral()); else siguiente();
            } else if (k === 'ArrowUp') {
                if (panel === 'overview') ir(index - columnasVistaGeneral()); else anterior();
            } else if (k === 'Home') {
                ir(0);
            } else if (k === 'End') {
                ir(total - 1);
            } else if (k === 'Escape') {
                // Orden de cierre: lo más superficial primero. La pantalla
                // completa no entra aquí — de ese Escape se encarga el
                // navegador y este manejador ni lo ve.
                if (salto) cerrarSalto();
                else if (panel === 'overview') { ir(indiceAlAbrirRef.current); setPanel(null); }
                else if (panel) setPanel(null);
                else if (negro) setNegro(false);
                else if (notas) setNotas(false);
                else onClose();
            } else if (k === 'o' || k === 'O' || k === 'g' || k === 'G') {
                abrirVistaGeneral();
            } else if (k === 's' || k === 'S') {
                setNotas((v) => !v);
            } else if (k === 'b' || k === 'B' || k === '.') {
                setNegro((v) => !v);
            } else if (k === 'f' || k === 'F') {
                alternarPantallaCompleta();
            } else if (k === 't' || k === 'T') {
                setInicioReloj(Date.now());
            } else if (k === '?' || k === 'h' || k === 'H') {
                setPanel((p) => (p === 'help' ? null : 'help'));
            } else {
                consumido = false;
            }

            if (consumido) { e.preventDefault(); e.stopPropagation(); }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [
        index, total, salto, panel, negro, notas, ir, siguiente, anterior,
        abrirVistaGeneral, alternarPantallaCompleta, columnasVistaGeneral, onClose,
    ]);

    useEffect(() => () => clearTimeout(saltoTimerRef.current), []);

    // ── Las tres láminas montadas ────────────────────────────────────────
    const montadas = useMemo(() => {
        const s = [];
        for (const k of [index - 1, index, index + 1]) {
            if (k >= 0 && k < total && !s.includes(k)) s.push(k);
        }
        return s;
    }, [index, total]);

    const laminaActual = slides[index];
    const notasActuales = useMemo(
        () => (laminaActual ? splitSlideContent(laminaActual.markdown).notes : ''),
        [laminaActual],
    );

    if (!total || !laminaActual) return null;

    return createPortal(
        <div
            ref={raizRef}
            className="deck-show"
            role="application"
            aria-label="Report Flow presentation"
            tabIndex={-1}
            data-barra={barraVisible ? 'on' : 'off'}
            data-negro={negro ? '' : undefined}
            data-notas={notas ? '' : undefined}
        >
            {/* El escenario. Un clic en el marco —nunca sobre la lámina, donde
                hay gráficos que responden al ratón— avanza. Con la pantalla en
                negro, en cambio, el clic la devuelve: avanzar a ciegas es la
                forma más rápida de perder el sitio. */}
            <div
                className="deck-show-stage"
                onClick={(e) => {
                    if (negro) { setNegro(false); return; }
                    if (e.target === e.currentTarget) siguiente();
                }}
            >
                <div className="deck-show-card">
                    {montadas.map((k) => (
                        <div
                            key={slides[k].id}
                            className="deck-show-layer"
                            data-current={k === index ? '' : undefined}
                            aria-hidden={k !== index}
                            inert={k !== index ? true : undefined}
                        >
                            <Capa
                                slide={slides[k]}
                                eyebrow={eyebrowOf(slides[k])}
                                deckFooter={deckFooter}
                                slideNumber={k + 1}
                                refreshedAt={refreshedAt}
                                frontMatter={frontMatter}
                                variables={variables}
                                refreshToken={refreshToken}
                                theme={theme}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Notas del orador ── */}
            {notas && (
                <aside className="deck-show-notes">
                    <header>
                        <span className="deck-show-notes-eyebrow">Speaker notes · {index + 1}/{total}</span>
                        <span className="deck-show-notes-title">{slideTitle(laminaActual.markdown)}</span>
                        <button type="button" onClick={() => setNotas(false)} title="Close notes (S)">
                            <LuX size={14} />
                        </button>
                    </header>
                    <div className="deck-show-notes-body">
                        {notasActuales
                            ? <MarkdownPreview content={notasActuales} theme={theme} widthMode="full" />
                            : <p className="deck-show-notes-empty">This slide carries no notes. They are written in the Design view, in the slide&rsquo;s speaker-notes block.</p>}
                    </div>
                </aside>
            )}

            {/* ── Barra de control ── */}
            <div className="deck-show-bar">
                <button type="button" onClick={anterior} disabled={index === 0} title="Previous (←)">
                    <LuChevronLeft size={19} />
                </button>
                <button type="button" onClick={siguiente} disabled={index === total - 1} title="Next (→)">
                    <LuChevronRight size={19} />
                </button>
                <span className="deck-show-contador">{index + 1} <i>/</i> {total}</span>
                <Cronometro desde={inicioReloj} />
                <span className="deck-show-bar-sep" />
                <button type="button" onClick={abrirVistaGeneral} data-on={panel === 'overview' ? '' : undefined} title="Overview (O)">
                    <LuGrid2X2 size={18} />
                </button>
                <button type="button" onClick={() => setNotas((v) => !v)} data-on={notas ? '' : undefined} title="Speaker notes (S)">
                    <LuNotebookPen size={18} />
                </button>
                <button type="button" onClick={alternarPantallaCompleta} title="Full screen (F)">
                    {pantallaCompleta ? <LuMinimize size={18} /> : <LuMaximize size={18} />}
                </button>
                <button type="button" onClick={() => setPanel((p) => (p === 'help' ? null : 'help'))} data-on={panel === 'help' ? '' : undefined} title="Shortcuts (?)">
                    <LuKeyboard size={18} />
                </button>
                <button type="button" className="deck-show-salir" onClick={onClose} title="Close (Esc)">
                    <LuX size={18} />
                </button>
            </div>

            <div className="deck-show-progress" aria-hidden="true">
                <i style={{ transform: `scaleX(${(index + 1) / total})` }} />
            </div>

            {salto && <div className="deck-show-salto">{salto}<small>Enter</small></div>}

            {/* ── Vista general ── */}
            {panel === 'overview' && (
                <div className="deck-show-overview">
                    <div className="deck-show-overview-head">
                        <span>{frontMatter?.title || 'Deck'}</span>
                        <small>{total} slides · Enter to go there, Esc to come back</small>
                    </div>
                    <div className="deck-show-overview-grid" ref={rejillaRef}>
                        {slides.map((s, k) => {
                            const meta = DECK_LAYOUT_META[s.layout];
                            const Preview = meta?.Preview;
                            return (
                                <button
                                    type="button"
                                    key={s.id}
                                    className="deck-show-thumb"
                                    data-current={k === index ? '' : undefined}
                                    onClick={() => { ir(k); setPanel(null); }}
                                >
                                    <div className="deck-show-thumb-art">{Preview ? <Preview /> : null}</div>
                                    <div className="deck-show-thumb-pie">
                                        <span className="deck-show-thumb-num">{k + 1}</span>
                                        <span className="deck-show-thumb-title">{slideTitle(s.markdown)}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Atajos ── */}
            {panel === 'help' && (
                <div className="deck-show-help" onClick={() => setPanel(null)}>
                    <div className="deck-show-help-card" onClick={(e) => e.stopPropagation()}>
                        <h3>Keyboard control</h3>
                        <dl>
                            {ATAJOS.map(([teclas, que]) => (
                                <div key={teclas}>
                                    <dt>{teclas}</dt>
                                    <dd>{que}</dd>
                                </div>
                            ))}
                        </dl>
                        <p>Clicking the black frame advances too.</p>
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
};

export default DeckShow;
