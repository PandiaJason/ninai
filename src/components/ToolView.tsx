
import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import './ToolView.css';
import { type Tool } from '../data/tools';

interface ToolViewProps {
    tool: Tool;
    onMaximize?: () => void;
    isMaximized?: boolean;
}

export interface ToolViewHandle {
    getSelectionHTML: () => Promise<string>;
}

export const ToolView = forwardRef<ToolViewHandle, ToolViewProps>(({ tool, onMaximize, isMaximized }, ref) => {
    const webviewRef = useRef<any>(null);
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useImperativeHandle(ref, () => ({
        getSelectionHTML: async () => {
            const wv = webviewRef.current;
            if (!wv) return '';
            try {
                return await wv.executeJavaScript(`
                    (() => {
                        const sel = window.getSelection();
                        if (sel.rangeCount > 0) {
                            const container = document.createElement("div");
                            container.appendChild(sel.getRangeAt(0).cloneContents());
                            return container.innerHTML;
                        }
                        return "";
                    })()
                `);
            } catch (e) {
                console.error("Failed to get selection from webview:", e);
                return '';
            }
        }
    }));

    useEffect(() => {
        const wv = webviewRef.current;
        if (!wv) return;

        const updateNavState = () => {
            setCanGoBack(wv.canGoBack());
            setCanGoForward(wv.canGoForward());
        };

        const handleStart = () => setIsLoading(true);
        const handleStop = () => {
            setIsLoading(false);
            updateNavState();
        };

        const handleNewWindow = (e: any) => {
            // Logic:
            // 1. If it's a "Link Click" (target=_blank) -> it usually comes as 'foreground-tab' or 'background-tab'.
            //    We want to FORCE these to stay in the single tab (app-like feel).
            // 2. If it's a "Popup" (window.open) -> it comes as 'new-window'.
            //    We want to ALLOW these (e.g. Google Login), as they usually auto-close.

            const isPopup = e.disposition === 'new-window';

            if (isPopup) {
                // Allow Auth Popups relative to the app
                // We proxy it via window.open from the renderer.
                // Note: This relies on the auth flow not checking window.opener strictness across frames, but usually works for OAuth.
                if (e.url) {
                    window.open(e.url);
                }
            } else {
                // Force Link Clicks to stay in the same webview
                if (e.url) {
                    wv.loadURL(e.url);
                }
            }
        };

        wv.addEventListener('did-start-loading', handleStart);
        wv.addEventListener('did-stop-loading', handleStop);
        wv.addEventListener('dom-ready', updateNavState);
        wv.addEventListener('new-window', handleNewWindow);

        // Forward Context Menu
        const handleContextMenu = (e: any) => {
            if (e.params) {
                // Critical: Pass the webview's content ID so main process can target it
                const params = {
                    ...e.params,
                    webContentsId: webviewRef.current?.getWebContentsId()
                };
                // @ts-ignore
                window.electronAPI?.showContextMenu(params);
            }
        };
        wv.addEventListener('context-menu', handleContextMenu);

        return () => {
            if (wv) {
                wv.removeEventListener('did-start-loading', handleStart);
                wv.removeEventListener('did-stop-loading', handleStop);
                wv.removeEventListener('dom-ready', updateNavState);
                wv.removeEventListener('new-window', handleNewWindow);
                wv.removeEventListener('context-menu', handleContextMenu);
            }
        };
    }, [tool.id]); // Re-bind if tool changes, though webview might remount

    const goBack = () => webviewRef.current?.goBack();
    const goForward = () => webviewRef.current?.goForward();
    const reload = () => webviewRef.current?.reload();

    return (
        <div className="tool-view-container">
            {/* Browser Bar */}
            <header className="browser-bar">
                <div className="browser-nav-group">
                    {/* Maximize Toggle (if available) */}
                    {onMaximize && (
                        <button
                            className={`icon-btn ${isMaximized ? 'active' : ''} `}
                            onClick={onMaximize}
                            title={isMaximized ? "Browser is Maximized" : "Maximize Browser"}
                            style={{ marginRight: '6px' }} // Spacing
                        >
                            {!isMaximized ?
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                                :
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
                            }
                        </button>
                    )}

                    <button className="icon-btn" onClick={goBack} disabled={!canGoBack} title="Back">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <button className="icon-btn" onClick={goForward} disabled={!canGoForward} title="Forward">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                    <button className="icon-btn" onClick={reload} title="Reload">
                        {isLoading ? (
                            <span className="spinner-small" />
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        )}
                    </button>
                </div>

                <div className="omnibar">
                    <span className="lock-icon">🔒</span>
                    <span className="url-text">{tool.url}</span>
                </div>

                {/* Placeholder for right-side actions if needed */}
                <div style={{ width: '80px' }}></div>
            </header>

            {/* Main Content Area */}
            <div className="tool-content-area-iframe">
                {/* 
                  Using webview tag for full browser capabilities (login persistence, back/forward).
                  This requires 'webviewTag: true' in main.js
                */}
                <webview
                    ref={webviewRef}
                    src={tool.url}
                    className="tool-frame"
                    allowpopups={true}
                    // @ts-ignore - webview types
                    partition={`persist:${tool.id} `} // Unique partition per tool saves login state
                    useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
                />
            </div>
        </div>
    );
});
