import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const sample = JSON.parse(await readFile(new URL('../../content/seminars.json', import.meta.url), 'utf8'));
const records = Array.from({ length: 23 }, (_, i) => ({
  ...sample.talks[0], id: `filter-test-${i}`, title: i < 12 ? `目标筛选报告 ${i}` : `筛选测试报告 ${i}`,
  date: i < 12 ? '2025-09-09' : '2026-10-06', attachments: [],
}));

for (const width of [390, 834, 1440]) {
  test(`filters collapse while scrolling, reopen and retain selections at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/content', route => route.fulfill({ json: { content: { ...sample, talks: records }, revision: 'test' } }));
    await page.goto('/');
    await expect(page.locator('article.talk')).toHaveCount(23);
    const toggle = page.getByRole('button', { name: '筛选', exact: true });
    const search = page.getByLabel('搜索讲座、报告人或摘要');
    await expect(search).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(search).toBeHidden();
    const compact = await toggle.boundingBox();
    expect(compact.width).toBeLessThan(110);
    expect(compact.height).toBeGreaterThanOrEqual(40);
    expect(compact.y).toBeLessThan(25);
    expect(Math.abs(await page.evaluate(() => window.scrollY) - 700)).toBeLessThanOrEqual(2);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(search).toBeVisible();
    await page.getByLabel('按年份筛选').selectOption('2025');
    await page.getByLabel('按月份筛选').selectOption('09');
    await search.fill('目标筛选报告');
    await expect(page.locator('article.talk')).toHaveCount(12);
    await toggle.click();
    await expect(search).toBeHidden();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(search).toHaveValue('目标筛选报告');
    await expect(page.getByLabel('按年份筛选')).toHaveValue('2025');
    await expect(page.getByLabel('按月份筛选')).toHaveValue('09');
    await search.focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(search).toBeHidden();
    await page.getByRole('button', { name: '清除筛选 ×' }).click();
    await expect(page.locator('article.talk')).toHaveCount(23);
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(search).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
