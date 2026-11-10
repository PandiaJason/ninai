import { db, type EntityType, type Tag } from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertWorkspaceAccess } from './permissions';
import { colorFor, required } from './validation';

const TAG_COLORS = ['#0071e3', '#5e5ce6', '#30b0c7', '#34c759', '#ff9f0a', '#ff375f', '#af52de', '#8e8e93'];
let tagColorIndex = 0;

function nextColor(): string {
    return TAG_COLORS[tagColorIndex++ % TAG_COLORS.length];
}

export async function listTags(workspaceId: string): Promise<Tag[]> {
    const user = await requireUser();
    await assertWorkspaceAccess(user, workspaceId);
    return db.tags.where('workspaceId').equals(workspaceId).sortBy('name');
}

export async function setTagsForEntity(
    workspaceId: string,
    entityType: EntityType,
    entityId: string,
    names: string[],
): Promise<Tag[]> {
    const user = await requireUser();
    await assertWorkspaceAccess(user, workspaceId);

    const cleanNames = Array.from(new Set(
        names.map(n => n.trim()).filter(Boolean).map(n => n.slice(0, 40)),
    )).slice(0, 20);

    return db.transaction('rw', [db.tags, db.recordTags], async () => {
        const existing = await db.recordTags
            .where('[entityType+entityId]')
            .equals([entityType, entityId])
            .toArray();
        await db.recordTags.bulkDelete(existing.map(r => r.id));

        const result: Tag[] = [];
        for (const name of cleanNames) {
            const all = await db.tags.where('workspaceId').equals(workspaceId).toArray();
            let tag = all.find(t => t.name.toLowerCase() === name.toLowerCase());
            if (!tag) {
                tag = {
                    id: crypto.randomUUID(),
                    workspaceId,
                    name,
                    color: nextColor(),
                    createdAt: Date.now(),
                };
                await db.tags.add(tag);
            }
            result.push(tag);
            await db.recordTags.add({
                id: crypto.randomUUID(),
                workspaceId,
                tagId: tag.id,
                entityType,
                entityId,
                createdAt: Date.now(),
            });
        }
        return result;
    });
}

export async function getTagsForEntity(entityType: EntityType, entityId: string): Promise<Tag[]> {
    const links = await db.recordTags
        .where('[entityType+entityId]')
        .equals([entityType, entityId])
        .toArray();
    if (links.length === 0) return [];
    const tags = await db.tags.bulkGet(links.map(l => l.tagId));
    return tags.filter(Boolean) as Tag[];
}

export async function getTagsForEntities(entityType: EntityType, entityIds: string[]): Promise<Record<string, Tag[]>> {
    if (entityIds.length === 0) return {};
    const links = await db.recordTags
        .where('[entityType+entityId]')
        .anyOf(entityIds.map(id => [entityType, id]))
        .toArray();
    const tagIds = Array.from(new Set(links.map(l => l.tagId)));
    const tags = await db.tags.bulkGet(tagIds);
    const tagMap = new Map(tags.filter(Boolean).map(t => [t!.id, t!]));

    const result: Record<string, Tag[]> = {};
    for (const link of links) {
        const tag = tagMap.get(link.tagId);
        if (!tag) continue;
        if (!result[link.entityId]) result[link.entityId] = [];
        result[link.entityId].push(tag);
    }
    return result;
}

export async function getTagSuggestions(workspaceId: string): Promise<string[]> {
    const tags = await listTags(workspaceId);
    return tags.map(t => t.name);
}

export async function deleteTag(tagId: string): Promise<void> {
    const user = await requireUser();
    const tag = await db.tags.get(tagId);
    if (!tag) throw new AppError('NOT_FOUND', 'Tag not found.');
    await assertWorkspaceAccess(user, tag.workspaceId);
    if (user.role !== 'admin') throw new AppError('FORBIDDEN', 'Only admins can delete tags.');
    if (!tag.name) throw new AppError('VALIDATION', 'Invalid tag.');
    required(tag.name, 'Tag name');
    await db.transaction('rw', [db.tags, db.recordTags], async () => {
        await db.tags.delete(tagId);
        await db.recordTags.where('tagId').equals(tagId).delete();
    });
    void colorFor;
}
