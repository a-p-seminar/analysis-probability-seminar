import test from 'node:test';
import assert from 'node:assert/strict';
import { newPasswordError } from '../shared/password-policy.mjs';
import { hashPassword, verifyPassword } from '../server/auth.mjs';

test('passwords have no character count restriction while blank and non-string values are rejected', () => {
  for (const value of ['a', 'ap', 'x'.repeat(129), 'x'.repeat(2048), ' 数学 ']) assert.equal(newPasswordError(value), '');
  for (const value of ['', '   ', '\n\t', undefined, null, 123]) assert.ok(newPasswordError(value));
});

test('hashing and authentication support short passwords and passwords exceeding the previous 1024-character limit', async () => {
  for (const value of ['a', 'ap', 'x'.repeat(129), 'x'.repeat(2048)]) {
    const hash = await hashPassword(value);
    assert.ok(await verifyPassword(value, hash));
    assert.equal(await verifyPassword(value + 'different', hash), false);
  }
  await assert.rejects(hashPassword(''));
});
