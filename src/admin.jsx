import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.mjs';
import { displayAffiliation, editableTalk, filterTalks, formatSize, formatLocation, groupTalks, newTalk, safeHttpUrl, serializeTalk, splitLocation, upsertTalk, validateUpload } from './archive-model.mjs';
import { uploadFile } from './upload.mjs';
import { reportAttachmentName } from '../shared/attachment-name.mjs';
import { defaultEndTime, timeRangeError } from '../shared/report-time.mjs';
import { MathText } from './ArchiveRecord.mjs';
import { PasswordDialog } from './PasswordDialog.jsx';
import { TimeSelect } from './TimeSelect.jsx';
import { FractalArtwork } from './FractalArtwork.jsx';
import { MetadataIcon } from './MetadataIcon.mjs';
import 'katex/dist/katex.min.css';
import './styles.css';
import './metadata-icons.css';
import './admin.css';

function Admin() {
  const [session, setSession] = useState(null);
  const [content, setContent] = useState(null);
  const [revision, setRevision] = useState('');
  const [draft, setDraft] = useState(null);
  const [original, setOriginal] = useState('');
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const uploadController = useRef(null);
  const operationLock = useRef(false);
  const dirty = !!draft && JSON.stringify(draft) !== original;
  const draftTimeError = draft ? timeRangeError(draft.startTime, draft.endTime) : '';
  const draftLocation = splitLocation(draft?.location || '');
  const years = useMemo(() => groupTalks(content?.talks || []), [content]);
  const records = useMemo(() => filterTalks(content?.talks || [], { query, year, month, dateFrom, dateTo }), [content, query, year, month, dateFrom, dateTo]);
  const hasFilters = query || year || month || dateFrom || dateTo;
  const invalidDateRange = dateFrom && dateTo && dateFrom > dateTo;
  function clearFilters() { setQuery(''); setYear(''); setMonth(''); setDateFrom(''); setDateTo(''); }

  async function loadContent() {
    const result = await api('/admin/content');
    setContent(result.content); setRevision(result.revision);
    return result;
  }
  useEffect(() => {
    api('/session').then(async result => {
      setSession(result);
      if (result.authenticated) await loadContent();
    }).catch(err => { setError(err.message); setSession({ authenticated: false }); });
    return () => uploadController.current?.abort();
  }, []);
  useEffect(() => {
    const beforeUnload = event => { if (dirty || busy === 'upload') { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, busy]);
  function clearFeedback() { setError(''); setConflict(false); setMessage(''); }
  function select(record) {
    if (busy) return;
    if (dirty && !window.confirm('当前报告有未保存的修改。离开会丢弃这些修改，是否继续？')) return;
    const next = editableTalk(record);
    setDraft(next); setOriginal(JSON.stringify(next)); clearFeedback(); setProgress(null);
  }
  function createRecord() {
    if (dirty && !window.confirm('当前报告有未保存的修改。新建报告会丢弃这些修改，是否继续？')) return;
    setDraft(newTalk()); setOriginal(''); clearFeedback(); setProgress(null);
  }
  function field(name, value) { setDraft(current => ({ ...current, [name]: value })); setMessage(''); }
  function changeTime(name, value) {
    setDraft(current => {
      const next = { ...current, [name]: value };
      if (name === 'startTime') next.endTime = defaultEndTime(value);
      return { ...next, time: next.startTime && next.endTime ? `${next.startTime}-${next.endTime}` : '' };
    });
    setMessage('');
  }
  function openPasswordDialog() {
    if (busy || operationLock.current) return;
    if (dirty) { setError('请先保存当前报告，再修改密码。'); return; }
    clearFeedback(); setPasswordOpen(true);
  }
  function returnToLogin(notice) {
    setPasswordOpen(false); setSession(current => ({ ...current, authenticated: false }));
    setContent(null); setRevision(''); setDraft(null); setOriginal(''); setPassword('');
    setProgress(null); clearFeedback(); setMessage(notice);
  }
  async function login(event) {
    event.preventDefault();
    if (operationLock.current) return;
    operationLock.current = true; setBusy('login'); clearFeedback();
    try { await api('/login', { method: 'POST', data: { password } }); setPassword(''); setSession(await api('/session')); await loadContent(); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); operationLock.current = false; }
  }
  async function save(event) {
    event.preventDefault();
    if (operationLock.current || busy || !draft || !content) return;
    const timeError = timeRangeError(draft.startTime, draft.endTime);
    if (timeError) { setError(timeError); return; }
    const badSource = (draft.sourceUrls || []).find(url => !safeHttpUrl(url));
    if (badSource) { setError('来源链接须以 http:// 或 https:// 开头，且不能包含用户名或密码。'); return; }
    operationLock.current = true; setBusy('save'); clearFeedback();
    try {
      const result = await api('/admin/content', { method: 'PUT', data: { content: upsertTalk(content, serializeTalk(draft)), revision } });
      setContent(result.content); setRevision(result.revision);
      const saved = result.content.talks.find(talk => talk.id === draft.id);
      setDraft(structuredClone(saved)); setOriginal(JSON.stringify(saved)); setMessage('已保存。公开页面刷新后即可读取更新。');
    } catch (err) { setError(err.message); setConflict(err.status === 409); }
    finally { setBusy(''); operationLock.current = false; }
  }
  async function deleteRecord() {
    if (operationLock.current || busy) return;
    operationLock.current = true; setBusy('delete'); clearFeedback();
    try {
      const result = await api('/admin/content', { method: 'PUT', data: { content: { ...content, talks: content.talks.filter(talk => talk.id !== draft.id) }, revision } });
      setContent(result.content); setRevision(result.revision); setDraft(null); setOriginal(''); setDeleteOpen(false); setMessage('报告记录已删除。');
    } catch (err) { setError(err.message); setConflict(err.status === 409); setDeleteOpen(false); }
    finally { setBusy(''); operationLock.current = false; }
  }
  async function upload(event) {
    const file = event.target.files[0]; event.target.value = '';
    if (!file || operationLock.current || busy) return;
    const validation = validateUpload(file);
    if (validation) { setError(validation); return; }
    try { reportAttachmentName(draft, file.name, 'preview'); }
    catch (err) { setError(err.message); return; }
    operationLock.current = true; setBusy('upload'); clearFeedback(); setUploadName(file.name);
    const controller = new AbortController(); uploadController.current = controller;
    try {
      const attachment = await uploadFile(file, { talk: draft, signal: controller.signal, onProgress: state => { setProgress(state); if (state.name) setUploadName(state.name); } });
      setDraft(current => ({ ...current, attachments: [...(current.attachments || []), attachment] }));
      setMessage('文件已上传并通过校验。请保存报告以发布此附件。');
    } catch (err) { setError(err.name === 'AbortError' ? '上传已取消，报告内容已保留。' : err.message); setProgress(null); }
    finally { setBusy(''); operationLock.current = false; uploadController.current = null; }
  }
  async function reload() {
    if (dirty && !window.confirm('重新读取将丢弃当前未保存的修改。可先下载草稿留存。是否继续？')) return;
    setBusy('reload');
    try { await loadContent(); setDraft(null); setOriginal(''); clearFeedback(); setMessage('已读取最新版本。'); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  function downloadDraft() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = href; link.download = `${draft.id}-draft.json`; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return <div className="admin-page"><header className="admin-header"><div className="admin-header-inner">
    <a className="admin-brand" href="/" aria-label="讨论班主页">
      <img src="/icons/artwork.svg" width="64" height="64" alt="a · p 讨论班 logo"/>
    </a>
    <nav className="admin-header-actions" aria-label="后台导航">
      {session?.authenticated && <button className="primary-button" disabled={!!busy} onClick={createRecord}>新建报告</button>}
      {session?.authenticated && <button className="outline-button" disabled={!!busy} onClick={openPasswordDialog}>修改密码</button>}
      <a className="outline-button" href="/">返回主页</a>
    </nav>
  </div></header>
    {!session ? <div className="empty-state" role="status">正在检查登录状态…</div> : session.mode === 'preview' ? <main className="login-shell"><div className="section-kicker">SEMINAR PREVIEW</div><h1>在线预览</h1><p>可以浏览报告、筛选年份和月份，并在线阅读 PDF。</p><p>当前预览尚未启用后台编辑与附件上传。</p><a className="text-link" href="/">← 返回讲座档案</a></main> : !session.authenticated ? <main className="login-shell">{message && <div className="notice success" role="status">{message}</div>}<form className="login-form" onSubmit={login}><label>管理员密码<input autoComplete="current-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoFocus/></label>{error && <div className="notice error" role="alert">{error}</div>}<button className="primary-button" disabled={!!busy}>{busy === 'login' ? '正在登录…' : '登录管理后台 →'}</button></form><a className="text-link" href="/">← 返回讲座档案</a></main> : <main className="admin-workspace">
      <div className="admin-toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索已有报告" placeholder="查找报告或报告人" value={query} onChange={e => setQuery(e.target.value)}/></label><button type="button" className="outline-button admin-filter-toggle" aria-expanded={filtersOpen} aria-controls="admin-filters" onClick={() => setFiltersOpen(current => !current)}>年份 / 月份 / 日期<span className="filter-chevron" aria-hidden="true"/></button><div className={`admin-filters ${filtersOpen ? 'is-open' : ''}`} id="admin-filters" role="group" aria-label="筛选报告列表">
          <div className="admin-filter-row">
            <label>年份<select aria-label="后台按年份筛选" value={year} onChange={e => setYear(e.target.value)}><option value="">全部年份</option>{years.map(group => <option key={group.year} value={group.year}>{group.year} 年</option>)}</select></label>
            <label>月份<select aria-label="后台按月份筛选" value={month} onChange={e => setMonth(e.target.value)}><option value="">全部月份</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{i + 1} 月</option>)}</select></label>
          </div>
          <div className="admin-filter-row">
            <label>开始日期<input type="date" aria-label="筛选开始日期" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)}/></label>
            <label>结束日期<input type="date" aria-label="筛选结束日期" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)}/></label>
          </div>
        </div><div className="admin-list-caption"><span>{records.length} 条记录</span>{hasFilters && <button className="text-button clear-admin-filters" onClick={clearFilters}>清除筛选</button>}<button className="text-button" disabled={!!busy} onClick={reload}>刷新资料 ↻</button></div>
        {invalidDateRange && <p className="admin-filter-error" role="status">结束日期不能早于开始日期。</p>}
      </div>
      <div className="admin-grid"><aside className="admin-list-panel"><p className="admin-list-instruction">点击编辑</p><div className="admin-record-list">{records.map(record => <button className={`admin-record ${draft?.id === record.id ? 'selected' : ''}`} key={record.id} onClick={() => select(record)} disabled={!!busy}><time><MetadataIcon type="calendar"/>{record.date}</time><strong><MathText text={record.title} autoMath/></strong><span className="admin-record-person"><MetadataIcon type="person"/><span>{record.speaker}{displayAffiliation(record) ? ` · ${displayAffiliation(record)}` : ''}</span></span></button>)}{content && !records.length && <p className="list-empty">没有匹配的报告。</p>}</div></aside>
        <section className="admin-editor" aria-label="报告编辑器">
          {error && <div className="notice error" role="alert"><strong>{conflict ? '保存冲突：资料已被更新' : '操作未完成'}</strong><p>{error}</p>{conflict && <><p>你的修改仍完整保留。可下载当前草稿，重新读取最新资料后再应用修改。</p><div className="button-row"><button className="outline-button" onClick={downloadDraft} disabled={!draft}>下载当前草稿</button><button className="outline-button" onClick={reload} disabled={!!busy}>重新读取资料</button></div></>}</div>}
          {message && <div className="notice success" role="status">{message}</div>}
          {!content ? <div className="empty-state"><p>尚未读取资料。</p><button className="outline-button" disabled={!!busy} onClick={reload}>读取资料</button></div> : !draft ? <div className="editor-empty"><FractalArtwork/><button className="outline-button" type="button" disabled={!!busy} onClick={createRecord}>新建报告</button></div> : <form onSubmit={save}>
            <div className="editor-title-row"><h2>{content.talks.some(talk => talk.id === draft.id) ? '编辑报告' : '新建报告'}</h2><span className={`save-state ${dirty ? 'unsaved' : ''}`}>{busy === 'save' ? '保存中…' : dirty ? '● 有未保存的修改' : '✓ 已保存'}</span></div>
            <fieldset disabled={!!busy} className="editor-fields">
              <label className="full-field">报告标题 <span>*</span><input required value={draft.title} onChange={e => field('title', e.target.value)} placeholder="完整报告标题，支持 TeX 公式"/></label>
              <div className="field-grid report-meta-grid">
                <label><span className="field-label"><MetadataIcon type="person"/>报告人<span className="field-required" aria-hidden="true">*</span></span><input required value={draft.speaker} onChange={e => field('speaker', e.target.value)}/></label>
                <label className="institution-field"><span className="field-label">单位<span className="field-optional">（选填）</span></span><input aria-label="单位" value={draft.affiliation || ''} onChange={e => field('affiliation', e.target.value)} placeholder="例如 克里特大学/Crete University"/></label>
                <label><span className="field-label"><MetadataIcon type="calendar"/>日期<span className="field-required" aria-hidden="true">*</span></span><input type="date" required value={draft.date} onChange={e => field('date', e.target.value)}/></label>
                <TimeSelect label="开始时间" value={draft.startTime || ''} onChange={value => changeTime('startTime', value)}/>
                <TimeSelect label="结束时间" value={draft.endTime || ''} onChange={value => changeTime('endTime', value)}/>
              </div>
              <p className="time-picker-hint">均为北京时间，结束时间默认加一小时，可单独调整。{draft.startTime && !defaultEndTime(draft.startTime) ? '开始时间接近午夜，请选择当天的结束时间。' : ''}</p>
              {draftTimeError && <p className="time-picker-error" role="alert">{draftTimeError}</p>}
              <div className="location-fields">
                <label><span className="field-label"><MetadataIcon type="location"/>举办学校</span><select value={draftLocation.campus} onChange={e => field('location', formatLocation(e.target.value, draftLocation.venue))}><option value="武大">武大</option><option value="华师">华师</option></select></label>
                <label><span className="field-label"><MetadataIcon type="location"/>具体地点</span><input value={draftLocation.venue} onChange={e => field('location', `${draftLocation.campus}·${e.target.value}`)} onBlur={e => field('location', formatLocation(draftLocation.campus, e.target.value))} placeholder="例如 雷军科技楼601报告厅"/></label>
              </div>
              <label>完整摘要<textarea className="abstract-editor" rows={6} value={draft.abstract || ''} onChange={e => field('abstract', e.target.value)} placeholder="粘贴完整摘要。保留段落换行，支持 $…$ 和 $$…$$ 公式。"/><small>前台点击“摘要”可展开全文，保留段落换行。</small></label>
            </fieldset>
            <div className="editor-resources">
              <fieldset disabled={!!busy} className="editor-fields resource-link"><label>链接<input type="url" aria-label="链接" aria-describedby="resource-link-hint" value={draft.sourceUrls?.[0] || ''} onChange={e => field('sourceUrls', e.target.value ? [e.target.value] : [])} placeholder="https://…"/></label></fieldset>
              <section className="attachment-editor">
                <div className="attachment-heading"><h3>附件上传</h3><label className={`outline-button upload-button ${busy ? 'disabled' : ''}`}><span>＋ 上传文件</span><input type="file" accept=".pdf,.ppt,.pptx" onChange={upload} disabled={!!busy} aria-label="附件上传"/></label></div>
              </section>
              <p className="field-hint resource-link-hint" id="resource-link-hint">点击报告标题时打开此链接。</p>
              <p className="field-hint attachment-hint">PDF / PPT / PPTX · 每份最大 50 MiB</p>
            </div>
            <div className="attachment-feedback">
              {!!draft.attachments?.length && <ul className="attachment-list">{draft.attachments.map((attachment, index) => <li key={attachment.id || index}><span className="file-type">{attachment.type?.toUpperCase()}</span><div><strong>{attachment.name}</strong><small>{formatSize(attachment.size)}</small></div><button type="button" className="text-button danger" aria-label={`移除附件 ${attachment.name}`} disabled={!!busy} onClick={() => field('attachments', draft.attachments.filter((_, i) => i !== index))}>移除</button></li>)}</ul>}
              {progress && <div className="upload-progress" role="status"><div><strong>{uploadName}</strong><span>{progress.phase === 'complete' ? '上传完成 · 待保存报告' : progress.phase === 'finalizing' ? '正在校验并保存文件…' : progress.phase === 'starting' ? '准备上传…' : `${Math.floor(progress.loaded / progress.total * 100)}%`}</span></div><progress max={progress.total} value={progress.loaded}/><div><small>{formatSize(progress.loaded)} / {formatSize(progress.total)}</small>{busy === 'upload' && progress.phase !== 'finalizing' && <button className="text-button danger" type="button" onClick={() => uploadController.current?.abort()}>取消上传</button>}</div></div>}
            </div><div className="editor-savebar"><div>{content.talks.some(talk => talk.id === draft.id) && <button className="text-button danger" type="button" disabled={!!busy} onClick={() => setDeleteOpen(true)}>删除报告</button>}</div><div className="button-row"><button className="outline-button" type="button" disabled={!!busy} onClick={downloadDraft}>下载草稿</button><button className="primary-button" type="submit" disabled={!!busy || !dirty || !!draftTimeError}>{busy === 'save' ? '正在保存…' : '保存报告'}</button></div></div>
          </form>}
        </section>
      </div>
    </main>}
    {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} onChanged={() => returnToLogin('密码已修改，请使用新密码重新登录。')} onSessionExpired={() => returnToLogin('登录状态已失效，请使用当前密码重新登录。')}/>}
    {deleteOpen && <div className="dialog-backdrop"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">删除这场报告？</h2><p>「{draft?.title}」将从公开档案中移除。已上传的文件不会被删除。</p><div className="button-row"><button className="outline-button" disabled={!!busy} onClick={() => setDeleteOpen(false)} autoFocus>取消</button><button className="danger-button" disabled={!!busy} onClick={deleteRecord}>{busy === 'delete' ? '删除中…' : '确认删除'}</button></div></section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<Admin/>);
