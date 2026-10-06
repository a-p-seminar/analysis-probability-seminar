import { ApiError } from './errors.mjs';
import { timeRangeError } from '../shared/report-time.mjs';

const fail = message => { throw new ApiError(400, message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(value);
export function validUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !!url.hostname; } catch { return false; }
}
function field(value, label, required = false, limit = 10000) {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) fail(`Invalid ${label}.`);
}
export function validAttachmentPath(path) {
  return typeof path === 'string' && path.length < 1000 && path.startsWith('attachments/') && !/[\\?#%\x00-\x1f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..');
}
export async function validateContent(input, repository) {
  if (!object(input) || input.schemaVersion !== 1 || !object(input.site) || !Array.isArray(input.talks) || input.talks.length > 10000) fail('Invalid seminar document.');
  const content = structuredClone(input); field(content.site.title, 'site title', true);
  if (content.site.sources !== undefined && (!Array.isArray(content.site.sources) || !content.site.sources.every(validUrl))) fail('Invalid site source URL.');
  const ids = new Set(), paths = new Map();
  for (const talk of content.talks) {
    if (!object(talk) || !identifier(talk.id) || ids.has(talk.id)) fail('Talk IDs must be unique URL-safe identifiers.'); ids.add(talk.id);
    if (typeof talk.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(talk.date) || talk.date.slice(0, 4) === '0000' || !Number.isFinite(Date.parse(`${talk.date}T00:00:00Z`)) || new Date(`${talk.date}T00:00:00Z`).toISOString().slice(0, 10) !== talk.date) fail('Invalid calendar date.');
    field(talk.title, 'talk title', true); field(talk.speaker, 'speaker', true);
    for (const name of ['time', 'affiliation', 'affiliationZh', 'affiliationEn', 'startTime', 'endTime', 'location', 'notes']) field(talk[name], name);
    if (talk.affiliationZh !== undefined || talk.affiliationEn !== undefined) {
      talk.affiliationZh = (talk.affiliationZh || '').trim();
      talk.affiliationEn = (talk.affiliationEn || '').trim();
      talk.affiliation = [talk.affiliationZh, talk.affiliationEn].filter(Boolean).join(' · ');
    }
    if (talk.startTime !== undefined || talk.endTime !== undefined) {
      const timeError = timeRangeError(talk.startTime, talk.endTime);
      if (timeError) fail(timeError);
      if (talk.startTime || talk.endTime) {
        talk.time = `${talk.startTime}-${talk.endTime}`;
      }
    }
    field(talk.abstract, 'abstract', false, 500000);
    if (talk.sourceUrls !== undefined && (!Array.isArray(talk.sourceUrls) || talk.sourceUrls.length > 100 || !talk.sourceUrls.every(validUrl))) fail('Invalid talk source URL.');
    if (!Array.isArray(talk.attachments) || talk.attachments.length > 100) fail('Invalid attachments.');
    const attachmentIds = new Set();
    for (const attachment of talk.attachments) {
      if (!object(attachment) || !identifier(attachment.id) || attachmentIds.has(attachment.id)) fail('Attachment IDs must be unique.'); attachmentIds.add(attachment.id);
      field(attachment.name, 'attachment name', true, 255);
      if (!['pdf', 'ppt', 'pptx'].includes(attachment.type) || attachment.name.toLowerCase().split('.').at(-1) !== attachment.type) fail('Invalid attachment type.');
      if (!Number.isSafeInteger(attachment.size) || attachment.size <= 0 || attachment.size > 50 * 1024 * 1024) fail('Invalid attachment size.');
      if (attachment.path) {
        if (!validAttachmentPath(attachment.path) || attachment.path.toLowerCase().split('.').at(-1) !== attachment.type) fail('Invalid attachment path.');
        if (!paths.has(attachment.path)) paths.set(attachment.path, await repository.stat(attachment.path));
        const file = paths.get(attachment.path); if (!file || file.size !== attachment.size) fail('An attachment is missing or its size does not match.');
        delete attachment.url;
      } else if (!validUrl(attachment.url)) fail('An attachment requires a valid path or URL.');
    }
  }
  return content;
}
export function publicContent(content, repository, revision) {
  const result = structuredClone(content);
  for (const talk of result.talks) for (const attachment of talk.attachments || []) if (attachment.path) attachment.url = repository.publicUrl(attachment.path, revision);
  return result;
}
