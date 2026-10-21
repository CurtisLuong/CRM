// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePhoneVN as appNormalizePhone } from '../../src/domain/customer/phone';
// @ts-expect-error Worker source is JavaScript (biên dịch bởi wrangler/esbuild).
import { handleFb, runCron } from '../../worker/fb-leads.js';
// @ts-expect-error Worker source is JavaScript.
import { runHealthCheck } from '../../worker/meta/health.js';
// @ts-expect-error Worker source is JavaScript.
import { parseFieldData, pickCustomer } from '../../worker/meta/mapping.js';
// @ts-expect-error Worker source is JavaScript.
import { normalizePhoneVN } from '../../worker/meta/phone.js';
// @ts-expect-error Worker source is JavaScript.
import { processQueueItem } from '../../worker/meta/process.js';
// @ts-expect-error Worker source is JavaScript.
import { createRun, runBackfill, vnRangeToEpoch } from '../../worker/meta/runs.js';
// @ts-expect-error Worker source is JavaScript.
import { signBody, validSignature } from '../../worker/meta/signature.js';
// @ts-expect-error Tool source is JavaScript.
import { buildPayload } from '../../worker/tools/simulate-meta-webhook.mjs';
import type { Row, World, WorldOptions } from './fb-fakes';
import { createWorld } from './fb-fakes';

const BODY_VECTOR =
  '{"object":"page","entry":[{"id":"111","time":1792375200,"changes":[{"field":"leadgen","value":{"leadgen_id":"444","page_id":"111","form_id":"222","ad_id":"333","adgroup_id":"555","created_time":1792375200}}]}]}';
const SIGNATURE_VECTOR = 'sha256=af73109237607c4f63bd109a0f31d4d63821450d30af141728887055a577d727';

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  FB_LEAD_OWNER_ID: 'owner-1',
  FB_PAGE_ID: '111',
  FB_PAGE_ACCESS_TOKEN: 'page-token',
  FB_APP_ID: 'app-1',
  FB_APP_SECRET: 'test-app-secret',
  FB_VERIFY_TOKEN: 'verify-1',
  FB_MANUAL_SECRET: 'manual-1',
  FB_BATCH_SIZE: '5',
};

function env(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const result: Record<string, string> = { ...BASE_ENV };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result;
}

