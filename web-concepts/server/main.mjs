import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 8092;
const CORPUS_DIR = 'C:\\ARQ\\BIM\\Concepts';
const INDEX_HTML_PATH = path.resolve(__dirname, '..', 'index.html');

const server = http.createServer((req, res) => {
  const host = req.headers.host || '';
  if (!host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
    res.writeHead(421, { 'Content-Type': 'text/plain' });
    return res.end('Host no valido');
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'");

  // Servir aplicacion web en la raiz
  if (req.url === '/' || req.url === '/index.html') {
    if (fs.existsSync(INDEX_HTML_PATH)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(INDEX_HTML_PATH));
    }
  }

  if (req.url === '/api/salud') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, version: '0.1.0', raices: [{ nombre: 'corpus', soloLectura: true }] }));
  }

  if (req.url === '/api/archivos') {
    try {
      const files = [];
      function scan(dir, rel = '') {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          if (item.isDirectory()) scan(path.join(dir, item.name), path.join(rel, item.name));
          else if (item.name.endsWith('.concepts')) {
            const full = path.join(dir, item.name);
            const st = fs.statSync(full);
            files.push({
              id: Buffer.from(path.join(rel, item.name)).toString('base64url'),
              nombre: item.name,
              carpeta: rel,
              bytes: st.size,
              mtime: st.mtimeMs
            });
          }
        }
      }
      scan(CORPUS_DIR);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(files));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Ruta no encontrada');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Servidor WebConcepts escuchando en http://127.0.0.1:${PORT}`);
});
