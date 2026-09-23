import { expect, test } from '@playwright/test';
import { registerFreshAccount } from './helpers';

// 任务与日程页全流程：列表视图（新建/完成/删除/筛选/搜索）+ 日历视图（月份切换、按日新建）+ 深链
test('任务与日程页完整流程可用', async ({ page }) => {
  await registerFreshAccount(page, 'todos-flow');

  // 先建一个品牌，用于"关联品牌（分类）"下拉
  const token = await page.evaluate(() => localStorage.getItem('token'));
  await page.request.post('/api/brands', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name: '日程品牌', industry: '数码', contact: '张三', phone: '13800000000' },
  });

  await page.goto('/todos?tab=list');
  await expect(page.getByRole('heading', { name: '任务与日程' })).toBeVisible();

  // 新建任务（含品牌下拉与优先级）
  await page.getByRole('button', { name: '新建任务' }).click();
  await page.getByLabel('任务内容').fill('拍摄产品图');
  await page.getByLabel('关联品牌').click();
  await page.getByRole('option', { name: '日程品牌' }).click();
  await page.getByRole('button', { name: '高', exact: true }).click();
  await page.getByRole('button', { name: '保存任务' }).click();
  // 保存完成后弹窗必须关闭
  await expect(page.getByLabel('任务内容')).toBeHidden();
  await expect(page.getByText('拍摄产品图')).toBeVisible();
  await expect(page.getByRole('button', { name: '日程品牌' })).toBeVisible();

  // 再建一条个人任务（不关联品牌），用于筛选/搜索
  await page.getByRole('button', { name: '新建任务' }).click();
  await page.getByLabel('任务内容').fill('整理素材库');
  await page.getByRole('button', { name: '保存任务' }).click();
  await expect(page.getByLabel('任务内容')).toBeHidden();
  await expect(page.getByText('整理素材库')).toBeVisible();

  // 状态过滤：勾选完成后应出现在"已完成"筛选里
  await page.getByRole('button', { name: '标记完成 拍摄产品图' }).click();
  await page.getByRole('button', { name: /^已完成/ }).click();
  await expect(page.getByText('拍摄产品图')).toBeVisible();
  await expect(page.getByText('整理素材库')).toBeHidden();
  await page.getByRole('button', { name: /全部任务/ }).click();

  // 品牌筛选
  await page.getByRole('button', { name: '日程品牌' }).first().click();
  await expect(page.getByText('整理素材库')).toBeHidden();
  await page.getByRole('button', { name: '全部品牌' }).click();

  // 搜索
  await page.getByLabel('搜索任务').fill('素材');
  await expect(page.getByText('整理素材库')).toBeVisible();
  await expect(page.getByText('拍摄产品图')).toBeHidden();
  await page.getByLabel('搜索任务').fill('');

  // 日历视图：切月、回到今天、按日新建
  await page.getByRole('button', { name: '日历' }).click();
  const monthTitle = page.locator('h2').first();
  const initialMonth = await monthTitle.textContent();
  await page.getByRole('button', { name: '上个月' }).click();
  await expect(monthTitle).not.toHaveText(initialMonth || '');
  await page.getByRole('button', { name: '今天' }).click();
  await page.locator('button.hover-visible').first().click({ force: true });
  await expect(page.getByLabel('任务内容')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('任务内容')).toBeHidden();

  // 删除任务（确认弹窗）
  await page.getByRole('button', { name: '列表' }).click();
  await page.getByRole('button', { name: '删除任务 整理素材库' }).click();
  await expect(page.getByRole('heading', { name: '确认删除任务' })).toBeVisible();
  await page.getByRole('button', { name: '确认删除' }).click();
  // 确认框文案里也含任务名，这里按精确文本断言列表项已消失
  await expect(page.getByText('整理素材库', { exact: true })).toBeHidden();
});

// 深链 ?new=1 直接打开新建表单；?tab=list 进入列表视图
test('任务页深链参数生效', async ({ page }) => {
  await registerFreshAccount(page, 'todos-link');

  await page.goto('/todos?new=1');
  await expect(page.getByLabel('任务内容')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('任务内容')).toBeHidden();

  await page.goto('/todos?tab=list');
  await expect(page.getByText('状态过滤')).toBeVisible();
});
