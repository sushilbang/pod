const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

let window;
let worker;
const providers = { gemini: 'googleKey', openai: 'openaiKey', anthropic: 'anthropicKey' };

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch { return {}; }
}

function saveSettings(settings) {
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings), { mode: 0o600 });
}

function decrypt(value) {
  if (!value) return '';
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

function pythonPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, process.platform === 'win32' ? 'pod-worker.exe' : 'pod-worker');
  if (process.env.POD_PYTHON) return process.env.POD_PYTHON;
  const local = path.join(app.getAppPath(), '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return fs.existsSync(local) ? local : (process.platform === 'win32' ? 'python' : 'python3');
}

function workerPath() {
  const root = app.isPackaged ? path.join(app.getAppPath(), 'backend', 'tasks.py') : path.join(__dirname, '..', 'backend', 'tasks.py');
  return root.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

function ffmpegPath() {
  const binary = require('ffmpeg-static');
  return binary.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

function createWindow() {
  window = new BrowserWindow({
    width: 1180, height: 820, minWidth: 760, minHeight: 600,
    backgroundColor: '#071526',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.setMenuBarVisibility(false);
  window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (worker) worker.kill(); });

ipcMain.handle('settings:get', () => {
  const settings = readSettings();
  return {
    outputDir: settings.outputDir || app.getPath('music'),
    provider: settings.provider || 'gemini',
    hasGoogleKey: !!settings.googleKey,
    hasOpenaiKey: !!settings.openaiKey,
    hasAnthropicKey: !!settings.anthropicKey,
    hasElevenlabsKey: !!settings.elevenlabsKey,
    secureStorage: safeStorage.isEncryptionAvailable()
  };
});

ipcMain.handle('settings:save', (_event, update) => {
  const settings = readSettings();
  if (update.outputDir !== undefined) {
    if (!fs.existsSync(update.outputDir) || !fs.statSync(update.outputDir).isDirectory()) throw new Error('Choose an existing output folder.');
    settings.outputDir = update.outputDir;
  }
  if (update.provider !== undefined) {
    if (!Object.hasOwn(providers, update.provider)) throw new Error('Choose a supported text provider.');
    settings.provider = update.provider;
  }
  const keyFields = ['googleKey', 'openaiKey', 'anthropicKey', 'elevenlabsKey'];
  if (keyFields.some(field => update[field]?.trim())) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Encrypted key storage is unavailable on this computer.');
    for (const field of keyFields) {
      if (update[field]?.trim()) settings[field] = safeStorage.encryptString(update[field].trim()).toString('base64');
    }
  }
  saveSettings(settings);
  return true;
});

ipcMain.handle('settings:clearKeys', () => {
  const settings = readSettings();
  delete settings.googleKey;
  delete settings.openaiKey;
  delete settings.anthropicKey;
  delete settings.elevenlabsKey;
  saveSettings(settings);
  return true;
});

ipcMain.handle('dialog:pdf', async () => {
  const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('dialog:folder', async () => {
  const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('folder:open', async (_event, folder) => {
  const settings = readSettings();
  if (folder !== settings.outputDir) throw new Error('Folder does not match the configured output folder.');
  return shell.openPath(folder);
});

ipcMain.handle('generation:start', (_event, pdfPath) => {
  if (worker) throw new Error('A podcast is already being generated.');
  const settings = readSettings();
  const provider = settings.provider || 'gemini';
  const keyField = providers[provider];
  if (!keyField || !settings[keyField] || !settings.elevenlabsKey || !settings.outputDir) throw new Error('Save the selected text provider key, ElevenLabs key, and output folder first.');
  if (typeof pdfPath !== 'string' || path.extname(pdfPath).toLowerCase() !== '.pdf' || !fs.existsSync(pdfPath)) throw new Error('Choose a PDF document.');
  if (!fs.existsSync(settings.outputDir)) throw new Error('The output folder no longer exists.');
  const child = spawn(pythonPath(), app.isPackaged ? [] : [workerPath()], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, POD_FFMPEG: ffmpegPath() }
  });
  worker = child;
  let buffer = '';
  let reportedError = false;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => {
    buffer += data;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      try {
        const message = JSON.parse(line);
        if (message.event === 'error') reportedError = true;
        if (message.event === 'complete' && message.audio_path) message.audio_url = pathToFileURL(message.audio_path).href;
        window?.webContents.send('generation:event', message);
      } catch { /* Ignore non-protocol output. */ }
    }
  });
  child.on('error', error => {
    reportedError = true;
    window?.webContents.send('generation:event', { event: 'error', message: `Could not start Python: ${error.message}` });
  });
  child.on('close', code => {
    worker = null;
    if (code && !reportedError) window?.webContents.send('generation:event', { event: 'error', message: 'Generation stopped unexpectedly. Check that Python dependencies and ffmpeg are installed.' });
  });
  child.stdin.end(JSON.stringify({
    pdf_path: pdfPath, output_dir: settings.outputDir, provider,
    llm_key: decrypt(settings[keyField]), elevenlabs_key: decrypt(settings.elevenlabsKey)
  }));
  return true;
});
