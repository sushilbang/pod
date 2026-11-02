// Renders brand icons and the scripted marketing captures in hidden Electron windows.
//   node_modules\.bin\electron site\tools\capture.js <outDir>
// <outDir> receives PNG icons, still screenshots (stills/*.png) and numbered frames (frames/<clip>/*.jpg).
// Nothing here talks to a network or reads real documents: the real renderer runs against mock-preload.js.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(root, 'site', 'tools', 'out'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function snap(win) {
  // Hidden windows only repaint on demand, so invalidate and capture twice to get a settled frame.
  await sleep(70);
  win.webContents.invalidate();
  await win.webContents.capturePage();
  await sleep(40);
  return win.webContents.capturePage();
}

async function renderIcons() {
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const pngs = {};
  for (const size of sizes) {
    const win = new BrowserWindow({ width: size, height: size, useContentSize: true, show: false, frame: false, transparent: true, webPreferences: { backgroundThrottling: false } });
    await win.loadFile(path.join(__dirname, 'icon.html'));
    await sleep(250);
    const image = await win.webContents.capturePage();
    pngs[size] = image.resize({ width: size, height: size, quality: 'best' }).toPNG();
    fs.writeFileSync(path.join(out, 'icons', `icon-${size}.png`), pngs[size]);
    win.destroy();
  }
  // ICO container with PNG-compressed entries (valid for Vista+ and electron-builder).
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const header = Buffer.alloc(6); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
  let offset = 6 + 16 * icoSizes.length;
  const entries = icoSizes.map(size => {
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size; entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngs[size].length, 8); entry.writeUInt32LE(offset, 12);
    offset += pngs[size].length;
    return entry;
  });
  fs.writeFileSync(path.join(out, 'icons', 'icon.ico'), Buffer.concat([header, ...entries, ...icoSizes.map(size => pngs[size])]));
}

