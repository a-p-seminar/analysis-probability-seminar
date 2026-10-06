import { createHash } from 'node:crypto';
import { ApiError, conflict } from './errors.mjs';
import { validAttachmentPath } from './content.mjs';
import { githubBlobBody } from './github-blob-body.mjs';

const pathEncode = path => path.split('/').map(encodeURIComponent).join('/');
const blobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export function createGithubRepository({ env = process.env, fetchImpl = fetch } = {}) {
  const owner = env.GITHUB_OWNER, repo = env.GITHUB_REPO, branch = env.GITHUB_BRANCH || 'main', token = env.GITHUB_TOKEN;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner || '') || !/^[A-Za-z0-9_.-]+$/.test(repo || '') || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes('..') || !token) throw new ApiError(503, 'GitHub storage is not configured.');
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  let statSnapshot;
  const snapshots = new Map();
  async function api(path, method = 'GET', body, { missing = false, raw = false } = {}) {
    let response;
    try {
      const streamed = body instanceof ReadableStream;
      response = await fetchImpl(`${base}${path}`, { method, headers: { accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'Seminar-Archive', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: streamed ? body : JSON.stringify(body), ...(streamed ? { duplex: 'half' } : {}) }), signal: AbortSignal.timeout(streamed ? 90000 : 25000) });
    } catch { throw new ApiError(503, 'GitHub storage is temporarily unavailable.'); }
    if (response.status === 404 && missing) return null;
    if (method === 'PATCH' && [409, 422].includes(response.status)) throw conflict();
    if (!response.ok) throw new ApiError(503, 'GitHub storage is unavailable. Check repository access and retry.');
    try { return raw ? await response.text() : await response.json(); }
    catch { throw new ApiError(503, 'GitHub returned an invalid response.'); }
  }
  const head = async () => (await api(`/git/ref/heads/${pathEncode(branch)}`)).object.sha;
  const contents = (path, revision, missing = false) => api(`/contents/${pathEncode(path)}?ref=${encodeURIComponent(revision)}`, 'GET', undefined, { missing });
  async function statAt(path, revision) {
    if (!snapshots.has(revision)) {
      const parent = await api(`/git/commits/${revision}`);
      const tree = await api(`/git/trees/${parent.tree.sha}?recursive=1`);
      if (snapshots.size > 3) snapshots.clear();
      snapshots.set(revision, { files: new Map(tree.tree.filter(entry => entry.type === 'blob').map(entry => [entry.path, { size: entry.size, sha: entry.sha }])), truncated: tree.truncated });
    }
    const snapshot = snapshots.get(revision), file = snapshot.files.get(path);
    if (file || !snapshot.truncated) return file || null;
    const fallback = await contents(path, revision, true); return fallback?.type === 'file' ? { size: fallback.size, sha: fallback.sha } : null;
  }
  async function documentAt(revision) {
    const file = await contents('content/seminars.json', revision);
    if (file.type !== 'file') throw new ApiError(503, 'Seminar data is unavailable.');
    const text = file.encoding === 'base64' ? Buffer.from(file.content, 'base64').toString('utf8') : await api(`/contents/content/seminars.json?ref=${encodeURIComponent(revision)}`, 'GET', undefined, { raw: true });
    try { return { content: JSON.parse(text), revision: file.sha }; } catch { throw new ApiError(503, 'Seminar data is invalid.'); }
  }
  async function commit(path, bytes, baseCommit, message) {
    const parent = await api(`/git/commits/${baseCommit}`);
    const blob = await api('/git/blobs', 'POST', env.VERCEL === '1' ? githubBlobBody(bytes) : { encoding: 'base64', content: bytes.toString('base64') });
    const tree = await api('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }] });
    const next = await api('/git/commits', 'POST', { message: `${message} [skip netlify] [skip ci]`, tree: tree.sha, parents: [baseCommit] });
    await api(`/git/refs/heads/${pathEncode(branch)}`, 'PATCH', { sha: next.sha, force: false });
    return blob.sha;
  }
  return {
    mode: 'github',
    async read() { statSnapshot = await head(); return documentAt(statSnapshot); },
    publicUrl(path) { return `https://raw.githubusercontent.com/${owner}/${repo}/${pathEncode(branch)}/${pathEncode(path)}`; },
    async stat(path) { if (!validAttachmentPath(path)) throw new ApiError(400, 'Invalid attachment path.'); statSnapshot ??= await head(); return statAt(path, statSnapshot); },
    async save(content, revision) {
      const bytes = Buffer.from(`${JSON.stringify(content, null, 2)}\n`);
      for (let attempt = 0; attempt < 3; attempt++) {
        const currentHead = await head(), current = await documentAt(currentHead);
        if (current.revision !== revision) throw conflict();
        for (const talk of content.talks) for (const attachment of talk.attachments || []) if (attachment.path) {
          const file = await statAt(attachment.path, currentHead);
          if (!file || file.size !== attachment.size) throw new ApiError(400, 'An attachment is missing or its size does not match.');
        }
        try { const updated = await commit('content/seminars.json', bytes, currentHead, 'Update seminar content'); statSnapshot = undefined; return { content, revision: updated }; }
        catch (error) { if (error.status !== 409 || attempt === 2) throw error; }
      }
    },
    async upload(path, bytes) {
      if (!validAttachmentPath(path)) throw new ApiError(400, 'Invalid attachment path.');
      for (let attempt = 0; attempt < 3; attempt++) {
        const currentHead = await head(), existing = await contents(path, currentHead, true);
        if (existing) { if (existing.type === 'file' && existing.sha === blobSha(bytes) && existing.size === bytes.length) return; throw new ApiError(409, 'Attachment already exists with different content.'); }
        try { await commit(path, bytes, currentHead, 'Add seminar attachment'); statSnapshot = undefined; return; }
        catch (error) { if (error.status !== 409 || attempt === 2) throw error; }
      }
    },
  };
}
