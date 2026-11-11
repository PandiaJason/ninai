import React, { useMemo, useState } from 'react';
import type { Priority, TaskStatus } from '../../db';
import { getTaskCounts, listTasks, setTaskStatus, TASK_STATUSES, TASK_STATUS_LABEL } from '../../services/tasks';
import type { TaskWithMeta } from '../../services/tasks';
import { PRIORITIES, PRIORITY_LABEL, dateKey, formatDate, isOverdue } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import type { WorkspaceNav } from '../../types/workspace';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, EmptyState, PageHeader, SearchInput, Tabs } from '../ui/Misc';
import { Icon } from '../ui/Icon';
import { Select } from '../ui/Form';
import { useToast } from '../ui/Toast';
import { DataState, PRIORITY_COLOR, PriorityBadge, readStoredView } from './shared';
import { useAsyncData } from './useAsyncData';
import { TaskForm } from './TaskForm';
import { TaskDetailModal } from './TaskDetailModal';

type Scope = 'my' | 'all' | 'overdue' | 'upcoming' | 'completed';
type ViewMode = 'list' | 'kanban';
type SortKey = 'due' | 'priority' | 'updated';

interface TasksViewProps {
    workspaceId: string;
    userId: string;
    selectedTaskId: string | null;
    onCloseTask: () => void;
    nav: WorkspaceNav;
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const TasksView: React.FC<TasksViewProps> = ({ workspaceId, userId, selectedTaskId, onCloseTask, nav }) => {
    const { members } = useAuth();
    const toast = useToast();
    const [scope, setScope] = useState<Scope>('my');
    const [view, setView] = useState<ViewMode>(() => readStoredView('ninai_tasks_view', ['list', 'kanban'], 'list'));
    const [search, setSearch] = useState('');
    const [assigneeFilter, setAssigneeFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
    const [sortKey, setSortKey] = useState<SortKey>('due');
    const [formOpen, setFormOpen] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

    const { data, loading, error, reload } = useAsyncData(async () => {
        const [tasks, counts] = await Promise.all([
            listTasks(workspaceId),
            getTaskCounts(workspaceId, userId),
        ]);
        return { tasks, counts };
    }, [workspaceId, userId]);

    const tasks = data?.tasks || [];
    const counts = data?.counts;

    const changeView = (next: ViewMode) => {
        setView(next);
        localStorage.setItem('ninai_tasks_view', next);
    };

    const today = dateKey(new Date());
    const weekAhead = dateKey(new Date(Date.now() + 7 * 86_400_000));

    const scoped = useMemo(() => {
        const active = (task: TaskWithMeta) => task.status !== 'completed' && task.status !== 'cancelled';
        if (scope === 'my') return tasks.filter(task => task.assigneeId === userId && active(task));
        if (scope === 'overdue') return tasks.filter(task => active(task) && task.dueDate && task.dueDate < today);
        if (scope === 'upcoming') return tasks.filter(task => active(task) && task.dueDate && task.dueDate >= today && task.dueDate <= weekAhead);
        if (scope === 'completed') return tasks.filter(task => task.status === 'completed');
        return tasks;
    }, [tasks, scope, userId, today, weekAhead]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const list = scoped.filter(task => {
            if (term && ![task.title, task.description, task.leadName, task.assigneeName].some(value => (value || '').toLowerCase().includes(term))) return false;
            if (assigneeFilter !== 'all' && task.assigneeId !== assigneeFilter) return false;
            if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
            return true;
        });
        return [...list].sort((a, b) => {
            if (sortKey === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
            if (sortKey === 'updated') return b.updatedAt - a.updatedAt;
            return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
        });
    }, [scoped, search, assigneeFilter, priorityFilter, sortKey]);

    const changeStatus = async (taskId: string, status: TaskStatus) => {
        try {
            await setTaskStatus(taskId, status);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const toggleComplete = async (task: TaskWithMeta) => {
        await changeStatus(task.id, task.status === 'completed' ? 'todo' : 'completed');
    };

    const dropOnStatus = async (status: TaskStatus) => {
        if (!draggingId) return;
        const task = tasks.find(item => item.id === draggingId);
        setDraggingId(null);
        setDragOverStatus(null);
        if (!task || task.status === status) return;
        await changeStatus(task.id, status);
    };

    const tabs = [
        { id: 'my', label: 'My tasks', count: counts?.mine },
        { id: 'all', label: 'All', count: counts ? counts.pending : undefined },
        { id: 'overdue', label: 'Overdue', count: counts?.overdue },
        { id: 'upcoming', label: 'Upcoming', count: counts?.upcoming },
        { id: 'completed', label: 'Completed', count: counts?.completed },
    ];

    return (
        <div className="ws-module">
            <div className="ws-module-inner">
                <PageHeader
                    eyebrow="Execution"
                    title="Tasks"
                    subtitle={`${counts ? counts.pending : 0} open task${counts?.pending === 1 ? '' : 's'} across this workspace · ${counts ? counts.overdue : 0} overdue.`}
                    actions={<Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>New task</Button>}
                />

                <Tabs tabs={tabs} value={scope} onChange={id => setScope(id as Scope)} />

                <div className="ws-toolbar" style={{ marginBottom: 14 }}>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search tasks and people…" className="ws-search-wide" />
                    <Select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} aria-label="Filter by assignee">
                        <option value="all">All assignees</option>
                        {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </Select>
                    <Select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as 'all' | Priority)} aria-label="Filter by priority">
                        <option value="all">All priorities</option>
                        {PRIORITIES.map(priority => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
                    </Select>
                    <Select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} aria-label="Sort tasks">
                        <option value="due">Sort: due date</option>
                        <option value="priority">Sort: priority</option>
                        <option value="updated">Sort: recently updated</option>
                    </Select>
                    <span className="ws-toolbar-spacer" />
                    <div className="ws-segmented">
                        <button className={view === 'list' ? 'active' : ''} onClick={() => changeView('list')} title="List"><Icon name="list" size={14} /></button>
                        <button className={view === 'kanban' ? 'active' : ''} onClick={() => changeView('kanban')} title="Kanban"><Icon name="kanban" size={14} /></button>
                    </div>
                </div>

                <DataState loading={loading} error={error} onRetry={() => void reload()} />

                {!loading && !error && filtered.length === 0 && (
                    <EmptyState
                        icon="tasks"
                        title={tasks.length === 0 ? 'No tasks yet' : 'No tasks match this view'}
                        description={tasks.length === 0 ? 'Create a task to start tracking work.' : 'Try another tab, or clear the search and filters.'}
                    />
                )}

                {!loading && !error && filtered.length > 0 && view === 'list' && (
                    <div className="ws-table-wrap">
                        <table className="ws-table">
                            <thead>
                                <tr>
                                    <th className="ws-checkbox-cell" />
                                    <th>Task</th>
                                    <th>Status</th>
                                    <th>Priority</th>
                                    <th>Assignee</th>
                                    <th>Due</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(task => (
                                    <tr key={task.id} onClick={() => nav.openTask(task.id)}>
                                        <td onClick={event => event.stopPropagation()}>
                                            <button
                                                className={`ws-task-row-check ${task.status === 'completed' ? 'checked' : ''}`}
                                                onClick={() => void toggleComplete(task)}
                                                aria-label={task.status === 'completed' ? 'Mark incomplete' : 'Mark complete'}
                                            >
                                                <Icon name="check" size={12} />
                                            </button>
                                        </td>
                                        <td>
                                            <div className="cell-title" style={task.status === 'completed' ? { textDecoration: 'line-through', color: 'var(--text-tertiary)' } : undefined}>
                                                {task.title}
                                            </div>
                                            <div className="cell-sub">
                                                {task.subtaskCount > 0 ? `${task.subtaskDoneCount}/${task.subtaskCount} subtasks · ` : ''}
                                                {task.commentCount > 0 ? `${task.commentCount} comments · ` : ''}
                                                {task.leadName ? `Lead: ${task.leadName}` : task.description || 'No description'}
                                            </div>
                                        </td>
                                        <td><Badge tone={task.status === 'completed' ? 'green' : task.status === 'cancelled' ? 'red' : task.status === 'in_review' ? 'orange' : 'blue'}>{TASK_STATUS_LABEL[task.status]}</Badge></td>
                                        <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span className="ws-priority-dot" style={{ background: PRIORITY_COLOR[task.priority] }} />{PRIORITY_LABEL[task.priority]}</span></td>
                                        <td>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                <Avatar name={task.assigneeName} color={task.assigneeColor} size={20} />
                                                {task.assigneeName}
                                            </span>
                                        </td>
                                        <td className={task.dueDate && isOverdue(task.dueDate) && task.status !== 'completed' ? 'ws-task-overdue' : ''}>
                                            {task.dueDate ? formatDate(task.dueDate) : '—'}
                                        </td>
                                        <td onClick={event => event.stopPropagation()}>
                                            <div className="cell-actions">
                                                <button className="ws-icon-btn" aria-label="Open task" onClick={() => nav.openTask(task.id)}>
                                                    <Icon name="chevron-right" size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="ws-table-footer">
                            <span>{filtered.length} task{filtered.length === 1 ? '' : 's'}</span>
                        </div>
                    </div>
                )}

                {!loading && !error && filtered.length > 0 && view === 'kanban' && (
                    <div className="ws-task-board">
                        {TASK_STATUSES.map(status => {
                            const items = filtered.filter(task => task.status === status);
                            return (
                                <div
                                    key={status}
                                    className={`ws-task-col ${dragOverStatus === status ? 'drag-over' : ''}`}
                                    onDragOver={event => { event.preventDefault(); setDragOverStatus(status); }}
                                    onDragLeave={() => setDragOverStatus(current => (current === status ? null : current))}
                                    onDrop={event => { event.preventDefault(); void dropOnStatus(status); }}
                                >
                                    <div className="ws-task-col-head">
                                        <span className="ws-pipeline-name">{TASK_STATUS_LABEL[status]}</span>
                                        <span className="ws-pipeline-count">{items.length}</span>
                                    </div>
                                    <div className="ws-task-col-body">
                                        {items.map(task => (
                                            <article
                                                key={task.id}
                                                className={`ws-task-card ${draggingId === task.id ? 'dragging' : ''} ${task.status === 'completed' ? 'done' : ''}`}
                                                draggable
                                                onDragStart={() => setDraggingId(task.id)}
                                                onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
                                                onClick={() => nav.openTask(task.id)}
                                            >
                                                <div className="ws-task-card-title">{task.title}</div>
                                                <div className="ws-task-card-meta">
                                                    <span className={task.dueDate && isOverdue(task.dueDate) && task.status !== 'completed' ? 'ws-task-overdue' : ''}>
                                                        {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                                                    </span>
                                                    <PriorityBadge priority={task.priority} />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <Avatar name={task.assigneeName} color={task.assigneeColor} size={18} />
                                                    <span className="ws-small ws-muted">{task.assigneeName}</span>
                                                </div>
                                            </article>
                                        ))}
                                        {items.length === 0 && <div className="ws-pipeline-empty">Drop tasks here</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <TaskForm
                open={formOpen}
                workspaceId={workspaceId}
                currentUserId={userId}
                members={members}
                onClose={() => setFormOpen(false)}
                onSaved={task => {
                    void reload();
                    nav.openTask(task.id);
                }}
            />

            <TaskDetailModal
                taskId={selectedTaskId}
                workspaceId={workspaceId}
                members={members}
                nav={nav}
                onClose={onCloseTask}
                onChanged={() => void reload()}
            />
        </div>
    );
};
