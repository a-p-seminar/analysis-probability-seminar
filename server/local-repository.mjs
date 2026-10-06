import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { withFileLock } from './local-store.mjs';
import { ApiError, conflict } from './errors.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function createLocalRepository(root) {
  root = resolve(root); const documentPath = join(root, 'content', 'seminars.json');
  const safePath = path => { const result = resolve(root, path); if (!result.startsWith(`${root}${sep}`) || !path.startsWith('attachments/') || path.includes('\\')) throw new ApiError(400, 'Invalid attachment path.'); return result; };
  const read = async () => { const bytes = await readFile(documentPath); return { content: JSON.parse(bytes.toString()), revision: digest(bytes) }; };
  return {
    mode: 'local', read,
    publicUrl: path => `/${path.split('/').map(encodeURIComponent).join('/')}`,
    async save(content, revision) {
      return withFileLock(join(root, '.local-data'), 'repository', async () => {
        if ((await read()).revision !== revision) throw conflict();
        const bytes = Buffer.from(`${JSON.stringify(content, null, 2)}\n`), temp = `${documentPath}.${randomUUID()}.tmp`;
        await writeFile(temp, bytes); await rename(temp, documentPath);
        return { content, revision: digest(bytes) };
      });
    },
    async upload(path, bytes) {
      const target = safePath(path); await mkdir(dirname(target), { recursive: true });
      return withFileLock(join(root, '.local-data'), `attachment:${path}`, async () => {
        try { const existing = await readFile(target); if (existing.equals(bytes)) return; throw new ApiError(409, 'Attachment already exists with different content.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const temp = `${target}.${randomUUID()}.tmp`; await writeFile(temp, bytes); await rename(temp, target);
      });
    },
    async stat(path) { try { const info = await stat(safePath(path)); return info.isFile() ? { size: info.size } : null; } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
  };
}
