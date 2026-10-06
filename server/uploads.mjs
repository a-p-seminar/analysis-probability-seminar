import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.mjs';
import { getJson, putJson, readBytes } from './private-store.mjs';
import { reportAttachmentName } from '../shared/attachment-name.mjs';

export const CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_SIZE = 50 * 1024 * 1024;
const TTL = 60 * 60 * 1000;
const metaKey = id => `uploads/${id}/meta`;
const partKey = (id, index) => `uploads/${id}/parts/${index}`;
function reportName(talk, name, id) {
  try { return reportAttachmentName(talk, name, id); }
  catch (error) { throw new ApiError(400, error.message); }
}
export function validFileSignature(bytes, type) {
  if (type === 'pdf') return bytes.length >= 8 && /^%PDF-\d\.\d/.test(bytes.subarray(0, 8).toString('ascii'));
  if (type === 'ppt') return bytes.length >= 512 && bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')) && bytes.readUInt16LE(28) === 0xfffe && [9, 12].includes(bytes.readUInt16LE(30));
  if (type !== 'pptx' || bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) return false;
  // Inspect the ZIP central directory, rather than accepting any renamed ZIP file.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  if (end < 0 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) return false;
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12); let cursor = bytes.readUInt32LE(end + 16);
  if (!count || count > 20000 || cursor + size !== end) return false;
  const names = new Set();
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) return false;
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), localOffset = bytes.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameLength + extra + comment > end || localOffset + 30 > end || bytes.readUInt32LE(localOffset) !== 0x04034b50) return false;
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) return false;
    names.add(name); cursor += 46 + nameLength + extra + comment;
  }
  return cursor === end && names.has('[Content_Types].xml') && names.has('ppt/presentation.xml');
}

export function createUploads(repository, store, { chunkSize = CHUNK_SIZE } = {}) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 65536 || chunkSize > CHUNK_SIZE) throw new Error('Invalid upload chunk size.');
  const removeParts = async id => { for (const key of await store.list(`uploads/${id}/parts/`)) await store.delete(key); };
  async function owned(id, session) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(404, 'Upload not found.');
    const record = await getJson(store, metaKey(id));
    if (!record || record.value.owner !== session.id || record.value.expires <= Date.now() || record.value.state === 'cancelled') throw new ApiError(404, 'Upload not found or expired.');
    return record;
  }
  return {
    async cleanup() {
      const keys = await store.list('uploads/'), ids = new Set(keys.map(key => key.split('/')[1]));
      for (const id of ids) {
        const metadata = await getJson(store, metaKey(id));
        if (!metadata || metadata.value.expires <= Date.now() || metadata.value.state === 'cancelled') {
          for (const key of keys.filter(key => key.startsWith(`uploads/${id}/`))) await store.delete(key);
        }
      }
      for (const prefix of ['sessions/', 'rates/']) for (const key of await store.list(prefix)) { const record = await getJson(store, key); if (record && record.value.exp <= Date.now()) await store.delete(key); }
    },
    async start(input, session) {
      const id = randomUUID(), name = reportName(input?.talk, input?.name, id), size = input?.size;
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SIZE) throw new ApiError(400, 'File size must be between 1 byte and 50 MiB.');
      const type = name.split('.').at(-1).toLowerCase();
      await putJson(store, metaKey(id), { id, name, type, size, owner: session.id, expires: Math.min(Date.now() + TTL, session.exp), state: 'pending', path: `attachments/${input.talk.date.slice(0, 4)}/${name}` }, { onlyIfNew: true });
      return { id, name, chunkSize };
    },
    async chunk(id, rawIndex, request, session) {
      const { value } = await owned(id, session);
      if (value.state !== 'pending') throw new ApiError(409, 'Upload is already completing or completed.');
      if (!/^\d{1,3}$/.test(rawIndex)) throw new ApiError(400, 'Invalid chunk index.');
      const index = Number(rawIndex), count = Math.ceil(value.size / chunkSize);
      if (index >= count) throw new ApiError(400, 'Invalid chunk index.');
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/octet-stream')) throw new ApiError(415, 'Expected application/octet-stream.');
      const expected = Math.min(chunkSize, value.size - index * chunkSize), bytes = await readBytes(request, expected);
      if (bytes.length !== expected) throw new ApiError(400, 'Chunk byte count does not match.');
      const result = await store.put(partKey(id, index), bytes, { onlyIfNew: true });
      if (!result.modified && !(await store.get(partKey(id, index)))?.data.equals(bytes)) throw new ApiError(409, 'Chunk already exists with different bytes.');
      return { ok: true };
    },
    async complete(id, session) {
      const record = await owned(id, session), metadata = record.value;
      if (metadata.state === 'complete') { await removeParts(id); return { attachment: metadata.attachment }; }
      if (metadata.state === 'committing' && metadata.lockExpires > Date.now()) throw new ApiError(409, 'Upload is completing. Retry shortly.');
      const claim = await putJson(store, metaKey(id), { ...metadata, state: 'committing', lockExpires: Date.now() + 90_000 }, { onlyIfMatch: record.etag });
      if (!claim.modified) throw new ApiError(409, 'Upload changed. Retry shortly.');
      try {
        const bytes = Buffer.allocUnsafe(metadata.size);
        for (let i = 0; i < Math.ceil(metadata.size / chunkSize); i++) {
          const part = await store.get(partKey(id, i)), expected = Math.min(chunkSize, metadata.size - i * chunkSize);
          if (!part || part.data.length !== expected) throw new ApiError(409, 'Some upload chunks are missing. Retry the upload.');
          part.data.copy(bytes, i * chunkSize);
        }
        if (!validFileSignature(bytes, metadata.type)) throw new ApiError(400, 'File contents do not match the PDF/PPT/PPTX extension.');
        await repository.upload(metadata.path, bytes);
        const attachment = { id, name: metadata.name, type: metadata.type, size: metadata.size, path: metadata.path };
        const committed = await putJson(store, metaKey(id), { ...metadata, state: 'complete', attachment }, { onlyIfMatch: claim.etag });
        if (!committed.modified) throw new ApiError(409, 'Upload completion changed. Retry shortly.');
        await removeParts(id); return { attachment };
      } catch (error) { await putJson(store, metaKey(id), { ...metadata, state: 'pending' }, { onlyIfMatch: claim.etag }); throw error; }
    },
    async cancel(id, session) {
      const record = await owned(id, session);
      if (record.value.state === 'committing') throw new ApiError(409, 'Upload is completing. Retry shortly.');
      if (!(await putJson(store, metaKey(id), { ...record.value, state: 'cancelled' }, { onlyIfMatch: record.etag })).modified) throw new ApiError(409, 'Upload changed. Retry shortly.');
      await removeParts(id); await store.delete(metaKey(id)); return { ok: true };
    },
  };
}
