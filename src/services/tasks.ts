import {
    db,
    type Priority,
    type Subtask,
    type Tag,
    type Task,
    type TaskComment,
    type TaskStatus,
} from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertTaskDelete, assertTaskEdit, assertWorkspaceAccess } from './permissions';
import { logActivity } from './activity';
import { getTagsForEntities, getTagsForEntity, setTagsForEntity } from './tags';
import {
    assertDateInput,
    oneOf,
    optional,
    PRIORITIES,
    required,
} from './validation';

export const TASK_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'completed', 'cancelled'];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
    backlog: 'Backlog',
    todo: 'To Do',
    in_progress: 'In Progress',
    in_review: 'In Review',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

export interface TaskWithMeta extends Task {
    leadName?: string;
    assigneeName: string;
    assigneeColor: string;
    tags: Tag[];
    subtaskCount: number;
    subtaskDoneCount: number;
    commentCount: number;
}

export interface TaskInput {
    title: string;
    description?: string;
    leadId?: string | null;
    projectId?: string | null;
    assigneeId?: string | null;
    priority?: Priority;
    status?: TaskStatus;
    startDate?: string;
    dueDate?: string;
    tags?: string[];
}

async function assertAssignee(workspaceId: string, assigneeId?: string | null): Promise<void> {
    if (!assigneeId) return;
    const membership = await db.workspaceMembers.where('[workspaceId+userId]').equals([workspaceId, assigneeId]).first();
    if (!membership) throw new AppError('VALIDATION', 'The selected assignee is not part of this workspace.');
}

async function assertLead(workspaceId: string, leadId?: string | null): Promise<void> {
    if (!leadId) return;
    const lead = await db.leads.get(leadId);
    if (!lead || lead.workspaceId !== workspaceId) {
        throw new AppError('VALIDATION', 'The selected lead does not exist in this workspace.');
    }
}

async function assertProject(workspaceId: string, projectId?: string | null): Promise<void> {
    if (!projectId) return;
    const project = await db.projects.get(projectId);
    if (!project || project.workspaceId !== workspaceId) {
        throw new AppError('VALIDATION', 'The selected project does not exist in this workspace.');
    }
}

