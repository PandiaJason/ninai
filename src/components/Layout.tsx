import React, { type ReactNode } from 'react';
import './Layout.css';

interface LayoutProps {
    sidebar: ReactNode;
    children: ReactNode;
    insightPanel: ReactNode;
    zenMode?: boolean;
    // Full-width notes inside the remaining space, with the sidebar still visible.
    fullNotes?: boolean;
    // Notes panel is forced closed (workspace modules that are not notes).
    notesLocked?: boolean;
    // Hide the main content area while keeping it mounted.
    contentHidden?: boolean;
    // Controlled State
    isNotesOpen: boolean;
    setNotesOpen: (v: boolean) => void;
}

export const Layout: React.FC<LayoutProps> = ({
    sidebar, children, insightPanel, zenMode = false,
    fullNotes = false,
    notesLocked = false,
    contentHidden = false,
    isNotesOpen, setNotesOpen
}) => {
    // Default to 50% width to match "Split View" expectation
    const [panelWidth, setPanelWidth] = React.useState(() => {
        return window.innerWidth * 0.5;
    });
    const [isResizing, setIsResizing] = React.useState(false);
    // macOS uses a hidden inset title bar, so the sidebar keeps room for the traffic lights.
    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

    const notesOnly = zenMode || fullNotes;
    const notesOpen = notesOnly ? true : notesLocked ? false : isNotesOpen;
    const contentVisible = !zenMode && !fullNotes && !contentHidden;

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

    const resetWidth = React.useCallback(() => {
        const half = window.innerWidth * 0.5;
        setPanelWidth(half);
        widthRef.current = half;
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
                            resizerRef.current.style.right = `${newWidth - 6}px`;
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
        <div className={`app-layout ${isResizing ? 'resizing' : ''} ${zenMode ? 'zen-mode' : ''} ${isMac ? 'mac-frame' : ''}`}>
            {!zenMode && (
                <aside className="layout-sidebar glass">
                    {sidebar}
                </aside>
            )}

            <main className={`layout-content ${!contentVisible ? 'hidden' : ''}`}>
                {children}
            </main>

            {/* Resizer - Absolute */}
            {!notesOnly && !notesLocked && notesOpen && (
                <div
                    ref={resizerRef}
                    className="resizer"
                    onMouseDown={startResizing}
                    onDoubleClick={resetWidth}
                    style={{ right: panelWidth - 6 }}
                />
            )}

            <aside
                ref={panelRef}
                className={`layout-insight-panel glass ${!notesOpen ? 'collapsed' : ''} ${zenMode ? 'zen-full' : ''} ${fullNotes ? 'notes-fill' : ''}`}
                style={{
                    width: notesOnly ? (fullNotes ? 'auto' : '100%') : (notesOpen ? panelWidth : 0),
                    flex: fullNotes ? '1 1 auto' : undefined,
                }}
            >
                <div style={{ minWidth: notesOnly ? 0 : panelWidth, height: '100%' }}>
                    {insightPanel}
                </div>
            </aside>

            {!notesOnly && !notesLocked && (
                <button
                    ref={toggleRef}
                    className={`notes-toggle ${!notesOpen ? 'collapsed' : ''}`}
                    onClick={() => setNotesOpen(!isNotesOpen)}
                    style={{ right: notesOpen ? panelWidth + 10 : 10 }}
                    title={notesOpen ? "Collapse Notes" : "Expand Notes"}
                >
                    {notesOpen ? '»' : '«'}
                </button>
            )}
        </div>
    );
};
