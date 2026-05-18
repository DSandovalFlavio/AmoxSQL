import { useState, useEffect, useRef, useMemo } from 'react';
import {
    LuPlay, LuSave, LuFilePlus, LuSettings, LuMoon, LuSun,
    LuBot, LuDatabase, LuFolder, LuPuzzle, LuHistory,
    LuCode, LuBookOpen, LuSearch, LuActivity, LuCommand,
    LuKeyboard, LuGitBranch, LuZap,
} from 'react-icons/lu';

const CommandPalette = ({
    isOpen,
    onClose,
    actions, // Array of { id, label, category, icon, shortcut, action }
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

    // Fuzzy filter
    const filtered = useMemo(() => {
        if (!query.trim()) return actions;
        const q = query.toLowerCase();
        return actions.filter(a =>
            a.label.toLowerCase().includes(q) ||
            (a.category && a.category.toLowerCase().includes(q))
        );
    }, [query, actions]);

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
                    placeholder="Type a command..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <div className="command-palette-list" ref={listRef}>
                    {flatList.length === 0 && (
                        <div className="command-palette-empty">
                            No matching commands
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
                                        {item.shortcut && (
                                            <span className="cmd-shortcut">{item.shortcut}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
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
        { id: 'new-chain', label: 'New Execution Chain', category: 'File', icon: LuGitBranch, action: () => layoutRef.current?.createNew('sqlchain') },
        { id: 'close-tab', label: 'Close Tab', category: 'File', icon: LuCommand, shortcut: 'Ctrl+W', action: () => layoutRef.current?.closeActiveTab() },

        // Navigation
        { id: 'nav-files', label: 'Show File Explorer', category: 'Navigation', icon: LuFolder, shortcut: 'Ctrl+Shift+E', action: () => setActiveSidebarTab('files') },
        { id: 'nav-schema', label: 'Show Database Schema', category: 'Navigation', icon: LuDatabase, shortcut: 'Ctrl+Shift+D', action: () => setActiveSidebarTab('schema') },
        { id: 'nav-extensions', label: 'Show Extensions', category: 'Navigation', icon: LuPuzzle, action: () => setActiveSidebarTab('extensions') },
        { id: 'toggle-ai', label: showAiSidebar ? 'Close AI Assistant' : 'Open AI Assistant', category: 'Navigation', icon: LuBot, shortcut: 'Ctrl+L', action: () => setShowAiSidebar(!showAiSidebar) },
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
        { id: 'dbt-new-model', label: 'DBT: New Model', category: 'DBT', icon: LuFilePlus, action: () => { setActiveSidebarTab('dbt'); /* DbtPanel will handle */ } },

        // Flock — AI SQL Functions
        { id: 'flock-panel', label: 'Show AI Functions (Flock)', category: 'Flock', icon: LuZap, action: () => setActiveSidebarTab('aifunctions') },
        {
            id: 'flock-semantic-filter', label: 'Flock: Semantic WHERE filter', category: 'Flock', icon: LuZap,
            action: () => layoutRef.current?.createNew('sql',
`-- Flock: Semantic WHERE filter
-- Filters rows where the LLM considers the condition true.
-- Replace 'MyModel', the column name, and the prompt.
SELECT *
FROM your_table
WHERE llm_filter(
    {'model_name': 'MyModel'},
    {'prompt': 'Is this text negative or a complaint?',
     'context_columns': [{'data': your_column}]}
)
LIMIT 50;`)
        },
        {
            id: 'flock-llm-reduce', label: 'Flock: Summarize groups (llm_reduce)', category: 'Flock', icon: LuZap,
            action: () => layoutRef.current?.createNew('sql',
`-- Flock: Summarize each group with an LLM (llm_reduce)
-- Replace 'MyModel', group column, and content column.
SELECT category,
    llm_reduce(
        {'model_name': 'MyModel'},
        {'prompt': 'Summarize these items in 2 sentences',
         'context_columns': [{'data': description}]}
    ) AS summary
FROM your_table
GROUP BY category;`)
        },
        {
            id: 'flock-embeddings', label: 'Flock: Generate embeddings for a column', category: 'Flock', icon: LuZap,
            action: () => layoutRef.current?.createNew('sql',
`-- Flock: Generate semantic embeddings for a column
-- Step 1: Add the embedding column
ALTER TABLE your_table ADD COLUMN IF NOT EXISTS emb FLOAT[];

-- Step 2: Fill it (use an embedding model, e.g. nomic-embed-text)
UPDATE your_table
SET emb = llm_embedding(
    {'model_name': 'embed_default'},
    {'context_columns': [{'data': your_text_column}]}
)
WHERE emb IS NULL;

-- Step 3: Similarity search (replace $query_emb with your vector)
SELECT id, your_text_column,
    array_cosine_similarity(emb, $query_emb) AS score
FROM your_table
ORDER BY score DESC
LIMIT 10;`)
        },
        {
            id: 'flock-hybrid-search', label: 'Flock: Hybrid search (BM25 + embeddings + RRF)', category: 'Flock', icon: LuZap,
            action: () => layoutRef.current?.createNew('sql',
`-- Flock: Hybrid search combining BM25 full-text + semantic embeddings
-- Prerequisites: fts extension loaded, embeddings column populated.
-- Replace table/column names and $query / $query_emb.

-- Build FTS index (run once)
PRAGMA create_fts_index('your_table', 'id', 'your_text_column');

WITH search_results AS (
    SELECT id,
        fts_main_your_table.match_bm25(id, $query)   AS bm25,
        array_cosine_similarity(emb, $query_emb)       AS sim
    FROM your_table
    WHERE bm25 IS NOT NULL OR sim > 0.4
)
SELECT id,
    fusion_rrf(
        row_number() OVER (ORDER BY bm25 DESC NULLS LAST),
        row_number() OVER (ORDER BY sim  DESC NULLS LAST)
    ) AS score
FROM search_results
ORDER BY score DESC
LIMIT 20;`)
        },
    ];
}

export default CommandPalette;
