import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Reminder } from '../db';

interface RemindersWidgetProps {
    activeNoteId?: string;
    activeNoteTitle?: string;
}

export const RemindersWidget: React.FC<RemindersWidgetProps> = ({ activeNoteId, activeNoteTitle }) => {
    const [now, setNow] = useState(new Date());
    const [isExpanded, setIsExpanded] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
    const [linkToNote, setLinkToNote] = useState(false);
    const firedRef = useRef<Set<string>>(new Set());
    const inputRef = useRef<HTMLInputElement>(null);

    // Live clock — tick every minute
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Live query for upcoming reminders (not done, sorted by due date)
    const reminders = useLiveQuery(
        () => db.reminders
            .where('done').equals(0)
            .sortBy('dueAt'),
        []
    ) || [];

    // Desktop notifications for due reminders
    useEffect(() => {
        if (!reminders.length) return;
        const nowMs = now.getTime();

        reminders.forEach(r => {
            if (r.done) return;
            const dueMs = new Date(r.dueAt).getTime();
            if (dueMs <= nowMs && !firedRef.current.has(r.id)) {
                firedRef.current.add(r.id);
                if (Notification.permission === 'granted') {
                    new Notification('NINAI Reminder', { body: r.title, icon: '/icon.png' });
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then(p => {
                        if (p === 'granted') {
                            new Notification('NINAI Reminder', { body: r.title, icon: '/icon.png' });
                        }
                    });
                }
            }
        });
    }, [reminders, now]);

    // Group reminders by day
    const grouped = React.useMemo(() => {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const groups: { label: string; items: Reminder[] }[] = [
            { label: 'Overdue', items: [] },
            { label: 'Today', items: [] },
            { label: 'Tomorrow', items: [] },
            { label: 'This Week', items: [] },
            { label: 'Later', items: [] },
        ];

        reminders.forEach(r => {
            const d = new Date(r.dueAt);
            const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (dDate < today) groups[0].items.push(r);
            else if (dDate.getTime() === today.getTime()) groups[1].items.push(r);
            else if (dDate.getTime() === tomorrow.getTime()) groups[2].items.push(r);
            else if (dDate < nextWeek) groups[3].items.push(r);
            else groups[4].items.push(r);
        });

        return groups.filter(g => g.items.length > 0);
    }, [reminders, now]);

    const addReminder = async () => {
        if (!newTitle.trim() || !newDate) return;
        const dueAt = new Date(`${newDate}T${newTime || '09:00'}`);
        await db.reminders.add({
            id: Date.now().toString(),
            noteId: linkToNote ? activeNoteId : undefined,
            title: newTitle.trim(),
            dueAt,
            done: false,
            createdAt: new Date()
        });
        setNewTitle('');
        setNewDate('');
        setNewTime('');
        setLinkToNote(false);
        setShowAddForm(false);
    };

    const toggleDone = async (id: string) => {
        await db.reminders.update(id, { done: true });
    };

    const deleteReminder = async (id: string) => {
        await db.reminders.delete(id);
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
                    {reminders.length > 0 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                            ({reminders.length})
                        </span>
                    )}
                </div>
                <button
                    className="icon-btn-ghost"
                    style={{ padding: '2px', marginRight: '-4px' }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowAddForm(!showAddForm);
                        setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                    title="Add Reminder"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>

            {/* Add Reminder Form */}
            {showAddForm && (
                <div className="reminder-add-form">
                    <input
                        ref={inputRef}
                        className="reminder-input"
                        placeholder="Reminder title..."
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addReminder(); if (e.key === 'Escape') setShowAddForm(false); }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                            className="reminder-input"
                            type="date"
                            value={newDate}
                            onChange={e => setNewDate(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <input
                            className="reminder-input"
                            type="time"
                            value={newTime}
                            onChange={e => setNewTime(e.target.value)}
                            style={{ width: '100px' }}
                        />
                    </div>
                    {activeNoteId && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={linkToNote}
                                onChange={e => setLinkToNote(e.target.checked)}
                                style={{ transform: 'scale(1.1)' }}
                            />
                            Link to "{(activeNoteTitle || 'Untitled').slice(0, 20)}"
                        </label>
                    )}
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button className="reminder-btn-cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
                        <button className="reminder-btn-add" onClick={addReminder} disabled={!newTitle.trim() || !newDate}>Add</button>
                    </div>
                </div>
            )}

            {/* Reminder List */}
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
                            {group.items.map(r => (
                                <div key={r.id} className={`reminder-item ${group.label === 'Overdue' ? 'overdue' : ''}`}>
                                    <button
                                        className="reminder-check"
                                        onClick={() => toggleDone(r.id)}
                                        title="Mark as done"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" />
                                        </svg>
                                    </button>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="reminder-title">{r.title}</div>
                                        <div className="reminder-meta">
                                            {formatReminderTime(r.dueAt)}
                                            {r.noteId && (
                                                <span style={{ marginLeft: '6px', opacity: 0.6 }}>
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-1px' }}>
                                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                        <polyline points="14 2 14 8 20 8" />
                                                    </svg>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        className="reminder-delete"
                                        onClick={() => deleteReminder(r.id)}
                                        title="Delete"
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
