import test from 'node:test';
import assert from 'node:assert/strict';
import { createVercelStore } from '../server/vercel-store.mjs';
import { createVercelPasswordSource } from '../server/vercel-password-source.mjs';
import { createVercelHandler } from '../server/vercel-handler.mjs';
import { createEnvironmentPassword } from '../server/environment-password.mjs';

function redisFixture() {
  const values = new Map(); let fail = false;
  return { fail: () => { fail = true; }, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://fixture.upstash.io'); assert.equal(options.headers.authorization, 'Bearer test-redis-token');
    if (fail) return Response.json({ error: 'PRIVATE DIAGNOSTIC' }, { status: 403 });
    const [command, ...args] = JSON.parse(options.body); let result;
    if (command === 'GET') result = values.get(args[0]) ?? null;
    if (command === 'DEL') result = Number(values.delete(args[0]));
    if (command === 'SCAN') result = ['0', [...values.keys()].filter(key => key.startsWith(args[2].slice(0, -1)))];
    if (command === 'EVAL') {
      const [, count, key, condition, match, value, ttl] = args;
      assert.equal(count, '1'); assert.equal(ttl, '86400');
      const previous = values.get(key);
      result = condition === 'new' && previous !== undefined || condition === 'match' && (!previous || JSON.parse(previous).etag !== match) ? 0 : 1;
      if (result) values.set(key, value);
    }
    assert.notEqual(result, undefined, 'Unexpected Redis command');
    return Response.json({ result });
  } };
}
const environment = { VERCEL: '1', VERCEL_PROJECT_ID: 'prj_fixture', VERCEL_ADMIN_PASSWORD_ENV_ID: 'env_fixture', VERCEL_ENV_TOKEN: 'test-vercel-token', UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-redis-token', SESSION_SECRET: 'fixture-secret-'.repeat(4) };
function passwordFixture() {
  let password = 'ap', updatedAt = 1, target = ['production']; const writes = [];
  return { writes, manual: value => { password = value; updatedAt++; }, unsafeTarget: () => { target = ['production', 'preview']; }, fetchImpl: async (url, options) => {
    assert.equal(options.headers.authorization, 'Bearer test-vercel-token');
    const address = new URL(url); assert.equal(address.hostname, 'api.vercel.com');
    assert.match(address.pathname, /^\/(v1|v9)\/projects\/prj_fixture\/env\/env_fixture$/);
    if (options.method === 'PATCH') { writes.push(JSON.parse(options.body)); password = writes.at(-1).value; updatedAt++; }
    return Response.json({ id: 'env_fixture', key: 'ADMIN_PASSWORD', value: password, type: 'plain', target, updatedAt });
  } };
}
test('Vercel private state rejects stale concurrent writes and isolates projects', async () => {
  const redis = redisFixture(), store = createVercelStore({ env: environment, fetchImpl: redis.fetchImpl });
  const first = await store.put('sessions/one', Buffer.from([0, 255, 3]), { onlyIfNew: true });
  assert.equal(first.modified, true); assert.deepEqual((await store.get('sessions/one')).data, Buffer.from([0, 255, 3]));
  assert.equal((await store.put('sessions/one', Buffer.from('bad'), { onlyIfNew: true })).modified, false);
  const concurrent = await Promise.all([store.put('sessions/one', Buffer.from('left'), { onlyIfMatch: first.etag }), store.put('sessions/one', Buffer.from('right'), { onlyIfMatch: first.etag })]);
  assert.equal(concurrent.filter(x => x.modified).length, 1);
  assert.deepEqual(await store.list('sessions/'), ['sessions/one']);
  const separate = createVercelStore({ env: { ...environment, VERCEL_PROJECT_ID: 'prj_other' }, fetchImpl: redis.fetchImpl });
  assert.equal(await separate.get('sessions/one'), null); assert.deepEqual(await separate.list('sessions/'), []);
  await store.delete('sessions/one'); assert.equal(await store.get('sessions/one'), null);
  redis.fail(); await assert.rejects(store.get('sessions/one'), error => error.status === 503 && !error.message.includes('PRIVATE'));
});
test('Vercel password API edits only the selected production password and rejects shared targets', async () => {
  const f = passwordFixture(), source = createVercelPasswordSource({ env: environment, fetchImpl: f.fetchImpl });
  const before = await source.read(); assert.equal(before.password, 'ap');
  await source.write('b'); assert.deepEqual(f.writes, [{ value: 'b' }]); assert.notEqual((await source.read()).revision, before.revision);
  await assert.rejects(source.write(''), { status: 400 });
  f.unsafeTarget(); await assert.rejects(source.write('c'), { status: 503 }); assert.equal(f.writes.length, 1);
});
test('Vercel rewrite preserves authentication, origin checks and session invalidation', async () => {
  const redis = redisFixture(), f = passwordFixture(), store = createVercelStore({ env: environment, fetchImpl: redis.fetchImpl });
  const repository = { mode: 'github', read: async () => ({ content: { schemaVersion: 1, site: {}, talks: [] }, revision: 'fixture' }), publicUrl: path => 'https://raw.githubusercontent.com/example/repo/main/' + path };
  const passwords = createEnvironmentPassword({ source: createVercelPasswordSource({ env: environment, fetchImpl: f.fetchImpl }), store, secret: environment.SESSION_SECRET });
  const handler = createVercelHandler({ env: environment, repository, store, passwords });
  const request = (path, method = 'GET', data, cookie = '', origin = 'https://seminar.vercel.app') => handler(new Request('https://seminar.vercel.app/api/seminar?path=' + path, { method, headers: { origin, cookie, 'content-type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) }));
  assert.equal((await request('content')).status, 200);
  assert.equal((await request('login', 'POST', { password: 'ap' }, '', 'https://elsewhere.example')).status, 403);
  const login = await request('login', 'POST', { password: 'ap' }); assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict;.*Secure/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('admin/content', 'GET', undefined, cookie)).status, 200);
  const start = await request('admin/uploads', 'POST', { talk: { date: '2026-10-06', speaker: 'Fixture', title: 'Fixture talk' }, name: 'fixture.pdf', size: 8 }, cookie);
  assert.equal(start.status, 200); assert.equal((await start.json()).chunkSize, 512 * 1024);
  f.manual('b'); assert.equal((await request('admin/content', 'GET', undefined, cookie)).status, 401);
  assert.equal((await request('../admin/content')).status, 404);
  const pdf = await handler(new Request('https://seminar.vercel.app/api/seminar?attachment=attachments/2026/file.pdf'));
  assert.equal(pdf.status, 307); assert.equal(pdf.headers.get('location'), repository.publicUrl('attachments/2026/file.pdf'));
  assert.equal((await handler(new Request('https://seminar.vercel.app/api/seminar?attachment=attachments/../secret.txt'))).status, 404);
});
