import { ApiError } from './errors.mjs';
import { newPasswordError } from '../shared/password-policy.mjs';

const unavailable = () => new ApiError(503, '密码环境变量暂时无法读取或更新，请检查 Render 配置后重试。');
export function createRenderPasswordSource({ env, fetchImpl = fetch }) {
  const service = env.RENDER_SERVICE_ID;
  async function api(suffix, method = 'GET', body) {
    if (!/^srv-[a-z0-9]{20}$/.test(service || '') || !env.RENDER_ENV_TOKEN) throw unavailable();
    try {
      const response = await fetchImpl(`https://api.render.com/v1/services/${service}${suffix}`, {
        method, headers: { authorization: `Bearer ${env.RENDER_ENV_TOKEN}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        cache: 'no-store', signal: AbortSignal.timeout(15000), ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw unavailable();
      return await response.json();
    } catch { throw unavailable(); }
  }
  return {
    async read() {
      const [variable, metadata] = await Promise.all([api('/env-vars/ADMIN_PASSWORD'), api('')]);
      if (variable?.key !== 'ADMIN_PASSWORD' || newPasswordError(variable.value) || metadata?.id !== service || !metadata.updatedAt) throw unavailable();
      return { password: variable.value, revision: metadata.updatedAt };
    },
    async write(password) {
      const error = newPasswordError(password); if (error) throw new ApiError(400, error);
      await api('/env-vars/ADMIN_PASSWORD', 'PUT', { value: password });
    },
  };
}
