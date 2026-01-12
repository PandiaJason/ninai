import Dexie, { type Table } from 'dexie';

export interface Note {
    id: string; // Keep string UUIDs for compatibility
    folderId: string;
    title: string;
    content: string;
    updatedAt: Date;
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
