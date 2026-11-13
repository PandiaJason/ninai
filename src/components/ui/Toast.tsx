import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
    id: number;
    kind: ToastKind;
    message: string;
}

interface ToastApi {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [items, setItems] = useState<ToastItem[]>([]);
    const counter = useRef(0);

    const push = useCallback((kind: ToastKind, message: string) => {
        const id = ++counter.current;
        setItems(prev => [...prev, { id, kind, message }]);
        window.setTimeout(() => {
            setItems(prev => prev.filter(item => item.id !== id));
        }, kind === 'error' ? 6000 : 4000);
    }, []);

    const api = useMemo<ToastApi>(() => ({
        success: (message) => push('success', message),
        error: (message) => push('error', message),
        info: (message) => push('info', message),
    }), [push]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            {createPortal(
                <div className="ws-toast-stack" aria-live="polite">
                    {items.map(item => (
                        <div key={item.id} className={`ws-toast ws-toast-${item.kind}`}>
                            <span className="ws-toast-icon">
                                <Icon
                                    name={item.kind === 'success' ? 'circle-check' : item.kind === 'error' ? 'alert' : 'bell'}
                                    size={16}
                                />
                            </span>
                            <span>{item.message}</span>
                            <button
                                className="ws-toast-close"
                                onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
                                aria-label="Dismiss"
                            >
                                <Icon name="x" size={14} />
                            </button>
                        </div>
                    ))}
                </div>,
                document.body,
            )}
        </ToastContext.Provider>
    );
};

export function useToast(): ToastApi {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside ToastProvider');
    return ctx;
}
