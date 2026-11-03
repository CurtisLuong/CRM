// @vitest-environment node
// Nhiều Page: mỗi Page có token riêng (Page token chỉ đọc được lead của chính Page đó).
// Page chính FB_PAGE_ID/FB_PAGE_ACCESS_TOKEN giữ nguyên; Page thêm FB_PAGE_ID_2/FB_PAGE_ACCESS_TOKEN_2 …
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { handleFb, runCron } from '../../worker/fb-leads.js';
// @ts-expect-error Worker source is JavaScript.
import { runHealthCheck } from '../../worker/meta/health.js';
// @ts-expect-error Worker source is JavaScript.
import { configuredPages, pageFor } from '../../worker/meta/pages.js';
// @ts-expect-error Worker source is JavaScript.
import { redactError } from '../../worker/meta/process.js';
// @ts-expect-error Worker source is JavaScript.
import { createRun, runBackfill } from '../../worker/meta/runs.js';
// @ts-expect-error Worker source is JavaScript.
import { signBody } from '../../worker/meta/signature.js';
import type { Row, World, WorldOptions } from './fb-fakes';
import { createWorld } from './fb-fakes';

const ENV: Record<string, string> = {
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  FB_LEAD_OWNER_ID: 'owner-1',
  FB_PAGE_ID: '111',
  FB_PAGE_ACCESS_TOKEN: 'page-token',
  FB_PAGE_ID_2: '999',
  FB_PAGE_ACCESS_TOKEN_2: 'page-token-2',
  FB_APP_ID: 'app-1',
  FB_APP_SECRET: 'test-app-secret',
  FB_VERIFY_TOKEN: 'verify-1',
  FB_MANUAL_SECRET: 'manual-1',
};

function env(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const result = { ...ENV };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result;
}

interface PagesOptions extends WorldOptions {
  formsByPage?: Record<string, Row[]>;
  tokens?: Record<string, Row>;
  subscribedByPage?: Record<string, Row[]>;
}

// Bọc thế giới giả: danh sách form / debug_token / subscribed_apps khác nhau theo Page.
function installWorld(options: PagesOptions = {}): World {
  const world = createWorld(options);
  const base = world.fetch;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://graph.facebook.com/')) {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean).slice(1);
      const reply = (body: unknown) => {
        world.calls.push({ url, method: 'GET', body: null });
        return new Response(JSON.stringify(body), { status: 200 });
      };
      if (parts[1] === 'leadgen_forms' && options.formsByPage) {
        return reply({ data: options.formsByPage[parts[0] || ''] || [] });
      }
      if (parts[0] === 'debug_token' && options.tokens) {
        const token = options.tokens[parsed.searchParams.get('input_token') || ''];
        if (token) return reply({ data: token });
      }
      if (parts[1] === 'subscribed_apps' && options.subscribedByPage) {
        return reply({ data: options.subscribedByPage[parts[0] || ''] || [] });
      }
    }
    return base(input, init);
  };
  vi.stubGlobal('fetch', fetch);
  return world;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NOW = new Date('2026-11-03T03:00:00.000Z');

function metaLead(id: string, phone: string, formId: string): Row {
  return {
    id,
    created_time: Math.floor(NOW.getTime() / 1000) - 600,
    form_id: formId,
    field_data: [
      { name: 'full_name', values: [`Khách ${id}`] },
      { name: 'phone_number', values: [phone] },
    ],
    campaign_name: 'Chiến dịch mới',
  };
}

function tokenOf(call: { url: string }): string | null {
  return new URL(call.url).searchParams.get('access_token');
}

describe('cấu hình nhiều Page', () => {
  it('đọc Page chính + Page thêm; lead không rõ Page → Page chính', () => {
    const pages = configuredPages(env({ FB_PAGE_ID_3: '333' }));
    expect(pages.map((page: Row) => [page.index, page.id, page.token])).toEqual([
      [1, '111', 'page-token'],
      [2, '999', 'page-token-2'],
      [3, '333', ''],
    ]);
    expect(pageFor(env(), '999').token).toBe('page-token-2');
    expect(pageFor(env(), null).id).toBe('111');
    expect(pageFor(env(), '555').id).toBe('111');
  });

  it('che token của Page thêm trong câu lỗi', () => {
    expect(redactError(new Error('bad page-token-2 here'), env())).toBe('bad [ẩn] here');
  });
});

describe('lead của Page thêm', () => {
  it('webhook từ Page 2 → đọc lead bằng token Page 2, tạo khách, page_id = Page 2', async () => {
    const world = installWorld({ graphLeads: { '701': metaLead('701', '0912000001', 'f-2') } });
    const raw = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: '999',
          time: 1793000000,
          changes: [{ field: 'leadgen', value: { leadgen_id: '701', page_id: '999', form_id: 'f-2' } }],
        },
      ],
    });
    const request = new Request('https://worker.test/fb/webhook', {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': await signBody(raw, ENV.FB_APP_SECRET) },
      body: raw,
    });
    const response = await handleFb(request, env(), undefined);
    expect(response.status).toBe(200);

    const leadCall = world.graphCalls().find((call) => new URL(call.url).pathname.endsWith('/701'));
    expect(leadCall && tokenOf(leadCall)).toBe('page-token-2');
    expect(world.db.customers).toHaveLength(1);
    expect(world.db.fb_leads[0]).toMatchObject({ status: 'created', page_id: '999' });
  });

  it('Page 2 có mã mà thiếu token → không đốt lượt thử, báo đúng tên secret', async () => {
    const world = installWorld({
      queue: [
        {
          lead_id: '702',
          page_id: '999',
          form_id: 'f-2',
          via: 'webhook',
          payload: { leadgen_id: '702', page_id: '999' },
          attempts: 0,
          next_attempt_at: '2026-11-03T02:00:00.000Z',
          created_at: '2026-11-03T02:00:00.000Z',
        },
      ],
    });
    await runCron(env({ FB_PAGE_ACCESS_TOKEN_2: undefined }), { now: () => NOW });
    const row = world.db.fb_lead_queue[0];
    expect(row?.attempts).toBe(0);
    expect(String(row?.last_error)).toContain('FB_PAGE_ACCESS_TOKEN_2');
    expect(String(world.db.integration_health[0]?.message)).toContain('FB_PAGE_ACCESS_TOKEN_2');
  });
});

