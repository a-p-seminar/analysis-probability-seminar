import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { safePdfUrl } from './archive-model.mjs';
import './viewer.css';

GlobalWorkerOptions.workerSrc = workerUrl;

function PdfPage({ pdf, number, scale, defaultDimensions, thumbnail = false, onError }) {
  const wrapper = useRef(null);
  const canvas = useRef(null);
  const layer = useRef(null);
  const [near, setNear] = useState(number === 1);
  const [dimensions, setDimensions] = useState(defaultDimensions);
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) setNear(true); }); }, { rootMargin: thumbnail ? '200px' : '700px' });
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    let canceled = false, renderTask, textLayer;
    setRendered(false);
    async function render() {
      try {
        const page = await pdf.getPage(number);
        if (canceled) return;
        const base = page.getViewport({ scale: 1 });
        setDimensions({ width: base.width, height: base.height });
        const renderScale = thumbnail ? 110 / base.width : scale;
        const viewport = page.getViewport({ scale: renderScale });
        const ratio = thumbnail ? 1 : Math.min(window.devicePixelRatio || 1, 2);
        canvas.current.width = Math.floor(viewport.width * ratio); canvas.current.height = Math.floor(viewport.height * ratio);
        canvas.current.style.width = `${viewport.width}px`; canvas.current.style.height = `${viewport.height}px`;
        renderTask = page.render({ canvasContext: canvas.current.getContext('2d'), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
        await renderTask.promise;
        if (canceled) return;
        if (!thumbnail && layer.current) {
          layer.current.replaceChildren();
          layer.current.style.setProperty('--scale-factor', renderScale);
          layer.current.style.setProperty('--total-scale-factor', renderScale);
          textLayer = new TextLayer({ textContentSource: await page.getTextContent(), container: layer.current, viewport });
          await textLayer.render();
        }
        if (!canceled) setRendered(true);
      } catch (err) { if (!canceled && err.name !== 'RenderingCancelledException' && err.name !== 'AbortException') onError(`第 ${number} 页无法呈现：${err.message}`); }
    }
    render();
    return () => { canceled = true; renderTask?.cancel(); textLayer?.cancel(); };
  }, [pdf, number, scale, thumbnail, near]);
  const renderScale = thumbnail ? 110 / dimensions.width : scale;
  return <div ref={wrapper} id={thumbnail ? undefined : `page-${number}`} className={thumbnail ? 'thumbnail-canvas' : 'pdf-page'} style={{ width: dimensions.width * renderScale, height: dimensions.height * renderScale, overflow: 'hidden' }} aria-label={`第 ${number} 页`}>
    <canvas ref={canvas} aria-label={`PDF 第 ${number} 页`} role="img"/>{!thumbnail && <div className="textLayer" ref={layer}/>}{!rendered && <span className="page-loading">{thumbnail ? number : `正在绘制第 ${number} 页…`}</span>}
  </div>;
}