function installWorld(options: WorldOptions = {}): World {
  const world = createWorld(options);
  vi.stubGlobal('fetch', world.fetch);
  return world;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function metaLead(id: string, phone: string, extra: Row = {}): Row {
  return {
    id,
    created_time: Math.floor(Date.now() / 1000),
    form_id: '222',
    field_data: [
      { name: 'full_name', values: [`Khách ${id}`] },
      { name: 'phone_number', values: [phone] },
    ],
    campaign_name: 'Chiến dịch A',
    ad_id: '333',
    ad_name: 'QC 1',
    campaign_id: 'campaign-1',
    adset_id: 'adset-1',
    adset_name: 'Nhóm 1',
    platform: 'fb',
    is_organic: false,
    ...extra,
  };
}

function processRow(id: string, lead?: Row, extra: Row = {}): Row {
  const payload: Row = { leadgen_id: id, page_id: '111', form_id: '222', form_name: 'Form A' };
  if (lead) payload.lead = lead;
  return {
    lead_id: id,
    page_id: '111',
    form_id: '222',
    owner_id: 'owner-1',
    via: 'poll',
    payload,
    attempts: 0,
    next_attempt_at: '2026-10-19T02:00:00.000Z',
    created_at: '2026-10-19T02:00:00.000Z',
    updated_at: '2026-10-19T02:00:00.000Z',
    ...extra,
  };
}

function webhookRequest(raw: string, signature = '', path = '/fb/webhook'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['X-Hub-Signature-256'] = signature;
  return new Request(`https://worker.test${path}`, { method: 'POST', headers, body: raw });
}

async function signedWebhook(raw: string, secret = BASE_ENV.FB_APP_SECRET): Promise<Request> {
  return webhookRequest(raw, await signBody(raw, secret));
}

function manualRequest(body: Row): Request {
  return new Request('https://worker.test/fb/manual', {
    method: 'POST',
    headers: { 'X-Intake-Secret': BASE_ENV.FB_MANUAL_SECRET || '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FIXED_NOW = new Date('2026-10-19T03:00:00.000Z'); // 10:00 giờ Việt Nam

describe('chữ ký webhook Meta', () => {
  it('nhận đúng vector số chuẩn và từ chối khi body/secret/header sai', async () => {
    expect(await validSignature(BODY_VECTOR, SIGNATURE_VECTOR, 'test-app-secret')).toBe(true);
    expect(await validSignature(BODY_VECTOR.replace('"444"', '"445"'), SIGNATURE_VECTOR, 'test-app-secret')).toBe(
      false,
    );
    expect(await validSignature(BODY_VECTOR, '', 'test-app-secret')).toBe(false);
    expect(await validSignature(BODY_VECTOR, SIGNATURE_VECTOR, 'sai-secret')).toBe(false);
  });

  it('GET verify trả challenge đúng, sai token 403 và không gọi mạng', async () => {
    const world = installWorld();
    const ok = await handleFb(
      new Request('https://worker.test/fb/webhook?hub.mode=subscribe&hub.verify_token=verify-1&hub.challenge=abc123'),
      env(),
      undefined,
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('abc123');

    const bad = await handleFb(
      new Request('https://worker.test/fb/webhook?hub.mode=subscribe&hub.verify_token=sai&hub.challenge=x'),
      env(),
      undefined,
    );
    expect(bad.status).toBe(403);
    expect(world.calls).toHaveLength(0);
  });

  it('chữ ký sai → 401 và không có lệnh ghi Supabase', async () => {
    const world = installWorld();
    const response = await handleFb(webhookRequest(BODY_VECTOR, 'sha256=deadbeef'), env(), undefined);
    expect(response.status).toBe(401);
    expect(world.supabaseCalls()).toHaveLength(0);
  });

  it('chữ ký đúng nhưng body đổi 1 byte → 401', async () => {
    const world = installWorld();
    const response = await handleFb(
      webhookRequest(BODY_VECTOR.replace('"444"', '"445"'), SIGNATURE_VECTOR),
      env(),
      undefined,
    );
    expect(response.status).toBe(401);
    expect(world.supabaseCalls()).toHaveLength(0);
  });
});

describe('webhook ghi hàng chờ trước khi trả 200', () => {
  it('2 leadgen_id trong 1 body → cả 2 vào hàng chờ rồi mới 200', async () => {
    const world = installWorld({
      graphLeads: { '444': metaLead('444', '0912345678'), '445': metaLead('445', '0987654321') },
      formNames: { '222': 'Form A' },
    });
    const raw = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: '111',
          time: 1792375200,
          changes: [
            {
              field: 'leadgen',
              value: { leadgen_id: '444', page_id: '111', form_id: '222', created_time: 1792375200 },
            },
            {
              field: 'leadgen',
              value: { leadgen_id: '445', page_id: '111', form_id: '222', created_time: 1792375200 },
            },
          ],
        },
      ],
    });
    const response = await handleFb(await signedWebhook(raw), env(), undefined);
    expect(response.status).toBe(200);
    expect(world.db.fb_lead_queue.map((row) => row.lead_id).sort()).toEqual(['444', '445']);

    const insertIndex = world.calls.findIndex(
      (call) => call.method === 'POST' && call.url.includes('/rest/v1/fb_lead_queue'),
    );
    const firstGraph = world.calls.findIndex((call) => call.url.startsWith('https://graph.facebook.com/'));
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(firstGraph).toBeGreaterThan(insertIndex);
    expect(world.db.customers).toHaveLength(2);
    expect(world.db.fb_leads.every((row) => row.status === 'created')).toBe(true);
  });

  it('Supabase lỗi khi ghi hàng chờ → 503 để Meta gửi lại', async () => {
    const world = installWorld({ failTable: 'fb_lead_queue' });
    const response = await handleFb(await signedWebhook(BODY_VECTOR), env(), undefined);
    expect(response.status).toBe(503);
    expect(world.db.fb_lead_queue).toHaveLength(0);
  });
});

describe('map dữ liệu lead', () => {
  it('chuẩn hoá SĐT đúng số chuẩn và khớp normalizePhoneVN của app', () => {
    const cases: Array<[string, string]> = [
      ['+84 912 345 678', '0912345678'],
      ['84912345678', '0912345678'],
      ['912345678', '0912345678'],
      ['0912.345.678', '0912345678'],
      ['(+84) 98-765-4321', '0987654321'],
      ['+1 650 555 1234', '16505551234'],
    ];
    for (const [raw, expected] of cases) {
      expect(normalizePhoneVN(raw)).toBe(expected);
      expect(appNormalizePhone(raw)).toBe(expected);
      expect(normalizePhoneVN(raw)).toBe(appNormalizePhone(raw));
    }
  });

  it('họ tên fallback last_name + first_name, rồi "Khách Facebook"', () => {
    const parsed = parseFieldData([
      { name: 'last_name', values: ['Nguyễn'] },
      { name: 'first_name', values: ['An'] },
    ]);
    expect(parsed.full_name).toBe('Nguyễn An');
    expect(parseFieldData([]).full_name).toBe('');
    expect(parseFieldData([{ name: 'full_name', values: ['  Trần B  '] }]).full_name).toBe('Trần B');
  });

  it('ghi khách mới đúng luật 1: kênh, cách nhập, chiến dịch, giờ đăng ký, bậc, không qualified_at', async () => {
    const world = installWorld();
    const response = await handleFb(
      manualRequest({
        lead_id: 'manual-1',
        full_name: '',
        phone: '+84 912 345 678',
        form_name: 'Form A',
        created_time: '2026-10-15T02:00:00.000Z',
        answers: { 'Bạn quan tâm loại căn nào?': '2 ngủ' },
      }),
      env(),
      undefined,
    );
    expect(response.status).toBe(200);
    const customer = world.db.customers[0] as Row;
    expect(customer.full_name).toBe('Khách Facebook');
    expect(customer.phone).toBe('0912345678');
    expect(customer.owner_id).toBe('owner-1');
    expect(customer.source).toEqual(['facebook_ads']);
    expect(customer.intake_method).toBe('api');
    expect(customer.campaign).toBe('Form A');
    expect(customer.registered_at).toBe('2026-10-15T02:00:00.000Z');
    expect(customer.care_stage).toBe('Đăng kí mới');
    expect(customer.care_stage_updated_at).toBe('2026-10-15T02:00:00.000Z');
    expect(customer.care_stage_history).toEqual([
      { stage: 'Đăng kí mới', note: 'Lead Facebook: Form A', at: '2026-10-15T02:00:00.000Z' },
    ]);
    // Luật ghi chú/loại căn đổi 2026-10-21 (Curtis) — kiểm ở test ML-03, không khoá ở đây.
    expect(customer).not.toHaveProperty('qualified_at');
  });

  it('campaign ưu tiên tên chiến dịch Meta', async () => {
    const world = installWorld();
    await handleFb(
      manualRequest({
        lead_id: 'manual-2',
        full_name: 'Chị B',
        phone: '0987654321',
        campaign: 'Chiến dịch X',
        form_name: 'Form A',
      }),
      env(),
      undefined,
    );
    expect((world.db.customers[0] as Row).campaign).toBe('Chiến dịch X');
  });
});

describe('chống trùng', () => {
  it('SĐT đã có → không POST customers, gọi fb_attach_lead với interaction đúng luật 6', async () => {
    const world = installWorld({
      customers: [
        {
          id: 'c1',
          owner_id: 'owner-1',
          phone: '0912345678',
          archived_at: null,
          updated_at: '2026-10-01T00:00:00Z',
          source: ['manual'],
        },
      ],
    });
    const response = await handleFb(
      manualRequest({
        lead_id: 'lead-9',
        full_name: 'Chị B',
        phone: '0912.345.678',
        form_name: 'Form A',
        created_time: '2026-10-15T02:00:00.000Z',
        answers: { 'Ngân sách': '2 tỷ' },
      }),
      env(),
      undefined,
    );
    expect(response.status).toBe(200);
    expect(world.tablePosts('customers')).toHaveLength(0);
    expect(world.db.customers).toHaveLength(1);
    expect(world.db.fb_leads[0]?.status).toBe('merged');

    const rpc = world.calls.find((call) => call.url.includes('/rpc/fb_attach_lead'));
    expect(rpc).toBeDefined();
    const body = JSON.parse(String(rpc?.body)) as { p_customer_id: string; p_interaction: Row };
    expect(body.p_customer_id).toBe('c1');
    expect(body.p_interaction).toMatchObject({
      at: '2026-10-15T02:00:00.000Z',
      channel: 'other',
      kind: 'lead_form',
      by: 'meta',
      origin: 'meta_lead_ads',
      lead_id: 'lead-9',
      form_name: 'Form A',
      campaign: 'Form A',
    });
    expect(String(body.p_interaction.note)).toContain('Ngân sách: 2 tỷ');
  });

  it('chọn khách theo thứ tự (a) của người nhận, (b) chưa lưu trữ, (c) đã lưu trữ', () => {
    const archivedOld = { id: 'arch-old', archived_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' };
    const archivedNew = { id: 'arch-new', archived_at: '2026-01-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' };
    const other = { id: 'other', archived_at: null, updated_at: '2026-10-01T00:00:00Z' };
    const own = { id: 'own', owner_id: 'owner-1', archived_at: null, updated_at: '2026-09-01T00:00:00Z' };
    const activeNew = { id: 'active-new', archived_at: null, updated_at: '2026-10-02T00:00:00Z' };

    expect(pickCustomer([archivedNew, other, own], 'owner-1')?.id).toBe('own');
    expect(pickCustomer([archivedNew, other, activeNew], 'owner-1')?.id).toBe('active-new');
    expect(pickCustomer([archivedOld, archivedNew], 'owner-1')?.id).toBe('arch-new');
    expect(pickCustomer([], 'owner-1')).toBeNull();
  });

  it('khách đã lưu trữ → vẫn merged nhưng ghi chú chưa mở lại', async () => {
    const world = installWorld({
      customers: [
        {
          id: 'c-arch',
          owner_id: 'owner-1',
          phone: '0912345678',
          archived_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-10T00:00:00Z',
          source: [],
        },
      ],
    });
    await handleFb(manualRequest({ lead_id: 'lead-arch', full_name: 'Anh C', phone: '0912345678' }), env(), undefined);
    expect(world.db.fb_leads[0]?.status).toBe('merged');
    expect(world.db.fb_leads[0]?.error).toBe('Khách đã lưu trữ — chưa mở lại');
    expect((world.db.customers[0] as Row).archived_at).toBe('2026-09-01T00:00:00Z');
  });

  it('POST customers trả 23505 → gắn vào khách tìm lại, không báo lỗi', async () => {
    const world = installWorld({
      createConflict: true,
      customers: [
        {
          id: 'c-late',
          owner_id: 'owner-1',
          phone: '0912345678',
          archived_at: null,
          updated_at: '2026-10-01T00:00:00Z',
        },
      ],
      customerLookups: [
        [],
        [
          {
            id: 'c-late',
            owner_id: 'owner-1',
            phone: '0912345678',
            archived_at: null,
            updated_at: '2026-10-01T00:00:00Z',
          },
        ],
      ],
    });
    const response = await handleFb(
      manualRequest({ lead_id: 'lead-race', full_name: 'Anh D', phone: '0912345678' }),
      env(),
      undefined,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'merged', customer_id: 'c-late' });
    expect(world.tablePosts('customers')).toHaveLength(1); // có thử tạo 1 lần rồi gắn
    expect(world.calls.filter((call) => call.url.includes('/rpc/fb_attach_lead'))).toHaveLength(1);
    expect(world.db.fb_leads[0]?.status).toBe('merged');
  });

  it('cùng leadgen_id qua webhook rồi cron → 1 khách, không gọi RPC lần 2', async () => {
    const lead = metaLead('444', '0912345678');
    const world = installWorld({
      customers: [
        {
          id: 'c1',
          owner_id: 'owner-1',
          phone: '0912345678',
          archived_at: null,
          updated_at: '2026-10-01T00:00:00Z',
          source: [],
        },
      ],
      graphLeads: { '444': lead },
      forms: [{ id: '222', name: 'Form A' }],
      formLeads: { '222': [lead] },
      formNames: { '222': 'Form A' },
    });
    const raw = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: '111',
          time: 1792375200,
          changes: [{ field: 'leadgen', value: { leadgen_id: '444', page_id: '111', form_id: '222' } }],
        },
      ],
    });
    await handleFb(await signedWebhook(raw), env(), undefined);
    expect(world.calls.filter((call) => call.url.includes('/rpc/fb_attach_lead'))).toHaveLength(1);

    await runCron(env());
    expect(world.db.customers).toHaveLength(1);
    expect(world.calls.filter((call) => call.url.includes('/rpc/fb_attach_lead'))).toHaveLength(1);
  });
});

