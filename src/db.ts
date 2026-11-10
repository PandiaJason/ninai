import Dexie, { type Table } from 'dexie';

export type RepeatOption = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface NoteReminder {
    id: string;                          // UUID for each reminder
    text: string;                        // The selected text / line content
    dueAt: Date;                         // When it's due
    priority: 'low' | 'medium' | 'high'; // Priority level
    repeat?: RepeatOption;               // Recurrence (undefined = one-time)
    completedAt?: Date;                  // Completion timestamp
}

export interface Note {
    id: string; // Keep string UUIDs for compatibility
    folderId: string;
    title: string;
    content: string;
    updatedAt: Date;
    createdAt?: Date;
    workspaceId?: string;
    archived?: number;              // 1 = archived, 0/undefined = active
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
    workspaceId?: string;
}

/* ------------------------------------------------------------------ */
/* Workspace / users                                                    */
/* ------------------------------------------------------------------ */

export type UserRole = 'admin' | 'member';
export type MemberRole = 'owner' | 'member';

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    passwordHash: string;
    passwordSalt: string;
    workspaceId: string;
    avatarColor: string;
    active: number;              // 1 = active
    createdAt: number;
    updatedAt: number;
    lastLoginAt?: number;
}

export interface Workspace {
    id: string;
    name: string;
    description?: string;
    ownerId: string;
    createdAt: number;
}

export interface WorkspaceMember {
    id: string;
    workspaceId: string;
    userId: string;
    role: MemberRole;
    createdAt: number;
}

/* ------------------------------------------------------------------ */
/* CRM                                                                  */
/* ------------------------------------------------------------------ */

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface LeadStage {
    id: string;
    workspaceId: string;
    name: string;
    color: string;
    order: number;
    isWon: number;
    isLost: number;
}

export interface Lead {
    id: string;
    workspaceId: string;
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    website?: string;
    jobTitle?: string;
    source?: string;
    industry?: string;
    location?: string;
    ownerId: string;
    stageId: string;
    priority: Priority;
    value: number;
    description?: string;
    createdAt: number;
    updatedAt: number;
    lastContactedAt?: number;
    nextFollowUpAt?: number;
    archived: number;
    createdBy: string;
    convertedAt?: number;
}

export type LeadActivityType = 'call' | 'email' | 'meeting' | 'message' | 'follow_up' | 'note' | 'update' | 'stage_change';

export interface LeadActivity {
    id: string;
    workspaceId: string;
    leadId: string;
    type: LeadActivityType;
    subject: string;
    body: string;
    occurredAt: number;
    createdAt: number;
    userId: string;
}

/* ------------------------------------------------------------------ */
/* Projects                                                             */
/* ------------------------------------------------------------------ */

export type ProjectStatus = 'not_started' | 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

export interface Project {
    id: string;
    workspaceId: string;
    name: string;
    description?: string;
    identifier: string;
    ownerId: string;
    startDate?: string;      // YYYY-MM-DD
    endDate?: string;        // YYYY-MM-DD
    status: ProjectStatus;
    priority: Priority;
    objectives: string[];
    createdAt: number;
    updatedAt: number;
    archived: number;
    createdBy: string;
}

export interface ProjectMember {
    id: string;
    projectId: string;
    userId: string;
    createdAt: number;
}

export interface ProjectLead {
    id: string;
    projectId: string;
    leadId: string;
    createdAt: number;
}

