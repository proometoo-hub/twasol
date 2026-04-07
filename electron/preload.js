const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  notify: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  onDeepLink: (callback) => ipcRenderer.on('deep-link', (_, url) => callback(url))
});
