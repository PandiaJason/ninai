import { db } from '../db';
import { requireUser } from './auth';
import { assertWorkspaceAccess } from './permissions';

export type SearchType = 'lead' | 'task' | 'note' | 'folder';

export interface SearchResult {
    type: SearchType;
    id: string;
    title: string;
    subtitle: string;
    updatedAt: number;
    folderId?: string;
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function matches(value: string | undefined, term: string): boolean {
    return !!value && value.toLowerCase().includes(term);
}

export async function globalSearch(
    workspaceId: string,
    query: string,
    types?: SearchType[],
    limitPerType = 8,
): Promise<SearchResult[]> {
    const actor = await requireUser();
    await assertWorkspaceAccess(actor, workspaceId);
    const term = query.trim().toLowerCase();
    if (!term) return [];

    const include = (type: SearchType) => !types || types.length === 0 || types.includes(type);
    const results: SearchResult[] = [];

    if (include('lead')) {
        const leads = await db.leads.where('workspaceId').equals(workspaceId).toArray();
        const matched = leads
            .filter(l => !l.archived && (
                matches(l.name, term) || matches(l.company, term) || matches(l.email, term) ||
                matches(l.phone, term) || matches(l.industry, term)
            ))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, limitPerType);
        matched.forEach(lead => results.push({
            type: 'lead',
            id: lead.id,
            title: lead.name,
            subtitle: [lead.company, lead.email, lead.phone].filter(Boolean).join(' · ') || 'Lead',
            updatedAt: lead.updatedAt,
        }));
    }

    if (include('task')) {
        const tasks = await db.tasks.where('workspaceId').equals(workspaceId).toArray();
        const matched = tasks
            .filter(t => matches(t.title, term) || matches(t.description, term))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, limitPerType);
        matched.forEach(task => results.push({
            type: 'task',
            id: task.id,
            title: task.title,
            subtitle: task.dueDate ? `Due ${task.dueDate}` : task.status.replace(/_/g, ' '),
            updatedAt: task.updatedAt,
        }));
    }

    if (include('note')) {
        const notes = await db.notes.where('workspaceId').equals(workspaceId).toArray();
        const matched = notes
            .filter(n => n.archived !== 1 && (matches(n.title, term) || matches(stripHtml(n.content || ''), term)))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, limitPerType);
        matched.forEach(note => {
            const text = stripHtml(note.content || '');
            const index = text.toLowerCase().indexOf(term);
            const snippet = index >= 0 ? text.slice(Math.max(0, index - 40), index + 80) : text.slice(0, 100);
            results.push({
                type: 'note',
                id: note.id,
                title: note.title || 'Untitled note',
                subtitle: snippet || 'Note',
                updatedAt: new Date(note.updatedAt).getTime(),
                folderId: note.folderId,
            });
        });
    }

    if (include('folder')) {
        const folders = await db.folders.where('workspaceId').equals(workspaceId).toArray();
        const matched = folders
            .filter(f => f.id !== 'all' && matches(f.name, term))
            .slice(0, limitPerType);
        matched.forEach(folder => results.push({
            type: 'folder',
            id: folder.id,
            title: folder.name,
            subtitle: 'Notes folder',
            updatedAt: 0,
        }));
    }

    return results;
}
