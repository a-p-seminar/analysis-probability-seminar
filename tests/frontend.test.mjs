import test from 'node:test';
import assert from 'node:assert/strict';

const model = await import('../src/archive-model.mjs').catch(() => ({}));
const reportTimes = await import('../shared/report-time.mjs').catch(() => ({}));

test('the suggested end time is one hour later without wrapping into an earlier clock time', () => {
  assert.equal(typeof reportTimes.defaultEndTime, 'function');
  assert.equal(reportTimes.defaultEndTime('10:00'), '11:00');
  assert.equal(reportTimes.defaultEndTime('14:45'), '15:45');
  assert.equal(reportTimes.defaultEndTime('22:59'), '23:59');
  for (const start of ['', '25:00', '10:60', '23:00', '23:30']) assert.equal(reportTimes.defaultEndTime(start), '');
});

test('report times require both complete choices and a strictly later end time', () => {
  assert.equal(typeof reportTimes.timeRangeError, 'function');
  assert.equal(reportTimes.timeRangeError('', ''), '');
  assert.equal(reportTimes.timeRangeError('10:00', '11:00'), '');
  assert.equal(reportTimes.timeRangeError('10:00', '10:01'), '');
  for (const end of ['09:59', '10:00', '00:00']) assert.match(reportTimes.timeRangeError('10:00', end), /结束时间必须晚于开始时间/);
  for (const [start, end] of [['10:00', ''], ['', '11:00'], ['25:00', '11:00'], ['10:00', '11:60']]) assert.match(reportTimes.timeRangeError(start, end), /请选择完整/);
});

test('bilingual institutions normalize legacy parentheses and support either language alone', () => {
  assert.equal(typeof model.displayAffiliation, 'function');
  assert.equal(model.displayAffiliation({ affiliation: '克里特大学（Crete University）' }), '克里特大学 · Crete University');
  assert.deepEqual(model.splitAffiliation({ affiliation: 'University of Strasbourg' }), { affiliationZh: '', affiliationEn: 'University of Strasbourg' });
  assert.equal(model.displayAffiliation({ affiliationZh: ' 武汉大学 ', affiliationEn: ' Wuhan University ' }), '武汉大学 · Wuhan University');
  assert.equal(model.displayAffiliation({ affiliationZh: '', affiliationEn: 'Crete University', affiliation: 'old' }), 'Crete University');
  assert.equal(model.displayAffiliation({ affiliationZh: '', affiliationEn: '', affiliation: 'old' }), '');
  assert.deepEqual(model.splitAffiliation({ affiliation: '中国科学院（北京）' }), { affiliationZh: '中国科学院（北京）', affiliationEn: '' });
});

test('legacy editor records acquire bilingual fields and time choices without mutating source data', () => {
  assert.equal(typeof model.editableTalk, 'function');
  const original = { affiliation: '克里特大学（Crete University）', date: '2025-09-09', time: '（周二）下午 2:00–3:30', extra: 'keep' };
  const draft = model.editableTalk(original);
  assert.equal(draft.affiliationZh, '克里特大学');
  assert.equal(draft.affiliationEn, 'Crete University');
  assert.equal(draft.startTime, '14:00');
  assert.equal(draft.endTime, '15:30');
  assert.equal(original.startTime, undefined);
  const saved = model.serializeTalk({ ...draft, endTime: '16:45' });
  assert.equal(saved.time, '14:00-16:45');
  assert.equal(saved.affiliation, '克里特大学 · Crete University');
  assert.equal(saved.extra, 'keep');
  assert.equal(model.talkEndTime(saved), Date.parse('2025-09-09T08:45:00Z'));
  assert.equal(model.talkEndTime({ ...saved, time: '09:00-10:00' }), Date.parse('2025-09-09T08:45:00Z'));
});

test('report status uses the Beijing end time including the exact boundary, independent of visitor timezone', () => {
  assert.equal(typeof model.talkEndTime, 'function');
  const talk = { date: '2026-10-05', time: '10:00–11:00' };
  const end = Date.parse('2026-10-05T03:00:00Z');
  assert.equal(model.talkEndTime(talk), end);
  assert.equal(model.talkStatus(talk, end - 1), 'upcoming');
  assert.equal(model.talkStatus(talk, end), 'ended');
  assert.equal(model.talkStatus(talk, end + 1), 'ended');
  assert.equal(model.talkEndTime({ date: talk.date, time: '（周一）下午 2：00 至 3：30' }), Date.parse('2026-10-05T07:30:00Z'));
  assert.equal(model.talkEndTime({ date: talk.date, time: '2024年12月27日 上午 11:00-12:00' }), Date.parse('2026-10-05T04:00:00Z'));
  assert.equal(model.talkEndTime({ date: talk.date, time: '23:00–01:00' }), Date.parse('2026-10-05T17:00:00Z'));
});

