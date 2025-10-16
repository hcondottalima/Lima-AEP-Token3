const { contextBridge, ipcRenderer } = require('electron');

// Expose a secure API to the renderer process (ui/window.js)
contextBridge.exposeInMainWorld('api', {
  // Function that the UI can call to register a listener for context updates.
  onContextUpdate: (callback) => {
    ipcRenderer.on('context-updated', (event, data) => callback(data));
  },
  
  // Function for the UI to request the current context from the main process.
  requestContext: () => {
    ipcRenderer.send('request-context');
  },

  // Generic function for making authenticated AEP requests
  aepRequest: (payload) => ipcRenderer.invoke('aep-request', payload),
  
  // Function to trigger a re-authentication flow
  reauthenticate: () => ipcRenderer.send('re-authenticate'),

  // Function to save a CSV file
  saveCsv: (content) => ipcRenderer.send('save-csv', content),

  openExternal: (url) => ipcRenderer.send('open-external', url)
});