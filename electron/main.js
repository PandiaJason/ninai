import { app, BrowserWindow, session, Menu, MenuItem, clipboard, net, nativeImage, ipcMain, webContents, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

// Force app name to ensure consistent path
app.setName('Ninai');

const createContextMenu = (params, targetWebContents) => {
    const menu = new Menu();
    const wc = targetWebContents; // Short alias

    // 1. Spellcheck
    if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions) {
            menu.append(new MenuItem({
                label: suggestion,
                click: () => wc.replaceMisspelling(suggestion)
            }));
        }
        menu.append(new MenuItem({ type: 'separator' }));
    }

    // 2. Standard Editing (Explicitly target the webContents)
    menu.append(new MenuItem({ label: 'Cut', role: 'cut', enabled: params.editFlags ? params.editFlags.canCut : true, click: () => wc.cut() }));
    menu.append(new MenuItem({ label: 'Copy', role: 'copy', enabled: params.editFlags ? params.editFlags.canCopy : true, click: () => wc.copy() }));
    menu.append(new MenuItem({ label: 'Paste', role: 'paste', enabled: params.editFlags ? params.editFlags.canPaste : true, click: () => wc.paste() }));

    // 3. Image Support (The "Super Copy")
    if (params.mediaType === 'image' || (params.srcURL && params.srcURL.length > 0)) {
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({
            label: 'Copy Image',
            click: async () => {
                if (params.srcURL && params.srcURL.startsWith('http')) {
                    try {
                        // Fetch with cookies & headers
                        const cookies = await session.defaultSession.cookies.get({ url: params.srcURL });
                        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

                        const request = net.request(params.srcURL);
                        if (cookieString) request.setHeader('Cookie', cookieString);
                        request.setHeader('User-Agent', session.defaultSession.getUserAgent());
                        // Critical: Use the actual session User-Agent
                        request.setHeader('User-Agent', session.defaultSession.getUserAgent());

                        // Fix: "Invalid Referrer" error. 
                        // Instead of sending the full page URL (which might be blocked or malformed), 
                        // we send the image's OWN url as the referrer (common anti-hotlink bypass), or just the origin.
                        // Let's try sending the image src as referer (Self-referral) which usually passes.
                        request.setHeader('Referer', params.srcURL);

                        const chunks = [];
                        request.on('response', (response) => {
                            response.on('data', (chunk) => chunks.push(chunk));
                            response.on('end', () => {
                                if (chunks.length === 0) return wc.copyImageAt(params.x, params.y);
                                const buffer = Buffer.concat(chunks);
                                const image = nativeImage.createFromBuffer(buffer);
                                if (!image.isEmpty()) {
                                    clipboard.writeImage(image);
                                } else {
                                    wc.copyImageAt(params.x, params.y);
                                }
                            });
                        });
                        request.on('error', (e) => {
                            console.error('Super Copy Download Error:', e);
                            wc.copyImageAt(params.x, params.y);
                        });
                        request.end();
                    } catch (e) {
                        console.error("Super Copy Failed:", e);
                        wc.copyImageAt(params.x, params.y);
                    }
                } else if (params.srcURL && params.srcURL.startsWith('data:image')) {
                    // RESTORED: Handle Data URIs explicitly (Robust for Google Images)
                    // console.log('Copying Data URI Image directly...');
                    try {
                        const image = nativeImage.createFromDataURL(params.srcURL);
                        clipboard.writeImage(image);
                    } catch (err) {
                        console.error('Data URI copy failed', err);
                        wc.copyImageAt(params.x, params.y);
                    }
                } else {
                    // Fallback for Blob URLs / other
                    // console.log('Fallback to copyImageAt (Blob/Other)');
                    wc.copyImageAt(params.x, params.y);
                }
            }
        }));

        if (params.srcURL) {
            menu.append(new MenuItem({
                label: 'Copy Image Address',
                click: () => clipboard.writeText(params.srcURL)
            }));
        }
    }

    // 4. Inspect Element (Always useful)
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
        label: 'Inspect Element',
        click: () => {
            // webContents.inspectElement(params.x, params.y); // Direct method
            // Or robust way:
            if (!webContents.isDevToolsOpened()) webContents.openDevTools({ mode: 'detach' });
            webContents.inspectElement(params.x, params.y);
        }
    }));

    menu.popup();
};

// --- IPC Handlers (Registered ONCE at top level) ---

// Handle hard reset request from renderer
ipcMain.handle('hard-reset', async () => {
    // console.log('Main: Received hard-reset request. Clearing all storage data...');
    try {
        await session.defaultSession.clearStorageData({
            storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
        });
        // console.log('Main: Storage data cleared.');
        app.relaunch();
        app.quit();
    } catch (err) {
        console.error('Main: Failed to clear storage:', err);
    }
});

