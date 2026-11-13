import {
    db,
    type EntityType,
    type FollowUp,
    type FollowUpChannel,
    type FollowUpStatus,
    type Lead,
    type Project,
    type Task,
} from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertWorkspaceAccess } from './permissions';
import { logActivity } from './activity';
import { assertDateInput, dateKey, numberValue, oneOf, optional, required } from './validation';

export const FOLLOW_UP_CHANNELS: FollowUpChannel[] = ['call', 'email', 'meeting', 'message', 'other'];
export const FOLLOW_UP_CHANNEL_LABEL: Record<FollowUpChannel, string> = {
    call: 'Call',
    email: 'Email',
    meeting: 'Meeting',
    message: 'Message',
    other: 'Other',
};

export const FOLLOW_UP_STATUSES: FollowUpStatus[] = ['pending', 'completed', 'cancelled'];
export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
    pending: 'Pending',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

export interface FollowUpWithMeta extends FollowUp {
    entityTitle: string;
    entitySubtitle: string;
    assignedName: string;
    assignedColor: string;
    overdue: boolean;
    dueToday: boolean;
}

export interface FollowUpInput {
    entityType: EntityType;
    entityId: string;
    title: string;
    notes?: string;
    channel?: FollowUpChannel;
    dueAt: number;
    assignedTo?: string | null;
}

export interface FollowUpPatch {
    title?: string;
    notes?: string;
    channel?: FollowUpChannel;
    dueAt?: number;
    assignedTo?: string | null;
}

async function getEntity(workspaceId: string, entityType: EntityType, entityId: string): Promise<Lead | Project | Task | { id: string; title: string; name?: string }> {
    if (entityType === 'lead') {
        const lead = await db.leads.get(entityId);
        if (!lead || lead.workspaceId !== workspaceId) throw new AppError('NOT_FOUND', 'Lead not found.');
        return lead;
    }
    if (entityType === 'project') {
        const project = await db.projects.get(entityId);
        if (!project || project.workspaceId !== workspaceId) throw new AppError('NOT_FOUND', 'Project not found.');
        return project;
    }
    if (entityType === 'task') {
        const task = await db.tasks.get(entityId);
        if (!task || task.workspaceId !== workspaceId) throw new AppError('NOT_FOUND', 'Task not found.');
        return task;
    }
    const note = await db.notes.get(entityId);
    if (!note) throw new AppError('NOT_FOUND', 'Note not found.');
    return { id: note.id, title: note.title || 'Untitled note' };
}

function entityLabel(entityType: EntityType, entity: Lead | Project | Task | { id: string; title: string; name?: string }): { title: string; subtitle: string } {
    if (entityType === 'lead') {
        const lead = entity as Lead;
        return { title: lead.name || 'Deleted record', subtitle: lead.company || 'Lead' };
    }
    if (entityType === 'project') {
        const project = entity as Project;
        return {
            title: project.name || 'Deleted record',
            subtitle: project.identifier ? `${project.identifier} · Project` : 'Project',
        };
    }
    if (entityType === 'task') {
        const task = entity as Task;
        return { title: task.title || 'Deleted record', subtitle: 'Task' };
    }
    const note = entity as { title: string };
    return { title: note.title || 'Untitled note', subtitle: 'Note' };
}

async function assertAssignee(workspaceId: string, userId?: string | null): Promise<void> {
    if (!userId) return;
    const membership = await db.workspaceMembers.where('[workspaceId+userId]').equals([workspaceId, userId]).first();
    if (!membership) throw new AppError('VALIDATION', 'The selected person is not a member of this workspace.');
}

async function syncLeadNextFollowUp(leadId: string): Promise<void> {
    const lead = await db.leads.get(leadId);
    if (!lead) return;
    const pending = await db.followUps
        .where('[entityType+entityId]')
        .equals(['lead', leadId])
        .filter(item => item.status === 'pending')
        .toArray();
    const next = pending.map(item => item.dueAt).sort((a, b) => a - b)[0];
    await db.leads.update(leadId, { nextFollowUpAt: next, updatedAt: Date.now() });
}

