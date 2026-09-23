import { expect, test } from '@playwright/test';
import { registerFreshAccount } from './helpers';

const routes = ['/orders', '/billing', '/todos', '/brands', '/analytics'];

for (const mobile of [false, true]) {
  test(`sidebar transitions remain borderless (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    await registerFreshAccount(page, 'navigation');
    for (const path of routes) {
      // A full load of settings clears the in-memory collection cache without preloading these pages.
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: '系统设置' })).toBeVisible();
      // Keep loading visible long enough for its card styles to be painted.
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/api/**', async route => {
        if (route.request().method() === 'GET') await gate;
        await route.continue();
      });
      if (mobile) await page.getByRole('button', { name: '打开导航菜单' }).click();
      await page.locator(`aside:visible a[href="${path}"]`).click();
      await expect(page.locator('main > [role="status"]')).toBeVisible();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const samples = page.evaluate(() => new Promise<{ border: string; shadow: string; background: string }[]>(resolve => {
        const values: { border: string; shadow: string; background: string }[] = [];
        let start = 0;
        const sample = (now: number) => {
          const root = document.querySelector('main > .animate-in');
          if (root) {
            start ||= now;
            const style = getComputedStyle(root);
            values.push({ border: style.borderTopWidth, shadow: style.boxShadow, background: style.backgroundColor });
          }
          if (start && now - start > 650) resolve(values);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }));
      release();
      const frames = await samples;
      await page.unroute('**/api/**');
      expect(frames.length).toBeGreaterThan(1);
      expect(frames.filter(frame => frame.border !== '0px' || frame.shadow !== 'none' || frame.background !== 'rgba(0, 0, 0, 0)')).toEqual([]);
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('all sidebar destinations, collapsed navigation and keyboard focus work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await registerFreshAccount(page, 'navigation-smoke');
  for (const path of ['/orders', '/billing', '/todos', '/brands', '/assets', '/analytics', '/logs', '/settings', '/']) {
    await page.locator(`aside:visible a[href="${path}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path + '$'}`));
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  }
  await page.getByTitle('折叠侧边栏').click();
  await page.locator('aside:visible a[href="/orders"]').click();
  await expect(page.getByRole('button', { name: '新建', exact: true })).toBeVisible();
  await page.locator('aside:visible a[href="/orders"]').focus();
  await page.keyboard.press('Tab');
  const billing = page.locator('aside:visible a[href="/billing"]');
  await expect(billing).toBeFocused();
  expect(await billing.evaluate(el => el.matches(':focus-visible'))).toBe(true);
  await expect(billing).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '账单管理' })).toBeVisible();
  await page.getByTitle('展开侧边栏').click();
  await page.screenshot({ path: 'test-results/sidebar-after-desktop.png', fullPage: true, animations: 'disabled' });
  expect(errors).toEqual([]);
});
