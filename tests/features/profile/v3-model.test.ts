import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerBrief } from '@/domain/customer/brief';
import { customerTimeline } from '@/domain/customer/timeline';
import { extraFacts, filterTimeline, lastTouchOf, splitBrief, timelineCounts } from '@/features/profile/model';

const now = new Date(2026, 9, 19, 9, 30).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const base = { id: 'c1', owner_id: 'u1', full_name: 'Trần Thị Thu Hương', phone: '0911234567' };
const c = (over: Partial<Customer> = {}) => ({ ...base, ...over }) as Customer;

describe('lastTouchOf', () => {
  it('lấy mục mới nhất giữa cuộc gọi / ghi chú / Zalo; cuộc gọi có thời lượng + kết quả tiếng Việt', () => {
    expect(
      lastTouchOf(
        c({
          call_attempts: [{ at: at(18, 15), result: 'talked', note: 'Hỏi giá căn 2PN', duration: 185 }],
          notes_manual: [{ at: at(16, 9), text: 'Vợ chồng làm KCN' }],
        }),
        now,
      ),
    ).toEqual({ when: 'Hôm qua 15:00', meta: 'Gọi 3 phút', headline: 'Nói chuyện được', text: 'Hỏi giá căn 2PN' });
  });

  it('ghi chú mới hơn cuộc gọi → ghi chú', () => {
    const t = lastTouchOf(
      c({
        call_attempts: [{ at: at(17, 10), result: 'no_answer' }],
        notes_manual: [{ at: at(19, 8), text: 'Khách nhắn hỏi lãi suất' }],
      }),
      now,
    );
    expect(t).toEqual({ when: 'Hôm nay 08:00', meta: 'Ghi chú', headline: '', text: 'Khách nhắn hỏi lãi suất' });
  });

  it('chưa có gì → null', () => {
    expect(lastTouchOf(c(), now)).toBeNull();
  });
});

describe('splitBrief (D-023 L4)', () => {
  it('tách đã biết / còn thiếu, bỏ "Liên hệ cuối"', () => {
    const { known, missing } = splitBrief(customerBrief(c({ purpose: 'Ở', apt_types: ['2PN'] } as Partial<Customer>)));
    expect(known.map((f) => f.label)).toContain('Mua để');
    expect(known.every((f) => f.value !== 'Chưa biết')).toBe(true);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((f) => f.question)).toBe(true);
    expect([...known, ...missing].some((f) => f.key === 'last_contact')).toBe(false);
  });
});

describe('extraFacts (D-023 L3 + L4)', () => {
  it('chỉ trường có giá trị, nhãn tiếng Việt, không mã, không ISO', () => {
    const facts = extraFacts(
      c({
        source: 'facebook_ads',
        intake_method: 'ocr',
        interest_level: 85,
        registered_at: at(4, 9),
        call_attempts: [{ at: at(18, 15), result: 'talked' }],
        notes: { text: 'object cũ' } as unknown as string,
      }),
      now,
    );
    expect(facts).toEqual([
      { label: 'Số lần gọi', value: '1 lần' },
      { label: 'Lần gọi cuối', value: 'Hôm qua 15:00' },
      { label: 'Nguồn', value: 'Facebook Ads' },
      { label: 'Cách nhập', value: 'Từ ảnh chụp' },
      { label: 'Mức quan tâm', value: 'Rất nóng' },
      { label: 'Ngày đăng ký', value: '09:00 04/10/2026' },
      { label: 'Ghi chú đăng ký', value: 'object cũ' },
    ]);
  });

  it('khách gần như trống → chỉ ngày đăng ký', () => {
    expect(extraFacts(c({ created_at: at(1, 9) }), now)).toEqual([
      { label: 'Ngày đăng ký', value: '09:00 01/10/2026' },
    ]);
  });
});

describe('lọc dòng thời gian (I7)', () => {
  const entries = customerTimeline(
    c({
      call_attempts: [
        { at: at(18, 15), result: 'talked' },
        { at: at(17, 10), result: 'no_answer' },
      ],
      notes_manual: [{ at: at(16, 9), text: 'Ghi chú' }],
      care_stage_history: [{ at: at(11, 9), stage: 'Xem dự án' }],
    }),
  );
  it('đếm theo loại và lọc', () => {
    expect(timelineCounts(entries)).toEqual({ all: 4, call: 2, note: 1, interaction: 0, stage: 1 });
    expect(filterTimeline(entries, 'call').map((e) => e.kind)).toEqual(['call', 'call']);
    expect(filterTimeline(entries, 'all')).toHaveLength(4);
  });
});
