import Dexie, { type Table } from 'dexie';

export type RepeatOption = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface NoteReminder {
    id: string;                          // UUID for each reminder
    text: string;                        // The selected text / line content
    dueAt: Date;                         // When it's due
    priority: 'low' | 'medium' | 'high'; // Priority level
    repeat?: RepeatOption;               // Recurrence (undefined = one-time)
}

export interface Note {
    id: string; // Keep string UUIDs for compatibility
    folderId: string;
    title: string;
    content: string;
    updatedAt: Date;
    loved?: number;                 // Favorited / pinned note (1=true, 0=false)
    reminders?: NoteReminder[];  // Array of reminders (multiple per note)
    hasReminders?: number;       // 1 if has reminders, 0 otherwise (for indexing)
}


export interface Folder {
    id: string;
    name: string;
    icon: string;
    parentId?: string; // For nested structure
    order?: number;    // For drag-and-drop sorting
}

export class NinaiDB extends Dexie {
    notes!: Table<Note>;
    folders!: Table<Folder>;

    constructor() {
        super('NinaiDB');

        // Version 7: Fix boolean index crash
        this.version(7).stores({
            notes: 'id, folderId, title, updatedAt, loved, hasReminders',
            folders: 'id, name, parentId, order',
        }).upgrade(tx => {
            return tx.table('notes').toCollection().modify(note => {
                // Migrate boolean loved to number
                if (typeof note.loved === 'boolean') {
                    note.loved = note.loved ? 1 : 0;
                }
            });
        });

        // Version 6: Optimization indexes
        this.version(6).stores({
            notes: 'id, folderId, title, updatedAt, loved, hasReminders',
            folders: 'id, name, parentId, order',
        }).upgrade(tx => {
            return tx.table('notes').toCollection().modify(note => {
                // Backfill hasReminders
                if (note.reminders && note.reminders.length > 0) {
                    note.hasReminders = 1;
                } else {
                    note.hasReminders = 0;
                }
            });
        });

        // Version 5: Multi-reminder array per note
        this.version(5).stores({
            notes: 'id, folderId, title, updatedAt',
            folders: 'id, name, parentId, order',
        }).upgrade(tx => {
            return tx.table('notes').toCollection().modify(note => {
                // Migrate old single dueAt/priority into reminders[]
                if ((note as any).dueAt) {
                    note.reminders = [{
                        id: crypto.randomUUID(),
                        text: note.title || 'Untitled',
                        dueAt: (note as any).dueAt,
                        priority: (note as any).priority || 'medium'
                    }];
                    note.hasReminders = 1; // Also set for new schema
                }
                delete (note as any).dueAt;
                delete (note as any).priority;
            });
        });

        // Version 4: Add dueAt to notes, remove reminders table
        this.version(4).stores({
            notes: 'id, folderId, title, updatedAt, dueAt',
            folders: 'id, name, parentId, order',
            reminders: null  // Delete the reminders table
        });

        // Version 3: Add reminders table (legacy)
        this.version(3).stores({
            notes: 'id, folderId, title, updatedAt',
            folders: 'id, name, parentId, order',
            reminders: 'id, noteId, dueAt, done'
        });

        // Version 2: Add parentId and order to folders
        this.version(2).stores({
            notes: 'id, folderId, title, updatedAt',
            folders: 'id, name, parentId, order'
        });

        // Version 1 (Preserved for history)
        this.version(1).stores({
            notes: 'id, folderId, title, updatedAt',
            folders: 'id, name'
        });
    }

    // Helper to populate from localStorage if empty
    async populateFromLocalStorage() {
        try {
            if (!this.isOpen()) await this.open();
            const hasNotes = await this.notes.count() > 0;
            if (!hasNotes) {
                console.log("Checking for legacy localStorage data...");
                const savedNotes = localStorage.getItem('ninai_notes');
                const savedFolders = localStorage.getItem('ninai_folders');

                if (savedNotes) {
                    try {
                        const parsedNotes = JSON.parse(savedNotes).map((n: any) => ({
                            ...n,
                            updatedAt: new Date(n.updatedAt) // Hydrate Date
                        }));
                        await this.notes.bulkAdd(parsedNotes);
                        console.log(`Migrated ${parsedNotes.length} notes.`);
                    } catch (e) {
                        console.error("Failed to migrate notes", e);
                    }
                } else {
                    // Default Note
                    await this.notes.add({
                        id: '1',
                        folderId: 'ninai',
                        title: 'Welcome to NINAI',
                        content: 'This is your new knowledge base.\n\nNow fast and persistent.',
                        updatedAt: new Date()
                    });
                }

                if (savedFolders) {
                    try {
                        const parsedFolders = JSON.parse(savedFolders);
                        await this.folders.bulkAdd(parsedFolders);
                        console.log(`Migrated ${parsedFolders.length} folders.`);
                    } catch (e) {
                        console.error("Failed to migrate folders", e);
                    }
                } else {
                    // Default Folders
                    await this.folders.bulkAdd([
                        { id: 'all', name: 'All Notes', icon: 'Inbox' },
                        { id: 'ninai', name: 'NINAI', icon: 'Folder' }
                    ]);
                }

                // Optional: Clear localStorage after successful migration? 
                // Keeping it for safety for now.
            }
        } catch (error) {
            console.error("Database populate error:", error);
        }
    }
    // Helper to Reset Database (Start Fresh)
    async resetDatabase() {
        await this.transaction('rw', this.notes, this.folders, async () => {
            await this.notes.clear();
            await this.folders.clear();
        });
        localStorage.removeItem('ninai_active_note');
        // Re-populate with defaults immediately? Or let app reload handle it?
        // Let's add defaults back so it's "New" state, not "Empty" state.
        await this.populateFromLocalStorage();
    }
}

export const db = new NinaiDB();

// Initialize
db.on('populate', () => {
    // This event only fires if the DB is created fresh (not version upgrade),
    // but since we want to migrate from localStorage regardless of Dexie version 1,
    // we call helper manually in app boot or component.
    // Actually, useEffect in App is better.
});
