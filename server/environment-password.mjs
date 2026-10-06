import { createHmac, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from './auth.mjs';
import { ApiError } from './errors.mjs';
import { getJson, putJson } from './private-store.mjs';
import { newPasswordError } from '../shared/password-policy.mjs';

const lockKey = 'auth/environment-password-lock';
export function createEnvironmentPassword({ source, store, secret }) {
  async function read() {
    const current = await source.read();
    const version = `environment:${createHmac('sha256', secret).update(JSON.stringify([current.password, current.revision])).digest('hex')}`;
    return { hash: await hashPassword(current.password), version, persisted: true };
  }
  async function acquire() {
    const previous = await getJson(store, lockKey);
    if (previous?.value.expires > Date.now()) throw new ApiError(409, '其他页面正在修改密码，请稍后重试。');
    const owner = randomUUID();
    const result = await putJson(store, lockKey, { owner, expires: Date.now() + 120_000 }, previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true });
    if (!result.modified) throw new ApiError(409, '其他页面正在修改密码，请稍后重试。');
    return owner;
  }
  async function release(owner) {
    const current = await getJson(store, lockKey);
    if (current?.value.owner === owner) await putJson(store, lockKey, { owner, expires: 0 }, { onlyIfMatch: current.etag });
  }
  return {
    read,
    async change(input, sessionVersion) {
      const validation = newPasswordError(input?.newPassword);
      if (validation) throw new ApiError(400, validation);
      const owner = await acquire();
      try {
        const current = await read();
        if (current.version !== sessionVersion) throw new ApiError(401, '登录状态已失效，请重新登录。');
        if (!await verifyPassword(input?.currentPassword, current.hash)) throw new ApiError(400, '当前密码不正确。');
        if (input.newPassword === input.currentPassword) throw new ApiError(400, '新密码不能与当前密码相同。');
        await source.write(input.newPassword);
        if (!await verifyPassword(input.newPassword, (await read()).hash)) throw new ApiError(409, '密码已被其他页面修改，请使用 Netlify 中的当前密码重新登录。');
      } finally {
        // A cleanup failure must not turn a confirmed password update into a failure.
        await release(owner).catch(() => {});
      }
    },
  };
}
