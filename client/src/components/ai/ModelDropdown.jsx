import { useState, useRef, useEffect } from 'react';
import { LuCpu, LuCloud, LuCheck, LuChevronDown } from 'react-icons/lu';

/**
 * Residency dot (F4): ● green = hot in VRAM, ◐ amber = loaded but on CPU (slower),
 * ○ dim = cold / not loaded. Reads the /api/ai/model-status snapshot.
 */
function StatusDot({ name, modelStatus }) {
    const entry = (modelStatus || []).find(m => m.name === name || m.model === name);
    let color = 'var(--text-tertiary)';   // cold
    let title = 'Not loaded — first message will load it';
    let glyph = '○';
    if (entry) {
        if (entry.onCpu) { color = 'var(--warning, #e0a030)'; glyph = '◐'; title = 'Loaded, partly on CPU (slower)'; }
        else { color = 'var(--success, #3ba55d)'; glyph = '●'; title = 'Hot in memory — instant response'; }
    }
    return <span title={title} style={{ color, fontSize: '9px', lineHeight: 1, flexShrink: 0 }}>{glyph}</span>;
}

function ModelDropdown({ provider, selectedModel, setSelectedModel, installedModels, cloudModelsList, isModelsLoading, modelStatus = [] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Reset search when opening/closing
    useEffect(() => {
        if (!isOpen) setSearchTerm('');
    }, [isOpen]);

    // Build options
    let options = [];
    if (provider === 'ollama') {
        options = (installedModels || []).map(m => ({ value: m.name, label: m.name }));
    } else {
        options = (cloudModelsList || []).map(m => ({ value: m.id || m, label: m.label || m }));
    }

    // Determine display text
    let displayText = selectedModel;
    if (provider === 'ollama' && isModelsLoading) {
        displayText = 'Loading...';
    } else {
        displayText = options.find(o => o.value === selectedModel)?.label || selectedModel;
    }

    // Filter options based on search term
    const filteredOptions = options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div ref={containerRef} className="ai-composer-model" style={{ position: 'relative' }} onClick={() => !isModelsLoading && setIsOpen(!isOpen)}>
            {provider === 'ollama' ? <LuCpu size={12} /> : <LuCloud size={12} />}
            {provider === 'ollama' && selectedModel && <StatusDot name={selectedModel} modelStatus={modelStatus} />}
            <span className="ai-composer-model-text" style={{ userSelect: 'none' }}>{displayText}</span>
            <LuChevronDown size={12} style={{ opacity: 0.5, marginLeft: '2px' }} />

            {isOpen && (
                <div 
                    className="column-context-menu" 
                    style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 1000, minWidth: '180px', maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} 
                    onClick={e => e.stopPropagation()}
                >
                    {options.length > 5 && (
                        <div style={{ padding: '6px', position: 'sticky', top: 0, background: 'var(--surface-overlay)', zIndex: 2, borderBottom: '1px solid var(--border-subtle)' }}>
                            <input 
                                type="text"
                                placeholder="Search models..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', fontSize: '11px', background: 'var(--surface-base)', border: '1px solid var(--border-default)', borderRadius: '4px', color: 'var(--text-primary)', outline: 'none' }}
                                autoFocus
                            />
                        </div>
                    )}
                    
                    {filteredOptions.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>No models found</div>
                    ) : (
                        filteredOptions.map(opt => (
                            <div
                                key={opt.value}
                                className="column-context-menu-item"
                                onClick={() => { setSelectedModel(opt.value); setIsOpen(false); }}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {provider === 'ollama' && <StatusDot name={opt.value} modelStatus={modelStatus} />}
                                    {opt.label}
                                </span>
                                {selectedModel === opt.value && <LuCheck size={12} style={{ color: 'var(--accent-primary)' }} />}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

export default ModelDropdown;
