/**
 * DeckEditor — Report Flow Studio (.amoxdeck) editor.
 *
 * The `.amoxdeck` markdown is only the STORAGE format — the user edits through
 * a visual interface and never touches the raw file, exactly like Story Flow
 * builds a chart visually and saves `.amoxvis` JSON underneath.
 *
 * Views:
 *   - Design (default): edits ONE active slide at a time. Prose is click-to-
 *     edit; the chart is a live slot; the side panel's Layouts/Charts act on
 *     the ACTIVE slide (picking a chart replaces this slide's chart — it is
 *     never appended to the end of the file).
 *   - Present: all slides rendered read-only (review + the DOM source for
 *     image-mode PowerPoint export).
 *   - Source: the raw markdown in Monaco, for power users.
 *
 * Shell: a toolbar + a two-column body — an in-tab side panel
 * (Slides/Layouts/Charts, collapsible) beside the active view. The panel lives
 * INSIDE this tab (not the app's global activity bar), mirroring Data Flow's
 * node palette and Story Flow's control sidebar.
 *
 * "Refresh all" re-runs every chart's query against the deck's current
 * variables; "Export to PowerPoint" builds native, editable charts where a
 * mapping exists (image fallback needs Present view mounted).
 */
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import {
    LuPencilLine, LuPresentation, LuRefreshCw, LuSave, LuChevronDown, LuBot, LuX,
    LuMonitorPlay, LuLoaderCircle, LuLayoutTemplate, LuCode,
} from 'react-icons/lu';
import { registerMonaco, MONACO_THEME_NAME } from '../../monacoTheme.js';
import { parseDeck, serializeDeck } from '../../utils/deckParser';
import { buildSlideSnippet, buildSlideRaw, splitSlideContent } from '../../utils/deckTemplates';
import DeckSidePanel from './DeckSidePanel';
import SlideDesigner from './SlideDesigner';
import SlidePreview from './SlidePreview';
import '../MarkdownEditor.css';
import './deck.css';

const ASPECT_MAP = { '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1' };
const VALID_VIEWS = ['design', 'present', 'source'];

