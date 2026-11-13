import React, { useMemo, useState } from 'react';
import type { Lead, Task } from '../../db';
import {
    addProjectMilestone,
    archiveProject,
    deleteProject,
    deleteProjectMilestone,
    getProjectDetail,
    linkLeadToProject,
    toggleProjectMilestone,
    unlinkLeadFromProject,
} from '../../services/projects';
import { listEntityActivities } from '../../services/activity';
import { listLeads } from '../../services/leads';
import { formatDate, formatDateTime, isOverdue } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import type { WorkspaceNav } from '../../types/workspace';
import { useAuth } from '../../context/AuthContext';
import {
    Avatar,
    Badge,
    Button,
    ConfirmDialog,
    EmptyState,
    IconButton,
    PageHeader,
    ProgressBar,
    SectionCard,
    Spinner,
} from '../ui/Misc';
import { Icon } from '../ui/Icon';
import { Field, Select, TextInput } from '../ui/Form';
import { useToast } from '../ui/Toast';
import {
    DataState,
    MetaItem,
    PriorityBadge,
    ProjectStatusBadge,
    TaskStatusBadge,
    Timeline,
} from './shared';
import { useAsyncData } from './useAsyncData';
import { EntityFollowUps } from './EntityFollowUps';
import { EntityNotes } from './EntityNotes';
import { ProjectForm } from './ProjectForm';
import { TaskForm } from './TaskForm';

