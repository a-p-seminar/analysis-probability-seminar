import { test, expect } from '@playwright/test';

for (const iosNativeSizing of [false, true]) {
test(`admin date and time controls stay inside three separate columns${iosNativeSizing ? ' with iOS native sizing modeled' : ''}`, async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin.html');
  await page.getByLabel('管理员密码').fill('test-only-not-a-production-password');
  await page.getByRole('button', { name: '登录管理后台' }).click();
  await page.locator('.admin-record').first().click();

  const date = page.locator('.report-meta-grid input[type="date"]');
  const start = page.getByLabel('开始时间', { exact: true });
  const end = page.getByLabel('结束时间', { exact: true });
  await start.fill('10:30');
  await expect(end).toHaveValue('11:30');
  await start.fill('10:00');
  await expect(end).toHaveValue('11:00');

  if (iosNativeSizing) {
    // Windows WebKit has no iOS theme. Model the theme's post-CSS adjustments
    // only for controls still using native appearance: forced content-box,
    // padding and a locale-dependent minimum width. See WebKit bug 301648 and
    // RenderThemeIOS::adjustInputElementButtonStyle (the theme skips appearance:none).
    await page.locator('.report-meta-grid input[type="date"], .report-meta-grid input[type="time"]').evaluateAll(inputs => {
      for (const input of inputs) {
        if (getComputedStyle(input).appearance !== 'none') input.setAttribute('data-ios-native-theme', '');
      }
    });
    await page.addStyleTag({ content: '[data-ios-native-theme] { box-sizing: content-box !important; padding: 0 .5em !important; min-width: 6em !important; min-height: 28px !important; }' });
  }

  for (const width of [375, 390, 430, 768, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const value of ['2026-08-05', '']) {
      await date.fill(value);
      const boxes = await page.locator('.report-meta-grid input').evaluateAll(inputs => inputs.map(input => {
        const rect = input.getBoundingClientRect();
        const label = input.closest('label').getBoundingClientRect();
        return { x: rect.x, right: rect.right, y: rect.y, width: rect.width, height: rect.height, labelX: label.x, labelRight: label.right };
      }));
      const controls = boxes.slice(3);
      for (const box of controls) {
        expect(box.x, `left edge at ${width}px, date=${value}`).toBeGreaterThanOrEqual(box.labelX - 1);
        expect(box.right, `right edge at ${width}px, date=${value}`).toBeLessThanOrEqual(box.labelRight + 1);
        expect(Math.abs(box.height - boxes[0].height)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.y - controls[0].y)).toBeLessThanOrEqual(1);
      }
      for (let index = 1; index < controls.length; index++) {
        expect(controls[index].x - controls[index - 1].right, `separate controls at ${width}px, date=${value}`).toBeGreaterThanOrEqual(5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await date.fill('2026-08-05');
    if ([390, 834].includes(width)) {
      await page.locator('.report-meta-grid').screenshot({ path: testInfo.outputPath(`date-time-${width}.png`) });
    }
  }
  await end.fill('09:00');
  await expect(page.locator('.time-picker-error')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存报告', exact: true })).toBeDisabled();
  await end.fill('11:00');
  await expect(page.locator('.time-picker-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});
}
