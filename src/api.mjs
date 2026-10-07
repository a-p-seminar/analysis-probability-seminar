export async function api(path, { method = 'GET', data, body, signal } = {}) {
  const response = await fetch(`/api${path}`, {
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
