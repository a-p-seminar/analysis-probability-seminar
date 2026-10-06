import { createHash, randomUUID } from 'node:crypto';
import { hashPassword, validPasswordHash, verifyPassword } from './auth.mjs';
import { ApiError } from './errors.mjs';
import { getJson, putJson } from './private-store.mjs';
import { newPasswordError } from '../shared/password-policy.mjs';

const key = 'auth/admin-password';
export function createAdminPassword(store, initialHash) {
  async function read() {
    const record = await getJson(store, key);
    if (record) {
      if (!validPasswordHash(record.value?.hash) || !/^[a-f0-9-]{36}$/.test(record.value?.version || '')) {
        throw new ApiError(503, '密码配置暂时无法读取，请稍后重试。');
      }
      return { ...record.value, etag: record.etag, persisted: true };
    }
    if (!validPasswordHash(initialHash)) throw new ApiError(503, 'Administrator access is not configured.');
    return { hash: initialHash, version: `initial:${createHash('sha256').update(initialHash).digest('hex')}`, persisted: false };
  }
  return {
    read,
    async change(input, sessionVersion) {
      const validation = newPasswordError(input?.newPassword);
      if (validation) throw new ApiError(400, validation);
      const current = await read();
      if (current.version !== sessionVersion) throw new ApiError(401, '登录状态已失效，请重新登录。');
      if (!await verifyPassword(input?.currentPassword, current.hash)) throw new ApiError(400, '当前密码不正确。');
      if (input.newPassword === input.currentPassword) throw new ApiError(400, '新密码不能与当前密码相同。');
      const updated = { hash: await hashPassword(input.newPassword), version: randomUUID(), updatedAt: new Date().toISOString() };
      // One atomic write changes both the credential and the accepted session version.
      const result = await putJson(store, key, updated, current.persisted ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
      if (!result.modified) throw new ApiError(409, '密码已被其他页面修改，请重新登录。');
    },
  };
}
