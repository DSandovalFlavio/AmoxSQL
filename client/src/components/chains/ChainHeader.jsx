/**
 * ChainHeader — una sola linea de identidad.
 *
 * Lo que fue ChainToolbar: tres secciones y once botones repartidos entre
 * identidad, ejecucion y herramientas. Ejecutar y las herramientas se fueron a
 * la barra flotante del lienzo (ChainBottomBar), asi que aqui solo queda quien
 * eres: el nombre, si hay cambios sin guardar, la validacion, y Guardar.
 *
 * El nombre se edita DONDE SE LEE. Antes se mostraba como texto muerto y
 * cambiarlo no estaba en ningun sitio evidente.
 */
import { useState, useRef, useEffect } from 'react';
import { LuSave, LuInfo, LuTriangleAlert, LuCircleAlert, LuPencil } from 'react-icons/lu';

const ChainHeader = ({
    chainName, onRename, onSave, onShowGuide,
    isDirty, errorCount = 0, warningCount = 0,
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (!editing) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [editing]);

    const start = () => { setDraft(chainName || ''); setEditing(true); };
    const commit = () => {
        const name = draft.trim();
        // Un nombre vacio dejaria la pestana sin identidad: se descarta y se
        // conserva el que habia, en vez de guardar "".
        if (name && name !== chainName) onRename?.(name);
        setEditing(false);
    };

    const hasErrors = errorCount > 0;
    const hasWarnings = warningCount > 0 && !hasErrors;

    return (
        <div className="chain-header">
            <span className="chain-header-studio" title="Data Flow — the visual studio where flows are built">
                Data Flow
            </span>
            {onShowGuide && (
                <button className="chain-header-help" onClick={onShowGuide} title="What is Data Flow?" aria-label="What is Data Flow?">
                    <LuInfo size={12} />
                </button>
            )}

            {editing ? (
                <input
                    ref={inputRef}
                    className="chain-header-name-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
                    }}
                    spellCheck={false}
                    aria-label="Flow name"
                />
            ) : (
                <button className="chain-header-name" onClick={start} title="Rename this flow">
                    <span>{chainName || 'Untitled Flow'}</span>
                    <LuPencil size={11} className="chain-header-pencil" />
                </button>
            )}

            <span className={`chain-header-state ${isDirty ? 'chain-header-state-dirty' : ''}`}>
                {isDirty ? 'unsaved changes' : 'saved'}
            </span>

            {(hasErrors || hasWarnings) && (
                <span
                    className={`chain-header-badge ${hasErrors ? 'chain-header-badge-error' : 'chain-header-badge-warn'}`}
                    title={hasErrors ? `${errorCount} node error(s) — fix before running` : `${warningCount} warning(s)`}
                >
                    {hasErrors ? <LuCircleAlert size={11} /> : <LuTriangleAlert size={11} />}
                    <span>{hasErrors ? errorCount : warningCount}</span>
                </span>
            )}

            <span className="chain-header-gap" />

            <button
                className={`chain-header-save ${isDirty ? 'chain-header-save-dirty' : ''}`}
                onClick={onSave}
                title="Save (Ctrl+S)"
            >
                <LuSave size={13} /><span>Save</span>
            </button>
        </div>
    );
};

export default ChainHeader;