async function attachMeta(items: FollowUp[]): Promise<FollowUpWithMeta[]> {
    const userIds = Array.from(new Set(items.map(item => item.assignedTo).filter(Boolean) as string[]));
    const users = await db.users.bulkGet(userIds);
    const userMap = new Map(users.filter(Boolean).map(user => [user!.id, user!]));
    const todayKey = dateKey(new Date());

    return Promise.all(items.map(async item => {
        const entity = await getEntity(item.workspaceId, item.entityType, item.entityId).catch(() => ({ id: item.entityId, title: 'Deleted record', name: 'Deleted record' }));
        const label = entityLabel(item.entityType, entity as Lead | Project | Task | { id: string; title: string; name?: string });
        const assigned = item.assignedTo ? userMap.get(item.assignedTo) : undefined;
        const itemKey = dateKey(item.dueAt);
        return {
            ...item,
            entityTitle: label.title,
            entitySubtitle: label.subtitle,
            assignedName: assigned?.name || 'Unassigned',
            assignedColor: assigned?.avatarColor || '#8e8e93',
            overdue: item.status === 'pending' && item.dueAt < Date.now(),
            dueToday: item.status === 'pending' && itemKey === todayKey,
        };
    }));
}

export async function listFollowUps(
    workspaceId: string,
    opts: {
        status?: FollowUpStatus | 'all';
        entityType?: EntityType;
        entityId?: string;
        assignedTo?: string;
        from?: number;
        to?: number;
        limit?: number;
    } = {},
): Promise<FollowUpWithMeta[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    let items = await db.followUps.where('workspaceId').equals(workspaceId).toArray();
    if (opts.status && opts.status !== 'all') items = items.filter(item => item.status === opts.status);
    if (opts.entityType) items = items.filter(item => item.entityType === opts.entityType);
    if (opts.entityId) items = items.filter(item => item.entityId === opts.entityId);
    if (opts.assignedTo) items = items.filter(item => item.assignedTo === opts.assignedTo);
    if (opts.from !== undefined) items = items.filter(item => item.dueAt >= opts.from!);
    if (opts.to !== undefined) items = items.filter(item => item.dueAt <= opts.to!);

    items = items
        .sort((a, b) => {
            if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
            return a.dueAt - b.dueAt;
        })
        .slice(0, opts.limit || 500);

    return attachMeta(items);
}

export async function listEntityFollowUps(entityType: EntityType, entityId: string): Promise<FollowUpWithMeta[]> {
    const actor = await requireUser();
    const workspaceId = await workspaceIdForEntity(entityType, entityId);
    await assertWorkspaceAccess(actor, workspaceId);
    const items = await db.followUps
        .where('[entityType+entityId]')
        .equals([entityType, entityId])
        .toArray();
    return attachMeta(items.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return a.dueAt - b.dueAt;
    }));
}

async function workspaceIdForEntity(entityType: EntityType, entityId: string): Promise<string> {
    if (entityType === 'lead') {
        const lead = await db.leads.get(entityId);
        if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
        return lead.workspaceId;
    }
    if (entityType === 'project') {
        const project = await db.projects.get(entityId);
        if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
        return project.workspaceId;
    }
    if (entityType === 'task') {
        const task = await db.tasks.get(entityId);
        if (!task) throw new AppError('NOT_FOUND', 'Task not found.');
        return task.workspaceId;
    }
    const note = await db.notes.get(entityId);
    if (!note) throw new AppError('NOT_FOUND', 'Note not found.');
    return note.workspaceId || '';
}

export async function getFollowUpSummary(workspaceId: string, userId: string): Promise<{
    overdue: number;
    today: number;
    upcoming: number;
    mine: number;
    completed: number;
}> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const items = await db.followUps.where('workspaceId').equals(workspaceId).toArray();
    const today = dateKey(new Date());
    const week = dateKey(new Date(Date.now() + 7 * 86_400_000));
    const pending = items.filter(item => item.status === 'pending');
    return {
        overdue: pending.filter(item => item.dueAt < Date.now() && dateKey(item.dueAt) !== today).length,
        today: pending.filter(item => dateKey(item.dueAt) === today).length,
        upcoming: pending.filter(item => dateKey(item.dueAt) > today && dateKey(item.dueAt) <= week).length,
        mine: pending.filter(item => item.assignedTo === userId).length,
        completed: items.filter(item => item.status === 'completed').length,
    };
}

