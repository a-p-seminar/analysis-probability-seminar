import { createApi } from '../server/api.mjs';
import { createGithubRepository } from '../server/github-repository.mjs';
import { createCloudflareStore } from '../server/cloudflare-store.mjs';
import { createEnvironmentPassword } from '../server/environment-password.mjs';
import { createCloudflarePasswordSource } from '../server/cloudflare-password-source.mjs';

const unavailable = () => Response.json({ error: 'The service is not configured or is temporarily unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
export class SeminarState {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
  }
  async fetch(request) {
    // A single large assembly or scrypt derivation runs at a time, keeping the
    // singleton's working memory below the Worker isolate memory limit.
    const result = (this.pending ?? Promise.resolve()).then(() => this.handle(request));
    this.pending = result.then(() => {}, () => {});
    return result;
  }
  async handle(request) {
    try {
      this.api ??= (() => {
        const env = { ...this.env, NODE_ENV: 'production', CLOUDFLARE: 'true' };
        const store = createCloudflareStore(this.ctx.storage);
        const passwords = createEnvironmentPassword({ source: createCloudflarePasswordSource({ env }), store, secret: env.SESSION_SECRET });
        return createApi({ repository: createGithubRepository({ env }), store, env, passwords, uploadOptions: { chunkSize: 512 * 1024 } });
      })();
      return await this.api(request, { ip: request.headers.get('cf-connecting-ip') });
    } catch { return unavailable(); }
  }
}

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url); let response;
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try { response = await env.SEMINAR_STATE.get(env.SEMINAR_STATE.idFromName('seminar-private-v1')).fetch(request); }
      catch { response = unavailable(); }
    } else {
      if (url.pathname === '/') { url.pathname = '/index.html'; request = new Request(url, request); }
      if (url.pathname === '/admin' || url.pathname === '/viewer') { url.pathname += '.html'; request = new Request(url, request); }
      response = await env.ASSETS.fetch(request);
    }
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
    if (url.pathname.startsWith('/assets/')) headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