interface ProjectDetailProps {
    workspaceId: string;
    projectId: string;
    nav: WorkspaceNav;
    onBack: () => void;
    onChanged?: () => void;
    onDeleted?: () => void;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({
    workspaceId,
    projectId,
    nav,
    onBack,
    onChanged,
    onDeleted,
}) => {
    const { user, members } = useAuth();
    const toast = useToast();
    const [editOpen, setEditOpen] = useState(false);
    const [taskOpen, setTaskOpen] = useState(false);
    const [confirmArchive, setConfirmArchive] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [busy, setBusy] = useState(false);
    const [milestoneTitle, setMilestoneTitle] = useState('');
    const [milestoneDate, setMilestoneDate] = useState('');
    const [leadToLink, setLeadToLink] = useState('');

    const { data, loading, error, reload } = useAsyncData(async () => {
        const [detail, allLeads, activity] = await Promise.all([
            getProjectDetail(projectId),
            listLeads(workspaceId),
            listEntityActivities(workspaceId, 'project', projectId, 40),
        ]);
        return { detail, allLeads, activity };
    }, [workspaceId, projectId]);

    const detail = data?.detail;
    const allLeads = data?.allLeads || [];
    const activity = data?.activity || [];

    const pendingMilestones = useMemo(
        () => (detail?.milestones || []).filter(milestone => milestone.completed === 0),
        [detail],
    );
    const linkedLeadIds = useMemo(
        () => new Set((detail?.leads || []).map(lead => lead.id)),
        [detail],
    );
    const availableLeads = allLeads.filter(lead => !linkedLeadIds.has(lead.id));

    const refresh = async () => {
        await reload();
        onChanged?.();
    };

    const addMilestone = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        try {
            await addProjectMilestone(projectId, { title: milestoneTitle, dueDate: milestoneDate });
            setMilestoneTitle('');
            setMilestoneDate('');
            toast.success('Milestone added.');
            await refresh();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const toggleMilestone = async (milestoneId: string) => {
        try {
            await toggleProjectMilestone(milestoneId);
            await refresh();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const removeMilestone = async (milestoneId: string) => {
        try {
            await deleteProjectMilestone(milestoneId);
            toast.success('Milestone removed.');
            await refresh();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const linkLead = async () => {
        if (!leadToLink) return;
        setBusy(true);
        try {
            await linkLeadToProject(projectId, leadToLink);
            setLeadToLink('');
            toast.success('Lead linked to project.');
            await refresh();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const unlinkLead = async (leadId: string) => {
        try {
            await unlinkLeadFromProject(projectId, leadId);
            toast.success('Lead unlinked.');
            await refresh();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const archive = async () => {
        if (!detail) return;
        setBusy(true);
        try {
            await archiveProject(detail.project.id, detail.project.archived !== 1);
            toast.success(detail.project.archived ? 'Project restored.' : 'Project archived.');
            setConfirmArchive(false);
            await refresh();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!detail) return;
        setBusy(true);
        try {
            await deleteProject(detail.project.id);
            toast.success('Project deleted.');
            setConfirmDelete(false);
            onDeleted?.();
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    if (loading && !detail) {
        return <div className="ws-module"><div className="ws-module-inner"><Spinner label="Opening project…" /></div></div>;
    }

    if (error || !detail) {
        return (
            <div className="ws-module">
                <div className="ws-module-inner">
                    <DataState loading={false} error={error || 'Project not found.'} onRetry={() => void reload()} />
                    <Button icon="arrow-left" onClick={onBack}>Back to projects</Button>
                </div>
            </div>
        );
    }

    const { project, ownerName, ownerColor, leads, tasks, milestones } = detail;
    const memberIds = detail.memberIds;
    const canManage = !!user && (user.role === 'admin' || user.id === project.ownerId || user.id === project.createdBy);
    const canDelete = !!user && (user.role === 'admin' || user.id === project.createdBy);

    return (
        <div className="ws-module">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow={`${project.identifier} · Project`}
                    title={project.name}
                    subtitle={project.description || 'No description yet. Add one to give the team context.'}
                    actions={(
                        <>
                            <Button icon="arrow-left" onClick={onBack}>All projects</Button>
                            <Button icon="edit" disabled={!canManage} onClick={() => setEditOpen(true)}>Edit</Button>
                            <Button icon="archive" disabled={!canManage} onClick={() => setConfirmArchive(true)}>
                                {project.archived ? 'Restore' : 'Archive'}
                            </Button>
                            <Button variant="danger" icon="trash" disabled={!canDelete} onClick={() => setConfirmDelete(true)}>Delete</Button>
                        </>
                    )}
                />

                <div className="ws-grid ws-grid-3" style={{ marginBottom: 18 }}>
                    <div className="ws-card ws-card-padded">
                        <div className="ws-card-header" style={{ marginBottom: 10 }}>
                            <div>
                                <h2>Progress</h2>
                                <p>{tasks.filter(task => task.status === 'completed').length} of {tasks.length} tasks · {milestones.filter(milestone => milestone.completed === 1).length} of {milestones.length} milestones</p>
                            </div>
                            <ProjectStatusBadge status={project.status} />
                        </div>
                        <ProgressBar value={projectProgress(tasks, milestones)} label={`${projectProgress(tasks, milestones)}%`} />
                        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <PriorityBadge priority={project.priority} />
                            {project.archived === 1 && <Badge tone="neutral">Archived</Badge>}
                            <span className="ws-small ws-muted">{project.objectives.length} objectives</span>
                        </div>
                    </div>
                    <div className="ws-card ws-card-padded">
                        <div className="ws-card-header" style={{ marginBottom: 10 }}>
                            <div><h2>Team</h2><p>Owner and project members</p></div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                            <Avatar name={ownerName} color={ownerColor} size={30} />
                            <div>
                                <div style={{ fontSize: 12.5, fontWeight: 650 }}>{ownerName}</div>
                                <div className="ws-small ws-muted">Project owner</div>
                            </div>
                        </div>
                        <div className="ws-small ws-muted">
                            {memberIds.length} member{memberIds.length === 1 ? '' : 's'} · {members.filter(member => memberIds.includes(member.id)).map(member => member.name).join(', ') || 'No members'}
                        </div>
                    </div>
                    <div className="ws-card ws-card-padded">
                        <div className="ws-card-header" style={{ marginBottom: 10 }}>
                            <div><h2>Dates</h2><p>Plan and delivery window</p></div>
                        </div>
                        <div className="ws-meta-grid">
                            <MetaItem label="Start" value={project.startDate ? formatDate(project.startDate) : 'Not set'} />
                            <MetaItem label="Target" value={project.endDate ? formatDate(project.endDate) : 'Not set'} />
                            <MetaItem label="Leads" value={`${leads.length} linked`} />
                            <MetaItem label="Next milestone" value={pendingMilestones[0] ? formatDate(pendingMilestones[0].dueDate) : 'None'} />
                        </div>
                    </div>
                </div>

                <div className="ws-detail-layout">
                    <div className="ws-detail-main">
                        {project.objectives.length > 0 && (
                            <SectionCard title="Objectives" description="What this project needs to achieve.">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {project.objectives.map((objective, index) => (
                                        <div key={`${objective}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                                            <span className="ws-search-result-icon" style={{ width: 22, height: 22, flex: '0 0 auto' }}><Icon name="target" size={12} /></span>
                                            <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{objective}</span>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        <SectionCard
                            title="Milestones"
                            description={milestones.length ? `${milestones.filter(milestone => milestone.completed === 1).length} of ${milestones.length} complete` : 'Give the project a visible finish line.'}
                        >
                            <form onSubmit={addMilestone} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
                                <Field label="New milestone" htmlFor="milestone-title" className="ws-grow">
                                    <TextInput id="milestone-title" value={milestoneTitle} onChange={e => setMilestoneTitle(e.target.value)} placeholder="e.g. Pilot handover" />
                                </Field>
                                <Field label="Due" htmlFor="milestone-date">
                                    <TextInput id="milestone-date" type="date" value={milestoneDate} onChange={e => setMilestoneDate(e.target.value)} />
                                </Field>
                                <Button type="submit" variant="primary" icon="plus" loading={busy}>Add</Button>
                            </form>
                            {milestones.length === 0 ? (
                                <EmptyState compact icon="flag" title="No milestones yet" description="Add the first date the team should aim for." />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {milestones.map(milestone => (
                                        <div key={milestone.id} className="ws-user-row">
                                            <button
                                                className="ws-icon-btn"
                                                title={milestone.completed ? 'Reopen milestone' : 'Complete milestone'}
                                                onClick={() => void toggleMilestone(milestone.id)}
                                                style={{ color: milestone.completed ? 'var(--success)' : undefined }}
                                            >
                                                <Icon name={milestone.completed ? 'circle-check' : 'check'} size={16} />
                                            </button>
                                            <div className="ws-user-info">
                                                <div className="ws-user-name" style={{ textDecoration: milestone.completed ? 'line-through' : undefined, opacity: milestone.completed ? 0.65 : 1 }}>
                                                    {milestone.title}
                                                </div>
                                                <div className={`ws-user-email ${!milestone.completed && isOverdue(milestone.dueDate) ? 'ws-task-overdue' : ''}`}>
                                                    {formatDate(milestone.dueDate)}{!milestone.completed && isOverdue(milestone.dueDate) ? ' · overdue' : ''}
                                                </div>
                                            </div>
                                            <div className="ws-user-actions">
                                                <IconButton icon="trash" label="Delete milestone" danger onClick={() => void removeMilestone(milestone.id)} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            title="Tasks"
                            description={`${tasks.filter(task => task.status === 'completed').length} of ${tasks.length} complete`}
                            action={<Button size="sm" icon="plus" onClick={() => setTaskOpen(true)}>New task</Button>}
                        >
                            {tasks.length === 0 ? (
                                <EmptyState compact icon="tasks" title="No tasks yet" description="Break the project into the next concrete actions." />
                            ) : (
                                tasks.map(task => (
                                    <TaskRow key={task.id} task={task} members={members} onOpen={() => nav.openTask(task.id)} />
                                ))
                            )}
                        </SectionCard>

                        <SectionCard
                            title="Linked leads"
                            description={leads.length ? `${leads.length} CRM record${leads.length === 1 ? '' : 's'} connected to this project` : 'Connect the commercial context.'}
                        >
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 14 }}>
                                <Field label="Link a lead" htmlFor="project-lead-link" className="ws-grow">
                                    <Select id="project-lead-link" value={leadToLink} onChange={e => setLeadToLink(e.target.value)}>
                                        <option value="">Select a lead…</option>
                                        {availableLeads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}{lead.company ? ` · ${lead.company}` : ''}</option>)}
                                    </Select>
                                </Field>
                                <Button icon="link" onClick={() => void linkLead()} loading={busy} disabled={!leadToLink}>Link</Button>
                            </div>
                            {leads.length === 0 ? (
                                <EmptyState compact icon="crm" title="No leads linked" description="Link a lead to keep sales and delivery connected." />
                            ) : (
                                leads.map(lead => (
                                    <LeadRow
                                        key={lead.id}
                                        lead={lead}
                                        onOpen={() => nav.openLead(lead.id)}
                                        onUnlink={() => void unlinkLead(lead.id)}
                                    />
                                ))
                            )}
                        </SectionCard>

                        <EntityFollowUps
                            workspaceId={workspaceId}
                            entityType="project"
                            entityId={project.id}
                            entityLabel={project.name}
                            onChanged={() => void refresh()}
                        />

                        <EntityNotes
                            workspaceId={workspaceId}
                            entityType="project"
                            entityId={project.id}
                            nav={nav}
                            title="Project notes"
                        />
                    </div>

                    <aside className="ws-detail-side">
                        <SectionCard title="Activity" description="Latest project changes">
                            <Timeline
                                entries={activity.map(item => ({
                                    id: item.id,
                                    title: item.title,
                                    meta: `${item.userName} · ${formatDateTime(item.createdAt)}`,
                                    icon: 'activity',
                                }))}
                                empty="No activity yet."
                            />
                        </SectionCard>
                        <SectionCard title="Details" description="Record metadata">
                            <div className="ws-meta-grid">
                                <MetaItem label="Identifier" value={project.identifier} />
                                <MetaItem label="Status" value={<ProjectStatusBadge status={project.status} />} />
                                <MetaItem label="Priority" value={<PriorityBadge priority={project.priority} />} />
                                <MetaItem label="Created" value={formatDate(project.createdAt)} />
                                <MetaItem label="Updated" value={formatDateTime(project.updatedAt)} />
                            </div>
                        </SectionCard>
                    </aside>
                </div>
            </div>

            <ProjectForm
                open={editOpen}
                workspaceId={workspaceId}
                currentUserId={user?.id || project.ownerId}
                members={members}
                project={project}
                onClose={() => setEditOpen(false)}
                onSaved={() => void refresh()}
            />

            <TaskForm
                open={taskOpen}
                workspaceId={workspaceId}
                currentUserId={user?.id || project.ownerId}
                members={members}
                initialProjectId={project.id}
                onClose={() => setTaskOpen(false)}
                onSaved={() => void refresh()}
            />

            <ConfirmDialog
                open={confirmArchive}
                title={project.archived ? 'Restore project?' : 'Archive project?'}
                message={project.archived
                    ? 'The project will return to the active list. Nothing is deleted.'
                    : 'The project will leave the active list. Tasks, notes and links are kept.'}
                confirmLabel={project.archived ? 'Restore' : 'Archive'}
                onConfirm={() => void archive()}
                onCancel={() => setConfirmArchive(false)}
                busy={busy}
            />

            <ConfirmDialog
                open={confirmDelete}
                title="Delete project?"
                message="This permanently removes the project, its milestones and project links. Tasks stay in Tasks but are unlinked. This cannot be undone."
                confirmLabel="Delete project"
                danger
                onConfirm={() => void remove()}
                onCancel={() => setConfirmDelete(false)}
                busy={busy}
            />
        </div>
    );
};

const TaskRow: React.FC<{ task: Task; members: { id: string; name: string; avatarColor?: string }[]; onOpen: () => void }> = ({ task, members, onOpen }) => {
    const assignee = task.assigneeId ? members.find(member => member.id === task.assigneeId) : undefined;
    return (
        <div className="ws-user-row">
            <button className="ws-user-info" style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={onOpen}>
                <div className="ws-user-name">{task.title}</div>
                <div className="ws-user-email">
                    {task.dueDate ? formatDate(task.dueDate) : 'No due date'}{task.dueDate && isOverdue(task.dueDate) && task.status !== 'completed' ? ' · overdue' : ''}
                </div>
            </button>
            <TaskStatusBadge status={task.status} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 110 }}>
                <Avatar name={assignee?.name || 'Unassigned'} color={assignee?.avatarColor} size={20} />
                <span className="ws-small">{assignee?.name || 'Unassigned'}</span>
            </div>
            <IconButton icon="arrow-right" label="Open task" onClick={onOpen} />
        </div>
    );
};

const LeadRow: React.FC<{ lead: Lead; onOpen: () => void; onUnlink: () => void }> = ({ lead, onOpen, onUnlink }) => (
    <div className="ws-user-row">
        <span className="ws-search-result-icon" style={{ width: 30, height: 30 }}><Icon name="crm" size={14} /></span>
        <button className="ws-user-info" style={{ border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={onOpen}>
            <div className="ws-user-name">{lead.name}</div>
            <div className="ws-user-email">{lead.company || lead.email || 'Lead'}</div>
        </button>
        <IconButton icon="external" label="Open lead" onClick={onOpen} />
        <IconButton icon="x" label="Unlink lead" onClick={onUnlink} />
    </div>
);

function projectProgress(tasks: Task[], milestones: { completed: number }[]): number {
    const total = tasks.length + milestones.length;
    if (!total) return 0;
    const done = tasks.filter(task => task.status === 'completed').length + milestones.filter(milestone => milestone.completed === 1).length;
    return Math.round((done / total) * 100);
}
