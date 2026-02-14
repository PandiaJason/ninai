import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { NoteReminder, RepeatOption } from '../db';

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

/** Compute next due date for a recurring reminder */
function getNextOccurrence(current: Date, repeat: RepeatOption): Date {
    const next = new Date(current);
    switch (repeat) {
        case 'daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'weekdays': {
            // Advance to next weekday (Mon–Fri)
            do { next.setDate(next.getDate() + 1); }
            while (next.getDay() === 0 || next.getDay() === 6);
            break;
        }
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            break;
        case 'yearly':
            next.setFullYear(next.getFullYear() + 1);
            break;
    }
    return next;
}

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
    // Optimized queries
    // 1. Get notes with reminders
    const reminderNotes = useLiveQuery(() =>
        db.notes.where('hasReminders').equals(1).toArray()
    ) || [];

    // 2. Get loved notes
    const lovedNotes = useLiveQuery(() =>
        db.notes.where('loved').equals(1).toArray()
    ) || [];

    // Combine for safety if needed, but for now treat independently
    // The auto-advance effect needs to check relevant notes

    // Auto-advance overdue recurring reminders
    useEffect(() => {
        if (!reminderNotes.length) return;

        const nowMs = now.getTime();
        reminderNotes.forEach(note => {
            if (!note.reminders || note.reminders.length === 0) return;
            let changed = false;
            const updated = note.reminders.map(r => {
                if (r.repeat && new Date(r.dueAt).getTime() < nowMs) {
                    // Advance until dueAt is in the future
                    let next = new Date(r.dueAt);
                    while (next.getTime() < nowMs) {
                        next = getNextOccurrence(next, r.repeat);
                    }
                    changed = true;
                    return { ...r, dueAt: next };
                }
                return r;
            });
            if (changed) {
                db.notes.update(note.id, { reminders: updated });
            }
        });
    }, [reminderNotes, now]);

    // Flatten all reminders across notes
    const flatReminders: FlatReminder[] = React.useMemo(() => {
        if (!reminderNotes.length) return [];
        const result: FlatReminder[] = [];
        reminderNotes.forEach(n => {
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
    }, [reminderNotes]);

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
            { label: 'Completed', items: [] },
            { label: 'Overdue', items: [] },
            { label: 'Today', items: [] },
            { label: 'Tomorrow', items: [] },
            { label: 'This Week', items: [] },
            { label: 'Later', items: [] },
        ];

        flatReminders.forEach(fr => {
            if (fr.reminder.completedAt) {
                groups[0].items.push(fr);
                return;
            }

            const d = new Date(fr.reminder.dueAt);
            const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (dDate < today) groups[1].items.push(fr);
            else if (dDate.getTime() === today.getTime()) groups[2].items.push(fr);
            else if (dDate.getTime() === tomorrow.getTime()) groups[3].items.push(fr);
            else if (dDate < nextWeek) groups[4].items.push(fr);
            else groups[5].items.push(fr);
        });

        // specific sort for completed: most recently completed first
        groups[0].items.sort((a, b) => {
            const tA = new Date(a.reminder.completedAt!).getTime();
            const tB = new Date(b.reminder.completedAt!).getTime();
            return tB - tA;
        });

        return groups.filter(g => g.items.length > 0);
    }, [flatReminders, now]);

    const toggleComplete = async (noteId: string, reminderId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const note = reminderNotes.find(n => n.id === noteId);
        if (!note) return;
        const reminder = (note.reminders || []).find(r => r.id === reminderId);

        if (reminder?.completedAt) {
            // Completed -> Delete (Trash)
            const updated = (note.reminders || []).filter(r => r.id !== reminderId);
            await db.notes.update(noteId, {
                reminders: updated,
                hasReminders: updated.length > 0 ? 1 : 0
            });
        } else if (reminder?.repeat) {
            // Recurring: advance to next occurrence
            const next = getNextOccurrence(new Date(reminder.dueAt), reminder.repeat);
            const updated = (note.reminders || []).map(r =>
                r.id === reminderId ? { ...r, dueAt: next } : r
            );
            await db.notes.update(noteId, { reminders: updated });
        } else {
            // One-time: Mark as completed
            const updated = (note.reminders || []).map(r =>
                r.id === reminderId ? { ...r, completedAt: new Date() } : r
            );
            await db.notes.update(noteId, { reminders: updated });
        }
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
                                <div className={`home-group-label ${group.label === 'Overdue' ? 'overdue' : group.label === 'Completed' ? 'completed-label' : ''}`}>
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
                                                <span style={{
                                                    textDecoration: fr.reminder.completedAt ? 'line-through' : 'none',
                                                    opacity: fr.reminder.completedAt ? 0.6 : 1
                                                }}>
                                                    {fr.reminder.text || 'Untitled'}
                                                </span>
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
                                                {fr.reminder.repeat && (
                                                    <span className="home-repeat-badge">🔁 {fr.reminder.repeat}</span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            className={`home-task-clear ${fr.reminder.completedAt ? 'is-delete' : ''}`}
                                            onClick={e => toggleComplete(fr.noteId, fr.reminder.id, e)}
                                            title={fr.reminder.completedAt ? 'Delete forever' : fr.reminder.repeat ? 'Mark done (advances to next)' : 'Mark done'}
                                        >
                                            {fr.reminder.completedAt ? (
                                                // Trash icon for completed
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6" />
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            ) : fr.reminder.repeat ? (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            ) : (
                                                // Check icon for one-time (initially)
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Loved Notes */}
            {(() => {
                if (lovedNotes.length === 0) return null;
                return (
                    <div className="home-loved-section">
                        <div className="home-loved-header">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                            <span>Loved Notes</span>
                            <span className="home-loved-count">{lovedNotes.length}</span>
                        </div>
                        <div className="home-loved-grid">
                            {lovedNotes.map(note => {
                                // Strip HTML to get a plain-text preview
                                const plainText = note.content
                                    .replace(/<[^>]+>/g, ' ')
                                    .replace(/\s+/g, ' ')
                                    .trim();
                                const preview = plainText.length > 80 ? plainText.slice(0, 80) + '…' : plainText;
                                return (
                                    <div
                                        key={note.id}
                                        className="home-loved-card"
                                        onClick={() => onSelectNote(note.id)}
                                    >
                                        <div className="home-loved-card-title">
                                            {note.title || 'Untitled'}
                                        </div>
                                        {preview && (
                                            <div className="home-loved-card-preview">{preview}</div>
                                        )}
                                        <div className="home-loved-card-date">
                                            {new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
