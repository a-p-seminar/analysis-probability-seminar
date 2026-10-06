import { api } from './api.mjs';
import { validateUpload } from './archive-model.mjs';

export async function uploadFile(file, { name = file.name, request = api, signal, onProgress = () => {} } = {}) {
  const validation = validateUpload(file);
  if (validation) throw new Error(validation);
  let upload;
  try {
    onProgress({ phase: 'starting', loaded: 0, total: file.size });
    upload = await request('/admin/uploads', { method: 'POST', data: { name, size: file.size }, signal });
    if (!upload.id || !Number.isInteger(upload.chunkSize) || upload.chunkSize <= 0 || upload.chunkSize > 2 * 1024 * 1024) throw new Error('上传服务返回了无效的分块大小。');
    for (let offset = 0, index = 0; offset < file.size; offset += upload.chunkSize, index++) {
      await request(`/admin/uploads/${encodeURIComponent(upload.id)}/${index}`, { method: 'PUT', body: file.slice(offset, Math.min(offset + upload.chunkSize, file.size)), signal });
      onProgress({ phase: 'uploading', loaded: Math.min(offset + upload.chunkSize, file.size), total: file.size });
    }
    onProgress({ phase: 'finalizing', loaded: file.size, total: file.size });
    const result = await request(`/admin/uploads/${encodeURIComponent(upload.id)}/complete`, { method: 'POST', signal });
    if (!result.attachment) throw new Error('文件尚未完成校验，请重试上传。');
    onProgress({ phase: 'complete', loaded: file.size, total: file.size });
    return result.attachment;
  } catch (error) {
    if (upload?.id) await request(`/admin/uploads/${encodeURIComponent(upload.id)}`, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
}
