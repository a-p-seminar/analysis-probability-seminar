import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, readdir, open, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ApiError } from './errors.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
export async function withFileLock(root, key, operation) {
  const lockRoot = join(root, '.locks'); await mkdir(lockRoot, { recursive: true });
  const lockPath = join(lockRoot, digest(key)); const deadline = Date.now() + 5000;
  let handle;
  while (!handle) {
    try { handle = await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - (await stat(lockPath)).mtimeMs > 60_000) await unlink(lockPath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (Date.now() > deadline) throw new ApiError(503, 'Storage is busy. Please retry.');
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }
  try { return await operation(); } finally { await handle.close(); await unlink(lockPath).catch(() => {}); }
}

export function createLocalStore(root) {
  root = resolve(root);
  const pathFor = key => join(root, `${digest(key)}.json`);
  const get = async key => {
    try { const record = JSON.parse(await readFile(pathFor(key), 'utf8')); return { data: Buffer.from(record.data, 'base64'), etag: record.etag }; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  return {
    mode: 'local', get,
    async put(key, data, condition = {}) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      return withFileLock(root, key, async () => {
        const previous = await get(key);
        if ((condition.onlyIfNew && previous) || (condition.onlyIfMatch && previous?.etag !== condition.onlyIfMatch)) return { modified: false };
        const bytes = Buffer.from(data), etag = randomUUID();
        const temp = `${pathFor(key)}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify({ key, etag, data: bytes.toString('base64') }), { mode: 0o600 });
        await rename(temp, pathFor(key)); return { modified: true, etag };
      });
    },
    async delete(key) { return withFileLock(root, key, () => unlink(pathFor(key)).catch(error => { if (error.code !== 'ENOENT') throw error; })); },
    async list(prefix = '') {
      let entries; try { entries = await readdir(root); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      const keys = [];
      for (const name of entries.filter(name => name.endsWith('.json'))) {
        try { const { key } = JSON.parse(await readFile(join(root, name), 'utf8')); if (key.startsWith(prefix)) keys.push(key); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return keys;
    },
  };
}
