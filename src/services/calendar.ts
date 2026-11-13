import {
    db,
    type CalendarEvent,
    type CalendarEventType,
} from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertWorkspaceAccess } from './permissions';
import { logActivity } from './activity';
import {
    dateKey,
    numberValue,
    oneOf,
    optional,
    required,
} from './validation';

export const EVENT_TYPES: CalendarEventType[] = ['meeting', 'follow_up', 'deadline', 'reminder', 'other'];
export const EVENT_TYPE_LABEL: Record<CalendarEventType, string> = {
    meeting: 'Meeting',
    follow_up: 'Follow-up',
    deadline: 'Deadline',
    reminder: 'Reminder',
    other: 'Other',
};

export interface CalendarItem {
    id: string;
    source: 'event' | 'task' | 'lead' | 'lead_activity' | 'followup' | 'project';
    title: string;
    subtitle?: string;
    startAt: number;
    endAt: number;
    allDay: boolean;
    type: CalendarEventType;
    color: string;
    entityType?: 'lead' | 'task' | 'project';
    entityId?: string;
    completed?: boolean;
}

export interface CalendarEventInput {
    title: string;
    description?: string;
    location?: string;
    type: CalendarEventType;
    startAt: number;
    endAt: number;
    allDay?: boolean;
    leadId?: string | null;
    projectId?: string | null;
    taskId?: string | null;
}

const EVENT_COLORS: Record<CalendarEventType, string> = {
    meeting: '#0071e3',
    follow_up: '#ff9f0a',
    deadline: '#ff3b30',
    reminder: '#8e8e93',
    other: '#5e5ce6',
};

async function validateAssociations(workspaceId: string, input: CalendarEventInput): Promise<void> {
    if (input.leadId) {
        const lead = await db.leads.get(input.leadId);
        if (!lead || lead.workspaceId !== workspaceId) throw new AppError('VALIDATION', 'Lead not found in this workspace.');
    }
    if (input.projectId) {
        const project = await db.projects.get(input.projectId);
        if (!project || project.workspaceId !== workspaceId) throw new AppError('VALIDATION', 'Project not found in this workspace.');
    }
    if (input.taskId) {
        const task = await db.tasks.get(input.taskId);
        if (!task || task.workspaceId !== workspaceId) throw new AppError('VALIDATION', 'Task not found in this workspace.');
    }
}

export async function createCalendarEvent(workspaceId: string, input: CalendarEventInput): Promise<CalendarEvent> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const title = required(input.title, 'Event title', 200);
    const type = oneOf(input.type, EVENT_TYPES, 'Event type');
    const startAt = numberValue(input.startAt, 'Start time', 0, Number.MAX_SAFE_INTEGER);
    const endAt = numberValue(input.endAt, 'End time', 0, Number.MAX_SAFE_INTEGER);
    if (endAt < startAt) throw new AppError('VALIDATION', 'End time cannot be before the start time.');
    await validateAssociations(workspaceId, input);

    const event: CalendarEvent = {
        id: crypto.randomUUID(),
        workspaceId,
        title,
        description: optional(input.description, 'Description', 4000),
        location: optional(input.location, 'Location', 200),
        type,
        startAt,
        endAt,
        allDay: input.allDay ? 1 : 0,
        leadId: input.leadId || undefined,
        projectId: input.projectId || undefined,
        taskId: input.taskId || undefined,
        createdBy: actor.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    await db.calendarEvents.add(event);
    if (input.leadId || input.projectId || input.taskId) {
        await logActivity({
            workspaceId,
            userId: actor.id,
            entityType: input.leadId ? 'lead' : input.projectId ? 'project' : 'task',
            entityId: (input.leadId || input.projectId || input.taskId)!,
            action: 'event_created',
            title: `Scheduled ${EVENT_TYPE_LABEL[type].toLowerCase()}: ${title}`,
        });
    }
    return event;
}

export async function getCalendarEvent(eventId: string): Promise<CalendarEvent> {
    const actor = await requireUser();
    const event = await db.calendarEvents.get(eventId);
    if (!event) throw new AppError('NOT_FOUND', 'Event not found.');
    await assertWorkspaceAccess(actor, event.workspaceId);
    return event;
}

