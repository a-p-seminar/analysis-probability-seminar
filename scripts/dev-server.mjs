import http from 'node:http';
import { stat } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createApi } from '../server/api.mjs';
import { createLocalRepository } from '../server/local-repository.mjs';
import { createLocalStore } from '../server/local-store.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
try { process.loadEnvFile(process.env.SEMINAR_ENV_FILE || resolve(projectRoot, '.env.local')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const root = resolve(process.env.SEMINAR_DATA_ROOT || projectRoot);
const port = Number(process.env.PORT || 5173);
const built = process.argv.includes('--built');
const api = createApi({
  repository: createLocalRepository(root),
  store: createLocalStore(resolve(root, '.local-data/staging')),
  env: { ...process.env, NODE_ENV: 'development', NETLIFY: '' },
});
const vite = built ? null : await (await import('vite')).createServer({
  root: projectRoot, server: { middlewareMode: true }, appType: 'mpa',
});
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
async function serveFile(base, pathname, req, res) {
  const target = resolve(base, '.' + pathname);
  const rel = relative(base, target);
  if (rel.startsWith('..' + sep) || rel === '..' || rel.includes('\0')) return false;
  try {
    const info = await stat(target);
    if (!info.isFile()) return false;
    const headers = { 'Content-Type': mime[extname(target).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    let start = 0, end = info.size - 1;
    if (range) {
      start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
      if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return true; }
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD') res.end();
    else createReadStream(target, { start, end }).on('error', () => res.destroy()).pipe(res);
    return true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; return false; }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\\') || /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.local-data|\.git)(?:\/|$)/i.test(pathname)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    if (pathname.startsWith('/api/')) {
      const request = new Request(url, {
        method: req.method, headers: req.headers,
        ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
      });
      const response = await api(request, { ip: req.socket.remoteAddress });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
      return;
    }
    if (pathname.startsWith('/attachments/')) {
      if (await serveFile(resolve(root, 'attachments'), pathname.slice('/attachments'.length), req, res)) return;
    } else if (pathname.startsWith('/pdfjs/')) {
      if (await serveFile(resolve(projectRoot, 'node_modules/pdfjs-dist'), pathname.slice('/pdfjs'.length), req, res)) return;
    } else if (vite) {
      vite.middlewares(req, res, () => { res.writeHead(404); res.end('Not found'); });
      return;
    } else {
      const file = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin.html' : pathname === '/viewer' ? '/viewer.html' : pathname;
      if (await serveFile(resolve(projectRoot, 'dist'), file, req, res)) return;
    }
    res.writeHead(404); res.end('Not found');
  } catch (error) {
    console.error('Local request failed:', error.name);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '本地服务暂时无法处理请求。' }));
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Seminar: http://127.0.0.1:${port}`);
  console.log(`Admin:   http://127.0.0.1:${port}/admin.html`);
  console.log('Storage: local filesystem (no GitHub writes).');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await vite?.close(); server.close(() => process.exit(0));
});
