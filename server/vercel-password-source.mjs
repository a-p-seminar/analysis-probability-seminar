import { ApiError } from './errors.mjs';
import { newPasswordError } from '../shared/password-policy.mjs';

const unavailable = () => new ApiError(503, '密码环境变量暂时无法读取或更新，请检查 Vercel 配置后重试。');
export function createVercelPasswordSource({ env, fetchImpl = fetch }) {
  const project = env.VERCEL_PROJECT_ID, variable = env.VERCEL_ADMIN_PASSWORD_ENV_ID;
  async function api(version, method = 'GET', body) {
    if (!/^prj_[A-Za-z0-9]+$/.test(project || '') || !/^[A-Za-z0-9_]+$/.test(variable || '') || !env.VERCEL_ENV_TOKEN) throw unavailable();
    const url = new URL(`https://api.vercel.com/${version}/projects/${project}/env/${variable}`);
    if (env.VERCEL_TEAM_ID) url.searchParams.set('teamId', env.VERCEL_TEAM_ID);
    try {
      const response = await fetchImpl(url.href, { method, headers: { authorization: `Bearer ${env.VERCEL_ENV_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) }, cache: 'no-store', signal: AbortSignal.timeout(15000), ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw unavailable();
      return await response.json();
    } catch { throw unavailable(); }
  }
  async function read() {
    const current = await api('v1');
    if (current.id !== variable || current.key !== 'ADMIN_PASSWORD' || current.type !== 'plain' || !Array.isArray(current.target) || current.target.length !== 1 || current.target[0] !== 'production' || current.gitBranch || current.customEnvironmentIds?.length || newPasswordError(current.value) || !current.updatedAt) throw unavailable();
    return { password: current.value, revision: String(current.updatedAt) };
  }
  return {
    read,
    async write(password) {
      const error = newPasswordError(password); if (error) throw new ApiError(400, error);
      await read();
      // The variable ID identifies just this project's production password.
      await api('v9', 'PATCH', { value: password });
    },
  };
}
