const { spawn } = require('child_process');
const path = require('path');
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const os = require('os');
const http = require('http');
const fs = require('fs');

let nextProcess = null;
let mainWindow = null;
const PORT = 3005;

// Function to start the Next.js production or development server
function startNextServer() {
  const nextBin = path.join(app.getAppPath(), 'node_modules', 'next', 'dist', 'bin', 'next');
  const appPath = app.getAppPath();
  
  console.log('[Electron Launcher] App Path:', appPath);
  console.log('[Electron Launcher] Next.js Binary:', nextBin);

  // Run 'start' if a Next.js production build exists (.next folder) or if app is packaged.
  // Otherwise fallback to 'dev' mode.
  const hasNextBuild = fs.existsSync(path.join(appPath, '.next'));
  const isDev = !app.isPackaged && !hasNextBuild;
  
  const command = isDev ? 'dev' : 'start';
  console.log(`[Electron Launcher] Launching Next.js server in "${command}" mode on port ${PORT}...`);

  // Use bundled node.exe when packaged to avoid dependency on global node.js
  const nodeExe = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'node.exe')
    : 'node';

  console.log(`[Electron Launcher] Spawning Next.js server: "${nodeExe}" "${nextBin}" ${command} -p ${PORT}`);
  nextProcess = spawn(nodeExe, [nextBin, command, '-p', PORT.toString()], {
    cwd: appPath,
    env: { 
      ...process.env, 
      NODE_ENV: isDev ? 'development' : 'production',
      ELECTRON_PACKAGED: app.isPackaged ? 'true' : 'false'
    },
    shell: false
  });

  nextProcess.stdout.on('data', (data) => {
    console.log(`[Next.js Server]: ${data.toString().trim()}`);
  });

  nextProcess.stderr.on('data', (data) => {
    console.error(`[Next.js Server Error]: ${data.toString().trim()}`);
  });
}

// Function to poll the local server until it responds, ensuring we don't load a blank webview
function checkServerReady(callback) {
  const req = http.get(`http://localhost:${PORT}`, (res) => {
    console.log(`[Electron Launcher] Next.js server ready (HTTP status: ${res.statusCode})`);
    callback();
  });

  req.on('error', () => {
    console.log('[Electron Launcher] Server not ready yet. Retrying in 250ms...');
    setTimeout(() => checkServerReady(callback), 250);
  });

  req.end();
}

// Function to create the Electron app window
function createWindow() {
  // Hide standard electron application menu bar
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'TOOL MANGA ANIME PRO',
    icon: path.join(__dirname, 'public', 'logo.png'),
    show: true, // Show the window immediately on start!
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Disable CORS to allow direct fetch calls to Google Apps Script
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenu(null);
  
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Browser Console]: ${message} (from ${sourceId}:${line})`);
  });
  
  // Load local static loading splash screen instantly
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Function to cleanly terminate the Next.js process tree
function killNextProcess() {
  if (nextProcess) {
    console.log('[Electron Launcher] Terminating Next.js server process tree...');
    const pid = nextProcess.pid;
    if (pid) {
      if (process.platform === 'win32') {
        // Force kill entire process tree on Windows to prevent orphaned background processes
        spawn('taskkill', ['/pid', pid.toString(), '/f', '/t'], { shell: true });
      } else {
        nextProcess.kill('SIGINT');
      }
    }
    nextProcess = null;
  }
}

// Electron Application Lifecycle Listeners
app.whenReady().then(() => {
  createWindow(); // Create and show window immediately with splash screen
  startNextServer(); // Start the server in the background
  checkServerReady(() => {
    // Once Next.js is fully loaded and ready, load the local server URL
    if (mainWindow) {
      mainWindow.loadURL(`http://localhost:${PORT}`);
    }
  });
});

app.on('will-quit', () => {
  killNextProcess();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle IPC query for system MAC address
ipcMain.handle('get-mac-address', () => {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          return iface.mac.toUpperCase();
        }
      }
    }
  } catch (err) {
    console.error('Error fetching MAC address:', err);
  }
  return 'MAC-NOT-FOUND';
});

// Handle IPC query for login verification (runs in Node.js main process, bypassing CORS)
ipcMain.handle('verify-login', async (event, payload) => {
  const apiEndpoint = 'https://script.google.com/macros/s/AKfycbx0hbnhKtbENSTCO5qUOj02vcf4qy8Z7LFKXvsYUpbE9p-pg1zF9_n6GRZuMLgRwQk/exec';
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    if (!response.ok) {
      return { success: false, message: `Server returned status ${response.status}` };
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Error in IPC verify-login:', err);
    return { success: false, message: 'Lỗi kết nối máy chủ: ' + err.message };
  }
});

// Helper to resolve Google Drive file ID from URL
function getGoogleDriveFileId(url) {
  if (!url) return null;
  url = url.trim();
  const driveRegex = /(?:https?:\/\/)?(?:drive\.google\.com)\/(?:file\/d\/([a-zA-Z0-9_-]+)|open\?id=([a-zA-Z0-9_-]+))/i;
  const match = url.match(driveRegex);
  if (match) {
    return match[1] || match[2];
  }
  return null;
}

