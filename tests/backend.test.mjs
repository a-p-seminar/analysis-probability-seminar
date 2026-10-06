import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../server/api.mjs';
import { hashPassword } from '../server/auth.mjs';
import { createLocalRepository } from '../server/local-repository.mjs';
import { createLocalStore } from '../server/local-store.mjs';
import { getJson, putJson } from '../server/private-store.mjs';
import { createUploads, validFileSignature } from '../server/uploads.mjs';
import { sessionCookie } from '../server/auth.mjs';
import { validateContent } from '../server/content.mjs';

test('content saves reject an end time equal to or earlier than the start time', async () => {
  for (const endTime of ['14:00', '13:59', '00:30']) {
    const content = { schemaVersion: 1, site: { title: 'Seminar' }, talks: [{ id: 'invalid-time', date: '2026-10-05', speaker: 'Speaker', title: 'Title', attachments: [], startTime: '14:00', endTime }] };
    await assert.rejects(validateContent(content, {}), /结束时间必须晚于开始时间/);
  }
});

test('legacy institution fields migrate to a single slash-separated field and time remains validated', async () => {
  const fixture = { schemaVersion: 1, site: { title: 'Seminar' }, talks: [{ id: 'fields', date: '2026-10-05', speaker: 'Speaker', title: 'Title', attachments: [], affiliationZh: '克里特大学', affiliationEn: 'Crete University', startTime: '14:00', endTime: '15:30', time: 'old' }] };
  const saved = await validateContent(fixture, {});
  assert.equal(saved.talks[0].time, '14:00-15:30');
  assert.equal(saved.talks[0].affiliation, '克里特大学/Crete University');
  assert.equal(saved.talks[0].affiliationZh, undefined);
  assert.equal(saved.talks[0].affiliationEn, undefined);
  const changed = structuredClone(fixture); changed.talks[0].affiliation = ' New University / New Institute ';
  assert.equal((await validateContent(changed, {})).talks[0].affiliation, 'New University/New Institute');
  changed.talks[0].affiliation = '';
  assert.equal((await validateContent(changed, {})).talks[0].affiliation, '');
  for (const changes of [{ startTime: '25:00' }, { endTime: '' }, { affiliationEn: {} }, { endTime: '15:60' }, { startTime: '14:00junk' }]) {
    const invalid = structuredClone(fixture);
    Object.assign(invalid.talks[0], changes);
    await assert.rejects(() => validateContent(invalid, {}), error => error.status === 400);
  }
  assert.equal(fixture.talks[0].time, 'old');
});

const password = 'a strong test password 987654!';
const content = { schemaVersion: 1, site: { title: 'Seminar', extra: 'preserve me' }, talks: [{ id: '2026-test', date: '2026-10-04', speaker: 'Speaker', title: 'Full talk', abstract: 'A complete abstract', attachments: [], sourceUrls: [] }] };
const env = { ADMIN_PASSWORD_HASH: await hashPassword(password), SESSION_SECRET: 'a'.repeat(64), NODE_ENV: 'test' };
async function setup(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'seminar-api-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'content'));
  await writeFile(join(root, 'content/seminars.json'), JSON.stringify(content));
  const repository = createLocalRepository(root), store = createLocalStore(join(root, '.private'));
  const api = createApi({ repository, store, env: { ...env, ...overrides } });
  let cookie = '';
  const request = async (path, method = 'GET', body, headers = {}) => {
    const response = await api(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { origin: 'http://localhost', 'content-type': body instanceof Uint8Array ? 'application/octet-stream' : 'application/json' } : {}), ...headers }, ...(body === undefined ? {} : { body: body instanceof Uint8Array ? body : JSON.stringify(body) }) }), { ip: '127.0.0.1' });
    return response;
  };
  const login = async () => { const response = await request('/api/login', 'POST', { password }); assert.equal(response.status, 200, await response.clone().text()); cookie = response.headers.get('set-cookie').split(';')[0]; return response; };
  return { root, repository, store, api, request, login, setCookie: (value) => { cookie = value; } };
}