// Write a workspace snapshot into a local folder and commit it to Git.
ipcMain.handle('git-export-workspace', async (event, payload) => {
    const json = typeof payload?.json === 'string' ? payload.json : '';
    if (!json) throw new Error('No workspace snapshot was provided.');
    const workspaceName = String(payload?.workspaceName || 'NINAI workspace');
    const message = String(payload?.message || `NINAI snapshot ${new Date().toISOString()}`).slice(0, 240);

    const parent = BrowserWindow.fromWebContents(event.sender) || undefined;
    const selection = await dialog.showOpenDialog(parent, {
        title: 'Choose a Git folder for the NINAI snapshot',
        buttonLabel: 'Export here',
        properties: ['openDirectory', 'createDirectory'],
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };

    const folder = selection.filePaths[0];
    await fs.writeFile(path.join(folder, 'ninai-workspace.json'), json, 'utf8');
    await fs.writeFile(path.join(folder, 'README.md'), [
        `# ${workspaceName}`,
        '',
        'This folder is a NINAI workspace snapshot maintained as plain JSON in Git.',
        '',
        `Exported: ${new Date().toISOString()}`,
        '',
        'Restore it from NINAI → Settings → Versions & backup by downloading the JSON and importing it as a version.',
        '',
    ].join('\n'), 'utf8');

    try {
        await execFileAsync('git', ['--version']);
    } catch {
        return {
            canceled: false,
            path: folder,
            committed: false,
            gitAvailable: false,
            message: 'Snapshot written. Git is not installed, so no commit was created.',
        };
    }

    try {
        await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: folder });
    } catch {
        await execFileAsync('git', ['init'], { cwd: folder });
    }

    try {
        await execFileAsync('git', ['config', 'user.name'], { cwd: folder });
    } catch {
        await execFileAsync('git', ['config', 'user.name', 'NINAI'], { cwd: folder });
    }
    try {
        await execFileAsync('git', ['config', 'user.email'], { cwd: folder });
    } catch {
        await execFileAsync('git', ['config', 'user.email', 'ninai@local'], { cwd: folder });
    }

    await execFileAsync('git', ['add', '-A'], { cwd: folder });
    let committed = false;
    try {
        await execFileAsync('git', ['commit', '-m', message], { cwd: folder });
        committed = true;
    } catch (error) {
        const output = `${error?.stdout || ''} ${error?.stderr || ''} ${error?.message || ''}`;
        if (!output.toLowerCase().includes('nothing to commit')) throw error;
    }

    return {
        canceled: false,
        path: folder,
        committed,
        gitAvailable: true,
        message: committed ? 'Snapshot committed to Git.' : 'No changes to commit.',
    };
});

// IPC Context Menu (For Webviews)
ipcMain.handle('show-context-menu', (event, params) => {
    const guestId = params.webContentsId;
    // console.log(`IPC: show-context-menu received...`);

    const guestContents = guestId ? webContents.fromId(guestId) : null;

    if (guestContents && !guestContents.isDestroyed()) {
        createContextMenu(params, guestContents);
    } else {
        // console.warn(`Could not find guest webContents for guestId: ${guestId}. Falling back to main window.`);
        // Fallback to main window (better than nothing)
        const wins = BrowserWindow.getAllWindows();
        if (wins.length > 0) {
            createContextMenu(params, wins[0].webContents);
        }
    }
});

// --- Clipboard IPC (Robustness Fix) ---
ipcMain.handle('clipboard-read', () => {
    return clipboard.readText();
});

ipcMain.handle('clipboard-read-extended', () => {
    return {
        text: clipboard.readText(),
        html: clipboard.readHTML(),
        rtf: clipboard.readRTF()
    };
});

ipcMain.handle('clipboard-write', (event, text) => {
    clipboard.writeText(text);
    return true;
});

/* ------------------------------------------------------------------ */
/* External links + Google OAuth (loopback)                             */
/* ------------------------------------------------------------------ */

ipcMain.handle('open-external', async (_event, url) => {
    const value = String(url || '');
    if (!/^https?:\/\//i.test(value)) throw new Error('Only http(s) links can be opened.');
    await shell.openExternal(value);
    return true;
});

const gmailOauthRequests = new Map();

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
}

/**
 * Starts a one-shot loopback server so Google can hand the consent code back.
 * Google desktop clients are allowed to redirect to 127.0.0.1 on any port.
 */
