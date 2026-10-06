import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.mjs';
import { filterTalks, groupTalks, groupTalksByMonth, sortArchiveTalks, talkEndTime, talkStatus } from './archive-model.mjs';
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
  const sorted = useMemo(() => sortArchiveTalks(filtered, now), [filtered, now]);
  const sections = useMemo(() => ['upcoming', 'ended'].map(status => {
    const groups = groupTalksByMonth(sorted.filter(talk => talkStatus(talk, now) === status));
    return { status, label: status === 'upcoming' ? '即将举行 (forthcoming)：' : '已经举行 (past)：', groups: status === 'upcoming' ? groups.reverse() : groups };
  }).filter(section => section.groups.length), [sorted, now]);
  const reset = () => { setYear(''); setMonth(''); setQuery(''); };
  const site = content?.site;

  return <div className="public-page" style={{ '--campus-background': `url("${campusBackground}")` }}>
    <a className="skip-link" href="#archive">跳转至讲座档案</a>
    <main>
      <SeminarIntro site={site}/>
      <section className="archive-layout page-width" id="archive" aria-label="讲座档案">
        <div className="archive-main">
          <div className="floating-filters" role="search" aria-label="筛选报告">
            <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索讲座、报告人或摘要" placeholder="搜索讲座、报告人、摘要…" value={query} onChange={e => setQuery(e.target.value)}/></label>
            <div className="date-filters">
              <label className="date-filter"><span>年份</span><select aria-label="按年份筛选" value={year} onChange={e => setYear(e.target.value)}><option value="">全部年份</option>{years.map(group => <option key={group.year} value={group.year}>{group.year} 年</option>)}</select></label>
              <label className="date-filter"><span>月份</span><select aria-label="按月份筛选" value={month} onChange={e => setMonth(e.target.value)}><option value="">全部月份</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{i + 1} 月</option>)}</select></label>
            </div>
          </div>
          <div className="results-meta" aria-live="polite"><span>{year || '全部年份'}{month ? ` · ${Number(month)} 月` : ''} <span className="results-separator">/</span> 共 {filtered.length} 场报告</span>{(year || month || query) && <button className="text-button" onClick={reset}>清除筛选 ×</button>}</div>
          {error && <div className="notice error" role="alert"><strong>暂时无法读取最新档案</strong><p>{error}{content ? ' 当前页面仍显示上一次成功读取的内容。' : ''}</p><button onClick={refresh}>重新读取</button></div>}
          {loading && !content && <div className="empty-state" role="status"><span className="loading-line"/>正在读取讨论班档案…</div>}
          {!loading && content && !filtered.length && <div className="empty-state"><h3>没有找到符合条件的报告</h3><p>尝试其他关键词，或查看全部年份。</p><button className="outline-button" onClick={reset}>查看全部报告</button></div>}
          {sections.map(section => <section className={`status-section status-${section.status}`} key={section.status} aria-labelledby={`status-${section.status}`}>
            <div className="status-divider"><h2 id={`status-${section.status}`}><em>{section.label}</em></h2><span aria-hidden="true"/><small>北京时间</small></div>
            {section.groups.map(group => <section className="year-group month-group" key={group.month} aria-labelledby={`month-${section.status}-${group.month}`}><div className="year-heading month-heading"><h3 id={`month-${section.status}-${group.month}`}>{group.month}</h3><span>{group.talks.length} 场报告</span></div>{group.talks.map(talk => <ArchiveRecord talk={talk} key={talk.id}/>)}</section>)}
          </section>)}
        </div>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<Archive/>);
