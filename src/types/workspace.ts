export type ModuleId =
    | 'dashboard'
    | 'crm'
    | 'analytics'
    | 'projects'
    | 'followups'
    | 'tasks'
    | 'notes'
    | 'calendar'
    | 'settings'
    | 'tools';

export interface WorkspaceNav {
    go: (module: ModuleId) => void;
    openLead: (leadId: string) => void;
    openProject: (projectId: string) => void;
    openTask: (taskId: string) => void;
    openNote: (noteId: string) => void;
    openSearch: () => void;
}
