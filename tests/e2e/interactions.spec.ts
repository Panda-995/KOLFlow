import { expect, test, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { registerFreshAccount } from './helpers';

// 触屏场景：卡片上的操作按钮必须可见且点击区足够大（不能依赖 hover）
test('触屏下品牌操作按钮可见且可点击', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerFreshAccount(page);

  await page.goto('/brands');
  await page.getByRole('button', { name: '添加新品牌' }).click();
  await page.getByLabel('品牌名称').fill('触屏品牌');
  await page.getByRole('button', { name: '确认添加' }).click();
  await expect(page.getByText('品牌创建成功')).toBeVisible();

  const editButton = page.getByRole('button', { name: /编辑品牌 触屏品牌/ });
  // 关键断言：不悬停也必须是可见的（opacity 不能是 0）
  await expect(editButton).toBeVisible();
  const opacity = await editButton.evaluate(el => getComputedStyle(el.parentElement as HTMLElement).opacity);
  expect(Number(opacity), '卡片操作区在触屏下不应为透明').toBeGreaterThan(0);

  // 点击区至少 32px（原来 p-1 只有约 20px）
  const box = await editButton.boundingBox();
  expect(box && Math.min(box.width, box.height)).toBeGreaterThanOrEqual(32);

  await editButton.click();
  await expect(page.getByRole('heading', { name: '编辑品牌信息' })).toBeVisible();
});

// 删除请求进行中时，Esc 不允许关闭确认框
test('删除进行中按 Esc 不会关闭确认框', async ({ page }) => {
  await registerFreshAccount(page);

  await page.goto('/brands');
  await page.getByRole('button', { name: '添加新品牌' }).click();
  await page.getByLabel('品牌名称').fill('删除竞态品牌');
  await page.getByRole('button', { name: '确认添加' }).click();
  await expect(page.getByText('品牌创建成功')).toBeVisible();

  // 让删除请求变慢，以便在"处理中"状态下按 Esc
  await page.route('**/api/brands/*', async route => {
    if (route.request().method() === 'DELETE') {
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    await route.continue();
  });

  await page.getByRole('button', { name: /删除品牌 删除竞态品牌/ }).click();
  await expect(page.getByRole('heading', { name: '确认删除品牌' })).toBeVisible();
  await page.getByRole('button', { name: '确认删除' }).click();
  // 进入处理中：按钮文案变化
  await expect(page.getByRole('button', { name: '处理中...' })).toBeVisible();

  await page.keyboard.press('Escape');
  // Esc 不应关闭弹窗（请求仍在执行）
  await expect(page.getByRole('heading', { name: '确认删除品牌' })).toBeVisible();

  // 请求结束后弹窗正常关闭，品牌被删除
  await expect(page.getByText('品牌删除成功')).toBeVisible({ timeout: 10000 });
  await page.unroute('**/api/brands/*');
});

// 加载更多：数据量超过首屏窗口时提供入口并递增展示
test('列表提供分页加载入口', async ({ page }) => {
  await registerFreshAccount(page);

  // 造 45 条账单（超过默认窗口 40 条）
  const token = await page.evaluate(() => localStorage.getItem('token'));
  for (let i = 0; i < 45; i += 1) {
    await page.request.post('/api/payments', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { brand: `分页品牌 ${i + 1}`, amount: 100 + i, type: 'pending' },
    });
  }

  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: '账单管理' })).toBeVisible();
  await expect(page.getByText('已显示 40 / 45 条')).toBeVisible();
  await page.getByRole('button', { name: '加载更多' }).click();
  await expect(page.getByText('已显示 45 / 45 条')).toBeVisible();
});

// 旧保存响应不得关闭用户新打开的表单：
// 第一张表单保存中 → 关闭 → 打开第二张并填写 → 第一张的响应返回
test('旧保存响应不会关闭新打开的表单', async ({ page }) => {
  await registerFreshAccount(page, 'stale-save');

  // 扣住第一次"创建商单"的请求，制造出"保存中"的窗口
  let heldRequest: Route | null = null;
  await page.route('**/api/orders', async route => {
    if (route.request().method() === 'POST') {
      heldRequest = route;
      return;
    }
    await route.continue();
  });

  await page.goto('/orders');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByLabel('商单标题').fill('第一张表单');
  await page.getByLabel('合作品牌').fill('竞态品牌');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  // 保存中：按钮文案变化（此时请求可能还在创建品牌的阶段）
  await expect(page.getByRole('button', { name: '保存中...' })).toBeVisible();
  // 等到"创建商单"的请求真的被扣住，避免后续放行时抓空
  await expect.poll(() => heldRequest !== null, { timeout: 10_000 }).toBe(true);

  // 关闭第一张表单，再打开第二张并开始填写
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('商单标题')).toBeHidden();
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByLabel('商单标题').fill('第二张表单');

  // 放行第一张表单的保存响应
  await heldRequest!.continue();

  // 关键断言：第二张表单仍然打开（可见），且输入内容没有被丢弃
  await expect(page.getByRole('button', { name: '创建', exact: true })).toBeVisible();
  await expect(page.getByLabel('商单标题')).toBeVisible();
  await expect(page.getByLabel('商单标题')).toHaveValue('第二张表单');

  await page.unroute('**/api/orders');
});

