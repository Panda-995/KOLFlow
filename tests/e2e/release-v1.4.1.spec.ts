import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`BRAND-01 新图标和详情素材 ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const icon = page.getByRole('img', { name: 'KOLFlow', exact: true });
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(256);
    expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe('/app-icon.png?v=1.4.1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const [folder, size] of [['pc', [1854, 1236]], ['mobile', [1125, 2436]]] as const) {
      for (const subject of ['01-orders', '02-workflow', '03-insights']) {
        const url = `/store-listing/${folder}/${subject}-${size[0]}x${size[1]}.png`;
        const response = await page.request.get(url);
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('image/png');
        const data = await response.body();
        expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([...size]);
      }
    }
    await page.screenshot({ path: `test-results/branding-${viewport.width}.png`, fullPage: true });
  });
}
