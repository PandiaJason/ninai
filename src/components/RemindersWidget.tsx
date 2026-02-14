import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Note } from '../db';

interface RemindersWidgetProps {
    onSelectNote?: (noteId: string) => void;
}

export const RemindersWidget: React.FC<RemindersWidgetProps> = ({ onSelectNote }) => {
    const [now, setNow] = useState(new Date());
    const [isExpanded, setIsExpanded] = useState(true);
    const firedRef = useRef<Set<string>>(new Set());

    // Live clock — tick every minute
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Live query for notes with due dates (sorted by dueAt)
    const notesWithDue = useLiveQuery(
        () => db.notes.filter(n => n.dueAt != null).sortBy('dueAt'),
        []
    ) || [];

    // Desktop notifications for due notes
    useEffect(() => {
        if (!notesWithDue.length) return;
        const nowMs = now.getTime();

        notesWithDue.forEach(n => {
            if (!n.dueAt) return;
            const dueMs = new Date(n.dueAt).getTime();
            if (dueMs <= nowMs && !firedRef.current.has(n.id)) {
                firedRef.current.add(n.id);
                if (Notification.permission === 'granted') {
                    new Notification('NINAI Reminder', { body: n.title || 'Untitled', icon: '/icon.png' });
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then(p => {
                        if (p === 'granted') {
                            new Notification('NINAI Reminder', { body: n.title || 'Untitled', icon: '/icon.png' });
                        }
                    });
                }
            }
        });
    }, [notesWithDue, now]);

    // Group notes by day
    const grouped = React.useMemo(() => {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const groups: { label: string; items: Note[] }[] = [
            { label: 'Overdue', items: [] },
            { label: 'Today', items: [] },
            { label: 'Tomorrow', items: [] },
            { label: 'This Week', items: [] },
            { label: 'Later', items: [] },
        ];

        notesWithDue.forEach(n => {
            if (!n.dueAt) return;
            const d = new Date(n.dueAt);
            const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (dDate < today) groups[0].items.push(n);
            else if (dDate.getTime() === today.getTime()) groups[1].items.push(n);
            else if (dDate.getTime() === tomorrow.getTime()) groups[2].items.push(n);
            else if (dDate < nextWeek) groups[3].items.push(n);
            else groups[4].items.push(n);
        });

        return groups.filter(g => g.items.length > 0);
    }, [notesWithDue, now]);

    const clearReminder = async (noteId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await db.notes.update(noteId, { dueAt: undefined });
    };

    const formatTime = (d: Date) => {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const formatDate = (d: Date) => {
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const formatReminderTime = (d: Date) => {
        const due = new Date(d);
        return due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    return (
        <div className="reminders-widget">
            {/* Divider */}
            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '8px 12px' }} />

            {/* Live Clock */}
            <div className="reminders-clock" onClick={() => setIsExpanded(!isExpanded)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatTime(now)}</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{formatDate(now)}</span>
            </div>

            {/* Upcoming Header */}
            <div
                className="reminders-section-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <span>Upcoming</span>
                    {notesWithDue.length > 0 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                            ({notesWithDue.length})
                        </span>
                    )}
                </div>
            </div>

            {/* Reminder List — notes with due dates */}
            {isExpanded && (
                <div className="reminders-list">
                    {grouped.length === 0 && (
                        <div style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                            No upcoming reminders
                        </div>
                    )}
                    {grouped.map(group => (
                        <div key={group.label}>
                            <div className="reminder-group-label">{group.label}</div>
                            {group.items.map(n => (
                                <div
                                    key={n.id}
                                    className={`reminder-item ${group.label === 'Overdue' ? 'overdue' : ''}`}
                                    onClick={() => onSelectNote?.(n.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px', color: 'var(--text-tertiary)' }}>
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="reminder-title">{n.title || 'Untitled'}</div>
                                        <div className="reminder-meta">
                                            {n.dueAt && formatReminderTime(n.dueAt)}
                                        </div>
                                    </div>
                                    <button
                                        className="reminder-delete"
                                        onClick={(e) => clearReminder(n.id, e)}
                                        title="Clear reminder"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
