import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('local attachment serving contains decoded paths and never exposes private project files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'seminar-file-test-'));
  const project = fileURLToPath(new URL('../', import.meta.url));
  await mkdir(join(root, 'attachments'));
  await mkdir(join(root, 'content'));
  await writeFile(join(root, 'content/seminars.json'), '{}');
  await writeFile(join(root, '.env.local'), 'BENIGN_FIXTURE_MARKER=private\n');
  await writeFile(join(root, 'attachments/fixture.pdf'), '%PDF-1.7\nfixture');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['scripts/dev-server.mjs', '--built'], {
    cwd: project,
    env: { ...process.env, PORT: String(port), SEMINAR_DATA_ROOT: root, SEMINAR_ENV_FILE: join(root, '.env.local') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await rm(root, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local test server did not start.')), 10000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('Seminar:')) { clearTimeout(timeout); resolve(); } });
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Local test server exited ${code}`)); });
  });
  const origin = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${origin}/attachments/fixture.pdf`)).status, 200);
  for (const path of ['/attachments/..%2fcontent/seminars.json', '/attachments/..%2f.env.local', '/attachments/..%5c.env.local', '/.env.local', '/.local-data/admin-login.txt', `/@fs/${project.replaceAll('\\', '/')}.env.local`]) {
    assert.equal((await fetch(origin + path)).status, 404, `private or escaping path: ${path}`);
  }
});
