import { ApiError } from './errors.mjs';
import { newPasswordError } from '../shared/password-policy.mjs';

const unavailable = () => new ApiError(503, '密码环境变量暂时无法读取或更新，请检查 Cloudflare 配置后重试。');
export function createCloudflarePasswordSource({ env, fetchImpl = fetch }) {
  const account = env.CLOUDFLARE_ACCOUNT_ID, name = env.CLOUDFLARE_WORKER_NAME;
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`;
  async function api(path, method = 'GET', body) {
    if (!/^[a-f0-9]{32}$/i.test(account || '') || !/^[a-zA-Z0-9_-]+$/.test(name || '') || !env.CLOUDFLARE_ENV_TOKEN) throw unavailable();
    try {
      const response = await fetchImpl(`${base}${path}`, { method, headers: { authorization: `Bearer ${env.CLOUDFLARE_ENV_TOKEN}` }, cache: 'no-store', signal: AbortSignal.timeout(12000), ...(body ? { body } : {}) });
      const value = await response.json();
      if (!response.ok || value.success !== true) throw unavailable();
      return value.result;
    } catch { throw unavailable(); }
  }
  const settings = () => api(`/${encodeURIComponent(name)}/settings`);
  return {
    async read() {
      const config = await settings();
      const binding = config?.bindings?.find(b => b.name === 'ADMIN_PASSWORD');
      if (binding?.type !== 'plain_text' || newPasswordError(binding.text)) throw unavailable();
      const scripts = await api('');
      const script = Array.isArray(scripts) && scripts.find(s => s.id === name);
      if (!script?.modified_on) throw unavailable();
      return { password: binding.text, revision: script.modified_on };
    },
    async write(password) {
      const validation = newPasswordError(password); if (validation) throw new ApiError(400, validation);
      const current = await settings();
      if (!Array.isArray(current?.bindings) || !current.bindings.some(b => b.name === 'ADMIN_PASSWORD' && b.type === 'plain_text')) throw unavailable();
      const bindings = current.bindings.map(b => b.name === 'ADMIN_PASSWORD' ? { name: b.name, type: 'plain_text', text: password } : { name: b.name, type: 'inherit' });
      const body = new FormData(); body.set('settings', JSON.stringify({ bindings }));
      await api(`/${encodeURIComponent(name)}/settings`, 'PATCH', body);
    },
  };
}
