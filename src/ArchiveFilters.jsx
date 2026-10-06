import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function ArchiveFilters({ years, year, month, query, onYearChange, onMonthChange, onQueryChange }) {
  const anchor = useRef(null);
  const toggle = useRef(null);
  const panel = useRef(null);
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const open = !pinned || expanded;

  useLayoutEffect(() => {
    const measure = () => {
      const height = panel.current.getBoundingClientRect().height;
      if (height > 0) setPanelHeight(height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Observe the original position, which stays independent of the panel's height.
    let observer;
    const observe = () => {
      observer?.disconnect();
      const top = getComputedStyle(anchor.current).getPropertyValue('--filter-top').trim();
      observer = new IntersectionObserver(([entry]) => {
        const pastAnchor = entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? parseFloat(top));
        setPinned(pastAnchor);
        if (!pastAnchor) setExpanded(false);
      }, { rootMargin: `-${top} 0px 0px 0px` });
      observer.observe(anchor.current);
    };
    observe();
    window.addEventListener('resize', observe);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', observe);
    };
  }, []);

  const closeOnEscape = event => {
    if (event.key === 'Escape' && pinned && expanded) {
      event.preventDefault();
      setExpanded(false);
      toggle.current?.focus();
    }
  };

  return <>
    <div ref={anchor} className="filter-anchor" aria-hidden="true"/>
    <div className={`floating-filters${pinned ? ' is-pinned' : ''}`} style={{ minHeight: panelHeight || undefined }} onKeyDown={closeOnEscape}>
      {pinned && <button ref={toggle} type="button" className="filter-toggle" aria-expanded={open} aria-controls="archive-filters" onClick={() => setExpanded(value => !value)}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/><path d="M7 3v4M13 8v4M7 13v4"/></svg>
        筛选<span className="filter-chevron" aria-hidden="true"/>
      </button>}
      <div ref={panel} id="archive-filters" className="filter-panel" role="search" aria-label="筛选报告" hidden={!open}>
        <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索讲座、报告人或摘要" placeholder="搜索讲座、报告人、摘要…" value={query} onChange={event => onQueryChange(event.target.value)}/></label>
        <div className="date-filters">
          <label className="date-filter"><span>年份</span><select aria-label="按年份筛选" value={year} onChange={event => onYearChange(event.target.value)}><option value="">全部年份</option>{years.map(group => <option key={group.year} value={group.year}>{group.year} 年</option>)}</select></label>
          <label className="date-filter"><span>月份</span><select aria-label="按月份筛选" value={month} onChange={event => onMonthChange(event.target.value)}><option value="">全部月份</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{i + 1} 月</option>)}</select></label>
        </div>
      </div>
    </div>
  </>;
}