// Robust file downloader supporting Google Drive large files warning bypass
async function downloadFileWithBypass(url, destPath, onProgress) {
  const fileId = getGoogleDriveFileId(url);
  
  let downloadUrl = url;
  let headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ToolMangaPro-Updater'
  };

  if (fileId) {
    const initialUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    console.log(`[Updater] Requesting initial: ${initialUrl}`);
    
    const response = await fetch(initialUrl, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Google Drive returned status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const htmlText = await response.text();
      console.log('[Updater] HTML warning page detected. Extracting form fields...');
      
      const actionMatch = htmlText.match(/action="([^"]+)"/);
      const actionUrl = actionMatch ? actionMatch[1] : 'https://drive.usercontent.google.com/download';
      
      const params = new URLSearchParams();
      const inputRegex = /<input type="hidden" name="([^"]+)" value="([^"]+)"/g;
      let match;
      while ((match = inputRegex.exec(htmlText)) !== null) {
        params.append(match[1], match[2]);
      }
      
      if (!params.has('confirm')) {
        params.append('id', fileId);
        params.append('export', 'download');
        params.append('confirm', 't');
      }

      // Forward cookies
      const cookieHeaders = response.headers.getSetCookie ? response.headers.getSetCookie() : response.headers.get('set-cookie');
      if (cookieHeaders && cookieHeaders.length > 0) {
        const cookieStr = Array.isArray(cookieHeaders) 
          ? cookieHeaders.map(c => c.split(';')[0]).join('; ') 
          : cookieHeaders.split(';')[0];
        headers['Cookie'] = cookieStr;
      }

      downloadUrl = `${actionUrl}?${params.toString()}`;
    } else {
      // It is directly the file!
      console.log('[Updater] Direct download starting...');
      await saveStreamToFile(response, destPath, onProgress);
      return;
    }
  }

  console.log(`[Updater] Downloading from resolved URL: ${downloadUrl}`);
  const downloadRes = await fetch(downloadUrl, { headers, redirect: 'follow' });
  if (!downloadRes.ok) {
    throw new Error(`Tải file thất bại (Status: ${downloadRes.status})`);
  }

  await saveStreamToFile(downloadRes, destPath, onProgress);
}

// Helper to save body stream to file with progress callback
async function saveStreamToFile(response, destPath, onProgress) {
  const fileStream = fs.createWriteStream(destPath);
  const reader = response.body.getReader();
  const contentLength = Number(response.headers.get('content-length')) || 0;
  let receivedLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    fileStream.write(value);
    receivedLength += value.length;

    if (contentLength > 0 && onProgress) {
      const percent = Math.round((receivedLength / contentLength) * 100);
      onProgress(percent);
    }
  }
  fileStream.end();
}

// Handle IPC query to check update version from Google Sheets
ipcMain.handle('check-app-update', async () => {
  const apiEndpoint = 'https://script.google.com/macros/s/AKfycbx0hbnhKtbENSTCO5qUOj02vcf4qy8Z7LFKXvsYUpbE9p-pg1zF9_n6GRZuMLgRwQk/exec';
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'check_update' }),
      redirect: 'follow'
    });

    if (!response.ok) {
      return { success: false, error: `Google API returned status ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Error checking app update:', err);
    return { success: false, error: 'Lỗi kết nối máy chủ Google: ' + err.message };
  }
});

// Handle IPC query for system self-updating (downloads setup .exe and runs it)
ipcMain.handle('trigger-app-update', async (event, { url, version }) => {
  try {
    if (!url || url.trim() === '') {
      throw new Error('Đường dẫn tải bản cập nhật không hợp lệ.');
    }

    const tempDir = app.getPath('temp');
    const tempExePath = path.join(tempDir, `ToolMangaPro_Setup_${version}.exe`);
    
    // Clean up existing setup file if present
    if (fs.existsSync(tempExePath)) {
      try { fs.unlinkSync(tempExePath); } catch (_) {}
    }
    
    console.log(`[Updater] Starting download for version ${version} to: ${tempExePath}...`);
    
    await downloadFileWithBypass(url, tempExePath, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-progress', { status: 'downloading', percent });
      }
    });
    
    console.log('[Updater] Download finished successfully. Path:', tempExePath);
    
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', { status: 'installing', percent: 100 });
    }
    
    // Give OS a moment to write cache to disk
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // If running in development mode, don't execute and quit, just expose the path
    if (!app.isPackaged) {
      console.log('[Updater] Dev mode: Skipping installer execution.');
      return { success: true, isDev: true, path: tempExePath };
    }
    
    // 3. Spawn the installer and quit the app
    console.log('[Updater] Launching installer...');
    const { spawn } = require('child_process');
    const child = spawn(tempExePath, [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    
    // Terminate local Next server cleanly
    killNextProcess();
    
    // Quit Electron app so installer can overwrite files
    setTimeout(() => {
      app.quit();
    }, 500);
    
    return { success: true };
  } catch (err) {
    console.error('[Updater Error]:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// Handle custom window actions from HTML menu bar
ipcMain.on('window-action', (event, action) => {
  if (!mainWindow) return;
  if (action === 'reload') {
    mainWindow.reload();
  } else if (action === 'toggle-devtools') {
    mainWindow.webContents.toggleDevTools();
  } else if (action === 'toggle-fullscreen') {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  } else if (action === 'minimize') {
    mainWindow.minimize();
  } else if (action === 'close') {
    mainWindow.close();
  } else if (action === 'exit') {
    killNextProcess();
    app.quit();
  }
});

