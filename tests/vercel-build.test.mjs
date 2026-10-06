import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

test('Vercel first build runs; subsequent data updates skip; undeployed code changes still build', async t => {
  const root = await mkdtemp(join(tmpdir(), 'seminar-vercel-ignore-')); t.after(() => rm(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git(['init']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  await mkdir(join(root, 'content')); await mkdir(join(root, 'src'));
  await writeFile(join(root, 'content/seminars.json'), '{}'); git(['add', '.']); git(['commit', '-m', 'initial']);
  const initial = git(['rev-parse', 'HEAD']), script = resolve('scripts/ignore-vercel-data-build.mjs');
  const status = before => spawnSync(process.execPath, [script], { cwd: root, env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: before }, stdio: 'ignore' }).status;
  assert.equal(status(''), 1, 'first deployment must build');
  await writeFile(join(root, 'content/seminars.json'), '{"updated":true}'); git(['add', '.']); git(['commit', '-m', 'data only']);
  assert.equal(status(initial), 0, 'only data changed since deployed commit');
  await writeFile(join(root, 'src/main.jsx'), 'export default 1'); git(['add', '.']); git(['commit', '-m', 'code']);
  await writeFile(join(root, 'content/seminars.json'), '{"updated":2}'); git(['add', '.']); git(['commit', '-m', 'more data']);
  assert.equal(status(initial), 1, 'latest data commit must not hide undeployed code');
  assert.equal(status('f'.repeat(40)), 1, 'missing shallow history must build');
});
