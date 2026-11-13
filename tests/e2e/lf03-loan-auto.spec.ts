import { expect, test } from '@playwright/test';

// LF-03 (Curtis 06/11): Giá thuần tự tính (nhập tay ghi đè, xoá trống về tự tính); Số tiền vay tự động 70%,
// nhập tay tối đa 80%, % và số tiền kéo theo nhau; xoá trống về 70%.
test('LF-03: giá thuần + số tiền vay tự điền, ghi đè và về tự động', async ({ page }) => {
  await page.goto('/tinh-vay?code=R30413&area=53.6&pricePerM2=19911530');
  await page.getByLabel('Ngày ký hợp đồng', { exact: true }).fill('2026-10-05');
  await page.getByLabel('Ngày bàn giao', { exact: true }).fill('2027-11-15');
  const net = page.getByLabel('Giá thuần', { exact: true });
  const ltv = page.getByLabel('Tỷ lệ vay', { exact: true });
  const amount = page.getByLabel('Tiền vay', { exact: true });
  const priceTable = page.getByRole('table', { name: 'Phiếu giá', exact: true });

  // Tự tính: 53,6 × 19,91153 tr = 1067,258 tr; 70% của (thuần + VAT 5%) = 784,435 tr.
  await expect(net).toHaveValue('1067.258');
  await expect(ltv).toHaveValue('70');
  await expect(amount).toHaveValue('784.435');
  await expect(page.getByText('(diện tích × đơn giá)')).toBeVisible();

  // Nhập tay giá thuần 1.000 tr → gộp VAT 1.050 tr → vay 70% = 735 tr.
  await net.fill('1000');
  await net.press('Tab');
  await expect(priceTable).toContainText('1.000.000.000');
  await expect(amount).toHaveValue('735');

  // Nhập số tiền 630 tr → tỷ lệ tự thành 60%.
  await amount.fill('630');
  await amount.press('Tab');
  await expect(ltv).toHaveValue('60');
  await expect(page.getByText('Đã nhập tay · tối đa 80% = 840.000.000đ · xoá trống về 70%')).toBeVisible();

  // Vượt 80% bị kẹp ở 840 tr / 80%.
  await amount.fill('900');
  await amount.press('Tab');
  await expect(amount).toHaveValue('840');
  await expect(ltv).toHaveValue('80');

  // Sửa tỷ lệ 75% → số tiền 787,5 tr; gõ 90% bị kẹp 80%.
  await ltv.fill('75');
  await ltv.press('Tab');
  await expect(amount).toHaveValue('787.5');
  await ltv.fill('90');
  await ltv.press('Tab');
  await expect(ltv).toHaveValue('80');
  await expect(amount).toHaveValue('840');

  // Xoá trống số tiền vay → về 70%.
  await amount.fill('');
  await amount.press('Tab');
  await expect(ltv).toHaveValue('70');
  await expect(amount).toHaveValue('735');

  // Xoá trống giá thuần → về tự tính.
  await net.fill('');
  await expect(net).toHaveValue('');
  await net.press('Tab');
  await expect(net).toHaveValue('1067.258');
  await expect(priceTable).toContainText('1.067.258.008');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