const DeckEditor = ({
    content,
    onChange,
    onSave,
    onRequestSaveAs,
    theme,
    editorSettings,
    onToggleAi,
    showAiSidebar,
    isActive,
    onOpenFile,
}) => {
    const [viewMode, setViewMode] = useState(() => {
        const saved = localStorage.getItem('amoxsql-deck-view-mode');
        return VALID_VIEWS.includes(saved) ? saved : 'design';
    });
    const [activePanel, setActivePanel] = useState(() => localStorage.getItem('amoxsql-deck-panel') || 'slides');
    const [sidePanelCollapsed, setSidePanelCollapsed] = useState(() => localStorage.getItem('amoxsql-deck-panel-collapsed') === '1');
    const [activeSlideIndex, setActiveSlideIndex] = useState(0);
    const [refreshToken, setRefreshToken] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showSaveMenu, setShowSaveMenu] = useState(false);
    const [showPptxMenu, setShowPptxMenu] = useState(false);
    const [isExportingPptx, setIsExportingPptx] = useState(false);
    const saveMenuRef = useRef(null);
    const pptxMenuRef = useRef(null);
    const presentRef = useRef(null);
    const editorRef = useRef(null);
    const slideCardRefs = useRef(new Map());

    const deck = useMemo(() => parseDeck(content || ''), [content]);
    const aspectRatio = ASPECT_MAP[deck.frontMatter?.aspect] || '16 / 9';

    // Keep the active slide index within bounds as slides are added/removed.
    useEffect(() => {
        if (activeSlideIndex > deck.slides.length - 1) {
            setActiveSlideIndex(Math.max(0, deck.slides.length - 1));
        }
    }, [deck.slides.length, activeSlideIndex]);

    const switchView = (mode) => {
        setViewMode(mode);
        localStorage.setItem('amoxsql-deck-view-mode', mode);
    };
    const changePanel = (key) => {
        setActivePanel(key);
        localStorage.setItem('amoxsql-deck-panel', key);
    };
    const toggleSidePanel = () => {
        setSidePanelCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('amoxsql-deck-panel-collapsed', next ? '1' : '0');
            return next;
        });
    };

    const handleRefreshAll = useCallback(() => {
        setIsRefreshing(true);
        setRefreshToken((t) => t + 1);
        setTimeout(() => setIsRefreshing(false), 600);
    }, []);

    const handleExportPptx = useCallback(async (chartMode) => {
        if (isExportingPptx) return;
        setShowPptxMenu(false);
        setIsExportingPptx(true);
        try {
            const { generatePptxReport } = await import('../../utils/generatePptxReport');
            const slideCardEls = new Map();
            presentRef.current?.querySelectorAll('[data-slide-id]').forEach((el) => {
                slideCardEls.set(el.getAttribute('data-slide-id'), el);
            });
            await generatePptxReport(deck, { chartMode, slideCardEls });
        } catch (err) {
            console.error('PowerPoint export failed:', err);
        } finally {
            setIsExportingPptx(false);
        }
    }, [deck, isExportingPptx]);

    // ─── Whole-deck writes (everything routes through onChange) ───

    const appendSlide = useCallback((layout) => {
        const snippet = buildSlideSnippet(layout);
        const trimmed = (content || '').replace(/\s*$/, '');
        const next = trimmed.length > 0 ? `${trimmed}\n\n---\n\n${snippet}\n` : `${snippet}\n`;
        onChange(next);
        // Focus the new slide (it becomes the last one).
        setActiveSlideIndex(deck.slides.length);
    }, [content, onChange, deck.slides.length]);

    /** Patch one slide (prose / layout / chartSrc) and re-serialize losslessly. */
    const updateSlideAt = useCallback((index, patch) => {
        const slide = deck.slides[index];
        if (!slide) {
            // No slide to patch (e.g. empty deck) — seed one carrying the patch.
            const layout = patch.layout || 'content';
            const raw = buildSlideRaw({ layout, prose: patch.prose || '', chartSrc: patch.chartSrc || null });
            onChange(serializeDeck(deck.frontMatterText, [{ raw }]));
            setActiveSlideIndex(0);
            return;
        }
        const current = splitSlideContent(slide.markdown);
        const raw = buildSlideRaw({
            layout: patch.layout !== undefined ? patch.layout : slide.layout,
            prose: patch.prose !== undefined ? patch.prose : current.prose,
            chartSrc: patch.chartSrc !== undefined ? patch.chartSrc : current.chartSrc,
        });
        const nextSlides = deck.slides.map((s, i) => (i === index ? { ...s, raw } : s));
        onChange(serializeDeck(deck.frontMatterText, nextSlides));
    }, [deck, onChange]);

    const handleEditProse = useCallback((prose) => updateSlideAt(activeSlideIndex, { prose }), [updateSlideAt, activeSlideIndex]);
    const handleApplyLayout = useCallback((layout) => updateSlideAt(activeSlideIndex, { layout }), [updateSlideAt, activeSlideIndex]);
    const handleRemoveChart = useCallback(() => updateSlideAt(activeSlideIndex, { chartSrc: null }), [updateSlideAt, activeSlideIndex]);

    const handleInsertChart = useCallback((src) => {
        // Set/replace the chart on the ACTIVE slide (never append to the file).
        // A plain 'content' slide gains a chart slot by promoting it to
        // content-chart so the chart has somewhere to render.
        const slide = deck.slides[activeSlideIndex];
        const patch = { chartSrc: src };
        if (slide && slide.layout === 'content') patch.layout = 'content-chart';
        updateSlideAt(activeSlideIndex, patch);
    }, [deck.slides, activeSlideIndex, updateSlideAt]);

    const handleAddSlide = useCallback(() => appendSlide('content'), [appendSlide]);

    const handleNavigateSlide = useCallback((slide) => {
        const idx = deck.slides.findIndex((s) => s.id === slide.id);
        if (idx < 0) return;
        setActiveSlideIndex(idx);
        if (viewMode === 'present') {
            slideCardRefs.current.get(slide.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (viewMode === 'source' && editorRef.current) {
            editorRef.current.revealLineInCenter(slide.startLine);
            editorRef.current.setPosition({ lineNumber: slide.startLine, column: 1 });
            editorRef.current.focus();
        }
    }, [deck.slides, viewMode]);

    const handleMoveSlide = useCallback((index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= deck.slides.length) return;
        const next = [...deck.slides];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(serializeDeck(deck.frontMatterText, next));
        setActiveSlideIndex(target);
    }, [deck, onChange]);

    const handleDeleteSlide = useCallback((index) => {
        const next = deck.slides.filter((_, i) => i !== index);
        onChange(serializeDeck(deck.frontMatterText, next));
    }, [deck, onChange]);

    const goToSlide = useCallback((idx) => {
        setActiveSlideIndex(Math.max(0, Math.min(idx, deck.slides.length - 1)));
    }, [deck.slides.length]);

    const requestAddChart = useCallback(() => { changePanel('charts'); setSidePanelCollapsed(false); }, []);

    const handleEditorWillMount = useCallback((monaco) => {
        registerMonaco(monaco);
    }, []);

    const handleEditorMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        const { CtrlCmd } = monaco.KeyMod;
        const { KeyS } = monaco.KeyCode;
        editor.addCommand(CtrlCmd | KeyS, () => onSave?.());
    }, [onSave]);

    const monacoOptions = {
        fontSize: editorSettings?.fontSize || 14,
        fontFamily: editorSettings?.fontFamily || "'JetBrains Mono', 'Consolas', monospace",
        wordWrap: 'on',
        lineNumbers: editorSettings?.lineNumbers || 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderWhitespace: 'none',
        padding: { top: 16, bottom: 16 },
        contextmenu: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
    };

    const activeSlide = deck.slides[activeSlideIndex] || null;
    const showExport = viewMode !== 'source' && deck.slides.length > 0;

    return (
        <div className={`deck-studio${isActive ? ' active' : ''}`}>
            <div className="ep-editor-card deck-studio-card">

                {/* ── Toolbar ── */}
                <div className="ep-action-bar mde-toolbar">
                    <div className="ep-action-left">
                        <span className="deck-title-badge" title="Deck title (from front matter)">
                            <LuPresentation size={13} />
                            {deck.frontMatter?.title || 'Untitled Deck'}
                        </span>
                        <span className="deck-slide-count">{deck.slides.length} slide{deck.slides.length === 1 ? '' : 's'}</span>
                    </div>

                    <div className="ep-action-right">
                        <div className="ep-action-group">
                            <button
                                className="ep-action-btn"
                                title="Re-run every chart's query with the deck's current variables"
                                onClick={handleRefreshAll}
                                disabled={isRefreshing}
                            >
                                <LuRefreshCw size={13} className={isRefreshing ? 'spin' : ''} /> Refresh all
                            </button>
                        </div>

                        {showExport && (
                            <>
                                <span className="mde-sep" />
                                <div className="ep-action-group" ref={pptxMenuRef}>
                                    <button
                                        className="ep-action-btn"
                                        title="Export to PowerPoint"
                                        onClick={() => handleExportPptx('native')}
                                        disabled={isExportingPptx}
                                    >
                                        {isExportingPptx ? <LuLoaderCircle size={13} className="spin" /> : <LuMonitorPlay size={13} />}
                                        {isExportingPptx ? 'Exporting…' : 'Export PowerPoint'}
                                    </button>
                                    <button className="ep-action-chevron" onClick={() => setShowPptxMenu((v) => !v)}>
                                        <LuChevronDown size={10} />
                                    </button>
                                    {showPptxMenu && (
                                        <div className="ep-action-dropdown" style={{ right: 0, left: 'auto' }}>
                                            <div className="ep-action-dropdown-item" onClick={() => handleExportPptx('native')}>
                                                Native charts (editable)
                                            </div>
                                            <div className="ep-action-dropdown-item" onClick={() => handleExportPptx('image')}>
                                                Image charts (needs Present view)
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <span className="mde-sep" />

                        <div className="seg deck-view-seg">
                            <button
                                className={`seg-item${viewMode === 'design' ? ' seg-item--active' : ''}`}
                                title="Design — edit slide by slide"
                                onClick={() => switchView('design')}
                            >
                                <LuLayoutTemplate size={13} /> Design
                            </button>
                            <button
                                className={`seg-item${viewMode === 'present' ? ' seg-item--active' : ''}`}
                                title="Present — review all slides"
                                onClick={() => switchView('present')}
                            >
                                <LuPresentation size={13} /> Present
                            </button>
                            <button
                                className={`seg-item${viewMode === 'source' ? ' seg-item--active' : ''}`}
                                title="Source — raw markdown"
                                onClick={() => switchView('source')}
                            >
                                <LuCode size={13} /> Source
                            </button>
                        </div>

                        <div className="ep-action-group" ref={saveMenuRef}>
                            <button className="ep-action-btn" onClick={onSave} title="Save (Ctrl+S)">
                                <LuSave size={13} /> Save
                            </button>
                            <button className="ep-action-chevron" onClick={() => setShowSaveMenu((v) => !v)}>
                                <LuChevronDown size={10} />
                            </button>
                            {showSaveMenu && (
                                <div className="ep-action-dropdown" style={{ right: 0, left: 'auto' }}>
                                    <div className="ep-action-dropdown-item" onClick={() => { onSave?.(); setShowSaveMenu(false); }}>Save</div>
                                    <div className="ep-action-dropdown-item" onClick={() => { onRequestSaveAs?.(); setShowSaveMenu(false); }}>Save As…</div>
                                </div>
                            )}
                        </div>

                        {onToggleAi && (
                            <button
                                className={`ep-action-ai${showAiSidebar ? ' active' : ''}`}
                                onClick={onToggleAi}
                                title="Toggle Assist"
                            >
                                {showAiSidebar ? <LuX size={13} /> : <LuBot size={13} />}
                                <span>{showAiSidebar ? 'Close Assist' : 'Assist'}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Body: side panel + main content ── */}
                <div className="deck-studio-body">
                    <DeckSidePanel
                        collapsed={sidePanelCollapsed}
                        onToggleCollapsed={toggleSidePanel}
                        activePanel={activePanel}
                        onChangePanel={changePanel}
                        slides={deck.slides}
                        activeSlideIndex={activeSlideIndex}
                        onNavigateSlide={handleNavigateSlide}
                        onMoveSlide={handleMoveSlide}
                        onDeleteSlide={handleDeleteSlide}
                        onAddSlide={handleAddSlide}
                        onApplyLayout={handleApplyLayout}
                        onInsertChart={handleInsertChart}
                    />

                    <div className="deck-main">
                        {viewMode === 'source' ? (
                            <div className="deck-main-editor mde-editor-pane">
                                <Editor
                                    value={content}
                                    language="markdown"
                                    theme={MONACO_THEME_NAME}
                                    onChange={onChange}
                                    beforeMount={handleEditorWillMount}
                                    onMount={handleEditorMount}
                                    options={monacoOptions}
                                />
                            </div>
                        ) : viewMode === 'present' ? (
                            <div className="deck-present" ref={presentRef}>
                                {deck.slides.length === 0 ? (
                                    <div className="deck-present-empty">No slides yet — switch to Design and add one from the Layouts panel.</div>
                                ) : (
                                    deck.slides.map((slide) => (
                                        <div
                                            key={slide.id}
                                            data-slide-id={slide.id}
                                            ref={(el) => {
                                                if (el) slideCardRefs.current.set(slide.id, el);
                                                else slideCardRefs.current.delete(slide.id);
                                            }}
                                            className="deck-slide-card"
                                            style={{ aspectRatio }}
                                        >
                                            <SlidePreview
                                                slide={slide}
                                                variables={deck.frontMatter?.variables}
                                                refreshToken={refreshToken}
                                                onOpenFile={onOpenFile}
                                                theme={theme}
                                            />
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            /* Design */
                            deck.slides.length === 0 || !activeSlide ? (
                                <div className="deck-present-empty">
                                    No slides yet — add one from the <strong>Layouts</strong> panel, or click <strong>+ Add slide</strong> in the Slides panel.
                                </div>
                            ) : (
                                <SlideDesigner
                                    slide={activeSlide}
                                    index={activeSlideIndex}
                                    total={deck.slides.length}
                                    aspectRatio={aspectRatio}
                                    variables={deck.frontMatter?.variables}
                                    refreshToken={refreshToken}
                                    theme={theme}
                                    onOpenFile={onOpenFile}
                                    onEditProse={handleEditProse}
                                    onRemoveChart={handleRemoveChart}
                                    onRequestAddChart={requestAddChart}
                                    onPrev={() => goToSlide(activeSlideIndex - 1)}
                                    onNext={() => goToSlide(activeSlideIndex + 1)}
                                />
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeckEditor;
