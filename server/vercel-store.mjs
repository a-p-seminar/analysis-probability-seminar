import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from './errors.mjs';

const unavailable = () => new ApiError(503, 'Private storage is temporarily unavailable.');
// Redis executes this compare-and-set atomically across function instances.
const putScript = `
local previous = redis.call('GET', KEYS[1])
if ARGV[1] == 'new' and previous then return 0 end
if ARGV[1] == 'match' then
  if not previous or cjson.decode(previous).etag ~= ARGV[2] then return 0 end
end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
return 1`;

export function createVercelStore({ env, fetchImpl = fetch }) {
  const namespace = 'seminar:' + createHash('sha256').update(env.VERCEL_PROJECT_ID || '').digest('hex') + ':';
  const endpoint = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  async function command(args) {
    try {
      if (!env.VERCEL_PROJECT_ID || !token || !/^https:\/\/[a-z0-9.-]+\.upstash\.io\/?$/i.test(endpoint || '')) throw unavailable();
      const response = await fetchImpl(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args), cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw unavailable();
      const reply = await response.json();
      if (reply.error || !Object.hasOwn(reply, 'result')) throw unavailable();
      return reply.result;
    } catch { throw unavailable(); }
  }
  return {
    mode: 'vercel',
    async get(key) {
      const raw = await command(['GET', namespace + key]);
      if (raw === null) return null;
      try { const value = JSON.parse(raw); if (typeof value.etag !== 'string' || typeof value.data !== 'string') throw unavailable(); return { data: Buffer.from(value.data, 'base64'), etag: value.etag }; }
      catch { throw unavailable(); }
    },
    async put(key, bytes, condition = {}) {
      const etag = randomUUID(), value = JSON.stringify({ etag, data: Buffer.from(bytes).toString('base64') });
      const modified = await command(['EVAL', putScript, '1', namespace + key, condition.onlyIfNew ? 'new' : condition.onlyIfMatch ? 'match' : 'any', condition.onlyIfMatch || '', value, '86400']);
      if (modified !== 0 && modified !== 1) throw unavailable();
      return { modified: modified === 1, ...(modified === 1 ? { etag } : {}) };
    },
    async delete(key) { await command(['DEL', namespace + key]); },
    async list(prefix = '') {
      const keys = new Set(), match = (namespace + prefix).replace(/[\\*?\[\]]/g, '\\$&') + '*';
      let cursor = '0';
      do {
        const result = await command(['SCAN', cursor, 'MATCH', match, 'COUNT', '100']);
        if (!Array.isArray(result) || result.length !== 2 || !Array.isArray(result[1])) throw unavailable();
        cursor = String(result[0]);
        for (const key of result[1]) if (typeof key === 'string' && key.startsWith(namespace + prefix)) keys.add(key.slice(namespace.length));
      } while (cursor !== '0');
      return [...keys];
    },
  };
}
