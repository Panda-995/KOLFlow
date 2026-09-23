import { expect, type Page } from '@playwright/test';

/**
 * 注册一个全新账号并进入仪表盘。
 * 注意：多个 spec 共享同一 E2E 数据库，实例已存在用户时页面默认进入登录模式，
 * 因此这里先判断并按需切换到注册页签，避免依赖执行顺序。
 */
export const registerFreshAccount = async (page: Page, label = 'e2e'): Promise<string> => {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
  await page.goto('/');
  await expect(page.getByText('正在检查系统状态...')).toBeHidden();

  if (!(await page.getByLabel('邀请码').isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: '注册' }).click();
  }
  await expect(page.getByLabel('邀请码')).toBeVisible();

  await page.getByLabel('账号邮箱').fill(email);
  await page.getByLabel('密码').fill('KolFlow-E2E-2026!');
  await page.getByLabel('邀请码').fill('kolflow-e2e-invite');
  await page.getByRole('checkbox', { name: /我已阅读并同意/ }).check();
  await page.getByRole('button', { name: '注册', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
  return email;
};