function sceneWindow() {
  return new BrowserWindow({
    width: 1440, height: 900, useContentSize: true, show: false, enableLargerThanScreen: true, backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'mock-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
}

async function openScene(theme = 'light') {
  const win = sceneWindow();
  await win.loadFile(path.join(root, 'electron', 'index.html'));
  const run = code => win.webContents.executeJavaScript(code);
  // Hidden windows do not advance CSS animations, so freeze them to their end state.
  await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
  await run(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; document.getElementById('theme-toggle')?.setAttribute('aria-label', 'x'); true`);
  win.setContentSize(1440, 900);
  await sleep(500);
  console.log('viewport', await run('[innerWidth, innerHeight, devicePixelRatio].join(" ")'));
  return { win, run };
}

const direction = 'Explain this for product managers. Keep it conversational, focus on the decisions, and end with three takeaways.';
const episodePath = 'C:\\Users\\you\\Music\\POD\\Q3-strategy-for-product-managers.mp3';

const typeInto = (run, text) => run(`(() => { const t = document.getElementById('instruction'); t.value = ${JSON.stringify(text)}; return true; })()`);
const emit = (run, message) => run(`window.__mock.emit(${JSON.stringify(message)}); true`);
const click = (run, id) => run(`document.getElementById(${JSON.stringify(id)}).click(); true`);
const view = (run, name) => run(`document.querySelector('.main-nav [data-view="${name}"], .settings-link[data-view="${name}"]').click(); true`);

async function playGeneration(run, { upTo }) {
  await click(run, 'choose-pdf'); await sleep(150);
  await typeInto(run, direction);
  await click(run, 'generate'); await sleep(150);
  const steps = [
    'Reading your PDF\u2026', 'Summarizing the document\u2026', 'Writing the two voice script\u2026',
    'Generating speech 6 of 24\u2026', 'Generating speech 18 of 24\u2026', 'Joining audio segments\u2026'
  ];
  const limit = { source: 1, script: 3, voice: 5, export: 6, done: 7 }[upTo];
  for (const message of steps.slice(0, limit)) { await emit(run, { event: 'progress', message }); await sleep(60); }
  if (upTo === 'done') await emit(run, { event: 'complete', title: 'Q3 strategy for product managers', audio_path: episodePath, audio_url: '' });
}

async function stills() {
  const dir = path.join(out, 'stills'); fs.mkdirSync(dir, { recursive: true });
  const save = async (win, name) => fs.writeFileSync(path.join(dir, name + '.png'), (await snap(win)).toPNG());

  let { win, run } = await openScene('light');
  await save(win, 'chat-empty');
  await playGeneration(run, { upTo: 'voice' });
  await save(win, 'progress');
  await emit(run, { event: 'progress', message: 'Joining audio segments\u2026' });
  await emit(run, { event: 'complete', title: 'Q3 strategy for product managers', audio_path: episodePath, audio_url: '' });
  await save(win, 'chat-done');
  await view(run, 'podcasts'); await sleep(750); await save(win, 'library');
  await view(run, 'settings'); await sleep(750); await save(win, 'settings');
  await view(run, 'docs'); await sleep(750); await save(win, 'docs');
  win.destroy();
  await sleep(500);

  ({ win, run } = await openScene('dark'));
  await playGeneration(run, { upTo: 'done' });
  await save(win, 'chat-done-dark');
  await view(run, 'podcasts'); await sleep(750); await save(win, 'library-dark');
  await view(run, 'settings'); await sleep(750); await save(win, 'settings-dark');
  win.destroy();
}

async function clip(name, fps, total, timeline, theme = 'light') {
  const dir = path.join(out, 'frames', name); fs.mkdirSync(dir, { recursive: true });
  const { win, run } = await openScene(theme);
  const started = Date.now();
  for (let i = 0; i < total; i += 1) {
    for (const action of timeline.filter(item => item.at === i)) await action.run(run, win);
    const type = timeline.find(item => item.from !== undefined && i >= item.from && i < item.to);
    if (type) await type.frame(run, i - type.from);
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), (await snap(win)).toJPEG(92));
  }
  console.log(`${name}: ${total} frames in ${((Date.now() - started) / 1000).toFixed(1)}s (target ${fps} fps)`);
  win.destroy();
}

async function clips() {
  const progress = (at, message) => ({ at, run: run => emit(run, { event: 'progress', message }) });
  await clip('create', 15, 205, [
    { at: 6, run: run => click(run, 'choose-pdf') },
    { from: 20, to: 66, frame: (run, n) => typeInto(run, direction.slice(0, Math.min(direction.length, Math.round((n + 1) * direction.length / 44)))) },
    { at: 76, run: run => click(run, 'generate') },
    progress(82, 'Reading your PDF\u2026'),
    progress(98, 'Summarizing the document\u2026'),
    progress(114, 'Writing the two voice script\u2026'),
    progress(130, 'Generating speech 3 of 24\u2026'),
    progress(138, 'Generating speech 9 of 24\u2026'),
    progress(146, 'Generating speech 15 of 24\u2026'),
    progress(154, 'Generating speech 21 of 24\u2026'),
    progress(164, 'Joining audio segments\u2026'),
    { at: 174, run: run => emit(run, { event: 'complete', title: 'Q3 strategy for product managers', audio_path: episodePath, audio_url: '' }) }
  ]);
  await clip('themes', 15, 110, [
    { at: 0, run: run => view(run, 'podcasts') },
    { at: 26, run: run => click(run, 'theme-toggle') },
    { at: 50, run: run => view(run, 'settings') },
    { at: 68, run: run => click(run, 'theme-toggle') },
    { at: 88, run: run => view(run, 'chat') }
  ]);
}

app.on('window-all-closed', () => { /* keep running between scenes */ });
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const only = process.argv[3];
  if (!only || only === 'icons') await renderIcons();
  if (!only || only === 'stills') await stills();
  if (!only || only === 'clips') await clips();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });


