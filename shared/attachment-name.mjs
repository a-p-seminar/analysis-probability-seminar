const encoder = new TextEncoder();
const MAX_NAME_BYTES = 180;

function cleanPart(value) {
  return value.normalize('NFKC').replace(/[<>:"/\\|?*%#\x00-\x1f\x7f]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+|[. ]+$/g, '');
}

function fitBytes(value, limit) {
  let result = '', length = 0;
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (length + size > limit) break;
    result += char; length += size;
  }
  return result.replace(/[. ]+$/g, '');
}

function extensionOf(name) {
  const extension = typeof name === 'string' && name.match(/\.(pdf|ppt|pptx)$/i);
  if (!extension) throw new Error('仅支持 PDF、PPT 或 PPTX 文件。');
  return `.${extension[1].toLowerCase()}`;
}

// Used by both the browser and upload service, so the stored name matches the UI.
export function safeAttachmentName(name) {
  if (typeof name !== 'string' || name.length > 255) throw new Error('文件名过长或无效。');
  const base = name.split(/[\\/]/).at(-1).normalize('NFKC');
  const extension = extensionOf(base);
  let stem = fitBytes(cleanPart(base.slice(0, -extension.length)), MAX_NAME_BYTES - extension.length);
  if (!stem) throw new Error('文件名不能为空。');
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  return `${stem}${extension}`;
}

export function reportAttachmentName(talk, originalName) {
  const { date, speaker, title } = talk || {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('请先填写有效的报告日期，再上传附件。');
  }
  if (typeof speaker !== 'string' || !speaker.trim() || !cleanPart(speaker)) throw new Error('请先填写报告人，再上传附件。');
  if (typeof title !== 'string' || !title.trim() || !cleanPart(title)) throw new Error('请先填写报告标题，再上传附件。');
  const extension = extensionOf(originalName);
  const prefix = `${date.slice(2).replaceAll('-', '')}_${fitBytes(cleanPart(speaker), 48)}_`;
  const shortTitle = fitBytes(cleanPart(title), MAX_NAME_BYTES - encoder.encode(prefix).length - extension.length);
  return `${prefix}${shortTitle}${extension}`;
}
