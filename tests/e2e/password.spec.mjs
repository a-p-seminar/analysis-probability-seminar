import { test, expect } from '@playwright/test';

const initialPassword = 'test-only-not-a-production-password';
const replacement = 'test-only-updated-administrator-password';

test('administrator changes a password, reauthenticates and keeps unsaved reports safe', async ({ page, browser }) => {
  await page.goto('/admin.html');
  await page.getByLabel('管理员密码').fill(initialPassword);
  await page.getByRole('button', { name: '登录管理后台' }).click();
  await expect(page.getByRole('button', { name: '修改密码', exact: true })).toBeVisible();
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.goto('http://127.0.0.1:5187/admin.html');
  await second.getByLabel('管理员密码').fill(initialPassword);
  await second.getByRole('button', { name: '登录管理后台' }).click();
  await expect(second.getByRole('button', { name: '修改密码', exact: true })).toBeVisible();

  await page.locator('.admin-record').first().click();
  const title = await page.getByLabel('报告标题').inputValue();
  await page.getByLabel('报告标题').fill(title + ' temporary unsaved edit');
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请先保存当前报告');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('报告标题')).toHaveValue(title + ' temporary unsaved edit');
  await page.getByLabel('报告标题').fill(title);

  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '修改密码' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('当前密码', { exact: true })).toBeFocused();
  await page.screenshot({ path: 'test-results/admin-password-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  await expect(dialog.getByRole('button', { name: '保存新密码' })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-password-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '修改密码', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await dialog.getByLabel('当前密码', { exact: true }).fill('wrong-current-password');
  await dialog.getByLabel('新密码', { exact: true }).fill(replacement);
  await dialog.getByLabel('确认新密码', { exact: true }).fill(replacement + '-mismatch');
  await dialog.getByRole('button', { name: '保存新密码' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('两次输入的新密码不一致。');
  await dialog.getByLabel('确认新密码', { exact: true }).fill(replacement);
  await dialog.getByRole('button', { name: '保存新密码' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('当前密码不正确。');
  await dialog.getByLabel('当前密码', { exact: true }).fill(initialPassword);
  await dialog.getByRole('button', { name: '保存新密码' }).click();
  await expect(page.getByRole('status')).toHaveText('密码已修改，请使用新密码重新登录。');
  await expect(page.getByLabel('管理员密码')).toBeVisible();
  await second.reload();
  await expect(second.getByLabel('管理员密码')).toBeVisible();
  await secondContext.close();

  await page.getByLabel('管理员密码').fill(initialPassword);
  await page.getByRole('button', { name: '登录管理后台' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid password');
  await page.getByLabel('管理员密码').fill(replacement);
  await page.getByRole('button', { name: '登录管理后台' }).click();
  await expect(page.getByRole('button', { name: '修改密码', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await expect(dialog.getByLabel('当前密码', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('新密码', { exact: true })).toHaveValue('');
  // Restore only the isolated browser-test credential, never the user's password.
  await dialog.getByLabel('当前密码', { exact: true }).fill(replacement);
  await dialog.getByLabel('新密码', { exact: true }).fill(initialPassword);
  await dialog.getByLabel('确认新密码', { exact: true }).fill(initialPassword);
  await dialog.getByRole('button', { name: '保存新密码' }).click();
  await expect(page.getByLabel('管理员密码')).toBeVisible();
});
