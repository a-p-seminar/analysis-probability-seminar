import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const content = JSON.parse(readFileSync(path.join(root, 'content/seminars.json'), 'utf8'));

function isHttpUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}

test('editable archive records have unique identifiers and valid calendar dates', () => {
  assert.equal(content.schemaVersion, 1);
  assert.equal(typeof content.site.title, 'string');
  assert.ok(Array.isArray(content.talks));
  assert.equal(new Set(content.talks.map(talk => talk.id)).size, content.talks.length);
  for (const talk of content.talks) {
    assert.match(talk.id, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
    assert.ok(typeof talk.speaker === 'string' && talk.speaker.trim(), talk.id);
    assert.ok(typeof talk.title === 'string' && talk.title.trim(), talk.id);
    assert.equal(typeof talk.abstract, 'string');
    assert.match(talk.date, /^\d{4}-\d{2}-\d{2}$/);
    const date = new Date(`${talk.date}T00:00:00Z`);
    assert.ok(Number.isFinite(date.getTime()), talk.id);
    assert.equal(date.toISOString().slice(0, 10), talk.date, talk.id);
  }
});

test('source and attachment URLs exclude empty button placeholders and unsafe schemes', () => {
  for (const talk of content.talks) {
    assert.ok(Array.isArray(talk.sourceUrls));
    for (const url of talk.sourceUrls) assert.ok(isHttpUrl(url), `${talk.id}: ${url}`);
    assert.ok(Array.isArray(talk.attachments));
    for (const attachment of talk.attachments) {
      assert.ok(attachment.id && attachment.name);
      assert.ok(['pdf', 'ppt', 'pptx'].includes(attachment.type));
      assert.ok(attachment.path || isHttpUrl(attachment.url), attachment.name);
      assert.ok(!attachment.url || isHttpUrl(attachment.url), attachment.name);
    }
  }
});

test('every owned attachment resolves inside attachments and matches its bytes and file type', () => {
  const attachmentRoot = path.resolve(root, 'attachments') + path.sep;
  for (const talk of content.talks) for (const attachment of talk.attachments) {
    if (!attachment.path) continue;
    assert.match(attachment.path, /^attachments\//);
    const filename = path.resolve(root, attachment.path);
    assert.ok(filename.startsWith(attachmentRoot), attachment.path);
    const bytes = readFileSync(filename);
    assert.ok(bytes.length > 0, attachment.path);
    assert.equal(bytes.length, attachment.size, attachment.path);
    if (attachment.type === 'pdf') assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    if (attachment.type === 'ppt') assert.equal(bytes.subarray(0, 8).toString('hex'), 'd0cf11e0a1b11ae1');
    if (attachment.type === 'pptx') assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  }
});
