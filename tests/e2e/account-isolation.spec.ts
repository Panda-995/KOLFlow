import { expect, test } from '@playwright/test';
import { registerFreshAccount } from './helpers';

/**
 * 账号隔离测试：验证"旧账号在途请求的响应不会写进新账号状态"。
 * 关键设计：
 *  1. 整个切换过程不刷新页面（不调用 page.goto），否则 Store 与模块级缓存会被销毁，掩盖问题；
 *  2. 用"闸门"控制旧请求的响应时机，确保它在新账号页面**加载完成之后**才落地，
 *     而不是被新账号自己的首次加载覆盖掉（那样测试会误判为通过）。
 */

test('同一页面内切换账号：旧账号的读取响应不会写入新账号状态', async ({ page }) => {
  await registerFreshAccount(page, 'acct-a');

  const tokenA = await page.evaluate(() => localStorage.getItem('token'));
  await page.request.post('/api/orders', {
    headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
    data: { title: 'A账号的商单', type: 'paid', status: 'in_progress', actualAmount: 100, brandName: 'A品牌' },
  });
  await page.request.post('/api/brands', {
    headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
    data: { name: 'A账号的品牌', industry: '测试' },
  });

  // 闸门：扣住账号 A 的第一次列表读取，直到测试主动放行
  let releaseStale: () => void = () => {};
  const staleGate = new Promise<void>(resolve => { releaseStale = resolve; });
  let heldOrders = false;
  let heldBrands = false;
  await page.route('**/api/orders', async route => {
    if (route.request().method() === 'GET' && !heldOrders) {
      heldOrders = true;
      await staleGate;
    }
    await route.continue();
  });
  await page.route('**/api/brands', async route => {
    if (route.request().method() === 'GET' && !heldBrands) {
      heldBrands = true;
      await staleGate;
    }
    await route.continue();
  });

  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: '商单管理' })).toBeVisible();
  await page.waitForTimeout(300);

  // === 应用内切换账号（不刷新页面）===
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByLabel('账号邮箱')).toBeVisible();
  await page.getByRole('tab', { name: '注册' }).click();
  await page.getByLabel('账号邮箱').fill(`acct-b-${Date.now()}@example.com`);
  await page.getByLabel('密码').fill('KolFlow-E2E-2026!');
  await page.getByLabel('邀请码').fill('kolflow-e2e-invite');
  await page.getByRole('checkbox', { name: /我已阅读并同意/ }).check();
  await page.getByRole('button', { name: '注册', exact: true }).last().click();
  // 应用内切换不会重置路由：仍在 /orders
  await expect(page.getByRole('heading', { name: '商单管理' })).toBeVisible();
  await expect(page.getByText('A账号的商单')).toHaveCount(0);

  // 新账号页面已就绪，放行旧请求：其响应此刻才落地（若有防护应被丢弃）
  releaseStale();
  await page.waitForTimeout(1500);

  await expect(page.getByText('A账号的商单')).toHaveCount(0);
  const brandsAfter = await page.evaluate(() => {
    const store = (window as unknown as { __kolflowStore?: { getState: () => any } }).__kolflowStore;
    return store?.getState()?.orders?.map((o: any) => o.title) ?? null;
  });
  if (brandsAfter) {
    expect(brandsAfter).not.toContain('A账号的商单');
  }

  const tokenB = await page.evaluate(() => localStorage.getItem('token'));
  expect(tokenB).not.toBe(tokenA);
  const bOrders = await page.request.get('/api/orders', { headers: { Authorization: `Bearer ${tokenB}` } });
  expect(await bOrders.json()).toEqual([]);

  await page.unroute('**/api/orders');
  await page.unroute('**/api/brands');
});

test('同一页面内切换账号：旧账号的写操作响应不会写入新账号状态', async ({ page }) => {
  await registerFreshAccount(page, 'write-a');

  // 闸门：扣住账号 A 的新增品牌响应，直到测试主动放行
  let releaseStale: () => void = () => {};
  const staleGate = new Promise<void>(resolve => { releaseStale = resolve; });
  let heldPost = false;
  await page.route('**/api/brands', async route => {
    if (route.request().method() === 'POST' && !heldPost) {
      heldPost = true;
      await staleGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'stale-brand-id', name: 'A的在途品牌', industry: '' }),
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole('link', { name: /^品牌/ }).last().click();
  await page.getByRole('button', { name: '添加新品牌' }).click();
  await page.getByLabel('品牌名称').fill('A的在途品牌');
  await page.getByRole('button', { name: '确认添加' }).click();
  await page.waitForTimeout(300);

  // 关闭弹窗（请求仍在途）后切换账号：这是真实用户的操作路径
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('heading', { name: '添加新品牌' })).toBeHidden();

  // === 应用内切换账号（不刷新页面）===
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByLabel('账号邮箱')).toBeVisible();
  await page.getByRole('tab', { name: '注册' }).click();
  await page.getByLabel('账号邮箱').fill(`write-b-${Date.now()}@example.com`);
  await page.getByLabel('密码').fill('KolFlow-E2E-2026!');
  await page.getByLabel('邀请码').fill('kolflow-e2e-invite');
  await page.getByRole('checkbox', { name: /我已阅读并同意/ }).check();
  await page.getByRole('button', { name: '注册', exact: true }).last().click();
  // 当前路由仍是 /brands
  await expect(page.getByRole('heading', { name: '品牌/客户管理' })).toBeVisible();
  await expect(page.getByText('未找到品牌')).toBeVisible();

  // 新账号页面已就绪，放行旧写请求
  releaseStale();
  await page.waitForTimeout(1500);

  await expect(page.getByText('A的在途品牌')).toHaveCount(0);
  const storeBrands = await page.evaluate(() => {
    const store = (window as unknown as { __kolflowStore?: { getState: () => any } }).__kolflowStore;
    return store?.getState()?.brands?.map((b: any) => b.name) ?? null;
  });
  if (storeBrands) {
    expect(storeBrands).not.toContain('A的在途品牌');
  }

  await page.unroute('**/api/brands');
});
