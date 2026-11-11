export type ModuleId =
    | 'today'
    | 'dashboard'
    | 'crm'
    | 'institutions'
    | 'analytics'
    | 'projects'
    | 'followups'
    | 'tasks'
    | 'notes'
    | 'calendar'
    | 'settings';

export interface WorkspaceNav {
    go: (module: ModuleId) => void;
    openLead: (leadId: string) => void;
    openProject: (projectId: string) => void;
    openTask: (taskId: string) => void;
    openNote: (noteId: string) => void;
    openSearch: () => void;
}