describe('quét và kéo bù mọi Page', () => {
  it('cron quét form của cả 2 Page bằng đúng token, hàng chờ ghi đúng Page', async () => {
    const world = installWorld({
      formsByPage: { '111': [{ id: 'f-1', name: 'Form cũ' }], '999': [{ id: 'f-2', name: 'Form mới' }] },
      formLeads: { 'f-1': [metaLead('801', '0912000011', 'f-1')], 'f-2': [metaLead('802', '0912000012', 'f-2')] },
    });
    const summary = await runCron(env(), { now: () => NOW });
    expect(summary).toMatchObject({ forms: 2, found: 2, queued: 2 });

    const byLead = Object.fromEntries(world.db.fb_lead_queue.map((row) => [row.lead_id, row.page_id]));
    expect(byLead).toEqual({ '801': '111', '802': '999' });
    const formsCall = world.graphCalls().find((call) => call.url.includes('/999/leadgen_forms'));
    const leadsCall = world.graphCalls().find((call) => call.url.includes('/f-2/leads'));
    expect(formsCall && tokenOf(formsCall)).toBe('page-token-2');
    expect(leadsCall && tokenOf(leadsCall)).toBe('page-token-2');
    expect(world.db.customers).toHaveLength(2);
  });

  it('token Page 2 hỏng → Page chính vẫn được quét, tình trạng báo lỗi', async () => {
    const world = installWorld({
      formsByPage: { '111': [{ id: 'f-1', name: 'Form cũ' }] },
      formLeads: { 'f-1': [metaLead('811', '0912000021', 'f-1')] },
    });
    const base = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/999/leadgen_forms')) {
        return new Response(JSON.stringify({ error: { code: 190, message: 'expired' } }), { status: 400 });
      }
      return base(input, init);
    });
    const summary = await runCron(env(), { now: () => NOW });
    expect(summary.queued).toBe(1);
    expect(world.db.fb_lead_queue[0]?.page_id).toBe('111');
    expect(world.db.integration_health[0]?.status).toBe('error');
  });

  it('kéo bù lấy lead của cả 2 Page', async () => {
    const world = installWorld({
      formsByPage: { '111': [{ id: 'f-1', name: 'Form cũ' }], '999': [{ id: 'f-2', name: 'Form mới' }] },
      formLeads: {
        'f-1': [{ ...metaLead('821', '0912000031', 'f-1'), created_time: 1793500000 }],
        'f-2': [{ ...metaLead('822', '0912000032', 'f-2'), created_time: 1793500000 }],
      },
    });
    const result = await runBackfill(env(), { since: '2026-11-01', until: '2026-11-03' });
    expect(result.body).toMatchObject({ forms: 2, found: 2, queued: 2 });
    expect(world.db.fb_lead_queue.find((row) => row.lead_id === '822')?.page_id).toBe('999');
  });
});

describe('tình trạng kết nối nhiều Page', () => {
  it('cả 2 Page ổn → ok; kiểm token từng Page', async () => {
    const world = installWorld({
      tokens: {
        'page-token': { is_valid: true, scopes: ['leads_retrieval'], expires_at: 0 },
        'page-token-2': { is_valid: true, scopes: ['leads_retrieval'], expires_at: 0 },
      },
      subscribedByPage: { '111': [{ subscribed_fields: ['leadgen'] }], '999': [{ subscribed_fields: ['leadgen'] }] },
    });
    const health = await runHealthCheck(env(), createRun(env(), { now: () => NOW }), { force: true });
    expect(health.status).toBe('ok');
    const inputs = world
      .graphCalls()
      .filter((call) => call.url.includes('debug_token'))
      .map((call) => new URL(call.url).searchParams.get('input_token'));
    expect(inputs).toEqual(['page-token', 'page-token-2']);
  });

  it('token Page 2 mất hiệu lực → error nêu Page số 2', async () => {
    installWorld({
      tokens: {
        'page-token': { is_valid: true, scopes: ['leads_retrieval'], expires_at: 0 },
        'page-token-2': { is_valid: false, scopes: [], expires_at: 0 },
      },
      subscribedByPage: { '111': [{ subscribed_fields: ['leadgen'] }], '999': [{ subscribed_fields: ['leadgen'] }] },
    });
    const health = await runHealthCheck(env(), createRun(env(), { now: () => NOW }), { force: true });
    expect(health.status).toBe('error');
    expect(health.message).toContain('Page số 2');
  });

  it('Page 2 chưa đăng ký webhook → warning nêu Page số 2', async () => {
    installWorld({
      tokens: {
        'page-token': { is_valid: true, scopes: ['leads_retrieval'], expires_at: 0 },
        'page-token-2': { is_valid: true, scopes: ['leads_retrieval'], expires_at: 0 },
      },
      subscribedByPage: { '111': [{ subscribed_fields: ['leadgen'] }], '999': [] },
    });
    const health = await runHealthCheck(env(), createRun(env(), { now: () => NOW }), { force: true });
    expect(health.status).toBe('warning');
    expect(health.message).toContain('Page số 2');
  });
});
