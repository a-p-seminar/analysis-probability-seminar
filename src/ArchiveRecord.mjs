import { createElement as h, useState } from 'react';
import katex from 'katex';
import { MetadataIcon } from './MetadataIcon.mjs';
import { attachmentUrl, displayAffiliation, displayDate, displayTime, formatSize, reportTime, safeHttpUrl, visibleAttachments } from './archive-model.mjs';

// Infer only recognizable TeX runs in titles; normal words and filenames stay text.
// Explicit delimiters remain the preferred way to enter more complex formulas.
const mathAtom = String.raw`(?:\\(?:mathbb|mathcal|mathbf|mathrm|mathfrak)\{[A-Za-z]+\}|\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|nu|pi|rho|sigma|tau|phi|chi|psi|omega)\b|[A-Za-z0-9])(?:[_^](?:\{[^{}\n]+\}|[A-Za-z0-9]))*`;
const mathOperator = String.raw`(?:\\(?:times|otimes|oplus|cdot|cup|cap|setminus|in|subseteq|subset|to|leq|geq|neq)\b|[+=<>−-])`;
const bareMathPattern = new RegExp(String.raw`(?<![\w\\])${mathAtom}(?:\s*${mathOperator}\s*${mathAtom})*(?![\w])`, 'g');

function renderMath(expression, display, fallback, key) {
  try {
    const html = katex.renderToString(expression, { displayMode: display, throwOnError: true, trust: false, strict: 'ignore', output: 'htmlAndMathml' });
    return h('span', { key, className: display ? 'math-block' : 'math-inline', dangerouslySetInnerHTML: { __html: html } });
  } catch { return fallback; }
}

function renderBareMath(text, key) {
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(bareMathPattern)) {
    if (!/[\\_^]/.test(match[0])) continue;
    parts.push(text.slice(cursor, match.index));
    parts.push(renderMath(match[0], false, match[0], `${key}-${match.index}`));
    cursor = match.index + match[0].length;
  }
  parts.push(text.slice(cursor));
  return parts;
}

export function MathText({ text = '', autoMath = false }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$[^$\n]+?(?<!\\)\$)/g);
  return parts.map((part, index) => {
    const display = part.startsWith('$$') || part.startsWith('\\[');
    if (index % 2 === 0) return autoMath ? renderBareMath(part, index) : part;
    const expression = part.slice(display || part.startsWith('\\(') ? 2 : 1, display || part.startsWith('\\(') ? -2 : -1);
    return renderMath(expression, display, part, index);
  });
}

export function ArchiveRecord({ talk }) {
  const [abstractOpen, setAbstractOpen] = useState(false);
  const files = visibleAttachments(talk);
  const affiliation = displayAffiliation(talk);
  const meetingUrl = (talk.sourceUrls || []).map(safeHttpUrl).find(Boolean);
  return h('article', { className: 'talk', id: talk.id, 'aria-labelledby': `title-${talk.id}` },
    h('div', { className: 'talk-content' },
      h('h3', { id: `title-${talk.id}`, className: 'talk-title' },
        meetingUrl ? h('a', { className: 'talk-title-link', href: meetingUrl, target: '_blank', rel: 'noopener noreferrer' },
          h(MathText, { text: talk.title, autoMath: true })) : h(MathText, { text: talk.title, autoMath: true })),
      h('p', { className: 'talk-speaker' }, h(MetadataIcon, { type: 'person' }),
        h('span', { className: 'talk-speaker-info' }, talk.speaker,
          affiliation ? h('span', { className: 'talk-affiliation' }, '（', h('strong', null, affiliation), '）') : null)),
      h('p', { className: 'talk-schedule' },
        h('span', { className: 'talk-datetime' }, h(MetadataIcon, { type: 'calendar' }),
          h('span', null, h('time', { dateTime: talk.date }, displayDate(talk.date)),
            reportTime(talk) ? ` ${displayTime(talk.date, reportTime(talk))}` : '')),
        talk.location ? h('span', { className: 'talk-location' },
          h(MetadataIcon, { type: 'location' }),
          h('span', null, talk.location.replace(/^(武大|华师)\s*·\s*/, '$1 · '))) : null),
      talk.abstract || files.length ? h('div', { className: 'talk-abstract' },
        h('div', { className: 'talk-actions' },
          talk.abstract ? h('button', {
            type: 'button', className: 'abstract-toggle', 'aria-expanded': abstractOpen,
            'aria-controls': `abstract-${talk.id}`, onClick: () => setAbstractOpen(open => !open),
          }, h('span', { className: 'disclosure-icon', 'aria-hidden': true }, '+'), '摘要',
          h('span', { className: 'abstract-hint' }, abstractOpen ? '（点击收起）' : '（点击展开）')) : null,
          files.length ? h('div', { className: 'talk-links' },
            ...files.map(file => h('a', {
              key: file.id || file.name, className: 'attachment-link',
              href: file.type.toLowerCase() === 'pdf' ? `/viewer.html?file=${encodeURIComponent(attachmentUrl(file))}&name=${encodeURIComponent(file.name)}` : attachmentUrl(file),
              target: '_blank', rel: 'noopener noreferrer', download: file.type.toLowerCase() === 'pdf' ? undefined : file.name,
              title: `${file.name}${file.size ? ` · ${formatSize(file.size)}` : ''}`,
              'aria-label': `讲义 · PPT：${file.name}`,
            }, '讲义 · PPT')),
          ) : null,
        ),
        talk.abstract ? h('div', { className: 'abstract-text', id: `abstract-${talk.id}`, hidden: !abstractOpen }, h(MathText, { text: talk.abstract })) : null,
      ) : null,
    ),
  );
}
