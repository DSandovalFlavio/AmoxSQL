import { memo, useState, useEffect, useRef, useMemo } from 'react';
import {
    LuPlay, LuSave, LuFilePlus, LuSettings, LuMoon, LuSun,
    LuBot, LuDatabase, LuFolder, LuPuzzle, LuHistory,
    LuCode, LuBookOpen, LuSearch, LuActivity, LuCommand,
    LuKeyboard, LuGitBranch, LuZap, LuLifeBuoy,
    LuPresentation, LuChartBar, LuFile, LuTable, LuColumns3,
} from 'react-icons/lu';
import { TOURS, openTour } from './onboarding/tourRegistry';

/**
 * Puntua una coincidencia. Empezar por lo escrito vale mas que contenerlo, y
 * entre dos que empiezan igual gana el nombre mas corto: buscando "ven" interesa
 * antes `ventas` que `ventas_mensuales_consolidadas`. Sin esto, el orden lo
 * decidia el del indice, que no significa nada para quien busca.
 */
const score = (text, q) => {
    const t = text.toLowerCase();
    const i = t.indexOf(q);
    if (i === -1) return -1;
    return (i === 0 ? 1000 : 500 - Math.min(i, 60)) - Math.min(t.length, 80);
};

const MAX_PER_GROUP = 12;

