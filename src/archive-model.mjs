import { reportAffiliation as displayAffiliation } from '../shared/report-affiliation.mjs';
export { displayAffiliation };

export function filterTalks(talks, { year = '', month = '', query = '', dateFrom = '', dateTo = '' } = {}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return talks.filter(talk => (!year || talk.date.slice(0, 4) === year)
    && (!month || talk.date.slice(5, 7) === month)
    && (!dateFrom || talk.date >= dateFrom)
    && (!dateTo || talk.date <= dateTo)
    && terms.every(term => [talk.title, talk.speaker, displayAffiliation(talk), talk.abstract, talk.location, talk.notes, talk.date].filter(Boolean).join(' ').toLocaleLowerCase().includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function groupTalks(talks) {
  const groups = new Map();
  for (const talk of talks) {
    const year = talk.date.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(talk);
  }
  return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([year, items]) => ({ year, talks: items }));
}

export function groupTalksByMonth(talks) {
  const groups = new Map();
  for (const talk of talks) {
    const month = talk.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(talk);
  }
  return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([month, items]) => ({ month, talks: items }));
}

const DAY_MS = 86_400_000;
const clockTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function reportTime(talk) {
  return talk.startTime && talk.endTime ? `${talk.startTime}-${talk.endTime}` : talk.time || '';
}

export function editableTalk(talk) {
  const range = parseTimeRange(reportTime(talk));
  const draft = { ...structuredClone(talk), affiliation: displayAffiliation(talk), startTime: range ? clockTime(range.start) : '', endTime: range ? clockTime(range.end) : '' };
  delete draft.affiliationZh; delete draft.affiliationEn;
  return draft;
}

export function serializeTalk(talk) {
  const result = { ...talk, affiliation: displayAffiliation(talk), time: reportTime(talk) };
  delete result.affiliationZh; delete result.affiliationEn;
  return result;
}

// Dates and time ranges are always Beijing wall time, regardless of the visitor's timezone.
function parseTimeRange(time) {
  const value = (time || '').replaceAll('：', ':');
  const range = value.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2}):(\d{2})\s*[-–—~～至到]\s*(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2}):(\d{2})(?!\d)/);
  if (!range) return null;
  const minutes = (hour, minute, period) => {
    let h = Number(hour);
    const m = Number(minute);
    if (h > 23 || m > 59) return null;
    if (['下午', '晚上', '中午'].includes(period) && h < 12) h += 12;
    if (period === '凌晨' && h === 12) h = 0;
    return h * 60 + m;
  };
  const start = minutes(range[2], range[3], range[1]);
  const end = minutes(range[5], range[6], range[4] || range[1]);
  return start === null || end === null ? null : { start, end };
}

export function talkEndTime(talk) {
  const midnight = Date.parse(`${talk.date}T00:00:00+08:00`);
  const range = parseTimeRange(reportTime(talk));
  if (!range) return midnight + DAY_MS;
  const { start, end } = range;
  return midnight + end * 60_000 + (end < start ? DAY_MS : 0);
}

export function talkStatus(talk, now = Date.now()) {
  return now >= talkEndTime(talk) ? 'ended' : 'upcoming';
}

export function sortArchiveTalks(talks, now = Date.now()) {
  const sorted = talks.map(talk => ({ talk, end: talkEndTime(talk), status: talkStatus(talk, now) }))
    .sort((a, b) => a.status !== b.status ? (a.status === 'upcoming' ? -1 : 1)
      : (a.status === 'upcoming' ? a.end - b.end : b.end - a.end) || a.talk.id.localeCompare(b.talk.id));
  return sorted.map(item => item.talk);
}

export function safeHttpUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function ownedAttachmentPath(value) {
  if (typeof value !== 'string' || !/^\/?attachments\//.test(value) || /[\\?#\u0000-\u0020]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.split('/').some(part => part === '.' || part === '..') || decoded.includes('\\')) return null;
    return `/${value.replace(/^\//, '')}`;
  } catch { return null; }
}

export function attachmentUrl(attachment) {
  return safeHttpUrl(attachment.url) || ownedAttachmentPath(attachment.url) || ownedAttachmentPath(attachment.path);
}

export function visibleAttachments(talk) {
  return (talk.attachments || []).filter(attachment => ['pdf', 'ppt', 'pptx'].includes(attachment.type?.toLowerCase())
    && /\.(pdf|pptx?)$/i.test(attachment.name || '')
    && (attachment.size === undefined || attachment.size > 0)
    && attachmentUrl(attachment));
}

export function safePdfUrl(value, name, origin) {
  if (!/\.pdf$/i.test(name || '') || /[\\\u0000-\u0020]/.test(value || '')) return null;
  const path = ownedAttachmentPath(value);
  const url = path ? new URL(path, origin).href : safeHttpUrl(value);
  if (!url || (!path && !/^https?:\/\//i.test(value))) return null;
  return url;
}

export function newTalk() {
  return { id: `talk-${globalThis.crypto.randomUUID()}`, date: '', time: '', startTime: '', endTime: '', title: '', speaker: '', affiliation: '', abstract: '', location: '', notes: '', sourceUrls: [], attachments: [] };
}

export function upsertTalk(content, record) {
  const exists = content.talks.some(talk => talk.id === record.id);
  return { ...content, talks: exists ? content.talks.map(talk => talk.id === record.id ? { ...talk, ...record } : talk) : [...content.talks, record] };
}

export function validateUpload(file) {
  if (!/\.(pdf|pptx?)$/i.test(file.name)) return '仅支持 PDF、PPT 或 PPTX 文件。';
  if (!file.size) return '不能上传空文件。';
  if (file.size > 50 * 1024 * 1024) return '文件大小不能超过 50 MiB。';
  return '';
}

export function formatSize(size) {
  if (!size) return '';
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MiB` : `${Math.ceil(size / 1024)} KiB`;
}

export function displayDate(date) {
  const [year, month, day] = date.split('-');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function splitLocation(location = '') {
  const match = location.trim().match(/^(武大|华师)\s*(?:·\s*(.*))?$/);
  return match ? { campus: match[1], venue: match[2] || '' } : { campus: '武大', venue: location };
}

export function displayLocation(location = '') {
  const value = location.trim();
  return /^(武大|华师|武汉大学|华中师范大学)\s*(?:·\s*)?$/.test(value)
    ? '' : value.replace(/^(武大|华师)\s*·\s*/, '$1 · ');
}

export function formatLocation(campus, venue = '') {
  return venue.trim() ? `${campus}·${venue.trim()}` : campus;
}

export function displayTime(date, time = '') {
  const range = parseTimeRange(time);
  if (range) {
    return `${clockTime(range.start)}-${clockTime(range.end)}`;
  }
  const value = time.trim();
  const prefix = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?=\D|$)/)
    || value.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!prefix) return value;
  const dateParts = date.split('-').map(Number);
  return prefix.slice(1).every((part, index) => Number(part) === dateParts[index])
    ? value.slice(prefix[0].length).trim() : value;
}
