import { db, type WorkspaceVersion, type WorkspaceVersionKind } from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertWorkspaceAccess } from './permissions';
import { optional } from './validation';

export interface WorkspaceVersionWithUser extends WorkspaceVersion {
    authorName: string;
}

interface SnapshotPayload {
    app: 'NINAI';
    format: 1;
    exportedAt: string;
    workspace: unknown;
    users: unknown[];
    workspaceMembers: unknown[];
    leadStages: unknown[];
    notes: unknown[];
    folders: unknown[];
    leads: unknown[];
    leadActivities: unknown[];
    projects: unknown[];
    projectMembers: unknown[];
    projectLeads: unknown[];
    projectMilestones: unknown[];
    tasks: unknown[];
    subtasks: unknown[];
    taskComments: unknown[];
    calendarEvents: unknown[];
    tags: unknown[];
    recordTags: unknown[];
    noteLinks: unknown[];
    notifications: unknown[];
    activities: unknown[];
    followUps: unknown[];
}

async function buildSnapshot(workspaceId: string): Promise<SnapData> {
    const [
        workspace, users, workspaceMembers, leadStages, notes, folders, leads, leadActivities,
        projects, projectMembers, projectLeads, projectMilestones, tasks, subtasks, taskComments,
        calendarEvents, tags, recordTags, noteLinks, notifications, activities, followUps,
    ] = await Promise.all([
        db.workspaces.get(workspaceId),
        db.users.toArray(),
        db.workspaceMembers.where('workspaceId').equals(workspaceId).toArray(),
        db.leadStages.where('workspaceId').equals(workspaceId).toArray(),
        db.notes.where('workspaceId').equals(workspaceId).toArray(),
        db.folders.where('workspaceId').equals(workspaceId).toArray(),
        db.leads.where('workspaceId').equals(workspaceId).toArray(),
        db.leadActivities.where('workspaceId').equals(workspaceId).toArray(),
        db.projects.where('workspaceId').equals(workspaceId).toArray(),
        db.projectMembers.toArray(),
        db.projectLeads.toArray(),
        db.projectMilestones.where('workspaceId').equals(workspaceId).toArray(),
        db.tasks.where('workspaceId').equals(workspaceId).toArray(),
        db.subtasks.toArray(),
        db.taskComments.toArray(),
        db.calendarEvents.where('workspaceId').equals(workspaceId).toArray(),
        db.tags.where('workspaceId').equals(workspaceId).toArray(),
        db.recordTags.where('workspaceId').equals(workspaceId).toArray(),
        db.noteLinks.where('workspaceId').equals(workspaceId).toArray(),
        db.notifications.where('workspaceId').equals(workspaceId).toArray(),
        db.activities.where('workspaceId').equals(workspaceId).toArray(),
        db.followUps.where('workspaceId').equals(workspaceId).toArray(),
    ]);

    const projectIds = new Set(projects.map(project => project.id));
    const taskIds = new Set(tasks.map(task => task.id));
    const memberUserIds = new Set(workspaceMembers.map(member => member.userId));

    const safeUsers = users
        .filter(user => memberUserIds.has(user.id))
        .map(user => {
            const { passwordHash, passwordSalt, ...safe } = user;
            void passwordHash;
            void passwordSalt;
            return safe;
        });

    const payload: SnapshotPayload = {
        app: 'NINAI',
        format: 1,
        exportedAt: new Date().toISOString(),
        workspace,
        users: safeUsers,
        workspaceMembers,
        leadStages,
        notes,
        folders,
        leads,
        leadActivities,
        projects,
        projectMembers: projectMembers.filter(member => projectIds.has(member.projectId)),
        projectLeads: projectLeads.filter(link => projectIds.has(link.projectId)),
        projectMilestones,
        tasks,
        subtasks: subtasks.filter(subtask => taskIds.has(subtask.taskId)),
        taskComments: taskComments.filter(comment => taskIds.has(comment.taskId)),
        calendarEvents,
        tags,
        recordTags,
        noteLinks,
        notifications,
        activities,
        followUps,
    };

    return {
        json: JSON.stringify(payload, null, 2),
        entityCount: notes.length + folders.length + leads.length + leadActivities.length + projects.length
            + projectMilestones.length + tasks.length + subtasks.length + taskComments.length
            + calendarEvents.length + tags.length + recordTags.length + noteLinks.length
            + notifications.length + activities.length + followUps.length,
    };
}

interface SnapData {
    json: string;
    entityCount: number;
}

