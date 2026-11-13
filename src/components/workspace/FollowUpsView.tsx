import React, { useMemo, useState } from 'react';
import type { FollowUpChannel, Lead, Project, Task } from '../../db';
import {
    cancelFollowUp,
    completeFollowUp,
    createFollowUp,
    deleteFollowUp,
    FOLLOW_UP_CHANNELS,
    FOLLOW_UP_CHANNEL_LABEL,
    getFollowUpSummary,
    listFollowUps,
    updateFollowUp,
    type FollowUpWithMeta,
} from '../../services/followUps';
import { listLeads } from '../../services/leads';
import { listProjects } from '../../services/projects';
import { listTasks } from '../../services/tasks';
import { formatDate, formatDateTime, fromDatetimeLocal, toDatetimeLocal } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import type { WorkspaceNav } from '../../types/workspace';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, EmptyState, IconButton, PageHeader, SearchInput, SectionCard, StatCard, Tabs } from '../ui/Misc';
import { Icon, type IconName } from '../ui/Icon';
import { Field, Select, TextArea, TextInput, UserSelect } from '../ui/Form';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { DataState } from './shared';
import { useAsyncData } from './useAsyncData';

type Scope = 'today' | 'overdue' | 'upcoming' | 'pending' | 'completed' | 'cancelled';

const CHANNEL_ICON: Record<FollowUpChannel, IconName> = {
    call: 'phone',
    email: 'mail',
    meeting: 'calendar',
    message: 'message',
    other: 'clock',
};

const ENTITY_ICON: Record<'lead' | 'project' | 'task', IconName> = {
    lead: 'crm',
    project: 'projects',
    task: 'tasks',
};

interface FollowUpsViewProps {
    workspaceId: string;
    userId: string;
    nav: WorkspaceNav;
}

interface FormState {
    entityType: 'lead' | 'project' | 'task';
    entityId: string;
    title: string;
    channel: FollowUpChannel;
    dueAt: string;
    assignedTo: string;
    notes: string;
}

