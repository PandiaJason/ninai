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

    const animationFrameRef = React.useRef<number | null>(null);
    const panelRef = React.useRef<HTMLElement>(null);
    const resizerRef = React.useRef<HTMLDivElement>(null);
    const toggleRef = React.useRef<HTMLButtonElement>(null);
    const widthRef = React.useRef(panelWidth);

    const startResizing = React.useCallback(() => {
        setIsResizing(true);
        widthRef.current = panelWidth;
    }, [panelWidth]);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
        setPanelWidth(widthRef.current);
    }, []);

    const resize = React.useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing && panelRef.current) {
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

                animationFrameRef.current = requestAnimationFrame(() => {
                    const newWidth = window.innerWidth - mouseMoveEvent.clientX;
                    if (newWidth > 300 && newWidth < window.innerWidth * 0.8) {
                        widthRef.current = newWidth;

                        // 1. Update Panel Width
                        if (panelRef.current) {
                            panelRef.current.style.width = `${newWidth}px`;
                            const child = panelRef.current.firstElementChild as HTMLElement;
                            if (child) child.style.minWidth = `${newWidth}px`;
                        }

                        // 2. Update Resizer Position (Right edge)
                        if (resizerRef.current) {
                            resizerRef.current.style.right = `${newWidth - 6}px`; // Center of 12px
                        }

                        // 3. Update Toggle Button Position
                        if (toggleRef.current) {
                            toggleRef.current.style.right = `${newWidth + 10}px`;
                        }
                    }
                });
            }
        },
        [isResizing]
    );

    // Sync Ref
    React.useEffect(() => {
        widthRef.current = panelWidth;
    }, [panelWidth]);

    React.useEffect(() => {
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, []);

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
            {!zenMode && (
                <aside className={`layout-sidebar glass ${!isSidebarOpen ? 'collapsed' : ''}`}>
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

            <main className={`layout-content ${zenMode ? 'hidden' : ''}`}>
                {children}
                {!isSidebarOpen && !zenMode && (
                    <button
                        className="sidebar-toggle-floating"
                        onClick={() => setSidebarOpen(true)}
                    >
                        »
                    </button>
                )}
            </main>

            {/* Resizer - Absolute */}
            {!zenMode && isNotesOpen && (
                <div
                    ref={resizerRef}
                    className="resizer"
                    onMouseDown={startResizing}
                    style={{ right: panelWidth - 6 }} // Initial pos
                />
            )}

            <aside
                ref={panelRef}
                className={`layout-insight-panel glass ${!isNotesOpen ? 'collapsed' : ''} ${zenMode ? 'zen-full' : ''}`}
                style={{ width: zenMode ? '100%' : (isNotesOpen ? panelWidth : 0) }}
            >
                <div style={{ minWidth: zenMode ? '100%' : panelWidth, height: '100%' }}>
                    {insightPanel}
                </div>
            </aside>

            {!zenMode && (
                <button
                    ref={toggleRef}
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
