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

function episodesPath() {
  return path.join(app.getPath('userData'), 'episodes.json');
}

function configuredOutputDir() {
  return readSettings().outputDir || app.getPath('music');
}

function readEpisodes() {
  try {
    const value = JSON.parse(fs.readFileSync(episodesPath(), 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function listEpisodes() {
  const byPath = new Map();
  for (const episode of readEpisodes()) {
    if (episode && typeof episode.audio_path === 'string' && fs.existsSync(episode.audio_path)) {
      byPath.set(episode.audio_path, episode);
    }
  }
  const folder = configuredOutputDir();
  if (fs.existsSync(folder)) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.mp3') continue;
      const audio = path.join(folder, entry.name);
      const script = path.join(folder, `${path.parse(entry.name).name}.txt`);
      if (!fs.existsSync(script) || byPath.has(audio)) continue;
      byPath.set(audio, {
        title: path.parse(entry.name).name,
        audio_path: audio,
        script_path: script,
        created_at: fs.statSync(audio).mtime.toISOString()
      });
    }
  }
  return [...byPath.values()]
    .map(episode => ({ ...episode, audio_url: pathToFileURL(episode.audio_path).href }))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function rememberEpisode(message) {
  const episodes = readEpisodes().filter(episode => episode.audio_path !== message.audio_path);
  episodes.unshift({
    title: message.title || path.parse(message.audio_path).name,
    audio_path: message.audio_path,
    script_path: message.script_path,
    created_at: new Date().toISOString()
  });
  fs.mkdirSync(path.dirname(episodesPath()), { recursive: true });
  fs.writeFileSync(episodesPath(), JSON.stringify(episodes, null, 2), { mode: 0o600 });
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
    backgroundColor: '#f4f4f2',
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
    outputDir: configuredOutputDir(),
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
  if (folder !== configuredOutputDir()) throw new Error('Folder does not match the configured output folder.');
  return shell.openPath(folder);
});

ipcMain.handle('podcasts:list', () => listEpisodes());
ipcMain.handle('podcasts:reveal', (_event, audioPath) => {
  const episode = listEpisodes().find(item => item.audio_path === audioPath);
  if (!episode) throw new Error('This podcast is no longer available.');
  shell.showItemInFolder(episode.audio_path);
  return true;
});

ipcMain.handle('generation:start', (_event, request) => {
  if (worker) throw new Error('A podcast is already being generated.');
  const settings = readSettings();
  const pdfPath = request?.pdfPath;
  const rawInstruction = request?.instruction ?? '';
  if (typeof rawInstruction !== 'string' || rawInstruction.length > 2000) throw new Error('Keep the episode direction under 2,000 characters.');
  const instruction = rawInstruction.trim();
  const outputDir = configuredOutputDir();
  const provider = settings.provider || 'gemini';
  const keyField = providers[provider];
  if (!keyField || !settings[keyField] || !settings.elevenlabsKey) throw new Error('Save the selected text provider key and ElevenLabs key first.');
  if (typeof pdfPath !== 'string' || path.extname(pdfPath).toLowerCase() !== '.pdf' || !fs.existsSync(pdfPath)) throw new Error('Choose a PDF document.');
  if (!fs.existsSync(outputDir)) throw new Error('The output folder no longer exists.');
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
        if (message.event === 'complete' && message.audio_path) {
          message.audio_url = pathToFileURL(message.audio_path).href;
          try { rememberEpisode(message); }
          catch (error) { console.error('Could not update podcast library:', error); }
        }
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
    pdf_path: pdfPath, output_dir: outputDir, provider, instruction,
    llm_key: decrypt(settings[keyField]), elevenlabs_key: decrypt(settings.elevenlabsKey)
  }));
  return true;
});
