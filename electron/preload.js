const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    hardReset: () => ipcRenderer.invoke('hard-reset'),
    showContextMenu: (params) => ipcRenderer.invoke('show-context-menu', params),
    printToPDF: (title, html) => ipcRenderer.invoke('print-to-pdf', title, html)
});
