import {
    db,
    type Lead,
    type Priority,
    type Project,
    type ProjectLead,
    type ProjectMember,
    type ProjectMilestone,
    type ProjectStatus,
    type Task,
} from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertProjectDelete, assertProjectEdit, assertWorkspaceAccess } from './permissions';
import { logActivity } from './activity';
import { assertDateInput, oneOf, optional, PRIORITIES, required } from './validation';

export const PROJECT_STATUSES: ProjectStatus[] = ['not_started', 'planning', 'in_progress', 'on_hold', 'completed', 'cancelled'];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
    not_started: 'Not started',
    planning: 'Planning',
    in_progress: 'In progress',
    on_hold: 'On hold',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

export interface ProjectWithMeta extends Project {
    ownerName: string;
    ownerColor: string;
    memberCount: number;
    leadCount: number;
    taskCount: number;
    taskDoneCount: number;
    milestoneCount: number;
    milestoneDoneCount: number;
    progress: number;
    nextMilestone?: ProjectMilestone;
}

export interface ProjectDetailData {
    project: Project;
    ownerName: string;
    ownerColor: string;
    members: ProjectMember[];
    memberIds: string[];
    leads: Lead[];
    tasks: Task[];
    milestones: ProjectMilestone[];
}

export interface ProjectInput {
    name: string;
    description?: string;
    identifier?: string;
    ownerId?: string;
    startDate?: string;
    endDate?: string;
    status?: ProjectStatus;
    priority?: Priority;
    objectives?: string[];
    memberIds?: string[];
}

function cleanObjectives(values?: string[]): string[] {
    return (values || [])
        .map(value => value.trim())
        .filter(Boolean)
        .slice(0, 12)
        .map(value => value.slice(0, 240));
}

async function assertMember(workspaceId: string, userId?: string | null): Promise<void> {
    if (!userId) return;
    const membership = await db.workspaceMembers.where('[workspaceId+userId]').equals([workspaceId, userId]).first();
    if (!membership) throw new AppError('VALIDATION', 'The selected person is not a member of this workspace.');
}

async function makeIdentifier(workspaceId: string, name: string, existingId?: string): Promise<string> {
    const base = name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, 6) || 'PROJ';
    const projects = await db.projects.where('workspaceId').equals(workspaceId).toArray();
    let index = 1;
    let candidate = `${base}-${String(index).padStart(2, '0')}`;
    while (projects.some(project => project.identifier === candidate && project.id !== existingId)) {
        index++;
        candidate = `${base}-${String(index).padStart(2, '0')}`;
    }
    return candidate;
}

function normalizeIdentifier(value: string): string {
    const normalized = value.trim().toUpperCase().replace(/\s+/g, '-');
    if (!/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(normalized)) {
        throw new AppError('VALIDATION', 'Use letters, numbers and hyphens for the project identifier (max 20 characters).');
    }
    return normalized;
}

async function assertIdentifierAvailable(workspaceId: string, identifier: string, existingId?: string): Promise<void> {
    const projects = await db.projects.where('workspaceId').equals(workspaceId).toArray();
    if (projects.some(project => project.identifier === identifier && project.id !== existingId)) {
        throw new AppError('VALIDATION', `Project identifier ${identifier} is already in use.`);
    }
}

function progressFor(taskCount: number, taskDoneCount: number, milestoneCount: number, milestoneDoneCount: number): number {
    const total = taskCount + milestoneCount;
    if (total === 0) return 0;
    return Math.round(((taskDoneCount + milestoneDoneCount) / total) * 100);
}

