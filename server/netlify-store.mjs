import { getStore } from '@netlify/blobs';

// This site-wide store is accessible only from server-side Netlify credentials.
// Strong consistency + conditional writes coordinate separate function instances.
export function createNetlifyStore() {
  const store = getStore({ name: 'seminar-private-v1', consistency: 'strong' });
  return {
    mode: 'netlify',
    async get(key) { const entry = await store.getWithMetadata(key, { type: 'arrayBuffer', consistency: 'strong' }); return entry ? { data: Buffer.from(entry.data), etag: entry.etag } : null; },
    put(key, bytes, condition = {}) { const buffer = Buffer.from(bytes); return store.set(key, buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), condition); },
    delete: key => store.delete(key),
    async list(prefix = '') { return (await store.list({ prefix })).blobs.map(blob => blob.key); },
  };
}
