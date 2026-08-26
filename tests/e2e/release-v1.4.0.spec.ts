import { expect, test, type Page } from '@playwright/test';

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: unknown;
};

const api = async <T>(page: Page, path: string, options: ApiOptions = {}): Promise<T> => {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token, '浏览器应持有登录令牌').toBeTruthy();
  const response = await page.request.fetch(path, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: options.data,
  });
  const body = await response.text();
  expect(response.ok(), `${options.method || 'GET'} ${path}: ${body}`).toBeTruthy();
  return body ? JSON.parse(body) as T : {} as T;
};

test('v1.4.0 商单模板、周期通知、旧数据兼容与核心页面', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByText('正在检查系统状态...')).toBeHidden();
  await page.getByLabel('账号邮箱').fill(`release-${Date.now()}@example.com`);
  await page.getByLabel('密码').fill('KolFlow-E2E-2026!');
  await page.getByLabel('邀请码').fill('kolflow-e2e-invite');
  await page.getByRole('checkbox', { name: /我已阅读并同意/ }).check();
  await page.getByRole('button', { name: '注册', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();

  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: '商单管理' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '商单模板' })).toBeVisible();
  await page.getByRole('button', { name: '新建模板' }).click();
  await page.getByLabel('模板名称').fill('月度推广模板');
  await page.getByLabel('合作品牌').fill('E2E 品牌');
  await page.getByLabel('商单标题').fill('月度推广合作');
  await page.getByLabel('合作类型').selectOption('paid');
  await page.getByLabel('金额 (¥)').fill('3888');
  await page.getByLabel('发布平台').fill('小红书, 抖音');
  await page.getByRole('button', { name: '创建模板' }).click();
  await expect(page.getByText('商单模板已创建')).toBeVisible();
  await expect(page.getByRole('heading', { name: '月度推广模板' })).toBeVisible();

  await page.getByRole('button', { name: '编辑模板“月度推广模板”' }).click();
  await page.getByLabel('商单标题').fill('月度推广合作（已更新）');
  await page.getByLabel('发布平台').fill('小红书, 抖音, B站');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('商单模板已更新')).toBeVisible();
  await expect(page.getByText('月度推广合作（已更新）').first()).toBeVisible();

  const createFromTemplate = page.getByRole('button', { name: '使用模板“月度推广模板”创建商单' });
  await createFromTemplate.click();
  await expect.poll(async () => (await api<unknown[]>(page, '/api/orders')).length).toBe(1);
  await createFromTemplate.click();
  await expect.poll(async () => (await api<unknown[]>(page, '/api/orders')).length).toBe(2);

  const orders = await api<Array<{
    id: string;
    orderNo: string;
    title: string;
    type: string;
    actualAmount: number;
    brandName: string;
    platforms: string[];
    acceptDate: string;
  }>>(page, '/api/orders');
  expect(new Set(orders.map(order => order.id)).size).toBe(2);
  expect(new Set(orders.map(order => order.orderNo)).size).toBe(2);
  expect(orders.every(order => order.title === '月度推广合作（已更新）')).toBe(true);
  expect(orders.every(order => order.acceptDate === new Date().toLocaleDateString('sv-SE'))).toBe(true);
  const todos = await api<Array<{ orderId?: string }>>(page, '/api/todos');
  expect(todos.filter(todo => orders.some(order => order.id === todo.orderId))).toHaveLength(2);
  const brands = await api<Array<{ name: string }>>(page, '/api/brands');
  expect(brands.some(brand => brand.name === 'E2E 品牌')).toBe(true);

  await api(page, `/api/orders/${orders[0].id}`, {
    method: 'PUT',
    data: { status: 'completed', operationDate: orders[0].acceptDate },
  });
  await api(page, '/api/paid-promotions', {
    method: 'POST',
    data: { orderId: orders[0].id, platform: '小红书薯条', amount: 88 },
  });
  const settings = await api<Record<string, unknown>>(page, '/api/settings');
  await api(page, '/api/settings', {
    method: 'PUT',
    data: { ...settings, weeklyReport: true, reportFrequency: 'weekly' },
  });

  await page.reload();
  await expect(page.getByRole('button', { name: /通知中心/ })).toBeVisible();
  await page.getByRole('button', { name: /通知中心/ }).click();
  await expect(page.getByText('本周数据汇总已生成').first()).toBeVisible();
  const reportMessage = page.getByText(/1\/2 个商单已完成.*待收 ¥3,888.*推广费 ¥88/).first();
  await expect(reportMessage).toBeVisible();
  await reportMessage.click();
  await expect(page).toHaveURL(/\/analytics\?period=weekly&start=\d{4}-\d{2}-\d{2}&end=\d{4}-\d{2}-\d{2}/);
  const reportUrl = new URL(page.url());
  await expect(page.getByText(`${reportUrl.searchParams.get('start')} 至 ${reportUrl.searchParams.get('end')}`)).toBeVisible();
  await expect(page.getByText('1 已完成')).toBeVisible();
  await expect(page.getByText('¥88')).toBeVisible();
  await expect(page.getByText('50.0%')).toBeVisible();

  const pages: Array<[string, string, string]> = [
    ['仪表盘', '/', '仪表盘'],
    ['商单', '/orders', '商单管理'],
    ['账单', '/billing', '账单管理'],
    ['Todo', '/todos', '任务与日程'],
    ['品牌', '/brands', '品牌/客户管理'],
    ['资产库', '/assets', '资产库'],
    ['统计', '/analytics', '数据统计'],
    ['日志', '/logs', '操作日志'],
    ['设置', '/settings', '系统设置'],
  ];
  for (const [navName, path, heading] of pages) {
    await page.getByRole('link', { name: new RegExp(`^${navName}`) }).last().click();
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : `${path}$`}`));
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  }

  const legacyBackup = {
    backupVersion: 2,
    exportedAt: new Date().toISOString(),
    orders: [{
      id: 'legacy-order-1',
      orderNo: 'LEGACY-001',
      title: '旧版本商单',
      type: 'paid',
      status: 'in_progress',
      actualAmount: 1200,
      brandName: '旧品牌',
      platforms: ['微博'],
      acceptDate: new Date().toLocaleDateString('sv-SE'),
      submitDate: null,
    }],
    brands: [{
      id: 'legacy-brand-1',
      name: '旧品牌',
      industry: '测试',
      contact: '旧联系人',
      phone: '',
      totalOrders: 1,
      totalIncome: 0,
    }],
    payments: [],
    todos: [],
    publishLinks: [],
    paidPromotions: [],
    comments: [],
    assets: [],
  };
  await page.getByRole('button', { name: '数据管理' }).click();
  await page.getByRole('button', { name: /导入数据/ }).locator('input[type="file"]').setInputFiles({
    name: 'kolflow-v2-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyBackup)),
  });
  await expect(page.getByRole('heading', { name: '确认导入数据' })).toBeVisible();
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('数据导入成功').last()).toBeVisible();

  await page.goto('/orders');
  await expect(page.getByText('旧版本商单')).toBeVisible();
  await expect(page.getByText('暂无模板，点击创建第一个常用商单模板')).toBeVisible();
  expect(await api<unknown[]>(page, '/api/order-templates')).toEqual([]);
  await page.getByRole('button', { name: /暂无模板/ }).click();
  await page.getByLabel('模板名称').fill('兼容后新模板');
  await page.getByLabel('商单标题').fill('兼容验证商单');
  await page.getByRole('button', { name: '创建模板' }).click();
  await expect(page.getByRole('heading', { name: '兼容后新模板' })).toBeVisible();
  const exported = await api<{ backupVersion: number; orderTemplates: unknown[] }>(page, '/api/data/export');
  expect(exported.backupVersion).toBe(3);
  expect(exported.orderTemplates).toHaveLength(1);

  await page.getByRole('button', { name: '删除模板“兼容后新模板”' }).click();
  await page.getByRole('button', { name: '删除模板', exact: true }).click();
  await expect(page.getByText('旧版本商单')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
