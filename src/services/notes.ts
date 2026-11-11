import {
    db,
    DEFAULT_WORKSPACE_ID,
    type EntityType,
    type Folder,
    type Lead,
    type Note,
    type NoteLink,
    type Task,
} from '../db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { assertWorkspaceAccess } from './permissions';
import { logActivity } from './activity';
import { optional, required } from './validation';

export function noteBelongsToWorkspace(note: Pick<Note, 'workspaceId'>, workspaceId: string): boolean {
    return (note.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId;
}

export function folderBelongsToWorkspace(folder: Pick<Folder, 'workspaceId'>, workspaceId: string): boolean {
    return (folder.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId;
}

export async function ensureWorkspaceNotesFolder(workspaceId: string): Promise<Folder> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const folders = await db.folders.where('workspaceId').equals(workspaceId).toArray();
    const existing = folders.find(f => f.id !== 'all');
    if (existing) return existing;
    const folder: Folder = {
        id: crypto.randomUUID(),
        name: 'Notes',
        icon: 'Folder',
        workspaceId,
        order: 0,
    };
    await db.folders.add(folder);
    return folder;
}

export async function createWorkspaceNote(
    workspaceId: string,
    input: { title?: string; content?: string; folderId?: string },
): Promise<Note> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);

    let folderId = input.folderId;
    if (folderId) {
        const folder = await db.folders.get(folderId);
        if (!folder || !folderBelongsToWorkspace(folder, workspaceId)) {
            throw new AppError('VALIDATION', 'The selected notes folder does not exist in this workspace.');
        }
    } else {
        folderId = (await ensureWorkspaceNotesFolder(workspaceId)).id;
    }

    const now = new Date();
    const note: Note = {
        id: crypto.randomUUID(),
        folderId,
        title: (input.title || '').slice(0, 200),
        content: input.content || '',
        updatedAt: now,
        createdAt: now,
        workspaceId,
        archived: 0,
        loved: 0,
        hasReminders: 0,
    };
    await db.notes.add(note);
    await logActivity({
        workspaceId,
        userId: actor.id,
        entityType: 'note',
        entityId: note.id,
        action: 'created',
        title: `Created note ${note.title || 'Untitled'}`,
    });
    return note;
}

export async function archiveNote(noteId: string, archived: boolean): Promise<void> {
    const actor = await requireUser();
    const note = await db.notes.get(noteId);
    if (!note) throw new AppError('NOT_FOUND', 'Note not found.');
    await assertWorkspaceAccess(actor, note.workspaceId || DEFAULT_WORKSPACE_ID);
    await db.notes.update(noteId, { archived: archived ? 1 : 0, updatedAt: new Date() });
    await logActivity({
        workspaceId: note.workspaceId || DEFAULT_WORKSPACE_ID,
        userId: actor.id,
        entityType: 'note',
        entityId: noteId,
        action: archived ? 'archived' : 'restored',
        title: `${archived ? 'Archived' : 'Restored'} note ${note.title || 'Untitled'}`,
    });
}

export async function toggleNoteFavorite(noteId: string): Promise<void> {
    const actor = await requireUser();
    const note = await db.notes.get(noteId);
    if (!note) throw new AppError('NOT_FOUND', 'Note not found.');
    await assertWorkspaceAccess(actor, note.workspaceId || DEFAULT_WORKSPACE_ID);
    await db.notes.update(noteId, { loved: note.loved ? 0 : 1, updatedAt: new Date() });
}

export async function deleteNoteCascade(noteId: string): Promise<void> {
    const actor = await requireUser();
    const note = await db.notes.get(noteId);
    if (!note) return;
    await assertWorkspaceAccess(actor, note.workspaceId || DEFAULT_WORKSPACE_ID);
    await db.transaction('rw', [db.notes, db.noteLinks, db.recordTags, db.activities], async () => {
        await db.notes.delete(noteId);
        await db.noteLinks.where('noteId').equals(noteId).delete();
        await db.recordTags.where('[entityType+entityId]').equals(['note', noteId]).delete();
        await db.activities.where('[entityType+entityId]').equals(['note', noteId]).delete();
    });
}

export async function deleteFolderCascade(folderId: string): Promise<void> {
    const actor = await requireUser();
    const folder = await db.folders.get(folderId);
    if (!folder) throw new AppError('NOT_FOUND', 'Folder not found.');
    await assertWorkspaceAccess(actor, folder.workspaceId || DEFAULT_WORKSPACE_ID);
    if (folder.id === 'all') throw new AppError('VALIDATION', 'The All Notes view cannot be deleted.');
    if (folder.id === 'ninai' && (folder.workspaceId || DEFAULT_WORKSPACE_ID) === DEFAULT_WORKSPACE_ID) {
        throw new AppError('VALIDATION', 'The default notes folder cannot be deleted.');
    }

    const children = await db.folders.where('parentId').equals(folderId).toArray();
    for (const child of children) await deleteFolderCascade(child.id);
    const notes = await db.notes.where('folderId').equals(folderId).toArray();
    for (const note of notes) await deleteNoteCascade(note.id);
    await db.folders.delete(folderId);
}

/* ------------------------------------------------------------------ */
/* Record ↔ note links                                                 */
/* ------------------------------------------------------------------ */

export interface NoteLinkDetail extends NoteLink {
    title: string;
    subtitle: string;
}