ipcMain.handle('gmail-oauth-start', async () => {
    const requestId = randomUUID();
    let resolvePending;
    let rejectPending;
    const promise = new Promise((resolve, reject) => {
        resolvePending = resolve;
        rejectPending = reject;
    });

    const server = http.createServer((request, response) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (!code && !error) {
            response.writeHead(404, { 'Content-Type': 'text/plain' });
            response.end('Not found');
            return;
        }
        const title = error ? 'Google sign-in was not completed' : 'Ninai is connected to Gmail';
        const detail = error
            ? `Google returned: ${escapeHtml(error)}`
            : 'You can close this tab and go back to Ninai.';
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
            <body style="font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;padding:48px;color:#1d1d1f">
            <h2 style="font-size:20px;margin:0 0 8px">${title}</h2>
            <p style="color:#5f5f66;margin:0">${detail}</p></body></html>`);

        const pending = gmailOauthRequests.get(requestId);
        if (pending) {
            gmailOauthRequests.delete(requestId);
            if (error) pending.reject(new Error(`Google sign-in failed: ${error}`));
            else pending.resolve(code);
        }
        setTimeout(() => server.close(), 1000);
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const timer = setTimeout(() => {
        if (!gmailOauthRequests.has(requestId)) return;
        gmailOauthRequests.delete(requestId);
        server.close();
        rejectPending(new Error('Timed out waiting for the Google consent screen.'));
    }, 5 * 60 * 1000);

    gmailOauthRequests.set(requestId, {
        promise,
        resolve: value => { clearTimeout(timer); resolvePending(value); },
        reject: error => { clearTimeout(timer); rejectPending(error); },
    });

    return { requestId, redirectUri: `http://127.0.0.1:${port}` };
});

ipcMain.handle('gmail-oauth-complete', async (_event, requestId) => {
    const pending = gmailOauthRequests.get(requestId);
    if (!pending) throw new Error('No pending Google sign-in.');
    return pending.promise;
});

// Handle PDF Export
ipcMain.handle('print-to-pdf', async (event, title, customHtml) => {
    // console.log('Main: Generating PDF for', title);
    const printWin = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    const safeHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                    padding: 40px; 
                    color: #1a1a1a;
                    max-width: 800px;
                    margin: 0 auto;
                }
                h1 { border-bottom: 1px solid #eaeaea; padding-bottom: 10px; margin-bottom: 20px; }
                img { max-width: 100%; height: auto; border-radius: 4px; }
                blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
                pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
                code { font-family: "SF Mono", "Monaco", "Courier New", monospace; font-size: 0.9em; background: #f5f5f5; padding: 2px 4px; border-radius: 4px; }
                p { line-height: 1.6; margin-bottom: 1em; }
                ul, ol { line-height: 1.6; padding-left: 24px; }
                li { margin-bottom: 4px; }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            ${customHtml}
        </body>
        </html>
    `;

    try {
        await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(safeHtml));

        const pdfData = await printWin.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: { top: 1, bottom: 1, left: 1, right: 1 } // inches
        });

        const { filePath } = await import('electron').then(e => e.dialog.showSaveDialog({
            title: 'Save PDF',
            defaultPath: `${title.replace(/[^a-z0-9\s-_]/gi, '').trim() || 'Note'}.pdf`,
            filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
        }));

        if (filePath) {
            await import('fs').then(fs => fs.promises.writeFile(filePath, pdfData));
            // console.log('Main: PDF Content written to', filePath);
            return { success: true, filePath };
        }
        return { success: false };

    } catch (error) {
        console.error('PDF Generation Error:', error);
        throw error;
    } finally {
        printWin.close();
    }
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        titleBarStyle: 'hiddenInset', // Mac-style seamless titlebar
        webPreferences: {
            webviewTag: true, // Enable <webview>
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(app.getAppPath(), 'electron/preload.js')
        },
        icon: path.join(app.getAppPath(), 'public/icon.png')
    });

    // Load the Vite dev server if in dev mode, else load local file
    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        // In production, load from the dist folder
        // app.getAppPath() points to the bundle root
        win.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
    }

    // Open DevTools in dev mode only
    // if (!app.isPackaged) win.webContents.openDevTools();

    // Native Context Menu (Main Window)
    win.webContents.on('context-menu', (event, params) => {
        createContextMenu(params, win.webContents);
    });
}

app.whenReady().then(() => {
    // CRITICAL: Intercept headers to allow embedding
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = { ...details.responseHeaders };

        // Remove X-Frame-Options to allow embedding
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['X-Frame-Options'];

        // Modify CSP to allow frame ancestors (or remove it)
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['Content-Security-Policy'];

        callback({
            cancel: false,
            responseHeaders,
        });
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
