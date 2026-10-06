import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../server/api.mjs';
import { createUploads } from '../server/uploads.mjs';
import { createEnvironmentPassword } from '../server/environment-password.mjs';

const moduleOrEmpty = async path => { try { return await import(path); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; } };
const { createCloudflareStore } = await moduleOrEmpty('../server/cloudflare-store.mjs');
const { createCloudflarePasswordSource } = await moduleOrEmpty('../server/cloudflare-password-source.mjs');
function storage(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value BLOB NOT NULL)');
  const encode = value => Buffer.from(JSON.stringify(value, (_, v) => v instanceof Uint8Array ? { binary: [...v] } : v));
  const decode = bytes => JSON.parse(Buffer.from(bytes).toString(), (_, v) => v?.binary ? Uint8Array.from(v.binary) : v);
  const impl = {
    async get(key) { const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key); return row && decode(row.value); },
    async put(key, value) { db.prepare('INSERT INTO kv VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, encode(value)); },
    async delete(key) { db.prepare('DELETE FROM kv WHERE key = ?').run(key); },
    async list({ prefix = '', startAfter = '', limit = 1000 } = {}) { return new Map(db.prepare('SELECT key, value FROM kv WHERE key > ? ORDER BY key').all(startAfter).filter(x => x.key.startsWith(prefix)).slice(0, limit).map(x => [x.key, decode(x.value)])); },
  };
  let queue = Promise.resolve();
  impl.transaction = callback => { const job = queue.then(async () => { db.exec('BEGIN'); try { const value = await callback(impl); db.exec('COMMIT'); return value; } catch (e) { db.exec('ROLLBACK'); throw e; } }); queue = job.catch(() => {}); return job; };
  return impl;
}

test('Cloudflare private storage persists bytes and coordinates competing conditional writes', async t => {
  assert.equal(typeof createCloudflareStore, 'function', 'Cloudflare storage adapter must be implemented');
  const state = storage(t), a = createCloudflareStore(state), b = createCloudflareStore(state);
  const writes = await Promise.all([a.put('key', Buffer.from([0, 255, 128]), { onlyIfNew: true }), b.put('key', Buffer.from('other'), { onlyIfNew: true })]);
  assert.equal(writes.filter(x => x.modified).length, 1);
  const current = await b.get('key'); assert.deepEqual(current.data, Buffer.from([0, 255, 128]));
  assert.equal((await b.put('key', Buffer.from('wrong'), { onlyIfMatch: 'wrong' })).modified, false);
  assert.equal((await b.put('key', Buffer.from('updated'), { onlyIfMatch: current.etag })).modified, true);
  assert.equal((await a.get('key')).data.toString(), 'updated');
  await a.put('uploads/one', Buffer.from('1')); await a.put('uploads/two', Buffer.from('2'));
  assert.deepEqual((await a.list('uploads/')).sort(), ['uploads/one', 'uploads/two']);
  await a.delete('uploads/one'); assert.equal(await b.get('uploads/one'), null);
});

test('Cloudflare key enumeration bounds loaded values and avoids the storage cache', async t => {
  const state = storage(t), list = state.list.bind(state), calls = [];
  state.list = options => { calls.push(options); return list(options); };
  const store = createCloudflareStore(state);
  for (let i = 0; i < 40; i++) await store.put(`uploads/${String(i).padStart(2, '0')}`, Buffer.from('test'));
  assert.equal((await store.list('uploads/')).length, 40);
  assert.equal(calls.length, 3);
  assert(calls.every(options => options.limit === 16 && options.noCache === true));
});