test('missing or malformed time falls back to midnight after the Beijing report date', () => {
  assert.equal(typeof model.talkEndTime, 'function');
  for (const time of ['', '待定', '10:00', '10:00–25:30']) {
    const talk = { date: '2026-10-05', time };
    assert.equal(model.talkEndTime(talk), Date.parse('2026-10-05T16:00:00Z'));
    assert.equal(model.talkStatus(talk, Date.parse('2026-10-05T15:59:59Z')), 'upcoming');
    assert.equal(model.talkStatus(talk, Date.parse('2026-10-05T16:00:00Z')), 'ended');
  }
});

test('pagination combines upcoming then ended records in pages of ten without gaps or mutations', () => {
  assert.equal(typeof model.paginateTalks, 'function');
  const records = Array.from({ length: 23 }, (_, i) => ({ id: String(i), date: `2026-10-${String(i + 1).padStart(2, '0')}`, time: '10:00–11:00' }));
  const now = Date.parse('2026-10-04T05:00:00Z');
  const pages = [1, 2, 3].map(page => model.paginateTalks(records, now, page));
  assert.deepEqual(pages.map(page => page.talks.length), [10, 10, 3]);
  assert.deepEqual(pages[0].talks.map(t => t.date), records.slice(4, 14).map(t => t.date));
  assert.deepEqual(pages[2].talks.map(t => t.id), ['2', '1', '0']);
  assert.equal(new Set(pages.flatMap(page => page.talks.map(t => t.id))).size, 23);
  assert.equal(model.paginateTalks(records, now, 99).page, 3);
  assert.equal(model.paginateTalks([], now, 3).page, 1);
  assert.deepEqual(model.paginateTalks([], now).talks, []);
  assert.equal(records[0].id, '0');
});
const talks = [
  { id: 'old', date: '2024-09-01', title: 'An old talk', speaker: 'A', abstract: 'first' },
  { id: 'september', date: '2025-09-20', title: 'Probability', speaker: 'B', abstract: 'A complete abstract ending in UNIQUE-END' },
  { id: 'march', date: '2025-03-02', title: 'Dynamics', speaker: 'C', abstract: 'third' },
];

test('all records appear newest first, grouped by year without a default year limit', () => {
  assert.equal(typeof model.groupTalks, 'function', 'year grouping is implemented');
  const groups = model.groupTalks(model.filterTalks(talks, {}));
  assert.deepEqual(groups.map(g => [g.year, g.talks.map(t => t.id)]), [['2025', ['september', 'march']], ['2024', ['old']]]);
  assert.equal(talks[0].id, 'old', 'does not mutate runtime data');
});

test('month and year filters combine while full abstracts remain searchable and unchanged', () => {
  assert.equal(typeof model.filterTalks, 'function');
  assert.deepEqual(model.filterTalks(talks, { year: '2025', month: '09' }).map(t => t.id), ['september']);
  assert.equal(model.filterTalks(talks, { query: 'unique-end' })[0].abstract, talks[1].abstract);
  assert.equal(model.filterTalks(talks, { month: '09' }).length, 2);
});

test('inclusive date ranges combine with year, month and keyword filters without changing records', () => {
  assert.deepEqual(model.filterTalks(talks, { dateFrom: '2025-03-02', dateTo: '2025-09-20' }).map(t => t.id), ['september', 'march']);
  assert.deepEqual(model.filterTalks(talks, { year: '2025', month: '09', query: 'probability', dateFrom: '2025-09-20', dateTo: '2025-09-20' }).map(t => t.id), ['september']);
  assert.deepEqual(model.filterTalks(talks, { dateFrom: '2025-09-21' }), []);
  assert.deepEqual(model.filterTalks(talks, { dateTo: '2024-09-01' }).map(t => t.id), ['old']);
  assert.deepEqual(model.filterTalks(talks, { dateFrom: '2025-09-21', dateTo: '2025-03-02' }), []);
  assert.equal(talks[0].date, '2024-09-01');
});

test('schedule displays ISO dates and compact 24-hour ranges without imported date or weekday prefixes', () => {
  assert.equal(typeof model.displayTime, 'function');
  assert.equal(model.displayDate('2025-09-09'), '2025-09-09');
  assert.equal(model.displayTime('2025-09-09', '2025年9月9日（周二）上午 11:00-12:00'), '11:00-12:00');
  assert.equal(model.displayTime('2024-10-24', '2024-10-24 9:30-10:30'), '09:30-10:30');
  assert.equal(model.displayTime('2026-08-05', '10:00–11:00'), '10:00-11:00');
  assert.equal(model.displayTime('2026-08-05', '2024年12月27日 10:00–11:00'), '10:00-11:00');
  assert.equal(model.displayTime('2026-08-05', '（周三）下午 2：00 至 3：30'), '14:00-15:30');
  assert.equal(model.displayTime('2026-08-05', ''), '');
});

