import React, { useState } from 'react';
import type { EntityType, FollowUpChannel } from '../../db';
import {
    cancelFollowUp,
    completeFollowUp,
    createFollowUp,
    deleteFollowUp,
    FOLLOW_UP_CHANNELS,
    FOLLOW_UP_CHANNEL_LABEL,
    listEntityFollowUps,
    updateFollowUp,
    type FollowUpWithMeta,
} from '../../services/followUps';
import { fromDatetimeLocal, formatDateTime, toDatetimeLocal } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, EmptyState, IconButton, SectionCard } from '../ui/Misc';
import { Icon, type IconName } from '../ui/Icon';
import { Field, Select, TextArea, TextInput, UserSelect } from '../ui/Form';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { useAsyncData } from './useAsyncData';

const CHANNEL_ICON: Record<FollowUpChannel, IconName> = {
    call: 'phone',
    email: 'mail',
    meeting: 'calendar',
    message: 'message',
    other: 'clock',
};

interface EntityFollowUpsProps {
    workspaceId: string;
    entityType: EntityType;
    entityId: string;
    entityLabel?: string;
    title?: string;
    onChanged?: () => void;
}

interface FormState {
    title: string;
    channel: FollowUpChannel;
    dueAt: string;
    assignedTo: string;
    notes: string;
}

