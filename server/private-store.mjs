import { ApiError } from './errors.mjs';

export async function getJson(store, key) { const found = await store.get(key); return found ? { value: JSON.parse(found.data.toString()), etag: found.etag } : null; }
export function putJson(store, key, value, condition) { return store.put(key, Buffer.from(JSON.stringify(value)), condition); }
export async function updateJson(store, key, update) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await getJson(store, key), value = update(current?.value);
    const result = await putJson(store, key, value, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (result.modified) return value;
  }
  throw new ApiError(503, 'Storage is busy. Please retry.');
}
export async function readBytes(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw new ApiError(413, 'The request is too large.');
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader(), parts = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > limit) { await reader.cancel(); throw new ApiError(413, 'The request is too large.'); }
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts, length);
  } finally { reader.releaseLock(); }
}
export async function readJson(request, limit = 5 * 1024 * 1024) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new ApiError(415, 'Expected application/json.');
  try { return JSON.parse((await readBytes(request, limit)).toString()); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'Invalid JSON request.'); }
}
