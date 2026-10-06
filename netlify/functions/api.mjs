import { createApi } from '../../server/api.mjs';
import { createGithubRepository } from '../../server/github-repository.mjs';
import { createNetlifyStore } from '../../server/netlify-store.mjs';

export default async function handler(request, context) {
  try {
    const env = { ...process.env, NODE_ENV: 'production' };
    const api = createApi({ repository: createGithubRepository({ env }), store: createNetlifyStore(), env });
    return await api(request, { ip: context.ip });
  } catch {
    return new Response(JSON.stringify({ error: 'The service is not configured or is temporarily unavailable.' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
}
