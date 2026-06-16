const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getMacAddress: () => ipcRenderer.invoke('get-mac-address'),
  verifyLogin: (payload) => ipcRenderer.invoke('verify-login', payload),
  checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
  triggerAppUpdate: (payload) => ipcRenderer.invoke('trigger-app-update', payload),
  onUpdateProgress: (callback) => {
    const subscription = (event, progress) => callback(progress);
    ipcRenderer.on('update-progress', subscription);
    return () => ipcRenderer.removeListener('update-progress', subscription);
  },
  sendWindowAction: (action) => ipcRenderer.send('window-action', action)
});
