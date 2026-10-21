// @vitest-environment node
// ML-03: câu trả lời form Meta vào đúng trường khách — loại căn dùng mã chuẩn, "Dự kiến mua" thành một
// gạch đầu dòng Ghi chú, không còn khối "Ghi chú đăng ký" dài; dự án tự điền theo quy tắc chiến dịch.
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { parseFieldData } from '../../worker/meta/mapping.js';
// @ts-expect-error Worker source is JavaScript.
import { processQueueItem } from '../../worker/meta/process.js';
// @ts-expect-error Worker source is JavaScript.
import { createRun } from '../../worker/meta/runs.js';
import type { Row, WorldOptions } from './fb-fakes';
import { createWorld } from './fb-fakes';

const ENV: Record<string, string> = {
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  FB_LEAD_OWNER_ID: 'owner-1',
  FB_PAGE_ID: '111',
  FB_PAGE_ACCESS_TOKEN: 'page-token',
  FB_APP_SECRET: 'test-app-secret',
  FB_MANUAL_SECRET: 'manual-1',
};

const NOW = new Date('2026-10-21T03:00:00.000Z'); // 10:00 giờ Việt Nam
const FORM_AT = '2026-10-21T02:03:04.000Z';
const TIMING_TEXT = 'Dự kiến mua: trong tháng này (ưu tiên xem căn sớm)';
const APT_QUESTION = 'anh/chị_quan_tâm_căn_mấy_phòng_ngủ_ạ?';
const TIMING_QUESTION = 'kế_hoạch_tìm_hiểu/mua_căn_hộ_của_anh/chị_dự_kiến_khi_nào?';

// Đúng 5 trường của form thật Curtis gửi 21/10/2026.
const REAL_FIELD_DATA: Row[] = [
  { name: APT_QUESTION, values: ['1_ngủ'] },
  { name: TIMING_QUESTION, values: ['trong_tháng_này_(ưu_tiên_xem_căn_sớm)'] },
  { name: 'tên_đầy_đủ', values: ['Nguyễn Văn A'] },
  { name: 'số_điện_thoại', values: ['+84912345678'] },
  { name: 'inbox_url', values: ['https://m.me/curtis.lead?ref=abc'] },
];

const IDENTITY_FIELDS: Row[] = [
  { name: 'tên_đầy_đủ', values: ['Nguyễn Văn A'] },
  { name: 'số_điện_thoại', values: ['+84912345678'] },
];

function metaLead(fieldData: Row[], extra: Row = {}): Row {
  return {
    id: 'lead-real',
    created_time: FORM_AT,
    form_id: '222',
    campaign_name: 'TC_Form_HighIntent_T10',
    ad_name: 'QC tháng 10',
    page_id: '111',
    field_data: fieldData,
    ...extra,
  };
}

function queueRow(lead: Row, id = 'lead-real'): Row {
  return {
    lead_id: id,
    page_id: '111',
    form_id: '222',
    owner_id: 'owner-1',
    via: 'webhook',
    payload: { leadgen_id: id, page_id: '111', form_id: '222', form_name: 'Form tháng 10', lead },
    attempts: 0,
    next_attempt_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Giả lập Supabase + bảng quy tắc `lead_campaign_projects` (SQL/v2/009). */
function installWorld(options: WorldOptions = {}, rules: Row[] | 'error' = []) {
  const world = createWorld(options);
  const counter = { ruleCalls: 0 };
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/rest/v1/lead_campaign_projects')) {
      counter.ruleCalls += 1;
      return Promise.resolve(rules === 'error' ? json({ message: 'lỗi giả lập' }, 500) : json(rules));
    }
    return world.fetch(input, init);
  });
  return { world, counter };
}

