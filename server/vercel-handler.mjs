import { createApi } from './api.mjs';
import { createGithubRepository } from './github-repository.mjs';
import { createVercelStore } from './vercel-store.mjs';
import { createEnvironmentPassword } from './environment-password.mjs';
import { createVercelPasswordSource } from './vercel-password-source.mjs';
import { validAttachmentPath } from './content.mjs';

export function createVercelHandler({ env = process.env, repository, store, passwords } = {}) {
  let api;
  return async request => {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/healthz' || (url.pathname === '/api/seminar' && url.searchParams.get('health') === '1')) return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
      if (!api) {
        repository ||= createGithubRepository({ env });
        store ||= createVercelStore({ env });
        passwords ||= createEnvironmentPassword({ source: createVercelPasswordSource({ env }), store, secret: env.SESSION_SECRET });
        api = createApi({ repository, store, passwords, env: { ...env, NODE_ENV: 'production' }, uploadOptions: { chunkSize: 512 * 1024 } });
      }
      if (url.pathname === '/api/seminar') {
        const attachment = url.searchParams.get('attachment');
        if (attachment !== null) {
          if (!['GET', 'HEAD'].includes(request.method) || !validAttachmentPath(attachment) || !/\.(pdf|ppt|pptx)$/i.test(attachment)) return new Response('Not found', { status: 404 });
          // Large PDFs bypass the serverless response size limit.
          return Response.redirect(repository.publicUrl(attachment), 307);
        }
        const path = url.searchParams.get('path') || '';
        if (!/^[A-Za-z0-9/-]+$/.test(path) || path.includes('//') || path.split('/').includes('..')) return new Response('Not found', { status: 404 });
        url.pathname = '/api/' + path;
        url.search = '';
        request = new Request(url, request);
      }
      return api(request, { ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() });
    } catch { return Response.json({ error: 'The service is temporarily unavailable. Check hosting configuration.' }, { status: 503, headers: { 'cache-control': 'no-store' } }); }
  };
}
