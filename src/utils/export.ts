import JSZip from 'jszip';
import { db } from '../db';

export const exportBackup = async () => {
    try {
        const zip = new JSZip();

        // 1. Fetch Data
        const notes = await db.notes.toArray();
        const folders = await db.folders.toArray();

        // 2. Add Raw Data (JSON) for Restoration
        const backupData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            folders,
            notes
        };
        zip.file('ninai_backup.json', JSON.stringify(backupData, null, 2));

        // 3. Add Readable Markdown Files
        const notesFolder = zip.folder('notes');
        if (notesFolder) {
            notes.forEach(note => {
                // Sanitize filename
                const safeTitle = (note.title || 'Untitled').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
                const filename = `${safeTitle}_${note.id}.md`;

                // Add Meta Frontmatter
                const content = `---
title: ${note.title}
created: ${note.id}
updated: ${note.updatedAt.toISOString()}
folderId: ${note.folderId}
---

${note.content}
`;
                notesFolder.file(filename, content);
            });
        }

        // 4. Generate & Download
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ninai_backup_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return true;
    } catch (e) {
        console.error("Export failed:", e);
        return false;
    }
};

export const importBackup = async (file: File) => {
    try {
        const zip = await JSZip.loadAsync(file);

        // 1. Locate and Parse JSON
        const jsonFile = zip.file('ninai_backup.json');
        if (!jsonFile) {
            throw new Error('Invalid backup file: missing ninai_backup.json');
        }

        const jsonContent = await jsonFile.async('string');
        const data = JSON.parse(jsonContent);

        if (!data.folders || !data.notes) {
            throw new Error('Invalid backup format');
        }

        // 2. Clear Existing Data (Full Restore)
        await db.folders.clear();
        await db.notes.clear();

        // 3. Restore Data
        // Convert date strings back to Date objects if needed, 
        // though Dexie/IndexedDB often handles strings or we should parse them.
        // Our 'db' schema has Date types. JSON has strings.
        const folders = data.folders.map((f: any) => ({
            ...f
        }));

        const notes = data.notes.map((n: any) => ({
            ...n,
            updatedAt: new Date(n.updatedAt)
        }));

        await db.folders.bulkAdd(folders);
        await db.notes.bulkAdd(notes);

        return true;
    } catch (e) {
        console.error("Import failed:", e);
        alert("Failed to restore backup: " + (e as Error).message);
        return false;
    }
};
