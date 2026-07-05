import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LuTriangleAlert } from 'react-icons/lu';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
    const [dialog, setDialog] = useState(null);
    const resolverRef = useRef(null);
    const inputRef = useRef(null);
    const [inputValue, setInputValue] = useState('');

    const close = useCallback((value) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setDialog(null);
        setInputValue('');
        if (resolve) resolve(value);
    }, []);

    const promptAsync = useCallback((opts = {}) => {
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setInputValue(opts.defaultValue || '');
            setDialog({
                kind: 'prompt',
                title: opts.title || 'Input required',
                message: opts.message || '',
                placeholder: opts.placeholder || '',
                confirmLabel: opts.confirmLabel || 'OK',
                cancelLabel: opts.cancelLabel || 'Cancel',
                validate: opts.validate || null,
            });
        });
    }, []);

    const confirmAsync = useCallback((opts = {}) => {
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setDialog({
                kind: 'confirm',
                title: opts.title || 'Are you sure?',
                message: opts.message || '',
                confirmLabel: opts.confirmLabel || 'Confirm',
                cancelLabel: opts.cancelLabel || 'Cancel',
                destructive: !!opts.destructive,
            });
        });
    }, []);

    const api = useRef({ promptAsync, confirmAsync });
    api.current.promptAsync = promptAsync;
    api.current.confirmAsync = confirmAsync;

    useEffect(() => {
        if (!dialog) return;
        if (dialog.kind === 'prompt' && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close(dialog.kind === 'prompt' ? null : false);
            } else if (e.key === 'Enter' && dialog.kind === 'prompt') {
                e.preventDefault();
                submitPrompt();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dialog]); // eslint-disable-line react-hooks/exhaustive-deps

    const submitPrompt = () => {
        if (!dialog || dialog.kind !== 'prompt') return;
        const trimmed = (inputValue ?? '').trim();
        if (!trimmed) return;
        if (dialog.validate) {
            const err = dialog.validate(trimmed);
            if (err) return;
        }
        close(trimmed);
    };

    return (
        <DialogContext.Provider value={api.current}>
            {children}
            {dialog && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="amox-dialog-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) close(dialog.kind === 'prompt' ? null : false);
                    }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10000,
                        background: 'var(--overlay-bg)',

                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'dialog-fade-in 0.15s ease-out',
                    }}
                >
                    <div
                        style={{
                            minWidth: '360px',
                            maxWidth: '480px',
                            background: 'var(--surface-raised, #1f1f26)',
                            border: '1px solid var(--border-subtle, #33333c)',
                            borderRadius: '10px',
                            boxShadow: 'var(--shadow-lg)',
                            padding: '20px 22px 18px',
                            fontFamily: 'inherit',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            {dialog.destructive && (
                                <LuTriangleAlert size={18} color="var(--color-error, #f87171)" />
                            )}
                            <h3
                                id="amox-dialog-title"
                                style={{
                                    margin: 0,
                                    fontSize: '15px',
                                    fontWeight: 600,
                                    color: 'var(--text-active, #e5e5e5)',
                                }}
                            >
                                {dialog.title}
                            </h3>
                        </div>
                        {dialog.message && (
                            <p style={{
                                margin: '0 0 14px 0',
                                fontSize: '13px',
                                color: 'var(--text-primary, #bdbdc4)',
                                lineHeight: 1.5,
                            }}>
                                {dialog.message}
                            </p>
                        )}
                        {dialog.kind === 'prompt' && (
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                placeholder={dialog.placeholder}
                                onChange={(e) => setInputValue(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    background: 'var(--surface-base, #141418)',
                                    border: '1px solid var(--border-subtle, #33333c)',
                                    borderRadius: '6px',
                                    color: 'var(--text-active, #e5e5e5)',
                                    fontSize: '13px',
                                    fontFamily: 'inherit',
                                    outline: 'none',
                                    marginBottom: '14px',
                                }}
                            />
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                onClick={() => close(dialog.kind === 'prompt' ? null : false)}
                                style={{
                                    padding: '6px 14px',
                                    background: 'transparent',
                                    border: '1px solid var(--border-subtle, #33333c)',
                                    borderRadius: '6px',
                                    color: 'var(--text-primary, #bdbdc4)',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                {dialog.cancelLabel}
                            </button>
                            <button
                                onClick={() => {
                                    if (dialog.kind === 'prompt') submitPrompt();
                                    else close(true);
                                }}
                                disabled={dialog.kind === 'prompt' && !(inputValue ?? '').trim()}
                                style={{
                                    padding: '6px 14px',
                                    background: dialog.destructive
                                        ? 'var(--color-error, #dc2626)'
                                        : 'var(--accent-primary, #22d3ee)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: dialog.destructive ? 'var(--button-text-color, #fff)' : 'var(--surface-base, #141418)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    opacity: dialog.kind === 'prompt' && !(inputValue ?? '').trim() ? 0.5 : 1,
                                }}
                            >
                                {dialog.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
}

export function useDialog() {
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error('useDialog must be used within <DialogProvider>');
    return ctx;
}

export default DialogProvider;
