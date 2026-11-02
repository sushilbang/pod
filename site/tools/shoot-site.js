// Screenshots the built site (site/public) in hidden Electron windows and measures scroll frame times.
//   node_modules\.bin\electron site\tools\shoot-site.js <outDir>
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const publicDir = path.resolve(__dirname, '..', 'public');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'site'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const server = http.createServer((request, response) => {
  const file = path.join(publicDir, decodeURIComponent(new URL(request.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(publicDir, 'index.html');
  const size = fs.statSync(target).size;
  const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range || '');
  const headers = { 'content-type': types[path.extname(target)] || 'application/octet-stream', 'accept-ranges': 'bytes' };
  if (range) {
    const start = Number(range[1]); const end = range[2] ? Number(range[2]) : size - 1;
    response.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    fs.createReadStream(target, { start, end }).pipe(response);
  } else {
    response.writeHead(200, { ...headers, 'content-length': size });
    fs.createReadStream(target).pipe(response);
  }
});

async function snap(win, name) {
  await sleep(120);
  win.webContents.invalidate();
  await win.webContents.capturePage();
  await sleep(60);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(out, name + '.png'), image.toPNG());
}

async function run() {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const win = new BrowserWindow({ width: 1440, height: 900, useContentSize: true, show: true, x: -4000, y: 0, skipTaskbar: true, focusable: false, enableLargerThanScreen: true, webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  const js = code => win.webContents.executeJavaScript(code);
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) errors.push(message); });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => errors.push(`load fail ${code} ${desc} ${url}`));

  async function pass(label, width, height) {
    win.setContentSize(width, height);
    await win.loadURL(base);
    await sleep(2600);
    await snap(win, `${label}-hero`);
    const targets = ['#features', '.row:nth-of-type(1)', '.row:nth-of-type(2)', '.row:nth-of-type(3)', '.row:nth-of-type(4)', '.row:nth-of-type(5)', '#how', '#download', '#faq'];
    let i = 0;
    for (const selector of targets) {
      await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 70); })()`);
      await sleep(1500);
      await snap(win, `${label}-${String(++i).padStart(2, '0')}-${selector.replace(/[^a-z0-9]+/gi, '')}`);
    }
    const overflow = await js('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    console.log(label, 'horizontal overflow px:', overflow);
    // Each clip should have autoplayed (currentTime advanced) while its row was in view.
    console.log(label, 'clips played:', JSON.stringify(await js('[...document.querySelectorAll("video")].map(v => [v.currentSrc.split("/").pop(), +v.currentTime.toFixed(1), v.error && v.error.code])')));
  }

  await pass('desktop', 1440, 900);
  await pass('mobile', 390, 844);

  // Scroll frame times: scroll the whole page over ~5s and record rAF gaps.
  win.setContentSize(1440, 900);
  await win.loadURL(base);
  await sleep(2500);
  const stats = await js(`new Promise(resolve => {
    const gaps = []; let last = performance.now(); const start = last; const total = document.documentElement.scrollHeight - innerHeight;
    function tick(now) {
      gaps.push(now - last); last = now;
      const t = Math.min(1, (now - start) / 5000);
      scrollTo(0, total * t);
      if (t < 1) requestAnimationFrame(tick);
      else { gaps.shift(); gaps.sort((a, b) => a - b); resolve({ frames: gaps.length, medianMs: gaps[gaps.length >> 1], p95Ms: gaps[Math.floor(gaps.length * 0.95)], maxMs: gaps[gaps.length - 1], over25ms: gaps.filter(g => g > 25).length }); }
    }
    requestAnimationFrame(tick);
  })`);
  console.log('scroll perf', JSON.stringify(stats));
  console.log('console errors:', JSON.stringify(errors));
  server.close();
  app.quit();
}

app.on('window-all-closed', () => {});
app.whenReady().then(run).catch(error => { console.error(error); app.exit(1); });