const CommandPalette = ({
    isOpen,
    onClose,
    actions, // Array of { id, label, category, icon, shortcut, action }
    files = [],          // [{ name, path }] — indice plano del proyecto
    schema = [],         // [{ schema, tables: [{ name, columns: [{ column_name, data_type }] }] }]
    onOpenFile,
    onPreviewTable,
}) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Los prefijos acotan la busqueda: ">" solo comandos, "#" solo tablas y
    // columnas, y sin prefijo busca en todo. Son opcionales a proposito — quien
    // no los conozca sigue encontrando lo mismo, solo que mezclado.
    const raw = query.trim();
    const mode = raw.startsWith('>') ? 'commands' : raw.startsWith('#') ? 'schema' : 'all';
    const term = (mode === 'all' ? raw : raw.slice(1)).trim().toLowerCase();

    const filtered = useMemo(() => {
        const out = [];

        if (mode !== 'schema') {
            const cmds = term
                ? actions
                    .map(a => ({ a, s: Math.max(score(a.label, term), score(a.category || '', term) - 200) }))
                    .filter(x => x.s > -1)
                    .sort((x, y) => y.s - x.s)
                    .map(x => x.a)
                : actions;
            // Sin nada escrito el usuario esta OJEANDO los comandos: se enseñan
            // todos, como siempre. En cuanto escribe, se recorta como el resto.
            out.push(...(term ? cmds.slice(0, MAX_PER_GROUP) : cmds));
        }

        // Archivos y esquema solo aparecen cuando hay algo que buscar: sin
        // termino, volcar mil archivos no ayuda a nadie.
        if (mode !== 'commands' && term) {
            if (mode !== 'schema') {
                out.push(...files
                    .map(f => ({ f, s: Math.max(score(f.name, term), score(f.path, term) - 150) }))
                    .filter(x => x.s > -1)
                    .sort((x, y) => y.s - x.s)
                    .slice(0, MAX_PER_GROUP)
                    .map(({ f }) => ({
                        id: `file:${f.path}`,
                        label: f.name,
                        detail: f.path,
                        category: 'Files',
                        icon: LuFile,
                        action: () => onOpenFile?.(f.path),
                    })));
            }

            const hits = [];
            for (const sc of schema) {
                for (const t of (sc.tables || [])) {
                    const st = score(t.name, term);
                    if (st > -1) {
                        hits.push({
                            s: st,
                            item: {
                                id: `table:${sc.schema}.${t.name}`,
                                label: t.name,
                                detail: sc.schema,
                                category: 'Tables and columns',
                                icon: LuTable,
                                action: () => onPreviewTable?.(sc.schema, t.name),
                            },
                        });
                    }
                    for (const c of (t.columns || [])) {
                        const cs = score(c.column_name, term);
                        // La columna vale un poco menos que la tabla del mismo
                        // nombre, pero es LO MAS UTIL de esta busqueda: encontrar
                        // una columna sin saber en que tabla vive.
                        if (cs > -1) {
                            hits.push({
                                s: cs - 60,
                                item: {
                                    id: `col:${sc.schema}.${t.name}.${c.column_name}`,
                                    label: c.column_name,
                                    detail: `${t.name} · ${c.data_type}`,
                                    category: 'Tables and columns',
                                    icon: LuColumns3,
                                    action: () => onPreviewTable?.(sc.schema, t.name, c.column_name),
                                },
                            });
                        }
                    }
                }
            }
            out.push(...hits.sort((a, b) => b.s - a.s).slice(0, MAX_PER_GROUP).map(h => h.item));
        }

        return out;
    }, [mode, term, actions, files, schema, onOpenFile, onPreviewTable]);

    // Group by category
    const grouped = useMemo(() => {
        const groups = {};
        filtered.forEach(item => {
            const cat = item.category || 'Actions';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });
        return groups;
    }, [filtered]);

    // Flat list for keyboard navigation
    const flatList = useMemo(() => filtered, [filtered]);

    // Reset selection when filter changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Scroll active item into view
    useEffect(() => {
        const activeEl = listRef.current?.querySelector('.command-palette-item.active');
        activeEl?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    const executeAction = (item) => {
        onClose();
        // Small delay to let the modal close before action executes
        setTimeout(() => item.action(), 50);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (flatList[selectedIndex]) {
                executeAction(flatList[selectedIndex]);
            }
        }
    };

    if (!isOpen) return null;

    let itemCounter = 0;

    return (
        <div
            className="command-palette-overlay"
            onClick={onClose}
        >
            <div
                className="command-palette"
                onClick={e => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    className="command-palette-input"
                    type="text"
                    placeholder="Search commands, files, tables…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <div className="command-palette-list" ref={listRef}>
                    {flatList.length === 0 && (
                        <div className="command-palette-empty">
                            {term ? 'Nothing matches that' : 'No matching commands'}
                        </div>
                    )}
                    {Object.entries(grouped).map(([category, items]) => (
                        <div key={category}>
                            <div className="command-palette-category">{category}</div>
                            {items.map((item) => {
                                const idx = itemCounter++;
                                const Icon = item.icon;
                                return (
                                    <div
                                        key={item.id}
                                        className={`command-palette-item ${idx === selectedIndex ? 'active' : ''}`}
                                        onClick={() => executeAction(item)}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                    >
                                        <div className="cmd-icon">
                                            {Icon && <Icon size={15} />}
                                        </div>
                                        <span className="cmd-label">{item.label}</span>
                                        {item.detail && (
                                            <span className="cmd-detail">{item.detail}</span>
                                        )}
                                        {item.shortcut && (
                                            <span className="cmd-shortcut">{item.shortcut}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
                {/* Los prefijos se enseñan; un atajo que hay que adivinar no
                    existe para quien no lo adivina. */}
                <div className="command-palette-hint">
                    <span><b>&gt;</b> commands</span>
                    <span><b>#</b> tables and columns</span>
                    <span>no prefix searches everything</span>
                </div>
            </div>
        </div>
    );
};

// Export default actions builder
export function buildDefaultActions({
    layoutRef,
    setActiveSidebarTab,
    setShowAiSidebar,
    showAiSidebar,
    setIsSettingsOpen,
    setSettingsInitialTab,
    theme,
    setTheme,
    setUiZoomLevel,
    setEditorSettings,
    onActivateSkill,
}) {
    const aiSkillActions = onActivateSkill ? [
        {
            id: 'ai-eda', label: 'AI: Analyze current table (EDA)', category: 'AI Analysis', icon: LuBot,
            action: () => onActivateSkill('eda-initial'),
        },
        {
            id: 'ai-quality', label: 'AI: Verify data quality', category: 'AI Analysis', icon: LuBot,
            action: () => onActivateSkill('data-quality'),
        },
        {
            id: 'ai-investigate', label: 'AI: Investigate metric drivers', category: 'AI Analysis', icon: LuBot,
            action: () => onActivateSkill('metric-investigation'),
        },
        {
            id: 'ai-story', label: 'AI: Generate chart story', category: 'AI Analysis', icon: LuBot,
            action: () => onActivateSkill('data-storytelling'),
        },
    ] : [];

    return [
        ...aiSkillActions,
        // Query Actions
        { id: 'run', label: 'Run Query', category: 'Query', icon: LuPlay, shortcut: 'Ctrl+Enter', action: () => layoutRef.current?.handleTriggerRun() },
        { id: 'run-f5', label: 'Run Query (F5)', category: 'Query', icon: LuPlay, shortcut: 'F5', action: () => layoutRef.current?.handleTriggerRun() },
        { id: 'analyze', label: 'Analyze Query Plan', category: 'Query', icon: LuActivity, shortcut: 'Ctrl+Shift+A', action: () => layoutRef.current?.handleTriggerAnalyze() },

        // File Actions
        { id: 'save', label: 'Save File', category: 'File', icon: LuSave, shortcut: 'Ctrl+S', action: () => layoutRef.current?.handleTriggerSave() },
        { id: 'save-as', label: 'Save As…', category: 'File', icon: LuSave, shortcut: 'Ctrl+Shift+S', action: () => layoutRef.current?.handleTriggerSaveAs() },
        { id: 'new-sql', label: 'New SQL Query', category: 'File', icon: LuFilePlus, shortcut: 'Ctrl+N', action: () => layoutRef.current?.createNew('sql') },
        { id: 'new-notebook', label: 'New Notebook', category: 'File', icon: LuBookOpen, shortcut: 'Ctrl+Shift+N', action: () => layoutRef.current?.createNew('notebook') },
        { id: 'new-chain', label: 'New Chain', category: 'File', icon: LuGitBranch, action: () => layoutRef.current?.createNew('sqlchain') },
        { id: 'new-deck', label: 'New Report Flow Deck', category: 'File', icon: LuPresentation, action: () => layoutRef.current?.createNew('amoxdeck') },
        { id: 'new-chart', label: 'New Chart', category: 'File', icon: LuChartBar, action: () => layoutRef.current?.createNew('amoxvis') },
        { id: 'close-tab', label: 'Close Tab', category: 'File', icon: LuCommand, shortcut: 'Ctrl+W', action: () => layoutRef.current?.closeActiveTab() },

        // Navigation
        { id: 'nav-files', label: 'Show File Explorer', category: 'Navigation', icon: LuFolder, shortcut: 'Ctrl+Shift+E', action: () => setActiveSidebarTab('files') },
        { id: 'nav-schema', label: 'Show Database Schema', category: 'Navigation', icon: LuDatabase, shortcut: 'Ctrl+Shift+D', action: () => setActiveSidebarTab('schema') },
        { id: 'nav-extensions', label: 'Show Extensions', category: 'Navigation', icon: LuPuzzle, action: () => setActiveSidebarTab('extensions') },
        { id: 'toggle-ai', label: showAiSidebar ? 'Close Assist' : 'Open Assist', category: 'Navigation', icon: LuBot, shortcut: 'Ctrl+L', action: () => setShowAiSidebar(!showAiSidebar) },
        { id: 'next-tab', label: 'Next Tab', category: 'Navigation', icon: LuCommand, shortcut: 'Ctrl+Tab', action: () => layoutRef.current?.navigateTab(1) },
        { id: 'prev-tab', label: 'Previous Tab', category: 'Navigation', icon: LuCommand, shortcut: 'Ctrl+Shift+Tab', action: () => layoutRef.current?.navigateTab(-1) },

        // Settings
        { id: 'settings', label: 'Open Settings', category: 'Settings', icon: LuSettings, shortcut: 'Ctrl+,', action: () => setIsSettingsOpen(true) },
        { id: 'toggle-theme', label: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme', category: 'Settings', icon: theme === 'dark' ? LuSun : LuMoon, action: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
        { id: 'shortcuts', label: 'Show Keyboard Shortcuts', category: 'Settings', icon: LuKeyboard, shortcut: 'Ctrl+Shift+/', action: () => { setIsSettingsOpen(true); setSettingsInitialTab?.('shortcuts'); } },

        // View / Appearance
        { id: 'zoom-in', label: 'Zoom In UI', category: 'View', icon: LuSearch, shortcut: 'Ctrl++', action: () => setUiZoomLevel?.(prev => Math.min(prev + 0.1, 2.0)) },
        { id: 'zoom-out', label: 'Zoom Out UI', category: 'View', icon: LuSearch, shortcut: 'Ctrl+-', action: () => setUiZoomLevel?.(prev => Math.max(prev - 0.1, 0.5)) },
        { id: 'zoom-reset', label: 'Reset UI Zoom', category: 'View', icon: LuSearch, shortcut: 'Ctrl+0', action: () => setUiZoomLevel?.(1.0) },
        { id: 'toggle-minimap', label: 'Toggle Editor Minimap', category: 'View', icon: LuCode, action: () => setEditorSettings?.(prev => ({...prev, minimap: !prev.minimap})) },
        { id: 'toggle-wordwrap', label: 'Toggle Editor Word Wrap', category: 'View', icon: LuCode, action: () => setEditorSettings?.(prev => ({...prev, wordWrap: prev.wordWrap === 'on' ? 'off' : 'on'})) },

        // DBT
        { id: 'dbt-panel', label: 'Show DBT Studio', category: 'DBT', icon: LuFolder, action: () => setActiveSidebarTab('dbt') },
        // 'DBT: New Model' removed — it only navigated to the panel (no new-model flow was
        // wired), duplicating 'Show DBT Studio'. Re-add with a real action if needed.

        // Help & Tours — replay any onboarding tour from anywhere
        ...TOURS.map((t) => ({
            id: `tour-${t.id}`,
            label: `Tour: ${t.brandLabel}`,
            category: 'Help & Tours',
            icon: LuLifeBuoy,
            action: () => openTour(t.id),
        })),

    ];
}

// Memoized: closed palette must not reconcile on every App render.
export default memo(CommandPalette);
