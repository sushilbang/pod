const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pod', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  clearKeys: () => ipcRenderer.invoke('settings:clearKeys'),
  selectPdf: () => ipcRenderer.invoke('dialog:pdf'),
  selectFolder: () => ipcRenderer.invoke('dialog:folder'),
  openFolder: folder => ipcRenderer.invoke('folder:open', folder),
  generate: pdf => ipcRenderer.invoke('generation:start', pdf),
  onGeneration: callback => ipcRenderer.on('generation:event', (_event, message) => callback(message))
});
