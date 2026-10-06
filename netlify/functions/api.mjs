import { createApi } from '../../server/api.mjs';
import { createGithubRepository } from '../../server/github-repository.mjs';
import { createNetlifyStore } from '../../server/netlify-store.mjs';
import { createEnvironmentPassword } from '../../server/environment-password.mjs';
import { createNetlifyPasswordSource } from '../../server/netlify-password-source.mjs';

export default async function handler(request, context) {
  try {
    const env = { ...process.env, NODE_ENV: 'production' };
    const store = createNetlifyStore();
    const passwords = createEnvironmentPassword({ source: createNetlifyPasswordSource({ env }), store, secret: env.SESSION_SECRET });
    const api = createApi({ repository: createGithubRepository({ env }), store, env, passwords });
    return await api(request, { ip: context.ip });
  } catch {
    return new Response(JSON.stringify({ error: 'The service is not configured or is temporarily unavailable.' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
}