export interface ProjectMilestone {
    id: string;
    workspaceId: string;
    projectId: string;
    title: string;
    dueDate: string;        // YYYY-MM-DD
    completed: number;
    createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Tasks                                                                */
/* ------------------------------------------------------------------ */

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';

export interface Task {
    id: string;
    workspaceId: string;
    projectId?: string;
    leadId?: string;
    assigneeId?: string;
    title: string;
    description?: string;
    priority: Priority;
    status: TaskStatus;
    startDate?: string;
    dueDate?: string;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    createdBy: string;
}

export interface Subtask {
    id: string;
    taskId: string;
    title: string;
    done: number;
    order: number;
    createdAt: number;
}

export interface TaskComment {
    id: string;
    taskId: string;
    userId: string;
    body: string;
    createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Calendar, tags, links, activity                                      */
/* ------------------------------------------------------------------ */

export type CalendarEventType = 'meeting' | 'follow_up' | 'deadline' | 'reminder' | 'other';

export interface CalendarEvent {
    id: string;
    workspaceId: string;
    title: string;
    description?: string;
    location?: string;
    type: CalendarEventType;
    startAt: number;
    endAt: number;
    allDay: number;
    leadId?: string;
    projectId?: string;
    taskId?: string;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

export interface Tag {
    id: string;
    workspaceId: string;
    name: string;
    color: string;
    createdAt: number;
}

export type EntityType = 'lead' | 'project' | 'task' | 'note';

export interface RecordTag {
    id: string;
    workspaceId: string;
    tagId: string;
    entityType: EntityType;
    entityId: string;
    createdAt: number;
}

export interface NoteLink {
    id: string;
    workspaceId: string;
    noteId: string;
    entityType: EntityType;
    entityId: string;
    createdAt: number;
}

export interface Notification {
    id: string;
    workspaceId: string;
    userId: string;
    title: string;
    body: string;
    entityType?: EntityType;
    entityId?: string;
    read: number;
    createdAt: number;
}

export interface Activity {
    id: string;
    workspaceId: string;
    userId: string;
    entityType: EntityType;
    entityId: string;
    action: string;
    title: string;
    metadata?: string;
    createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Database                                                             */
/* ------------------------------------------------------------------ */

export const DEFAULT_WORKSPACE_ID = 'ws_default';
export const DEFAULT_ADMIN_EMAIL = 'admin@ninai.app';
export const DEFAULT_ADMIN_PASSWORD = 'ninai-admin';

export const DEFAULT_STAGES: Omit<LeadStage, 'workspaceId'>[] = [
    { id: 'stage_new', name: 'New', color: '#0071e3', order: 0, isWon: 0, isLost: 0 },
    { id: 'stage_contacted', name: 'Contacted', color: '#5e5ce6', order: 1, isWon: 0, isLost: 0 },
    { id: 'stage_interested', name: 'Interested', color: '#30b0c7', order: 2, isWon: 0, isLost: 0 },
    { id: 'stage_qualified', name: 'Qualified', color: '#34c759', order: 3, isWon: 0, isLost: 0 },
    { id: 'stage_proposal', name: 'Proposal', color: '#ff9f0a', order: 4, isWon: 0, isLost: 0 },
    { id: 'stage_negotiation', name: 'Negotiation', color: '#ff375f', order: 5, isWon: 0, isLost: 0 },
    { id: 'stage_converted', name: 'Converted', color: '#30d158', order: 6, isWon: 1, isLost: 0 },
    { id: 'stage_lost', name: 'Lost', color: '#8e8e93', order: 7, isWon: 0, isLost: 1 },
];

export class NinaiDB extends Dexie {
    notes!: Table<Note>;
    folders!: Table<Folder>;
    users!: Table<User>;
    workspaces!: Table<Workspace>;
    workspaceMembers!: Table<WorkspaceMember>;
    leadStages!: Table<LeadStage>;
    leads!: Table<Lead>;
    leadActivities!: Table<LeadActivity>;
    projects!: Table<Project>;
    projectMembers!: Table<ProjectMember>;
    projectLeads!: Table<ProjectLead>;
    projectMilestones!: Table<ProjectMilestone>;
    tasks!: Table<Task>;
    subtasks!: Table<Subtask>;
    taskComments!: Table<TaskComment>;
    calendarEvents!: Table<CalendarEvent>;
    tags!: Table<Tag>;
    recordTags!: Table<RecordTag>;
    noteLinks!: Table<NoteLink>;
    notifications!: Table<Notification>;
    activities!: Table<Activity>;