export async function createWorkspaceVersion(
    workspaceId: string,
    message: string,
    kind: WorkspaceVersionKind = 'manual',
): Promise<WorkspaceVersion> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const cleanMessage = optional(message, 'Version message', 240) || 'Workspace snapshot';
    const snapshot = await buildSnapshot(workspaceId);
    const previous = (await db.workspaceVersions.where('workspaceId').equals(workspaceId).toArray())
        .sort((a, b) => b.createdAt - a.createdAt);

    const version: WorkspaceVersion = {
        id: crypto.randomUUID(),
        workspaceId,
        message: cleanMessage,
        kind,
        createdBy: actor.id,
        createdAt: Date.now(),
        parentId: previous[0]?.id,
        data: snapshot.json,
        size: new Blob([snapshot.json]).size,
        entityCount: snapshot.entityCount,
    };
    await db.workspaceVersions.add(version);

    await db.activities.add({
        id: crypto.randomUUID(),
        workspaceId,
        userId: actor.id,
        entityType: 'note',
        entityId: version.id,
        action: 'version_created',
        title: `Saved version “${cleanMessage}”`,
        metadata: kind,
        createdAt: Date.now(),
    });
    return version;
}

export async function listWorkspaceVersions(workspaceId: string, limit = 40): Promise<WorkspaceVersionWithUser[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const versions = await db.workspaceVersions
        .where('[workspaceId+createdAt]')
        .between([workspaceId, 0], [workspaceId, Number.MAX_SAFE_INTEGER])
        .reverse()
        .limit(limit)
        .toArray();
    const users = await db.users.bulkGet(Array.from(new Set(versions.map(version => version.createdBy))));
    const userMap = new Map(users.filter(Boolean).map(user => [user!.id, user!]));
    return versions.map(version => ({
        ...version,
        authorName: userMap.get(version.createdBy)?.name || 'Unknown user',
    }));
}

export async function getWorkspaceVersion(versionId: string): Promise<WorkspaceVersion> {
    const actor = await requireUser();
    const version = await db.workspaceVersions.get(versionId);
    if (!version) throw new AppError('NOT_FOUND', 'Version not found.');
    await assertWorkspaceAccess(actor, version.workspaceId);
    return version;
}

