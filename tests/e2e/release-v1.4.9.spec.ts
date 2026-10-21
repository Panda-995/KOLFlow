import { expect, test, type Page } from '@playwright/test';
import { registerFreshAccount } from './helpers';
import type { Asset, Order, Payment } from '../../src/types';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

const api = async <T>(page: Page, path: string): Promise<T> => {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const response = await page.request.get(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<T>;
};

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`PRODUCTS-01 IMAGES-01 TEMPLATES-01 ABOUT-01 费用、多产品与图片 ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await registerFreshAccount(page, 'products');
    await page.goto('/orders');
    await page.getByRole('button', { name: '新建', exact: true }).click();
    await page.getByLabel('商单标题', { exact: true }).fill('费用与赠品组合');
    await page.getByLabel('合作品牌', { exact: true }).fill('产品测试品牌');
    await page.getByLabel('合作类型', { exact: true }).click();
    await page.getByRole('option', { name: '费用+产品', exact: true }).click();
    await page.getByLabel('金额 (¥)', { exact: true }).fill('1888.88');
    await page.getByLabel('产品名称 1', { exact: true }).fill('无线耳机');
    await page.getByLabel('产品价值 1 (¥)', { exact: true }).fill('199.10');
    await page.getByRole('button', { name: '添加产品', exact: true }).click();
    await page.getByLabel('产品名称 2', { exact: true }).fill('机械键盘');
    await page.getByLabel('产品价值 2 (¥)', { exact: true }).fill('299.20');
    await page.screenshot({ path: `test-results/v1.4.9-products-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '新建商单' })).toBeHidden();
    let orders = await api<Order[]>(page, '/orders');
    expect(orders).toHaveLength(1);
    expect(orders[0].actualAmount).toBe(1888.88);
    expect(orders[0].productValue).toBe(498.3);
    expect(orders[0].products).toHaveLength(2);
    const retainedId = orders[0].products![0].id;
    await page.getByRole('button', { name: '编辑商单 费用与赠品组合', exact: true }).click();
    await expect(page.getByLabel('产品名称 2', { exact: true })).toHaveValue('机械键盘');
    await page.getByRole('button', { name: '移除产品 2', exact: true }).click();
    await page.getByRole('button', { name: '添加产品', exact: true }).click();
    await page.getByLabel('产品名称 2', { exact: true }).fill('便携音箱');
    await page.getByLabel('产品价值 2 (¥)', { exact: true }).fill('100');
    await page.getByLabel('状态', { exact: true }).click();
    await page.getByRole('option', { name: '已完成', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑商单' })).toBeHidden();
    orders = await api<Order[]>(page, '/orders');
    expect(orders[0].products![0].id).toBe(retainedId);
    expect(orders[0].products!.map(product => product.productName)).toEqual(['无线耳机', '便携音箱']);
    expect((await api<Payment[]>(page, '/payments'))[0].amount).toBe(1888.88);
    expect(await api<Asset[]>(page, '/assets')).toHaveLength(2);

    await page.goto('/assets');
    await page.getByRole('button', { name: '上传资产图片: 无线耳机', exact: true }).click();
    await expect(page.getByRole('button', { name: '添加产品图片' })).toBeEnabled();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64');
    await page.getByLabel('选择产品图片').setInputFiles([
      { name: 'first.png', mimeType: 'image/png', buffer: png },
      { name: 'second.png', mimeType: 'image/png', buffer: png },
    ]);
    await expect(page.getByRole('button', { name: '查看产品图 2', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看产品图 2', exact: true }).click();
    await expect(page.getByRole('img', { name: '无线耳机 产品图 2', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/v1.4.9-images-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: '删除产品图 1', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看产品图 2', exact: true })).toBeHidden();
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '查看资产图片: 无线耳机', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看产品图 1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '查看产品图 2', exact: true })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();

    await page.goto('/orders');
    await page.getByRole('button', { name: '新建模板', exact: true }).click();
    await page.getByLabel('模板名称', { exact: true }).fill('组合产品模板');
    await page.getByLabel('商单标题', { exact: true }).fill('模板组合合作');
    await page.getByLabel('模板合作类型').click();
    await page.getByRole('option', { name: '费用+产品', exact: true }).click();
    await page.getByLabel('金额 (¥)', { exact: true }).fill('500');
    await page.getByLabel('产品名称 1', { exact: true }).fill('鼠标');
    await page.getByRole('button', { name: '添加产品', exact: true }).click();
    await page.getByLabel('产品名称 2', { exact: true }).fill('鼠标垫');
    await page.getByRole('button', { name: '创建模板', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '新建商单模板' })).toBeHidden();
    await page.getByRole('button', { name: '使用模板“组合产品模板”创建商单' }).click();
    await expect.poll(async () => (await api<Order[]>(page, '/orders')).length).toBe(2);
    const templated = (await api<Order[]>(page, '/orders')).find(order => order.title === '模板组合合作')!;
    expect(templated.actualAmount).toBe(500);
    expect(templated.products!.map(product => product.productName)).toEqual(['鼠标', '鼠标垫']);

    await page.goto('/settings');
    await page.getByRole('button', { name: '关于项目', exact: true }).click();
    await expect(page.getByTestId('app-version')).toHaveText(`当前版本 v${version}`);
    expect(errors).toEqual([]);
  });
}
