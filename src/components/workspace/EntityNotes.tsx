import React, { useState } from 'react';
import type { EntityType } from '../../db';
import { getNotesForEntity, createNoteForEntity, getNoteLinks, unlinkNote } from '../../services/notes';
import { formatDate } from '../../services/validation';
import { toErrorMessage } from '../../services/errors';
import type { WorkspaceNav } from '../../types/workspace';
import { Button, EmptyState, IconButton, SectionCard } from '../ui/Misc';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useAsyncData } from './useAsyncData';

interface EntityNotesProps {
    workspaceId: string;
    entityType: Exclude<EntityType, 'note'>;
    entityId: string;
    nav: WorkspaceNav;
    title?: string;
}

export const EntityNotes: React.FC<EntityNotesProps> = ({ workspaceId, entityType, entityId, nav, title = 'Notes' }) => {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const { data, loading, error, reload } = useAsyncData(
        () => getNotesForEntity(workspaceId, entityType, entityId),
        [workspaceId, entityType, entityId],
    );
    const notes = data || [];

    const createNote = async () => {
        setBusy(true);
        try {
            const note = await createNoteForEntity(workspaceId, entityType, entityId);
            toast.success('Note created and linked.');
            nav.openNote(note.id);
        } catch (e) {
            toast.error(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const removeLink = async (noteId: string) => {
        try {
            const links = await getNoteLinks(noteId);
            const link = links.find(item => item.entityType === entityType && item.entityId === entityId);
            if (link) await unlinkNote(link.id);
            await reload();
        } catch (e) {
            toast.error(toErrorMessage(e));
        }
    };

    return (
        <SectionCard
            title={title}
            description={notes.length ? `${notes.length} linked note${notes.length === 1 ? '' : 's'}` : 'Capture context directly against this record.'}
            action={<Button size="sm" icon="plus" loading={busy} onClick={() => void createNote()}>New note</Button>}
        >
            {loading && <div className="ws-muted">Loading notes…</div>}
            {error && <div className="ws-inline-error"><Icon name="alert" size={15} /><span>{error}</span></div>}
            {!loading && !error && notes.length === 0 && (
                <EmptyState compact icon="notes" title="No notes linked" description="Create a note to keep meeting notes, research or decisions with this record." />
            )}
            {notes.map(note => (
                <div key={note.id} className="ws-user-row">
                    <span className="ws-search-result-icon" style={{ width: 30, height: 30 }}><Icon name="notes" size={14} /></span>
                    <button
                        className="ws-user-info"
                        style={{ border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                        onClick={() => nav.openNote(note.id)}
                    >
                        <div className="ws-user-name">{note.title || 'Untitled note'}</div>
                        <div className="ws-user-email">Updated {formatDate(note.updatedAt)}</div>
                    </button>
                    <div className="ws-user-actions">
                        <IconButton icon="arrow-right" label="Open note" onClick={() => nav.openNote(note.id)} />
                        <IconButton icon="x" label="Unlink note" onClick={() => void removeLink(note.id)} />
                    </div>
                </div>
            ))}
        </SectionCard>
    );
};
