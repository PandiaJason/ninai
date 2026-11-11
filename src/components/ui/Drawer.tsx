import React, { useEffect, useRef } from 'react';
import './Drawer.css';

interface DrawerProps {
    open: boolean;
    onClose: () => void;
    label: string;
    children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({ open, onClose, label, children }) => {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const previousFocus = document.activeElement as HTMLElement | null;
        const frame = requestAnimationFrame(() => panelRef.current?.focus());

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', onKeyDown);
            previousFocus?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="ws-drawer-layer">
            <button className="ws-drawer-backdrop" onClick={onClose} aria-label="Close details" tabIndex={-1} />
            <div
                ref={panelRef}
                className="ws-drawer-panel"
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
            >
                {children}
            </div>
        </div>
    );
};