describe('không mất lead', () => {
  it('Graph 500 → attempts 1, +5 phút, chưa ghi fb_leads', async () => {
    const row = processRow('L1');
    const world = installWorld({ queue: [row], leadErrors: { L1: { status: 500, message: 'boom' } } });
    const run = createRun(env(), { now: () => FIXED_NOW });
    const result = await processQueueItem(run, row);
    expect(result).toMatchObject({ status: 'retry', attempts: 1 });

    const queue = world.db.fb_lead_queue[0] as Row;
    expect(queue.attempts).toBe(1);
    expect(queue.next_attempt_at).toBe('2026-10-19T03:05:00.000Z');
    expect(world.db.fb_leads).toHaveLength(0);
  });

  it('lỗi lần 15 → dừng tự thử + fb_leads error giữ raw', async () => {
    const row = processRow('L15', undefined, { attempts: 14 });
    const world = installWorld({ queue: [row], leadErrors: { L15: { status: 500, message: 'boom' } } });
    const run = createRun(env(), { now: () => FIXED_NOW });
    const result = await processQueueItem(run, row);
    expect(result).toMatchObject({ status: 'stopped', attempts: 15 });

    const queue = world.db.fb_lead_queue[0] as Row;
    expect(queue.next_attempt_at).toBeNull();
    const log = world.db.fb_leads[0] as Row;
    expect(log.status).toBe('error');
    expect(log.raw).toBeTruthy();
  });

  it('Graph 190 → không đốt lượt thử, +1 giờ, health error ngay', async () => {
    const row = processRow('L190');
    const world = installWorld({
      queue: [row],
      leadErrors: { L190: { status: 400, code: 190, message: 'Invalid OAuth token' } },
    });
    const run = createRun(env(), { now: () => FIXED_NOW });
    const result = await processQueueItem(run, row);
    expect(result).toMatchObject({ status: 'blocked' });

    const queue = world.db.fb_lead_queue[0] as Row;
    expect(queue.attempts).toBe(0);
    expect(queue.next_attempt_at).toBe('2026-10-19T04:00:00.000Z');
    expect(world.db.integration_health[0]?.status).toBe('error');
  });

  it('lead không có SĐT → fb_leads error, done_at có giá trị, không tự thử', async () => {
    const row = processRow('L3', metaLead('L3', ''), { via: 'manual' });
    const world = installWorld({ queue: [row] });
    const run = createRun(env(), { now: () => FIXED_NOW });
    const result = await processQueueItem(run, row);
    expect(result).toMatchObject({ status: 'error', error: 'Lead không có số điện thoại' });

    const queue = world.db.fb_lead_queue[0] as Row;
    expect(queue.done_at).toBe('2026-10-19T03:00:00.000Z');
    expect(queue.attempts).toBe(0);
    expect(world.db.fb_leads[0]?.status).toBe('error');
    expect(world.db.fb_leads[0]?.error).toBe('Lead không có số điện thoại');
    expect(world.db.customers).toHaveLength(0);
  });

  it('thiếu secret bắt buộc → không đốt lượt thử, +1 giờ, health error nêu tên secret', async () => {
    const row = processRow('L4', metaLead('L4', '0912345678'));
    const world = installWorld({ queue: [row] });
    const missingOwner = env({ FB_LEAD_OWNER_ID: undefined });
    const run = createRun(missingOwner, { now: () => FIXED_NOW });
    const result = await processQueueItem(run, row);
    expect(result).toMatchObject({ status: 'blocked' });

    const queue = world.db.fb_lead_queue[0] as Row;
    expect(queue.attempts).toBe(0);
    expect(queue.next_attempt_at).toBe('2026-10-19T04:00:00.000Z');
    expect(String(world.db.integration_health[0]?.message)).toContain('FB_LEAD_OWNER_ID');
  });
});

