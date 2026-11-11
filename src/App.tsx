import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Sidebar } from './components/Sidebar';
import { NotesPanel } from './components/NotesPanel';
import { ToolView } from './components/ToolView';
import { TOOLS } from './data/tools';

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

const MODULE_IDS: ModuleId[] = ['today', 'dashboard', 'crm', 'institutions', 'analytics', 'projects', 'followups', 'tasks', 'notes', 'calendar', 'settings', 'tools'];

function readModule(): ModuleId {
    const saved = localStorage.getItem('ninai_active_module') as ModuleId | null;
    return saved && MODULE_IDS.includes(saved) ? saved : 'dashboard';
}

// --- Tools State ---
function App() {
    const { user, workspace, loading: authLoading, error: authError, logout } = useAuth();
    const [setupComplete, setSetupComplete] = useState(() => localStorage.getItem('ninai_setup_complete') === 'true');

    const [tools, setTools] = useState(() => {
        const saved = localStorage.getItem('ninai_tools');
        let loaded = saved ? JSON.parse(saved) : TOOLS;

        // Migration: Fix duplicate labels (G -> ✨, C -> Cl)
        loaded = loaded.map((t: any) => {
            if (t.id === 'gemini' && t.label === 'G') return { ...t, label: '✨' };
            if (t.id === 'claude' && t.label === 'C') return { ...t, label: 'Cl' };
            return t;
        });

        return loaded;
    });

    const [activeToolId, setActiveToolId] = useState(tools[0].id);
    const activeTool = tools.find((t: any) => t.id === activeToolId) || tools[0];

    useEffect(() => {
        localStorage.setItem('ninai_tools', JSON.stringify(tools));
    }, [tools]);

    const handleAddTool = (name: string, url: string) => {
        const newTool = {
            id: Date.now().toString(),
            name,
            label: name.substring(0, 1).toUpperCase(),
            color: '#86868b',
            url: url.startsWith('http') ? url : `https://${url}`,
            embeddable: true
        };
        setTools([...tools, newTool]);
        setActiveToolId(newTool.id);
    };

    const handleDeleteTool = (id: string) => {
        const newTools = tools.filter((t: any) => t.id !== id);
        setTools(newTools);
        if (activeToolId === id && newTools.length > 0) {
            setActiveToolId(newTools[0].id);
        }
    };

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

    // --- Zen Mode (Full Screen Notes) ---
    const [zenMode, setZenMode] = useState(() => {
        const saved = localStorage.getItem('ninai_zen_mode');
        return saved !== null ? saved === 'true' : true; // Default to TRUE for "only note making mode"
    });

    useEffect(() => {
        localStorage.setItem('ninai_zen_mode', zenMode.toString());
    }, [zenMode]);

    // --- Layout State (Notes panel) ---
    const [isNotesOpen, setIsNotesOpen] = useState(true);

    // Reset transient view state when the active workspace changes.
    const prevWorkspaceId = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (prevWorkspaceId.current && prevWorkspaceId.current !== workspace?.id) {
            setSelectedLeadId(null);
            setSelectedProjectId(null);
            setSelectedTaskId(null);
            setExternalNoteId(null);
            setActiveModule(module => (module === 'tools' ? module : 'dashboard'));
        }
        prevWorkspaceId.current = workspace?.id;
    }, [workspace?.id]);

    // --- Webview Integration (Smart Paste from Browser) ---
    const toolRefs = useRef<Record<string, any>>({}); // Store refs to ToolViews

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

    // --- Webview Integration (Smart Paste from Browser) ---
    const handleImportFromWebview = async (): Promise<{ text: string, html: string } | null> => {
        const activeRef = toolRefs.current[activeToolId];
        if (!activeRef) return null;

        try {
            const html = await activeRef.getSelectionHTML();
            if (html) {
                // Create a temporary element to strip text
                const temp = document.createElement('div');
                temp.innerHTML = html;
                return { text: temp.innerText, html };
            }
        } catch (e) {
            console.error("Failed to import from webview:", e);
        }
        return null;
    };

    const selectTool = (id: string) => {
        const tool = tools.find((t: any) => t.id === id);
        if (!tool) return;
        setActiveToolId(tool.id);
        setActiveModule('tools');
        setZenMode(false);
    };

    const workspaceModule = activeModule !== 'tools';
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
            case 'tools':
            default:
                return null;
        }
    };

    return (
        <>
        <Layout
            sidebar={
                <Sidebar
                    tools={tools}
                    activeToolId={activeTool.id}
                    onSelectTool={selectTool}
                    onAddTool={handleAddTool}
                    onDeleteTool={handleDeleteTool}
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
                    zenMode={notesModule ? false : zenMode}
                    onToggleZenMode={() => setZenMode(!zenMode)}
                    onImportFromWebview={handleImportFromWebview}
                    externalNoteId={externalNoteId}
                    onExternalNoteOpened={() => setExternalNoteId(null)}
                    showZenToggle={!notesModule}
                />
            )}
            zenMode={notesModule ? false : (activeModule === 'tools' ? zenMode : false)}
            fullNotes={notesModule}
            notesLocked={workspaceModule && !notesModule}
            contentHidden={notesModule}
            isNotesOpen={isNotesOpen}
            setNotesOpen={setIsNotesOpen}
        >
            {/* Keep-Alive System: Render ALL tools, toggle visibility */}
            <div style={{ display: activeModule === 'tools' ? 'block' : 'none', height: '100%', width: '100%' }}>
                {tools.map((tool: any) => (
                    <div
                        key={tool.id}
                        style={{
                            display: activeTool.id === tool.id ? 'block' : 'none',
                            height: '100%',
                            width: '100%'
                        }}
                    >
                        <ToolView
                            ref={(el) => {
                                if (el) toolRefs.current[tool.id] = el;
                                else delete toolRefs.current[tool.id];
                            }}
                            tool={tool}
                        />
                    </div>
                ))}
            </div>

            {workspaceModule && !notesModule && renderModule()}
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
