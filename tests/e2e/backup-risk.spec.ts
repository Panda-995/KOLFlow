import { expect, test } from '@playwright/test';
import { registerFreshAccount } from './helpers';

// 备份可恢复性风险：提示条会消失，必须在"数据管理"页留档可回看，并可手动忽略
test('备份风险提示可在数据管理页回看并手动忽略', async ({ page }) => {
  await registerFreshAccount(page, 'backup-risk');

  // 真实触发"体积/条数超限"需要构造超大备份，这里直接写入留档记录（写入路径见单测）
  await page.evaluate(() => {
    const userId = localStorage.getItem('userId') || 'anonymous';
    localStorage.setItem(`kolflow.backupRisk:${encodeURIComponent(userId)}`, JSON.stringify({
      warnings: ['集合 orders 有 300000 条，超过单次导入上限 200000，这份备份将无法直接恢复'],
      at: new Date().toISOString(),
      source: 'export',
    }));
  });

  await page.goto('/settings');
  await page.getByRole('button', { name: '数据管理' }).click();
  const notice = page.getByRole('alert');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('最近一次备份存在风险');
  await expect(notice).toContainText('超过单次导入上限');

  // 忽略后立刻消失
  await page.getByRole('button', { name: '忽略备份风险提示' }).click();
  await expect(notice).toBeHidden();

  // 刷新后仍然不再出现（确实清除了记录，而不是只隐藏了 DOM）
  await page.reload();
  await page.getByRole('button', { name: '数据管理' }).click();
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.getByText('导出备份')).toBeVisible();
});
