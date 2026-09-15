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
            { keys: 'Ctrl + K', description: 'Paleta de comandos' },
            { keys: 'Ctrl + P', description: 'Saltar a un archivo, tabla o columna' },
            { keys: 'Ctrl + Shift + P', description: 'Paleta de comandos (alias)' },
            { keys: 'Ctrl + ,', description: 'Ajustes' },
            { keys: 'Ctrl + Shift + /', description: 'Esta lista' },
        ]
    },
    {
        category: 'Archivos', items: [
            { keys: 'Ctrl + S', description: 'Guardar' },
            { keys: 'Ctrl + Shift + S', description: 'Guardar como…' },
            { keys: 'Ctrl + N', description: 'Consulta SQL nueva' },
            { keys: 'Ctrl + Shift + N', description: 'Notebook nuevo' },
            { keys: 'Ctrl + Shift + F', description: 'Buscar en todo el proyecto' },
        ]
    },
    {
        category: 'Consultas', items: [
            { keys: 'Ctrl + Enter', description: 'Ejecutar (la seleccion, o todo el script)' },
            { keys: 'F5', description: 'Ejecutar' },
            { keys: 'Ctrl + Alt + Enter', description: 'Ejecutar solo la sentencia del cursor' },
            { keys: 'Ctrl + Shift + A', description: 'Analizar el plan de ejecucion' },
            { keys: 'Ctrl + Shift + R', description: 'Recargar el esquema' },
        ]
    },
    {
        category: 'Pestañas', items: [
            { keys: 'Ctrl + W', description: 'Cerrar la pestaña' },
            { keys: 'Ctrl + Shift + T', description: 'Reabrir la ultima que cerraste' },
            { keys: 'Alt + P', description: 'Fijar o soltar la pestaña' },
            { keys: 'Ctrl + Tab', description: 'Ir a la usada mas recientemente' },
            { keys: 'Ctrl + Shift + Tab', description: 'En sentido contrario' },
            { keys: 'Alt + ←  /  Alt + →', description: 'Atras y adelante entre pestañas visitadas' },
            { keys: 'Ctrl + \\', description: 'Partir la pantalla en dos' },
            { keys: 'Ctrl + Shift + |', description: 'Cambiar la orientacion de la particion' },
        ]
    },
    {
        category: 'Paneles', items: [
            { keys: 'Ctrl + B', description: 'Mostrar u ocultar la barra lateral' },
            { keys: 'Ctrl + Shift + E', description: 'Ir al explorador de archivos' },
            { keys: 'Ctrl + Shift + D', description: 'Ir al esquema de la base' },
            { keys: 'Ctrl + L', description: 'Abrir o cerrar el asistente' },
            { keys: 'Ctrl + +  /  Ctrl + -  /  Ctrl + 0', description: 'Escala de la interfaz' },
        ]
    },
    {
        category: 'Editor', items: [
            { keys: 'Ctrl + /', description: 'Comentar o descomentar' },
            { keys: 'Ctrl + D', description: 'Duplicar la linea' },
            { keys: 'Ctrl + Shift + K', description: 'Borrar la linea' },
            { keys: 'Ctrl + F', description: 'Buscar en el archivo' },
            { keys: 'Ctrl + H', description: 'Buscar y reemplazar' },
            { keys: 'Ctrl + G', description: 'Ir a una linea' },
            { keys: 'Alt + clic', description: 'Añadir otro cursor' },
            { keys: 'Ctrl + Shift + L', description: 'Un cursor en cada coincidencia' },
            { keys: 'Alt + ↑  /  Alt + ↓', description: 'Mover la linea' },
            { keys: 'Ctrl + Shift + [  /  ]', description: 'Plegar o desplegar el bloque' },
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
