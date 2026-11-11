import { db, type Lead, type Project, type Task, type UserRole } from '../db';
import { requireUser, type SessionUser } from './auth';
import { AppError } from './errors';

export async function requireAdmin(): Promise<SessionUser> {
    const user = await requireUser();
    if (user.role !== 'admin') throw new AppError('FORBIDDEN', 'This action requires an admin account.');
    return user;
}

export async function workspaceRole(user: SessionUser, workspaceId: string): Promise<'admin' | 'owner' | 'member'> {
    if (user.role === 'admin') return 'admin';
    const membership = await db.workspaceMembers
        .where('[workspaceId+userId]')
        .equals([workspaceId, user.id])
        .first();
    if (!membership) throw new AppError('FORBIDDEN', 'You do not have access to this workspace.');
    return membership.role;
}

export async function assertWorkspaceAccess(user: SessionUser, workspaceId: string): Promise<void> {
    await workspaceRole(user, workspaceId);
}

export async function assertLeadEdit(user: SessionUser, lead: Lead): Promise<void> {
    if (user.role === 'admin') return;
    if (lead.ownerId === user.id || lead.createdBy === user.id) return;
    throw new AppError('FORBIDDEN', 'Members can only edit leads they own.');
}

export async function assertTaskEdit(user: SessionUser, task: Task): Promise<void> {
    if (user.role === 'admin') return;
    if (task.assigneeId === user.id || task.createdBy === user.id) return;
    throw new AppError('FORBIDDEN', 'You can only edit tasks assigned to you or created by you.');
}

export async function assertProjectEdit(user: SessionUser, project: Project): Promise<void> {
    if (user.role === 'admin' || project.ownerId === user.id || project.createdBy === user.id) return;
    throw new AppError('FORBIDDEN', 'Only the project owner, creator or an admin can edit this project.');
}

export async function assertProjectDelete(user: SessionUser, project: Project): Promise<void> {
    if (user.role === 'admin' || project.createdBy === user.id) return;
    throw new AppError('FORBIDDEN', 'Only the project creator or an admin can delete this project.');
}

export async function assertTaskDelete(user: SessionUser, task: Task): Promise<void> {
    if (user.role === 'admin') return;
    if (task.createdBy === user.id) return;
    throw new AppError('FORBIDDEN', 'Only the task creator or an admin can delete this task.');
}

export async function assertRole(user: SessionUser, allowed: UserRole[]): Promise<void> {
    if (!allowed.includes(user.role)) throw new AppError('FORBIDDEN', 'You do not have permission to do that.');
}