async function assertEntity(workspaceId: string, entityType: EntityType, entityId: string): Promise<void> {
    if (entityType === 'lead') {
        const lead = await db.leads.get(entityId);
        if (!lead || lead.workspaceId !== workspaceId) throw new AppError('NOT_FOUND', 'Lead not found.');
    } else if (entityType === 'project') {
        const project = await db.projects.get(entityId);
        if (!project || project.workspaceId !== workspaceId) throw new AppError('NOT_FOUND', 'Project not found.');
    } else if (entityType === 'task') {
        const task = await db.tasks.get(entityId);
        if (!task || task.workspaceId !== workspaceId) throw new AppError('NOT_FOUND', 'Task not found.');
    } else {
        const note = await db.notes.get(entityId);
        if (!note || !noteBelongsToWorkspace(note, workspaceId)) throw new AppError('NOT_FOUND', 'Note not found.');
    }
}

export async function linkNote(
    workspaceId: string,
    noteId: string,
    entityType: Exclude<EntityType, 'note'>,
    entityId: string,
): Promise<NoteLink> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const note = await db.notes.get(noteId);
    if (!note || !noteBelongsToWorkspace(note, workspaceId)) throw new AppError('NOT_FOUND', 'Note not found.');
    await assertEntity(workspaceId, entityType, entityId);

    const existing = await db.noteLinks
        .where('[noteId+entityType]')
        .equals([noteId, entityType])
        .filter(link => link.entityId === entityId)
        .first();
    if (existing) return existing;

    const link: NoteLink = {
        id: crypto.randomUUID(),
        workspaceId,
        noteId,
        entityType,
        entityId,
        createdAt: Date.now(),
    };
    await db.noteLinks.add(link);
    await logActivity({
        workspaceId,
        userId: actor.id,
        entityType,
        entityId,
        action: 'note_linked',
        title: `Linked note ${note.title || 'Untitled'}`,
    });
    return link;
}

export async function unlinkNote(linkId: string): Promise<void> {
    const actor = await requireUser();
    const link = await db.noteLinks.get(linkId);
    if (!link) return;
    await assertWorkspaceAccess(actor, link.workspaceId);
    await db.noteLinks.delete(linkId);
}

export async function getNoteLinks(noteId: string): Promise<NoteLinkDetail[]> {
    const links = await db.noteLinks.where('noteId').equals(noteId).toArray();
    const leadIds = links.filter(l => l.entityType === 'lead').map(l => l.entityId);
    const taskIds = links.filter(l => l.entityType === 'task').map(l => l.entityId);
    const [leads, tasks] = await Promise.all([
        db.leads.bulkGet(leadIds),
        db.tasks.bulkGet(taskIds),
    ]);
    const leadMap = new Map(leads.filter(Boolean).map(l => [l!.id, l!]));
    const taskMap = new Map(tasks.filter(Boolean).map(t => [t!.id, t!]));

    return links.map(link => {
        if (link.entityType === 'lead') {
            const lead = leadMap.get(link.entityId);
            return { ...link, title: lead?.name || 'Deleted lead', subtitle: lead?.company || 'Lead' };
        }
        const task = taskMap.get(link.entityId);
        return { ...link, title: task?.title || 'Deleted task', subtitle: task?.dueDate ? `Due ${task.dueDate}` : 'Task' };
    });
}

export async function getNotesForEntity(
    workspaceId: string,
    entityType: Exclude<EntityType, 'note'>,
    entityId: string,
): Promise<Note[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    await assertEntity(workspaceId, entityType, entityId);
    const links = await db.noteLinks
        .where('[entityType+entityId]')
        .equals([entityType, entityId])
        .toArray();
    const notes = await db.notes.bulkGet(links.map(l => l.noteId));
    return notes
        .filter(Boolean)
        .map(n => n!)
        .filter(note => noteBelongsToWorkspace(note, workspaceId) && note.archived !== 1)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function createNoteForEntity(
    workspaceId: string,
    entityType: Exclude<EntityType, 'note'>,
    entityId: string,
    title?: string,
): Promise<Note> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    await assertEntity(workspaceId, entityType, entityId);

    let defaultTitle = 'New note';
    let subtitle = '';
    if (entityType === 'lead') {
        const lead = await db.leads.get(entityId) as Lead;
        defaultTitle = `${lead.name} — Note`;
        subtitle = lead.company || '';
    } else {
        const task = await db.tasks.get(entityId) as Task;
        defaultTitle = `${task.title} — Note`;
        subtitle = task.dueDate ? `Due ${task.dueDate}` : '';
    }
    void subtitle;

    const note = await createWorkspaceNote(workspaceId, {
        title: optional(title, 'Note title', 200) || defaultTitle,
        content: '',
    });
    await linkNote(workspaceId, note.id, entityType, entityId);
    return note;
}

export async function searchNotes(workspaceId: string, query: string, limit = 8): Promise<Note[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const notes = await db.notes.where('workspaceId').equals(workspaceId).toArray();
    return notes
        .filter(n => n.archived !== 1 && noteBelongsToWorkspace(n, workspaceId))
        .filter(n => (n.title || '').toLowerCase().includes(term) || (n.content || '').toLowerCase().includes(term))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, limit);
}

export async function listRecentNotes(workspaceId: string, limit = 5): Promise<Note[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const notes = await db.notes.where('workspaceId').equals(workspaceId).toArray();
    return notes
        .filter(n => n.archived !== 1 && noteBelongsToWorkspace(n, workspaceId))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, limit);
}

export async function updateNoteTitle(noteId: string, title: string): Promise<void> {
    const actor = await requireUser();
    const note = await db.notes.get(noteId);
    if (!note) throw new AppError('NOT_FOUND', 'Note not found.');
    await assertWorkspaceAccess(actor, note.workspaceId || DEFAULT_WORKSPACE_ID);
    const cleanTitle = required(title, 'Note title', 200);
    await db.notes.update(noteId, { title: cleanTitle, updatedAt: new Date() });
}
