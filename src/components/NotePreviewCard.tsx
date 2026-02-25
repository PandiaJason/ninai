import React from 'react';
import type { Note } from '../db';

interface NotePreviewCardProps {
    note: Note;
    isActive: boolean;
    onSelect: (id: string) => void;
    onContextMenu: (e: React.MouseEvent, id: string) => void;
}

export const NotePreviewCard = React.memo(({ note, isActive, onSelect, onContextMenu }: NotePreviewCardProps) => {
    // Optimized Strip HTML (Regex) - MUCH faster than DOM creation
    const textPreview = React.useMemo(() => {
        if (!note.content) return 'No additional text';
        // Regex to strip tags
        const stripped = note.content.replace(/<[^>]*>?/gm, ' ');
        // Flatten whitespace and decode basic entities if needed
        const decoded = stripped.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        return decoded.slice(0, 100) || 'No additional text';
    }, [note.content]);

    return (
        <div
            className={`note-preview-card ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(note.id)}
            onContextMenu={(e) => onContextMenu(e, note.id)}
        >
            <h4 className="note-preview-title">{note.title || 'New Note'}</h4>
            <div className="note-preview-meta">
                <span className="note-time">
                    {new Date(note.updatedAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                </span>
                <p className="note-preview-text">
                    {textPreview}
                </p>
            </div>
        </div>
    );
});