export async function listTasks(
    workspaceId: string,
    opts: { leadId?: string; assigneeId?: string } = {},
): Promise<TaskWithMeta[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    let tasks = await db.tasks.where('workspaceId').equals(workspaceId).toArray();
    if (opts.leadId) tasks = tasks.filter(t => t.leadId === opts.leadId);
    if (opts.assigneeId) tasks = tasks.filter(t => t.assigneeId === opts.assigneeId);

    const leadIds = Array.from(new Set(tasks.map(t => t.leadId).filter(Boolean) as string[]));
    const assigneeIds = Array.from(new Set(tasks.map(t => t.assigneeId).filter(Boolean) as string[]));
    const taskIds = tasks.map(t => t.id);

    const [leads, assignees, tags, subtasks, comments] = await Promise.all([
        db.leads.bulkGet(leadIds),
        db.users.bulkGet(assigneeIds),
        getTagsForEntities('task', taskIds),
        taskIds.length ? db.subtasks.filter(s => taskIds.includes(s.taskId)).toArray() : Promise.resolve([]),
        taskIds.length ? db.taskComments.filter(c => taskIds.includes(c.taskId)).toArray() : Promise.resolve([]),
    ]);

    const leadMap = new Map(leads.filter(Boolean).map(l => [l!.id, l!]));
    const userMap = new Map(assignees.filter(Boolean).map(u => [u!.id, u!]));

    return tasks
        .map(task => {
            const assignee = task.assigneeId ? userMap.get(task.assigneeId) : undefined;
            const taskSubtasks = subtasks.filter(s => s.taskId === task.id);
            return {
                ...task,
                leadName: task.leadId ? leadMap.get(task.leadId)?.name : undefined,
                assigneeName: assignee?.name || 'Unassigned',
                assigneeColor: assignee?.avatarColor || '#8e8e93',
                tags: tags[task.id] || [],
                subtaskCount: taskSubtasks.length,
                subtaskDoneCount: taskSubtasks.filter(s => s.done === 1).length,
                commentCount: comments.filter(c => c.taskId === task.id).length,
            };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getTask(taskId: string): Promise<Task> {
    const actor = await requireUser();
    const task = await db.tasks.get(taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    return task;
}

export async function getTaskWithMeta(taskId: string): Promise<TaskWithMeta> {
    const actor = await requireUser();
    const task = await db.tasks.get(taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);

    const [lead, assignee, tags, subtasks, comments] = await Promise.all([
        task.leadId ? db.leads.get(task.leadId) : Promise.resolve(undefined),
        task.assigneeId ? db.users.get(task.assigneeId) : Promise.resolve(undefined),
        getTagsForEntity('task', taskId),
        db.subtasks.where('taskId').equals(taskId).toArray(),
        db.taskComments.where('taskId').equals(taskId).toArray(),
    ]);

    return {
        ...task,
        leadName: lead?.name,
        assigneeName: assignee?.name || 'Unassigned',
        assigneeColor: assignee?.avatarColor || '#8e8e93',
        tags,
        subtaskCount: subtasks.length,
        subtaskDoneCount: subtasks.filter(s => s.done === 1).length,
        commentCount: comments.length,
    };
}

async function normalizeTask(
    workspaceId: string,
    input: Partial<TaskInput>,
    actorId: string,
    existing?: Task,
): Promise<Omit<Task, 'id' | 'createdAt'>> {
    const title = required(input.title ?? existing?.title, 'Task title', 200);
    const startDate = assertDateInput(input.startDate ?? existing?.startDate, 'Start date');
    const dueDate = assertDateInput(input.dueDate ?? existing?.dueDate, 'Due date');
    if (startDate && dueDate && dueDate < startDate) {
        throw new AppError('VALIDATION', 'Due date cannot be before the start date.');
    }

    const leadId = input.leadId === undefined ? existing?.leadId : (input.leadId || undefined);
    const projectId = input.projectId === undefined ? existing?.projectId : (input.projectId || undefined);
    const assigneeId = input.assigneeId === undefined ? existing?.assigneeId : (input.assigneeId || undefined);

    await assertAssignee(workspaceId, assigneeId);
    await assertLead(workspaceId, leadId);
    await assertProject(workspaceId, projectId);

    const status = oneOf(input.status ?? existing?.status ?? 'backlog', TASK_STATUSES, 'Task status');

    return {
        workspaceId,
        leadId,
        projectId,
        assigneeId,
        title,
        description: optional(input.description ?? existing?.description, 'Description', 5000),
        priority: oneOf(input.priority ?? existing?.priority ?? 'medium', PRIORITIES, 'Priority'),
        status,
        startDate,
        dueDate,
        updatedAt: Date.now(),
        completedAt: status === 'completed' ? (existing?.completedAt ?? Date.now()) : undefined,
        createdBy: existing?.createdBy ?? actorId,
    };
}

export async function createTask(workspaceId: string, input: TaskInput): Promise<Task> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const normalized = await normalizeTask(workspaceId, input, actor.id);

    const task: Task = {
        ...normalized,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        createdBy: actor.id,
    };

    await db.tasks.add(task);
    if (input.tags?.length) await setTagsForEntity(workspaceId, 'task', task.id, input.tags);
    if (task.assigneeId && task.assigneeId !== actor.id) {
        await db.notifications.add({
            id: crypto.randomUUID(),
            workspaceId,
            userId: task.assigneeId,
            title: 'New task assigned',
            body: `${actor.name} assigned you “${task.title}”.`,
            entityType: 'task',
            entityId: task.id,
            read: 0,
            createdAt: Date.now(),
        });
    }
    await logActivity({
        workspaceId,
        userId: actor.id,
        entityType: 'task',
        entityId: task.id,
        action: 'created',
        title: `Created task ${task.title}`,
    });
    return task;
}

export async function updateTask(taskId: string, input: Partial<TaskInput>): Promise<Task> {
    const actor = await requireUser();
    const existing = await db.tasks.get(taskId);
    if (!existing) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, existing.workspaceId);
    await assertTaskEdit(actor, existing);

    const normalized = await normalizeTask(existing.workspaceId, input, actor.id, existing);
    const updated: Task = { ...existing, ...normalized, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy };
    await db.tasks.put(updated);

    if (input.tags !== undefined) {
        await setTagsForEntity(existing.workspaceId, 'task', taskId, input.tags);
    }

    if (updated.assigneeId && updated.assigneeId !== existing.assigneeId && updated.assigneeId !== actor.id) {
        await db.notifications.add({
            id: crypto.randomUUID(),
            workspaceId: existing.workspaceId,
            userId: updated.assigneeId,
            title: 'Task assigned to you',
            body: `${actor.name} assigned you “${updated.title}”.`,
            entityType: 'task',
            entityId: taskId,
            read: 0,
            createdAt: Date.now(),
        });
    }

    await logActivity({
        workspaceId: existing.workspaceId,
        userId: actor.id,
        entityType: 'task',
        entityId: taskId,
        action: existing.status !== updated.status ? 'status_changed' : 'updated',
        title: existing.status !== updated.status
            ? `Changed ${updated.title} to ${TASK_STATUS_LABEL[updated.status]}`
            : `Updated task ${updated.title}`,
    });
    return updated;
}

export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const actor = await requireUser();
    const task = await db.tasks.get(taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    await assertTaskEdit(actor, task);
    oneOf(status, TASK_STATUSES, 'Task status');
    await db.tasks.update(taskId, {
        status,
        completedAt: status === 'completed' ? Date.now() : undefined,
        updatedAt: Date.now(),
    });
    await logActivity({
        workspaceId: task.workspaceId,
        userId: actor.id,
        entityType: 'task',
        entityId: taskId,
        action: 'status_changed',
        title: `Changed ${task.title} to ${TASK_STATUS_LABEL[status]}`,
    });
}

export async function deleteTask(taskId: string): Promise<void> {
    const actor = await requireUser();
    const task = await db.tasks.get(taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    await assertTaskDelete(actor, task);

    await db.transaction('rw', [
        db.tasks, db.subtasks, db.taskComments, db.calendarEvents, db.recordTags,
        db.noteLinks, db.activities, db.notifications,
    ], async () => {
        await db.tasks.delete(taskId);
        await db.subtasks.where('taskId').equals(taskId).delete();
        await db.taskComments.where('taskId').equals(taskId).delete();
        await db.calendarEvents.filter(event => event.taskId === taskId).modify({ taskId: undefined });
        await db.recordTags.where('[entityType+entityId]').equals(['task', taskId]).delete();
        await db.noteLinks.where('[entityType+entityId]').equals(['task', taskId]).delete();
        await db.activities.where('[entityType+entityId]').equals(['task', taskId]).delete();
    });
}

/* ------------------------------------------------------------------ */
/* Subtasks                                                            */
/* ------------------------------------------------------------------ */

export async function listSubtasks(taskId: string): Promise<Subtask[]> {
    const actor = await requireUser();
    const task = await db.tasks.get(taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    return db.subtasks.where('taskId').equals(taskId).sortBy('order');
}

export async function addSubtask(taskId: string, title: string): Promise<Subtask> {
    const actor = await requireUser();
    const task = await db.tasks.get(taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    await assertTaskEdit(actor, task);
    const clean = required(title, 'Subtask title', 200);
    const existing = await db.subtasks.where('taskId').equals(taskId).count();
    const subtask: Subtask = {
        id: crypto.randomUUID(),
        taskId,
        title: clean,
        done: 0,
        order: existing,
        createdAt: Date.now(),
    };
    await db.subtasks.add(subtask);
    return subtask;
}

export async function toggleSubtask(subtaskId: string): Promise<void> {
    const actor = await requireUser();
    const subtask = await db.subtasks.get(subtaskId);
    if (!subtask) throw new AppError('NOT_FOUND', 'Subtask not found.');
    const task = await db.tasks.get(subtask.taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    await assertTaskEdit(actor, task);
    await db.subtasks.update(subtaskId, { done: subtask.done ? 0 : 1 });
}

export async function deleteSubtask(subtaskId: string): Promise<void> {
    const actor = await requireUser();
    const subtask = await db.subtasks.get(subtaskId);
    if (!subtask) throw new AppError('NOT_FOUND', 'Subtask not found.');
    const task = await db.tasks.get(subtask.taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    await assertTaskEdit(actor, task);
    await db.subtasks.delete(subtaskId);
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

export interface CommentWithUser extends TaskComment {
    userName: string;
    userColor: string;
}

export async function listTaskComments(taskId: string): Promise<CommentWithUser[]> {
    const actor = await requireUser();
    const task = await db.tasks.get(taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    const comments = await db.taskComments.where('taskId').equals(taskId).reverse().sortBy('createdAt');
    const users = await db.users.bulkGet(Array.from(new Set(comments.map(c => c.userId))));
    const userMap = new Map(users.filter(Boolean).map(u => [u!.id, u!]));
    return comments.map(c => ({
        ...c,
        userName: userMap.get(c.userId)?.name || 'Unknown user',
        userColor: userMap.get(c.userId)?.avatarColor || '#8e8e93',
    }));
}

export async function addTaskComment(taskId: string, body: string): Promise<TaskComment> {
    const actor = await requireUser();
    const task = await db.tasks.get(taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    const text = required(body, 'Comment', 4000);
    const comment: TaskComment = {
        id: crypto.randomUUID(),
        taskId,
        userId: actor.id,
        body: text,
        createdAt: Date.now(),
    };
    await db.taskComments.add(comment);
    await logActivity({
        workspaceId: task.workspaceId,
        userId: actor.id,
        entityType: 'task',
        entityId: taskId,
        action: 'commented',
        title: `Commented on ${task.title}`,
    });
    return comment;
}

export async function deleteTaskComment(commentId: string): Promise<void> {
    const actor = await requireUser();
    const comment = await db.taskComments.get(commentId);
    if (!comment) throw new AppError('NOT_FOUND', 'Comment not found.');
    const task = await db.tasks.get(comment.taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
    await assertWorkspaceAccess(actor, task.workspaceId);
    if (actor.role !== 'admin' && comment.userId !== actor.id) {
        throw new AppError('FORBIDDEN', 'You can only delete your own comments.');
    }
    await db.taskComments.delete(commentId);
}

export async function getTaskCounts(workspaceId: string, userId: string): Promise<{
    pending: number;
    overdue: number;
    upcoming: number;
    completed: number;
    mine: number;
}> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const tasks = await db.tasks.where('workspaceId').equals(workspaceId).toArray();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const week = new Date(today);
    week.setDate(week.getDate() + 7);
    const weekKey = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}-${String(week.getDate()).padStart(2, '0')}`;

    return {
        pending: tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length,
        overdue: tasks.filter(t => t.dueDate && t.dueDate < todayKey && t.status !== 'completed' && t.status !== 'cancelled').length,
        upcoming: tasks.filter(t => t.dueDate && t.dueDate >= todayKey && t.dueDate <= weekKey && t.status !== 'completed' && t.status !== 'cancelled').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        mine: tasks.filter(t => t.assigneeId === userId && t.status !== 'completed' && t.status !== 'cancelled').length,
    };
}
