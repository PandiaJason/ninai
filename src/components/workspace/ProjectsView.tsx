import React, { useMemo, useState } from 'react';
import type { ProjectStatus } from '../../db';
import {
    archiveProject,
    listProjects,
    PROJECT_STATUSES,
    PROJECT_STATUS_LABEL,
} from '../../services/projects';
import type { ProjectWithMeta } from '../../services/projects';
import { dateKey, formatDate, isOverdue } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import type { WorkspaceNav } from '../../types/workspace';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Button, EmptyState, PageHeader, ProgressBar, SearchInput, StatCard } from '../ui/Misc';
import { Icon } from '../ui/Icon';
import { Select } from '../ui/Form';
import { useToast } from '../ui/Toast';
import { DataState, PRIORITY_COLOR, PriorityBadge, ProjectStatusBadge } from './shared';
import { useAsyncData } from './useAsyncData';
import { ProjectForm } from './ProjectForm';
import { ProjectDetail } from './ProjectDetail';

type Scope = 'active' | 'all' | 'completed' | 'archived';
type ViewMode = 'grid' | 'list';

const WEEK_AHEAD_KEY = dateKey(Date.now() + 7 * 86_400_000);

interface ProjectsViewProps {
    workspaceId: string;
    userId: string;
    selectedProjectId: string | null;
    onCloseProject: () => void;
    nav: WorkspaceNav;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
    workspaceId,
    userId,
    selectedProjectId,
    onCloseProject,
    nav,
}) => {
    const { user, members } = useAuth();
    const toast = useToast();
    const [scope, setScope] = useState<Scope>('active');
    const [view, setView] = useState<ViewMode>('grid');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
    const [formOpen, setFormOpen] = useState(false);

    const { data, loading, error, reload } = useAsyncData(
        () => listProjects(workspaceId, scope === 'archived' || scope === 'all'),
        [workspaceId, scope],
    );
    const projects = data || [];

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return projects.filter(project => {
            if (scope === 'active' && (project.status === 'completed' || project.status === 'cancelled' || project.archived)) return false;
            if (scope === 'completed' && project.status !== 'completed') return false;
            if (scope === 'archived' && !project.archived) return false;
            if (statusFilter !== 'all' && project.status !== statusFilter) return false;
            if (term && ![project.name, project.description, project.identifier, project.ownerName].some(value => (value || '').toLowerCase().includes(term))) return false;
            return true;
        });
    }, [projects, scope, statusFilter, search]);

    const active = projects.filter(project => !project.archived && project.status !== 'completed' && project.status !== 'cancelled');
    const milestoneSoon = active.filter(project => project.nextMilestone && project.nextMilestone.dueDate <= WEEK_AHEAD_KEY);
    const completed = projects.filter(project => project.status === 'completed');

    if (selectedProjectId) {
        return (
            <ProjectDetail
                workspaceId={workspaceId}
                projectId={selectedProjectId}
                nav={nav}
                onBack={onCloseProject}
                onChanged={() => void reload()}
                onDeleted={() => { onCloseProject(); void reload(); }}
            />
        );
    }

    const archive = async (project: ProjectWithMeta) => {
        try {
            await archiveProject(project.id, project.archived !== 1);
            toast.success(project.archived ? 'Project restored.' : 'Project archived.');
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    return (
        <div className="ws-module">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow="Delivery"
                    title="Projects"
                    subtitle="Bring work back to life with owners, milestones, linked leads and a visible next step."
                    actions={<Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>New project</Button>}
                />

                <div className="ws-grid ws-grid-3" style={{ marginBottom: 18 }}>
                    <StatCard label="Active projects" value={active.length} hint={`${milestoneSoon.length} milestone${milestoneSoon.length === 1 ? '' : 's'} due this week`} icon="projects" tone="blue" onClick={() => setScope('active')} />
                    <StatCard label="Completed" value={completed.length} hint="Delivered work" icon="circle-check" tone="green" onClick={() => setScope('completed')} />
                    <StatCard
                        label="Next milestone"
                        value={active.find(project => project.nextMilestone)?.nextMilestone
                            ? formatDate(active.find(project => project.nextMilestone)!.nextMilestone!.dueDate)
                            : '—'}
                        hint={active.find(project => project.nextMilestone)?.nextMilestone?.title || 'Add a milestone to a project'}
                        icon="target"
                        tone="orange"
                    />
                </div>

                <div className="ws-toolbar" style={{ marginBottom: 14 }}>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search projects, owners, identifiers…" className="ws-search-wide" />
                    <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | ProjectStatus)} aria-label="Filter by project status">
                        <option value="all">All statuses</option>
                        {PROJECT_STATUSES.map(status => <option key={status} value={status}>{PROJECT_STATUS_LABEL[status]}</option>)}
                    </Select>
                    <Select value={scope} onChange={e => setScope(e.target.value as Scope)} aria-label="Project scope">
                        <option value="active">Active</option>
                        <option value="all">All projects</option>
                        <option value="completed">Completed</option>
                        <option value="archived">Archived</option>
                    </Select>
                    <span className="ws-toolbar-spacer" />
                    <div className="ws-segmented">
                        <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} title="Grid"><Icon name="grid" size={14} /></button>
                        <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} title="List"><Icon name="list" size={14} /></button>
                    </div>
                </div>

                <DataState loading={loading} error={error} onRetry={() => void reload()} />

                {!loading && !error && filtered.length === 0 && (
                    <EmptyState
                        icon="projects"
                        title={projects.length === 0 ? 'No projects yet' : 'Nothing in this view'}
                        description={projects.length === 0 ? 'Create a project to give the work a home, a team and a next milestone.' : 'Try another scope or clear the filters.'}
                    />
                )}

                {!loading && !error && filtered.length > 0 && view === 'grid' && (
                    <div className="ws-grid ws-grid-3">
                        {filtered.map(project => (
                            <article key={project.id} className="ws-card ws-card-padded" style={{ cursor: 'pointer' }} onClick={() => nav.openProject(project.id)}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                                    <div>
                                        <div className="ws-eyebrow" style={{ marginBottom: 4 }}>{project.identifier}</div>
                                        <h2 style={{ margin: 0, fontSize: 16, letterSpacing: '-0.025em' }}>{project.name}</h2>
                                    </div>
                                    <ProjectStatusBadge status={project.status} />
                                </div>
                                <p className="ws-muted" style={{ minHeight: 36, fontSize: 11.5, lineHeight: 1.45 }}>
                                    {project.description || 'No description yet.'}
                                </p>
                                <div style={{ margin: '12px 0 10px' }}>
                                    <ProgressBar value={project.progress} label={`${project.progress}%`} />
                                </div>
                                <div className="ws-small ws-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="target" size={12} />{project.milestoneDoneCount}/{project.milestoneCount} milestones</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="tasks" size={12} />{project.taskDoneCount}/{project.taskCount} tasks</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="crm" size={12} />{project.leadCount} leads</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                                    <Avatar name={project.ownerName} color={project.ownerColor} size={22} />
                                    <span className="ws-small" style={{ flex: 1 }}>{project.ownerName}</span>
                                    <PriorityBadge priority={project.priority} />
                                </div>
                                {project.nextMilestone && (
                                    <div className="ws-small" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, color: isOverdue(project.nextMilestone.dueDate) ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                        <Icon name="flag" size={12} />
                                        {project.nextMilestone.title} · {formatDate(project.nextMilestone.dueDate)}
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                                    <Button size="sm" variant="ghost" icon="arrow-right" onClick={event => { event.stopPropagation(); nav.openProject(project.id); }}>Open</Button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                {!loading && !error && filtered.length > 0 && view === 'list' && (
                    <div className="ws-table-wrap">
                        <table className="ws-table">
                            <thead>
                                <tr>
                                    <th>Project</th>
                                    <th>Status</th>
                                    <th>Priority</th>
                                    <th>Owner</th>
                                    <th>Progress</th>
                                    <th>Next milestone</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(project => (
                                    <tr key={project.id} onClick={() => nav.openProject(project.id)}>
                                        <td>
                                            <div className="cell-title">{project.name}</div>
                                            <div className="cell-sub">{project.identifier}{project.description ? ` · ${project.description}` : ''}</div>
                                        </td>
                                        <td><ProjectStatusBadge status={project.status} /></td>
                                        <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span className="ws-priority-dot" style={{ background: PRIORITY_COLOR[project.priority] }} />{project.priority}</span></td>
                                        <td>{project.ownerName}</td>
                                        <td style={{ minWidth: 120 }}><ProgressBar value={project.progress} /></td>
                                        <td>{project.nextMilestone ? `${project.nextMilestone.title} · ${formatDate(project.nextMilestone.dueDate)}` : '—'}</td>
                                        <td onClick={event => event.stopPropagation()}>
                                            <div className="cell-actions">
                                                {(user?.role === 'admin' || user?.id === project.ownerId || user?.id === project.createdBy) && (
                                                    <Button size="sm" variant="ghost" onClick={() => void archive(project)}>{project.archived ? 'Restore' : 'Archive'}</Button>
                                                )}
                                                <Icon name="chevron-right" size={14} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <ProjectForm
                open={formOpen}
                workspaceId={workspaceId}
                currentUserId={userId}
                members={members}
                onClose={() => setFormOpen(false)}
                onSaved={project => { void reload(); nav.openProject(project.id); }}
            />
        </div>
    );
};


