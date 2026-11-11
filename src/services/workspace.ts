import {
    db,
    DEFAULT_STAGES,
    DEFAULT_WORKSPACE_ID,
    type Workspace,
    type MemberRole,
} from '../db';
import { requireUser, type SessionUser, publicUser } from './auth';
import { AppError } from './errors';
import { assertWorkspaceAccess, requireAdmin } from './permissions';
import { optional, required } from './validation';

export interface WorkspaceWithRole extends Workspace {
    role: 'admin' | 'owner' | 'member';
    memberCount: number;
}

export const ACTIVE_WORKSPACE_KEY = 'ninai_active_workspace';

export async function listWorkspaces(): Promise<WorkspaceWithRole[]> {
    const user = await requireUser();
    const memberships = user.role === 'admin'
        ? await db.workspaceMembers.toArray()
        : await db.workspaceMembers.where('userId').equals(user.id).toArray();
    const membershipMap = new Map(memberships.filter(m => m.userId === user.id).map(m => [m.workspaceId, m]));

    const workspaces = user.role === 'admin'
        ? await db.workspaces.toArray()
        : (await db.workspaces.bulkGet(Array.from(new Set(memberships.map(m => m.workspaceId))))).filter(Boolean) as Workspace[];

    const counts = await db.workspaceMembers.toArray();
    const countMap = new Map<string, number>();
    counts.forEach(m => countMap.set(m.workspaceId, (countMap.get(m.workspaceId) || 0) + 1));

    return workspaces
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(ws => ({
            ...ws,
            role: user.role === 'admin' ? 'admin' : (membershipMap.get(ws.id)?.role || 'member'),
            memberCount: countMap.get(ws.id) || 0,
        }));
}

export function getStoredWorkspaceId(): string {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY) || DEFAULT_WORKSPACE_ID;
}

export function storeWorkspaceId(workspaceId: string): void {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
}

export async function resolveActiveWorkspace(_user: SessionUser): Promise<WorkspaceWithRole | null> {
    const workspaces = await listWorkspaces();
    if (workspaces.length === 0) return null;
    const stored = getStoredWorkspaceId();
    const active = workspaces.find(w => w.id === stored) || workspaces[0];
    if (active.id !== stored) storeWorkspaceId(active.id);
    return active;
}

async function createDefaultNotesFolder(workspaceId: string, ownerId: string): Promise<void> {
    const existing = await db.folders.where('workspaceId').equals(workspaceId).first();
    if (existing) return;
    await db.folders.add({
        id: crypto.randomUUID(),
        name: 'Notes',
        icon: 'Folder',
        workspaceId,
        order: 0,
    });
    void ownerId;
}

export async function createWorkspace(input: { name: string; description?: string }): Promise<WorkspaceWithRole> {
    const actor = await requireAdmin();
    const name = required(input.name, 'Workspace name', 80);
    const description = optional(input.description, 'Description', 500);
    const now = Date.now();
    const workspace: Workspace = {
        id: crypto.randomUUID(),
        name,
        description,
        ownerId: actor.id,
        createdAt: now,
    };

    await db.transaction('rw', [db.workspaces, db.workspaceMembers, db.leadStages, db.folders], async () => {
        await db.workspaces.add(workspace);
        await db.workspaceMembers.add({
            id: crypto.randomUUID(),
            workspaceId: workspace.id,
            userId: actor.id,
            role: 'owner',
            createdAt: now,
        });
        await db.leadStages.bulkAdd(DEFAULT_STAGES.map(stage => ({
            ...stage,
            id: `${stage.id}_${workspace.id}`,
            workspaceId: workspace.id,
        })));
        await db.folders.add({
            id: crypto.randomUUID(),
            name: 'Notes',
            icon: 'Folder',
            workspaceId: workspace.id,
            order: 0,
        });
    });

    return { ...workspace, role: 'admin', memberCount: 1 };
}

