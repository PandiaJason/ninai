import React from 'react';
import type { Priority, ProjectStatus, TaskStatus } from '../../db';
import { PRIORITY_LABEL } from '../../services/validation';
import { TASK_STATUS_LABEL } from '../../services/tasks';
import { PROJECT_STATUS_LABEL } from '../../services/projects';
import { Badge, Spinner } from '../ui/Misc';
import { Icon, type IconName } from '../ui/Icon';

export const PRIORITY_TONE: Record<Priority, 'neutral' | 'blue' | 'orange' | 'red' | 'purple'> = {
    low: 'neutral',
    medium: 'blue',
    high: 'orange',
    urgent: 'red',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
    low: '#8e8e93',
    medium: '#0071e3',
    high: '#ff9f0a',
    urgent: '#ff3b30',
};

export const PriorityBadge: React.FC<{ priority: Priority }> = ({ priority }) => (
    <Badge tone={PRIORITY_TONE[priority]} dot color={PRIORITY_COLOR[priority]}>
        {PRIORITY_LABEL[priority]}
    </Badge>
);

export const PriorityDot: React.FC<{ priority: Priority; title?: string }> = ({ priority, title }) => (
    <span className="ws-priority-dot" style={{ background: PRIORITY_COLOR[priority] }} title={title || PRIORITY_LABEL[priority]} />
);

export const TASK_STATUS_TONE: Record<TaskStatus, 'neutral' | 'blue' | 'green' | 'orange' | 'red' | 'purple'> = {
    backlog: 'neutral',
    todo: 'purple',
    in_progress: 'blue',
    in_review: 'orange',
    completed: 'green',
    cancelled: 'red',
};

export const TaskStatusBadge: React.FC<{ status: TaskStatus }> = ({ status }) => (
    <Badge tone={TASK_STATUS_TONE[status]}>{TASK_STATUS_LABEL[status]}</Badge>
);

export const PROJECT_STATUS_TONE: Record<ProjectStatus, 'neutral' | 'blue' | 'green' | 'orange' | 'red' | 'purple'> = {
    not_started: 'neutral',
    planning: 'purple',
    in_progress: 'blue',
    on_hold: 'orange',
    completed: 'green',
    cancelled: 'red',
};

export const ProjectStatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => (
    <Badge tone={PROJECT_STATUS_TONE[status]}>{PROJECT_STATUS_LABEL[status]}</Badge>
);

export function formatMoney(value: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(value || 0);
}

export const DataState: React.FC<{ loading: boolean; error?: string | null; onRetry?: () => void }> = ({ loading, error, onRetry }) => {
    if (loading) return <Spinner />;
    if (!error) return null;
    return (
        <div className="ws-inline-error">
            <Icon name="alert" size={16} />
            <span>{error}</span>
            {onRetry && <button onClick={onRetry}>Retry</button>}
        </div>
    );
};

export interface TimelineEntry {
    id: string;
    title: string;
    meta?: string;
    body?: string;
    icon?: IconName;
    actions?: React.ReactNode;
}

export const Timeline: React.FC<{ entries: TimelineEntry[]; empty?: string }> = ({ entries, empty = 'No activity yet.' }) => {
    if (entries.length === 0) {
        return <div className="ws-muted" style={{ padding: '10px 0' }}>{empty}</div>;
    }
    return (
        <div className="ws-timeline">
            {entries.map(entry => (
                <div className="ws-timeline-item" key={entry.id}>
                    <span className="ws-timeline-icon"><Icon name={entry.icon || 'activity'} size={14} /></span>
                    <div className="ws-timeline-content">
                        <div className="ws-timeline-title">{entry.title}</div>
                        {entry.meta && <div className="ws-timeline-meta">{entry.meta}</div>}
                        {entry.body && <div className="ws-timeline-body">{entry.body}</div>}
                    </div>
                    {entry.actions && <div className="ws-timeline-actions">{entry.actions}</div>}
                </div>
            ))}
        </div>
    );
};

export const MetaItem: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
    <div className="ws-meta-item">
        <span>{label}</span>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
    </div>
);

export function includesText(value: string | undefined, term: string): boolean {
    return !!value && value.toLowerCase().includes(term.toLowerCase());
}

export function readStoredView<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const stored = localStorage.getItem(key) as T | null;
    return stored && allowed.includes(stored) ? stored : fallback;
}