test('public content works and admin content requires a real signed session', async t => {
  const f = await setup(t);
  assert.equal((await f.request('/api/content')).status, 200);
  assert.equal((await f.request('/api/admin/content')).status, 401);
  f.setCookie('seminar_session=forged');
  assert.equal((await f.request('/api/admin/content')).status, 401);
  const login = await f.login();
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await f.request('/api/admin/content')).status, 200);
  assert.equal((await f.request('/api/logout', 'POST')).status, 200);
  assert.equal((await f.request('/api/admin/content')).status, 401);
});

test('rejects absent or foreign origins, bad passwords, and rate limits persistent attempts', async t => {
  const f = await setup(t);
  assert.equal((await f.request('/api/login', 'POST', { password }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.api(new Request('http://localhost/api/login', { method: 'POST', body: JSON.stringify({ password }) }))).status, 403);
  for (let n = 0; n < 8; n++) assert.equal((await f.request('/api/login', 'POST', { password: 'bad' })).status, 401);
  assert.equal((await f.request('/api/login', 'POST', { password })).status, 429);
});

test('production fails closed with local adapters or weak authentication configuration', async t => {
  const f = await setup(t, { NODE_ENV: 'production' });
  assert.equal((await f.request('/api/login', 'POST', { password })).status, 503);
  const weak = await setup(t, { SESSION_SECRET: '' });
  assert.equal((await weak.request('/api/login', 'POST', { password })).status, 503);
});

test('content saves preserve metadata and stale/concurrent revisions never overwrite', async t => {
  const f = await setup(t); await f.login();
  const first = await (await f.request('/api/admin/content')).json();
  const changed = structuredClone(first.content); changed.talks[0].title = 'Changed';
  const attempts = await Promise.all([1, 2].map(() => f.request('/api/admin/content', 'PUT', { content: changed, revision: first.revision })));
  assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409]);
  const saved = await (await f.request('/api/admin/content')).json();
  assert.equal(saved.content.site.extra, 'preserve me');
  assert.equal(saved.content.talks[0].title, 'Changed');
});

test('invalid calendar dates, unsafe URLs, duplicate ids and missing attachment references are rejected', async t => {
  const f = await setup(t); await f.login(); const initial = await f.repository.read();
  for (const mutate of [c => c.talks[0].date = '2026-02-30', c => c.talks[0].sourceUrls = ['javascript:alert(1)'], c => c.talks.push(c.talks[0]), c => c.talks[0].attachments.push({ id: 'bad', name: 'missing.pdf', path: 'attachments/2026/missing.pdf', size: 12, type: 'pdf' })]) {
    const candidate = structuredClone(initial.content); mutate(candidate);
    assert.equal((await f.request('/api/admin/content', 'PUT', { content: candidate, revision: initial.revision })).status, 400);
  }
});

test('multipart upload enforces parts and bytes, then completes idempotently and exposes only public derived URLs', async t => {
  const f = await setup(t); await f.login();
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 43, 32); bytes.write('%PDF-1.7\n');
  const start = await f.request('/api/admin/uploads', 'POST', { name: '../../lecture.pdf', size: bytes.length, talk: content.talks[0] });
  assert.equal(start.status, 200); const { id, chunkSize } = await start.json(); assert.equal(chunkSize, 2 * 1024 * 1024);
  assert.equal((await f.request(`/api/admin/uploads/${id}/0`, 'PUT', bytes.subarray(0, chunkSize))).status, 200);
  assert.equal((await f.request(`/api/admin/uploads/${id}/complete`, 'POST')).status, 409);
  assert.equal((await f.request(`/api/admin/uploads/${id}/1`, 'PUT', bytes.subarray(chunkSize))).status, 200);
  const completed = await f.request(`/api/admin/uploads/${id}/complete`, 'POST'); assert.equal(completed.status, 200, await completed.clone().text());
  const { attachment } = await completed.json(); assert.equal(attachment.path, `attachments/2026/261004_Speaker_Full_${id}.pdf`);
  assert.deepEqual(await readFile(join(f.root, attachment.path)), bytes);
  assert.deepEqual(await (await f.request(`/api/admin/uploads/${id}/complete`, 'POST')).json(), { attachment });
  assert.equal((await f.store.list(`uploads/${id}/parts/`)).length, 0);
  const current = await f.repository.read(); current.content.talks[0].attachments = [attachment];
  assert.equal((await f.request('/api/admin/content', 'PUT', current)).status, 200);
  const publicData = await (await f.request('/api/content')).json(); assert.equal(publicData.content.talks[0].attachments[0].url, `/${attachment.path}`);
  const privateData = await (await f.request('/api/admin/content')).json(); assert.ok(!privateData.content.talks[0].attachments[0].url);
});

