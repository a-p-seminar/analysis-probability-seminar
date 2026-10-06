import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';

test('static preview includes selected public files, filters reports, opens PDFs and clearly disables editing', async ({ page }) => {
  const content = JSON.parse(await readFile(new URL('../../content/seminars.json', import.meta.url), 'utf8'));
  const output = (await readdir(new URL('../../dist-preview', import.meta.url), { recursive: true })).map(path => path.replaceAll('\\', '/'));
  expect(output.some(path => /(?:^|[/\\])(?:\.env|\.local-data|server|content|sources)(?:[/\\.]|$)/.test(path) && path !== 'preview/content.json')).toBe(false);
  await page.goto('/');
  await expect(page.locator('article.talk')).toHaveCount(content.talks.length);
  await page.getByLabel('按年份筛选').selectOption('2025');
  await page.getByLabel('按月份筛选').selectOption('09');
  await expect(page.locator('article.talk')).toHaveCount(1);
  await page.getByRole('button', { name: /摘要/ }).click();
  await expect(page.locator('.abstract-text')).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('.attachment-link').click();
  const pdf = await popupPromise;
  await expect(pdf.locator('canvas').first()).toBeVisible({timeout:30_000});
  await expect(pdf.locator('.viewer-error')).toHaveCount(0);
  await pdf.close();
  await page.goto('/admin.html');
  await expect(page.getByRole('heading', {name:'在线预览'})).toBeVisible();
  await expect(page.getByText('当前预览尚未启用后台编辑与附件上传。')).toBeVisible();
  await expect(page.getByLabel('管理员密码')).toHaveCount(0);
});