describe('kéo bù', () => {
  it('quy đổi khoảng ngày giờ Việt Nam, bao gồm hai đầu', () => {
    expect(vnRangeToEpoch('2026-10-01', '2026-10-15')).toEqual({ since: 1790787600, until: 1792083599 });
    expect(vnRangeToEpoch('2026-02-31', '2026-03-01')).toBeNull();
    expect(vnRangeToEpoch('2026-10-15', '2026-10-01')).toBeNull();
  });

  it('chỉ đưa lead chưa có trong hàng chờ vào hàng chờ (via backfill)', async () => {
    const inRangeA = metaLead('A', '0912345670', { created_time: 1790787600 });
    const outside = metaLead('B', '0912345671', { created_time: 1790000000 });
    const inRangeC = metaLead('C', '0912345672', { created_time: 1792083599 });
    const world = installWorld({
      queue: [{ lead_id: 'A', via: 'poll', attempts: 0, next_attempt_at: '2026-10-20T00:00:00Z' }],
      forms: [{ id: '222', name: 'Form A' }],
      formLeads: { '222': [inRangeA, outside, inRangeC] },
    });

    const result = await runBackfill(env(), { since: '2026-10-01', until: '2026-10-15' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ forms: 1, found: 2, queued: 1, already: 1 });
    const added = world.db.fb_lead_queue.find((row) => row.lead_id === 'C');
    expect(added?.via).toBe('backfill');
    expect(world.db.fb_lead_queue).toHaveLength(2);
  });

  it('since cũ hơn 90 ngày → nhắc Meta chỉ giữ khoảng 90 ngày', async () => {
    installWorld({ forms: [{ id: '222', name: 'Form A' }], formLeads: { '222': [] } });
    const result = await runBackfill(env(), { since: '2020-01-01', until: '2020-01-02' });
    expect(String(result.body.note)).toContain('90 ngày');
  });

  it('sai X-Intake-Secret → 401, không gọi mạng', async () => {
    const world = installWorld();
    const response = await handleFb(
      new Request('https://worker.test/fb/backfill', {
        method: 'POST',
        headers: { 'X-Intake-Secret': 'sai', 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: '2026-10-01' }),
      }),
      env(),
      undefined,
    );
    expect(response.status).toBe(401);
    expect(world.calls).toHaveLength(0);
  });
});