test('upload limits, magic signatures, session ownership and cancellation are enforced', async t => {
  const f = await setup(t); await f.login();
  for (const input of [{ name: 'bad.exe', size: 10 }, { name: 'huge.pdf', size: 50 * 1024 * 1024 + 1 }, { name: 'empty.pdf', size: 0 }]) assert.equal((await f.request('/api/admin/uploads', 'POST', { ...input, talk: content.talks[0] })).status, 400);
  const { id } = await (await f.request('/api/admin/uploads', 'POST', { name: 'bad.pdf', size: 8, talk: content.talks[0] })).json();
  assert.equal((await f.request(`/api/admin/uploads/${id}/0`, 'PUT', Buffer.alloc(9))).status, 413);
  assert.equal((await f.request(`/api/admin/uploads/${id}/2`, 'PUT', Buffer.alloc(8))).status, 400);
  assert.equal((await f.request(`/api/admin/uploads/${id}/0`, 'PUT', Buffer.from('not pdf!'))).status, 200);
  assert.equal((await f.request(`/api/admin/uploads/${id}/complete`, 'POST')).status, 400);
  await f.login();
  assert.equal((await f.request(`/api/admin/uploads/${id}/complete`, 'POST')).status, 404);
  const second = await (await f.request('/api/admin/uploads', 'POST', { name: 'valid.pdf', size: 8, talk: content.talks[0] })).json();
  assert.equal((await f.request(`/api/admin/uploads/${second.id}`, 'DELETE')).status, 200);
  assert.equal((await f.request(`/api/admin/uploads/${second.id}/0`, 'PUT', Buffer.alloc(8))).status, 404);
});

test('uploads go directly under the report year and same-report files have distinct ID basenames', async t => {
  const f = await setup(t); await f.login();
  const talk = { date: '2023-07-01', speaker: '张三', title: 'Random walks and dimension' };
  const paths = [];
  for (const bytes of [Buffer.from('%PDF-1.7\nFirst'), Buffer.from('%PDF-1.7\nSecond')]) {
    const start = await f.request('/api/admin/uploads', 'POST', { name: 'original.pdf', size: bytes.length, talk });
    assert.equal(start.status, 200);
    const { id, name } = await start.json();
    assert.equal(name, `230701_张三_Random_${id}.pdf`);
    assert.equal((await f.request(`/api/admin/uploads/${id}/0`, 'PUT', bytes)).status, 200);
    const response = await f.request(`/api/admin/uploads/${id}/complete`, 'POST');
    assert.equal(response.status, 200);
    const { attachment } = await response.json();
    assert.equal(attachment.name, name);
    assert.equal(attachment.path.split('/').at(-1), name);
    assert.equal(attachment.path, `attachments/2023/${name}`);
    assert.deepEqual(await readFile(join(f.root, attachment.path)), bytes);
    assert.ok(f.repository.publicUrl(attachment.path).endsWith(encodeURIComponent(name)));
    paths.push(attachment.path);
  }
  assert.notEqual(paths[0], paths[1]);
});

test('uploads reject missing or invalid report metadata before storing chunks', async t => {
  const f = await setup(t); await f.login();
  for (const talk of [undefined, {}, { date: '2023-02-29', speaker: 'Name', title: 'Title' }, { date: '2023-07-01', speaker: '', title: 'Title' }]) {
    assert.equal((await f.request('/api/admin/uploads', 'POST', { name: 'lecture.pdf', size: 8, talk })).status, 400);
  }
  assert.deepEqual(await f.store.list('uploads/'), []);
});

