import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { NoteReminder } from '../db';

interface HomeDashboardProps {
    onSelectNote: (noteId: string) => void;
}

const priorityColors: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#3b82f6'
};

const priorityLabels: Record<string, string> = {
    high: 'HIGH',
    medium: 'MED',
    low: 'LOW'
};

// Flattened reminder with parent note info
interface FlatReminder {
    reminder: NoteReminder;
    noteId: string;
    noteTitle: string;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({ onSelectNote }) => {
    const [now, setNow] = useState(new Date());
    const firedRef = useRef<Set<string>>(new Set());

    // Live clock — tick every minute
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Live query: all notes (we'll filter those with reminders)
    const allNotes = useLiveQuery(
        () => db.notes.toArray(),
        []
    ) || [];

    // Flatten all reminders across notes
    const flatReminders: FlatReminder[] = React.useMemo(() => {
        const result: FlatReminder[] = [];
        allNotes.forEach(n => {
            if (n.reminders && n.reminders.length > 0) {
                n.reminders.forEach(r => {
                    result.push({
                        reminder: r,
                        noteId: n.id,
                        noteTitle: n.title || 'Untitled'
                    });
                });
            }
        });
        // Sort by dueAt
        result.sort((a, b) => new Date(a.reminder.dueAt).getTime() - new Date(b.reminder.dueAt).getTime());
        return result;
    }, [allNotes]);

    // Desktop notifications
    useEffect(() => {
        if (!flatReminders.length) return;
        const nowMs = now.getTime();
        flatReminders.forEach(fr => {
            const dueMs = new Date(fr.reminder.dueAt).getTime();
            const key = `${fr.noteId}_${fr.reminder.id}`;
            if (dueMs <= nowMs && !firedRef.current.has(key)) {
                firedRef.current.add(key);
                if (Notification.permission === 'granted') {
                    new Notification('NINAI Reminder', { body: `${fr.reminder.text} (${fr.noteTitle})` });
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then(p => {
                        if (p === 'granted') new Notification('NINAI Reminder', { body: `${fr.reminder.text} (${fr.noteTitle})` });
                    });
                }
            }
        });
    }, [flatReminders, now]);

    // Group by day
    const grouped = React.useMemo(() => {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const groups: { label: string; items: FlatReminder[] }[] = [
            { label: 'Overdue', items: [] },
            { label: 'Today', items: [] },
            { label: 'Tomorrow', items: [] },
            { label: 'This Week', items: [] },
            { label: 'Later', items: [] },
        ];

        flatReminders.forEach(fr => {
            const d = new Date(fr.reminder.dueAt);
            const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (dDate < today) groups[0].items.push(fr);
            else if (dDate.getTime() === today.getTime()) groups[1].items.push(fr);
            else if (dDate.getTime() === tomorrow.getTime()) groups[2].items.push(fr);
            else if (dDate < nextWeek) groups[3].items.push(fr);
            else groups[4].items.push(fr);
        });

        return groups.filter(g => g.items.length > 0);
    }, [flatReminders, now]);

    const clearReminder = async (noteId: string, reminderId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const note = allNotes.find(n => n.id === noteId);
        if (!note) return;
        const updated = (note.reminders || []).filter(r => r.id !== reminderId);
        await db.notes.update(noteId, { reminders: updated });
    };

    const formatDueDate = (d: Date) => {
        const due = new Date(d);
        const dateStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return `${dateStr} · ${timeStr}`;
    };

    return (
        <div className="home-dashboard">
            {/* Clock + Greeting */}
            <div className="home-clock">
                <div className="home-time">
                    {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </div>
                <div className="home-date">
                    {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
            </div>

            {/* Task Reminders */}
            <div className="home-tasks-section">
                <div className="home-tasks-header">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    <span>Task Reminders</span>
                    {flatReminders.length > 0 && (
                        <span className="home-tasks-count">{flatReminders.length}</span>
                    )}
                </div>

                {grouped.length === 0 ? (
                    <div className="home-empty-tasks">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                            <polyline points="9 11 12 14 22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        <p>No task reminders set</p>
                        <p className="home-hint">Select text in a note and click 🔔 to set a reminder</p>
                    </div>
                ) : (
                    <div className="home-tasks-list">
                        {grouped.map(group => (
                            <div key={group.label} className="home-task-group">
                                <div className={`home-group-label ${group.label === 'Overdue' ? 'overdue' : ''}`}>
                                    {group.label}
                                </div>
                                {group.items.map(fr => (
                                    <div
                                        key={fr.reminder.id}
                                        className="home-task-item"
                                        onClick={() => onSelectNote(fr.noteId)}
                                    >
                                        <div className="home-task-content">
                                            <div className="home-task-title">
                                                <span
                                                    className="home-priority-dot"
                                                    style={{ background: priorityColors[fr.reminder.priority] }}
                                                    title={fr.reminder.priority}
                                                />
                                                {fr.reminder.text || 'Untitled'}
                                            </div>
                                            <div className="home-task-meta">
                                                <span className="home-task-note-name">{fr.noteTitle}</span>
                                                <span className="home-task-separator">·</span>
                                                {formatDueDate(fr.reminder.dueAt)}
                                                <span
                                                    className="home-priority-label"
                                                    style={{ color: priorityColors[fr.reminder.priority] }}
                                                >
                                                    {priorityLabels[fr.reminder.priority]}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            className="home-task-clear"
                                            onClick={e => clearReminder(fr.noteId, fr.reminder.id, e)}
                                            title="Clear reminder"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