export async function createFollowUp(workspaceId: string, input: FollowUpInput): Promise<FollowUp> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    await getEntity(workspaceId, input.entityType, input.entityId);

    const title = required(input.title, 'Follow-up title', 200);
    const dueAt = numberValue(input.dueAt, 'Follow-up date', 0, Number.MAX_SAFE_INTEGER);
    const channel = oneOf(input.channel ?? 'call', FOLLOW_UP_CHANNELS, 'Follow-up channel');
    const assignedTo = input.assignedTo === null ? undefined : (input.assignedTo || actor.id);
    await assertAssignee(workspaceId, assignedTo);

    const followUp: FollowUp = {
        id: crypto.randomUUID(),
        workspaceId,
        entityType: input.entityType,
        entityId: input.entityId,
        title,
        notes: optional(input.notes, 'Notes', 4000),
        channel,
        dueAt,
        status: 'pending',
        assignedTo,
        createdBy: actor.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    await db.followUps.add(followUp);

    if (followUp.entityType === 'lead') await syncLeadNextFollowUp(followUp.entityId);

    if (assignedTo && assignedTo !== actor.id) {
        await db.notifications.add({
            id: crypto.randomUUID(),
            workspaceId,
            userId: assignedTo,
            title: 'Follow-up assigned',
            body: `${actor.name} scheduled “${title}” for you.`,
            entityType: input.entityType,
            entityId: input.entityId,
            read: 0,
            createdAt: Date.now(),
        });
    }

    await logActivity({
        workspaceId,
        userId: actor.id,
        entityType: input.entityType,
        entityId: input.entityId,
        action: 'follow_up_scheduled',
        title: `Scheduled follow-up: ${title}`,
    });
    return followUp;
}

export async function updateFollowUp(followUpId: string, input: FollowUpPatch): Promise<FollowUp> {
    const actor = await requireUser();
    const existing = await db.followUps.get(followUpId);
    if (!existing) throw new AppError('NOT_FOUND', 'Follow-up not found.');
    await assertWorkspaceAccess(actor, existing.workspaceId);

    const assignedTo = input.assignedTo === undefined ? existing.assignedTo : (input.assignedTo || undefined);
    await assertAssignee(existing.workspaceId, assignedTo);
    const updated: FollowUp = {
        ...existing,
        title: input.title === undefined ? existing.title : required(input.title, 'Follow-up title', 200),
        notes: input.notes === undefined ? existing.notes : optional(input.notes, 'Notes', 4000),
        channel: input.channel === undefined ? existing.channel : oneOf(input.channel, FOLLOW_UP_CHANNELS, 'Follow-up channel'),
        dueAt: input.dueAt === undefined ? existing.dueAt : numberValue(input.dueAt, 'Follow-up date', 0, Number.MAX_SAFE_INTEGER),
        assignedTo,
        updatedAt: Date.now(),
    };
    await db.followUps.put(updated);
    if (updated.entityType === 'lead') await syncLeadNextFollowUp(updated.entityId);

    if (assignedTo && assignedTo !== existing.assignedTo && assignedTo !== actor.id) {
        await db.notifications.add({
            id: crypto.randomUUID(),
            workspaceId: existing.workspaceId,
            userId: assignedTo,
            title: 'Follow-up assigned',
            body: `${actor.name} assigned you “${updated.title}”.`,
            entityType: updated.entityType,
            entityId: updated.entityId,
            read: 0,
            createdAt: Date.now(),
        });
    }
    await logActivity({
        workspaceId: existing.workspaceId,
        userId: actor.id,
        entityType: existing.entityType,
        entityId: existing.entityId,
        action: 'follow_up_updated',
        title: `Updated follow-up: ${updated.title}`,
    });
    return updated;
}

