import { db, type Activity, type EntityType } from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertWorkspaceAccess } from './permissions';

export interface ActivityWithUser extends Activity {
    userName: string;
    userColor: string;
}

export async function logActivity(input: {
    workspaceId: string;
    userId: string;
    entityType: EntityType;
    entityId: string;
    action: string;
    title: string;
    metadata?: string;
}): Promise<void> {
    if (!input.workspaceId || !input.userId) return;
    await db.activities.add({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        title: input.title,
        metadata: input.metadata,
        createdAt: Date.now(),
    });
}

export async function listActivities(workspaceId: string, limit = 20): Promise<ActivityWithUser[]> {
    const user = await requireUser();
    await assertWorkspaceAccess(user, workspaceId);
    if (!workspaceId) throw new AppError('VALIDATION', 'No workspace selected.');

    const activities = await db.activities
        .where('[workspaceId+createdAt]')
        .between([workspaceId, 0], [workspaceId, Number.MAX_SAFE_INTEGER])
        .reverse()
        .limit(limit)
        .toArray();

    const userIds = Array.from(new Set(activities.map(a => a.userId)));
    const users = await db.users.bulkGet(userIds);
    const userMap = new Map(users.filter(Boolean).map(u => [u!.id, u!]));

    return activities.map(a => {
        const actor = userMap.get(a.userId);
        return {
            ...a,
            userName: actor?.name || 'Unknown user',
            userColor: actor?.avatarColor || '#8e8e93',
        };
    });
}

export async function listEntityActivities(
    workspaceId: string,
    entityType: EntityType,
    entityId: string,
    limit = 50,
): Promise<ActivityWithUser[]> {
    const user = await requireUser();
    await assertWorkspaceAccess(user, workspaceId);

    const activities = await db.activities
        .where('[entityType+entityId]')
        .equals([entityType, entityId])
        .reverse()
        .sortBy('createdAt');

    const sliced = activities.slice(0, limit);
    const userIds = Array.from(new Set(sliced.map(a => a.userId)));
    const users = await db.users.bulkGet(userIds);
    const userMap = new Map(users.filter(Boolean).map(u => [u!.id, u!]));

    return sliced.map(a => {
        const actor = userMap.get(a.userId);
        return {
            ...a,
            userName: actor?.name || 'Unknown user',
            userColor: actor?.avatarColor || '#8e8e93',
        };
    });
}
