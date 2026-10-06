import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from './errors.mjs';
import { verifyPassword, signSession, verifySession, sessionCookie } from './auth.mjs';
import { createAdminPassword } from './admin-password.mjs';
import { validateContent, publicContent } from './content.mjs';
import { createUploads } from './uploads.mjs';
import { getJson, putJson, updateJson, readJson } from './private-store.mjs';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
export function createApi({ repository, store, env = process.env, passwords = createAdminPassword(store, env.ADMIN_PASSWORD_HASH), uploadOptions }) {
  const production = env.NODE_ENV === 'production' || env.NETLIFY === 'true';
  const hostedStore = ['netlify', 'cloudflare'].includes(store.mode) || (env.RENDER === 'true' && store.mode === 'render');
  const configured = typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32 && (!production || (repository.mode === 'github' && hostedStore));
  const uploads = createUploads(repository, store, uploadOptions); let lastCleanup = 0;
  const sessionFor = async request => {
    const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('seminar_session='))?.slice(16);
    const session = verifySession(cookie, env.SESSION_SECRET);
    if (!session) return null;
    const record = await getJson(store, `sessions/${session.id}`);
    if (record?.value.exp !== session.exp) return null;
    const credential = await passwords.read();
    // Existing signed sessions remain usable until the first password change.
    const version = session.credentialVersion ?? (!credential.persisted ? credential.version : null);
    return version === credential.version ? { ...session, credentialVersion: version } : null;
  };
  async function rateLimit(ip, action = 'login') {
    for (const scope of [`ip:${ip || 'unknown'}`, 'global']) {
      const key = `rates/${createHash('sha256').update(`${action}:${scope}`).digest('hex')}`;
      const value = await updateJson(store, key, previous => previous?.exp > Date.now() ? { ...previous, count: previous.count + 1 } : { exp: Date.now() + 15 * 60_000, count: 1 });
      if (value.count > (scope === 'global' ? 50 : 8)) throw new ApiError(429, action === 'password-change' ? '尝试次数过多，请 15 分钟后重试。' : 'Too many login attempts. Try again in 15 minutes.');
    }
  }
  return async function api(request, context = {}) {
    try {
      const url = new URL(request.url), path = url.pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '/api'), method = request.method;
      if (method === 'GET' && path === '/api/content') { const result = await repository.read(); return json({ content: publicContent(result.content, repository, result.revision), revision: result.revision }, 200, { 'cache-control': 'public, max-age=15, must-revalidate' }); }
      if (!configured) throw new ApiError(503, 'Administrator access is not configured.');
      if (!['GET', 'HEAD'].includes(method)) {
        const origin = request.headers.get('origin');
        if (origin !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'Requests must come from this website.');
      }
      if (method === 'POST' && path === '/api/login') {
        await rateLimit(context.ip); const data = await readJson(request);
        const credential = await passwords.read();
        if (!await verifyPassword(data?.password, credential.hash)) throw new ApiError(401, 'Invalid password.');
        if ((await passwords.read()).version !== credential.version) throw new ApiError(409, '密码已更新，请使用新密码重新登录。');
        const session = { id: randomUUID(), exp: Date.now() + 8 * 60 * 60_000, credentialVersion: credential.version };
        await putJson(store, `sessions/${session.id}`, session, { onlyIfNew: true });
        return json({ authenticated: true }, 200, { 'set-cookie': sessionCookie(signSession(session, env.SESSION_SECRET), production) });
      }
      const session = await sessionFor(request);
      if (method === 'GET' && path === '/api/session') return json({ authenticated: !!session, mode: repository.mode });
      if (!session) throw new ApiError(401, 'Sign in to administer the seminar.');
      if (method === 'POST' && path === '/api/logout') { await store.delete(`sessions/${session.id}`); return json({ authenticated: false }, 200, { 'set-cookie': sessionCookie('', production, 0) }); }
      if (method === 'POST' && path === '/api/admin/password') {
        await rateLimit(context.ip, 'password-change');
        await passwords.change(await readJson(request), session.credentialVersion);
        return json({ authenticated: false, passwordChanged: true }, 200, { 'set-cookie': sessionCookie('', production, 0) });
      }
      if (method === 'GET' && path === '/api/admin/content') return json(await repository.read());
      if (method === 'PUT' && path === '/api/admin/content') {
        const data = await readJson(request);
        if (typeof data?.revision !== 'string' || !data.revision) throw new ApiError(400, 'A content revision is required.');
        return json(await repository.save(await validateContent(data.content, repository), data.revision));
      }
      if (method === 'POST' && path === '/api/admin/uploads') {
        if (Date.now() - lastCleanup > 60_000) { await uploads.cleanup(); lastCleanup = Date.now(); }
        return json(await uploads.start(await readJson(request, 65536), session));
      }
      const upload = path.match(/^\/api\/admin\/uploads\/([a-f0-9-]+)(?:\/([^/]+))?$/);
      if (upload) {
        if (method === 'DELETE' && !upload[2]) return json(await uploads.cancel(upload[1], session));
        if (method === 'POST' && upload[2] === 'complete') return json(await uploads.complete(upload[1], session));
        if (method === 'PUT' && upload[2]) return json(await uploads.chunk(upload[1], upload[2], request, session));
      }
      throw new ApiError(404, 'Endpoint not found.');
    } catch (error) { return json({ error: error instanceof ApiError ? error.message : 'The service could not complete this request. Please retry.' }, error instanceof ApiError ? error.status : 503); }
  };
}
