import { expect, type Page, test } from '@playwright/test';

// M1 (D-023 luật L3 + L5): không màn nào hiện mã lưu DB, ngày ISO, "[object Object]", chữ nội bộ;
// một khách có trường sai kiểu không được làm trắng màn. Dữ liệu giả, offline (Supabase giả 127.0.0.1).

const userId = 'm1-e2e-user';
const now = Date.now();
const iso = (days: number, hour = 9) => {
  const d = new Date(now + days * 864e5);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const okCustomer = (i: number, stage: string, source: string, intake: string) => ({
  id: `m1-ok-${i}`,
  owner_id: userId,
  full_name: `Khách M1 số ${i}`,
  phone: `09120000${10 + i}`,
  care_stage: stage,
  care_stage_updated_at: iso(-3),
  sla_anchor_at: iso(-2),
  interest_level: 85,
  source,
  intake_method: intake,
  registered_at: iso(-10),
  created_at: iso(-10),
  updated_at: iso(-1),
  qualified_at: stage === 'Đăng kí mới' ? null : iso(-8),
  call_attempts: [
    { at: iso(-3, 10), result: 'no_answer', note: null, duration: 0 },
    { at: iso(-2, 11), result: 'busy', note: null, duration: 20 },
    { at: iso(-1, 15), result: 'talked', note: 'Hỏi giá căn 2PN', duration: 185 },
  ],
  next_call_at: iso(0, 8),
  next_tasks: [{ at: iso(-2), text: 'Gửi bảng giá', kind: 'other', due: iso(0, 7), due_allday: false }],
  notes: 'Đăng ký từ form',
  notes_manual: [{ at: iso(-2), text: 'Vợ chồng làm KCN' }],
  care_stage_history: [{ at: iso(-8), stage, note: '' }],
});

const customers = [
  okCustomer(1, 'Đang chăm sóc', 'facebook_ads', 'ocr'),
  okCustomer(2, 'Xem dự án', 'website', 'manual'),
  okCustomer(3, 'Đăng kí mới', 'referral', 'import'),
  okCustomer(4, 'Đang tiếp cận', 'facebook_ads', 'api'),
  {
    // Dữ liệu lạ: trường văn bản là object, mảng có phần tử sai kiểu (v1/thiết bị cũ có thể ghi).
    ...okCustomer(9, 'Đang chăm sóc', 'facebook_ads', 'manual'),
    id: 'm1-bad',
    full_name: 'Khách dữ liệu lạ',
    notes: { at: iso(-1), text: 'object thay vì chuỗi' },
    campaign: { name: 'TD-T10' },
  },
  {
    // Ca thật đã gặp khi khảo sát 2026-10-18: notes là mảng object → Hôm nay trắng màn (React #31).
    ...okCustomer(8, 'Xem dự án', 'website', 'manual'),
    id: 'm1-bad2',
    full_name: 'Khách ghi chú dạng mảng',
    notes: [{ at: iso(-1), text: 'mảng thay vì chuỗi' }],
  },
];

const FORBIDDEN: [string, RegExp][] = [
  ['mã kết quả gọi', /\b(no_answer|unreachable|line_busy|hung_up|wrong_number|busy|talked)\b/],
  ['mã nguồn', /\b(facebook_ads|website|referral)\b/],
  ['mã cách nhập', /\b(manual|ocr|import|api)\b/],
  ['ngày ISO', /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/],
  ['object thô', /\[object Object\]|\bundefined\b|\bNaN\b/],
  ['chữ nội bộ', /\bD-0\d\d\b|Next Best Action/],
  ['trắng màn', /Unexpected Application Error/],
];

async function seed(page: Page) {
  await page.route('http://127.0.0.1:54321/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.addInitScript((uid) => {
    const user = {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'm1@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    };
    localStorage.setItem('crm_last_user', JSON.stringify({ id: uid, email: user.email }));
    localStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-e2e-token',
        refresh_token: 'synthetic-e2e-refresh',
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, userId);
  await page.goto('/');
  await page.evaluate(
    async ({ uid, rows }) => {
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
        for (const row of rows) tx.objectStore('customers').put(row);
        tx.objectStore('meta').put({ key: 'legacy-imported', at: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { uid: userId, rows: customers },
  );
}

const ROUTES = [
  '/',
  '/khach-hang',
  '/khach-moi',
  '/cong-viec',
  '/hieu-qua',
  '/thong-bao',
  '/ho-so/m1-ok-1',
  '/ho-so/m1-ok-2',
  '/ho-so/m1-bad',
  '/ho-so/m1-bad2',
];

for (const path of ROUTES) {
  test(`M1 ${path}: không mã thô, không ISO, không trắng màn`, async ({ page }) => {
    await seed(page);
    await page.goto(path);
    await expect(page.locator('main').first()).toBeVisible();
    await page.waitForTimeout(800);
    const text = await page.locator('body').innerText();
    const hits = FORBIDDEN.flatMap(([name, re]) => {
      const m = text.match(re);
      return m ? [`${name}: "${m[0]}"`] : [];
    });
    expect(hits, `Chữ cấm trên ${path}`).toEqual([]);
  });
}