describe('tình trạng kết nối', () => {
  it('token hết hạn trong 5 ngày → warning, nêu "5 ngày" và ngày dd/MM/yyyy', async () => {
    const expiresAt = Math.floor(Date.parse('2026-10-24T03:00:00Z') / 1000); // 24/10 10:00 +07
    installWorld({
      token: { is_valid: true, expires_at: expiresAt, data_access_expires_at: 0, scopes: ['leads_retrieval'] },
      subscribed: [{ subscribed_fields: ['leadgen'] }],
    });
    const ctx = createRun(env(), { now: () => FIXED_NOW });
    const row = await runHealthCheck(env(), ctx, { force: true });
    expect(row.status).toBe('warning');
    expect(row.token_expires_at).toBe('2026-10-24T03:00:00.000Z');
    expect(String(row.message)).toContain('5 ngày');
    expect(String(row.message)).toContain('24/10/2026');
    expect(String(row.message)).not.toContain('2026-10-24');
  });

  it('expires_at = 0 → token_expires_at null, không cảnh báo hạn', async () => {
    installWorld({
      token: { is_valid: true, expires_at: 0, data_access_expires_at: 0, scopes: ['leads_retrieval'] },
      subscribed: [{ subscribed_fields: ['leadgen'] }],
    });
    const ctx = createRun(env(), { now: () => FIXED_NOW });
    const row = await runHealthCheck(env(), ctx, { force: true });
    expect(row.status).toBe('ok');
    expect(row.token_expires_at).toBeNull();
  });

  it('đã kiểm token trong 24 giờ → không gọi Graph lại (trừ khi force)', async () => {
    const world = installWorld({
      health: {
        id: 'meta_lead_ads',
        status: 'ok',
        message: null,
        details: {
          token_checked_at: FIXED_NOW.toISOString(),
          token: { is_valid: true, expires_at: 0, scopes: ['leads_retrieval'] },
          webhook_subscribed: true,
        },
      },
    });
    const ctx = createRun(env(), { now: () => FIXED_NOW });
    const row = await runHealthCheck(env(), ctx);
    expect(row.status).toBe('ok');
    expect(world.graphCalls()).toHaveLength(0);
  });

  it('thiếu secret → error nêu đúng tên secret', async () => {
    installWorld();
    const ctx = createRun(env({ FB_APP_SECRET: undefined }), { now: () => FIXED_NOW });
    const row = await runHealthCheck(env({ FB_APP_SECRET: undefined }), ctx, { force: true });
    expect(row.status).toBe('error');
    expect(String(row.message)).toContain('FB_APP_SECRET');
  });

  it('token mất hiệu lực / thiếu quyền / có lead kẹt / chưa đăng ký webhook', async () => {
    installWorld({
      token: { is_valid: false, expires_at: 0, scopes: [] },
      subscribed: [{ subscribed_fields: ['leadgen'] }],
    });
    let ctx = createRun(env(), { now: () => FIXED_NOW });
    expect((await runHealthCheck(env(), ctx, { force: true })).status).toBe('error');

    installWorld({
      token: { is_valid: true, expires_at: 0, scopes: ['pages_show_list'] },
      subscribed: [{ subscribed_fields: ['leadgen'] }],
    });
    ctx = createRun(env(), { now: () => FIXED_NOW });
    expect((await runHealthCheck(env(), ctx, { force: true })).status).toBe('error');

    installWorld({
      token: { is_valid: true, expires_at: 0, scopes: ['leads_retrieval'] },
      subscribed: [{ subscribed_fields: ['leadgen'] }],
      queue: [{ lead_id: 'stuck-1', next_attempt_at: null, created_at: '2026-10-18T00:00:00Z' }],
    });
    ctx = createRun(env(), { now: () => FIXED_NOW });
    const stuck = await runHealthCheck(env(), ctx, { force: true });
    expect(stuck.status).toBe('error');
    expect(stuck.stuck_count).toBe(1);
    expect(String(stuck.message)).toContain('1 lead');

    installWorld({
      token: { is_valid: true, expires_at: 0, scopes: ['leads_retrieval'] },
      subscribed: [],
    });
    ctx = createRun(env(), { now: () => FIXED_NOW });
    const noWebhook = await runHealthCheck(env(), ctx, { force: true });
    expect(noWebhook.status).toBe('warning');
    expect(String(noWebhook.message)).toContain('webhook');
  });
});

