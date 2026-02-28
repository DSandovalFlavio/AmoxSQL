import { LuX, LuKeyboard } from 'react-icons/lu';

const SHORTCUTS = [
    {
        category: 'General', items: [
            { keys: 'Ctrl + Shift + P', description: 'Command Palette' },
            { keys: 'Ctrl + ,', description: 'Open Settings' },
            { keys: 'Ctrl + S', description: 'Save File' },
        ]
    },
    {
        category: 'Query', items: [
            { keys: 'Ctrl + Enter', description: 'Run Query / Run Cell' },
            { keys: 'Ctrl + Shift + A', description: 'Analyze Query Plan' },
        ]
    },
    {
        category: 'Navigation', items: [
            { keys: 'Ctrl + Shift + E', description: 'Focus File Explorer' },
            { keys: 'Ctrl + Shift + D', description: 'Focus Database Explorer' },
            { keys: 'Ctrl + Tab', description: 'Next Tab' },
        ]
    },
    {
        category: 'Editor', items: [
            { keys: 'Ctrl + /', description: 'Toggle Comment' },
            { keys: 'Ctrl + D', description: 'Duplicate Line' },
            { keys: 'Ctrl + Shift + K', description: 'Delete Line' },
            { keys: 'Ctrl + F', description: 'Find in Editor' },
            { keys: 'Ctrl + H', description: 'Find and Replace' },
        ]
    },
];

const KeyboardShortcutsModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9500,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '520px',
                    maxHeight: '520px',
                    backgroundColor: 'var(--surface-overlay)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: 'var(--surface-raised)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <LuKeyboard size={16} color="var(--accent-primary)" />
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Keyboard Shortcuts
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--text-tertiary)', padding: '4px',
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <LuX size={16} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px' }}>
                    {SHORTCUTS.map(group => (
                        <div key={group.category} style={{ marginTop: '16px' }}>
                            <div style={{
                                fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                                letterSpacing: '0.5px', color: 'var(--text-tertiary)',
                                marginBottom: '8px',
                            }}>
                                {group.category}
                            </div>
                            {group.items.map(item => (
                                <div
                                    key={item.keys}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '6px 0',
                                        borderBottom: '1px solid var(--border-subtle)',
                                    }}
                                >
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        {item.description}
                                    </span>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {item.keys.split(' + ').map((key, i) => (
                                            <span key={i}>
                                                {i > 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', margin: '0 2px' }}>+</span>}
                                                <kbd style={{
                                                    fontSize: '11px',
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    backgroundColor: 'var(--surface-inset)',
                                                    border: '1px solid var(--border-default)',
                                                    color: 'var(--text-primary)',
                                                    fontWeight: 500,
                                                    boxShadow: '0 1px 0 var(--border-subtle)',
                                                }}>
                                                    {key}
                                                </kbd>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default KeyboardShortcutsModal;