export async function listProjects(workspaceId: string, includeArchived = false): Promise<ProjectWithMeta[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    const projects = await db.projects.where('workspaceId').equals(workspaceId).toArray();
    const filtered = includeArchived ? projects : projects.filter(project => !project.archived);
    const projectIds = filtered.map(project => project.id);

    const [users, members, leads, tasks, milestones] = await Promise.all([
        db.users.bulkGet(Array.from(new Set(filtered.map(project => project.ownerId)))),
        projectIds.length ? db.projectMembers.where('projectId').anyOf(projectIds).toArray() : Promise.resolve([]),
        projectIds.length ? db.projectLeads.where('projectId').anyOf(projectIds).toArray() : Promise.resolve([]),
        projectIds.length ? db.tasks.where('projectId').anyOf(projectIds).toArray() : Promise.resolve([]),
        projectIds.length ? db.projectMilestones.where('projectId').anyOf(projectIds).toArray() : Promise.resolve([]),
    ]);

    const userMap = new Map(users.filter(Boolean).map(user => [user!.id, user!]));

    return filtered
        .map(project => {
            const projectTasks = tasks.filter(task => task.projectId === project.id);
            const taskDoneCount = projectTasks.filter(task => task.status === 'completed').length;
            const projectMilestones = milestones
                .filter(milestone => milestone.projectId === project.id)
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
            const milestoneDoneCount = projectMilestones.filter(milestone => milestone.completed === 1).length;
            const owner = userMap.get(project.ownerId);
            return {
                ...project,
                ownerName: owner?.name || 'Unassigned',
                ownerColor: owner?.avatarColor || '#8e8e93',
                memberCount: members.filter(member => member.projectId === project.id).length,
                leadCount: leads.filter(link => link.projectId === project.id).length,
                taskCount: projectTasks.length,
                taskDoneCount,
                milestoneCount: projectMilestones.length,
                milestoneDoneCount,
                progress: progressFor(projectTasks.length, taskDoneCount, projectMilestones.length, milestoneDoneCount),
                nextMilestone: projectMilestones.find(milestone => milestone.completed === 0),
            };
        })
        .sort((a, b) => {
            if (a.status === 'completed' && b.status !== 'completed') return 1;
            if (b.status === 'completed' && a.status !== 'completed') return -1;
            return b.updatedAt - a.updatedAt;
        });
}