export async function updateCalendarEvent(eventId: string, input: CalendarEventInput): Promise<CalendarEvent> {
    const actor = await requireUser();
    const existing = await db.calendarEvents.get(eventId);
    if (!existing) throw new AppError('NOT_FOUND', 'Event not found.');
    await assertWorkspaceAccess(actor, existing.workspaceId);
    if (actor.role !== 'admin' && existing.createdBy !== actor.id) {
        throw new AppError('FORBIDDEN', 'You can only edit events you created.');
    }
    const title = required(input.title, 'Event title', 200);
    const type = oneOf(input.type, EVENT_TYPES, 'Event type');
    const startAt = numberValue(input.startAt, 'Start time', 0, Number.MAX_SAFE_INTEGER);
    const endAt = numberValue(input.endAt, 'End time', 0, Number.MAX_SAFE_INTEGER);
    if (endAt < startAt) throw new AppError('VALIDATION', 'End time cannot be before the start time.');
    await validateAssociations(existing.workspaceId, input);

    const updated: CalendarEvent = {
        ...existing,
        title,
        description: optional(input.description, 'Description', 4000),
        location: optional(input.location, 'Location', 200),
        type,
        startAt,
        endAt,
        allDay: input.allDay ? 1 : 0,
        leadId: input.leadId || undefined,
        projectId: input.projectId || undefined,
        taskId: input.taskId || undefined,
        updatedAt: Date.now(),
    };
    await db.calendarEvents.put(updated);
    return updated;
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
    const actor = await requireUser();
    const event = await db.calendarEvents.get(eventId);
    if (!event) throw new AppError('NOT_FOUND', 'Event not found.');
    await assertWorkspaceAccess(actor, event.workspaceId);
    if (actor.role !== 'admin' && event.createdBy !== actor.id) {
        throw new AppError('FORBIDDEN', 'You can only delete events you created.');
    }
    await db.calendarEvents.delete(eventId);
}

function dateMs(date: string): number {
    return new Date(`${date}T00:00:00`).getTime();
}