export async function completeFollowUp(followUpId: string, outcome: string, nextAt?: number | null): Promise<{ completed: FollowUp; next?: FollowUp }> {
    const actor = await requireUser();
    const existing = await db.followUps.get(followUpId);
    if (!existing) throw new AppError('NOT_FOUND', 'Follow-up not found.');
    await assertWorkspaceAccess(actor, existing.workspaceId);
    const result = optional(outcome, 'Outcome', 4000);
    if (!result) throw new AppError('VALIDATION', 'Add an outcome before completing the follow-up.');

    const now = Date.now();
    await db.followUps.update(followUpId, {
        status: 'completed',
        outcome: result,
        completedAt: now,
        updatedAt: now,
    });

    if (existing.entityType === 'lead') {
        await db.leads.update(existing.entityId, { lastContactedAt: now, updatedAt: now });
        await db.leadActivities.add({
            id: crypto.randomUUID(),
            workspaceId: existing.workspaceId,
            leadId: existing.entityId,
            type: 'follow_up',
            subject: existing.title,
            body: result,
            occurredAt: now,
            createdAt: now,
            userId: actor.id,
        });
    }

    let next: FollowUp | undefined;
    if (nextAt) {
        next = await createFollowUp(existing.workspaceId, {
            entityType: existing.entityType,
            entityId: existing.entityId,
            title: existing.title,
            notes: existing.notes,
            channel: existing.channel,
            dueAt: nextAt,
            assignedTo: existing.assignedTo,
        });
    } else if (existing.entityType === 'lead') {
        await syncLeadNextFollowUp(existing.entityId);
    }

    const completed = (await db.followUps.get(followUpId))!;
    await logActivity({
        workspaceId: existing.workspaceId,
        userId: actor.id,
        entityType: existing.entityType,
        entityId: existing.entityId,
        action: 'follow_up_completed',
        title: `Completed follow-up: ${existing.title}`,
        metadata: result,
    });
    return { completed, next };
}

export async function cancelFollowUp(followUpId: string): Promise<void> {
    const actor = await requireUser();
    const existing = await db.followUps.get(followUpId);
    if (!existing) throw new AppError('NOT_FOUND', 'Follow-up not found.');
    await assertWorkspaceAccess(actor, existing.workspaceId);
    await db.followUps.update(followUpId, { status: 'cancelled', updatedAt: Date.now() });
    if (existing.entityType === 'lead') await syncLeadNextFollowUp(existing.entityId);
    await logActivity({
        workspaceId: existing.workspaceId,
        userId: actor.id,
        entityType: existing.entityType,
        entityId: existing.entityId,
        action: 'follow_up_cancelled',
        title: `Cancelled follow-up: ${existing.title}`,
    });
}

export async function rescheduleFollowUp(followUpId: string, dueAt: number): Promise<FollowUp> {
    return updateFollowUp(followUpId, { dueAt });
}

export async function deleteFollowUp(followUpId: string): Promise<void> {
    const actor = await requireUser();
    const existing = await db.followUps.get(followUpId);
    if (!existing) return;
    await assertWorkspaceAccess(actor, existing.workspaceId);
    if (actor.role !== 'admin' && existing.createdBy !== actor.id && existing.assignedTo !== actor.id) {
        throw new AppError('FORBIDDEN', 'Only the creator, assignee or an admin can delete this follow-up.');
    }
    await db.followUps.delete(followUpId);
    if (existing.entityType === 'lead') await syncLeadNextFollowUp(existing.entityId);
    await logActivity({
        workspaceId: existing.workspaceId,
        userId: actor.id,
        entityType: existing.entityType,
        entityId: existing.entityId,
        action: 'follow_up_deleted',
        title: `Deleted follow-up: ${existing.title}`,
    });
}

export function followUpDateKey(dueAt: number): string {
    assertDateInput(dateKey(dueAt), 'Follow-up date');
    return dateKey(dueAt);
}
