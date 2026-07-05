import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { LuCheck, LuX, LuTriangleAlert, LuInfo } from 'react-icons/lu';

const ToastContext = createContext(null);

let toastId = 0;

const ICONS = {
    success: LuCheck,
    error: LuX,
    warning: LuTriangleAlert,
    info: LuInfo,
};

const COLORS = {
    success: { bg: 'var(--feedback-success-bg)', border: 'var(--feedback-success-border)', icon: 'var(--color-success)', text: 'var(--color-success-text)' },
    error: { bg: 'var(--feedback-error-bg)', border: 'var(--feedback-error-border)', icon: 'var(--color-error)', text: 'var(--color-error-text)' },
    warning: { bg: 'var(--feedback-warning-bg)', border: 'var(--feedback-warning-border)', icon: 'var(--color-warning)', text: 'var(--color-warning-text)' },
    info: { bg: 'var(--feedback-info-bg)', border: 'var(--feedback-info-border)', icon: 'var(--color-info)', text: 'var(--color-info-text)' },
};

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef({});

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 250);
    }, []);

    const addToast = useCallback((message, type = 'info', opts) => {
        const id = ++toastId;
        // `opts` is either a duration (number, back-compat) or { duration, action }.
        const action = (opts && typeof opts === 'object') ? opts.action : undefined;
        const duration = typeof opts === 'number'
            ? opts
            : (opts?.duration ?? (action ? 12000 : (type === 'error' ? 6000 : 4000)));
        setToasts(prev => [...prev, { id, message, type, action, exiting: false }]);

        if (duration > 0) {
            timersRef.current[id] = setTimeout(() => {
                removeToast(id);
                delete timersRef.current[id];
            }, duration);
        }

        return id;
    }, [removeToast]);

    const toastApi = useRef(null);
    if (!toastApi.current) {
        toastApi.current = {
            success: (msg, duration) => addToast(msg, 'success', duration),
            error: (msg, duration) => addToast(msg, 'error', duration ?? 6000),
            warning: (msg, duration) => addToast(msg, 'warning', duration),
            info: (msg, duration) => addToast(msg, 'info', duration),
        };
    }
    return (
        <ToastContext.Provider value={toastApi.current}>
            {children}
            {/* Toast Container */}
            <div style={{
                position: 'fixed',
                bottom: '16px',
                right: '16px',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column-reverse',
                gap: '8px',
                pointerEvents: 'none',
                maxWidth: '420px',
            }}>
                {toasts.map((t) => {
                    const colors = COLORS[t.type] || COLORS.info;
                    const Icon = ICONS[t.type] || ICONS.info;
                    return (
                        <div
                            key={t.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                backgroundColor: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '8px',

                                boxShadow: 'var(--shadow-lg)',
                                pointerEvents: 'auto',
                                animation: t.exiting
                                    ? 'toast-exit 0.25s ease-in forwards'
                                    : 'toast-enter 0.3s ease-out',
                                cursor: 'pointer',
                                maxWidth: '420px',
                            }}
                            onClick={() => removeToast(t.id)}
                        >
                            <div style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                backgroundColor: colors.icon,
                                color: 'var(--surface-base)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <Icon size={12} color="currentColor" />
                            </div>
                            <span style={{
                                flex: 1,
                                fontSize: '13px',
                                fontWeight: '500',
                                color: 'var(--text-active)',
                                lineHeight: '1.4',
                                fontFamily: 'inherit',
                            }}>
                                {t.message}
                            </span>
                            {t.action && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); try { t.action.onClick?.(); } catch (err) { /* noop */ } removeToast(t.id); }}
                                    style={{
                                        flexShrink: 0, background: 'transparent', border: `1px solid ${colors.border}`,
                                        color: 'var(--text-active)', borderRadius: '6px', padding: '3px 10px',
                                        fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    {t.action.label || 'Action'}
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
                                aria-label="Dismiss"
                                style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                            >
                                <LuX size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
    // The context value IS the stable API object (identity never changes).
    // Returning a fresh object here would invalidate every useCallback that
    // depends on `toast` and, in cascade, every memoized component below App.
    return ctx;
}

export default ToastProvider;
