import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MathText } from '../src/ArchiveRecord.mjs';

const render = text => renderToStaticMarkup(createElement(MathText, { text, autoMath: true }));

test('renders unmarked mathematical expressions without turning the surrounding title into math', () => {
  const html = render(String.raw`On tiling sets and spectral sets in Z_p^2\times Z_p^2`);
  assert.match(html, /^On tiling sets and spectral sets in <span/);
  assert.equal((html.match(/class="katex"/g) || []).length, 1);
  assert.match(html, /<msubsup>/);
  assert.match(html, /<mo>×<\/mo>/);
});

test('keeps delimited inline and display formulas intact while also recognizing bare TeX', () => {
  const html = render(String.raw`Order $pq$, \(\alpha+1\), $$\frac{1}{2}$$ and Z_p^2`);
  assert.equal((html.match(/class="katex"/g) || []).length, 4);
  assert.equal((html.match(/class="math-block"/g) || []).length, 1);
  assert.match(html, /<mfrac>/);
});

test('leaves ordinary titles and nonmathematical underscores untouched', () => {
  for (const text of ['Multiplicative rational p-adic approximation', 'seminar_notes.pdf', 'Release v2', '报告：10:00–11:00', 'Cost $20']) {
    assert.equal(render(text), text);
  }
});

test('invalid or unsafe TeX falls back safely and never creates executable HTML', () => {
  const html = render(String.raw`<script>alert(1)</script> $\brokencommand{a}$ $\href{javascript:alert(1)}{click}$`);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /\\brokencommand/);
});
