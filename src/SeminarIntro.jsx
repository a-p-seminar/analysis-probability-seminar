import React, { useEffect, useId, useRef, useState } from 'react';
import { FractalArtwork } from './FractalArtwork.jsx';

export function SeminarIntro({ site }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutRef = useRef(null);
  const toggleRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!aboutOpen) return;
    const closeOnOutsideClick = event => {
      if (!aboutRef.current?.contains(event.target)) setAboutOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setAboutOpen(false);
        toggleRef.current?.focus();
      }
    };
    const compactView = window.matchMedia('(max-width: 1199px), (max-width: 1366px) and (hover: none) and (pointer: coarse)');
    const closeOnDesktop = () => { if (!compactView.matches) setAboutOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    compactView.addEventListener('change', closeOnDesktop);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      compactView.removeEventListener('change', closeOnDesktop);
    };
  }, [aboutOpen]);

  return <section className="seminar-intro page-width" aria-label="讨论班与组织者">
    <div className="intro-copy">
      <p className="english-title">{site?.titleEn || 'Seminar of Analysis and Probability'}</p>
      <h1>{site?.title || '武汉大学-华中师范大学联合分析与概率讨论班'}</h1>
    </div>
    <div className={`seminar-about${aboutOpen ? ' is-open' : ''}`} ref={aboutRef}>
      <button className="seminar-about-toggle" type="button" ref={toggleRef} aria-expanded={aboutOpen} aria-controls={panelId} onClick={() => setAboutOpen(open => !open)}>
        关于
      </button>
      <div className="seminar-about-panel" id={panelId} role="region" aria-label="关于讨论班">
        <div className="organizers">
          <h2>组织者 <span>Organizers</span></h2>
          <div className="organizer-list">
            {(site?.organizers || []).map(person => <div className="organizer" key={person.email || person.name}>
              <div className="organizer-name"><strong>{person.name}</strong>{person.nameEn && <span>{person.nameEn}</span>}</div>
              {person.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email) && <a href={`mailto:${person.email}`}>{person.email}</a>}
            </div>)}
          </div>
        </div>
        <p className="seminar-venue-note"><em><span>The talks will take place at Wuhan University</span>{' '}<span>and Central China Normal University in turn.</span></em></p>
      </div>
    </div>
    <a className="fractal-admin-link" href="/admin.html" target="_blank" rel="noopener noreferrer" aria-label="打开管理页面（新窗口）" title="打开管理页面">
      <FractalArtwork />
    </a>
  </section>;
}
