import React from 'react';
import type { WorkspaceNav } from '../../types/workspace';
import { getDashboardData } from '../../services/dashboard';
import { Avatar, Badge, Button, EmptyState, PageHeader, SectionCard, StatCard } from '../ui/Misc';
import { Icon } from '../ui/Icon';
import { DataState, PriorityBadge, Timeline, formatMoney } from './shared';
import { formatDate, formatDateTime } from '../../services/validation';
import { useAsyncData } from './useAsyncData';

interface DashboardViewProps {
    workspaceId: string;
    userId: string;
    userName: string;
    nav: WorkspaceNav;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ workspaceId, userId, userName, nav }) => {
    const { data, loading, error, reload } = useAsyncData(() => getDashboardData(workspaceId, userId), [workspaceId, userId]);

    if (!data) {
        return <div className="ws-module"><div className="ws-module-inner"><DataState loading={loading} error={error} onRetry={() => void reload()} /></div></div>;
    }

    const { stats, recentLeads, myTasks, upcoming, recentNotes, activity } = data;
    const firstName = userName.split(/\s+/)[0] || userName;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="ws-module">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow="Workspace overview"
                    title={`${greeting}, ${firstName}`}
                    subtitle="Everything moving across leads and tasks — with your notes close at hand."
                    actions={(
                        <>
                            <Button icon="search" onClick={nav.openSearch}>Search</Button>
                            <Button icon="crm" onClick={() => nav.go('crm')}>Open CRM</Button>
                            <Button variant="primary" icon="tasks" onClick={() => nav.go('tasks')}>My tasks</Button>
                        </>
                    )}
                />

                <div className="ws-grid ws-grid-3" style={{ marginBottom: 18 }}>
                    <StatCard label="Active leads" value={stats.totalLeads} hint={`${stats.newLeads} new · ${stats.qualifiedLeads} qualified`} icon="crm" tone="blue" onClick={() => nav.go('crm')} />
                    <StatCard label="Open tasks" value={stats.pendingTasks} hint={`${stats.myOpenTasks} assigned to you`} icon="tasks" tone="orange" onClick={() => nav.go('tasks')} />
                    <StatCard label="Overdue tasks" value={stats.overdueTasks} hint={`${stats.upcomingDeadlines} due this week`} icon="alert" tone="red" onClick={() => nav.go('tasks')} />
                </div>

                <div className="ws-grid" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 18 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <SectionCard
                            title="Recent leads"
                            description="The newest opportunities in your pipeline."
                            action={<Button size="sm" variant="ghost" icon="arrow-right" onClick={() => nav.go('crm')}>View all</Button>}
                            padded={false}
                        >
                            {recentLeads.length === 0 ? (
                                <EmptyState compact icon="crm" title="No leads yet" description="Add your first lead to start building the pipeline." action={<Button size="sm" variant="primary" onClick={() => nav.go('crm')}>Go to CRM</Button>} />
                            ) : (
                                <div className="ws-table-wrap" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
                                    <table className="ws-table" style={{ minWidth: 0 }}>
                                        <tbody>
                                            {recentLeads.map(lead => (
                                                <tr key={lead.id} onClick={() => nav.openLead(lead.id)}>
                                                    <td style={{ width: 38 }}>
                                                        <Avatar name={lead.name} size={28} />
                                                    </td>
                                                    <td>
                                                        <div className="cell-title">{lead.name}</div>
                                                        <div className="cell-sub">{lead.company || 'Independent'}</div>
                                                    </td>
                                                    <td>{lead.stage && <Badge tone="blue" dot color={lead.stage.color}>{lead.stage.name}</Badge>}</td>
                                                    <td className="cell-right cell-mono">{formatMoney(lead.value)}</td>
                                                    <td className="cell-right"><Icon name="chevron-right" size={14} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard title="Recent activity" description="Changes across the workspace.">
                            <Timeline
                                empty="No activity recorded yet."
                                entries={activity.map(item => ({
                                    id: item.id,
                                    title: item.title,
                                    meta: `${item.userName} · ${formatDateTime(item.createdAt)}`,
                                    icon: item.action.startsWith('created') ? 'plus-circle' : item.action.includes('status') ? 'refresh' : 'activity',
                                }))}
                            />
                        </SectionCard>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <SectionCard
                            title="My tasks"
                            description="Assigned to you and still open."
                            action={<Button size="sm" variant="ghost" icon="arrow-right" onClick={() => nav.go('tasks')}>All</Button>}
                        >
                            {myTasks.length === 0 ? (
                                <EmptyState compact icon="circle-check" title="You're all clear" description="No open tasks are assigned to you." />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {myTasks.map(task => (
                                        <button
                                            key={task.id}
                                            onClick={() => nav.openTask(task.id)}
                                            style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 2px', border: 'none', background: 'none', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                                        >
                                            <span className={`ws-task-row-check ${task.status === 'completed' ? 'checked' : ''}`} style={{ marginTop: 1 }}>
                                                {task.status === 'completed' && <Icon name="check" size={11} />}
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{task.title}</span>
                                                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                    {task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}
                                                </span>
                                            </span>
                                            <PriorityBadge priority={task.priority} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            title="Upcoming"
                            description="Next seven days."
                            action={<Button size="sm" variant="ghost" icon="calendar" onClick={() => nav.go('calendar')}>Calendar</Button>}
                        >
                            {upcoming.length === 0 ? (
                                <EmptyState compact icon="calendar" title="Nothing scheduled" description="Follow-ups, deadlines and meetings will appear here." />
                            ) : (
                                <div className="ws-agenda">
                                    {upcoming.map(item => (
                                        <div
                                            key={item.id}
                                            className="ws-agenda-item"
                                            onClick={() => {
                                                if (item.entityType === 'lead' && item.entityId) nav.openLead(item.entityId);
                                                else if (item.entityType === 'task' && item.entityId) nav.openTask(item.entityId);
                                                else nav.go('calendar');
                                            }}
                                        >
                                            <span className="ws-agenda-time">{item.allDay ? 'All day' : new Date(item.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                                            <span className="ws-agenda-body">
                                                <span className="ws-agenda-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="ws-priority-dot" style={{ background: item.color }} />
                                                    {item.title}
                                                </span>
                                                <span className="ws-agenda-sub">{item.subtitle || formatDate(item.startAt)}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard
                            title="Recent notes"
                            description="Your latest knowledge capture."
                            action={<Button size="sm" variant="ghost" icon="arrow-right" onClick={() => nav.go('notes')}>Notes</Button>}
                        >
                            {recentNotes.length === 0 ? (
                                <EmptyState compact icon="notes" title="No notes yet" description="Create a note to capture context for your work." />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {recentNotes.map(note => (
                                        <button
                                            key={note.id}
                                            onClick={() => nav.openNote(note.id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 2px', border: 'none', background: 'none', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                                        >
                                            <span className="ws-search-result-icon" style={{ width: 26, height: 26 }}><Icon name="notes" size={13} /></span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.title || 'Untitled note'}</span>
                                                <span style={{ display: 'block', fontSize: 10, color: 'var(--text-tertiary)' }}>{formatDate(note.updatedAt)}</span>
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
        </div>
    );
};
