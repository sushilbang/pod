const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.platform !== 'win32') {
  console.error('The desktop packaging script currently targets Windows.');
  process.exit(1);
}
const python = process.env.POD_PYTHON || path.join('.venv', 'Scripts', 'python.exe');
const build = spawnSync(python, ['-m', 'PyInstaller', '--noconfirm', '--clean', '--onefile', '--name', 'pod-worker', '--distpath', path.join('build', 'worker'), '--workpath', path.join('build', 'pyinstaller'), 'backend/tasks.py'], { stdio: 'inherit' });
if (build.error || build.status !== 0) process.exit(build.status || 1);
const electron = spawnSync(path.join('node_modules', '.bin', 'electron-builder.cmd'), ['--win'], { stdio: 'inherit', shell: true });
process.exit(electron.status || (electron.error ? 1 : 0));
