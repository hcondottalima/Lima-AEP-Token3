
const { app, BrowserWindow, ipcMain, net, dialog, shell } = require('electron');
const path = require('path');

let mainWindow;
let authWindow;
let storedAuthContext = null; // Variable to store the auth context
let loginTimeout = null; // Timeout to show login window

const ADOBE_LOGIN_URL = 'https://experience.adobe.com';

function startAuthentication(interactive = false) {
  if (authWindow) {
    authWindow.close();
  }
  createAuthWindow(interactive);
}

function createAuthWindow(interactive = false) {
  const options = {
    width: 1000,
    height: 700,
    show: interactive,
    webPreferences: {
      preload: path.join(__dirname, 'auth_preload.js'),
      contextIsolation: true,
      webSecurity: false
    }
  };

  if (interactive && mainWindow) {
    options.parent = mainWindow;
    options.modal = true;
  }

  authWindow = new BrowserWindow(options);
  authWindow.isInteractiveInitialLoad = interactive;

      const platform = process.platform;
  let userAgent;

  if (platform === 'win32') {
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  } else if (platform === 'linux') {
    userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  } else {
    // Fallback for other platforms like macOS, or a generic one
    userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  }

  authWindow.loadURL(ADOBE_LOGIN_URL, { userAgent: userAgent });

  authWindow.webContents.openDevTools({ mode: 'detach' });

  if (!interactive) {
    loginTimeout = setTimeout(() => {
      if (authWindow && !authWindow.isDestroyed()) {
        console.log('Login timeout reached. Showing auth window for manual login.');
        authWindow.show();
      }
    }, 30000);

    authWindow.webContents.on('dom-ready', async () => {
        try {
            const currentURL = await authWindow.webContents.executeJavaScript('window.location.href');
            if (currentURL.startsWith('https://experience.adobe.com/')) {
                const extractorCode = require('fs').readFileSync(path.join(__dirname, 'extractor.js'), 'utf8');
                await authWindow.webContents.executeJavaScript(extractorCode);
            }
        } catch (e) { /* Ignore errors */ }
    });
  }

  authWindow.on('closed', () => { authWindow = null; });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    }
  });
  mainWindow.loadFile(path.join(__dirname, '../ui/window.html'));
  mainWindow.webContents.openDevTools({ mode: 'detach' });
  mainWindow.on('closed', () => { mainWindow = null; });
}

let storedPayload = null;

ipcMain.on('data-extracted', (event, payload) => {
  if (loginTimeout) {
    clearTimeout(loginTimeout);
    loginTimeout = null;
  }

  if (payload && !payload.error && payload.tokenInfo) {
    console.log('Data received from extractor script.');
    storedPayload = payload;
    
    storedAuthContext = {
      token: payload.tokenInfo.token,
      orgId: payload.imsOrg
    };

    if (!mainWindow) {
      createWindow();
    }
    
    mainWindow.show();
    mainWindow.webContents.send('context-updated', storedPayload);

    if (authWindow) {
      authWindow.close();
    }
  } else if (payload && payload.error) {
    console.error('Extractor script sent an error:', payload.error);
  }
});

ipcMain.on('user-triggered-extraction', async () => {
    if (authWindow) {
        console.log('User triggered extraction. Running script...');
        const extractorCode = require('fs').readFileSync(path.join(__dirname, 'extractor.js'), 'utf8');
        await authWindow.webContents.executeJavaScript(extractorCode);
    }
});

ipcMain.on('re-authenticate', () => {
  console.log('Re-authentication requested from UI.');
  startAuthentication(true);
});

ipcMain.on('request-context', () => {
  if (mainWindow && storedPayload) {
    console.log('Renderer requested context. Sending stored payload.');
    mainWindow.webContents.send('context-updated', storedPayload);
  }
});

// Generic AEP request handler
ipcMain.handle('aep-request', async (event, { path, params, sandboxName, baseUrl = 'https://platform.adobe.io', apiKey = 'acp_ui_platform' }) => {
  if (!storedAuthContext) {
    throw new Error('Authentication context is not available.');
  }

  const fullUrl = `${baseUrl}${path}${params ? '?' + params : ''}`;

  console.log(`Making AEP request to: ${fullUrl}`);

  const myHeaders = {
    "Accept": "application/json",
    "Authorization": `Bearer ${storedAuthContext.token}`,
    "x-api-key": apiKey,
    "x-gw-ims-org-id": storedAuthContext.orgId,
    "x-sandbox-name": sandboxName,
  };

  const request = net.request({
    method: 'GET',
    url: fullUrl,
    headers: myHeaders
  });

  return new Promise((resolve, reject) => {
    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { body += chunk.toString(); });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject({ message: 'Failed to parse JSON response.', body });
          }
        } else {
          reject({
            message: `API request failed with status ${response.statusCode}`,
            statusCode: response.statusCode,
            body: body
          });
        }
      });
    });
    request.on('error', (error) => { reject(error); });
    request.end();
  });
});

// Handle CSV saving
ipcMain.on('save-csv', (event, content) => {
  if (!mainWindow) return;

  dialog.showSaveDialog(mainWindow, {
    title: 'Salvar Relatório de Audiência',
    defaultPath: 'relatorio-audiencia.csv',
    filters: [
      { name: 'CSV Files', extensions: ['csv'] }
    ]
  }).then(result => {
    if (!result.canceled && result.filePath) {
      require('fs').writeFile(result.filePath, content, (err) => {
        if (err) {
          console.error('Failed to save the file:', err);
        } else {
          console.log('File saved successfully:', result.filePath);
        }
      });
    }
  }).catch(err => {
    console.error('Error showing save dialog:', err);
  });
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

app.whenReady().then(() => {
  startAuthentication();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      startAuthentication();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