function runNow() {
  return createRun(ENV, { now: () => NOW });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('form thật của Curtis (21/10/2026)', () => {
  it('khách mới: loại căn vào apt_type, Dự kiến mua là 1 gạch đầu dòng, không ghi notes', async () => {
    const { world } = installWorld();
    const result = await processQueueItem(runNow(), queueRow(metaLead(REAL_FIELD_DATA)));
    expect(result).toMatchObject({ status: 'created' });

    const customer = world.db.customers[0] as Row;
    expect(customer.apt_type).toBe('1N-1WC');
    expect(customer).not.toHaveProperty('notes');
    expect(customer.notes_manual).toEqual([
      { text: TIMING_TEXT, at: FORM_AT, origin: 'meta_lead_ads', lead_id: 'lead-real' },
    ]);

    // Các trường ML-01 giữ nguyên.
    expect(customer.full_name).toBe('Nguyễn Văn A');
    expect(customer.phone).toBe('0912345678');
    expect(customer.campaign).toBe('TC_Form_HighIntent_T10');
    expect(customer.registered_at).toBe(FORM_AT);
    expect(customer.source).toEqual(['facebook_ads']);
    expect(customer.intake_method).toBe('api');
    expect(customer.care_stage).toBe('Đăng kí mới');

    // Không rơi tên/SĐT/link inbox vào Ghi chú.
    const notes = JSON.stringify(customer.notes_manual);
    expect(notes).not.toContain('0912345678');
    expect(notes).not.toContain('Nguyễn');
    expect(notes.toLowerCase()).not.toContain('inbox');
  });
});

describe('luật 1 — loại căn', () => {
  it('chưa_xác_định → không apt_type, câu hỏi loại căn thành gạch đầu dòng', async () => {
    const fieldData = [{ name: APT_QUESTION, values: ['chưa_xác_định'] }];
    const parsed = parseFieldData(fieldData);
    expect(parsed.apt_type).toBeNull();
    expect(parsed.bullets).toEqual(['anh chị quan tâm căn mấy phòng ngủ ạ: chưa xác định']);

    const { world } = installWorld();
    await processQueueItem(runNow(), queueRow(metaLead([...fieldData, ...IDENTITY_FIELDS])));
    const customer = world.db.customers[0] as Row;
    expect(customer).not.toHaveProperty('apt_type');
    expect(customer.notes_manual).toEqual([
      {
        text: 'anh chị quan tâm căn mấy phòng ngủ ạ: chưa xác định',
        at: FORM_AT,
        origin: 'meta_lead_ads',
        lead_id: 'lead-real',
      },
    ]);
  });

  it('2_phòng_ngủ → 2N-2WC (dùng canonicalAptType của app)', () => {
    expect(parseFieldData([{ name: APT_QUESTION, values: ['2_phòng_ngủ'] }]).apt_type).toBe('2N-2WC');
  });
});

describe('luật 4 — câu hỏi khác', () => {
  it('"ngân_sách?" = "2_tỷ" → "ngân sách: 2 tỷ"; email cũng thành gạch đầu dòng', () => {
    const parsed = parseFieldData([
      { name: 'ngân_sách?', values: ['2_tỷ'] },
      { name: 'email', values: ['a@b.c'] },
      ...IDENTITY_FIELDS,
    ]);
    expect(parsed.apt_type).toBeNull();
    expect(parsed.bullets).toEqual(['ngân sách: 2 tỷ', 'email: a@b.c']);
  });

  it('câu hỏi dự kiến mua → đúng một gạch đầu dòng "Dự kiến mua: …"', () => {
    const parsed = parseFieldData(REAL_FIELD_DATA);
    expect(parsed.bullets).toEqual([TIMING_TEXT]);
  });
});

describe('luật 6 — dự án theo chiến dịch', () => {
  it('quy tắc " tc_form_highintent_t10 " khớp TC_Form_HighIntent_T10 → projects = ["Marquee Homes"]', async () => {
    const { world, counter } = installWorld({}, [
      { campaign: ' tc_form_highintent_t10 ', project: 'Marquee Homes', archived_at: null },
    ]);
    const result = await processQueueItem(runNow(), queueRow(metaLead(REAL_FIELD_DATA)));
    expect(result).toMatchObject({ status: 'created' });
    expect((world.db.customers[0] as Row).projects).toEqual(['Marquee Homes']);
    expect(counter.ruleCalls).toBe(1);
  });

  it('quy tắc đã lưu trữ (archived_at có giá trị) → không điền projects', async () => {
    const { world } = installWorld({}, [
      { campaign: 'TC_Form_HighIntent_T10', project: 'Dự án cũ', archived_at: '2026-09-30T00:00:00.000Z' },
    ]);
    const result = await processQueueItem(runNow(), queueRow(metaLead(REAL_FIELD_DATA)));
    expect(result).toMatchObject({ status: 'created' });
    expect(world.db.customers[0]).not.toHaveProperty('projects');
  });

  it('Supabase lỗi khi đọc quy tắc → vẫn tạo khách, không projects', async () => {
    const { world } = installWorld({}, 'error');
    const result = await processQueueItem(runNow(), queueRow(metaLead(REAL_FIELD_DATA)));
    expect(result).toMatchObject({ status: 'created' });
    expect(world.db.customers).toHaveLength(1);
    expect(world.db.customers[0]).not.toHaveProperty('projects');
    expect(world.db.fb_leads[0]?.status).toBe('created');
  });

  it('2 lead trong 1 lượt chạy → đọc quy tắc tối đa 1 lượt fetch', async () => {
    const { world, counter } = installWorld({}, [{ campaign: 'TC_Form_HighIntent_T10', project: 'Marquee Homes' }]);
    const run = runNow();
    const leadFor = (phone: string): Row =>
      metaLead([
        { name: APT_QUESTION, values: ['1_ngủ'] },
        { name: TIMING_QUESTION, values: ['trong_tháng_này_(ưu_tiên_xem_căn_sớm)'] },
        { name: 'tên_đầy_đủ', values: ['Khách A'] },
        { name: 'số_điện_thoại', values: [phone] },
      ]);
    await processQueueItem(run, queueRow(leadFor('+84912345678'), 'lead-a'));
    await processQueueItem(run, queueRow(leadFor('+84987654321'), 'lead-b'));

    expect(world.db.customers).toHaveLength(2);
    expect(counter.ruleCalls).toBe(1);
  });
});

describe('luật 7 — khách đã có (trùng SĐT)', () => {
  it('chỉ gắn qua RPC; note là gạch đầu dòng; không đổi apt_type/projects/notes_manual', async () => {
    const existing: Row = {
      id: 'c-old',
      owner_id: 'owner-1',
      phone: '0912345678',
      full_name: 'Khách cũ',
      archived_at: null,
      updated_at: '2026-10-01T00:00:00.000Z',
      apt_type: '2N-2WC',
      projects: ['Dự án riêng'],
      notes_manual: [{ text: 'Sale ghi tay', at: '2026-10-02T00:00:00.000Z' }],
      source: ['facebook_ads'],
    };
    const { world } = installWorld({ customers: [existing] }, [
      { campaign: 'TC_Form_HighIntent_T10', project: 'Marquee Homes' },
    ]);
    const result = await processQueueItem(runNow(), queueRow(metaLead(REAL_FIELD_DATA)));
    expect(result).toMatchObject({ status: 'merged', customer_id: 'c-old' });

    const rpc = world.calls.find((call) => call.url.includes('/rpc/fb_attach_lead'));
    expect(rpc).toBeDefined();
    const body = JSON.parse(String(rpc?.body)) as { p_customer_id: string; p_interaction: Row };
    expect(body.p_customer_id).toBe('c-old');
    expect(body.p_interaction.note).toBe(TIMING_TEXT);

    const note = String(body.p_interaction.note);
    expect(note).not.toContain('0912345678');
    expect(note).not.toContain('Nguyễn');
    expect(note.toLowerCase()).not.toContain('inbox');

    // Không tạo khách mới, không PATCH customers.
    expect(world.tablePosts('customers')).toHaveLength(0);
    expect(
      world.calls.filter((call) => call.method === 'PATCH' && call.url.includes('/rest/v1/customers')),
    ).toHaveLength(0);

    const customer = world.db.customers[0] as Row;
    expect(customer.apt_type).toBe('2N-2WC');
    expect(customer.projects).toEqual(['Dự án riêng']);
    expect(customer.notes_manual).toEqual([{ text: 'Sale ghi tay', at: '2026-10-02T00:00:00.000Z' }]);
  });
});