export async function restoreWorkspaceVersion(versionId: string): Promise<void> {
    const actor = await requireUser();
    const version = await db.workspaceVersions.get(versionId);
    if (!version) throw new AppError('NOT_FOUND', 'Version not found.');
    await assertWorkspaceAccess(actor, version.workspaceId);
    if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 'Only an admin can restore a workspace version.');

    let payload: SnapshotPayload;
    try {
        payload = JSON.parse(version.data) as SnapshotPayload;
    } catch {
        throw new AppError('VALIDATION', 'This version is corrupted and cannot be restored.');
    }
    if (payload.app !== 'NINAI' || !payload.workspace) {
        throw new AppError('VALIDATION', 'This file is not a NINAI workspace version.');
    }

    await createWorkspaceVersion(version.workspaceId, `Before restoring “${version.message}”`, 'automatic');

    const notes = (payload.notes || []).map((note: any) => ({
        ...note,
        updatedAt: note.updatedAt ? new Date(note.updatedAt) : new Date(),
        createdAt: note.createdAt ? new Date(note.createdAt) : undefined,
        reminders: Array.isArray(note.reminders)
            ? note.reminders.map((reminder: any) => ({
                ...reminder,
                dueAt: reminder.dueAt ? new Date(reminder.dueAt) : new Date(),
                completedAt: reminder.completedAt ? new Date(reminder.completedAt) : undefined,
            }))
            : note.reminders,
    }));

    const projectIds = new Set((payload.projects || []).map((project: any) => project.id));
    const taskIds = new Set((payload.tasks || []).map((task: any) => task.id));

    await db.transaction('rw', [
        db.notes, db.folders, db.leadStages, db.leads, db.leadActivities,
        db.projects, db.projectMembers, db.projectLeads, db.projectMilestones,
        db.tasks, db.subtasks, db.taskComments, db.calendarEvents, db.tags,
        db.recordTags, db.noteLinks, db.notifications, db.activities, db.followUps,
    ], async () => {
        const oldProjectIds = (await db.projects.where('workspaceId').equals(version.workspaceId).toArray()).map(project => project.id);
        const oldTaskIds = (await db.tasks.where('workspaceId').equals(version.workspaceId).toArray()).map(task => task.id);

        await db.notes.where('workspaceId').equals(version.workspaceId).delete();
        await db.folders.where('workspaceId').equals(version.workspaceId).delete();
        await db.leadStages.where('workspaceId').equals(version.workspaceId).delete();
        await db.leads.where('workspaceId').equals(version.workspaceId).delete();
        await db.leadActivities.where('workspaceId').equals(version.workspaceId).delete();
        await db.projects.where('workspaceId').equals(version.workspaceId).delete();
        if (oldProjectIds.length) {
            await db.projectMembers.where('projectId').anyOf(oldProjectIds).delete();
            await db.projectLeads.where('projectId').anyOf(oldProjectIds).delete();
        }
        await db.projectMilestones.where('workspaceId').equals(version.workspaceId).delete();
        await db.tasks.where('workspaceId').equals(version.workspaceId).delete();
        if (oldTaskIds.length) {
            await db.subtasks.where('taskId').anyOf(oldTaskIds).delete();
            await db.taskComments.where('taskId').anyOf(oldTaskIds).delete();
        }
        await db.calendarEvents.where('workspaceId').equals(version.workspaceId).delete();
        await db.tags.where('workspaceId').equals(version.workspaceId).delete();
        await db.recordTags.where('workspaceId').equals(version.workspaceId).delete();
        await db.noteLinks.where('workspaceId').equals(version.workspaceId).delete();
        await db.notifications.where('workspaceId').equals(version.workspaceId).delete();
        await db.activities.where('workspaceId').equals(version.workspaceId).delete();
        await db.followUps.where('workspaceId').equals(version.workspaceId).delete();

        if (notes.length) await db.notes.bulkPut(notes);
        if (payload.folders?.length) await db.folders.bulkPut(payload.folders as any);
        if (payload.leadStages?.length) await db.leadStages.bulkPut(payload.leadStages as any);
        if (payload.leads?.length) await db.leads.bulkPut(payload.leads as any);
        if (payload.leadActivities?.length) await db.leadActivities.bulkPut(payload.leadActivities as any);
        if (payload.projects?.length) await db.projects.bulkPut(payload.projects as any);
        if (payload.projectMembers?.length) {
            await db.projectMembers.bulkPut((payload.projectMembers as any[]).filter(member => projectIds.has(member.projectId)));
        }
        if (payload.projectLeads?.length) {
            await db.projectLeads.bulkPut((payload.projectLeads as any[]).filter(link => projectIds.has(link.projectId)));
        }
        if (payload.projectMilestones?.length) await db.projectMilestones.bulkPut(payload.projectMilestones as any);
        if (payload.tasks?.length) await db.tasks.bulkPut(payload.tasks as any);
        if (payload.subtasks?.length) {
            await db.subtasks.bulkPut((payload.subtasks as any[]).filter(subtask => taskIds.has(subtask.taskId)));
        }
        if (payload.taskComments?.length) {
            await db.taskComments.bulkPut((payload.taskComments as any[]).filter(comment => taskIds.has(comment.taskId)));
        }
        if (payload.calendarEvents?.length) await db.calendarEvents.bulkPut(payload.calendarEvents as any);
        if (payload.tags?.length) await db.tags.bulkPut(payload.tags as any);
        if (payload.recordTags?.length) await db.recordTags.bulkPut(payload.recordTags as any);
        if (payload.noteLinks?.length) await db.noteLinks.bulkPut(payload.noteLinks as any);
        if (payload.notifications?.length) await db.notifications.bulkPut(payload.notifications as any);
        if (payload.followUps?.length) await db.followUps.bulkPut(payload.followUps as any);
    });

    await db.activities.add({
        id: crypto.randomUUID(),
        workspaceId: version.workspaceId,
        userId: actor.id,
        entityType: 'note',
        entityId: version.id,
        action: 'version_restored',
        title: `Restored version “${version.message}”`,
        createdAt: Date.now(),
    });
}

export async function deleteWorkspaceVersion(versionId: string): Promise<void> {
    const actor = await requireUser();
    const version = await db.workspaceVersions.get(versionId);
    if (!version) return;
    await assertWorkspaceAccess(actor, version.workspaceId);
    if (actor.role !== 'admin') throw new AppError('FORBIDDEN', 'Only an admin can delete a workspace version.');
    await db.workspaceVersions.delete(versionId);
}

export async function exportWorkspaceVersionJson(versionId: string): Promise<{ filename: string; json: string }> {
    const version = await getWorkspaceVersion(versionId);
    const safe = version.message.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'snapshot';
    return {
        filename: `ninai-${new Date(version.createdAt).toISOString().slice(0, 10)}-${safe}.json`,
        json: version.data,
    };
}

export async function saveSnapshotFile(versionId: string): Promise<void> {
    const { filename, json } = await exportWorkspaceVersionJson(versionId);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}
