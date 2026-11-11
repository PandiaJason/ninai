import React, { useMemo, useState } from 'react';
import type { CalendarEventType, Lead, Project } from '../../db';
import {
    createCalendarEvent,
    deleteCalendarEvent,
    getCalendarEvent,
    getCalendarItems,
    updateCalendarEvent,
    EVENT_TYPES,
    EVENT_TYPE_LABEL,
    type CalendarItem,
} from '../../services/calendar';
import { listLeads } from '../../services/leads';
import { listProjects } from '../../services/projects';
import {
    addDays,
    dateKey,
    endOfDay,
    formatDate,
    formatTime,
    fromDatetimeLocal,
    startOfDay,
    toDatetimeLocal,
} from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import type { WorkspaceNav } from '../../types/workspace';
import { Button, ConfirmDialog, IconButton, PageHeader, SectionCard } from '../ui/Misc';
import { Field, Select, TextArea, TextInput } from '../ui/Form';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { DataState, readStoredView } from './shared';
import { useAsyncData } from './useAsyncData';

type CalendarViewMode = 'month' | 'week' | 'day';

interface CalendarViewProps {
    workspaceId: string;
    nav: WorkspaceNav;
}

interface EventFormState {
    title: string;
    description: string;
    location: string;
    type: CalendarEventType;
    startAt: string;
    endAt: string;
    allDay: boolean;
    leadId: string;
    projectId: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CalendarView: React.FC<CalendarViewProps> = ({ workspaceId, nav }) => {
    const toast = useToast();
    const [view, setView] = useState<CalendarViewMode>(() => readStoredView('ninai_calendar_view', ['month', 'week', 'day'], 'month'));
    const [cursor, setCursor] = useState(() => new Date());
    const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()));
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<EventFormState>(() => emptyEventForm(dateKey(new Date())));
    const [leads, setLeads] = useState<Lead[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const range = useMemo(() => {
        if (view === 'month') {
            const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
            const start = addDays(first, -first.getDay());
            return { start: startOfDay(start).getTime(), end: endOfDay(addDays(start, 41)).getTime(), gridStart: startOfDay(start) };
        }
        if (view === 'week') {
            const start = addDays(startOfDay(cursor), -cursor.getDay());
            return { start: start.getTime(), end: endOfDay(addDays(start, 6)).getTime(), gridStart: start };
        }
        return { start: startOfDay(cursor).getTime(), end: endOfDay(cursor).getTime(), gridStart: startOfDay(cursor) };
    }, [view, cursor]);

    const { data, loading, error: loadError, reload } = useAsyncData(
        () => getCalendarItems(workspaceId, range.start, range.end),
        [workspaceId, range.start, range.end],
    );

    const items = data || [];

    const changeView = (next: CalendarViewMode) => {
        setView(next);
        localStorage.setItem('ninai_calendar_view', next);
    };

    const shift = (direction: -1 | 1) => {
        setCursor(prev => {
            if (view === 'month') return new Date(prev.getFullYear(), prev.getMonth() + direction, 1);
            if (view === 'week') return addDays(prev, direction * 7);
            return addDays(prev, direction);
        });
    };

    const goToday = () => {
        const now = new Date();
        setCursor(now);
        setSelectedKey(dateKey(now));
    };

    const openNew = (dayKey?: string) => {
        setEditingId(null);
        setError('');
        setForm(emptyEventForm(dayKey || selectedKey));
        setFormOpen(true);

        void Promise.all([listLeads(workspaceId), listProjects(workspaceId)])
            .then(([workspaceLeads, workspaceProjects]) => {
                setLeads(workspaceLeads);
                setProjects(workspaceProjects.filter(project => !project.archived));
            })
            .catch(e => setError(toErrorMessage(e)));
    };

    const openEvent = async (item: CalendarItem) => {
        if (item.source !== 'event') {
            navigateEntity(item);
            return;
        }
        try {
            setError('');
            const [event, workspaceLeads, workspaceProjects] = await Promise.all([
                getCalendarEvent(item.id),
                listLeads(workspaceId),
                listProjects(workspaceId),
            ]);
            setLeads(workspaceLeads);
            setProjects(workspaceProjects.filter(project => !project.archived));
            setEditingId(event.id);
            setForm({
                title: event.title,
                description: event.description || '',
                location: event.location || '',
                type: event.type,
                startAt: toDatetimeLocal(event.startAt),
                endAt: toDatetimeLocal(event.endAt),
                allDay: event.allDay === 1,
                leadId: event.leadId || '',
                projectId: event.projectId || '',
            });
            setFormOpen(true);
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const navigateEntity = (item: CalendarItem) => {
        if (item.entityId && item.entityType === 'task') nav.openTask(item.entityId);
        else if (item.entityId && item.entityType === 'lead') nav.openLead(item.entityId);
        else if (item.entityId && item.entityType === 'project') nav.openProject(item.entityId);
        else if (item.source === 'followup') nav.go('followups');
    };

    const saveEvent = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setSaving(true);
        try {
            const startAt = fromDatetimeLocal(form.startAt);
            const endAt = fromDatetimeLocal(form.endAt);
            const input = {
                title: form.title,
                description: form.description,
                location: form.location,
                type: form.type,
                startAt: form.allDay ? startOfDay(new Date(startAt)).getTime() : startAt,
                endAt: form.allDay ? endOfDay(new Date(startAt)).getTime() : endAt,
                allDay: form.allDay,
                leadId: form.leadId || null,
                projectId: form.projectId || null,
            };
            if (editingId) await updateCalendarEvent(editingId, input);
            else await createCalendarEvent(workspaceId, input);
            toast.success(editingId ? 'Event updated.' : 'Event created.');
            setFormOpen(false);
            await reload();
        } catch (e) {
            setError(toErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    const removeEvent = async () => {
        if (!confirmDeleteId) return;
        try {
            await deleteCalendarEvent(confirmDeleteId);
            toast.success('Event deleted.');
            setConfirmDeleteId(null);
            setFormOpen(false);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const itemsForDay = (dayKey: string) => items.filter(item => {
        const start = dateKey(item.startAt);
        const end = dateKey(item.endAt);
        return dayKey >= start && dayKey <= end;
    });

    const title = view === 'month'
        ? cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : view === 'week'
            ? `${formatDate(range.gridStart)} – ${formatDate(addDays(range.gridStart, 6))}`
            : cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const monthCells = view === 'month'
        ? Array.from({ length: 42 }, (_, index) => addDays(range.gridStart, index))
        : [];

    const weekCells = view === 'week'
        ? Array.from({ length: 7 }, (_, index) => addDays(range.gridStart, index))
        : [startOfDay(cursor)];

    const selectedItems = itemsForDay(view === 'day' ? dateKey(cursor) : selectedKey);

    return (
        <div className="ws-module">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow="Schedule"
                    title="Calendar"
                    subtitle="Follow-ups, task deadlines, meetings and lead activity in one timeline."
                    actions={<Button variant="primary" icon="calendar-plus" onClick={() => openNew()}>New event</Button>}
                />

                <div className="ws-toolbar" style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconButton icon="chevron-left" label="Previous" onClick={() => shift(-1)} />
                        <IconButton icon="chevron-right" label="Next" onClick={() => shift(1)} />
                        <Button size="sm" variant="ghost" onClick={goToday}>Today</Button>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.02em' }}>{title}</span>
                    <span className="ws-toolbar-spacer" />
                    <div className="ws-segmented">
                        <button className={view === 'month' ? 'active' : ''} onClick={() => changeView('month')}>Month</button>
                        <button className={view === 'week' ? 'active' : ''} onClick={() => changeView('week')}>Week</button>
                        <button className={view === 'day' ? 'active' : ''} onClick={() => changeView('day')}>Day</button>
                    </div>
                </div>

                <DataState loading={loading} error={loadError} onRetry={() => void reload()} />

                <div className="ws-calendar-layout">
                    <div>
                        {!loading && !loadError && view === 'month' && (
                            <div className="ws-calendar">
                                <div className="ws-calendar-head">
                                    {WEEKDAYS.map(day => <div key={day}>{day}</div>)}
                                </div>
                                <div className="ws-calendar-grid">
                                    {monthCells.map(day => {
                                        const key = dateKey(day);
                                        const dayItems = itemsForDay(key);
                                        const isToday = key === dateKey(new Date());
                                        return (
                                            <div
                                                key={key}
                                                className={`ws-calendar-day ${day.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${key === selectedKey ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                                                onClick={() => setSelectedKey(key)}
                                            >
                                                <span className={`ws-calendar-daynum ${day.getDay() === 0 || day.getDay() === 6 ? 'weekend' : ''}`}>{day.getDate()}</span>
                                                {dayItems.slice(0, 3).map(item => (
                                                    <button
                                                        key={item.id}
                                                        className={`ws-calendar-event ${item.completed ? 'completed' : ''}`}
                                                        style={{ background: `${item.color}18`, color: item.color, borderLeftColor: item.color }}
                                                        title={item.title}
                                                        onClick={event => { event.stopPropagation(); setSelectedKey(key); void openEvent(item); }}
                                                    >
                                                        {item.allDay ? '' : `${formatTime(item.startAt)} `}{item.title}
                                                    </button>
                                                ))}
                                                {dayItems.length > 3 && <span className="ws-calendar-more">+{dayItems.length - 3} more</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {!loading && !loadError && view === 'week' && (
                            <div className="ws-calendar-week">
                                {weekCells.map(day => {
                                    const key = dateKey(day);
                                    return (
                                        <div key={key} className="ws-calendar-week-col">
                                            <div className={`ws-calendar-week-head ${key === dateKey(new Date()) ? 'today' : ''}`} style={key === dateKey(new Date()) ? { color: 'var(--accent-primary)' } : undefined}>
                                                {day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                                            </div>
                                            <div className="ws-calendar-week-body">
                                                {itemsForDay(key).map(item => (
                                                    <button
                                                        key={item.id}
                                                        className={`ws-calendar-event ${item.completed ? 'completed' : ''}`}
                                                        style={{ background: `${item.color}18`, color: item.color, borderLeftColor: item.color, padding: '5px 6px', borderRadius: 6 }}
                                                        onClick={() => void openEvent(item)}
                                                    >
                                                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                                                            <span>{item.allDay ? 'All day' : formatTime(item.startAt)}</span>
                                                            <span style={{ fontWeight: 600 }}>{item.title}</span>
                                                        </span>
                                                    </button>
                                                ))}
                                                {itemsForDay(key).length === 0 && <span className="ws-small ws-muted">No events</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!loading && !loadError && view === 'day' && (
                            <SectionCard title={cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} description={`${selectedItems.length} scheduled item${selectedItems.length === 1 ? '' : 's'}`}>
                                <div className="ws-calendar-agenda">
                                    {selectedItems.length === 0 && <p className="ws-muted">Nothing scheduled today. Create an event or move to another day.</p>}
                                    {selectedItems.map(item => (
                                        <div key={item.id} className="ws-agenda-item" onClick={() => void openEvent(item)}>
                                            <span className="ws-agenda-time">{item.allDay ? 'All day' : formatTime(item.startAt)}</span>
                                            <span style={{ width: 3, borderRadius: 2, background: item.color, flex: '0 0 auto' }} />
                                            <div className="ws-agenda-body">
                                                <div className={`ws-agenda-title ${item.completed ? 'ws-muted' : ''}`} style={item.completed ? { textDecoration: 'line-through' } : undefined}>{item.title}</div>
                                                <div className="ws-agenda-sub">{item.subtitle || EVENT_TYPE_LABEL[item.type]}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}
                    </div>

                    <aside className="ws-detail-side">
                        <SectionCard
                            title={formatDate(selectedKey)}
                            description={`${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'}`}
                            action={<IconButton icon="plus" label="Add event" onClick={() => openNew(selectedKey)} />}
                        >
                            <div className="ws-calendar-agenda">
                                {selectedItems.length === 0 && <p className="ws-muted">No items for this day.</p>}
                                {selectedItems.map(item => (
                                    <div key={item.id} className="ws-agenda-item" onClick={() => void openEvent(item)}>
                                        <span className="ws-agenda-time">{item.allDay ? 'All day' : formatTime(item.startAt)}</span>
                                        <span style={{ width: 3, borderRadius: 2, background: item.color, flex: '0 0 auto' }} />
                                        <div className="ws-agenda-body">
                                            <div className={`ws-agenda-title ${item.completed ? 'ws-muted' : ''}`} style={item.completed ? { textDecoration: 'line-through' } : undefined}>{item.title}</div>
                                            <div className="ws-agenda-sub">{item.subtitle || EVENT_TYPE_LABEL[item.type]}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>

                        <SectionCard title="Legend">
                            <div className="ws-info-list">
                                {EVENT_TYPES.map(type => (
                                    <div key={type} className="ws-info-row">
                                        <span className="ws-stage-color" style={{ background: TYPE_COLOR[type] }} />
                                        <span className="ws-info-value">{EVENT_TYPE_LABEL[type]}</span>
                                    </div>
                                ))}
                                <div className="ws-info-row"><span className="ws-stage-color" style={{ background: '#ff9f0a' }} /><span className="ws-info-value">Task deadline</span></div>
                                <div className="ws-info-row"><span className="ws-stage-color" style={{ background: '#34c759' }} /><span className="ws-info-value">Lead follow-up</span></div>
                            </div>
                        </SectionCard>
                    </aside>
                </div>
            </div>

            <Modal
                open={formOpen}
                onClose={() => setFormOpen(false)}
                title={editingId ? 'Edit event' : 'New event'}
                subtitle="Link the event to a lead so it appears in their history."
                footer={(
                    <>
                        {editingId && <Button variant="danger" icon="trash" onClick={() => setConfirmDeleteId(editingId)}>Delete</Button>}
                        <span style={{ flex: 1 }} />
                        <Button onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
                        <Button variant="primary" type="submit" form="calendar-event-form" loading={saving}>{editingId ? 'Save changes' : 'Create event'}</Button>
                    </>
                )}
            >
                <form id="calendar-event-form" onSubmit={saveEvent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {error && <div className="ws-form-error"><span>{error}</span></div>}
                    <Field label="Title" htmlFor="event-title" required>
                        <TextInput id="event-title" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Discovery call with Acme" autoFocus />
                    </Field>
                    <div className="ws-form-grid">
                        <Field label="Type" htmlFor="event-type">
                            <Select id="event-type" value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value as CalendarEventType }))}>
                                {EVENT_TYPES.map(type => <option key={type} value={type}>{EVENT_TYPE_LABEL[type]}</option>)}
                            </Select>
                        </Field>
                        <Field label="Location" htmlFor="event-location">
                            <TextInput id="event-location" value={form.location} onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))} placeholder="Office, Zoom, phone…" />
                        </Field>
                        <Field label="Starts" htmlFor="event-start">
                            <TextInput id="event-start" type="datetime-local" value={form.startAt} onChange={e => setForm(prev => ({ ...prev, startAt: e.target.value }))} />
                        </Field>
                        <Field label="Ends" htmlFor="event-end">
                            <TextInput id="event-end" type="datetime-local" value={form.endAt} min={form.startAt} onChange={e => setForm(prev => ({ ...prev, endAt: e.target.value }))} />
                        </Field>
                    </div>
                    <label className="ws-check-row" style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 10px' }}>
                        <input type="checkbox" checked={form.allDay} onChange={e => setForm(prev => ({ ...prev, allDay: e.target.checked }))} />
                        <span className="ws-check-name">All-day event</span>
                    </label>
                    <div className="ws-form-grid">
                        <Field label="Related lead" htmlFor="event-lead">
                            <Select id="event-lead" value={form.leadId} onChange={e => setForm(prev => ({ ...prev, leadId: e.target.value }))}>
                                <option value="">No lead</option>
                                {leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}{lead.company ? ` · ${lead.company}` : ''}</option>)}
                            </Select>
                        </Field>
                        <Field label="Related project" htmlFor="event-project">
                            <Select id="event-project" value={form.projectId} onChange={e => setForm(prev => ({ ...prev, projectId: e.target.value }))}>
                                <option value="">No project</option>
                                {projects.map(project => <option key={project.id} value={project.id}>{project.name} · {project.identifier}</option>)}
                            </Select>
                        </Field>
                    </div>
                    <Field label="Description" htmlFor="event-description">
                        <TextArea id="event-description" value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Agenda, preparation or outcome." />
                    </Field>
                </form>
            </Modal>

            <ConfirmDialog
                open={!!confirmDeleteId}
                title="Delete event?"
                message="This removes the event from the calendar. Linked records are not affected."
                confirmLabel="Delete event"
                danger
                onCancel={() => setConfirmDeleteId(null)}
                onConfirm={() => void removeEvent()}
            />
        </div>
    );
};

const TYPE_COLOR: Record<CalendarEventType, string> = {
    meeting: '#0071e3',
    follow_up: '#ff9f0a',
    deadline: '#ff3b30',
    reminder: '#8e8e93',
    other: '#5e5ce6',
};

function emptyEventForm(dayKey: string): EventFormState {
    return {
        title: '',
        description: '',
        location: '',
        type: 'meeting',
        startAt: `${dayKey}T09:00`,
        endAt: `${dayKey}T10:00`,
        allDay: false,
        leadId: '',
        projectId: '',
    };
}
