const { contextBridge, ipcRenderer, clipboard } = require('electron');

// console.log('Preload script loaded successfully');

contextBridge.exposeInMainWorld('electronAPI', {
    hardReset: () => ipcRenderer.invoke('hard-reset'),
    showContextMenu: (params) => ipcRenderer.invoke('show-context-menu', params),
    printToPDF: (title, html) => ipcRenderer.invoke('print-to-pdf', title, html),
    exportToGit: (payload) => ipcRenderer.invoke('git-export-workspace', payload),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    gmailOAuth: {
        start: () => ipcRenderer.invoke('gmail-oauth-start'),
        complete: (requestId) => ipcRenderer.invoke('gmail-oauth-complete', requestId),
    },
    clipboard: {
        readText: () => ipcRenderer.invoke('clipboard-read'),
        readExtended: () => ipcRenderer.invoke('clipboard-read-extended'),
        writeText: (text) => ipcRenderer.invoke('clipboard-write', text)
    }
});
