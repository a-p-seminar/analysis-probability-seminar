import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../server/api.mjs';
import { createLocalStore } from '../server/local-store.mjs';
import { createEnvironmentPassword } from '../server/environment-password.mjs';

const optional = async path => { try { return await import(path); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; } };
const { createRenderPasswordSource } = await optional('../server/render-password-source.mjs');
const { createRenderServer } = await optional('../server/render-http.mjs');

function fixture() {
  const env = { NODE_ENV: 'production', RENDER: 'true', RENDER_SERVICE_ID: 'srv-abcdefghijklmnopqrst', RENDER_ENV_TOKEN: 'test-token', SESSION_SECRET: 'test-only-secret-'.repeat(4) };
  let password = 'ap', revision = 1, fail = false;
  const writes = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers.authorization, 'Bearer test-token');
    const base = 'https://api.render.com/v1/services/' + env.RENDER_SERVICE_ID;
    if (fail) return new Response('PRIVATE RESPONSE', { status: 403 });
    if (url === base) return Response.json({ id: env.RENDER_SERVICE_ID, updatedAt: 'revision-' + revision });
    assert.equal(url, base + '/env-vars/ADMIN_PASSWORD');
    if (options.method === 'PUT') { writes.push(JSON.parse(options.body)); password = writes.at(-1).value; revision++; }
    return Response.json({ key: 'ADMIN_PASSWORD', value: password });
  };
  return { env, writes, fetchImpl, manual: value => { password = value; revision++; }, fail: () => { fail = true; } };
}

test('Render password reads live configuration, writes only its password variable and fails closed', async () => {
  assert.equal(typeof createRenderPasswordSource, 'function', 'Render environment password adapter is required');
  const f = fixture(), source = createRenderPasswordSource({ env: f.env, fetchImpl: f.fetchImpl });
  const first = await source.read(); assert.equal(first.password, 'ap');
  await source.write('b'); assert.equal((await source.read()).password, 'b');
  assert.deepEqual(f.writes, [{ value: 'b' }]);
  f.manual('ap'); assert.notEqual((await source.read()).revision, first.revision);
  await assert.rejects(source.write(''), { status: 400 });
  f.fail(); await assert.rejects(source.read(), e => e.status === 503 && !e.message.includes('PRIVATE'));
});

test('Render production authenticates securely and manual environment changes invalidate sessions', async t => {
  assert.equal(typeof createRenderPasswordSource, 'function', 'Render environment password adapter is required');
  const root = await mkdtemp(join(tmpdir(), 'seminar-render-auth-')); t.after(() => rm(root, { recursive: true, force: true }));
  const f = fixture(), store = { ...createLocalStore(root), mode: 'render' };
  const repository = { mode: 'github', read: async () => ({ content: { schemaVersion: 1, site: {}, talks: [] }, revision: 'fixture' }) };
  const api = createApi({ repository, store, env: f.env, passwords: createEnvironmentPassword({ source: createRenderPasswordSource({ env: f.env, fetchImpl: f.fetchImpl }), store, secret: f.env.SESSION_SECRET }) });
  const request = (path, method = 'GET', body, cookie = '') => api(new Request('https://render.example' + path, { method, headers: { origin: 'https://render.example', 'content-type': 'application/json', cookie }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  const login = await request('/api/login', 'POST', { password: 'ap' }); assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict;.*Secure/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/admin/content', 'GET', undefined, cookie)).status, 200);
  f.manual('b'); assert.equal((await request('/api/admin/content', 'GET', undefined, cookie)).status, 401);
});

test('Render HTTP serves built pages, uses the HTTPS public origin and contains private file paths', async t => {
  assert.equal(typeof createRenderServer, 'function', 'Render production HTTP server is required');
  const root = await mkdtemp(join(tmpdir(), 'seminar-render-http-')); t.after(() => rm(root, { recursive: true, force: true }));
  const dist = join(root, 'dist'); await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<h1>Seminar</h1>'); await writeFile(join(dist, 'admin.html'), '<h1>Admin</h1>');
  await writeFile(join(root, '.env'), 'PRIVATE'); await writeFile(join(dist, 'assets/app.js'), 'console.log(1)');
  await writeFile(join(dist, 'assets/pdf.worker.mjs'), 'export const WorkerMessageHandler = {};');
  const calls = [];
  const server = createRenderServer({ origin: 'https://render.example', staticRoot: dist, api: async request => { calls.push(request.url); return Response.json({ ok: true }); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  assert.equal(await (await fetch(url + '/')).text(), '<h1>Seminar</h1>');
  assert.equal((await fetch(url + '/admin')).status, 200);
  assert.equal((await fetch(url + '/healthz')).status, 200);
  assert.match((await fetch(url + '/assets/app.js')).headers.get('cache-control'), /immutable/);
  assert.match((await fetch(url + '/assets/pdf.worker.mjs')).headers.get('content-type'), /^text\/javascript/, 'module workers require a JavaScript MIME type when nosniff is enabled');
  await fetch(url + '/api/session'); assert.deepEqual(calls, ['https://render.example/api/session']);
  for (const path of ['/.env', '/.local-data/test', '/server/auth.mjs', '/attachments/..%2f.env', '/..%5c.env', '/assets/%2e%2e%2f%2e%2e%2f.env']) assert.equal((await fetch(url + path)).status, 404, path);
});

test('Render streams PDF byte ranges without forwarding browser credentials to GitHub', async t => {
  assert.equal(typeof createRenderServer, 'function');
  const calls = [];
  const server = createRenderServer({ origin: 'https://render.example', staticRoot: tmpdir(), api: () => {}, attachmentUrl: path => 'https://raw.githubusercontent.com/test/repo/main/' + path,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response('%PDF', { status: 206, headers: { 'content-length': '4', 'content-range': 'bytes 0-3/20', 'accept-ranges': 'bytes' } }); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(url + '/attachments/2026/fixture.pdf', { headers: { range: 'bytes=0-3', cookie: 'seminar_session=private', authorization: 'private' } });
  assert.equal(response.status, 206); assert.equal(await response.text(), '%PDF'); assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/20'); assert.deepEqual(calls[0].options.headers, { range: 'bytes=0-3' });
  assert.equal((await fetch(url + '/attachments/2026/secret.txt')).status, 404); assert.equal(calls.length, 1);
});
