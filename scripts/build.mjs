// npm run build : assembles the deployable site into dist/ (this folder is what gets dragged to Cloudflare).
// Only runtime files go in. brand/, reference/, scripts/ never do.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const FILES = [
  'index.html',
  'src/tokens.css',
  'src/site.css',
  'src/app.js',
  'src/registry.js',
  'src/gate.js',
  'src/copy.js',
  'assets/favicon.svg',
  'assets/logo-160.png',
  'assets/logo-512.png',
  'assets/mountains.jpg',
  'assets/banner.jpg',
];

fs.rmSync(DIST, { recursive: true, force: true });
for (const rel of FILES) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) {
    console.error('build failed, missing ' + rel);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(path.join(DIST, rel)), { recursive: true });
  fs.copyFileSync(from, path.join(DIST, rel));
}
console.log('built dist/ (' + FILES.length + ' files)');
