import React, { useState } from 'react';
import type { LeadActivityType } from '../../db';
import { archiveLead, addLeadActivity, deleteLead, getLead, listLeadActivities, listLeadStages, moveLeadStage, setLeadNextFollowUp } from '../../services/leads';
import { getTagsForEntity, getTagSuggestions } from '../../services/tags';
import { listProjectsForLead } from '../../services/projects';
import { formatDate, formatDateTime, fromDatetimeLocal, toDatetimeLocal } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import type { WorkspaceNav } from '../../types/workspace';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, IconButton, SectionCard } from '../ui/Misc';
import { Icon } from '../ui/Icon';
import { Field, Select, TextArea, TextInput } from '../ui/Form';
import { useToast } from '../ui/Toast';
import { MetaItem, PriorityBadge, Timeline, formatMoney } from './shared';
import { useAsyncData } from './useAsyncData';
import { LeadForm } from './LeadForm';
import { EntityNotes } from './EntityNotes';
import { EntityFollowUps } from './EntityFollowUps';

interface LeadDetailProps {
    workspaceId: string;
    leadId: string;
    nav: WorkspaceNav;
    onBack: () => void;
}

const ACTIVITY_TYPES: { id: LeadActivityType; label: string; icon: 'phone' | 'mail' | 'calendar' | 'message' | 'clock' | 'notes' | 'refresh' }[] = [
    { id: 'call', label: 'Call', icon: 'phone' },
    { id: 'email', label: 'Email', icon: 'mail' },
    { id: 'meeting', label: 'Meeting', icon: 'calendar' },
    { id: 'message', label: 'Message', icon: 'message' },
    { id: 'follow_up', label: 'Follow-up', icon: 'clock' },
    { id: 'note', label: 'Note', icon: 'notes' },
];

