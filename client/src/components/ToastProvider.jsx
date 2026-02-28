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
    success: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', icon: '#10b981', text: '#6ee7b7' },
    error: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', icon: '#ef4444', text: '#fca5a5' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', icon: '#f59e0b', text: '#fcd34d' },
    info: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', icon: '#3b82f6', text: '#93c5fd' },
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

    const addToast = useCallback((message, type = 'info', duration = 4000) => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, message, type, exiting: false }]);

        if (duration > 0) {
            timersRef.current[id] = setTimeout(() => {
                removeToast(id);
                delete timersRef.current[id];
            }, duration);
        }

        return id;
    }, [removeToast]);

    const toast = useCallback({
        success: (msg, duration) => addToast(msg, 'success', duration),
        error: (msg, duration) => addToast(msg, 'error', duration ?? 6000),
        warning: (msg, duration) => addToast(msg, 'warning', duration),
        info: (msg, duration) => addToast(msg, 'info', duration),
    }, [addToast]);

    // Fix: toast needs to be an object with methods, not useCallback
    // We'll use useMemo-like approach
    const toastApi = useRef(null);
    if (!toastApi.current) {
        toastApi.current = {
            success: (msg, duration) => addToast(msg, 'success', duration),
            error: (msg, duration) => addToast(msg, 'error', duration ?? 6000),
            warning: (msg, duration) => addToast(msg, 'warning', duration),
            info: (msg, duration) => addToast(msg, 'info', duration),
        };
    }
    // Keep addToast in sync
    toastApi.current._addToast = addToast;

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
                                backdropFilter: 'blur(16px)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
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
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <Icon size={12} color="#fff" />
                            </div>
                            <span style={{
                                fontSize: '13px',
                                fontWeight: '500',
                                color: 'var(--text-active)',
                                lineHeight: '1.4',
                                fontFamily: 'inherit',
                            }}>
                                {t.message}
                            </span>
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
    // Redirect calls through current addToast reference
    return {
        success: (msg, dur) => ctx._addToast(msg, 'success', dur),
        error: (msg, dur) => ctx._addToast(msg, 'error', dur ?? 6000),
        warning: (msg, dur) => ctx._addToast(msg, 'warning', dur),
        info: (msg, dur) => ctx._addToast(msg, 'info', dur),
    };
}

export default ToastProvider;
