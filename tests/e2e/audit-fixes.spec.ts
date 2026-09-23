import { expect, test } from '@playwright/test';
import { registerFreshAccount } from './helpers';

test('首页快捷操作直接打开对应表单，最近商单可进入详情', async ({ page }) => {
  await registerFreshAccount(page, 'dashboard-actions');
  await page.getByRole('button', { name: '新建商单' }).click();
  await expect(page.getByRole('heading', { name: '新建商单' })).toBeVisible();
  await page.getByLabel('商单标题').fill('详情深链验证');
  await page.getByLabel('合作品牌').fill('测试品牌');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByRole('heading', { name: '新建商单' })).toBeHidden();

  await page.goto('/');
  await expect(page.getByText('详情深链验证').first()).toBeVisible();
  await page.getByRole('button', { name: /查看商单：详情深链验证/ }).click();
  await expect(page.getByRole('heading', { name: '商单详情' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: '添加待办' }).click();
  await expect(page.getByRole('heading', { name: '新建任务' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: '财务入账' }).click();
  await expect(page.getByRole('heading', { name: '记录账单' })).toBeVisible();
});

test('账单加载失败显示错误和重试，不显示空数据', async ({ page }) => {
  await registerFreshAccount(page, 'billing-load-error');
  await page.route('**/api/payments', route => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: '测试故障' }),
  }));
  await page.goto('/billing');
  await expect(page.getByRole('alert')).toContainText('账单加载失败');
  await expect(page.getByText('暂无收支明细')).toHaveCount(0);
  await page.unroute('**/api/payments');
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByRole('heading', { name: '账单管理' })).toBeVisible();
});

test('月度目标在账号之间隔离', async ({ page }) => {
  await registerFreshAccount(page, 'target-a');
  await page.getByRole('button', { name: /设置月度目标/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '设置月度目标' })).toBeVisible();
  await page.getByLabel('目标金额 (¥)').fill('98765');
  await page.getByRole('button', { name: '保存目标' }).click();
  await expect(page.getByText('月度目标 ¥98,765')).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('button', { name: '退出' }).click();
  await registerFreshAccount(page, 'target-b');
  await expect(page.getByText('月度目标 ¥10,000')).toBeVisible();
  await expect(page.getByText('月度目标 ¥98,765')).toHaveCount(0);
});

test('移动端商单工具有名称，设置入口无需横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerFreshAccount(page, 'mobile-a11y');
  await page.goto('/orders');
  await expect(page.getByRole('button', { name: '导出' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导入' })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: '关于项目' })).toBeVisible();
  await expect(page.getByText('左右滑动查看更多设置', { exact: false })).toBeVisible();
});

test('业务页面请求失败时显示可重试错误，不显示空数据', async ({ page }) => {
  await registerFreshAccount(page, 'page-load-errors');
  for (const item of [
    { path: '/orders', api: 'orders', message: '商单数据加载失败' },
    { path: '/todos', api: 'todos', message: '待办数据加载失败' },
    { path: '/brands', api: 'brands', message: '品牌数据加载失败' },
    { path: '/analytics', api: 'paid-promotions', message: '统计数据加载失败' },
  ]) {
    const pattern = `**/api/${item.api}`;
    await page.route(pattern, route => route.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ error: '测试故障' }),
    }));
    await page.goto(item.path);
    await expect(page.getByRole('alert').filter({ hasText: item.message })).toBeVisible();
    await page.unroute(pattern);
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.getByRole('alert').filter({ hasText: item.message })).toHaveCount(0);
  }
});