export const LeadDetail: React.FC<LeadDetailProps> = ({ workspaceId, leadId, nav, onBack }) => {
    const { user, members } = useAuth();
    const toast = useToast();
    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmArchive, setConfirmArchive] = useState(false);
    const [busy, setBusy] = useState(false);
    const [activityType, setActivityType] = useState<LeadActivityType>('call');
    const [activitySubject, setActivitySubject] = useState('');
    const [activityBody, setActivityBody] = useState('');
    const [activityAt, setActivityAt] = useState(() => toDatetimeLocal(Date.now()));
    const [followUp, setFollowUp] = useState('');

    const { data, loading, error, reload } = useAsyncData(async () => {
        const [lead, activities, tags, stages, tagSuggestions, projects] = await Promise.all([
            getLead(leadId),
            listLeadActivities(leadId),
            getTagsForEntity('lead', leadId),
            listLeadStages(workspaceId),
            getTagSuggestions(workspaceId),
            listProjectsForLead(leadId).catch(() => []),
        ]);
        return { lead, activities, tags, stages, tagSuggestions, projects };
    }, [workspaceId, leadId]);

    const lead = data?.lead;
    const stage = data?.stages.find(item => item.id === lead?.stageId);
    const owner = members.find(member => member.id === lead?.ownerId);

    if (!lead) {
        return (
            <div className="ws-module">
                <div className="ws-module-inner">
                    <PageLoading loading={loading} error={error} onRetry={() => void reload()} onBack={onBack} />
                </div>
            </div>
        );
    }

    const saveFollowUp = async () => {
        try {
            await setLeadNextFollowUp(lead.id, followUp ? fromDatetimeLocal(followUp) : null);
            toast.success(followUp ? 'Follow-up scheduled.' : 'Follow-up cleared.');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const logActivity = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!activitySubject.trim()) return;
        setBusy(true);
        try {
            await addLeadActivity(lead.id, {
                type: activityType,
                subject: activitySubject,
                body: activityBody,
                occurredAt: activityAt ? fromDatetimeLocal(activityAt) : Date.now(),
            });
            toast.success('Activity logged.');
            setActivitySubject('');
            setActivityBody('');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const changeStage = async (stageId: string) => {
        try {
            await moveLeadStage(lead.id, stageId);
            toast.success('Lead moved.');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const remove = async () => {
        setBusy(true);
        try {
            await deleteLead(lead.id);
            toast.success('Lead deleted.');
            setConfirmDelete(false);
            onBack();
        } catch (e) {
            toast.error(toErrorMessage(e));
            setBusy(false);
        }
    };

    const archive = async () => {
        setBusy(true);
        try {
            await archiveLead(lead.id, lead.archived !== 1);
            toast.success(lead.archived ? 'Lead restored.' : 'Lead archived.');
            setConfirmArchive(false);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="ws-module">
            <div className="ws-module-inner">
                <header className="ws-detail-head">
                    <div className="ws-detail-title">
                        <IconButton icon="arrow-left" label="Back to leads" onClick={onBack} />
                        <Avatar name={lead.name} size={46} color={owner?.avatarColor} />
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <h1>{lead.name}</h1>
                                {lead.archived === 1 && <Badge tone="neutral">Archived</Badge>}
                            </div>
                            <p>{lead.company || 'Independent'}{lead.jobTitle ? ` · ${lead.jobTitle}` : ''}</p>
                        </div>
                    </div>
                    <div className="ws-detail-actions">
                        <Button icon="edit" onClick={() => setEditing(true)}>Edit</Button>
                        <Button icon="archive" onClick={() => setConfirmArchive(true)}>{lead.archived ? 'Restore' : 'Archive'}</Button>
                        {user?.role === 'admin' && <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>Delete</Button>}
                    </div>
                </header>

                <div className="ws-detail-grid">
                    <div className="ws-detail-main">
                        <SectionCard>
                            <div className="ws-meta-grid" style={{ marginBottom: 16 }}>
                                <MetaItem label="Deal value" value={formatMoney(lead.value)} hint="Potential value" />
                                <MetaItem label="Stage" value={stage ? stage.name : '—'} hint={lead.priority.toUpperCase()} />
                                <MetaItem label="Last contacted" value={lead.lastContactedAt ? formatDate(lead.lastContactedAt) : '—'} />
                                <MetaItem label="Next follow-up" value={lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : '—'} />
                            </div>
                            <div className="ws-subheading">Description</div>
                            {lead.description ? <p className="ws-task-description">{lead.description}</p> : <p className="ws-muted">No description yet.</p>}
                            {data.tags.length > 0 && (
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 14 }}>
                                    {data.tags.map(tag => <Badge key={tag.id} tone="blue">#{tag.name}</Badge>)}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard title="Log activity" description="Calls, emails, meetings and follow-ups are added to the timeline.">
                            <form onSubmit={logActivity}>
                                <div className="ws-form-grid">
                                    <Field label="Type" htmlFor="activity-type">
                                        <Select id="activity-type" value={activityType} onChange={e => setActivityType(e.target.value as LeadActivityType)}>
                                            {ACTIVITY_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                                        </Select>
                                    </Field>
                                    <Field label="When" htmlFor="activity-at">
                                        <TextInput id="activity-at" type="datetime-local" value={activityAt} onChange={e => setActivityAt(e.target.value)} />
                                    </Field>
                                    <Field label="Subject" htmlFor="activity-subject" required className="span-2">
                                        <TextInput id="activity-subject" value={activitySubject} onChange={e => setActivitySubject(e.target.value)} placeholder="e.g. Discovery call — budget and timeline" />
                                    </Field>
                                    <Field label="Notes" htmlFor="activity-body" className="span-2">
                                        <TextArea id="activity-body" value={activityBody} onChange={e => setActivityBody(e.target.value)} placeholder="What happened? What's next?" />
                                    </Field>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                                    <Button type="submit" variant="primary" icon="plus" loading={busy} disabled={!activitySubject.trim()}>Log activity</Button>
                                </div>
                            </form>
                        </SectionCard>

                        <SectionCard title="Activity timeline" description={`${data.activities.length} recorded interaction${data.activities.length === 1 ? '' : 's'}`}>
                            <Timeline
                                empty="No activity logged for this lead yet."
                                entries={activityEntries(data.activities, members)}
                            />
                        </SectionCard>

                        <SectionCard
                            title="Projects"
                            description={data.projects.length ? `${data.projects.length} delivery project${data.projects.length === 1 ? '' : 's'} linked to this lead` : 'Connect this opportunity to delivery work.'}
                        >
                            {data.projects.length === 0 ? (
                                <EmptyState compact icon="projects" title="No projects linked" description="Open a project and link this lead from the project page." />
                            ) : (
                                data.projects.map(project => (
                                    <div key={project.id} className="ws-user-row">
                                        <span className="ws-search-result-icon" style={{ width: 30, height: 30 }}><Icon name="projects" size={14} /></span>
                                        <button className="ws-user-info" style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={() => nav.openProject(project.id)}>
                                            <div className="ws-user-name">{project.name}</div>
                                            <div className="ws-user-email">{project.identifier} · {project.status.replace(/_/g, ' ')}</div>
                                        </button>
                                        <IconButton icon="arrow-right" label="Open project" onClick={() => nav.openProject(project.id)} />
                                    </div>
                                ))
                            )}
                        </SectionCard>

                        <EntityFollowUps
                            workspaceId={lead.workspaceId}
                            entityType="lead"
                            entityId={lead.id}
                            entityLabel={lead.name}
                            onChanged={() => void reload()}
                        />

                        <EntityNotes workspaceId={lead.workspaceId} entityType="lead" entityId={lead.id} nav={nav} />
                    </div>

                    <aside className="ws-detail-side">
                        <SectionCard title="Pipeline">
                            <Field label="Current stage" htmlFor="lead-stage-change">
                                <Select id="lead-stage-change" value={lead.stageId} onChange={e => void changeStage(e.target.value)}>
                                    {data.stages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                                </Select>
                            </Field>
                            <div style={{ marginTop: 12 }}>
                                <div className="ws-subheading">Priority</div>
                                <PriorityBadge priority={lead.priority} />
                            </div>
                        </SectionCard>

                        <SectionCard title="Follow-up">
                            <Field label="Next follow-up" htmlFor="lead-followup-side">
                                <TextInput id="lead-followup-side" type="datetime-local" value={followUp || (lead.nextFollowUpAt ? toDatetimeLocal(lead.nextFollowUpAt) : '')} onChange={e => setFollowUp(e.target.value)} />
                            </Field>
                            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                <Button size="sm" icon="check" onClick={() => void saveFollowUp()}>Save</Button>
                                {lead.nextFollowUpAt && <Button size="sm" variant="ghost" onClick={() => { setFollowUp(''); void setLeadNextFollowUp(lead.id, null).then(() => reload()); }}>Clear</Button>}
                            </div>
                        </SectionCard>

                        <SectionCard title="Contact">
                            <div className="ws-info-list">
                                <div className="ws-info-row"><Icon name="mail" size={14} /><span className="ws-info-label">Email</span><span className="ws-info-value">{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <span className="ws-info-empty">—</span>}</span></div>
                                <div className="ws-info-row"><Icon name="phone" size={14} /><span className="ws-info-label">Phone</span><span className="ws-info-value">{lead.phone || <span className="ws-info-empty">—</span>}</span></div>
                                <div className="ws-info-row"><Icon name="globe" size={14} /><span className="ws-info-label">Website</span><span className="ws-info-value">{lead.website ? <a href={lead.website} target="_blank" rel="noreferrer">{lead.website.replace(/^https?:\/\//, '')}</a> : <span className="ws-info-empty">—</span>}</span></div>
                                <div className="ws-info-row"><Icon name="map-pin" size={14} /><span className="ws-info-label">Location</span><span className="ws-info-value">{lead.location || <span className="ws-info-empty">—</span>}</span></div>
                                <div className="ws-info-row"><Icon name="briefcase" size={14} /><span className="ws-info-label">Industry</span><span className="ws-info-value">{lead.industry || <span className="ws-info-empty">—</span>}</span></div>
                                <div className="ws-info-row"><Icon name="tag" size={14} /><span className="ws-info-label">Source</span><span className="ws-info-value">{lead.source || <span className="ws-info-empty">—</span>}</span></div>
                                <div className="ws-info-row"><Icon name="user" size={14} /><span className="ws-info-label">Owner</span><span className="ws-info-value">{owner?.name || 'Unassigned'}</span></div>
                                <div className="ws-info-row"><Icon name="clock" size={14} /><span className="ws-info-label">Created</span><span className="ws-info-value">{formatDate(lead.createdAt)}</span></div>
                            </div>
                        </SectionCard>
                    </aside>
                </div>
            </div>

            <LeadForm
                open={editing}
                workspaceId={lead.workspaceId}
                currentUserId={user?.id || ''}
                members={members}
                stages={data.stages}
                lead={lead}
                leadTags={data.tags.map(tag => tag.name)}
                tagSuggestions={data.tagSuggestions}
                onClose={() => setEditing(false)}
                onSaved={() => void reload()}
            />

            <ConfirmDialog
                open={confirmDelete}
                title="Delete lead?"
                message={`This permanently deletes ${lead.name}, its activity history and links. This cannot be undone.`}
                confirmLabel="Delete lead"
                danger
                busy={busy}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => void remove()}
            />
            <ConfirmDialog
                open={confirmArchive}
                title={lead.archived ? 'Restore lead?' : 'Archive lead?'}
                message={lead.archived ? 'This lead will return to the active pipeline.' : 'This lead will be hidden from the pipeline until restored.'}
                confirmLabel={lead.archived ? 'Restore' : 'Archive'}
                busy={busy}
                onCancel={() => setConfirmArchive(false)}
                onConfirm={() => void archive()}
            />
        </div>
    );
};

const PageLoading: React.FC<{ loading: boolean; error: string | null; onRetry: () => void; onBack: () => void }> = ({ loading, error, onRetry, onBack }) => (
    <div>
        <Button icon="arrow-left" onClick={onBack} style={{ marginBottom: 18 }}>Back</Button>
        {loading ? <div className="ws-muted">Loading lead…</div> : <div className="ws-inline-error"><Icon name="alert" size={16} /><span>{error || 'Lead not found.'}</span><button onClick={onRetry}>Retry</button></div>}
    </div>
);

function activityEntries(activities: Awaited<ReturnType<typeof listLeadActivities>>, members: { id: string; name: string }[]) {
    return activities.map(activity => {
        const meta = ACTIVITY_TYPES.find(type => type.id === activity.type);
        const actor = members.find(member => member.id === activity.userId)?.name || 'Team';
        return {
            id: activity.id,
            title: activity.subject,
            meta: `${meta?.label || activity.type.replace(/_/g, ' ')} · ${formatDateTime(activity.occurredAt)}${activity.type === 'stage_change' ? '' : ` · ${actor}`}`,
            body: activity.body || undefined,
            icon: (meta?.icon || 'activity') as 'phone' | 'mail' | 'calendar' | 'message' | 'clock' | 'notes' | 'activity',
        };
    });
}
