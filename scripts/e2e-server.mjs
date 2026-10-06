import { mkdtemp, mkdir, copyFile, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../server/auth.mjs';

// Test-only credentials and isolated filesystem: acceptance tests never edit the archive.
const root = fileURLToPath(new URL('../', import.meta.url));
const dataRoot = await mkdtemp(join(tmpdir(), 'seminar-e2e-'));
await mkdir(join(dataRoot, 'content'));
await copyFile(join(root, 'content/seminars.json'), join(dataRoot, 'content/seminars.json'));
await cp(join(root, 'attachments'), join(dataRoot, 'attachments'), { recursive: true });
await writeFile(join(dataRoot, 'empty.env'), '');
const child = spawn(process.execPath, ['scripts/dev-server.mjs', '--built'], {
  cwd: root,
  env: {
    ...process.env, PORT: '5187', SEMINAR_DATA_ROOT: dataRoot,
    SEMINAR_ENV_FILE: join(dataRoot, 'empty.env'),
    ADMIN_PASSWORD_HASH: await hashPassword('test-only-not-a-production-password'),
    SESSION_SECRET: 'test-only-session-secret-never-used-in-production-0123456789',
  }, stdio: 'inherit',
});
async function cleanup() { await rm(dataRoot, { recursive: true, force: true }); }
child.on('exit', async code => { await cleanup(); process.exit(code || 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
