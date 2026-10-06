import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.mjs';
import { filterTalks, groupTalks, paginateTalks, talkEndTime, talkStatus } from './archive-model.mjs';
import { ArchiveRecord } from './ArchiveRecord.mjs';
import { SeminarIntro } from './SeminarIntro.jsx';
import 'katex/dist/katex.min.css';
import './styles.css';
import './metadata-icons.css';
import './archive.css';

const EMPTY_TALKS = [];

function Archive() {
  const [campusBackground] = useState(() => Math.random() < 0.5 ? '/images/whu-enhanced.png' : '/images/ccnu-autumn-enhanced.png');
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const request = useRef(null);
  async function refresh() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError('');
    try {
      const result = await api('/content', { signal: controller.signal });
      if (!result.content || !Array.isArray(result.content.talks)) throw new Error('返回的讲座资料格式不正确。');
      setContent(result.content);
    } catch (err) { if (err.name !== 'AbortError') setError(err.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { refresh(); return () => request.current?.abort(); }, []);
  const talks = content?.talks || EMPTY_TALKS;
  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    const nextEnd = Math.min(...talks.map(talkEndTime).filter(end => end > now));
    const timer = window.setTimeout(updateClock, Math.min(60_000, Math.max(1, nextEnd - Date.now())));
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', updateClock);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', updateClock);
      document.removeEventListener('visibilitychange', updateClock);
    };
  }, [talks, now]);
  const years = useMemo(() => groupTalks(filterTalks(talks)), [talks]);
  const filtered = useMemo(() => filterTalks(talks, { year, month, query }), [talks, year, month, query]);
  const pagination = useMemo(() => paginateTalks(filtered, now, page), [filtered, now, page]);
  const sections = useMemo(() => ['upcoming', 'ended'].map(status => {
    const groups = groupTalks(pagination.talks.filter(talk => talkStatus(talk, now) === status));
    return { status, label: status === 'upcoming' ? '即将举行' : '已结束', groups: status === 'upcoming' ? groups.reverse() : groups };
  }).filter(section => section.groups.length), [pagination, now]);
  const reset = () => { setYear(''); setMonth(''); setQuery(''); setPage(1); };
  const changePage = next => {
    setPage(next);
    document.getElementById('archive')?.scrollIntoView({ block: 'start' });
  };
  const site = content?.site;

  return <div className="public-page" style={{ '--campus-background': `url("${campusBackground}")` }}>
    <a className="skip-link" href="#archive">跳转至讲座档案</a>
    <main>
      <SeminarIntro site={site}/>
      <section className="archive-layout page-width" id="archive" aria-label="讲座档案">
        <div className="archive-main">
          <div className="floating-filters" role="search" aria-label="筛选报告">
            <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索讲座、报告人或摘要" placeholder="搜索讲座、报告人、摘要…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/></label>
            <div className="date-filters">
              <label className="date-filter"><span>年份</span><select aria-label="按年份筛选" value={year} onChange={e => { setYear(e.target.value); setPage(1); }}><option value="">全部年份</option>{years.map(group => <option key={group.year} value={group.year}>{group.year} 年</option>)}</select></label>
              <label className="date-filter"><span>月份</span><select aria-label="按月份筛选" value={month} onChange={e => { setMonth(e.target.value); setPage(1); }}><option value="">全部月份</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{i + 1} 月</option>)}</select></label>
            </div>
          </div>
          <div className="results-meta" aria-live="polite"><span>{year || '全部年份'}{month ? ` · ${Number(month)} 月` : ''} <span className="results-separator">/</span> 共 {filtered.length} 场报告</span>{(year || month || query) && <button className="text-button" onClick={reset}>清除筛选 ×</button>}</div>
          {error && <div className="notice error" role="alert"><strong>暂时无法读取最新档案</strong><p>{error}{content ? ' 当前页面仍显示上一次成功读取的内容。' : ''}</p><button onClick={refresh}>重新读取</button></div>}
          {loading && !content && <div className="empty-state" role="status"><span className="loading-line"/>正在读取讨论班档案…</div>}
          {!loading && content && !filtered.length && <div className="empty-state"><h3>没有找到符合条件的报告</h3><p>尝试其他关键词，或查看全部年份。</p><button className="outline-button" onClick={reset}>查看全部报告</button></div>}
          {sections.map(section => <section className={`status-section status-${section.status}`} key={section.status} aria-labelledby={`status-${section.status}`}>
            <div className="status-divider"><h2 id={`status-${section.status}`}>{section.label}</h2><span aria-hidden="true"/><small>北京时间</small></div>
            {section.groups.map(group => <section className="year-group" key={group.year} aria-labelledby={`year-${section.status}-${group.year}`}><div className="year-heading"><h3 id={`year-${section.status}-${group.year}`}>{group.year}</h3><span>{group.talks.length} 场报告</span></div>{group.talks.map(talk => <ArchiveRecord talk={talk} key={talk.id}/>)}</section>)}
          </section>)}
          {pagination.pages > 1 && <nav className="archive-pagination" aria-label="报告分页">
            <button type="button" disabled={pagination.page === 1} onClick={() => changePage(pagination.page - 1)}>上一页</button>
            <label>第 <select aria-label="选择报告页码" value={pagination.page} onChange={e => changePage(Number(e.target.value))}>{Array.from({ length: pagination.pages }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select> / {pagination.pages} 页</label>
            <button type="button" disabled={pagination.page === pagination.pages} onClick={() => changePage(pagination.page + 1)}>下一页</button>
          </nav>}
        </div>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<Archive/>);
