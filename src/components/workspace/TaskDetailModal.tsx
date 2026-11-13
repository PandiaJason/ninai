import React, { useState } from 'react';
import type { Priority, TaskStatus } from '../../db';
import {
    addSubtask,
    addTaskComment,
    deleteSubtask,
    deleteTask,
    deleteTaskComment,
    getTaskWithMeta,
    listSubtasks,
    listTaskComments,
    setTaskStatus,
    toggleSubtask,
    updateTask,
    TASK_STATUSES,
    TASK_STATUS_LABEL,
} from '../../services/tasks';
import { getTagsForEntity } from '../../services/tags';
import { PRIORITIES, PRIORITY_LABEL, formatDate, formatDateTime, isOverdue } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import type { WorkspaceNav } from '../../types/workspace';
import type { WorkspaceUser } from '../../services/workspace';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, IconButton, SectionCard } from '../ui/Misc';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { Field, Select, TextInput, UserSelect } from '../ui/Form';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { PriorityBadge, TaskStatusBadge } from './shared';
import { useAsyncData } from './useAsyncData';
import { EntityNotes } from './EntityNotes';
import { EntityFollowUps } from './EntityFollowUps';
import { TaskForm } from './TaskForm';

interface TaskDetailModalProps {
    taskId: string | null;
    workspaceId: string;
    members: WorkspaceUser[];
    nav: WorkspaceNav;
    onClose: () => void;
    onChanged: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ taskId, workspaceId, members, nav, onClose, onChanged }) => {
    const { user } = useAuth();
    const toast = useToast();
    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [busy, setBusy] = useState(false);
    const [subtaskTitle, setSubtaskTitle] = useState('');
    const [comment, setComment] = useState('');

    const { data, loading, error, reload } = useAsyncData(async () => {
        if (!taskId) return null;
        const task = await getTaskWithMeta(taskId);
        const [subtasks, comments, tags] = await Promise.all([
            listSubtasks(taskId),
            listTaskComments(taskId),
            getTagsForEntity('task', taskId),
        ]);
        return { task, subtasks, comments, tags };
    }, [taskId, workspaceId]);

    const task = data?.task;

    const refresh = async () => {
        await reload();
        onChanged();
    };

    const quickUpdate = async (patch: Parameters<typeof updateTask>[1]) => {
        if (!task) return;
        try {
            await updateTask(task.id, patch);
            toast.success('Task updated.');
            await refresh();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const addNewSubtask = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!task || !subtaskTitle.trim()) return;
        try {
            await addSubtask(task.id, subtaskTitle);
            setSubtaskTitle('');
            await refresh();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const postComment = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!task || !comment.trim()) return;
        try {
            await addTaskComment(task.id, comment);
            setComment('');
            await refresh();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    const remove = async () => {
        if (!task) return;
        setBusy(true);
        try {
            await deleteTask(task.id);
            toast.success('Task deleted.');
            setConfirmDelete(false);
            onChanged();
            onClose();
        } catch (e) {
            toast.error(toErrorMessage(e));
            setBusy(false);
        }
    };

    if (!taskId) return null;

    return (
        <>
            <Modal
                open={!!taskId}
                onClose={onClose}
                title={task ? task.title : 'Task'}
                subtitle={task?.leadName ? `Lead · ${task.leadName}` : 'Task details'}
                size="xl"
                footer={(
                    <>
                        <Button onClick={onClose}>Close</Button>
                        {task && <Button variant="primary" icon="edit" onClick={() => setEditing(true)}>Edit task</Button>}
                    </>
                )}
            >
                {loading && !task && <div className="ws-loading"><span className="ws-spinner" /><span>Loading task…</span></div>}
                {error && !task && <div className="ws-inline-error"><Icon name="alert" size={16} /><span>{error}</span></div>}
                {task && data && (
                    <div className="ws-task-detail-grid">
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                                <TaskStatusBadge status={task.status} />
                                <PriorityBadge priority={task.priority} />
                                {task.dueDate && isOverdue(task.dueDate) && task.status !== 'completed' && <Badge tone="red">Overdue</Badge>}
                                {task.tags.length > 0 && task.tags.map(tag => <Badge key={tag.id} tone="blue">#{tag.name}</Badge>)}
                            </div>

                            <SectionCard title="Description" padded>
                                {task.description
                                    ? <p className="ws-task-description">{task.description}</p>
                                    : <p className="ws-muted">No description yet. Use Edit to add context.</p>}
                            </SectionCard>

                            <SectionCard
                                title="Subtasks"
                                description={`${data.subtasks.filter(item => item.done === 1).length}/${data.subtasks.length} complete`}
                            >
                                {data.subtasks.length > 0 && (
                                    <div className="ws-subtask-list" style={{ marginBottom: 10 }}>
                                        {data.subtasks.map(subtask => (
                                            <div key={subtask.id} className={`ws-subtask ${subtask.done ? 'done' : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={subtask.done === 1}
                                                    onChange={() => void toggleSubtask(subtask.id).then(refresh).catch(e => toast.error(toErrorMessage(e)))}
                                                />
                                                <span>{subtask.title}</span>
                                                <IconButton
                                                    icon="trash"
                                                    label="Delete subtask"
                                                    danger
                                                    onClick={() => void deleteSubtask(subtask.id).then(refresh).catch(e => toast.error(toErrorMessage(e)))}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <form onSubmit={addNewSubtask} className="ws-comment-form">
                                    <TextInput value={subtaskTitle} onChange={e => setSubtaskTitle(e.target.value)} placeholder="Add a subtask…" />
                                    <Button type="submit" size="sm" icon="plus" disabled={!subtaskTitle.trim()}>Add</Button>
                                </form>
                            </SectionCard>

                            <SectionCard title="Comments" description={`${data.comments.length} comment${data.comments.length === 1 ? '' : 's'}`}>
                                {data.comments.length === 0 ? (
                                    <EmptyState compact icon="message" title="No comments yet" description="Discuss decisions, blockers or progress with the team." />
                                ) : (
                                    <div className="ws-comment-list">
                                        {data.comments.map(item => (
                                            <div className="ws-comment" key={item.id}>
                                                <Avatar name={item.userName} color={item.userColor} size={26} />
                                                <div className="ws-comment-body">
                                                    <div className="ws-comment-head">
                                                        <strong>{item.userName}</strong>
                                                        <span>{formatDateTime(item.createdAt)}</span>
                                                        {(user?.role === 'admin' || user?.id === item.userId) && (
                                                            <button
                                                                className="ws-icon-btn"
                                                                style={{ width: 20, height: 20, marginLeft: 'auto' }}
                                                                aria-label="Delete comment"
                                                                onClick={() => void deleteTaskComment(item.id).then(refresh).catch(e => toast.error(toErrorMessage(e)))}
                                                            >
                                                                <Icon name="x" size={11} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {item.body}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <form onSubmit={postComment} className="ws-comment-form">
                                    <TextInput value={comment} onChange={e => setComment(e.target.value)} placeholder="Write a comment…" />
                                    <Button type="submit" size="sm" variant="primary" icon="send" disabled={!comment.trim()}>Post</Button>
                                </form>
                            </SectionCard>

                            <EntityFollowUps
                                workspaceId={workspaceId}
                                entityType="task"
                                entityId={task.id}
                                entityLabel={task.title}
                                onChanged={() => void reload()}
                            />

                            <EntityNotes workspaceId={workspaceId} entityType="task" entityId={task.id} nav={nav} />
                        </div>

                        <aside className="ws-task-detail-meta">
                            <SectionCard title="Status">
                                <Field label="Status" htmlFor="task-detail-status">
                                    <Select
                                        id="task-detail-status"
                                        value={task.status}
                                        onChange={e => void setTaskStatus(task.id, e.target.value as TaskStatus).then(refresh).catch(err => toast.error(toErrorMessage(err)))}
                                    >
                                        {TASK_STATUSES.map(status => <option key={status} value={status}>{TASK_STATUS_LABEL[status]}</option>)}
                                    </Select>
                                </Field>
                            </SectionCard>

                            <SectionCard title="Assignment">
                                <Field label="Assignee" htmlFor="task-detail-assignee">
                                    <UserSelect
                                        id="task-detail-assignee"
                                        users={members}
                                        value={task.assigneeId || ''}
                                        onChange={value => void quickUpdate({ assigneeId: value || null })}
                                        allowUnassigned
                                    />
                                </Field>
                                <div style={{ marginTop: 12 }}>
                                    <Field label="Priority" htmlFor="task-detail-priority">
                                        <Select
                                            id="task-detail-priority"
                                            value={task.priority}
                                            onChange={e => void quickUpdate({ priority: e.target.value as Priority })}
                                        >
                                            {PRIORITIES.map(priority => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
                                        </Select>
                                    </Field>
                                </div>
                            </SectionCard>

                            <SectionCard title="Details">
                                <div className="ws-info-list">
                                    <div className="ws-info-row"><Icon name="calendar" size={14} /><span className="ws-info-label">Start</span><span className="ws-info-value">{task.startDate ? formatDate(task.startDate) : '—'}</span></div>
                                    <div className="ws-info-row"><Icon name="clock" size={14} /><span className="ws-info-label">Due</span><span className="ws-info-value">{task.dueDate ? formatDate(task.dueDate) : '—'}</span></div>
                                    <div className="ws-info-row"><Icon name="user" size={14} /><span className="ws-info-label">Assignee</span><span className="ws-info-value">{task.assigneeName}</span></div>
                                    <div className="ws-info-row"><Icon name="crm" size={14} /><span className="ws-info-label">Lead</span><span className="ws-info-value">{task.leadId ? (
                                        <button
                                            style={{ border: 'none', background: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: 0 }}
                                            onClick={() => { onClose(); nav.openLead(task.leadId!); }}
                                        >
                                            {task.leadName || 'Lead'}
                                        </button>
                                    ) : '—'}</span></div>
                                    <div className="ws-info-row"><Icon name="clock" size={14} /><span className="ws-info-label">Created</span><span className="ws-info-value">{formatDate(task.createdAt)}</span></div>
                                </div>
                            </SectionCard>

                            <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>Delete task</Button>
                        </aside>
                    </div>
                )}
            </Modal>

            {task && (
                <TaskForm
                    open={editing}
                    workspaceId={workspaceId}
                    currentUserId={user?.id || ''}
                    members={members}
                    task={task}
                    onClose={() => setEditing(false)}
                    onSaved={() => void refresh()}
                />
            )}

            <ConfirmDialog
                open={confirmDelete}
                title="Delete task?"
                message="This permanently deletes the task, its subtasks, comments and links. This cannot be undone."
                confirmLabel="Delete task"
                danger
                busy={busy}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => void remove()}
            />
        </>
    );
};
