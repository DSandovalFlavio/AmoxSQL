import { LuX, LuKeyboard } from 'react-icons/lu';

/**
 * Lo que responde la aplicacion, entero.
 *
 * Esta lista documentaba DOCE atajos cuando `App.jsx` registraba mas de veinte.
 * Faltaban Ctrl+W, Ctrl+B, Ctrl+\, Ctrl+K, Ctrl+L y las de zoom: media
 * aplicacion de teclado era invisible, y una funcion que nadie encuentra vale
 * lo mismo que una que no existe.
 *
 * **La regla para mantenerla: si se añade un atajo en `App.jsx`, se añade
 * aqui.** Y se incluyen tambien los que trae el editor de serie —ir a la linea,
 * cursores multiples, plegar— porque el usuario no distingue quien los
 * implementa; para el es la misma aplicacion.
 */
const SHORTCUTS = [
    {
        category: 'General', items: [
            { keys: 'Ctrl + K', description: 'Command palette' },
            { keys: 'Ctrl + P', description: 'Jump to a file, table or column' },
            { keys: 'Ctrl + Shift + P', description: 'Command palette (alias)' },
            { keys: 'Ctrl + ,', description: 'Settings' },
            { keys: 'Ctrl + Shift + /', description: 'This list' },
        ]
    },
    {
        category: 'Files', items: [
            { keys: 'Ctrl + S', description: 'Save' },
            { keys: 'Ctrl + Shift + S', description: 'Save as…' },
            { keys: 'Ctrl + N', description: 'New SQL query' },
            { keys: 'Ctrl + Shift + N', description: 'New notebook' },
            { keys: 'Ctrl + Shift + F', description: 'Search the whole project' },
        ]
    },
    {
        category: 'Queries', items: [
            { keys: 'Ctrl + Enter', description: 'Run (the selection, or the whole script)' },
            { keys: 'F5', description: 'Run' },
            { keys: 'Ctrl + Alt + Enter', description: 'Run only the statement under the cursor' },
            { keys: 'Ctrl + Shift + A', description: 'Analyse the execution plan' },
            { keys: 'Ctrl + Shift + R', description: 'Reload the schema' },
        ]
    },
    {
        category: 'Tabs', items: [
            { keys: 'Ctrl + W', description: 'Close the tab' },
            { keys: 'Ctrl + Shift + T', description: 'Reopen the last one you closed' },
            { keys: 'Alt + P', description: 'Pin or unpin the tab' },
            { keys: 'Ctrl + Tab', description: 'Go to the most recently used' },
            { keys: 'Ctrl + Shift + Tab', description: 'The other way round' },
            { keys: 'Alt + ←  /  Alt + →', description: 'Back and forward through visited tabs' },
            { keys: 'Ctrl + \\', description: 'Split the screen in two' },
            { keys: 'Ctrl + Shift + |', description: 'Change the split orientation' },
        ]
    },
    {
        category: 'Panels', items: [
            { keys: 'Ctrl + B', description: 'Show or hide the sidebar' },
            { keys: 'Ctrl + Shift + E', description: 'Go to the file explorer' },
            { keys: 'Ctrl + Shift + D', description: 'Go to the database schema' },
            { keys: 'Ctrl + L', description: 'Open or close the assistant' },
            { keys: 'Ctrl + +  /  Ctrl + -  /  Ctrl + 0', description: 'Interface scale' },
        ]
    },
    {
        category: 'Editor', items: [
            { keys: 'Ctrl + /', description: 'Comment or uncomment' },
            { keys: 'Ctrl + D', description: 'Duplicate the line' },
            { keys: 'Ctrl + Shift + K', description: 'Delete the line' },
            { keys: 'Ctrl + F', description: 'Find in the file' },
            { keys: 'Ctrl + H', description: 'Find and replace' },
            { keys: 'Ctrl + G', description: 'Go to a line' },
            { keys: 'Alt + clic', description: 'Add another cursor' },
            { keys: 'Ctrl + Shift + L', description: 'A cursor on every match' },
            { keys: 'Alt + ↑  /  Alt + ↓', description: 'Move the line' },
            { keys: 'Ctrl + Shift + [  /  ]', description: 'Fold or unfold the block' },
        ]
    },
];

const KeyboardShortcutsModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div
            className="modal-overlay"
            style={{
                position: 'fixed', inset: 0,
                backgroundColor: 'var(--overlay-bg)',

                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9500,
            }}
            onClick={onClose}
        >
            <div
                className="modal-panel"
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
