import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipBuild } from '../scripts/ignore-build.mjs';

test('content-only and attachment-only updates do not build', () => {
  assert.equal(shouldSkipBuild(['content/seminars.json', 'attachments/2026/talk.pdf']), true);
  assert.equal(shouldSkipBuild(['sources/import-report.json']), true);
});
test('code, configuration and mixed changes always build', () => {
  for (const paths of [['src/App.jsx'], ['netlify/functions/api.mjs'], ['package.json'], ['netlify.toml'], ['content/a.json', 'src/main.jsx'], ['attachments-evil/a.js'], []]) {
    assert.equal(shouldSkipBuild(paths), false);
  }
});
