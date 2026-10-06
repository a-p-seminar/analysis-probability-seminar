import http from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { resolve, relative, extname, sep } from 'node:path';
import { validAttachmentPath } from './content.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const security = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
};
export function createRenderServer({ origin, staticRoot, api, attachmentUrl, fetchImpl = fetch }) {
  origin = new URL(origin).origin;
  staticRoot = resolve(staticRoot);
  const send = (res, status, headers, body) => { res.writeHead(status, { ...security, ...headers }); res.end(body); };
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(origin + req.url), pathname = decodeURIComponent(url.pathname);
      if (pathname.includes('\\') || /(?:^|\/)(?:\.{1,2}|\.[^/]*)(?:\/|$)/.test(pathname)) return send(res, 404, {}, 'Not found');
      if (pathname === '/healthz') return send(res, 200, { 'content-type': 'application/json', 'cache-control': 'no-store' }, JSON.stringify({ ok: true }));
      if (pathname.startsWith('/api/')) {
        const request = new Request(url, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
        const response = await api(request, { ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress });
        res.writeHead(response.status, { ...security, ...Object.fromEntries(response.headers) });
        if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res); else res.end();
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { allow: 'GET, HEAD' }, 'Method not allowed');
      if (pathname.startsWith('/attachments/')) {
        const path = pathname.slice(1), type = types[extname(path).toLowerCase()];
        if (!attachmentUrl || !validAttachmentPath(path) || !/\.(pdf|ppt|pptx)$/i.test(path)) return send(res, 404, {}, 'Not found');
        const response = await fetchImpl(attachmentUrl(path), { method: req.method, headers: req.headers.range ? { range: req.headers.range } : {}, signal: AbortSignal.timeout(60000) });
        if (![200, 206].includes(response.status)) return send(res, response.status === 404 ? 404 : 503, {}, 'Attachment unavailable');
        const headers = { ...security, 'content-type': type, 'cache-control': 'public, max-age=3600' };
        for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) if (response.headers.has(name)) headers[name] = response.headers.get(name);
        res.writeHead(response.status, headers);
        if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res); else res.end();
        return;
      }
      const mapped = pathname === '/' ? '/index.html' : ['/admin', '/viewer'].includes(pathname) ? pathname + '.html' : pathname;
      const target = resolve(staticRoot, '.' + mapped), rel = relative(staticRoot, target);
      if (rel === '..' || rel.startsWith('..' + sep) || rel.includes('\0')) return send(res, 404, {}, 'Not found');
      const info = await stat(target).catch(error => { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; throw error; });
      if (!info?.isFile()) return send(res, 404, {}, 'Not found');
      let start = 0, end = info.size - 1;
      const headers = { ...security, 'content-type': types[extname(target)] || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' };
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
        if (start > end || start >= info.size) return send(res, 416, { 'content-range': `bytes */${info.size}` }, '');
        headers['content-range'] = `bytes ${start}-${end}/${info.size}`;
      }
      headers['content-length'] = Math.max(0, end - start + 1);
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD' || !info.size) res.end(); else createReadStream(target, { start, end }).on('error', () => res.destroy()).pipe(res);
    } catch {
      if (res.headersSent) res.destroy(); else send(res, 503, { 'content-type': 'application/json', 'cache-control': 'no-store' }, JSON.stringify({ error: 'The service is temporarily unavailable.' }));
    }
  });
}
