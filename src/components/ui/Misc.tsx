import React, { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';
import { initials } from '../../services/validation';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: 'sm' | 'md';
    icon?: IconName;
    loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'secondary',
    size = 'md',
    icon,
    loading,
    children,
    className = '',
    disabled,
    ...props
}) => (
    <button
        className={`ws-btn ws-btn-${variant} ws-btn-${size} ${className}`}
        disabled={disabled || loading}
        {...props}
    >
        {loading ? <span className="ws-spinner ws-spinner-sm" /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
        {children}
    </button>
);

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    icon: IconName;
    label: string;
    size?: number;
    danger?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({ icon, label, size = 16, danger, className = '', ...props }) => (
    <button
        className={`ws-icon-btn ${danger ? 'danger' : ''} ${className}`}
        title={label}
        aria-label={label}
        {...props}
    >
        <Icon name={icon} size={size} />
    </button>
);

export const Avatar: React.FC<{ name: string; color?: string; size?: number; title?: string }> = ({ name, color, size = 30, title }) => (
    <span
        className="ws-avatar"
        title={title || name}
        style={{ width: size, height: size, background: color || '#8e8e93', fontSize: Math.max(10, size * 0.36) }}
    >
        {initials(name)}
    </span>
);

export const AvatarStack: React.FC<{ users: { name: string; avatarColor?: string }[]; max?: number }> = ({ users, max = 4 }) => (
    <span className="ws-avatar-stack">
        {users.slice(0, max).map((u, i) => (
            <Avatar key={`${u.name}-${i}`} name={u.name} color={u.avatarColor} size={24} />
        ))}
        {users.length > max && <span className="ws-avatar ws-avatar-more" style={{ width: 24, height: 24 }}>+{users.length - max}</span>}
    </span>
);

export const Badge: React.FC<{ children: ReactNode; color?: string; tone?: 'neutral' | 'blue' | 'green' | 'red' | 'orange' | 'purple'; dot?: boolean }> = ({
    children,
    color,
    tone = 'neutral',
    dot,
}) => (
    <span className={`ws-badge ws-badge-${tone}`} style={color ? { color, borderColor: `${color}55`, background: `${color}12` } : undefined}>
        {dot && <span className="ws-badge-dot" style={{ background: color || 'currentColor' }} />}
        {children}
    </span>
);

export const EmptyState: React.FC<{
    icon?: IconName;
    title: string;
    description?: string;
    action?: ReactNode;
    compact?: boolean;
}> = ({ icon = 'sparkles', title, description, action, compact }) => (
    <div className={`ws-empty ${compact ? 'compact' : ''}`}>
        <div className="ws-empty-icon"><Icon name={icon} size={compact ? 22 : 28} /></div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
        {action && <div className="ws-empty-action">{action}</div>}
    </div>
);

export const ProgressBar: React.FC<{ value: number; color?: string; label?: string }> = ({ value, color, label }) => (
    <div className="ws-progress-wrap">
        <div className="ws-progress">
            <div className="ws-progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color || 'var(--accent-primary)' }} />
        </div>
        <span className="ws-progress-label">{label || `${value}%`}</span>
    </div>
);

export const PageHeader: React.FC<{
    title: string;
    subtitle?: string;
    eyebrow?: string;
    actions?: ReactNode;
    onBack?: () => void;
    children?: ReactNode;
}> = ({ title, subtitle, eyebrow, actions, onBack, children }) => (
    <header className="ws-page-header">
        <div className="ws-page-title-wrap">
            {onBack && (
                <IconButton icon="arrow-left" label="Back" onClick={onBack} className="ws-back-btn" />
            )}
            <div>
                {eyebrow && <div className="ws-eyebrow">{eyebrow}</div>}
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
            </div>
        </div>
        {actions && <div className="ws-page-actions">{actions}</div>}
        {children}
    </header>
);

export const SectionCard: React.FC<{
    title?: string;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    padded?: boolean;
}> = ({ title, description, action, children, className = '', padded = true }) => (
    <section className={`ws-card ${padded ? 'ws-card-padded' : ''} ${className}`}>
        {(title || action) && (
            <header className="ws-card-header">
                <div>
                    {title && <h2>{title}</h2>}
                    {description && <p>{description}</p>}
                </div>
                {action}
            </header>
        )}
        {children}
    </section>
);

export const StatCard: React.FC<{
    label: string;
    value: ReactNode;
    hint?: string;
    icon?: IconName;
    tone?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'neutral';
    onClick?: () => void;
}> = ({ label, value, hint, icon, tone = 'neutral', onClick }) => (
    <div className={`ws-stat ws-stat-${tone} ${onClick ? 'clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
        <div className="ws-stat-top">
            <span className="ws-stat-label">{label}</span>
            {icon && <span className="ws-stat-icon"><Icon name={icon} size={16} /></span>}
        </div>
        <div className="ws-stat-value">{value}</div>
        {hint && <div className="ws-stat-hint">{hint}</div>}
    </div>
);

export interface TabItem {
    id: string;
    label: string;
    count?: number;
}

export const Tabs: React.FC<{ tabs: TabItem[]; value: string; onChange: (id: string) => void }> = ({ tabs, value, onChange }) => (
    <div className="ws-tabs" role="tablist">
        {tabs.map(tab => (
            <button
                key={tab.id}
                role="tab"
                aria-selected={value === tab.id}
                className={value === tab.id ? 'active' : ''}
                onClick={() => onChange(tab.id)}
            >
                {tab.label}
                {tab.count !== undefined && <span className="ws-tab-count">{tab.count}</span>}
            </button>
        ))}
    </div>
);

export const SearchInput: React.FC<{
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}> = ({ value, onChange, placeholder = 'Search…', className = '' }) => (
    <div className={`ws-search ${className}`}>
        <Icon name="search" size={15} />
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        {value && (
            <button onClick={() => onChange('')} aria-label="Clear search"><Icon name="x" size={13} /></button>
        )}
    </div>
);

export const ConfirmDialog: React.FC<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
}> = ({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, busy }) => (
    <Modal
        open={open}
        onClose={onCancel}
        title={title}
        size="sm"
        footer={(
            <>
                <Button onClick={onCancel} disabled={busy}>Cancel</Button>
                <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
            </>
        )}
    >
        <p className="ws-confirm-message">{message}</p>
    </Modal>
);

export const Spinner: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
    <div className="ws-loading"><span className="ws-spinner" /><span>{label}</span></div>
);

export const InlineError: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
    <div className="ws-inline-error">
        <Icon name="alert" size={16} />
        <span>{message}</span>
        {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
);