test('expired staging and orphan chunks are rejected and removed from private storage', async t => {
  const f = await setup(t); await f.login();
  const { id } = await (await f.request('/api/admin/uploads', 'POST', { name: 'expired.pdf', size: 8, talk: content.talks[0] })).json();
  assert.equal((await f.request(`/api/admin/uploads/${id}/0`, 'PUT', Buffer.from('%PDF-1.7'))).status, 200);
  const record = await getJson(f.store, `uploads/${id}/meta`);
  await putJson(f.store, `uploads/${id}/meta`, { ...record.value, expires: Date.now() - 1 }, { onlyIfMatch: record.etag });
  assert.equal((await f.request(`/api/admin/uploads/${id}/complete`, 'POST')).status, 404);
  await f.store.put('uploads/orphan/parts/0', Buffer.from('orphan'));
  await createUploads(f.repository, f.store).cleanup();
  assert.deepEqual(await f.store.list('uploads/'), []);
});

test('concurrent completion returns one portable result and never writes partial bytes', async t => {
  const f = await setup(t); await f.login();
  const bytes = Buffer.from('%PDF-1.7\nComplete content');
  const { id } = await (await f.request('/api/admin/uploads', 'POST', { name: 'parallel.pdf', size: bytes.length, talk: content.talks[0] })).json();
  await f.request(`/api/admin/uploads/${id}/0`, 'PUT', bytes);
  const results = await Promise.all([1, 2, 3].map(() => f.request(`/api/admin/uploads/${id}/complete`, 'POST')));
  assert.ok(results.some(response => response.status === 200));
  assert.ok(results.every(response => [200, 409].includes(response.status)));
  const { attachment } = await (await f.request(`/api/admin/uploads/${id}/complete`, 'POST')).json();
  assert.deepEqual(await readFile(join(f.root, attachment.path)), bytes);
  assert.equal((await f.request(`/api/admin/uploads/${id}/0`, 'PUT', bytes)).status, 409);
});

test('login throttles survive a new API instance and production cookies are secure', async t => {
  const f = await setup(t);
  for (let i = 0; i < 8; i++) await f.request('/api/login', 'POST', { password: 'bad' });
  const second = createApi({ repository: f.repository, store: createLocalStore(join(f.root, '.private')), env });
  const response = await second(new Request('http://localhost/api/login', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ password }) }), { ip: '127.0.0.1' });
  assert.equal(response.status, 429);
  assert.match(sessionCookie('signed', true), /; Secure/);
});

test('content validator rejects malformed attachment paths and retains custom talk metadata', async t => {
  const f = await setup(t); await f.login(); const first = await f.repository.read();
  for (const path of ['attachments/../secret.pdf', 'attachments/%2e%2e/secret.pdf', 'attachments\\secret.pdf']) {
    const draft = structuredClone(first.content); draft.talks[0].attachments = [{ id: 'bad', name: 'bad.pdf', type: 'pdf', size: 8, path }];
    assert.equal((await f.request('/api/admin/content', 'PUT', { content: draft, revision: first.revision })).status, 400);
  }
  const draft = structuredClone(first.content); draft.talks[0].custom = { imported: true }; draft.talks[0].date = '2024-02-29';
  const response = await f.request('/api/admin/content', 'PUT', { content: draft, revision: first.revision });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).content.talks[0].custom, { imported: true });
});

test('PowerPoint ZIP signatures must include presentation structure and reject renamed arbitrary ZIPs', () => {
  function zip(names) {
    const records = [], directories = []; let offset = 0;
    for (const name of names) {
      const encoded = Buffer.from(name), local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(encoded.length, 26);
      records.push(local, encoded); const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(encoded.length, 28); directory.writeUInt32LE(offset, 42);
      directories.push(directory, encoded); offset += local.length + encoded.length;
    }
    const central = Buffer.concat(directories), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...records, central, end]);
  }
  assert.equal(validFileSignature(zip(['[Content_Types].xml', 'ppt/presentation.xml']), 'pptx'), true);
  assert.equal(validFileSignature(zip(['[Content_Types].xml', 'word/document.xml']), 'pptx'), false);
  assert.equal(validFileSignature(zip(['../evil', '[Content_Types].xml', 'ppt/presentation.xml']), 'pptx'), false);
  assert.equal(validFileSignature(Buffer.from('PK\x03\x04fake zip'), 'pptx'), false);
});
