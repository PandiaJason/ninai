
import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Icon } from './ui/Icon';
import { type Tool } from '../data/tools';
import './ToolView.css';

interface ToolViewProps {
    tool: Tool;
}

export interface ToolViewHandle {
    getSelectionHTML: () => Promise<string>;
}

export const ToolView = forwardRef<ToolViewHandle, ToolViewProps>(({ tool }, ref) => {
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
            {/* App-style header — no browser chrome */}
            <header className="tool-header">
                <span className="tool-header-mark" style={{ color: tool.color, borderColor: `${tool.color}33`, background: `${tool.color}12` }}>
                    {tool.label}
                </span>
                <span className="tool-header-name">{tool.name}</span>
                <div className="tool-header-actions">
                    <button className="tool-header-btn" onClick={goBack} disabled={!canGoBack} title="Back" aria-label="Go back">
                        <Icon name="arrow-left" size={15} />
                    </button>
                    <button className="tool-header-btn" onClick={goForward} disabled={!canGoForward} title="Forward" aria-label="Go forward">
                        <Icon name="arrow-right" size={15} />
                    </button>
                    <button className="tool-header-btn" onClick={reload} title="Reload" aria-label="Reload">
                        {isLoading ? <span className="spinner-small" /> : <Icon name="refresh" size={14} />}
                    </button>
                </div>
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
                    allowpopups={'true' as unknown as boolean}
                    // @ts-ignore - webview types
                    partition={`persist:${tool.id} `} // Unique partition per tool saves login state
                    useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
                />
            </div>
        </div>
    );
});
