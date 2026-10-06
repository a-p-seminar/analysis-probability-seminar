import { randomUUID } from 'node:crypto';

// SQLite Durable Object storage is private to the Worker and transactional.
export function createCloudflareStore(storage) {
  return {
    mode: 'cloudflare',
    async get(key) { const entry = await storage.get(key); return entry ? { data: Buffer.from(entry.data), etag: entry.etag } : null; },
    async put(key, bytes, condition = {}) {
      return storage.transaction(async transaction => {
        const previous = await transaction.get(key);
        if ((condition.onlyIfNew && previous) || (condition.onlyIfMatch && previous?.etag !== condition.onlyIfMatch)) return { modified: false };
        const etag = randomUUID(), data = Uint8Array.from(bytes);
        await transaction.put(key, { data, etag });
        return { modified: true, etag };
      });
    },
    delete: key => storage.delete(key),
    async list(prefix = '') {
      const keys = []; let startAfter;
      do {
        const page = await storage.list({ prefix, limit: 16, noCache: true, ...(startAfter ? { startAfter } : {}) });
        keys.push(...page.keys());
        if (page.size < 16) break;
        startAfter = [...page.keys()].at(-1);
      } while (true);
      return keys;
    },
  };
}
