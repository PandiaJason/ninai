const { contextBridge, ipcRenderer, clipboard } = require('electron');

console.log('Preload script loaded successfully');

contextBridge.exposeInMainWorld('electronAPI', {
    hardReset: () => ipcRenderer.invoke('hard-reset'),
    showContextMenu: (params) => ipcRenderer.invoke('show-context-menu', params),
    printToPDF: (title, html) => ipcRenderer.invoke('print-to-pdf', title, html),
    clipboard: {
        readText: () => ipcRenderer.invoke('clipboard-read'),
        readExtended: () => ipcRenderer.invoke('clipboard-read-extended'),
        writeText: (text) => ipcRenderer.invoke('clipboard-write', text)
    }
});
