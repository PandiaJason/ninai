import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Note } from '../db';

interface HomeDashboardProps {
    onSelectNote: (noteId: string) => void;
}

const priorityColors: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#3b82f6'
};

const priorityLabels: Record<string, string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low'
};

export const HomeDashboard: React.FC<HomeDashboardProps> = ({ onSelectNote }) => {
    const [now, setNow] = useState(new Date());
    const firedRef = useRef<Set<string>>(new Set());

    // Live clock — tick every minute
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Live query for notes with due dates
    const taskNotes = useLiveQuery(
        () => db.notes.filter(n => n.dueAt != null).sortBy('dueAt'),
        []
    ) || [];

    // Desktop notifications
    useEffect(() => {
        if (!taskNotes.length) return;
        const nowMs = now.getTime();
        taskNotes.forEach(n => {
            if (!n.dueAt) return;
            const dueMs = new Date(n.dueAt).getTime();
            if (dueMs <= nowMs && !firedRef.current.has(n.id)) {
                firedRef.current.add(n.id);
                if (Notification.permission === 'granted') {
                    new Notification('NINAI Reminder', { body: n.title || 'Untitled' });
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then(p => {
                        if (p === 'granted') new Notification('NINAI Reminder', { body: n.title || 'Untitled' });
                    });
                }
            }
        });
    }, [taskNotes, now]);

    // Group by day
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

        taskNotes.forEach(n => {
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
    }, [taskNotes, now]);

    const clearReminder = async (noteId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await db.notes.update(noteId, { dueAt: undefined, priority: undefined });
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
                    {taskNotes.length > 0 && (
                        <span className="home-tasks-count">{taskNotes.length}</span>
                    )}
                </div>

                {grouped.length === 0 ? (
                    <div className="home-empty-tasks">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                            <polyline points="9 11 12 14 22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        <p>No task reminders set</p>
                        <p className="home-hint">Open a note and click 🔔 to set a reminder</p>
                    </div>
                ) : (
                    <div className="home-tasks-list">
                        {grouped.map(group => (
                            <div key={group.label} className="home-task-group">
                                <div className={`home-group-label ${group.label === 'Overdue' ? 'overdue' : ''}`}>
                                    {group.label}
                                </div>
                                {group.items.map(n => (
                                    <div
                                        key={n.id}
                                        className="home-task-item"
                                        onClick={() => onSelectNote(n.id)}
                                    >
                                        <div className="home-task-content">
                                            <div className="home-task-title">
                                                {n.priority && (
                                                    <span
                                                        className="home-priority-dot"
                                                        style={{ background: priorityColors[n.priority] }}
                                                        title={priorityLabels[n.priority]}
                                                    />
                                                )}
                                                {n.title || 'Untitled'}
                                            </div>
                                            <div className="home-task-meta">
                                                {n.dueAt && formatDueDate(n.dueAt)}
                                                {n.priority && (
                                                    <span
                                                        className="home-priority-label"
                                                        style={{ color: priorityColors[n.priority] }}
                                                    >
                                                        {priorityLabels[n.priority]}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            className="home-task-clear"
                                            onClick={e => clearReminder(n.id, e)}
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