export async function getCalendarItems(workspaceId: string, rangeStart: number, rangeEnd: number): Promise<CalendarItem[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    const startKey = dateKey(rangeStart);
    const endKey = dateKey(rangeEnd);

    const [events, tasks, leads, leadActivities, followUps, projects, projectMilestones] = await Promise.all([
        db.calendarEvents
            .where('[workspaceId+startAt]')
            .between([workspaceId, rangeStart], [workspaceId, rangeEnd])
            .toArray(),
        db.tasks.where('workspaceId').equals(workspaceId).toArray(),
        db.leads.where('workspaceId').equals(workspaceId).toArray(),
        db.leadActivities.where('workspaceId').equals(workspaceId).toArray(),
        db.followUps.where('workspaceId').equals(workspaceId).toArray(),
        db.projects.where('workspaceId').equals(workspaceId).toArray(),
        db.projectMilestones.where('workspaceId').equals(workspaceId).toArray(),
    ]);

    const items: CalendarItem[] = [];

    for (const event of events) {
        items.push({
            id: event.id,
            source: 'event',
            title: event.title,
            subtitle: event.location,
            startAt: event.startAt,
            endAt: event.endAt,
            allDay: event.allDay === 1,
            type: event.type,
            color: EVENT_COLORS[event.type],
            entityType: event.leadId ? 'lead' : event.projectId ? 'project' : event.taskId ? 'task' : undefined,
            entityId: event.leadId || event.projectId || event.taskId,
        });
    }

    const taskItems = tasks
        .filter(t => t.dueDate && t.dueDate >= startKey && t.dueDate <= endKey && t.status !== 'cancelled')
        .map(task => ({
            id: `task-${task.id}`,
            source: 'task' as const,
            title: task.title,
            subtitle: 'Task deadline',
            startAt: dateMs(task.dueDate!),
            endAt: dateMs(task.dueDate!) + 86_400_000 - 1,
            allDay: true,
            type: 'deadline' as const,
            color: task.status === 'completed' ? '#8e8e93' : '#ff9f0a',
            entityType: 'task' as const,
            entityId: task.id,
            completed: task.status === 'completed',
        }));
    items.push(...taskItems);

    const followUpItems = followUps
        .filter(item => item.status === 'pending' && item.dueAt >= rangeStart && item.dueAt <= rangeEnd)
        .map(item => {
            const lead = item.entityType === 'lead' ? leads.find(record => record.id === item.entityId) : undefined;
            const project = item.entityType === 'project' ? projects.find(record => record.id === item.entityId) : undefined;
            const task = item.entityType === 'task' ? tasks.find(record => record.id === item.entityId) : undefined;
            const entityTitle = lead?.name || project?.name || task?.title || 'Record';
            const entityTitleOnly: 'lead' | 'task' | 'project' | undefined = item.entityType === 'lead' || item.entityType === 'task' || item.entityType === 'project'
                ? item.entityType
                : undefined;
            return {
                id: `followup-${item.id}`,
                source: 'followup' as const,
                title: item.title,
                subtitle: `${entityTitle} · Follow-up`,
                startAt: item.dueAt,
                endAt: item.dueAt + 30 * 60_000,
                allDay: false,
                type: 'follow_up' as const,
                color: item.dueAt < Date.now() ? '#ff3b30' : '#34c759',
                entityType: entityTitleOnly,
                entityId: entityTitleOnly ? item.entityId : undefined,
            };
        });
    items.push(...followUpItems);

    const leadsWithFollowUps = new Set(followUps.filter(item => item.status === 'pending' && item.entityType === 'lead').map(item => item.entityId));
    const legacyLeadFollowUps = leads
        .filter(l => !l.archived && l.nextFollowUpAt && l.nextFollowUpAt >= rangeStart && l.nextFollowUpAt <= rangeEnd && !leadsWithFollowUps.has(l.id))
        .map(lead => ({
            id: `lead-${lead.id}`,
            source: 'lead' as const,
            title: `Follow up with ${lead.name}`,
            subtitle: lead.company || 'Lead follow-up',
            startAt: lead.nextFollowUpAt!,
            endAt: lead.nextFollowUpAt! + 30 * 60_000,
            allDay: false,
            type: 'follow_up' as const,
            color: '#34c759',
            entityType: 'lead' as const,
            entityId: lead.id,
        }));
    items.push(...legacyLeadFollowUps);

    const projectMilestoneItems = projectMilestones
        .filter(milestone => milestone.dueDate >= startKey && milestone.dueDate <= endKey)
        .map(milestone => {
            const project = projects.find(record => record.id === milestone.projectId);
            return {
                id: `milestone-${milestone.id}`,
                source: 'project' as const,
                title: milestone.title,
                subtitle: project ? `${project.name} · Milestone` : 'Project milestone',
                startAt: dateMs(milestone.dueDate),
                endAt: dateMs(milestone.dueDate) + 86_400_000 - 1,
                allDay: true,
                type: 'deadline' as const,
                color: milestone.completed === 1 ? '#8e8e93' : '#5e5ce6',
                entityType: 'project' as const,
                entityId: milestone.projectId,
                completed: milestone.completed === 1,
            };
        });
    items.push(...projectMilestoneItems);

    const activityItems = leadActivities
        .filter(a => (a.type === 'meeting' || a.type === 'follow_up') && a.occurredAt >= rangeStart && a.occurredAt <= rangeEnd)
        .map(activity => {
            const lead = leads.find(l => l.id === activity.leadId);
            return {
                id: `activity-${activity.id}`,
                source: 'lead_activity' as const,
                title: activity.subject,
                subtitle: lead ? `${lead.name} · ${activity.type === 'meeting' ? 'Meeting' : 'Follow-up'}` : 'Lead activity',
                startAt: activity.occurredAt,
                endAt: activity.occurredAt + 30 * 60_000,
                allDay: false,
                type: activity.type as CalendarEventType,
                color: '#30b0c7',
                entityType: 'lead' as const,
                entityId: activity.leadId,
            };
        });
    items.push(...activityItems);

    return items.sort((a, b) => a.startAt - b.startAt);
}

export async function getMyUpcoming(workspaceId: string, userId: string, days = 7): Promise<CalendarItem[]> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const end = start + days * 86_400_000 - 1;
    const items = await getCalendarItems(workspaceId, start, end);
    const mine = await db.tasks.where('assigneeId').equals(userId).toArray();
    const myTaskIds = new Set(mine.map(t => t.id));
    return items.filter(item => item.source !== 'task' || (item.entityId && myTaskIds.has(item.entityId)));
}
