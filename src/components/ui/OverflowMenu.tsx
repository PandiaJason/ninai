import React, { useEffect, useRef, useState } from 'react';
import { IconButton } from './Misc';
import { Icon, type IconName } from './Icon';

export interface OverflowMenuItem {
    id: string;
    label: string;
    icon?: IconName;
    danger?: boolean;
    disabled?: boolean;
    separator?: boolean;
    onSelect?: () => void;
}

interface OverflowMenuProps {
    label?: string;
    items: OverflowMenuItem[];
    className?: string;
}

export const OverflowMenu: React.FC<OverflowMenuProps> = ({ label = 'More actions', items, className = '' }) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') || []);
            if (!buttons.length) return;
            event.preventDefault();
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === 'Home'
                ? 0
                : event.key === 'End'
                    ? buttons.length - 1
                    : event.key === 'ArrowDown'
                        ? (index + 1 + buttons.length) % buttons.length
                        : (index - 1 + buttons.length) % buttons.length;
            buttons[next].focus();
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        requestAnimationFrame(() => {
            menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
        });
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div className={`ws-overflow ${className}`} ref={wrapRef}>
            <IconButton
                icon="more"
                label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
            />
            {open && (
                <div className="ws-overflow-menu" role="menu" aria-label={label} ref={menuRef}>
                    {items.map(item => (
                        <React.Fragment key={item.id}>
                            {item.separator && <div className="ws-overflow-separator" role="separator" />}
                            <button
                                type="button"
                                role="menuitem"
                                className={item.danger ? 'danger' : ''}
                                disabled={item.disabled}
                                onClick={() => {
                                    setOpen(false);
                                    item.onSelect?.();
                                }}
                            >
                                {item.icon && <Icon name={item.icon} size={15} />}
                                <span>{item.label}</span>
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            )}
        </div>
    );
};