    constructor() {
        super('NinaiDB');

        // Version 8: Workspace / CRM / projects / tasks / calendar foundation.
        // Existing notes and folders are preserved; workspaceId/archived are backfilled.
        this.version(8).stores({
            notes: 'id, folderId, title, updatedAt, loved, hasReminders, workspaceId, archived, [workspaceId+folderId], [workspaceId+updatedAt]',
            folders: 'id, name, parentId, order, workspaceId',
            users: 'id, &email, role, workspaceId, active',
            workspaces: 'id, name, ownerId',
            workspaceMembers: 'id, workspaceId, userId, [workspaceId+userId]',
            leadStages: 'id, workspaceId, order, [workspaceId+order]',
            leads: 'id, workspaceId, ownerId, stageId, priority, archived, createdAt, updatedAt, nextFollowUpAt, [workspaceId+archived], [workspaceId+stageId], [workspaceId+ownerId]',
            leadActivities: 'id, workspaceId, leadId, userId, type, occurredAt, [leadId+occurredAt]',
            projects: 'id, workspaceId, ownerId, status, priority, identifier, archived, createdAt, updatedAt, [workspaceId+status], [workspaceId+archived]',
            projectMembers: 'id, projectId, userId, [projectId+userId]',
            projectLeads: 'id, projectId, leadId, [projectId+leadId], [leadId+projectId]',
            projectMilestones: 'id, workspaceId, projectId, dueDate, completed',
            tasks: 'id, workspaceId, projectId, leadId, assigneeId, status, priority, dueDate, createdAt, updatedAt, [projectId+status], [assigneeId+status], [workspaceId+status], [workspaceId+assigneeId], [workspaceId+dueDate]',
            subtasks: 'id, taskId, order',
            taskComments: 'id, taskId, userId, createdAt, [taskId+createdAt]',
            calendarEvents: 'id, workspaceId, startAt, endAt, type, leadId, projectId, [workspaceId+startAt]',
            tags: 'id, workspaceId, name, [workspaceId+name]',
            recordTags: 'id, workspaceId, tagId, entityType, entityId, [entityType+entityId], [entityId+entityType]',
            noteLinks: 'id, workspaceId, noteId, entityType, entityId, [entityType+entityId], [noteId+entityType]',
            notifications: 'id, workspaceId, userId, read, createdAt, [userId+read]',
            activities: 'id, workspaceId, entityType, entityId, userId, createdAt, [workspaceId+createdAt], [entityType+entityId]',
        }).upgrade(async tx => {
            await tx.table('notes').toCollection().modify(note => {
                if (!note.workspaceId) note.workspaceId = DEFAULT_WORKSPACE_ID;
                if (note.archived === undefined) note.archived = 0;
            });
            await tx.table('folders').toCollection().modify(folder => {
                if (!folder.workspaceId) folder.workspaceId = DEFAULT_WORKSPACE_ID;
            });
        });

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
        // Fast skip if already migrated
        if (localStorage.getItem('ninai_migration_v1')) return;

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
                            workspaceId: n.workspaceId || DEFAULT_WORKSPACE_ID,
                            archived: n.archived ?? 0,
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
                        updatedAt: new Date(),
                        workspaceId: DEFAULT_WORKSPACE_ID,
                        archived: 0
                    });
                }

                if (savedFolders) {
                    try {
                        const parsedFolders = JSON.parse(savedFolders).map((f: any) => ({
                            ...f,
                            workspaceId: f.workspaceId || DEFAULT_WORKSPACE_ID
                        }));
                        await this.folders.bulkAdd(parsedFolders);
                        console.log(`Migrated ${parsedFolders.length} folders.`);
                    } catch (e) {
                        console.error("Failed to migrate folders", e);
                    }
                } else {
                    // Default Folders
                    await this.folders.bulkAdd([
                        { id: 'all', name: 'All Notes', icon: 'Inbox', workspaceId: DEFAULT_WORKSPACE_ID },
                        { id: 'ninai', name: 'NINAI', icon: 'Folder', workspaceId: DEFAULT_WORKSPACE_ID }
                    ]);
                }

                // Optional: Clear localStorage after successful migration? 
                // Keeping it for safety for now.
                // SUCCESS: Mark migration complete to avoid re-checking every boot
                localStorage.setItem('ninai_migration_v1', 'true');
            }
        } catch (error) {
            console.error("Database populate error:", error);
        }
    }

    // Helper to Reset Database (Start Fresh)
    async resetDatabase() {
        await this.transaction('rw', this.tables as any, async () => {
            for (const table of this.tables) {
                await table.clear();
            }
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
