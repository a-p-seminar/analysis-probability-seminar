import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFile } from '../src/upload.mjs';

const names = await import('../shared/attachment-name.mjs').catch(() => ({}));
const talk = { date: '2023-07-01', speaker: '张三', title: 'Random walks and dimension' };
const id = 'file-1234567890abcdef';

test('report filenames use the first title word and preserve the attachment ID', () => {
  assert.equal(typeof names.reportAttachmentName, 'function');
  for (const extension of ['pdf', 'ppt', 'pptx']) {
    assert.equal(names.reportAttachmentName(talk, `original.${extension}`, id), `230701_张三_Random_${id}.${extension}`);
  }
  assert.equal(names.reportAttachmentName({ ...talk, speaker: 'Yann Bugeaud' }, 'original.PDF', id), `230701_Yann Bugeaud_Random_${id}.pdf`);
  assert.notEqual(names.reportAttachmentName(talk, 'original.pdf', id), names.reportAttachmentName(talk, 'original.pdf', 'file-other'));
});

test('renaming safely replaces path characters and keeps the date and extension in long Unicode names', () => {
  assert.equal(typeof names.reportAttachmentName, 'function');
  const name = names.reportAttachmentName({ ...talk, speaker: '张/三', title: '  A: B? C% D# E\\F' }, 'original.pdf', id);
  assert.equal(name, `230701_张-三_A-_${id}.pdf`);
  const long = names.reportAttachmentName({ ...talk, speaker: '报告人'.repeat(100), title: '数学标题😀'.repeat(100) }, 'original.pptx', id);
  assert.ok(Buffer.byteLength(long) <= 180);
  assert.match(long, /^230701_/);
  assert.ok(long.endsWith(`_${id}.pptx`));
  assert.ok(!long.includes('\uFFFD'));
  assert.equal(names.safeAttachmentName(long), long);
});

test('missing report fields or invalid dates prevent naming instead of using the upload date', () => {
  assert.equal(typeof names.reportAttachmentName, 'function');
  for (const change of [{ date: '' }, { date: '2023-02-29' }, { speaker: '' }, { title: '  ' }]) {
    assert.throws(() => names.reportAttachmentName({ ...talk, ...change }, 'original.pdf', id), /日期|报告人|标题/);
  }
  for (const invalidId of [undefined, '', '../escape', 'has space', 'a'.repeat(65)]) assert.throws(() => names.reportAttachmentName(talk, 'original.pdf', invalidId), /ID/);
});

test('the chunk uploader sends report metadata and displays the server name without changing bytes', async () => {
  const name = `230701_张三_Random_${id}.pdf`;
  const file = new File(['%PDF-1.7'], 'original.pdf');
  const received = [];
  const progress = [];
  const result = await uploadFile(file, { talk: { ...talk, abstract: 'Do not send the abstract' }, onProgress: state => progress.push(state), request: async (path, options) => {
    if (path === '/admin/uploads') {
      assert.equal(options.data.name, 'original.pdf');
      assert.deepEqual(options.data.talk, talk);
      return { id, name, chunkSize: 4 };
    }
    if (path.endsWith('/complete')) return { attachment: { name } };
    received.push(await options.body.text());
    return { ok: true };
  } });
  assert.equal(received.join(''), '%PDF-1.7');
  assert.equal(result.name, name);
  assert.equal(file.name, 'original.pdf');
  assert.ok(progress.some(state => state.name === name));
});