// 空数据时图表必须给空状态：不留"全零折线"或空白图框，且文案风格一致
test('空账号的图表显示空状态而不是空图框', async ({ page }) => {
  await registerFreshAccount(page, 'empty-charts');

  // 仪表盘：收入趋势不画全零折线
  await expect(page.getByText('收入趋势')).toBeVisible();
  await expect(page.getByText('暂无收入数据')).toBeVisible();

  // 统计页：三张图（月度趋势外的分布类图表）都应有明确的空状态
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: '数据统计' })).toBeVisible();
  await expect(page.getByText('订单状态分布')).toBeVisible();
  await expect(page.getByText('暂无订单数据')).toBeVisible();
  await expect(page.getByText('暂无平台数据')).toBeVisible();
  await expect(page.getByText('暂无品牌数据')).toBeVisible();
  // 月度趋势图同样不能只留一张全零折线
  await expect(page.getByText('暂无该周期的收入数据')).toBeVisible();
});

// 表单标签必须与输入框关联：点击标题可聚焦、getByLabel 可命中（读屏用户能辨认字段）
test('表单标签与输入框正确关联', async ({ page }) => {
  await registerFreshAccount(page, 'a11y-labels');

  // 个人资料：显示名称 / 邮箱 / 简介
  await page.goto('/settings');
  await expect(page.getByLabel('显示名称')).toBeVisible();
  await page.getByLabel('显示名称').fill('小熊猫');
  await expect(page.getByLabel('显示名称')).toHaveValue('小熊猫');
  await expect(page.getByLabel('邮箱地址')).toBeVisible();
  await expect(page.getByLabel('个人简介')).toBeVisible();

  // 账号安全：登录账号
  await page.getByRole('button', { name: '账号安全' }).click();
  await expect(page.getByLabel('登录账号 (邮箱)')).toBeVisible();

  // 资产表单：名称 / 品牌 / 价值 / 状态
  await page.goto('/assets');
  await page.getByRole('button', { name: '新建资产' }).click();
  const assetDialog = page.getByRole('dialog');
  await expect(assetDialog.getByLabel('资产名称')).toBeVisible();
  await expect(assetDialog.getByLabel('品牌', { exact: true })).toBeVisible();
  await expect(assetDialog.getByLabel('资产价值 (¥)')).toBeVisible();
  await expect(assetDialog.getByLabel('状态')).toBeVisible();
  await assetDialog.getByRole('button', { name: '取消' }).click();

  // 月度目标弹窗：目标金额
  await page.goto('/');
  await page.getByText('月度目标', { exact: false }).first().click();
  await expect(page.getByLabel('目标金额 (¥)')).toBeVisible();
});


test('首页按需加载汇总，手机设置导航保持单行', async ({ page }) => {
  const businessLists: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (['/api/orders', '/api/todos', '/api/brands', '/api/payments', '/api/assets', '/api/paid-promotions'].includes(path)) {
      businessLists.push(path);
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await registerFreshAccount(page);
  await expect(page.getByText('正在加载业务概览…')).toBeHidden();
  expect(businessLists).toEqual([]);
  await page.goto('/settings');
  const firstTab = page.getByRole('button', { name: '个人资料' });
  const lastTab = page.getByRole('button', { name: '关于项目' });
  const firstBox = await firstTab.boundingBox();
  const lastBox = await lastTab.boundingBox();
  expect(firstBox && lastBox).toBeTruthy();
  expect(Math.abs(firstBox!.y - lastBox!.y), '手机设置导航应横向排列').toBeLessThan(12);
});


test('商单导出保留零金额并转义公式标题', async ({ page }) => {
  await registerFreshAccount(page);
  const created = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '=1+1', type: 'paid', status: 'in_progress', actualAmount: 0 }),
    });
    return response.ok;
  });
  expect(created).toBe(true);
  await page.goto('/orders');
  await expect(page.getByText('=1+1').first()).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const download = await downloadPromise;
  const file = readFileSync(await download.path()!, 'utf8');
  expect(file).toContain(String.fromCharCode(34, 9) + '=1+1"');
  expect(file).toMatch(/,"0",/);
});
