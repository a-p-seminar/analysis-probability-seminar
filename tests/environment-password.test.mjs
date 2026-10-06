import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../server/api.mjs';
import { createEnvironmentPassword } from '../server/environment-password.mjs';
import { createNetlifyPasswordSource } from '../server/netlify-password-source.mjs';
import { createLocalStore } from '../server/local-store.mjs';
import { getJson, putJson } from '../server/private-store.mjs';

const initial = 'environment test password 123!';
const replacement = 'replacement environment password 456!';
const siteId = '12345678-1234-1234-1234-123456789abc';
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'seminar-env-password-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createLocalStore(root), calls = [];
  let counter = 1, failure = null;
  let variable = { key: 'ADMIN_PASSWORD', scopes: ['functions'], is_secret: false, updated_at: 'revision-1', values: [{ id: 'production-value', context: 'production', value: initial }, { context: 'deploy-preview', value: 'separate preview value' }] };
  const fetchImpl = async (url, options) => {
    assert.equal(url, `https://api.netlify.com/api/v1/accounts/seminar-team/env/ADMIN_PASSWORD?site_id=${siteId}`);
    assert.equal(options.headers.authorization, 'Bearer test-api-token');
    calls.push({ method: options.method, body: options.body && JSON.parse(options.body) });
    if (failure === options.method) return new Response('PRIVATE API ERROR MUST NOT LEAK', { status: 403 });
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      assert.equal(body.context, 'production');
      variable.values = variable.values.filter(v => v.context !== 'production');
      variable.values.push({ context: 'production', value: body.value });
      variable.updated_at = `revision-${++counter}`;
    }
    return Response.json(variable, { status: options.method === 'PATCH' ? 201 : 200 });
  };
  const env = Object.freeze({ NETLIFY_ENV_TOKEN: 'test-api-token', NETLIFY_ACCOUNT_ID: 'seminar-team', SITE_ID: siteId, SESSION_SECRET: 'test-session-secret-'.repeat(4) });
  const source = createNetlifyPasswordSource({ env, fetchImpl });
  const repository = { mode: 'local', read: async () => ({ content: { schemaVersion: 1, site: {}, talks: [] }, revision: 'unchanged' }), save: () => { throw new Error('Password changes must not commit files'); } };
  const makeApi = () => createApi({ repository, store, env, passwords: createEnvironmentPassword({ source, store, secret: env.SESSION_SECRET }) });
  const api = makeApi();
  const request = (path, { method = 'GET', body, cookie = '', handler = api, origin = 'http://localhost' } = {}) => handler(new Request(`http://localhost${path}`, { method, headers: { cookie, origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { ip: '127.0.0.1' });
  const login = async (password = initial, handler = api) => { const r = await request('/api/login', { handler, method: 'POST', body: { password } }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const manualChange = password => { variable.values.find(v => v.context === 'production').value = password; variable.updated_at = `revision-${++counter}`; };
  return { store, calls, env, source, request, login, makeApi, manualChange, variable: () => variable, fail: method => { failure = method; } };
}

test('manual Netlify environment edits take effect on an existing API instance and revoke old sessions without deploys', async t => {
  const f = await setup(t), cookie = await f.login();
  f.manualChange(replacement);
  assert.equal((await f.request('/api/admin/content', { cookie })).status, 401);
  assert.equal((await f.request('/api/login', { method: 'POST', body: { password: initial } })).status, 401);
  await f.login(replacement);
  // Resetting to an earlier password must not resurrect an earlier signed session.
  f.manualChange(initial);
  assert.equal((await f.request('/api/admin/content', { cookie })).status, 401);
  assert.ok(f.calls.every(c => c.method === 'GET'));
});

test('admin password changes write the production plaintext variable, preserve other contexts, and never store a competing password', async t => {
  const f = await setup(t), cookie = await f.login(), second = await f.login();
  const changed = await f.request('/api/admin/password', { method: 'POST', cookie, body: { currentPassword: initial, newPassword: replacement } });
  assert.equal(changed.status, 200, await changed.clone().text());
  assert.match(changed.headers.get('set-cookie'), /Max-Age=0/);
  assert.deepEqual(f.calls.filter(c => c.method === 'PATCH').map(c => c.body), [{ context: 'production', value: replacement }]);
  assert.equal(f.variable().values.find(v => v.context === 'deploy-preview').value, 'separate preview value');
  assert.equal(await getJson(f.store, 'auth/admin-password'), null);
  assert.equal((await f.request('/api/admin/content', { cookie: second })).status, 401);
  assert.equal((await f.request('/api/admin/content', { cookie })).status, 401);
  await f.login(replacement, f.makeApi());
  assert.equal(f.env.ADMIN_PASSWORD, undefined);
  assert.ok(!(await (await f.request('/api/content')).text()).includes(replacement));
});

test('the live environment credential overrides previously saved hash records', async t => {
  const f = await setup(t);
  await putJson(f.store, 'auth/admin-password', { hash: 'outdated or corrupt hash' });
  await f.login();
});

test('concurrent admin changes commit only one environment password', async t => {
  const f = await setup(t), cookie = await f.login();
  const results = await Promise.all([replacement, 'other concurrent new password 789!'].map(newPassword => f.request('/api/admin/password', { cookie, method: 'POST', body: { currentPassword: initial, newPassword }, handler: f.makeApi() })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.ok(results.every(r => [200, 401, 409].includes(r.status)));
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1);
});

test('invalid or unauthenticated password changes never write the environment', async t => {
  const f = await setup(t);
  const body = { currentPassword: initial, newPassword: replacement };
  assert.equal((await f.request('/api/admin/password', { method: 'POST', body })).status, 401);
  const cookie = await f.login();
  assert.equal((await f.request('/api/admin/password', { method: 'POST', body, cookie, origin: 'https://foreign.example' })).status, 403);
  for (const invalid of [{ ...body, currentPassword: 'incorrect password' }, { ...body, newPassword: 'short' }, { ...body, newPassword: initial }]) {
    assert.equal((await f.request('/api/admin/password', { method: 'POST', cookie, body: invalid })).status, 400);
  }
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0);
});

test('remote read and write errors fail closed without exposing secrets or reporting a successful change', async t => {
  const f = await setup(t), cookie = await f.login();
  f.fail('PATCH');
  const changed = await f.request('/api/admin/password', { method: 'POST', cookie, body: { currentPassword: initial, newPassword: replacement } });
  assert.equal(changed.status, 503);
  assert.ok(!(await changed.text()).includes('PRIVATE API ERROR'));
  assert.equal(f.variable().values.find(v => v.context === 'production').value, initial);
  f.fail('GET');
  assert.equal((await f.request('/api/admin/content', { cookie })).status, 503);
  assert.equal((await f.request('/api/content')).status, 200);
});

test('unreadable secret values, missing production values and non-function scopes fail closed', async t => {
  const f = await setup(t);
  for (const invalid of [
    { key: 'ADMIN_PASSWORD', scopes: ['functions'], is_secret: true, values: [{ context: 'production', value: initial }] },
    { key: 'ADMIN_PASSWORD', scopes: ['functions'], values: [{ context: 'deploy-preview', value: initial }] },
    { key: 'ADMIN_PASSWORD', scopes: ['builds'], values: [{ context: 'production', value: initial }] },
  ]) {
    const source = createNetlifyPasswordSource({ env: f.env, fetchImpl: async () => Response.json(invalid) });
    await assert.rejects(source.read(), { status: 503 });
  }
});

test('an all-context variable can be read and its production override can be set without replacing all values', async t => {
  const f = await setup(t);
  f.variable().values = [{ id: 'all-value', context: 'all', value: initial }];
  await f.login();
  await f.source.write(replacement);
  assert.equal((await f.source.read()).password, replacement);
  assert.equal(f.variable().values.find(v => v.context === 'all').value, initial);
});
