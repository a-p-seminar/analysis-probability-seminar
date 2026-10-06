export async function api(path, { method = 'GET', data, body, signal } = {}) {
  const preview = import.meta.env?.VITE_STATIC_PREVIEW === 'true';
  if (preview && path === '/session' && method === 'GET') return { authenticated: false, mode: 'preview' };
  if (preview && (path !== '/content' || method !== 'GET')) throw new Error('当前为在线预览，尚未启用编辑与上传。');
  const response = await fetch(preview ? '/preview/content.json' : `/api${path}`, {
    method, credentials: 'same-origin', cache: 'no-store', signal,
    headers: data !== undefined ? { 'Content-Type': 'application/json' } : body ? { 'Content-Type': 'application/octet-stream' } : undefined,
    body: data !== undefined ? JSON.stringify(data) : body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return result;
}
