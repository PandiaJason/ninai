import React, { type ReactNode } from 'react';
import './Layout.css';

interface LayoutProps {
    sidebar: ReactNode;
    children: ReactNode;
    insightPanel: ReactNode;
    zenMode?: boolean;
    // Controlled State
    isSidebarOpen: boolean;
    setSidebarOpen: (v: boolean) => void;
    isNotesOpen: boolean;
    setNotesOpen: (v: boolean) => void;
}

export const Layout: React.FC<LayoutProps> = ({
    sidebar, children, insightPanel, zenMode = false,
    isSidebarOpen, setSidebarOpen, isNotesOpen, setNotesOpen
}) => {
    // Default to 50% width to match "Split View" expectation
    const [panelWidth, setPanelWidth] = React.useState(() => {
        return window.innerWidth * 0.5;
    });
    const [isResizing, setIsResizing] = React.useState(false);

    // Collapsible States (Managed by Parent now)
    // const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
    // const [isNotesOpen, setIsNotesOpen] = React.useState(true);

    const startResizing = React.useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = React.useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing) {
                const newWidth = window.innerWidth - mouseMoveEvent.clientX;
                // Constraints: Min 300px, Max 80% of screen
                if (newWidth > 300 && newWidth < window.innerWidth * 0.8) {
                    setPanelWidth(newWidth);
                }
            }
        },
        [isResizing]
    );

    React.useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    return (
        <div className={`app-layout ${isResizing ? 'resizing' : ''} ${zenMode ? 'zen-mode' : ''}`}>
            {/* Sidebar - Hidden in Zen Mode */}
            {!zenMode && (
                <aside
                    className={`layout-sidebar glass ${!isSidebarOpen ? 'collapsed' : ''}`}
                >
                    {sidebar}
                    <button
                        className="sidebar-toggle"
                        onClick={() => setSidebarOpen(!isSidebarOpen)}
                        title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                    >
                        {isSidebarOpen ? '«' : '»'}
                    </button>
                </aside>
            )}

            {/* Main Content - Hidden in Zen Mode */}
            <main className={`layout-content ${zenMode ? 'hidden' : ''}`}>
                {children}
                {/* Left Toggle when collapsed - floating */}
                {!isSidebarOpen && !zenMode && (
                    <button
                        className="sidebar-toggle-floating"
                        onClick={() => setSidebarOpen(true)}
                    >
                        »
                    </button>
                )}
            </main>

            {/* Resizer - Hidden in Zen Mode */}
            {!zenMode && isNotesOpen && <div className="resizer" onMouseDown={startResizing} />}

            <aside
                className={`layout-insight-panel glass ${!isNotesOpen ? 'collapsed' : ''} ${zenMode ? 'zen-full' : ''}`}
                style={{ width: zenMode ? '100%' : (isNotesOpen ? panelWidth : 0) }}
            >
                <div style={{ minWidth: zenMode ? '100%' : panelWidth, height: '100%' }}>
                    {insightPanel}
                </div>
            </aside>

            {/* Floating Toggle for Notes - Hidden in Zen Mode */}
            {!zenMode && (
                <button
                    className={`notes-toggle ${!isNotesOpen ? 'collapsed' : ''}`}
                    onClick={() => setNotesOpen(!isNotesOpen)}
                    style={{ right: isNotesOpen ? panelWidth + 10 : 10 }}
                    title={isNotesOpen ? "Collapse Notes" : "Expand Notes"}
                >
                    {isNotesOpen ? '»' : '«'}
                </button>
            )}
        </div>
    );
};
