import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, subtitle, children, footer, size = 'md' }) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className="ws-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={`ws-modal ws-modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
                <header className="ws-modal-header">
                    <div>
                        <h2>{title}</h2>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    <button className="ws-icon-btn" onClick={onClose} aria-label="Close dialog">
                        <Icon name="x" size={18} />
                    </button>
                </header>
                <div className="ws-modal-body">{children}</div>
                {footer && <footer className="ws-modal-footer">{footer}</footer>}
            </div>
        </div>,
        document.body,
    );
};
