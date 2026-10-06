import { ApiError } from './errors.mjs';
import { newPasswordError } from '../shared/password-policy.mjs';

const unavailable = () => new ApiError(503, '密码环境变量暂时无法读取或更新，请检查 Netlify 配置后重试。');

// Read the live site variable, rather than the function's deployment-time snapshot.
export function createNetlifyPasswordSource({ env = process.env, fetchImpl = fetch } = {}) {
  const account = env.NETLIFY_ACCOUNT_ID, site = env.NETLIFY_SITE_ID || env.SITE_ID;
  async function request(method, body) {
    if (!/^[a-zA-Z0-9_-]+$/.test(account || '') || !/^[a-f0-9-]{36}$/i.test(site || '') || !env.NETLIFY_ENV_TOKEN) throw unavailable();
    const url = `https://api.netlify.com/api/v1/accounts/${encodeURIComponent(account)}/env/ADMIN_PASSWORD?site_id=${encodeURIComponent(site)}`;
    try {
      const response = await fetchImpl(url, {
        method, cache: 'no-store', signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${env.NETLIFY_ENV_TOKEN}`, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw unavailable();
      return await response.json();
    } catch { throw unavailable(); }
  }
  return {
    async read() {
      const variable = await request('GET');
      const values = Array.isArray(variable?.values) ? variable.values : [];
      const value = values.find(v => v.context === 'production') || values.find(v => v.context === 'all');
      if (variable?.key !== 'ADMIN_PASSWORD' || variable.is_secret || !variable.scopes?.includes('functions') || newPasswordError(value?.value)) throw unavailable();
      return { password: value.value, revision: JSON.stringify([variable.updated_at || '', value.id || '', value.context]) };
    },
    async write(password) {
      if (newPasswordError(password)) throw new ApiError(400, newPasswordError(password));
      // Preserve unrelated preview/branch values and all other site variables.
      await request('PATCH', { context: 'production', value: password });
    },
  };
}
