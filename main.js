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

  if (process.platform === 'win32') {
    const cmdString = `"${nodeExe}" "${nextBin}" ${command} -p ${PORT}`;
    console.log(`[Electron Launcher] Spawning Next.js server via command string: ${cmdString}`);
    nextProcess = spawn(cmdString, [], {
      cwd: appPath,
      env: { 
        ...process.env, 
        NODE_ENV: isDev ? 'development' : 'production',
        ELECTRON_PACKAGED: app.isPackaged ? 'true' : 'false'
      },
      shell: true
    });
  } else {
    nextProcess = spawn(nodeExe, [nextBin, command, '-p', PORT.toString()], {
      cwd: appPath,
      env: { 
        ...process.env, 
        NODE_ENV: isDev ? 'development' : 'production',
        ELECTRON_PACKAGED: app.isPackaged ? 'true' : 'false'
      },
      shell: false
    });
  }

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
    show: true, // Show the window immediately on start!
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Disable CORS to allow direct fetch calls to Google Apps Script
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenu(null);
  
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
  const apiEndpoint = 'https://script.google.com/macros/s/AKfycbzEC1f4NUh-7EP2C8MP4-yFEOrWsACseXyL7qUG6c3NgJ-Ol5XWhVrjGWo2kDbyrMY/exec';
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

// Handle IPC query for system self-updating (downloads latest release setup .exe and runs it)
ipcMain.handle('trigger-app-update', async (event, { token, version }) => {
  try {
    const repoOwner = 'ranroncaro2-art';
    const repoName = 'ToolMangaPro';
    
    // 1. Fetch release details from GitHub API to locate the setup asset
    const releaseUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/tags/v${version}`;
    const headers = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'ToolMangaPro-Updater'
    };
    if (token && token.trim() !== '') {
      headers['Authorization'] = `Bearer ${token.trim()}`;
    }
    
    console.log(`[Updater] Fetching release metadata for version: v${version}...`);
    const releaseRes = await fetch(releaseUrl, { headers });
    if (!releaseRes.ok) {
      throw new Error(`GitHub API returned status ${releaseRes.status}: ${releaseRes.statusText}`);
    }
    
    const releaseData = await releaseRes.json();
    const assets = releaseData.assets || [];
    // Find the installer asset that ends with .exe
    const asset = assets.find(a => a.name.endsWith('.exe'));
    if (!asset) {
      throw new Error(`Không tìm thấy file cài đặt (.exe) trong bản phát hành v${version}.`);
    }
    
    console.log(`[Updater] Found setup asset: ${asset.name}. Starting download...`);
    
    const tempDir = app.getPath('temp');
    const tempExePath = path.join(tempDir, `ToolMangaPro_Setup_${version}.exe`);
    
    // Clean up existing setup file if present
    if (fs.existsSync(tempExePath)) {
      try { fs.unlinkSync(tempExePath); } catch (_) {}
    }
    
    // 2. Download setup binary using Node fetch streaming
    const downloadHeaders = {
      'Accept': 'application/octet-stream',
      'User-Agent': 'ToolMangaPro-Updater'
    };
    if (token && token.trim() !== '') {
      downloadHeaders['Authorization'] = `Bearer ${token.trim()}`;
    }
    
    const downloadRes = await fetch(asset.url, { headers: downloadHeaders });
    if (!downloadRes.ok) {
      throw new Error(`Tải file thất bại (Status: ${downloadRes.status})`);
    }
    
    const fileStream = fs.createWriteStream(tempExePath);
    const reader = downloadRes.body.getReader();
    const contentLength = Number(downloadRes.headers.get('content-length')) || 0;
    let receivedLength = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      fileStream.write(value);
      receivedLength += value.length;
      
      if (contentLength > 0 && mainWindow) {
        const percent = Math.round((receivedLength / contentLength) * 100);
        mainWindow.webContents.send('update-progress', { status: 'downloading', percent });
      }
    }
    fileStream.end();
    
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