function sourceFixture() {
  const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_WORKER_NAME: 'seminar-test', CLOUDFLARE_ENV_TOKEN: 'test-token' };
  let revision = 1, fail = false;
  let bindings = [{ name: 'ADMIN_PASSWORD', type: 'plain_text', text: 'ap' }, { name: 'OTHER', type: 'plain_text', text: 'preserve' }, { name: 'GITHUB_TOKEN', type: 'secret_text' }, { name: 'SEMINAR_STATE', type: 'durable_object_namespace', namespace_id: 'b'.repeat(32) }];
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts`));
    assert.equal(options.headers.authorization, 'Bearer test-token');
    if (fail) return new Response('PRIVATE API RESPONSE', { status: 403 });
    if (options.method === 'PATCH') {
      const value = JSON.parse(options.body.get('settings'));
      calls.push(value);
      const old = new Map(bindings.map(b => [b.name, b]));
      bindings = value.bindings.map(b => b.type === 'inherit' ? old.get(b.name) : b);
      revision++;
    }
    return Response.json({ success: true, result: url.endsWith('/settings') ? { bindings } : [{ id: env.CLOUDFLARE_WORKER_NAME, modified_on: `revision-${revision}` }] });
  };
  return { env, calls, source: () => createCloudflarePasswordSource({ env, fetchImpl }), bindings: () => bindings, manual: value => { bindings.find(b => b.name === 'ADMIN_PASSWORD').text = value; revision++; }, fail: () => { fail = true; } };
}

test('Cloudflare password source reads live settings and preserves other bindings using inheritance', async () => {
  assert.equal(typeof createCloudflarePasswordSource, 'function', 'Cloudflare password source must be implemented');
  const f = sourceFixture(), source = f.source();
  assert.equal((await source.read()).password, 'ap');
  await source.write('b'); assert.equal((await source.read()).password, 'b');
  assert.equal(f.bindings().find(b => b.name === 'OTHER').text, 'preserve');
  assert.deepEqual(f.calls[0].bindings.filter(b => b.name !== 'ADMIN_PASSWORD'), ['OTHER', 'GITHUB_TOKEN', 'SEMINAR_STATE'].map(name => ({ name, type: 'inherit' })));
  const before = (await source.read()).revision; f.manual('ap'); assert.notEqual((await source.read()).revision, before);
  await assert.rejects(source.write(''), e => e.status === 400);
  f.fail(); await assert.rejects(source.read(), e => e.status === 503 && !e.message.includes('PRIVATE'));
});

test('Cloudflare production supports secure sessions and manual password edits revoke them', async t => {
  assert.equal(typeof createCloudflareStore, 'function', 'Cloudflare storage adapter must be implemented');
  assert.equal(typeof createCloudflarePasswordSource, 'function', 'Cloudflare password source must be implemented');
  const f = sourceFixture(), store = createCloudflareStore(storage(t));
  const env = { ...f.env, NODE_ENV: 'production', SESSION_SECRET: 'test-secret-never-production-'.repeat(2) };
  const repository = { mode: 'github', read: async () => ({ content: { schemaVersion: 1, site: {}, talks: [] }, revision: 'test-only' }) };
  const api = createApi({ repository, store, env, passwords: createEnvironmentPassword({ source: f.source(), store, secret: env.SESSION_SECRET }) });
  const login = await api(new Request('https://seminar.example/api/login', { method: 'POST', headers: { origin: 'https://seminar.example', 'content-type': 'application/json' }, body: JSON.stringify({ password: 'ap' }) }));
  assert.equal(login.status, 200, await login.clone().text());
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict;.*Secure/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await api(new Request('https://seminar.example/api/admin/content', { headers: { cookie } }))).status, 200);
  f.manual('b'); assert.equal((await api(new Request('https://seminar.example/api/admin/content', { headers: { cookie } }))).status, 401);
});

test('Cloudflare uploads use smaller staging chunks and preserve assembled file bytes', async t => {
  assert.equal(typeof createCloudflareStore, 'function', 'Cloudflare storage adapter must be implemented');
  const store = createCloudflareStore(storage(t)), bytes = Buffer.alloc(600_000, 0x61); bytes.write('%PDF-1.7\n');
  let actual;
  const uploads = createUploads({ upload: async (_, value) => { actual = value; } }, store, { chunkSize: 512 * 1024 });
  const session = { id: 'test-session', exp: Date.now() + 600_000 };
  const init = await uploads.start({ name: 'slides.pdf', size: bytes.length, talk: { date: '2026-10-06', title: 'Title for test', speaker: 'Test' } }, session);
  assert.equal(init.chunkSize, 512 * 1024);
  for (let n = 0; n < Math.ceil(bytes.length / init.chunkSize); n++) await uploads.chunk(init.id, String(n), new Request('https://seminar.example/api/upload', { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes.subarray(n * init.chunkSize, (n + 1) * init.chunkSize) }), session);
  const result = await uploads.complete(init.id, session);
  assert.deepEqual(actual, bytes); assert.match(result.attachment.path, /^attachments\/2026\//);
  assert.equal((await store.list(`uploads/${init.id}/parts/`)).length, 0);
});
