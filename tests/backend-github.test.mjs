import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGithubRepository } from '../server/github-repository.mjs';

const initial = { schemaVersion: 1, site: { title: 'Seminar' }, talks: [] };
const gitSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function githubService() {
  const blobs = new Map(), trees = new Map(), commits = new Map(), requests = [];
  const addBlob = bytes => { const sha = gitSha(bytes); blobs.set(sha, bytes); return sha; };
  let sequence = 0, head = 'initial', beforePatch;
  const initialBlob = addBlob(Buffer.from(JSON.stringify(initial)));
  trees.set('initialTree', { 'content/seminars.json': initialBlob }); commits.set(head, { tree: { sha: 'initialTree' }, parents: [] });
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, options = {}) => {
    url = new URL(url); const path = decodeURIComponent(url.pathname.replace('/repos/example/seminar', '')), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path, method, body, headers: options.headers });
    if (path === '/git/ref/heads/main') return reply({ object: { sha: head } });
    if (path.startsWith('/git/commits/') && method === 'GET') return reply(commits.get(path.split('/').at(-1)));
    if (path.startsWith('/git/trees/') && method === 'GET') return reply({ truncated: false, tree: Object.entries(trees.get(path.split('/').at(-1))).map(([path, sha]) => ({ path, sha, type: 'blob', size: blobs.get(sha).length })) });
    if (path.startsWith('/contents/') && method === 'GET') {
      const ref = url.searchParams.get('ref'), commit = commits.get(ref === 'main' ? head : ref), tree = trees.get(commit?.tree.sha), sha = tree?.[path.slice(10)];
      if (!sha) return reply({ message: 'Not Found' }, 404); const bytes = blobs.get(sha);
      return reply({ type: 'file', sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') });
    }
    if (path === '/git/blobs' && method === 'POST') return reply({ sha: addBlob(Buffer.from(body.content, body.encoding)) }, 201);
    if (path === '/git/trees' && method === 'POST') {
      const sha = `tree-${++sequence}`, tree = { ...trees.get(body.base_tree) }; for (const file of body.tree) tree[file.path] = file.sha; trees.set(sha, tree); return reply({ sha }, 201);
    }
    if (path === '/git/commits' && method === 'POST') { const sha = `commit-${++sequence}`; commits.set(sha, { tree: { sha: body.tree }, parents: body.parents }); return reply({ sha }, 201); }
    if (path === '/git/refs/heads/main' && method === 'PATCH') {
      if (beforePatch) { const callback = beforePatch; beforePatch = undefined; callback(); }
      if (body.force !== false || commits.get(body.sha).parents[0] !== head) return reply({ message: 'Not fast forward' }, 422);
      head = body.sha; return reply({ object: { sha: head } });
    }
    throw new Error(`Unexpected GitHub HTTP boundary ${method} ${path}`);
  };
  const externalChange = content => { const sha = `external-${++sequence}`, tree = { ...trees.get(commits.get(head).tree.sha) }; if (content) tree['content/seminars.json'] = addBlob(Buffer.from(JSON.stringify(content))); trees.set(`${sha}-tree`, tree); commits.set(sha, { tree: { sha: `${sha}-tree` }, parents: [head] }); head = sha; };
  const repository = createGithubRepository({ env: { GITHUB_OWNER: 'example', GITHUB_REPO: 'seminar', GITHUB_BRANCH: 'main', GITHUB_TOKEN: 'test-token-never-returned' }, fetchImpl });
  return { repository, requests, externalChange, setBeforePatch: callback => beforePatch = callback };
}

test('GitHub saves create blobs, trees and commits before non-forced ref advance', async () => {
  const f = githubService(), first = await f.repository.read(); assert.deepEqual(first.content, initial);
  const changed = { ...initial, site: { title: 'Changed' } };
  const saved = await f.repository.save(changed, first.revision); assert.notEqual(saved.revision, first.revision);
  assert.deepEqual((await f.repository.read()).content, changed);
  assert.equal(f.requests.filter(r => r.path === '/git/refs/heads/main')[0].body.force, false);
  assert.match(f.requests.find(r => r.path === '/git/commits' && r.method === 'POST').body.message, /\[skip netlify\]/);
  await assert.rejects(f.repository.save(initial, first.revision), error => error.status === 409);
});

test('GitHub catches a concurrent content commit rather than overwriting it', async () => {
  const f = githubService(), first = await f.repository.read(), competing = { ...initial, site: { title: 'Other admin' } };
  f.setBeforePatch(() => f.externalChange(competing));
  await assert.rejects(f.repository.save({ ...initial, site: { title: 'Mine' } }, first.revision), error => error.status === 409);
  assert.deepEqual((await f.repository.read()).content, competing);
});

test('attachment commits are idempotent, portable, skip builds and do not stale content revisions', async () => {
  const f = githubService(), first = await f.repository.read(), bytes = Buffer.from('%PDF-1.7\n');
  f.setBeforePatch(() => f.externalChange());
  await f.repository.upload('attachments/2026/test.pdf', bytes);
  const commitCount = f.requests.filter(r => r.path === '/git/commits' && r.method === 'POST').length;
  await f.repository.upload('attachments/2026/test.pdf', bytes);
  assert.equal(f.requests.filter(r => r.path === '/git/commits' && r.method === 'POST').length, commitCount);
  assert.equal((await f.repository.stat('attachments/2026/test.pdf')).size, bytes.length);
  assert.equal((await f.repository.read()).revision, first.revision);
  assert.equal(f.repository.publicUrl('attachments/2026/a b.pdf'), 'https://raw.githubusercontent.com/example/seminar/main/attachments/2026/a%20b.pdf');
  await assert.rejects(f.repository.upload('attachments/2026/test.pdf', Buffer.from('different')), error => error.status === 409);
  await f.repository.save({ ...initial, site: { title: 'Saved after upload' } }, first.revision);
  for (const request of f.requests.filter(r => r.path === '/git/commits' && r.method === 'POST')) assert.match(request.body.message, /\[skip netlify\]/);
});

test('GitHub errors do not expose upstream tokens or response bodies', async () => {
  const repository = createGithubRepository({ env: { GITHUB_OWNER: 'example', GITHUB_REPO: 'seminar', GITHUB_TOKEN: 'private-value' }, fetchImpl: async () => new Response('private-value', { status: 401 }) });
  await assert.rejects(repository.read(), error => error.status === 503 && !error.message.includes('private-value'));
});

test('attachment checks share a single pinned Git tree rather than one Contents request per file', async () => {
  const f = githubService();
  await f.repository.upload('attachments/2026/one.pdf', Buffer.from('%PDF-1.7\none'));
  await f.repository.upload('attachments/2026/two.pdf', Buffer.from('%PDF-1.7\ntwo'));
  const before = f.requests.length;
  assert.ok(await f.repository.stat('attachments/2026/one.pdf'));
  assert.ok(await f.repository.stat('attachments/2026/two.pdf'));
  const checks = f.requests.slice(before);
  assert.equal(checks.filter(r => r.path.startsWith('/contents/')).length, 0);
  assert.equal(checks.filter(r => r.path.startsWith('/git/trees/')).length, 1);
});
