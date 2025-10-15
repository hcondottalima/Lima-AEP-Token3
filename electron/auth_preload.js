const { contextBridge, ipcRenderer } = require('electron');

// Expose a secure, limited API to the renderer process (the Adobe website)
contextBridge.exposeInMainWorld('electronBridge', {
  // Called by the extractor script to send the final payload to the main process
  sendData: (data) => {
    ipcRenderer.send('data-extracted', data);
  },
  // Called by the user from the console to trigger the extraction
  captureContext: () => {
    ipcRenderer.send('user-triggered-extraction');
  }
});
