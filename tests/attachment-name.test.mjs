import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFile } from '../src/upload.mjs';

const names = await import('../shared/attachment-name.mjs').catch(() => ({}));
const talk = { date: '2023-07-01', speaker: '张三', title: 'Random walks and dimension' };

test('report filenames use YYMMDD, the speaker and full title, keeping spaces and file type', () => {
  assert.equal(typeof names.reportAttachmentName, 'function');
  for (const extension of ['pdf', 'ppt', 'pptx']) {
    assert.equal(names.reportAttachmentName(talk, `original.${extension}`), `230701_张三_Random walks and dimension.${extension}`);
  }
  assert.equal(names.reportAttachmentName({ ...talk, speaker: 'Yann Bugeaud' }, 'original.PDF'), '230701_Yann Bugeaud_Random walks and dimension.pdf');
});

test('renaming safely replaces path characters and keeps the date and extension in long Unicode names', () => {
  assert.equal(typeof names.reportAttachmentName, 'function');
  const name = names.reportAttachmentName({ ...talk, speaker: '张/三', title: 'A: B? C% D# E\\F' }, 'original.pdf');
  assert.equal(name, '230701_张-三_A- B- C- D- E-F.pdf');
  const long = names.reportAttachmentName({ ...talk, speaker: '报告人'.repeat(100), title: '数学标题😀'.repeat(100) }, 'original.pptx');
  assert.ok(Buffer.byteLength(long) <= 180);
  assert.match(long, /^230701_/);
  assert.ok(long.endsWith('.pptx'));
  assert.ok(!long.includes('\uFFFD'));
  assert.equal(names.safeAttachmentName(long), long);
});

test('missing report fields or invalid dates prevent naming instead of using the upload date', () => {
  assert.equal(typeof names.reportAttachmentName, 'function');
  for (const change of [{ date: '' }, { date: '2023-02-29' }, { speaker: '' }, { title: '  ' }]) {
    assert.throws(() => names.reportAttachmentName({ ...talk, ...change }, 'original.pdf'), /日期|报告人|标题/);
  }
});

test('the chunk uploader sends the generated filename while keeping the original bytes unchanged', async () => {
  const name = '230701_张三_Random walks and dimension.pdf';
  const file = new File(['%PDF-1.7'], 'original.pdf');
  const received = [];
  const result = await uploadFile(file, { name, request: async (path, options) => {
    if (path === '/admin/uploads') {
      assert.equal(options.data.name, name);
      return { id: 'sample', chunkSize: 4 };
    }
    if (path.endsWith('/complete')) return { attachment: { name } };
    received.push(await options.body.text());
    return { ok: true };
  } });
  assert.equal(received.join(''), '%PDF-1.7');
  assert.equal(result.name, name);
  assert.equal(file.name, 'original.pdf');
});
