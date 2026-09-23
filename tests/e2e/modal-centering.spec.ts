import { expect, test, type Page } from '@playwright/test';
import { registerFreshAccount } from './helpers';

/** 弹窗中心与视口中心的偏差（像素） */
const modalCenterOffset = async (page: Page, modalSelector: string) => {
  return page.evaluate(selector => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      dx: Math.abs((rect.left + rect.right) / 2 - window.innerWidth / 2),
      dy: Math.abs((rect.top + rect.bottom) / 2 - window.innerHeight / 2),
      parentIsBody: node.closest('[data-modal-backdrop]')?.parentElement === document.body,
    };
  }, modalSelector);
};

test('弹窗相对视口居中，且不随内容区滚动移动', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await registerFreshAccount(page, 'modal-center');

  // 造一条商单与一个品牌
  const token = await page.evaluate(() => localStorage.getItem('token'));
  await page.request.post('/api/orders', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { title: '居中校验商单', type: 'paid', status: 'in_progress', actualAmount: 500, brandName: '居中品牌' },
  });
  await page.request.post('/api/brands', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name: '居中品牌', industry: '测试' },
  });

  // === 商单详情弹窗 ===
  await page.goto('/orders');
  await page.getByRole('button', { name: /查看商单 居中校验商单/ }).click();
  const orderDialog = page.getByRole('dialog', { name: '商单详情' });
  await expect(orderDialog).toBeVisible();

  const offsetBefore = await modalCenterOffset(page, '[role="dialog"][aria-label="商单详情"]');
  expect(offsetBefore, '应能找到商单详情弹窗').not.toBeNull();
  expect(offsetBefore!.dx, '水平方向应居中于视口').toBeLessThanOrEqual(2);
  expect(offsetBefore!.dy, '垂直方向应居中于视口').toBeLessThanOrEqual(2);
  // 弹窗必须挂在 body 下（不受内容板块的 transform/滚动容器影响）
  const inBody = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="商单详情"]');
    return dialog?.parentElement?.parentElement === document.body;
  });
  expect(inBody, '弹窗应挂在 body 下而不是页面容器内').toBe(true);

  // 滚动内容区后弹窗位置不应改变
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = 400;
  });
  await page.waitForTimeout(150);
  const offsetAfter = await modalCenterOffset(page, '[role="dialog"][aria-label="商单详情"]');
  expect(Math.abs(offsetAfter!.dy - offsetBefore!.dy), '滚动内容区不应移动弹窗').toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(orderDialog).toBeHidden();

  // === 品牌编辑弹窗 ===
  await page.goto('/brands');
  await page.getByRole('button', { name: /编辑品牌 居中品牌/ }).click();
  const brandDialog = page.getByRole('dialog', { name: '编辑品牌信息' });
  await expect(brandDialog).toBeVisible();
  const brandOffset = await modalCenterOffset(page, '[role="dialog"][aria-label="编辑品牌信息"]');
  expect(brandOffset!.dx).toBeLessThanOrEqual(2);
  expect(brandOffset!.dy).toBeLessThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(brandDialog).toBeHidden();

  // === 删除确认框（ConfirmDialog）===
  await page.getByRole('button', { name: /删除品牌 居中品牌/ }).click();
  const confirmDialog = page.getByRole('alertdialog', { name: '确认删除品牌' });
  await expect(confirmDialog).toBeVisible();
  const confirmOffset = await modalCenterOffset(page, '[role="alertdialog"][aria-label="确认删除品牌"]');
  expect(confirmOffset!.dx).toBeLessThanOrEqual(2);
  expect(confirmOffset!.dy).toBeLessThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(confirmDialog).toBeHidden();
});
