import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { NotesPanel } from './components/NotesPanel';

import { Onboarding } from './components/Onboarding';
import { LoginScreen } from './components/auth/LoginScreen';
import { useAuth } from './context/AuthContext';
import { TodayView } from './components/workspace/TodayView';
import { DashboardView } from './components/workspace/DashboardView';
import { CRMView } from './components/workspace/CRMView';
import { AnalyticsView } from './components/workspace/AnalyticsView';
import { ProjectsView } from './components/workspace/ProjectsView';
import { FollowUpsView } from './components/workspace/FollowUpsView';
import { TasksView } from './components/workspace/TasksView';
import { CalendarView } from './components/workspace/CalendarView';
import { SettingsView } from './components/workspace/SettingsView';
import { GlobalSearch } from './components/workspace/GlobalSearch';
import type { ModuleId, WorkspaceNav } from './types/workspace';

const MODULE_IDS: ModuleId[] = ['today', 'dashboard', 'crm', 'institutions', 'analytics', 'projects', 'followups', 'tasks', 'notes', 'calendar', 'settings'];

function readModule(): ModuleId {
    const saved = localStorage.getItem('ninai_active_module') as ModuleId | null;
    return saved && MODULE_IDS.includes(saved) ? saved : 'dashboard';
}

function App() {
    const { user, workspace, loading: authLoading, error: authError, logout } = useAuth();
    const [setupComplete, setSetupComplete] = useState(() => localStorage.getItem('ninai_setup_complete') === 'true');

    // --- Workspace Navigation ---
    const [activeModule, setActiveModule] = useState<ModuleId>(readModule);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [externalNoteId, setExternalNoteId] = useState<string | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('ninai_active_module', activeModule);
    }, [activeModule]);

    const go = useCallback((module: ModuleId) => {
        setActiveModule(module);
        setSelectedLeadId(null);
        setSelectedProjectId(null);
        setSelectedTaskId(null);
    }, []);

    const nav = useMemo<WorkspaceNav>(() => ({
        go,
        openLead: (leadId) => {
            setSelectedProjectId(null);
            setSelectedTaskId(null);
            setSelectedLeadId(leadId);
            setActiveModule(current => (current === 'institutions' ? 'institutions' : 'crm'));
        },
        openProject: (projectId) => {
            setSelectedLeadId(null);
            setSelectedTaskId(null);
            setSelectedProjectId(projectId);
            setActiveModule('projects');
        },
        openTask: (taskId) => {
            setSelectedLeadId(null);
            setSelectedProjectId(null);
            setSelectedTaskId(taskId);
            setActiveModule('tasks');
        },
        openNote: (noteId) => {
            setExternalNoteId(noteId);
            setActiveModule('notes');
        },
        openSearch: () => setSearchOpen(true),
    }), [go]);

    // --- Layout State ---
    const [isNotesOpen, setIsNotesOpen] = useState(true);

    // Reset transient view state when the active workspace changes.
    const prevWorkspaceId = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (prevWorkspaceId.current && prevWorkspaceId.current !== workspace?.id) {
            setSelectedLeadId(null);
            setSelectedProjectId(null);
            setSelectedTaskId(null);
            setExternalNoteId(null);
            setActiveModule('dashboard');
        }
        prevWorkspaceId.current = workspace?.id;
    }, [workspace?.id]);

    // Global search shortcut
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setSearchOpen(open => !open);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    if (!setupComplete) {
        return <Onboarding onComplete={() => setSetupComplete(true)} />;
    }

    if (authLoading) {
        return (
            <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-app)', color: 'var(--text-secondary)', fontSize: 13 }}>
                Loading workspace…
            </div>
        );
    }

    if (!user) {
        return <LoginScreen />;
    }

    if (!workspace) {
        return (
            <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-app)', padding: 24 }}>
                <div className="ws-card" style={{ maxWidth: 460, padding: 28, textAlign: 'center' }}>
                    <h2 style={{ marginBottom: 8 }}>Workspace unavailable</h2>
                    <p className="ws-muted" style={{ marginBottom: 16 }}>
                        {authError || 'Your account is not linked to an accessible workspace.'}
                    </p>
                    <button className="ws-btn ws-btn-primary" onClick={() => void logout()}>Sign out</button>
                </div>
            </div>
        );
    }

    const notesModule = activeModule === 'notes';

    const renderModule = () => {
        switch (activeModule) {
            case 'today':
                return <TodayView workspaceId={workspace.id} userId={user.id} userName={user.name} nav={nav} />;
            case 'dashboard':
                return <DashboardView workspaceId={workspace.id} userId={user.id} userName={user.name} nav={nav} />;
            case 'crm':
                return (
                    <CRMView
                        workspaceId={workspace.id}
                        userId={user.id}
                        audience="learner"
                        selectedLeadId={selectedLeadId}
                        onCloseLead={() => setSelectedLeadId(null)}
                        nav={nav}
                    />
                );
            case 'institutions':
                return (
                    <CRMView
                        workspaceId={workspace.id}
                        userId={user.id}
                        audience="institution"
                        defaultView="kanban"
                        selectedLeadId={selectedLeadId}
                        onCloseLead={() => setSelectedLeadId(null)}
                        nav={nav}
                    />
                );
            case 'analytics':
                return <AnalyticsView workspaceId={workspace.id} nav={nav} />;
            case 'projects':
                return (                    <ProjectsView
                        workspaceId={workspace.id}
                        userId={user.id}
                        selectedProjectId={selectedProjectId}
                        onCloseProject={() => setSelectedProjectId(null)}
                        nav={nav}
                    />
                );
            case 'followups':
                return <FollowUpsView workspaceId={workspace.id} userId={user.id} nav={nav} />;
            case 'tasks':
                return (
                    <TasksView
                        workspaceId={workspace.id}
                        userId={user.id}
                        selectedTaskId={selectedTaskId}
                        onCloseTask={() => setSelectedTaskId(null)}
                        nav={nav}
                    />
                );
            case 'calendar':
                return <CalendarView workspaceId={workspace.id} nav={nav} />;
            case 'settings':
                return <SettingsView />;
            case 'notes':
            default:
                return null;
        }
    };

    return (
        <>
        <Layout
            sidebar={
                <Sidebar
                    activeModule={activeModule}
                    onSelectModule={go}
                    onOpenSearch={() => setSearchOpen(true)}
                    workspaceName={workspace.name}
                    onSignOut={() => void logout()}
                />
            }
            insightPanel={(
                <NotesPanel
                    workspaceId={workspace.id}
                    externalNoteId={externalNoteId}
                    onExternalNoteOpened={() => setExternalNoteId(null)}
                    showZenToggle={false}
                />
            )}
            zenMode={false}
            fullNotes={notesModule}
            notesLocked={!notesModule}
            contentHidden={notesModule}
            isNotesOpen={isNotesOpen}
            setNotesOpen={setIsNotesOpen}
        >
            {!notesModule && renderModule()}
        </Layout>

        <GlobalSearch
            open={searchOpen}
            workspaceId={workspace.id}
            nav={nav}
            onClose={() => setSearchOpen(false)}
        />
        </>
    );
}

export default App;
