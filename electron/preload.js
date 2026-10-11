const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pod', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  clearKeys: () => ipcRenderer.invoke('settings:clearKeys'),
  selectPdf: () => ipcRenderer.invoke('dialog:pdf'),
  selectFolder: () => ipcRenderer.invoke('dialog:folder'),
  openFolder: folder => ipcRenderer.invoke('folder:open', folder),
  generate: request => ipcRenderer.invoke('generation:start', request),
  listPodcasts: () => ipcRenderer.invoke('podcasts:list'),
  revealPodcast: audioPath => ipcRenderer.invoke('podcasts:reveal', audioPath),
  onGeneration: callback => ipcRenderer.on('generation:event', (_event, message) => callback(message))
});