function Viewer() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('name') || '讲义.pdf';
  const file = safePdfUrl(params.get('file') || '', name, window.location.origin);
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState(file ? '' : '无效的 PDF 地址。请从讲座档案中的讲义入口打开文件。');
  const [loading, setLoading] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState('width');
  const [sidebar, setSidebar] = useState(window.innerWidth > 700);
  const [pageDimensions, setPageDimensions] = useState({ width: 595, height: 842 });
  const [action, setAction] = useState('');
  const scroller = useRef(null);
  const printArea = useRef(null);
  const fileBlobUrl = useRef(null);
  const currentPage = useRef(1);
  const currentScale = useRef(1);
  const scaleAnchor = useRef(null);
  const scrollFrame = useRef(null);
  const updatePage = useCallback(number => {
    currentPage.current = number;
    setPage(number); setPageInput(String(number));
  }, []);
  const changeScale = useCallback(value => {
    const next = Math.max(0.25, Math.min(3, value));
    if (Math.abs(next - currentScale.current) < 0.0001) return;
    const container = scroller.current;
    const element = document.getElementById(`page-${currentPage.current}`);
    const padding = container ? parseFloat(getComputedStyle(container).paddingTop) : 0;
    // Keep the same location within the logical page, independent of pixel zoom.
    scaleAnchor.current = { number: currentPage.current, offset: container && element ? Math.max(0, container.scrollTop + padding - element.offsetTop) / currentScale.current : 0 };
    currentScale.current = next;
    setScale(next);
  }, []);
  useEffect(() => {
    if (!file) return;
    document.title = `${name} · 讲义阅读器`;
    const task = getDocument({ url: file, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', isEvalSupported: false, enableXfa: false });
    task.onProgress = progress => setLoading(progress.total ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : 0);
    task.promise.then(async document => { const first = await document.getPage(1); const dimensions = first.getViewport({ scale: 1 }); setPageDimensions({ width: dimensions.width, height: dimensions.height }); setPdf(document); }).catch(err => setError(err.name === 'PasswordException' ? '这份 PDF 需要密码。请下载文件后在本地 PDF 阅读器中打开。' : `PDF 无法打开：${err.message}`));
    return () => { task.destroy(); if (fileBlobUrl.current) URL.revokeObjectURL(fileBlobUrl.current); };
  }, [file]);
  useEffect(() => {
    if (fit !== 'width' || !scroller.current) return;
    const update = () => changeScale((scroller.current.clientWidth - (window.innerWidth < 600 ? 24 : 72)) / pageDimensions.width);
    const observer = new ResizeObserver(update); observer.observe(scroller.current); update();
    return () => observer.disconnect();
  }, [fit, pageDimensions.width, sidebar, pdf, changeScale]);
  useLayoutEffect(() => {
    const anchor = scaleAnchor.current;
    const container = scroller.current;
    if (!anchor || !container || !pdf) return;
    const element = document.getElementById(`page-${anchor.number}`);
    if (element) {
      const padding = parseFloat(getComputedStyle(container).paddingTop);
      container.scrollTop = element.offsetTop + anchor.offset * scale - padding;
      updatePage(anchor.number);
    }
    scaleAnchor.current = null;
  }, [scale, pdf, updatePage]);
  const onScroll = useCallback(() => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      if (scaleAnchor.current || !scroller.current) return;
      const container = scroller.current;
      const marker = container.getBoundingClientRect().top + parseFloat(getComputedStyle(container).paddingTop) + 1;
      // Use one deterministic top-of-document marker instead of competing page observers.
      const active = [...container.querySelectorAll('.pdf-page')].find(element => element.getBoundingClientRect().bottom > marker);
      if (active) updatePage(Number(active.id.slice(5)));
    });
  }, [updatePage]);
  useEffect(() => () => { if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current); }, []);
  function goTo(number) {
    if (!pdf) return;
    const target = Math.max(1, Math.min(pdf.numPages, Number(number) || 1));
    const element = document.getElementById(`page-${target}`);
    if (element && scroller.current) scroller.current.scrollTop = element.offsetTop - parseFloat(getComputedStyle(scroller.current).paddingTop);
    updatePage(target);
  }
  function zoom(delta) { setFit('custom'); changeScale(currentScale.current + delta); }
  async function download() {
    if (!pdf || action) return;
    setAction('正在准备下载…');
    try { if (!fileBlobUrl.current) fileBlobUrl.current = URL.createObjectURL(new Blob([await pdf.getData()], { type: 'application/pdf' })); const anchor = document.createElement('a'); anchor.href = fileBlobUrl.current; anchor.download = name; anchor.click(); }
    catch (err) { setError(`下载失败：${err.message}`); }
    finally { setAction(''); }
  }
  async function print() {
    if (!pdf || action) return;
    printArea.current.replaceChildren();
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        setAction(`准备打印 ${i} / ${pdf.numPages}`);
        const pdfPage = await pdf.getPage(i); const viewport = pdfPage.getViewport({ scale: 1.5 });
        const sheet = document.createElement('div'); sheet.className = 'print-sheet';
        const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height; sheet.append(canvas); printArea.current.append(sheet);
        await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
      const cleanup = () => { printArea.current?.replaceChildren(); setAction(''); };
      window.addEventListener('afterprint', cleanup, { once: true });
      setAction('打印预览已打开');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
      setAction('');
    } catch (err) { setError(`无法准备打印：${err.message}`); setAction(''); }
  }
  return <div className="pdf-app"><header className="pdf-toolbar"><div className="pdf-file-tools"><button className="viewer-icon" onClick={() => setSidebar(value => !value)} aria-label={sidebar ? '隐藏缩略图' : '显示缩略图'} aria-pressed={sidebar}>☰</button><span className="pdf-file-icon">PDF</span><h1 title={name}>{name}</h1></div><div className="pdf-navigation"><button className="viewer-icon" disabled={!pdf || page <= 1} onClick={() => goTo(page - 1)} aria-label="上一页">‹</button><form onSubmit={event => { event.preventDefault(); goTo(pageInput); }}><input aria-label="页码" inputMode="numeric" value={pageInput} onChange={e => setPageInput(e.target.value)} onBlur={() => goTo(pageInput)}/><span>/ {pdf?.numPages || '—'}</span></form><button className="viewer-icon" disabled={!pdf || page >= pdf.numPages} onClick={() => goTo(page + 1)} aria-label="下一页">›</button><span className="toolbar-divider"/><button className="viewer-icon" onClick={() => zoom(-0.1)} aria-label="缩小" disabled={!pdf}>−</button><select aria-label="缩放方式" value={fit === 'width' ? 'width' : fit === 'actual' ? 'actual' : 'custom'} onChange={event => { setFit(event.target.value); if (event.target.value === 'actual') changeScale(1); }}><option value="width">适合宽度</option><option value="actual">实际大小</option><option value="custom">{Math.round(scale * 100)}%</option></select><button className="viewer-icon" onClick={() => zoom(0.1)} aria-label="放大" disabled={!pdf}>＋</button></div><div className="pdf-actions"><button className="viewer-icon" onClick={download} disabled={!pdf || !!action} title="下载 PDF" aria-label="下载 PDF">↓</button><button className="viewer-icon" onClick={print} disabled={!pdf || !!action} title="打印 PDF" aria-label="打印 PDF">⎙</button><a className="viewer-icon viewer-home" href="/" title="返回档案" aria-label="返回讲座档案">⌂</a></div></header>
    {error && <div className="viewer-error" role="alert"><span>{error}</span>{file && <a href={file} target="_blank" rel="noopener noreferrer">打开原始文件 ↗</a>}<a href="/">返回讲座档案</a></div>}
    {action && <div className="viewer-action" role="status">{action}</div>}
    {!pdf && !error && <div className="viewer-loading" role="status"><span className="viewer-spinner"/><p>正在打开 PDF{loading ? ` · ${loading}%` : '…'}</p></div>}
    <div className={`pdf-workspace ${sidebar ? '' : 'without-sidebar'}`}>
      {sidebar && <aside className="pdf-thumbnails" aria-label="页面缩略图"><div className="thumbnail-heading">页面缩略图</div>{pdf && Array.from({ length: pdf.numPages }, (_, i) => <button key={i} className={`thumbnail-button ${page === i + 1 ? 'current' : ''}`} onClick={() => goTo(i + 1)} aria-label={`前往第 ${i + 1} 页`} aria-current={page === i + 1 ? 'page' : undefined}><PdfPage pdf={pdf} number={i + 1} scale={1} defaultDimensions={pageDimensions} thumbnail onError={setError}/><span>{i + 1}</span></button>)}</aside>}
      <main className="pdf-scroll" ref={scroller} onScroll={onScroll} aria-label="PDF 文档">{pdf && Array.from({ length: pdf.numPages }, (_, i) => <PdfPage key={i} pdf={pdf} number={i + 1} scale={scale} defaultDimensions={pageDimensions} onError={setError}/>)}</main>
    </div><div className="pdf-print-area" ref={printArea}/>
  </div>;
}

createRoot(document.getElementById('root')).render(<Viewer/>);