export const EntityFollowUps: React.FC<EntityFollowUpsProps> = ({
    workspaceId,
    entityType,
    entityId,
    entityLabel,
    title = 'Follow-ups',
    onChanged,
}) => {
    const { user, members } = useAuth();
    const toast = useToast();
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<FollowUpWithMeta | null>(null);
    const [completing, setCompleting] = useState<FollowUpWithMeta | null>(null);
    const [outcome, setOutcome] = useState('');
    const [nextAt, setNextAt] = useState('');
    const [form, setForm] = useState<FormState>(() => emptyForm(user?.id || '', entityLabel));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const { data, loading, reload } = useAsyncData(
        () => listEntityFollowUps(entityType, entityId),
        [entityType, entityId],
    );
    const items = data || [];
    const pending = items.filter(item => item.status === 'pending');
    const completed = items.filter(item => item.status !== 'pending');

    const openNew = () => {
        setEditing(null);
        setError('');
        setForm(emptyForm(user?.id || '', entityLabel));
        setFormOpen(true);
    };

    const openEdit = (item: FollowUpWithMeta) => {
        setEditing(item);
        setError('');
        setForm({
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
                await createFollowUp(workspaceId, { ...input, entityType, entityId });
                toast.success('Follow-up scheduled.');
            }
            setFormOpen(false);
            await reload();
            onChanged?.();
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
            await completeFollowUp(
                completing.id,
                outcome,
                nextAt ? fromDatetimeLocal(nextAt) : null,
            );
            toast.success(nextAt ? 'Follow-up completed and the next one scheduled.' : 'Follow-up completed.');
            setCompleting(null);
            setOutcome('');
            setNextAt('');
            await reload();
            onChanged?.();
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
            onChanged?.();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const remove = async (item: FollowUpWithMeta) => {
        try {
            await deleteFollowUp(item.id);
            toast.success('Follow-up deleted.');
            await reload();
            onChanged?.();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    return (
        <>
            <SectionCard
                title={title}
                description={pending.length ? `${pending.length} pending · ${completed.length} closed` : 'Keep the next action visible.'}
                action={<Button size="sm" icon="plus" onClick={openNew}>Schedule</Button>}
            >
                {loading && items.length === 0 && <p className="ws-muted">Loading follow-ups…</p>}
                {!loading && items.length === 0 && (
                    <EmptyState compact icon="followups" title="No follow-ups yet" description="Schedule a call, email or next step so it does not get lost." />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...pending, ...completed].map(item => (
                        <div
                            key={item.id}
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 2px',
                                borderBottom: '1px solid var(--border-subtle)',
                                opacity: item.status === 'pending' ? 1 : 0.62,
                            }}
                        >
                            <span className="ws-search-result-icon" style={{ width: 30, height: 30, flex: '0 0 auto' }}>
                                <Icon name={CHANNEL_ICON[item.channel]} size={14} />
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 650, textDecoration: item.status === 'completed' ? 'line-through' : undefined }}>{item.title}</span>
                                    {item.overdue && <Badge tone="red">Overdue</Badge>}
                                    {item.dueToday && <Badge tone="orange">Today</Badge>}
                                    {item.status === 'completed' && <Badge tone="green">Completed</Badge>}
                                    {item.status === 'cancelled' && <Badge tone="neutral">Cancelled</Badge>}
                                </div>
                                <div className="ws-small ws-muted" style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                    <span>{formatDateTime(item.dueAt)}</span>
                                    <span>·</span>
                                    <span>{FOLLOW_UP_CHANNEL_LABEL[item.channel]}</span>
                                    <span>·</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Avatar name={item.assignedName} color={item.assignedColor} size={15} />
                                        {item.assignedName}
                                    </span>
                                </div>
                                {(item.notes || item.outcome) && <div className="ws-small" style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{item.outcome || item.notes}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 2 }}>
                                {item.status === 'pending' && (
                                    <IconButton
                                        icon="check"
                                        label="Complete follow-up"
                                        onClick={() => {
                                            setCompleting(item);
                                            setOutcome('');
                                            setNextAt('');
                                        }}
                                    />
                                )}
                                <IconButton icon="edit" label="Edit follow-up" onClick={() => openEdit(item)} />
                                {item.status === 'pending' && <IconButton icon="x" label="Cancel follow-up" onClick={() => void cancel(item)} />}
                                <IconButton icon="trash" label="Delete follow-up" danger onClick={() => void remove(item)} />
                            </div>
                        </div>
                    ))}
                </div>
            </SectionCard>

            <Modal
                open={formOpen}
                onClose={() => setFormOpen(false)}
                title={editing ? 'Edit follow-up' : 'Schedule follow-up'}
                subtitle={entityLabel ? `For ${entityLabel}` : 'Set the next action and owner.'}
                size="md"
                footer={(
                    <>
                        <Button onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
                        <Button variant="primary" type="submit" form="follow-up-form" loading={saving}>
                            {editing ? 'Save changes' : 'Schedule'}
                        </Button>
                    </>
                )}
            >
                <form id="follow-up-form" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {error && <div className="ws-form-error"><span>{error}</span></div>}
                    <Field label="What needs to happen?" htmlFor="follow-up-title" required>
                        <TextInput
                            id="follow-up-title"
                            value={form.title}
                            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                            placeholder={entityLabel ? `Follow up with ${entityLabel}` : 'e.g. Send proposal and confirm budget'}
                            autoFocus
                        />
                    </Field>
                    <div className="ws-form-grid">
                        <Field label="Channel" htmlFor="follow-up-channel">
                            <Select id="follow-up-channel" value={form.channel} onChange={e => setForm(prev => ({ ...prev, channel: e.target.value as FollowUpChannel }))}>
                                {FOLLOW_UP_CHANNELS.map(channel => <option key={channel} value={channel}>{FOLLOW_UP_CHANNEL_LABEL[channel]}</option>)}
                            </Select>
                        </Field>
                        <Field label="When" htmlFor="follow-up-due" required>
                            <TextInput id="follow-up-due" type="datetime-local" value={form.dueAt} onChange={e => setForm(prev => ({ ...prev, dueAt: e.target.value }))} />
                        </Field>
                        <Field label="Assigned to" htmlFor="follow-up-assignee">
                            <UserSelect id="follow-up-assignee" users={members} value={form.assignedTo} onChange={value => setForm(prev => ({ ...prev, assignedTo: value }))} allowUnassigned />
                        </Field>
                    </div>
                    <Field label="Notes" htmlFor="follow-up-notes">
                        <TextArea id="follow-up-notes" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Context, agenda or the message to send." />
                    </Field>
                </form>
            </Modal>

            <Modal
                open={!!completing}
                onClose={() => setCompleting(null)}
                title="Complete follow-up"
                subtitle={completing?.title}
                size="md"
                footer={(
                    <>
                        <Button onClick={() => setCompleting(null)} disabled={saving}>Cancel</Button>
                        <Button variant="primary" type="submit" form="complete-follow-up-form" loading={saving}>Complete</Button>
                    </>
                )}
            >
                <form id="complete-follow-up-form" onSubmit={complete} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Field label="Outcome" htmlFor="follow-up-outcome" required hint="What happened, and what was decided?">
                        <TextArea id="follow-up-outcome" value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="e.g. Client asked for a revised proposal by Friday." autoFocus />
                    </Field>
                    <Field label="Schedule next follow-up" htmlFor="follow-up-next" hint="Optional. A new follow-up will be created automatically.">
                        <TextInput id="follow-up-next" type="datetime-local" value={nextAt} onChange={e => setNextAt(e.target.value)} />
                    </Field>
                </form>
            </Modal>
        </>
    );
};

function emptyForm(userId: string, entityLabel?: string): FormState {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return {
        title: entityLabel ? `Follow up with ${entityLabel}` : 'Follow up',
        channel: 'call',
        dueAt: toDatetimeLocal(next.getTime()),
        assignedTo: userId,
        notes: '',
    };
}