export async function updateWorkspace(workspaceId: string, input: { name: string; description?: string }): Promise<void> {
    const actor = await requireUser();
    const role = await assertWorkspaceAccess(actor, workspaceId).then(() => actor.role === 'admin' ? 'admin' : null);
    const membership = await db.workspaceMembers.where('[workspaceId+userId]').equals([workspaceId, actor.id]).first();
    if (role !== 'admin' && membership?.role !== 'owner') {
        throw new AppError('FORBIDDEN', 'Only workspace owners or admins can edit the workspace.');
    }

    const name = required(input.name, 'Workspace name', 80);
    const description = optional(input.description, 'Description', 500);
    await db.workspaces.update(workspaceId, { name, description });
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
    const actor = await requireAdmin();
    if (workspaceId === DEFAULT_WORKSPACE_ID) {
        throw new AppError('CONFLICT', 'The default workspace cannot be deleted.');
    }
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) throw new AppError('NOT_FOUND', 'Workspace not found.');
    if (workspace.ownerId !== actor.id) {
        throw new AppError('FORBIDDEN', 'Only the workspace owner can delete it.');
    }

    await db.transaction('rw', [
        db.workspaces, db.workspaceMembers, db.leadStages, db.leads, db.leadActivities,
        db.projects, db.projectMembers, db.projectLeads, db.projectMilestones, db.tasks,
        db.subtasks, db.taskComments, db.calendarEvents, db.tags, db.recordTags,
        db.noteLinks, db.notifications, db.activities, db.notes, db.folders,
        db.followUps, db.workspaceVersions, db.syncState,
    ], async () => {
        await db.workspaces.delete(workspaceId);
        await db.workspaceMembers.where('workspaceId').equals(workspaceId).delete();
        await db.leadStages.where('workspaceId').equals(workspaceId).delete();
        const projectIds = (await db.projects.where('workspaceId').equals(workspaceId).toArray()).map(p => p.id);
        const taskIds = (await db.tasks.where('workspaceId').equals(workspaceId).toArray()).map(t => t.id);
        await db.leads.where('workspaceId').equals(workspaceId).delete();
        await db.leadActivities.where('workspaceId').equals(workspaceId).delete();
        await db.projects.where('workspaceId').equals(workspaceId).delete();
        await db.tasks.where('workspaceId').equals(workspaceId).delete();
        if (projectIds.length) {
            await db.projectMembers.where('projectId').anyOf(projectIds).delete();
            await db.projectLeads.where('projectId').anyOf(projectIds).delete();
            await db.projectMilestones.where('projectId').anyOf(projectIds).delete();
        }
        if (taskIds.length) {
            await db.subtasks.where('taskId').anyOf(taskIds).delete();
            await db.taskComments.where('taskId').anyOf(taskIds).delete();
        }
        await db.calendarEvents.where('workspaceId').equals(workspaceId).delete();
        await db.tags.where('workspaceId').equals(workspaceId).delete();
        await db.recordTags.where('workspaceId').equals(workspaceId).delete();
        await db.noteLinks.where('workspaceId').equals(workspaceId).delete();
        await db.notifications.where('workspaceId').equals(workspaceId).delete();
        await db.activities.where('workspaceId').equals(workspaceId).delete();
        await db.notes.where('workspaceId').equals(workspaceId).delete();
        await db.folders.where('workspaceId').equals(workspaceId).delete();
        await db.followUps.where('workspaceId').equals(workspaceId).delete();
        await db.workspaceVersions.where('workspaceId').equals(workspaceId).delete();
        await db.syncState.where('workspaceId').equals(workspaceId).delete();
    });

    if (getStoredWorkspaceId() === workspaceId) storeWorkspaceId(DEFAULT_WORKSPACE_ID);
}

export interface WorkspaceUser {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'member' | 'owner';
    avatarColor: string;
    active: number;
    membershipId?: string;
}

export async function listWorkspaceUsers(workspaceId: string): Promise<WorkspaceUser[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    const members = await db.workspaceMembers.where('workspaceId').equals(workspaceId).toArray();
    const users = await db.users.bulkGet(members.map(m => m.userId));
    const userMap = new Map(users.filter(Boolean).map(u => [u!.id, u!]));

    return members
        .map(m => {
            const user = userMap.get(m.userId);
            if (!user) return null;
            const safe = publicUser(user);
            return {
                id: safe.id,
                name: safe.name,
                email: safe.email,
                role: m.role === 'owner' ? 'owner' as const : safe.role,
                avatarColor: safe.avatarColor,
                active: safe.active,
                membershipId: m.id,
            };
        })
        .filter(Boolean) as WorkspaceUser[];
}

export async function addWorkspaceMember(workspaceId: string, userId: string, role: MemberRole = 'member'): Promise<void> {
    const actor = await requireAdmin();
    await assertWorkspaceAccess(actor, workspaceId);
    const target = await db.users.get(userId);
    if (!target) throw new AppError('NOT_FOUND', 'User not found.');

    const existing = await db.workspaceMembers
        .where('[workspaceId+userId]')
        .equals([workspaceId, userId])
        .first();
    if (existing) throw new AppError('CONFLICT', 'That user is already a member of this workspace.');

    await db.workspaceMembers.add({
        id: crypto.randomUUID(),
        workspaceId,
        userId,
        role,
        createdAt: Date.now(),
    });
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
    const actor = await requireAdmin();
    if (userId === actor.id) throw new AppError('CONFLICT', 'You cannot remove yourself from the workspace.');
    const workspace = await db.workspaces.get(workspaceId);
    if (workspace?.ownerId === userId) throw new AppError('CONFLICT', 'The workspace owner cannot be removed.');
    await db.workspaceMembers
        .where('[workspaceId+userId]')
        .equals([workspaceId, userId])
        .delete();
}

