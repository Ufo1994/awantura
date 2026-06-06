// Lokalny serwer statyczny — opcjonalny launcher do uruchomienia bez GitHub Pages.
// Uruchom:  node serve-local.cjs    → http://localhost:3210
// NIE jest częścią deployu (GitHub Pages serwuje pliki statyczne bezpośrednio).
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const PORT = process.env.PORT || 3100;
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Awantura (static) → http://localhost:' + PORT));
