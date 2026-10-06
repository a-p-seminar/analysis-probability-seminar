import test from 'node:test';
import assert from 'node:assert/strict';
let githubBlobBody;
try { ({ githubBlobBody } = await import('../server/github-blob-body.mjs')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

test('GitHub streaming bodies preserve every base64 byte across chunk and padding boundaries', async () => {
  assert.equal(typeof githubBlobBody, 'function', 'Streaming blob encoder must be implemented');
  for (const size of [0, 1, 2, 3, 49151, 49152, 49153, 150001]) {
    const bytes = Buffer.alloc(size); for (let i = 0; i < size; i++) bytes[i] = i % 256;
    const stream = githubBlobBody(bytes), reader = stream.getReader(), pieces = []; let max = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; max = Math.max(max, value.length); pieces.push(Buffer.from(value)); }
    const result = JSON.parse(Buffer.concat(pieces).toString());
    assert.equal(result.encoding, 'base64'); assert.deepEqual(Buffer.from(result.content, 'base64'), bytes);
    assert(max <= 65536, 'Encoder must avoid allocating a complete base64 string');
  }
});
