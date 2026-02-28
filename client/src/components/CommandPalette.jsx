import { useState, useEffect, useRef, useMemo } from 'react';
import {
    LuPlay, LuSave, LuFilePlus, LuSettings, LuMoon, LuSun,
    LuBot, LuDatabase, LuFolder, LuPuzzle, LuHistory,
    LuCode, LuBookOpen, LuSearch, LuActivity, LuCommand,
    LuKeyboard
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
            onKeyDown={handleKeyDown}
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
    theme,
    setTheme,
}) {
    return [
        // Query Actions
        { id: 'run', label: 'Run Query', category: 'Query', icon: LuPlay, shortcut: 'Ctrl+Enter', action: () => layoutRef.current?.handleTriggerRun() },
        { id: 'analyze', label: 'Analyze Query Plan', category: 'Query', icon: LuActivity, shortcut: 'Ctrl+Shift+A', action: () => layoutRef.current?.handleTriggerAnalyze() },
        { id: 'save', label: 'Save File', category: 'File', icon: LuSave, shortcut: 'Ctrl+S', action: () => layoutRef.current?.handleTriggerSave() },

        // File Actions
        { id: 'new-sql', label: 'New SQL Query', category: 'File', icon: LuFilePlus, action: () => layoutRef.current?.createNew('sql') },
        { id: 'new-notebook', label: 'New Notebook', category: 'File', icon: LuBookOpen, action: () => layoutRef.current?.createNew('notebook') },

        // Navigation
        { id: 'nav-files', label: 'Show File Explorer', category: 'Navigation', icon: LuFolder, shortcut: 'Ctrl+Shift+E', action: () => setActiveSidebarTab('files') },
        { id: 'nav-schema', label: 'Show Database Schema', category: 'Navigation', icon: LuDatabase, shortcut: 'Ctrl+Shift+D', action: () => setActiveSidebarTab('schema') },
        { id: 'nav-extensions', label: 'Show Extensions', category: 'Navigation', icon: LuPuzzle, action: () => setActiveSidebarTab('extensions') },
        { id: 'toggle-ai', label: showAiSidebar ? 'Close AI Assistant' : 'Open AI Assistant', category: 'Navigation', icon: LuBot, action: () => setShowAiSidebar(!showAiSidebar) },

        // Settings
        { id: 'settings', label: 'Open Settings', category: 'Settings', icon: LuSettings, shortcut: 'Ctrl+,', action: () => setIsSettingsOpen(true) },
        { id: 'toggle-theme', label: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme', category: 'Settings', icon: theme === 'dark' ? LuSun : LuMoon, action: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    ];
}

export default CommandPalette;
