// @vitest-environment node
// Lỗi 2026-10-22: lead có trên Meta nhưng không vào CRM — (1) ô SĐT đặt tên tự do bị coi là "không SĐT",
// (2) Page nhiều form: lượt quét tiêu hết lượt gọi mạng, hàng chờ không được ghi / form cuối không bao giờ được đọc.
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { runCron } from '../../worker/fb-leads.js';
// @ts-expect-error Worker source is JavaScript.
import { parseFieldData } from '../../worker/meta/mapping.js';
// @ts-expect-error Worker source is JavaScript.
import { pollOrder } from '../../worker/meta/runs.js';
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

const NOW = new Date('2026-10-22T03:00:00.000Z');

afterEach(() => {
  vi.unstubAllGlobals();
});

function lead(id: string, formId: string, phone: string, at = NOW): Row {
  return {
    id,
    created_time: Math.floor(at.getTime() / 1000),
    form_id: formId,
    field_data: [
      { name: 'họ_và_tên_của_anh/chị', values: ['Nguyễn Văn A'] },
      { name: 'số_điện_thoại_liên_hệ', values: [phone] },
    ],
  };
}

function forms(count: number, status = 'ACTIVE'): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `F${index}`, name: `Form ${index}`, status }));
}

describe('ô SĐT / họ tên đặt tên tự do', () => {
  it('nhận SĐT khi tên trường chứa "điện thoại / SĐT / phone / zalo"', () => {
    for (const name of [
      'số_điện_thoại_liên_hệ',
      'SĐT_liên_hệ',
      'số_điện_thoại/zalo',
      'Số điện thoại của anh/chị?',
      'your_phone',
    ]) {
      expect(parseFieldData([{ name, values: ['+84 912 345 678'] }]).phone, name).toBe('0912345678');
    }
  });

  it('câu hỏi không rõ tên nhưng câu trả lời là số điện thoại → vẫn nhận', () => {
    const parsed = parseFieldData([
      { name: 'ngân_sách', values: ['2_tỷ'] },
      { name: 'để_lại_thông_tin', values: ['0912 345 678'] },
    ]);
    expect(parsed.phone).toBe('0912345678');
  });

  it('không lấy câu trả lời chữ làm SĐT ("có", "2_tỷ", câu hỏi zalo dạng có/không)', () => {
    const parsed = parseFieldData([
      { name: 'bạn_có_dùng_zalo_không', values: ['có'] },
      { name: 'ngân_sách', values: ['2_tỷ'] },
    ]);
    expect(parsed.phone).toBe('');
  });

  it('tên chuẩn vẫn được ưu tiên trước tên tự do', () => {
    const parsed = parseFieldData([
      { name: 'số_zalo_khác', values: ['0987654321'] },
      { name: 'phone_number', values: ['0912345678'] },
    ]);
    expect(parsed.phone).toBe('0912345678');
  });

  it('họ tên đặt tên tự do → full_name, và SĐT/họ tên không bị chép lại thành ghi chú', () => {
    const parsed = parseFieldData([
      { name: 'họ_và_tên_của_anh/chị', values: ['Trần Thị B'] },
      { name: 'số_điện_thoại_liên_hệ', values: ['0912345678'] },
      { name: 'dự_kiến_khi_nào_mua', values: ['3_tháng'] },
    ]);
    expect(parsed.full_name).toBe('Trần Thị B');
    expect(parsed.bullets).toEqual(['Dự kiến mua: 3 tháng']);
  });
});

describe('cron với Page nhiều form', () => {
  it('lead đã ở hàng chờ được ghi trong lượt, dù Page có 60 form', async () => {
    const pending = lead('Q1', 'F0', '0912345678');
    const queue: Row[] = [
      {
        lead_id: 'Q1',
        page_id: '111',
        form_id: 'F0',
        owner_id: 'owner-1',
        via: 'poll',
        payload: { leadgen_id: 'Q1', form_id: 'F0', form_name: 'Form 0', lead: pending },
        attempts: 0,
        next_attempt_at: '2026-10-22T02:00:00.000Z',
        created_at: '2026-10-22T02:00:00.000Z',
        updated_at: '2026-10-22T02:00:00.000Z',
      },
    ];
    const world = createWorld({ queue, forms: forms(60) });
    vi.stubGlobal('fetch', world.fetch);

    const summary = await runCron(ENV, { now: () => NOW });
    expect(summary.created).toBe(1);
    expect(world.db.customers).toHaveLength(1);
    expect(summary.health).not.toBeNull(); // còn lượt ghi tình trạng kết nối
    expect(world.calls.length).toBeLessThanOrEqual(45);
  });

  it('lead mới ở form cuối danh sách (60 form ACTIVE) vào CRM sau vài lượt cron', async () => {
    const target = lead('L59', 'F59', '0987654321');
    const world = createWorld({ forms: forms(60), formLeads: { F59: [target] } });
    vi.stubGlobal('fetch', world.fetch);

    let created = 0;
    for (let run = 0; run < 4 && !created; run++) {
      const at = new Date(NOW.getTime() + run * 5 * 60 * 1000);
      const summary = await runCron(ENV, { now: () => at });
      created += summary.created;
    }
    expect(world.db.customers).toHaveLength(1);
    expect(world.db.customers[0]?.phone).toBe('0987654321');
  });

  it('ít form: lead quét được ghi ngay trong cùng lượt', async () => {
    const target = lead('L3', 'F3', '0911111111');
    const world = createWorld({ forms: forms(6), formLeads: { F3: [target] } });
    vi.stubGlobal('fetch', world.fetch);

    const summary = await runCron(ENV, { now: () => NOW });
    expect(summary.queued).toBe(1);
    expect(summary.created).toBe(1);
  });

  it('thứ tự quét: form ACTIVE trước, form cũ sau; điểm bắt đầu xoay theo giờ', () => {
    const list = [{ id: 'old', status: 'ARCHIVED' }, ...forms(3)];
    expect(pollOrder(list, 0).map((form: Row) => form.id)).toEqual(['F0', 'F1', 'F2', 'old']);
    const many = forms(45);
    const first = pollOrder(many, 0).map((form: Row) => form.id);
    const next = pollOrder(many, 5 * 60 * 1000).map((form: Row) => form.id);
    expect(first[0]).toBe('F0');
    expect(next[0]).toBe('F30');
    expect(new Set(next).size).toBe(45);
  });
});