describe('ngân sách gọi mạng', () => {
  it('20 lead đang chờ, 1 lượt cron → xử lý ≤ FB_BATCH_SIZE và ≤ 45 fetch', async () => {
    const queue: Row[] = [];
    const graphLeads: Record<string, Row> = {};
    for (let index = 0; index < 20; index++) {
      const id = `Q${String(index).padStart(2, '0')}`;
      const phone = `09000000${String(index).padStart(2, '0')}`;
      const lead = metaLead(id, phone);
      graphLeads[id] = lead;
      queue.push(processRow(id, lead, { next_attempt_at: `2020-01-01T00:00:${String(index).padStart(2, '0')}Z` }));
    }
    const world = installWorld({ queue, graphLeads, forms: [] });

    const summary = await runCron(env());
    expect(summary.processed).toBe(5);
    expect(world.db.customers).toHaveLength(5);
    expect(world.calls.length).toBeLessThanOrEqual(45);
  });
});

describe('script giả lập webhook', () => {
  it('body + header ký đúng, kiểm lại bằng hàm của Worker', async () => {
    const { raw, headers } = await buildPayload({}, 'test-app-secret');
    expect(raw).toBe(BODY_VECTOR);
    expect(headers['X-Hub-Signature-256']).toBe(SIGNATURE_VECTOR);
    expect(await validSignature(raw, headers['X-Hub-Signature-256'], 'test-app-secret')).toBe(true);
  });
});
