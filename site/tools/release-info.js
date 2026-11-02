// Records the real size and SHA-256 of the packaged portable exe into site/web/src/release.json.
//   node site/tools/release-info.js [path-to-exe]
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const version = require(path.join(root, 'package.json')).version;
const file = `POD-${version}-win-x64-portable.exe`;
const exe = path.resolve(process.argv[2] || path.join(root, 'release', file));

const hash = crypto.createHash('sha256');
fs.createReadStream(exe).on('data', chunk => hash.update(chunk)).on('end', () => {
  const info = { version, file, sizeBytes: fs.statSync(exe).size, sha256: hash.digest('hex') };
  fs.writeFileSync(path.join(root, 'site', 'web', 'src', 'release.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(info);
}).on('error', error => { console.error(error.message); process.exit(1); });
