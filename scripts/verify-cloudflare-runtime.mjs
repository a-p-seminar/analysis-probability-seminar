import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// Run after `wrangler deploy --dry-run --outdir .local-data/cloudflare-deployment/bundle`.
// The Worker and SQLite Durable Object are real workerd instances. Only external
// GitHub and Cloudflare HTTP services are fixtures; no production data is used.
const require = createRequire(realpathSync('node_modules/wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const origin = 'https://seminar.example';
let password = 'ap', revision = 1, uploadedHash, activeBlobs = 0, maxActiveBlobs = 0;
const bytes = Buffer.alloc(50 * 1024 * 1024, 0x61); bytes.write('%PDF-1.7\n');
const expectedHash = createHash('sha256').update(bytes).digest('hex');
const content = { schemaVersion: 1, site: {}, talks: [] };
const reply = result => new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, scriptPath: resolve('.local-data/cloudflare-deployment/bundle/worker.js'),
  compatibilityDate: '2026-10-06', compatibilityFlags: ['nodejs_compat'],
  bindings: { NODE_ENV: 'production', GITHUB_OWNER: 'example', GITHUB_REPO: 'seminar', GITHUB_BRANCH: 'main', GITHUB_TOKEN: 'runtime-test-only', SESSION_SECRET: 'runtime-test-secret-never-production'.repeat(2), CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_WORKER_NAME: 's-ap', CLOUDFLARE_ENV_TOKEN: 'runtime-test-only' },
  durableObjects: { SEMINAR_STATE: { className: 'SeminarState', useSQLite: true } },
  serviceBindings: { ASSETS: async request => {
    const path = new URL(request.url).pathname;
    if (!['/index.html', '/admin.html', '/viewer.html'].includes(path)) return new Response('Not found', { status: 404 });
    return new Response(await readFile(resolve(`dist${path}`)), { headers: { 'content-type': 'text/html' } });
  } },
  outboundService: async request => {
    const url = new URL(request.url), path = decodeURIComponent(url.pathname);
    if (url.hostname === 'api.cloudflare.com') {
      if (request.method === 'PATCH') {
        const body = JSON.parse((await request.formData()).get('settings'));
        password = body.bindings.find(b => b.name === 'ADMIN_PASSWORD').text; revision++;
      }
      return reply({ success: true, result: path.endsWith('/settings') ? { bindings: [{ name: 'ADMIN_PASSWORD', type: 'plain_text', text: password }, { name: 'SESSION_SECRET', type: 'secret_text' }] } : [{ id: 's-ap', modified_on: String(revision) }] });
    }
    assert.equal(url.hostname, 'api.github.com');
    const route = path.replace('/repos/example/seminar', '');
    if (route === '/git/ref/heads/main') return reply({ object: { sha: 'head' } });
    if (route === '/contents/content/seminars.json') return reply({ type: 'file', sha: 'data', encoding: 'base64', content: Buffer.from(JSON.stringify(content)).toString('base64') });
    if (route.startsWith('/contents/')) return new Response('{}', { status: 404 });
    if (route === '/git/commits/head') return reply({ tree: { sha: 'tree' } });
    if (route === '/git/blobs') {
      activeBlobs++; maxActiveBlobs = Math.max(maxActiveBlobs, activeBlobs);
      const body = await request.json();
      const uploaded = Buffer.from(body.content, 'base64');
      uploadedHash = createHash('sha256').update(uploaded).digest('hex');
      await new Promise(resolve => setTimeout(resolve, 200)); activeBlobs--;
      return reply({ sha: 'blob' });
    }
    if (route === '/git/trees' || route === '/git/commits') return reply({ sha: 'next' });
    if (route === '/git/refs/heads/main') return reply({ object: { sha: 'next' } });
    throw new Error(`Unexpected fixture route ${request.method} ${route}`);
  },
}));
let cookie = '';
async function api(path, method = 'GET', body, binary = false) {
  const response = await mf.dispatchFetch(`${origin}/api/${path}`, { method, headers: { origin, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': binary ? 'application/octet-stream' : 'application/json' }) }, ...(body === undefined ? {} : { body: binary ? body : JSON.stringify(body) }) });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  return value;
}
try {
  for (const path of ['/', '/admin', '/admin.html', '/viewer']) {
    const response = await mf.dispatchFetch(origin + path);
    assert.equal(response.status, 200, `Static route ${path}`); assert.match(await response.text(), /<!doctype html>/i);
  }
  await api('login', 'POST', { password: 'ap' });
  assert.equal((await api('session')).authenticated, true);
  assert.deepEqual((await api('content')).content.talks, []);
  const staged = [];
  for (let file = 0; file < 3; file++) {
    const upload = await api('admin/uploads', 'POST', { name: 'test.pdf', size: bytes.length, talk: { date: '2026-10-06', speaker: 'Test', title: 'Runtime validation' } });
    assert.equal(upload.chunkSize, 512 * 1024);
    for (let index = 0; index < bytes.length / upload.chunkSize; index++) await api(`admin/uploads/${upload.id}/${index}`, 'PUT', bytes.subarray(index * upload.chunkSize, (index + 1) * upload.chunkSize), true);
    staged.push(upload.id);
  }
  const completed = await Promise.all(staged.map(id => api(`admin/uploads/${id}/complete`, 'POST')));
  assert(completed.every(result => result.attachment.size === bytes.length)); assert.equal(uploadedHash, expectedHash);
  assert.equal(maxActiveBlobs, 1, 'Large upload completions must be serialized within the Durable Object');
  await api('admin/password', 'POST', { currentPassword: 'ap', newPassword: 'b', confirmPassword: 'b' });
  assert.equal(password, 'b'); assert.equal((await api('session')).authenticated, false);
  await api('login', 'POST', { password: 'b' });
  password = 'ap'; revision++;
  assert.equal((await api('session')).authenticated, false);
  await api('login', 'POST', { password: 'ap' }); await api('logout', 'POST');
  assert.equal((await api('session')).authenticated, false);
  console.log(JSON.stringify({ runtime: 'workerd', storage: 'SQLite Durable Object', login: true, uploadMiB: 50, concurrentUploadCount: 3, maxConcurrentAssembly: maxActiveBlobs, uploadHashMatch: true, passwordSync: true, manualPasswordRevocation: true, logout: true }));
} finally { await mf.dispose(); }
