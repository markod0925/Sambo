import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const port = 4173;

const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json'
};

http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  const clean = path.normalize(url).replace(/^\/+/, '');
  const filePath = path.join(root, clean.startsWith('dist/') || clean.startsWith('public/') ? clean : clean);
  const resolved = fs.existsSync(filePath) ? filePath : path.join(root, 'public', clean);

  if (!resolved.startsWith(root) || !fs.existsSync(resolved)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': types[path.extname(resolved)] || 'text/plain' });
  res.end(fs.readFileSync(resolved));
}).listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
