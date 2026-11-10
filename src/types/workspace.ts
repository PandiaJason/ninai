export type ModuleId =
    | 'dashboard'
    | 'crm'
    | 'tasks'
    | 'notes'
    | 'calendar'
    | 'settings'
    | 'tools';

export interface WorkspaceNav {
    go: (module: ModuleId) => void;
    openLead: (leadId: string) => void;
    openTask: (taskId: string) => void;
    openNote: (noteId: string) => void;
    openSearch: () => void;
}