test('campus and room can be edited separately without losing or duplicating the original location', () => {
  assert.deepEqual(model.splitLocation('华师·国交2号楼315会议室'), { campus: '华师', venue: '国交2号楼315会议室' });
  assert.deepEqual(model.splitLocation('武大·雷军科技楼601报告厅'), { campus: '武大', venue: '雷军科技楼601报告厅' });
  assert.deepEqual(model.splitLocation('原来的报告厅'), { campus: '武大', venue: '原来的报告厅' });
  assert.equal(model.formatLocation('华师', '  6号楼二楼报告厅  '), '华师·6号楼二楼报告厅');
  assert.equal(model.formatLocation('华师', ''), '华师');
  assert.deepEqual(model.splitLocation('华师'), { campus: '华师', venue: '' });
});

test('PPT buttons require a valid allowed attachment with nonempty safe URL or owned path', () => {
  assert.equal(typeof model.visibleAttachments, 'function');
  const attachments = [
    { name: 'good.pdf', type: 'pdf', path: 'attachments/2025/good.pdf', size: 20 },
    { name: 'deck.pptx', type: 'pptx', url: 'https://example.com/deck.pptx', size: 20 },
    { name: 'empty.pdf', type: 'pdf', url: '' },
    { name: 'placeholder.pdf', type: 'pdf', url: '#' },
    { name: 'bad.pdf', type: 'pdf', url: 'javascript:alert(1)' },
    { name: 'bad.exe', type: 'exe', url: 'https://example.com/bad.exe' },
    { name: 'escape.pdf', type: 'pdf', path: 'attachments/../private.pdf' },
    { name: 'zero.pdf', type: 'pdf', path: 'attachments/zero.pdf', size: 0 },
  ];
  assert.deepEqual(model.visibleAttachments({ attachments }).map(a => a.name), ['good.pdf', 'deck.pptx']);
  assert.deepEqual(model.visibleAttachments({}), []);
});

test('viewer rejects unsafe URLs, other site relative paths, credentials and non PDF names', () => {
  assert.equal(typeof model.safePdfUrl, 'function');
  assert.equal(model.safePdfUrl('/attachments/paper.pdf', 'paper.pdf', 'https://seminar.test'), 'https://seminar.test/attachments/paper.pdf');
  assert.equal(model.safePdfUrl('https://files.test/paper.pdf', 'paper.pdf', 'https://seminar.test'), 'https://files.test/paper.pdf');
  for (const url of ['javascript:alert(1)', '//evil.test/a.pdf', '/api/admin/content', 'https://u:p@files.test/a.pdf', '/attachments/../api/x.pdf']) {
    assert.equal(model.safePdfUrl(url, 'a.pdf', 'https://seminar.test'), null, url);
  }
  assert.equal(model.safePdfUrl('/attachments/a.pptx', 'a.pptx', 'https://seminar.test'), null);
});

test('record edits preserve unknown metadata and create unique IDs without losing sibling talks', () => {
  assert.equal(typeof model.upsertTalk, 'function');
  const content = { schemaVersion: 1, site: { special: true }, extra: 9, talks: [{ ...talks[0], importedMetadata: { sourceLine: 20 } }, talks[1]] };
  const edited = model.upsertTalk(content, { ...content.talks[0], title: 'Revised' });
  assert.equal(edited.site, content.site);
  assert.equal(edited.extra, 9);
  assert.equal(edited.talks[0].importedMetadata.sourceLine, 20);
  assert.equal(edited.talks.length, 2);
  assert.equal(content.talks[0].title, 'An old talk');
  assert.match(model.newTalk().id, /^[a-zA-Z0-9_-]+$/);
  assert.notEqual(model.newTalk().id, model.newTalk().id);
});

test('upload validates allowed type and 50 MiB maximum before opening an upload session', () => {
  assert.equal(typeof model.validateUpload, 'function');
  assert.equal(model.validateUpload({ name: 'report.PDF', size: 1024 }), '');
  assert.match(model.validateUpload({ name: 'report.exe', size: 1024 }), /PDF/);
  assert.match(model.validateUpload({ name: 'report.pdf', size: 51 * 1024 * 1024 }), /50/);
  assert.notEqual(model.validateUpload({ name: 'report.pdf', size: 0 }), '');
});

