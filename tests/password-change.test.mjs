import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApi } from '../server/api.mjs';
import { hashPassword, verifyPassword, signSession } from '../server/auth.mjs';
import { createLocalStore } from '../server/local-store.mjs';
import { getJson, putJson } from '../server/private-store.mjs';

const initialPassword = 'initial test password 123!';
const newPassword = 'replacement test password 456!';
const initialHash = await hashPassword(initialPassword);
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'seminar-password-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = Object.freeze({ ADMIN_PASSWORD_HASH: initialHash, SESSION_SECRET: 'test-session-secret-'.repeat(4), NODE_ENV: 'test' });
  const repository = { mode: 'local', read: async () => ({ content: { schemaVersion: 1, site: {}, talks: [] }, revision: 'unchanged' }), save: () => { throw new Error('Password changes must not write to the repository'); } };
  const store = createLocalStore(root);
  const makeApi = (configuration = env) => createApi({ repository, store: createLocalStore(root), env: configuration });
  const api = makeApi();
  const request = (path, { method = 'GET', body, cookie = '', headers = {}, handler = api } = {}) => handler(new Request(`http://localhost${path}`, {
    method, headers: { cookie, origin: 'http://localhost', 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { ip: '127.0.0.1' });
  const login = async () => { const r = await request('/api/login', { method: 'POST', body: { password: initialPassword } }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; };
  return { request, login, store, env, makeApi };
}

test('password changes persist across API instances without touching environment or repository, and revoke every old session', async t => {
  const f = await setup(t);
  const first = await f.login(), second = await f.login();
  const changed = await f.request('/api/admin/password', { method: 'POST', cookie: first, body: { currentPassword: initialPassword, newPassword } });
  assert.equal(changed.status, 200, await changed.clone().text());
  assert.match(changed.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(f.env.ADMIN_PASSWORD_HASH, initialHash);
  const stored = await getJson(f.store, 'auth/admin-password');
  assert.ok(await verifyPassword(newPassword, stored.value.hash));
  assert.ok(!JSON.stringify(stored.value).includes(newPassword));
  for (const cookie of [first, second]) {
    assert.equal((await f.request('/api/admin/content', { cookie })).status, 401);
    assert.equal((await (await f.request('/api/session', { cookie })).json()).authenticated, false);
  }
  const handler = f.makeApi();
  assert.equal((await f.request('/api/login', { handler, method: 'POST', body: { password: initialPassword } })).status, 401);
  const fresh = await f.request('/api/login', { handler, method: 'POST', body: { password: newPassword } });
  assert.equal(fresh.status, 200);
  const cookie = fresh.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('/api/admin/content', { handler, cookie })).status, 200);
  const nextPassword = 'another replacement test password 789!';
  assert.equal((await f.request('/api/admin/password', { handler, method: 'POST', cookie, body: { currentPassword: newPassword, newPassword: nextPassword } })).status, 200);
  assert.equal((await f.request('/api/admin/content', { handler, cookie })).status, 401);
  assert.ok(await verifyPassword(nextPassword, (await getJson(f.store, 'auth/admin-password')).value.hash));
  const noInitialHash = f.makeApi({ ...f.env, ADMIN_PASSWORD_HASH: '' });
  assert.equal((await f.request('/api/login', { handler: noInitialHash, method: 'POST', body: { password: nextPassword } })).status, 200);
  const publicResponse = await f.request('/api/content');
  assert.equal(publicResponse.status, 200);
  assert.ok(!(await publicResponse.text()).includes('scrypt'));
});

test('password changes require a session, same origin, correct current password and a valid different new password', async t => {
  const f = await setup(t);
  const body = { currentPassword: initialPassword, newPassword };
  assert.equal((await f.request('/api/admin/password', { method: 'POST', body })).status, 401);
  const cookie = await f.login();
  for (const origin of ['', 'https://foreign.example']) assert.equal((await f.request('/api/admin/password', { method: 'POST', cookie, body, headers: { origin } })).status, 403);
  for (const invalid of [
    { ...body, currentPassword: 'wrong current password' },
    { ...body, newPassword: '' },
    { ...body, newPassword: '   ' },
    { ...body, newPassword: initialPassword },
  ]) assert.equal((await f.request('/api/admin/password', { method: 'POST', cookie, body: invalid })).status, 400);
  assert.equal(await getJson(f.store, 'auth/admin-password'), null);
  assert.equal((await f.request('/api/admin/content', { cookie })).status, 200);
});

test('concurrent password changes can only commit one new credential', async t => {
  const f = await setup(t), cookie = await f.login();
  const passwords = [newPassword, 'concurrent alternate password 123!'];
  const results = await Promise.all(passwords.map(value => f.request('/api/admin/password', { method: 'POST', cookie, body: { currentPassword: initialPassword, newPassword: value } })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.ok(results.every(r => [200, 401, 409].includes(r.status)));
  const winner = results.findIndex(r => r.status === 200);
  const saved = await getJson(f.store, 'auth/admin-password');
  assert.ok(await verifyPassword(passwords[winner], saved.value.hash));
  assert.ok(!await verifyPassword(passwords[1 - winner], saved.value.hash));
});

test('short and long passwords can be saved and used to reauthenticate', async t => {
  const f = await setup(t);
  let currentPassword = initialPassword, cookie = await f.login();
  for (const next of ['ap', 'x'.repeat(129), 'x'.repeat(2048), 'x'.repeat(9000)]) {
    assert.equal((await f.request('/api/admin/password', { cookie, method: 'POST', body: { currentPassword, newPassword: next } })).status, 200);
    assert.equal((await f.request('/api/admin/content', { cookie })).status, 401);
    const response = await f.request('/api/login', { method: 'POST', body: { password: next } });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(';')[0];
    currentPassword = next;
  }
});

test('failed password guesses are throttled across API instances', async t => {
  const f = await setup(t), cookie = await f.login();
  const options = { method: 'POST', cookie, body: { currentPassword: 'incorrect old password', newPassword } };
  for (let i = 0; i < 8; i++) assert.equal((await f.request('/api/admin/password', options)).status, 400);
  assert.equal((await f.request('/api/admin/password', { ...options, handler: f.makeApi() })).status, 429);
  assert.equal(await getJson(f.store, 'auth/admin-password'), null);
});

test('invalid stored credentials never silently re-enable the environment password', async t => {
  const f = await setup(t);
  await putJson(f.store, 'auth/admin-password', { hash: 'invalid', version: 'broken' });
  assert.equal((await f.request('/api/login', { method: 'POST', body: { password: initialPassword } })).status, 503);
});

test('legacy signed sessions work before the first password change and are revoked afterwards', async t => {
  const f = await setup(t);
  const legacy = { id: randomUUID(), exp: Date.now() + 60_000 };
  await putJson(f.store, `sessions/${legacy.id}`, legacy);
  const cookie = `seminar_session=${signSession(legacy, f.env.SESSION_SECRET)}`;
  assert.equal((await f.request('/api/admin/content', { cookie })).status, 200);
  assert.equal((await f.request('/api/admin/password', { method: 'POST', cookie, body: { currentPassword: initialPassword, newPassword } })).status, 200);
  assert.equal((await f.request('/api/admin/content', { cookie })).status, 401);
});
