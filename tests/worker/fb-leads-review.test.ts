// @vitest-environment node
// Lead review ML-01: phân trang Graph khi quét/kéo bù, token hỏng phát hiện ở lượt quét, mã lead Make không lộ SĐT.
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { handleFb, runCron } from '../../worker/fb-leads.js';
// @ts-expect-error Worker source is JavaScript.
import { runBackfill } from '../../worker/meta/runs.js';
import type { Row } from './fb-fakes';
import { createWorld } from './fb-fakes';

const ENV: Record<string, string> = {
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  FB_LEAD_OWNER_ID: 'owner-1',
  FB_PAGE_ID: '111',
  FB_PAGE_ACCESS_TOKEN: 'page-token',
  FB_APP_ID: 'app-1',
  FB_APP_SECRET: 'test-app-secret',
  FB_VERIFY_TOKEN: 'verify-1',
  FB_MANUAL_SECRET: 'manual-1',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const lead = (id: string, created: number): Row => ({
  id,
  created_time: created,
  form_id: '222',
  field_data: [
    { name: 'full_name', values: [`Khách ${id}`] },
    { name: 'phone_number', values: [`09${id.padStart(8, '0')}`] },
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('phân trang Graph (không bỏ sót lead > 100/form)', () => {
  it('kéo bù đọc cả trang 2 theo paging.next', async () => {
    const since = 1790787600; // 01/10/2026 00:00 +07
    const page1 = Array.from({ length: 100 }, (_, i) => lead(String(1000 + i), since + 10 + i));
    const page2 = [lead('2000', since + 500), lead('2001', since + 501)];
    const world = createWorld({ forms: [{ id: '222', name: 'Form A' }] });
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('after=p2')) return Promise.resolve(json({ data: page2 }));
      if (url.includes('/222/leads?'))
        return Promise.resolve(
          json({ data: page1, paging: { next: 'https://graph.facebook.com/v26.0/222/leads?after=p2' } }),
        );
      return world.fetch(input, init);
    });
    const result = await runBackfill(ENV, { since: '2026-10-01', until: '2026-10-15' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ found: 102, queued: 102 });
    expect(result.body.note ?? '').not.toContain('chưa đọc hết');
    expect(world.db.fb_lead_queue.some((row) => row.lead_id === '2001')).toBe(true);
  });

  it('hết ngân sách giữa chừng → báo còn lead chưa đọc, không im lặng', async () => {
    const world = createWorld({ forms: [{ id: '222', name: 'Form A' }] });
    let n = 0;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/leads?') || url.includes('after=')) {
        n += 1;
        return Promise.resolve(
          json({
            data: [lead(String(5000 + n), 1790787700)],
            paging: { next: `https://graph.facebook.com/v26.0/222/leads?after=p${n + 1}` },
          }),
        );
      }
      return world.fetch(input, init);
    });
    const result = await runBackfill(ENV, { since: '2026-10-01', until: '2026-10-15' });
    expect(result.status).toBe(200);
    expect(String(result.body.note)).toContain('chưa đọc hết');
    expect(n).toBeLessThanOrEqual(45);
    expect(result.body.queued).toBeGreaterThan(0);
  });
});

describe('token hỏng phát hiện ngay ở lượt quét', () => {
  it('Graph 190 khi liệt kê form → health error, lượt sau buộc kiểm lại token', async () => {
    const world = createWorld({
      health: {
        id: 'meta_lead_ads',
        status: 'ok',
        details: { token_checked_at: new Date().toISOString(), token: { is_valid: true, scopes: ['leads_retrieval'] } },
      },
    });
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('leadgen_forms')) {
        return Promise.resolve(json({ error: { message: 'Session expired', code: 190 } }, 400));
      }
      return world.fetch(input, init);
    });
    await runCron(ENV);
    const health = world.db.integration_health[0];
    expect(health?.status).toBe('error');
    expect(String(health?.message)).toContain('Token Facebook');
    expect((health?.details as Row | undefined)?.token_checked_at).toBeUndefined();
  });
});

describe('Make/Zapier không gửi lead_id', () => {
  it('mã lead thay thế không chứa SĐT', async () => {
    const world = createWorld();
    vi.stubGlobal('fetch', world.fetch);
    const response = await handleFb(
      new Request('https://worker.test/fb/manual', {
        method: 'POST',
        headers: { 'X-Intake-Secret': 'manual-1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: 'Nguyễn Văn A', phone: '0912345678', created_time: '2026-10-19T02:00:00Z' }),
      }),
      ENV,
      undefined,
    );
    expect(response.status).toBe(200);
    const queued = world.db.fb_lead_queue[0];
    expect(String(queued?.lead_id)).toMatch(/^manual-[0-9a-f]{24}$/);
    expect(String(queued?.lead_id)).not.toContain('0912345678');
    expect(world.db.customers).toHaveLength(1);
  });
});

describe('cảnh báo nói đúng lý do lead chưa vào CRM', () => {
  it('lead lỗi chờ quá 1 giờ → error kèm lỗi gần nhất, che cảnh báo webhook khi Meta vẫn đang gọi', async () => {
    const old = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const world = createWorld({
      health: {
        id: 'meta_lead_ads',
        status: 'warning',
        last_webhook_at: new Date(Date.now() - 600 * 1000).toISOString(),
        details: {
          token_checked_at: new Date().toISOString(),
          token: { is_valid: true, scopes: ['leads_retrieval'], expires_at: 0 },
          webhook_subscribed: false,
        },
      },
      queue: [
        {
          lead_id: 'L1',
          via: 'webhook',
          attempts: 3,
          next_attempt_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          last_error: 'permission denied for table fb_leads',
          created_at: old,
          updated_at: old,
        },
      ],
    });
    vi.stubGlobal('fetch', world.fetch);
    await runCron({ ...ENV, FB_PAGE_ACCESS_TOKEN: 'page-token' });
    const health = world.db.integration_health[0];
    expect(health?.status).toBe('error');
    expect(String(health?.message)).toContain('permission denied for table fb_leads');
    expect(String(health?.message)).not.toContain('webhook');
  });
});

describe('form đặt tên trường tiếng Việt (form thật của Curtis)', () => {
  it('nhận số_điện_thoại / tên_đầy_đủ như phone_number / full_name', async () => {
    // @ts-expect-error Worker source is JavaScript.
    const { parseFieldData } = await import('../../worker/meta/mapping.js');
    const parsed = parseFieldData([
      { name: 'anh/chị_quan_tâm_căn_mấy_phòng_ngủ_ạ?', values: ['2 phòng ngủ'] },
      { name: 'tên_đầy_đủ', values: ['Nguyễn Văn A'] },
      { name: 'số_điện_thoại', values: ['+84912345678'] },
      { name: 'inbox_url', values: [''] },
    ]);
    expect(parsed.full_name).toBe('Nguyễn Văn A');
    expect(parsed.phone).toBe('0912345678');
    expect(parsed.lines).toContain('anh/chị quan tâm căn mấy phòng ngủ ạ?: 2 phòng ngủ');
    expect(
      parseFieldData([
        { name: 'Họ và tên', values: ['B'] },
        { name: 'SĐT', values: ['0987 654 321'] },
      ]),
    ).toMatchObject({
      full_name: 'B',
      phone: '0987654321',
    });
  });
});