export async function getProject(projectId: string): Promise<Project> {
    const actor = await requireUser();
    const project = await db.projects.get(projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
    await assertWorkspaceAccess(actor, project.workspaceId);
    return project;
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetailData> {
    const actor = await requireUser();
    const project = await db.projects.get(projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
    await assertWorkspaceAccess(actor, project.workspaceId);

    const [owner, members, links, tasks, milestones] = await Promise.all([
        db.users.get(project.ownerId),
        db.projectMembers.where('projectId').equals(projectId).toArray(),
        db.projectLeads.where('projectId').equals(projectId).toArray(),
        db.tasks.where('projectId').equals(projectId).toArray(),
        db.projectMilestones.where('projectId').equals(projectId).toArray(),
    ]);
    const leads = (await db.leads.bulkGet(links.map(link => link.leadId))).filter(Boolean) as Lead[];

    return {
        project,
        ownerName: owner?.name || 'Unassigned',
        ownerColor: owner?.avatarColor || '#8e8e93',
        members,
        memberIds: members.map(member => member.userId),
        leads,
        tasks: tasks.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')),
        milestones: milestones.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    };
}

export async function createProject(workspaceId: string, input: ProjectInput): Promise<Project> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    const name = required(input.name, 'Project name', 160);
    const ownerId = input.ownerId || actor.id;
    await assertMember(workspaceId, ownerId);

    const startDate = assertDateInput(input.startDate, 'Start date');
    const endDate = assertDateInput(input.endDate, 'Target date');
    if (startDate && endDate && endDate < startDate) {
        throw new AppError('VALIDATION', 'The target date cannot be before the start date.');
    }

    const identifier = input.identifier?.trim()
        ? normalizeIdentifier(input.identifier)
        : await makeIdentifier(workspaceId, name);
    await assertIdentifierAvailable(workspaceId, identifier);

    const now = Date.now();
    const project: Project = {
        id: crypto.randomUUID(),
        workspaceId,
        name,
        description: optional(input.description, 'Description', 5000),
        identifier,
        ownerId,
        startDate,
        endDate,
        status: oneOf(input.status ?? 'planning', PROJECT_STATUSES, 'Project status'),
        priority: oneOf(input.priority ?? 'medium', PRIORITIES, 'Priority'),
        objectives: cleanObjectives(input.objectives),
        createdAt: now,
        updatedAt: now,
        archived: 0,
        createdBy: actor.id,
    };

    const memberIds = Array.from(new Set([ownerId, actor.id, ...(input.memberIds || [])]));
    for (const memberId of memberIds) await assertMember(workspaceId, memberId);
    await db.transaction('rw', [db.projects, db.projectMembers, db.activities], async () => {
        await db.projects.add(project);
        if (memberIds.length) {
            await db.projectMembers.bulkAdd(memberIds.map(userId => ({
                id: crypto.randomUUID(),
                projectId: project.id,
                userId,
                createdAt: now,
            })));
        }
    });

    await logActivity({
        workspaceId,
        userId: actor.id,
        entityType: 'project',
        entityId: project.id,
        action: 'created',
        title: `Created project ${project.name}`,
    });
    return project;
}

export async function updateProject(projectId: string, input: Partial<ProjectInput>): Promise<Project> {
    const actor = await requireUser();
    const existing = await db.projects.get(projectId);
    if (!existing) throw new AppError('NOT_FOUND', 'Project not found.');
    await assertWorkspaceAccess(actor, existing.workspaceId);
    await assertProjectEdit(actor, existing);

    const name = required(input.name ?? existing.name, 'Project name', 160);
    const startDate = assertDateInput(input.startDate ?? existing.startDate, 'Start date');
    const endDate = assertDateInput(input.endDate ?? existing.endDate, 'Target date');
    if (startDate && endDate && endDate < startDate) {
        throw new AppError('VALIDATION', 'The target date cannot be before the start date.');
    }
    const ownerId = input.ownerId === undefined ? existing.ownerId : input.ownerId;
    await assertMember(existing.workspaceId, ownerId);

    const identifier = input.identifier === undefined
        ? existing.identifier
        : input.identifier.trim()
            ? normalizeIdentifier(input.identifier)
            : existing.identifier;
    if (identifier !== existing.identifier) {
        await assertIdentifierAvailable(existing.workspaceId, identifier, existing.id);
    }

    const updated: Project = {
        ...existing,
        name,
        description: input.description === undefined ? existing.description : optional(input.description, 'Description', 5000),
        identifier,
        ownerId,
        startDate,
        endDate,
        status: input.status === undefined ? existing.status : oneOf(input.status, PROJECT_STATUSES, 'Project status'),
        priority: input.priority === undefined ? existing.priority : oneOf(input.priority, PRIORITIES, 'Priority'),
        objectives: input.objectives === undefined ? existing.objectives : cleanObjectives(input.objectives),
        updatedAt: Date.now(),
    };
    await db.projects.put(updated);

    if (input.memberIds !== undefined) {
        const memberIds = Array.from(new Set([ownerId, actor.id, ...input.memberIds]));
        for (const memberId of memberIds) await assertMember(existing.workspaceId, memberId);
        const current = await db.projectMembers.where('projectId').equals(projectId).toArray();
        const currentIds = new Set(current.map(member => member.userId));
        const nextIds = new Set(memberIds);
        await db.projectMembers.where('projectId').equals(projectId).delete();
        await db.projectMembers.bulkAdd(memberIds.map(userId => ({
            id: current.find(member => member.userId === userId)?.id || crypto.randomUUID(),
            projectId,
            userId,
            createdAt: current.find(member => member.userId === userId)?.createdAt || Date.now(),
        })));
        void currentIds;
        void nextIds;
    }

    await logActivity({
        workspaceId: existing.workspaceId,
        userId: actor.id,
        entityType: 'project',
        entityId: projectId,
        action: existing.status !== updated.status ? 'status_changed' : 'updated',
        title: existing.status !== updated.status
            ? `Moved ${updated.name} to ${PROJECT_STATUS_LABEL[updated.status]}`
            : `Updated project ${updated.name}`,
    });
    return updated;
}

export async function archiveProject(projectId: string, archived: boolean): Promise<void> {
    const actor = await requireUser();
    const project = await db.projects.get(projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
    await assertWorkspaceAccess(actor, project.workspaceId);
    await assertProjectEdit(actor, project);
    await db.projects.update(projectId, { archived: archived ? 1 : 0, updatedAt: Date.now() });
    await logActivity({
        workspaceId: project.workspaceId,
        userId: actor.id,
        entityType: 'project',
        entityId: projectId,
        action: archived ? 'archived' : 'restored',
        title: `${archived ? 'Archived' : 'Restored'} project ${project.name}`,
    });
}

export async function deleteProject(projectId: string): Promise<void> {
    const actor = await requireUser();
    const project = await db.projects.get(projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
    await assertWorkspaceAccess(actor, project.workspaceId);
    await assertProjectDelete(actor, project);

    await db.transaction('rw', [
        db.projects, db.projectMembers, db.projectLeads, db.projectMilestones, db.tasks,
        db.calendarEvents, db.recordTags, db.noteLinks, db.activities, db.followUps, db.notifications,
    ], async () => {
        const tasks = await db.tasks.where('projectId').equals(projectId).toArray();
        await db.projects.delete(projectId);
        await db.projectMembers.where('projectId').equals(projectId).delete();
        await db.projectLeads.where('projectId').equals(projectId).delete();
        await db.projectMilestones.where('projectId').equals(projectId).delete();
        await db.tasks.where('projectId').equals(projectId).modify({ projectId: undefined });
        await db.calendarEvents.where('projectId').equals(projectId).modify({ projectId: undefined });
        await db.recordTags.where('[entityType+entityId]').equals(['project', projectId]).delete();
        await db.noteLinks.where('[entityType+entityId]').equals(['project', projectId]).delete();
        await db.activities.where('[entityType+entityId]').equals(['project', projectId]).delete();
        await db.followUps.where('[entityType+entityId]').equals(['project', projectId]).delete();
        for (const task of tasks) {
            await db.activities.where('[entityType+entityId]').equals(['task', task.id]).delete();
        }
    });
}

/* ------------------------------------------------------------------ */
/* Milestones                                                           */
/* ------------------------------------------------------------------ */

export async function listProjectMilestones(projectId: string): Promise<ProjectMilestone[]> {
    await getProject(projectId);
    return db.projectMilestones.where('projectId').equals(projectId).sortBy('dueDate');
}

export async function addProjectMilestone(projectId: string, input: { title: string; dueDate: string }): Promise<ProjectMilestone> {
    const actor = await requireUser();
    const project = await db.projects.get(projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
    await assertWorkspaceAccess(actor, project.workspaceId);
    const title = required(input.title, 'Milestone title', 200);
    const dueDate = assertDateInput(input.dueDate, 'Milestone date');
    if (!dueDate) throw new AppError('VALIDATION', 'Milestone date is required.');

    const milestone: ProjectMilestone = {
        id: crypto.randomUUID(),
        workspaceId: project.workspaceId,
        projectId,
        title,
        dueDate,
        completed: 0,
        createdAt: Date.now(),
    };
    await db.projectMilestones.add(milestone);
    await db.projects.update(projectId, { updatedAt: Date.now() });
    await logActivity({
        workspaceId: project.workspaceId,
        userId: actor.id,
        entityType: 'project',
        entityId: projectId,
        action: 'milestone_created',
        title: `Added milestone ${milestone.title} to ${project.name}`,
    });
    return milestone;
}

export async function toggleProjectMilestone(milestoneId: string): Promise<void> {
    const actor = await requireUser();
    const milestone = await db.projectMilestones.get(milestoneId);
    if (!milestone) throw new AppError('NOT_FOUND', 'Milestone not found.');
    const project = await db.projects.get(milestone.projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
    await assertWorkspaceAccess(actor, project.workspaceId);
    await db.projectMilestones.update(milestoneId, { completed: milestone.completed ? 0 : 1 });
    await db.projects.update(project.id, { updatedAt: Date.now() });
    await logActivity({
        workspaceId: project.workspaceId,
        userId: actor.id,
        entityType: 'project',
        entityId: project.id,
        action: milestone.completed ? 'milestone_reopened' : 'milestone_completed',
        title: `${milestone.completed ? 'Reopened' : 'Completed'} milestone ${milestone.title}`,
    });
}

export async function deleteProjectMilestone(milestoneId: string): Promise<void> {
    const actor = await requireUser();
    const milestone = await db.projectMilestones.get(milestoneId);
    if (!milestone) return;
    const project = await db.projects.get(milestone.projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
    await assertWorkspaceAccess(actor, project.workspaceId);
    await db.projectMilestones.delete(milestoneId);
    await db.projects.update(project.id, { updatedAt: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Linked leads                                                         */
/* ------------------------------------------------------------------ */

export async function listProjectsForLead(leadId: string): Promise<Project[]> {
    const actor = await requireUser();
    const lead = await db.leads.get(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, lead.workspaceId);
    const links = await db.projectLeads.where('leadId').equals(leadId).toArray();
    const projects = (await db.projects.bulkGet(links.map(link => link.projectId))).filter(Boolean) as Project[];
    return projects
        .filter(project => project.workspaceId === lead.workspaceId && !project.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function linkLeadToProject(projectId: string, leadId: string): Promise<ProjectLead> {
    const actor = await requireUser();
    const project = await db.projects.get(projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
    const lead = await db.leads.get(leadId);
    if (!lead || lead.workspaceId !== project.workspaceId) throw new AppError('NOT_FOUND', 'Lead not found.');
    await assertWorkspaceAccess(actor, project.workspaceId);

    const existing = await db.projectLeads.where('[projectId+leadId]').equals([projectId, leadId]).first();
    if (existing) return existing;
    const link: ProjectLead = {
        id: crypto.randomUUID(),
        projectId,
        leadId,
        createdAt: Date.now(),
    };
    await db.projectLeads.add(link);
    await logActivity({
        workspaceId: project.workspaceId,
        userId: actor.id,
        entityType: 'project',
        entityId: projectId,
        action: 'lead_linked',
        title: `Linked ${lead.name} to ${project.name}`,
    });
    return link;
}

export async function unlinkLeadFromProject(projectId: string, leadId: string): Promise<void> {
    const actor = await requireUser();
    const project = await db.projects.get(projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found.');
    await assertWorkspaceAccess(actor, project.workspaceId);
    await db.projectLeads.where('[projectId+leadId]').equals([projectId, leadId]).delete();
}
