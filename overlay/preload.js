const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  listMaps: () => ipcRenderer.invoke('overlay:list-maps'),
  loadDataset: mapId => ipcRenderer.invoke('overlay:load-dataset', mapId),
  getInteraction: () => ipcRenderer.invoke('overlay:get-interaction'),
  setInteraction: interactive => ipcRenderer.invoke('overlay:set-interaction', interactive),
  toggleInteraction: () => ipcRenderer.invoke('overlay:toggle-interaction'),
  quit: () => ipcRenderer.invoke('overlay:quit'),
  vision: {
    checkDeps: () => ipcRenderer.invoke('vision:check-deps'),
    installDeps: () => ipcRenderer.invoke('vision:install-deps'),
    listWindows: () => ipcRenderer.invoke('vision:list-windows'),
    buildCache: mapId => ipcRenderer.invoke('vision:build-cache', mapId),
    start: options => ipcRenderer.invoke('vision:start', options),
    stop: () => ipcRenderer.invoke('vision:stop'),
    onEvent: callback => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('vision:event', listener);
      return () => ipcRenderer.removeListener('vision:event', listener);
    }
  },
  onInteractionChanged: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('overlay:interaction-changed', listener);
    return () => ipcRenderer.removeListener('overlay:interaction-changed', listener);
  }
});
