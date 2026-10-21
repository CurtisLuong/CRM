import { expect, type Page, test } from '@playwright/test';

// PF-04: menu ⋮ có nhóm (ô lưới Khách hàng / Công cụ + hàng Cài đặt), Giao diện một hàng Sáng | Tối | Tự động.

async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('Menu: 3 nhóm đúng thứ tự, mục có nhãn ngắn; chọn mục đóng sheet rồi điều hướng', async ({ page }) => {
  await page.goto('/');
  const dialog = await openMenu(page);

  for (const title of ['Khách hàng', 'Công cụ', 'Cài đặt']) {
    await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  for (const label of [
    'Khách mới',
    'Tệp & Retarget',
    'Khách đã lưu trữ',
    'Giỏ hàng',
    'Tính khoản vay',
    'Thao tác nhanh',
    'Nhập / Xuất dữ liệu',
    'Thông báo',
    'Đồng nghiệp',
    'Cài đặt',
  ]) {
    await expect(dialog.getByRole('button', { name: label, exact: true })).toBeVisible();
  }

  await dialog.getByRole('button', { name: 'Tính khoản vay', exact: true }).click();
  await expect(page).toHaveURL('/tinh-vay');
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden();
});

test('Menu: chọn Tối đổi giao diện ngay, menu vẫn mở và radio đang chọn', async ({ page }) => {
  await page.goto('/');
  const dialog = await openMenu(page);
  const group = dialog.getByRole('radiogroup', { name: 'Giao diện' });

  await group.getByRole('radio', { name: 'Tối' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(dialog).toBeVisible();
  await expect(group.getByRole('radio', { name: 'Tối' })).toBeChecked();
});

test('Menu: sheet không cuộn ngang, mọi ô/hàng chạm được ≥ 44px', async ({ page }) => {
  await page.goto('/');
  const dialog = await openMenu(page);
  // Đo sau khi sheet trượt lên xong — đo giữa hiệu ứng làm lệch toạ độ khi máy bận (Lead vá, chập chờn ở phone-390).
  await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));

  const fit = await dialog.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const scroller = el.querySelector<HTMLElement>('.overflow-y-auto');
    const boxes = [...el.querySelectorAll('button')].map((button) => button.getBoundingClientRect());
    return {
      right: rect.right,
      scrollWidth: scroller?.scrollWidth ?? 0,
      clientWidth: scroller?.clientWidth ?? 0,
      maxRight: Math.max(...boxes.map((box) => box.right)),
      minHeight: Math.min(...boxes.map((box) => box.height)),
    };
  });

  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 1);
  expect(fit.maxRight).toBeLessThanOrEqual(fit.right + 1);
  expect(fit.minHeight).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Đổi sang Tối vẫn không tràn ngang (token đổi bề mặt, bố cục giữ nguyên).
  await dialog.getByRole('radiogroup', { name: 'Giao diện' }).getByRole('radio', { name: 'Tối' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