test('abstract disclosure starts closed and retains every paragraph, with no empty slide actions', async () => {
  const record = await import('../src/ArchiveRecord.mjs').catch(() => ({}));
  assert.equal(typeof record.ArchiveRecord, 'function', 'full archive record renderer is implemented');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const abstract = `Opening paragraph.\n\n${'Long mathematical explanation. '.repeat(120)}FINAL-ABSTRACT-PARAGRAPH`;
  const html = renderToStaticMarkup(createElement(record.ArchiveRecord, { talk: { ...talks[1], abstract } }));
  assert.ok(html.includes('Opening paragraph.'));
  assert.ok(html.includes('FINAL-ABSTRACT-PARAGRAPH'));
  assert.equal((html.match(/Long mathematical explanation\./g) || []).length, 120);
  assert.match(html, /<button[^>]*class="abstract-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="abstract-[^"]+"/);
  assert.ok(html.includes('点击展开'));
  assert.match(html, /class="abstract-text"[^>]*hidden=""/);
  assert.ok(!html.includes('attachment-link'));
  const unsafe = renderToStaticMarkup(createElement(record.ArchiveRecord, { talk: { ...talks[1], abstract: '<script>alert(1)</script>' } }));
  assert.ok(!unsafe.includes('<script>'));
});

test('public records follow title, speaker with bold affiliation, full date and abstract order without source notices', async () => {
  const { ArchiveRecord } = await import('../src/ArchiveRecord.mjs');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const html = renderToStaticMarkup(createElement(ArchiveRecord, { talk: {
    ...talks[1], speaker: 'Original Speaker', affiliation: 'Original Institute',
    time: '10:00–11:00', location: 'Lecture Hall 601',
    notes: '来源日期存在差异；此处保留讨论班目录日期。详见原始来源。',
    sourceUrls: ['https://example.com/original'],
  } }));
  assert.ok(html.indexOf('talk-title') < html.indexOf('Original Speaker'));
  assert.match(html, /（<strong[^>]*>Original Institute<\/strong>）/);
  assert.ok(html.indexOf('Original Institute') < html.indexOf('2025-09-20'));
  assert.ok(html.indexOf('Lecture Hall 601') < html.indexOf('abstract-toggle'));
  assert.ok(!html.includes('来源日期存在差异'));
  assert.ok(!html.includes('原始记录'));
  assert.match(html, /<h3[^>]*>[\s\S]*?<a[^>]*href="https:\/\/example.com\/original"[^>]*>[\s\S]*?<\/a><\/h3>/);
});

test('report cards use the first safe meeting URL and leave unlinked records without placeholder links', async () => {
  const { ArchiveRecord } = await import('../src/ArchiveRecord.mjs');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const render = sourceUrls => renderToStaticMarkup(createElement(ArchiveRecord, { talk: { ...talks[1], sourceUrls } }));
  const linked = render(['javascript:alert(1)', 'https://example.com/meeting', 'https://example.com/reference']);
  assert.match(linked, /class="talk-title-link"[^>]*href="https:\/\/example.com\/meeting"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.ok(!linked.includes('https://example.com/reference'));
  for (const urls of [[], ['#'], ['javascript:alert(1)']]) assert.ok(!render(urls).includes('class="talk-title-link"'));
});

test('uploads every byte in declared chunks and exposes an attachment only after completion', async () => {
  const upload = await import('../src/upload.mjs').catch(() => ({}));
  assert.equal(typeof upload.uploadFile, 'function', 'chunk uploader is implemented');
  const bytes = new Uint8Array(11).map((_, i) => i);
  const file = new File([bytes], 'deck.pdf');
  const received = [];
  const progress = [];
  const result = await upload.uploadFile(file, { request: async (path, options) => {
    if (path === '/admin/uploads') return { id: 'sample', chunkSize: 4 };
    if (path.endsWith('/complete')) { assert.deepEqual(received, [...bytes]); return { attachment: { id: 'file', name: 'deck.pdf' } }; }
    received.push(...new Uint8Array(await options.body.arrayBuffer()));
    return { ok: true };
  }, onProgress: state => progress.push(state) });
  assert.equal(result.id, 'file');
  assert.equal(progress.at(-1).phase, 'complete');
  assert.equal(progress.at(-1).loaded, file.size);
});

test('failed upload cleans staging and never returns an incomplete attachment', async () => {
  const upload = await import('../src/upload.mjs').catch(() => ({}));
  assert.equal(typeof upload.uploadFile, 'function');
  let cleaned = false;
  await assert.rejects(upload.uploadFile(new File(['12345'], 'deck.pdf'), { request: async (path, options) => {
    if (path === '/admin/uploads') return { id: 'sample', chunkSize: 4 };
    if (options.method === 'DELETE') { cleaned = true; return {}; }
    throw new Error('connection lost');
  } }), /connection lost/);
  assert.equal(cleaned, true);
});
