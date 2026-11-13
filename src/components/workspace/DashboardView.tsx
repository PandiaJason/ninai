import React from 'react';
import type { WorkspaceNav } from '../../types/workspace';
import { getDashboardData } from '../../services/dashboard';
import { getAlgoAnalytics } from '../../services/analytics';
import { Avatar, Badge, Button, EmptyState, PageHeader, SectionCard } from '../ui/Misc';
import { KpiCard } from '../ui/KpiCard';
import { Icon } from '../ui/Icon';
import { Timeline, PRIORITY_COLOR, ProjectStatusBadge } from './shared';
import { formatDate, formatDateTime } from '../../services/validation';
import { useAsyncData } from './useAsyncData';

interface DashboardViewProps {
    workspaceId: string;
    userId: string;
    userName: string;
    nav: WorkspaceNav;
}

const percent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export const DashboardView: React.FC<DashboardViewProps> = ({ workspaceId, userId, userName, nav }) => {
    const { data, loading, error, reload } = useAsyncData(async () => {
        const [dashboard, analytics] = await Promise.all([
            getDashboardData(workspaceId, userId),
            getAlgoAnalytics(workspaceId),
        ]);
        return { dashboard, analytics };
    }, [workspaceId, userId]);

    if (!data) {
        return <div className="ws-module"><div className="ws-module-inner"><DataState loading={loading} error={error} onRetry={() => void reload()} /></div></div>;
    }

    const { dashboard, analytics } = data;
    const { myTasks, myFollowUps, projects, upcoming, recentNotes, activity, learnerActivity } = dashboard;
    const learners = analytics.learners;
    const institutions = analytics.institutions;
    const firstName = userName.split(/\s+/)[0] || '';
    const greetingName = firstName && firstName.toLowerCase() !== 'workspace' ? `, ${firstName}` : '';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const topSources = learners.sources.slice(0, 5);
    const maxSource = Math.max(1, ...topSources.map(source => source.total));
    const pipelineStages = institutions.stages.filter(stage => stage.stage.audience !== 'learner');
    const maxPipeline = Math.max(1, ...pipelineStages.map(stage => stage.count));

    return (
        <div className="ws-module ws-overview">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow="Overview"
                    title={`${greeting}${greetingName}`}
                    subtitle="A calm read on your learners, institution pipeline and the work that needs you next."
                />

                <div className="ws-kpi-grid">
                    <KpiCard
                        label="Learners"
                        value={learners.total}
                        hint={learners.total > 0 ? `${learners.sources.length} acquisition ${learners.sources.length === 1 ? 'source' : 'sources'}` : 'Active pipeline'}
                        icon="crm"
                        onClick={() => nav.go('crm')}
                    />
                    <KpiCard
                        label="Activated"
                        value={learners.activated}
                        hint={`${percent(learners.activated, learners.total)}% of learners`}
                        icon="target"
                        onClick={() => nav.go('crm')}
                    />
                    <KpiCard
                        label="Engaged"
                        value={learners.engaged}
                        hint={`${percent(learners.engaged, learners.total)}% of learners`}
                        icon="activity"
                        onClick={() => nav.go('analytics')}
                    />
                    <KpiCard
                        label="Feedback"
                        value={learners.feedback}
                        hint={`${learners.feedbackCount} structured ${learners.feedbackCount === 1 ? 'response' : 'responses'}`}
                        icon="message"
                        onClick={() => nav.go('analytics')}
                    />
                    <KpiCard
                        label="Genuine FDE"
                        value={learners.genuine}
                        hint={`${percent(learners.genuine, learners.total)}% high-quality fit`}
                        icon="star"
                        onClick={() => nav.go('crm')}
                    />
                </div>

                <div className="ws-overview-grid">
                    <SectionCard
                        className="ws-span-8 ws-overview-card"
                        title="Learner activity"
                        description="Most recently active learners and where activation stands."
                        action={<Button size="sm" variant="ghost" icon="arrow-right" onClick={() => nav.go('crm')}>All learners</Button>}
                    >
                        {learnerActivity.length === 0 ? (
                            <EmptyState
                                compact
                                icon="crm"
                                title="No learners yet"
                                description="Add your first learner to begin tracking activation, feedback and follow-ups."
                            />
                        ) : (
                            <div className="ws-overview-list">
                                {learnerActivity.map(lead => {
                                    const attempts = lead.challengeAttempts || 0;
                                    const feedback = lead.feedbackStatus === 'submitted' ? 'Feedback in' : lead.feedbackStatus === 'requested' ? 'Feedback requested' : 'No feedback yet';
                                    return (
                                        <button key={lead.id} type="button" className="ws-overview-row" onClick={() => nav.openLead(lead.id)}>
                                            <Avatar name={lead.name} size={30} />
                                            <span className="ws-overview-row-main">
                                                <span className="ws-overview-row-title">{lead.name}</span>
                                                <span className="ws-overview-row-sub">{lead.company || lead.email || 'Independent'} · {feedback}</span>
                                            </span>
                                            <span className="ws-overview-row-meta">
                                                {lead.stage && <Badge tone="neutral" dot color={lead.stage.color}>{lead.stage.name}</Badge>}
                                                <span className="ws-overview-attempts">{attempts} attempt{attempts === 1 ? '' : 's'}</span>
                                                <span className="ws-overview-date">{lead.lastActiveAt ? formatDate(lead.lastActiveAt) : formatDate(lead.updatedAt)}</span>
                                            </span>
                                            <Icon name="chevron-right" size={14} />
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard
                        className="ws-span-4 ws-overview-card"
                        title="Acquisition sources"
                        description="Where active learners first heard about ALGO."
                        action={<Button size="sm" variant="ghost" onClick={() => nav.go('analytics')}>Insights</Button>}
                    >
                        {topSources.length === 0 ? (
                            <EmptyState compact icon="tag" title="No sources recorded" description="Add a source to each learner to see what is working." />
                        ) : (
                            <div className="ws-source-list">
                                {topSources.map(source => (
                                    <div key={source.source} className="ws-source-row">
                                        <div className="ws-source-row-top">
                                            <span>{source.label}</span>
                                            <strong>{source.total}</strong>
                                        </div>
                                        <div className="ws-source-track"><span style={{ width: `${Math.max(4, (source.total / maxSource) * 100)}%` }} /></div>
                                        <div className="ws-source-caption">{source.activated} activated · {source.feedback} feedback</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard
                        className="ws-span-7 ws-overview-card"
                        title="Institution pipeline"
                        description="Discovery through to signed partnership."
                        action={<Button size="sm" variant="ghost" icon="arrow-right" onClick={() => nav.go('institutions')}>Open pipeline</Button>}
                    >
                        {institutions.total === 0 ? (
                            <EmptyState compact icon="building" title="No institutions yet" description="Add a college or training partner to start a discovery conversation." />
                        ) : (
                            <div className="ws-pipeline-summary">
                                {pipelineStages.map(stage => (
                                    <div key={stage.stage.id} className="ws-pipeline-summary-row">
                                        <span className="ws-pipeline-summary-dot" style={{ background: stage.stage.color }} />
                                        <span className="ws-pipeline-summary-name">{stage.stage.name}</span>
                                        <span className="ws-pipeline-summary-track"><span style={{ width: stage.count > 0 ? `${Math.max(4, (stage.count / maxPipeline) * 100)}%` : 0, background: stage.stage.color }} /></span>
                                        <strong>{stage.count}</strong>
                                    </div>
                                ))}
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard
                        className="ws-span-5 ws-overview-card"
                        title="Your next actions"
                        description="Follow-ups and tasks assigned to you."
                    >
                        <div className="ws-next-grid">
                            <div className="ws-next-block">
                                <div className="ws-next-head">
                                    <span>Follow-ups</span>
                                    <button type="button" onClick={() => nav.go('followups')}>View all</button>
                                </div>
                                {myFollowUps.length === 0 ? (
                                    <div className="ws-overview-empty"><Icon name="followups" size={14} /><span>No follow-ups assigned. Schedule the next touch from any record.</span></div>
                                ) : (
                                    <div className="ws-next-list">
                                        {myFollowUps.slice(0, 4).map(item => (
                                            <button key={item.id} type="button" className="ws-next-row" onClick={() => nav.go('followups')}>
                                                <span className="ws-next-main">
                                                    <span className="ws-next-title">{item.title}</span>
                                                    <span className="ws-next-sub">{item.entityTitle} · {formatDateTime(item.dueAt)}</span>
                                                </span>
                                                {item.overdue && <Badge tone="red">Overdue</Badge>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="ws-next-block">
                                <div className="ws-next-head">
                                    <span>Tasks</span>
                                    <button type="button" onClick={() => nav.go('tasks')}>View all</button>
                                </div>
                                {myTasks.length === 0 ? (
                                    <div className="ws-overview-empty"><Icon name="circle-check" size={14} /><span>You are all clear. No open tasks are assigned to you.</span></div>
                                ) : (
                                    <div className="ws-next-list">
                                        {myTasks.slice(0, 4).map(task => (
                                            <button key={task.id} type="button" className="ws-next-row" onClick={() => nav.openTask(task.id)}>
                                                <span className="ws-priority-dot" style={{ background: PRIORITY_COLOR[task.priority], marginTop: 6 }} />
                                                <span className="ws-next-main">
                                                    <span className="ws-next-title">{task.title}</span>
                                                    <span className="ws-next-sub">{task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}</span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard
                        className="ws-span-6 ws-overview-card"
                        title="Upcoming"
                        description="The next seven days."
                        action={<Button size="sm" variant="ghost" icon="calendar" onClick={() => nav.go('calendar')}>Calendar</Button>}
                    >
                        {upcoming.length === 0 ? (
                            <div className="ws-overview-empty"><Icon name="calendar" size={14} /><span>Nothing scheduled. Follow-ups, deadlines and meetings will appear here.</span></div>
                        ) : (
                            <div className="ws-schedule-list">
                                {upcoming.slice(0, 5).map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className="ws-schedule-row"
                                        onClick={() => {
                                            if (item.entityType === 'lead' && item.entityId) nav.openLead(item.entityId);
                                            else if (item.entityType === 'task' && item.entityId) nav.openTask(item.entityId);
                                            else nav.go('calendar');
                                        }}
                                    >
                                        <span className="ws-schedule-date">
                                            <span>{new Date(item.startAt).toLocaleDateString('en-US', { month: 'short' })}</span>
                                            <strong>{new Date(item.startAt).getDate()}</strong>
                                        </span>
                                        <span className="ws-schedule-main">
                                            <span className="ws-next-title">{item.title}</span>
                                            <span className="ws-next-sub">{item.allDay ? 'All day' : new Date(item.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{item.subtitle ? ` · ${item.subtitle}` : ''}</span>
                                        </span>
                                        <span className="ws-priority-dot" style={{ background: item.color }} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard
                        className="ws-span-6 ws-overview-card"
                        title="Projects"
                        description="Active work coming back to life."
                        action={<Button size="sm" variant="ghost" icon="arrow-right" onClick={() => nav.go('projects')}>All projects</Button>}
                    >
                        {projects.length === 0 ? (
                            <div className="ws-overview-empty"><Icon name="projects" size={14} /><span>No active projects. Create a project to give the work a home and a next milestone.</span></div>
                        ) : (
                            <div className="ws-project-list">
                                {projects.map(project => (
                                    <button key={project.id} type="button" className="ws-project-row" onClick={() => nav.openProject(project.id)}>
                                        <span className="ws-overview-icon"><Icon name="projects" size={14} /></span>
                                        <span className="ws-next-main">
                                            <span className="ws-next-title">{project.name}</span>
                                            <span className="ws-next-sub">{project.identifier} · {project.ownerName}</span>
                                        </span>
                                        <ProjectStatusBadge status={project.status} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard
                        className="ws-span-6 ws-overview-card"
                        title="Recent activity"
                        description="Changes across the workspace."
                    >
                        <Timeline
                            empty="No activity recorded yet."
                            entries={activity.slice(0, 6).map(item => ({
                                id: item.id,
                                title: item.title,
                                meta: `${item.userName} · ${formatDateTime(item.createdAt)}`,
                                icon: item.action.startsWith('created') ? 'plus-circle' : item.action.includes('status') ? 'refresh' : 'activity',
                            }))}
                        />
                    </SectionCard>

                    <SectionCard
                        className="ws-span-6 ws-overview-card"
                        title="Recent notes"
                        description="Your latest knowledge capture."
                        action={<Button size="sm" variant="ghost" icon="arrow-right" onClick={() => nav.go('notes')}>Notes</Button>}
                    >
                        {recentNotes.length === 0 ? (
                            <div className="ws-overview-empty"><Icon name="notes" size={14} /><span>No notes yet. Capture context for a learner, project or decision.</span></div>
                        ) : (
                            <div className="ws-note-list">
                                {recentNotes.map(note => (
                                    <button key={note.id} type="button" className="ws-note-row" onClick={() => nav.openNote(note.id)}>
                                        <span className="ws-overview-icon"><Icon name="notes" size={14} /></span>
                                        <span className="ws-next-main">
                                            <span className="ws-next-title">{note.title || 'Untitled note'}</span>
                                            <span className="ws-next-sub">{formatDate(note.updatedAt)}</span>
                                        </span>
                                        {note.loved ? <Icon name="heart" size={13} /> : null}
                                    </button>
                                ))}
                            </div>
                        )}
                    </SectionCard>
                </div>
            </div>
        </div>
    );
};

const DataState: React.FC<{ loading: boolean; error: string | null; onRetry: () => void }> = ({ loading, error, onRetry }) => (
    <div className="ws-loading">
        {loading ? <><span className="ws-spinner" /><span>Loading overview…</span></> : <div className="ws-inline-error"><Icon name="alert" size={16} /><span>{error || 'Unable to load overview.'}</span><button onClick={onRetry}>Retry</button></div>}
    </div>
);
