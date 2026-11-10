import React, { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface FieldProps {
    label: string;
    htmlFor?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    children: ReactNode;
    className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, htmlFor, required, hint, error, children, className = '' }) => (
    <div className={`ws-field ${className}`}>
        <label htmlFor={htmlFor}>
            {label}
            {required && <span className="ws-required"> *</span>}
        </label>
        {children}
        {error ? <span className="ws-field-error">{error}</span> : hint ? <span className="ws-field-hint">{hint}</span> : null}
    </div>
);

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className = '', ...props }, ref) => (
        <input ref={ref} className={`ws-input ${className}`} {...props} />
    ),
);
TextInput.displayName = 'TextInput';

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    ({ className = '', ...props }, ref) => (
        <textarea ref={ref} className={`ws-input ws-textarea ${className}`} {...props} />
    ),
);
TextArea.displayName = 'TextArea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
    ({ className = '', children, ...props }, ref) => (
        <select ref={ref} className={`ws-input ws-select ${className}`} {...props}>{children}</select>
    ),
);
Select.displayName = 'Select';

interface TagInputProps {
    value: string[];
    onChange: (tags: string[]) => void;
    suggestions?: string[];
    placeholder?: string;
}

export const TagInput: React.FC<TagInputProps> = ({ value, onChange, suggestions = [], placeholder = 'Add a tag and press Enter' }) => {
    const [draft, setDraft] = useState('');

    const add = (raw: string) => {
        const name = raw.trim().replace(/,$/, '');
        if (!name) return;
        if (!value.some(v => v.toLowerCase() === name.toLowerCase())) {
            onChange([...value, name.slice(0, 40)]);
        }
        setDraft('');
    };

    const filtered = draft
        ? suggestions.filter(s => s.toLowerCase().includes(draft.toLowerCase()) && !value.some(v => v.toLowerCase() === s.toLowerCase())).slice(0, 6)
        : [];

    return (
        <div className="ws-tag-input">
            <div className="ws-tag-input-box">
                {value.map(tag => (
                    <span key={tag} className="ws-chip">
                        {tag}
                        <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} aria-label={`Remove ${tag}`}>
                            <Icon name="x" size={12} />
                        </button>
                    </span>
                ))}
                <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            add(draft);
                        } else if (e.key === 'Backspace' && !draft && value.length > 0) {
                            onChange(value.slice(0, -1));
                        }
                    }}
                    onBlur={() => { if (draft.trim()) add(draft); }}
                    placeholder={value.length === 0 ? placeholder : ''}
                />
            </div>
            {filtered.length > 0 && (
                <div className="ws-tag-suggestions">
                    {filtered.map(s => (
                        <button key={s} type="button" onMouseDown={e => { e.preventDefault(); add(s); }}>{s}</button>
                    ))}
                </div>
            )}
        </div>
    );
};

interface UserSelectProps {
    users: { id: string; name: string; avatarColor?: string }[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    allowUnassigned?: boolean;
    id?: string;
}

export const UserSelect: React.FC<UserSelectProps> = ({ users, value, onChange, placeholder = 'Select a person', allowUnassigned = false, id }) => (
    <Select id={id} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{allowUnassigned ? 'Unassigned' : placeholder}</option>
        {users.map(user => (
            <option key={user.id} value={user.id}>{user.name}</option>
        ))}
    </Select>
);

interface MultiUserSelectProps {
    users: { id: string; name: string; email?: string; avatarColor?: string }[];
    value: string[];
    onChange: (value: string[]) => void;
    disabledId?: string;
}

export const MultiUserSelect: React.FC<MultiUserSelectProps> = ({ users, value, onChange, disabledId }) => (
    <div className="ws-check-grid">
        {users.map(user => {
            const checked = value.includes(user.id);
            const disabled = user.id === disabledId;
            return (
                <label key={user.id} className={`ws-check-row ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}`}>
                    <input
                        type="checkbox"
                        checked={checked || disabled}
                        disabled={disabled}
                        onChange={() => {
                            onChange(checked ? value.filter(id => id !== user.id) : [...value, user.id]);
                        }}
                    />
                    <span className="ws-user-dot" style={{ background: user.avatarColor || '#8e8e93' }}>
                        {user.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="ws-check-name">{user.name}{disabled ? ' (owner)' : ''}</span>
                </label>
            );
        })}
        {users.length === 0 && <p className="ws-muted">No workspace members available.</p>}
    </div>
);