export async function listNonMembers(workspaceId: string): Promise<WorkspaceUser[]> {
    await requireAdmin();
    const members = await db.workspaceMembers.where('workspaceId').equals(workspaceId).toArray();
    const memberIds = new Set(members.map(m => m.userId));
    const users = await db.users.toArray();
    return users
        .filter(u => !memberIds.has(u.id))
        .map(publicUser)
        .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, avatarColor: u.avatarColor, active: u.active }));
}

export async function getWorkspaceMemberIds(workspaceId: string): Promise<Set<string>> {
    const members = await db.workspaceMembers.where('workspaceId').equals(workspaceId).toArray();
    return new Set(members.map(m => m.userId));
}

export interface WorkspaceStats {
    notes: number;
    folders: number;
    leads: number;
    leadActivities: number;
    projects: number;
    tasks: number;
    followUps: number;
    events: number;
    members: number;
    activities: number;
}

export async function getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const [notes, folders, leads, leadActivities, projects, tasks, followUps, events, members, activities] = await Promise.all([
        db.notes.where('workspaceId').equals(workspaceId).count(),
        db.folders.where('workspaceId').equals(workspaceId).count(),
        db.leads.where('workspaceId').equals(workspaceId).count(),
        db.leadActivities.where('workspaceId').equals(workspaceId).count(),
        db.projects.where('workspaceId').equals(workspaceId).count(),
        db.tasks.where('workspaceId').equals(workspaceId).count(),
        db.followUps.where('workspaceId').equals(workspaceId).count(),
        db.calendarEvents.where('workspaceId').equals(workspaceId).count(),
        db.workspaceMembers.where('workspaceId').equals(workspaceId).count(),
        db.activities.where('workspaceId').equals(workspaceId).count(),
    ]);
    return { notes, folders, leads, leadActivities, projects, tasks, followUps, events, members, activities };
}

export async function exportWorkspaceJson(workspaceId: string): Promise<string> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const workspace = await db.workspaces.get(workspaceId);
    const notes = await db.notes.where('workspaceId').equals(workspaceId).toArray();
    const folders = await db.folders.where('workspaceId').equals(workspaceId).toArray();
    const leads = await db.leads.where('workspaceId').equals(workspaceId).toArray();
    const leadActivities = await db.leadActivities.where('workspaceId').equals(workspaceId).toArray();
    const tasks = await db.tasks.where('workspaceId').equals(workspaceId).toArray();
    const calendarEvents = await db.calendarEvents.where('workspaceId').equals(workspaceId).toArray();
    const leadStages = await db.leadStages.where('workspaceId').equals(workspaceId).toArray();
    const members = await db.workspaceMembers.where('workspaceId').equals(workspaceId).toArray();
    const activities = await db.activities.where('workspaceId').equals(workspaceId).toArray();
    const tags = await db.tags.where('workspaceId').equals(workspaceId).toArray();
    const projects = await db.projects.where('workspaceId').equals(workspaceId).toArray();
    const projectIds = projects.map(project => project.id);
    const taskIds = tasks.map(task => task.id);
    const [projectMembers, projectLeads, projectMilestones, followUps, subtasks, taskComments, recordTags, noteLinks, notifications] = await Promise.all([
        projectIds.length ? db.projectMembers.where('projectId').anyOf(projectIds).toArray() : Promise.resolve([]),
        projectIds.length ? db.projectLeads.where('projectId').anyOf(projectIds).toArray() : Promise.resolve([]),
        db.projectMilestones.where('workspaceId').equals(workspaceId).toArray(),
        db.followUps.where('workspaceId').equals(workspaceId).toArray(),
        taskIds.length ? db.subtasks.where('taskId').anyOf(taskIds).toArray() : Promise.resolve([]),
        taskIds.length ? db.taskComments.where('taskId').anyOf(taskIds).toArray() : Promise.resolve([]),
        db.recordTags.where('workspaceId').equals(workspaceId).toArray(),
        db.noteLinks.where('workspaceId').equals(workspaceId).toArray(),
        db.notifications.where('workspaceId').equals(workspaceId).toArray(),
    ]);

    return JSON.stringify({
        app: 'NINAI',
        exportedAt: new Date().toISOString(),
        workspace,
        leadStages,
        members,
        notes,
        folders,
        leads,
        leadActivities,
        projects,
        projectMembers,
        projectLeads,
        projectMilestones,
        tasks,
        subtasks,
        taskComments,
        followUps,
        calendarEvents,
        tags,
        recordTags,
        noteLinks,
        notifications,
        activities,
    }, null, 2);
}

export { createDefaultNotesFolder };
