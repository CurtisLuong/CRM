import { expect, type Page, test } from '@playwright/test';

// Curtis 30/10: mọi mục nhật ký cùng một khuôn — dòng đầu có icon + tên + đúng một ngày (ngoài khung);
// khung chỉ có khi có ghi chú: chữ bên trái, nút Sửa cố định cuối dòng trên.
// Dữ liệu đủ loại: gọi có/không ghi chú, ghi chú ngắn/dài, Zalo, việc, bậc.
const userId = 'tl-layout';
const NOW = new Date('2026-10-30T10:00:00+07:00');
const at = (day: number, hour: number, minute = 0) =>
  `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;
const LONG =
  'Khách muốn căn hai phòng ngủ tầng trung, hướng Đông Nam, đã hỏi kỹ về thủ tục vay ngân hàng và giấy tờ xác nhận thu nhập của hai vợ chồng.\nHẹn gửi bảng giá mới.';

const customer = {
  id: 'tl-layout-1',
  owner_id: userId,
  full_name: 'Khách Nhật Ký',
  phone: '0912345670',
  qualified_at: at(13, 15),
  care_stage: 'Đang chăm sóc',
  care_stage_updated_at: at(22, 9),
  sla_anchor_at: at(22, 9),
  registered_at: at(13, 15),
  created_at: at(13, 15),
  updated_at: at(29, 9),
  call_attempts: [
    { at: at(13, 15, 49), result: 'talked', note: 'Xác nhận quan tâm lúc nhập khách' },
    { at: at(22, 9, 39), result: 'no_answer', note: null },
    { at: at(25, 10), result: 'talked', note: LONG },
  ],
  notes_manual: [
    { at: at(16, 13), text: 'Ôi bạn ơi' },
    { at: at(16, 13, 16), text: 'Tada' },
    { at: at(26, 8), text: LONG },
  ],
  interactions: [{ at: at(27, 12), channel: 'zalo', kind: 'sent', note: 'Đã gửi thông tin dự án' }],
  next_tasks: [{ at: at(27, 13), text: 'Gửi hồ sơ mẫu', kind: 'docs', due: at(28, 9), done_at: at(28, 8) }],
  care_stage_history: [
    { at: at(13, 15, 49), stage: 'Đang chăm sóc', note: null },
    {
      at: at(22, 9, 43),
      stage: 'Đang chăm sóc',
      note: '📞 gọi 09:39, 22.10.2026 (0s) — Không nghe máy · hẹn gọi lại Thứ Sáu 23/10, 20:00–20:45',
    },
  ],
};

async function open(page: Page) {
  await page.clock.install({ time: NOW });
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'tl-layout@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-tl-token',
        refresh_token: 'synthetic-tl-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, row }) => {
      const request = indexedDB.open(`crm_khach_hang__${encodeURIComponent(uid)}`, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('queue'))
          db.createObjectStore('queue', { keyPath: 'opId', autoIncrement: true });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['customers', 'meta'], 'readwrite');
        tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, row: customer },
  );
  await page.goto(`/ho-so/${customer.id}`);
  await page.getByRole('tab', { name: /Dòng thời gian/ }).click();
  await expect(page.getByText('Tada', { exact: true })).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`nhật ký: mỗi mục một ngày ngoài khung, Sửa cuối dòng trên (${theme})`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page);
    const panel = page.getByRole('tabpanel', { name: /Dòng thời gian/ });

    // Mỗi mục (trong bậc + mốc bậc) có icon, tên và đúng một ngày.
    const steps = panel.locator('[data-timeline-group] ol ol > li');
    expect(await steps.count()).toBe(8); // 3 cuộc gọi + 3 ghi chú + Zalo + việc
    for (const step of await steps.all()) {
      await expect(step.locator('time')).toHaveCount(1);
      await expect(step.locator('[data-timeline-entry] svg')).toHaveCount(1);
    }
    const stageHeads = panel
      .locator('[data-timeline-header]')
      .filter({ has: page.getByRole('heading', { name: /^Bậc:/ }) });
    expect(await stageHeads.count()).toBe(2);
    for (const head of await stageHeads.all()) await expect(head.locator('time')).toHaveCount(1);

    // Không ghi chú → không khung; khung không chứa ngày.
    const noNote = steps.filter({ hasText: 'Không nghe máy' });
    await expect(noNote.locator('p')).toHaveCount(0);
    await expect(panel.locator('[data-entry-body] time')).toHaveCount(0);
    await expect(panel.getByText('Hạn 09:00 28/10/2026', { exact: true })).toBeVisible();

    const bodies = panel.locator('[data-entry-body]');
    expect(await bodies.count()).toBe(8); // 2 cuộc gọi có ghi chú + 3 ghi chú + Zalo + việc + 1 ghi chú mốc bậc
    expect(await page.getByRole('button', { name: /^Sửa ghi chú/ }).count()).toBe(4);
    const layouts = await bodies.evaluateAll((els) =>
      els.map((el) => {
        const r = (n: Element) => n.getBoundingClientRect();
        const button = el.querySelector(':scope > button');
        const text = el.querySelector(':scope > span');
        return {
          text: text?.textContent?.slice(0, 20) ?? '',
          body: { left: r(el).left, right: r(el).right, top: r(el).top },
          textBox: text ? { left: r(text).left, right: r(text).right, top: r(text).top } : null,
          button: button ? { right: r(button).right, top: r(button).top, left: r(button).left } : null,
        };
      }),
    );
    for (const item of layouts) {
      const where = `mục "${item.text}"`;
      expect(item.textBox, where).not.toBeNull();
      expect(Math.abs(item.textBox!.left - item.body.left), `${where}: chữ bắt đầu từ trái`).toBeLessThanOrEqual(1);
      if (item.button) {
        expect(Math.abs(item.button.right - item.body.right), `${where}: Sửa sát phải`).toBeLessThanOrEqual(1);
        expect(Math.abs(item.button.top - item.body.top), `${where}: Sửa ở dòng trên cùng`).toBeLessThanOrEqual(1);
        expect(item.textBox!.right, `${where}: chữ không đè nút Sửa`).toBeLessThanOrEqual(item.button.left);
      }
    }
    const width = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(width, 'không cuộn ngang').toBeLessThanOrEqual(0);
    await info.attach(`nhat-ky-${theme}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    // Bấm Sửa: ô sửa thay chỗ chữ; Huỷ trả lại như cũ.
    await page
      .getByRole('button', { name: /^Sửa ghi chú/ })
      .first()
      .click();
    await expect(page.getByRole('textbox', { name: 'Sửa ghi chú' })).toBeVisible();
    await page.getByRole('button', { name: 'Huỷ' }).click();
    await expect(page.getByRole('textbox', { name: 'Sửa ghi chú' })).toHaveCount(0);
  });
}