export const FollowUpsView: React.FC<FollowUpsViewProps> = ({ workspaceId, userId, nav }) => {
    const { members } = useAuth();
    const toast = useToast();
    const [scope, setScope] = useState<Scope>('pending');
    const [search, setSearch] = useState('');
    const [assignee, setAssignee] = useState('all');
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<FollowUpWithMeta | null>(null);
    const [completing, setCompleting] = useState<FollowUpWithMeta | null>(null);
    const [form, setForm] = useState<FormState>(() => emptyForm(userId));
    const [outcome, setOutcome] = useState('');
    const [nextAt, setNextAt] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const { data, loading, error: loadError, reload } = useAsyncData(async () => {
        const [items, summary, leads, projects, tasks] = await Promise.all([
            listFollowUps(workspaceId, { status: 'all', limit: 500 }),
            getFollowUpSummary(workspaceId, userId),
            listLeads(workspaceId),
            listProjects(workspaceId),
            listTasks(workspaceId),
        ]);
        return { items, summary, leads, projects, tasks };
    }, [workspaceId, userId]);

    const items = data?.items || [];
    const summary = data?.summary;
    const leads = data?.leads || [];
    const projects = data?.projects || [];
    const tasks = data?.tasks || [];

    const tabs = [
        { id: 'pending', label: 'All pending', count: items.filter(item => item.status === 'pending').length },
        { id: 'today', label: 'Today', count: summary?.today },
        { id: 'overdue', label: 'Overdue', count: summary?.overdue },
        { id: 'upcoming', label: 'Next 7 days', count: summary?.upcoming },
        { id: 'completed', label: 'Completed', count: summary?.completed },
        { id: 'cancelled', label: 'Cancelled', count: items.filter(item => item.status === 'cancelled').length },
    ];

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const week = new Date(today.getTime() + 7 * 86_400_000);
        const weekKey = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}-${String(week.getDate()).padStart(2, '0')}`;
        return items.filter(item => {
            if (scope === 'completed' && item.status !== 'completed') return false;
            if (scope === 'cancelled' && item.status !== 'cancelled') return false;
            if (scope !== 'completed' && scope !== 'cancelled' && item.status !== 'pending') return false;
            if (scope === 'overdue' && !item.overdue) return false;
            if (scope === 'today' && !item.dueToday) return false;
            if (scope === 'upcoming') {
                const key = new Date(item.dueAt);
                const itemKey = `${key.getFullYear()}-${String(key.getMonth() + 1).padStart(2, '0')}-${String(key.getDate()).padStart(2, '0')}`;
                if (itemKey <= todayKey || itemKey > weekKey || item.overdue) return false;
            }
            if (assignee !== 'all' && item.assignedTo !== assignee) return false;
            if (term && ![item.title, item.entityTitle, item.notes, item.outcome, item.assignedName].some(value => (value || '').toLowerCase().includes(term))) return false;
            return true;
        });
    }, [items, scope, search, assignee]);

    const openNew = () => {
        setEditing(null);
        setError('');
        setForm(emptyForm(userId));
        setFormOpen(true);
    };

    const openEdit = (item: FollowUpWithMeta) => {
        setEditing(item);
        setError('');
        setForm({
            entityType: item.entityType === 'project' || item.entityType === 'task' ? item.entityType : 'lead',
            entityId: item.entityId,
            title: item.title,
            channel: item.channel,
            dueAt: toDatetimeLocal(item.dueAt),
            assignedTo: item.assignedTo || '',
            notes: item.notes || '',
        });
        setFormOpen(true);
    };

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setSaving(true);
        try {
            const input = {
                title: form.title,
                channel: form.channel,
                dueAt: fromDatetimeLocal(form.dueAt),
                assignedTo: form.assignedTo || null,
                notes: form.notes,
            };
            if (editing) {
                await updateFollowUp(editing.id, input);
                toast.success('Follow-up updated.');
            } else {
                if (!form.entityId) throw new Error('Choose the lead, project or task this follow-up belongs to.');
                await createFollowUp(workspaceId, { ...input, entityType: form.entityType, entityId: form.entityId });
                toast.success('Follow-up scheduled.');
            }
            setFormOpen(false);
            await reload();
        } catch (e) {
            setError(toErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    const complete = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!completing) return;
        setSaving(true);
        try {
            await completeFollowUp(completing.id, outcome, nextAt ? fromDatetimeLocal(nextAt) : null);
            toast.success(nextAt ? 'Follow-up completed and the next one scheduled.' : 'Follow-up completed.');
            setCompleting(null);
            setOutcome('');
            setNextAt('');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    const cancel = async (item: FollowUpWithMeta) => {
        try {
            await cancelFollowUp(item.id);
            toast.success('Follow-up cancelled.');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const remove = async (item: FollowUpWithMeta) => {
        try {
            await deleteFollowUp(item.id);
            toast.success('Follow-up deleted.');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const openEntity = (item: FollowUpWithMeta) => {
        if (item.entityType === 'lead') nav.openLead(item.entityId);
        else if (item.entityType === 'project') nav.openProject(item.entityId);
        else if (item.entityType === 'task') nav.openTask(item.entityId);
        else nav.openNote(item.entityId);
    };

    return (
        <div className="ws-module">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow="Next actions"
                    title="Follow-ups"
                    subtitle="Every call, email, meeting and next step across leads, projects and tasks."
                    actions={<Button variant="primary" icon="plus" onClick={openNew}>New follow-up</Button>}
                />

                <div className="ws-grid ws-grid-3" style={{ marginBottom: 18 }}>
                    <StatCard label="Overdue" value={summary?.overdue ?? 0} hint="Needs attention now" icon="alert" tone="red" onClick={() => setScope('overdue')} />
                    <StatCard label="Due today" value={summary?.today ?? 0} hint={`${summary?.upcoming ?? 0} in the next 7 days`} icon="clock" tone="orange" onClick={() => setScope('today')} />
                    <StatCard label="Assigned to you" value={summary?.mine ?? 0} hint="Across all records" icon="user" tone="blue" onClick={() => { setAssignee(userId); setScope('pending'); }} />
                </div>

                <Tabs tabs={tabs} value={scope} onChange={id => setScope(id as Scope)} />

                <div className="ws-toolbar" style={{ marginBottom: 14 }}>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search follow-ups, people, records…" className="ws-search-wide" />
                    <Select value={assignee} onChange={e => setAssignee(e.target.value)} aria-label="Filter by assignee">
                        <option value="all">All assignees</option>
                        {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </Select>
                </div>

                <DataState loading={loading} error={loadError} onRetry={() => void reload()} />

                {!loading && !loadError && filtered.length === 0 && (
                    <EmptyState
                        icon="followups"
                        title={items.length === 0 ? 'No follow-ups yet' : 'Nothing in this view'}
                        description={items.length === 0 ? 'Schedule the next action from a lead, project, task or right here.' : 'Try another tab or clear the filters.'}
                    />
                )}

                {!loading && !loadError && filtered.length > 0 && (
                    <SectionCard padded={false}>
                        <div className="ws-table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
                            <table className="ws-table">
                                <thead>
                                    <tr>
                                        <th>Next action</th>
                                        <th>Record</th>
                                        <th>Due</th>
                                        <th>Owner</th>
                                        <th>Status</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(item => (
                                        <tr key={item.id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                                    <span className="ws-search-result-icon" style={{ width: 27, height: 27, flex: '0 0 auto' }}>
                                                        <Icon name={CHANNEL_ICON[item.channel]} size={13} />
                                                    </span>
                                                    <div>
                                                        <div className="cell-title">{item.title}</div>
                                                        <div className="cell-sub">
                                                            {FOLLOW_UP_CHANNEL_LABEL[item.channel]}
                                                            {item.status !== 'pending' && item.outcome
                                                                ? ` · Outcome: ${item.outcome.slice(0, 100)}`
                                                                : item.notes ? ` · ${item.notes.slice(0, 80)}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <button
                                                    style={{ border: 'none', background: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                                                    onClick={() => openEntity(item)}
                                                >
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                                        <Icon name={ENTITY_ICON[item.entityType as 'lead' | 'project' | 'task'] || 'file'} size={12} />
                                                        {item.entityTitle}
                                                    </span>
                                                    <span className="cell-sub" style={{ display: 'block' }}>{item.entitySubtitle}</span>
                                                </button>
                                            </td>
                                            <td className={item.overdue ? 'ws-task-overdue' : ''}>
                                                <div>{formatDateTime(item.dueAt)}</div>
                                                {item.dueToday && <Badge tone="orange">Today</Badge>}
                                                {item.overdue && <Badge tone="red">Overdue</Badge>}
                                            </td>
                                            <td>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                    <Avatar name={item.assignedName} color={item.assignedColor} size={20} />
                                                    {item.assignedName}
                                                </span>
                                            </td>
                                            <td>
                                                {item.status === 'completed' ? <Badge tone="green">Completed</Badge>
                                                    : item.status === 'cancelled' ? <Badge tone="neutral">Cancelled</Badge>
                                                        : <Badge tone="blue">Pending</Badge>}
                                            </td>
                                            <td>
                                                <div className="cell-actions">
                                                    {item.status === 'pending' && (
                                                        <IconButton
                                                            icon="check"
                                                            label="Complete follow-up"
                                                            onClick={() => { setCompleting(item); setOutcome(''); setNextAt(''); }}
                                                        />
                                                    )}
                                                    <IconButton icon="edit" label="Edit follow-up" onClick={() => openEdit(item)} />
                                                    {item.status === 'pending' && <IconButton icon="x" label="Cancel follow-up" onClick={() => void cancel(item)} />}
                                                    <IconButton icon="trash" label="Delete follow-up" danger onClick={() => void remove(item)} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="ws-table-footer">
                                <span>{filtered.length} follow-up{filtered.length === 1 ? '' : 's'}</span>
                                <span className="ws-muted">{formatDate(new Date())}</span>
                            </div>
                        </div>
                    </SectionCard>
                )}
            </div>

            <Modal
                open={formOpen}
                onClose={() => setFormOpen(false)}
                title={editing ? 'Edit follow-up' : 'New follow-up'}
                subtitle="Link the next action to the record it belongs to."
                size="lg"
                footer={(
                    <>
                        <Button onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
                        <Button variant="primary" type="submit" form="follow-up-module-form" loading={saving}>{editing ? 'Save changes' : 'Schedule follow-up'}</Button>
                    </>
                )}
            >
                <form id="follow-up-module-form" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {error && <div className="ws-form-error"><span>{error}</span></div>}
                    {!editing && (
                        <div className="ws-form-grid">
                            <Field label="Record type" htmlFor="follow-up-entity-type">
                                <Select
                                    id="follow-up-entity-type"
                                    value={form.entityType}
                                    onChange={e => setForm(prev => ({ ...prev, entityType: e.target.value as FormState['entityType'], entityId: '' }))}
                                >
                                    <option value="lead">Lead</option>
                                    <option value="project">Project</option>
                                    <option value="task">Task</option>
                                </Select>
                            </Field>
                            <Field label="Record" htmlFor="follow-up-entity">
                                <Select id="follow-up-entity" value={form.entityId} onChange={e => setForm(prev => ({ ...prev, entityId: e.target.value }))}>
                                    <option value="">Select a record…</option>
                                    {form.entityType === 'lead' && leads.map((lead: Lead) => <option key={lead.id} value={lead.id}>{lead.name}{lead.company ? ` · ${lead.company}` : ''}</option>)}
                                    {form.entityType === 'project' && projects.map((project: Project) => <option key={project.id} value={project.id}>{project.name} · {project.identifier}</option>)}
                                    {form.entityType === 'task' && tasks.map((task: Task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                                </Select>
                            </Field>
                        </div>
                    )}
                    <Field label="What needs to happen?" htmlFor="follow-up-module-title" required>
                        <TextInput id="follow-up-module-title" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Send revised proposal and confirm budget" autoFocus />
                    </Field>
                    <div className="ws-form-grid">
                        <Field label="Channel" htmlFor="follow-up-module-channel">
                            <Select id="follow-up-module-channel" value={form.channel} onChange={e => setForm(prev => ({ ...prev, channel: e.target.value as FollowUpChannel }))}>
                                {FOLLOW_UP_CHANNELS.map(channel => <option key={channel} value={channel}>{FOLLOW_UP_CHANNEL_LABEL[channel]}</option>)}
                            </Select>
                        </Field>
                        <Field label="When" htmlFor="follow-up-module-due" required>
                            <TextInput id="follow-up-module-due" type="datetime-local" value={form.dueAt} onChange={e => setForm(prev => ({ ...prev, dueAt: e.target.value }))} />
                        </Field>
                        <Field label="Assigned to" htmlFor="follow-up-module-assignee">
                            <UserSelect id="follow-up-module-assignee" users={members} value={form.assignedTo} onChange={value => setForm(prev => ({ ...prev, assignedTo: value }))} allowUnassigned />
                        </Field>
                    </div>
                    <Field label="Notes" htmlFor="follow-up-module-notes">
                        <TextArea id="follow-up-module-notes" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Context, agenda or the message to send." />
                    </Field>
                </form>
            </Modal>

            <Modal
                open={!!completing}
                onClose={() => setCompleting(null)}
                title="Complete follow-up"
                subtitle={completing ? `${completing.title} · ${completing.entityTitle}` : undefined}
                size="md"
                footer={(
                    <>
                        <Button onClick={() => setCompleting(null)} disabled={saving}>Cancel</Button>
                        <Button variant="primary" type="submit" form="follow-up-module-complete" loading={saving}>Complete</Button>
                    </>
                )}
            >
                <form id="follow-up-module-complete" onSubmit={complete} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Field label="Outcome" htmlFor="follow-up-module-outcome" required hint="What happened, and what was decided?">
                        <TextArea id="follow-up-module-outcome" value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="e.g. Client asked for a revised proposal by Friday." autoFocus />
                    </Field>
                    <Field label="Schedule next follow-up" htmlFor="follow-up-module-next" hint="Optional. A new follow-up will be created automatically.">
                        <TextInput id="follow-up-module-next" type="datetime-local" value={nextAt} onChange={e => setNextAt(e.target.value)} />
                    </Field>
                </form>
            </Modal>
        </div>
    );
};

function emptyForm(userId: string): FormState {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return {
        entityType: 'lead',
        entityId: '',
        title: '',
        channel: 'call',
        dueAt: toDatetimeLocal(next.getTime()),
        assignedTo: userId,
        notes: '',
    };
}
