import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const sample = JSON.parse(await readFile(new URL('../../content/seminars.json', import.meta.url), 'utf8'));
const records = Array.from({ length: 23 }, (_, i) => ({
  ...sample.talks[0], id: `all-test-${i}`, title: `月份报告 ${i + 1}`,
  date: `2026-10-${String(i + 1).padStart(2, '0')}`, time: '10:00–11:00', startTime: '10:00', endTime: '11:00', attachments: [],
}));

test('all reports, month dividers and filters work together on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-10-04T05:00:00Z') });
  await page.route('**/api/content', route => route.fulfill({ json: { content: { ...sample, talks: records }, revision: 'test' } }));
  await page.goto('/');
  await expect(page.locator('.english-title')).toHaveText('Seminar of Analysis and Probability');
  await expect(page.locator('article.talk')).toHaveCount(23);
  await expect(page.locator('article.talk').first()).toContainText('月份报告 5');
  await expect(page.getByRole('heading', { name: '即将举行', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '已结束', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '即将举行', exact: true }).getByRole('heading', { name: '2026-10', exact: true })).toBeVisible();
  await expect(page.locator('.archive-pagination')).toHaveCount(0);
  await page.getByLabel('搜索讲座、报告人或摘要').fill('月份报告 23');
  await expect(page.locator('article.talk')).toHaveCount(1);
  await expect(page.locator('.archive-pagination')).toHaveCount(0);
  await page.getByRole('button', { name: '清除筛选 ×' }).click();
  await expect(page.locator('article.talk')).toHaveCount(23);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a report moves to ended at its Beijing end time without a reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-01T02:59:59Z') });
  await page.route('**/api/content', route => route.fulfill({ json: { content: { ...sample, talks: [records[0]] }, revision: 'test' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '即将举行', exact: true })).toBeVisible();
  await page.clock.runFor(2000);
  await expect(page.getByRole('heading', { name: '已结束', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '即将举行', exact: true })).toHaveCount(0);
  await expect(page.locator('article.talk')).toHaveCount(1);
});
