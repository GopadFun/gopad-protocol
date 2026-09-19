// Tiny static server for local review of dist/ (what gets deployed). `npm run build` first. `node scripts/serve.mjs [port]`
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!fs.existsSync(root)) {
  console.error('dist/ is missing: run npm run build first');
  process.exit(1);
}
const port = Number(process.argv[2]) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(root, url === '/' ? 'index.html' : url);
    if (!file.startsWith(root) || /[\\/](brand|reference|scripts)[\\/]/.test(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end('not found');
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  })
  .listen(port, () => console.log('http://localhost:' + port));
