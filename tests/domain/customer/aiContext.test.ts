import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { buildAiContext, redactAiText } from '@/domain/customer/aiContext';

const customer = {
  id: 'customer-id',
  phone: '0912345678',
  full_name: 'Nguyễn An',
  owner_id: 'owner-id',
  dob: '1990-03-04',
  menh: 'Kim',
  cung: 'Cấn',
  household: [{ phone: '0987654321' }],
  apt_type: '2 phòng ngủ',
  finance: 500000000,
  field_meta: { finance: { at: '2026-10-01', by: 'sale', confirmed: true } },
  notes_manual: [{ at: '2026-10-14', text: 'Khách gọi 0912345678, vốn 500 triệu' }],
  call_attempts: [{ at: '2026-10-15', result: 'talked', note: 'Hẹn gọi lại 0987654321', device_id: 'private' }],
  next_call_at: '2026-10-17T09:00:00Z',
  next_call_reason: 'Hỏi hồ sơ',
  next_tasks: [{ at: '2026-10-15', text: 'Gửi bảng giá', kind: 'message', done_at: null, source: 'manual' }],
  interests: [{ project: 'Dự án A', status: 'open', budget_max: '0900000000', phone: '0900000000' }],
  advanced: { life_stage: 'Gia đình có con nhỏ, liên hệ 0912345678', household: 'SĐT 0987654321' },
  unknown_extension: 'must not be included',
} as unknown as Customer;

describe('buildAiContext', () => {
  it('sends only allowlisted customer context and excludes direct and embedded phone numbers', () => {
    const context = buildAiContext(customer);
    const json = JSON.stringify(context);
    expect(context).not.toHaveProperty('phone');
    expect(context).not.toHaveProperty('dob');
    expect(context).not.toHaveProperty('menh');
    expect(context).not.toHaveProperty('cung');
    expect(context).not.toHaveProperty('household');
    expect(context).not.toHaveProperty('unknown_extension');
    expect(json).not.toContain('0912345678');
    expect(json).not.toContain('0987654321');
    expect(json).not.toContain('0900000000');
    expect(json).toContain('[đã ẩn số điện thoại]');
    expect(context.memory_facts).toHaveLength(1);
    expect(context.nhu_cau.finance).toBe(500000000);
    expect(context.field_meta.finance).toEqual({ at: '2026-10-01', by: 'sale', confirmed: true });
    expect(context.cuoc_goi[0]?.result).toBe('talked');
    expect(context.viec_dang_mo[0]?.text).toBe('Gửi bảng giá');
  });

  it('caps histories and omits completed tasks', () => {
    const large = {
      ...customer,
      notes_manual: Array.from({ length: 14 }, (_, index) => ({
        at: `2026-10-${String(index + 1).padStart(2, '0')}`,
        text: `note ${index}`,
      })),
      call_attempts: Array.from({ length: 10 }, (_, index) => ({
        at: `2026-10-${String(index + 1).padStart(2, '0')}`,
        result: 'talked',
      })),
      next_tasks: [...(customer.next_tasks || []), { at: 'old', text: 'Done', done_at: 'yesterday' }],
    } as unknown as Customer;
    const context = buildAiContext(large);
    expect(context.ghi_chu).toHaveLength(12);
    expect(context.cuoc_goi).toHaveLength(8);
    expect(context.viec_dang_mo).toHaveLength(1);
  });

  it('redacts email and 12-digit identifiers from every free-text context field while retaining the approved name', () => {
    const withIdentifiers = {
      ...customer,
      full_name: 'Nguyễn An',
      notes_manual: [{ at: '2026-10-14', text: 'Mail note@example.test, CCCD 012345678901' }],
      call_attempts: [{ at: '2026-10-15', result: 'talked', note: 'mail call@example.vn, mã 123456789012' }],
      next_tasks: [{ at: '2026-10-15', text: 'Gọi mail task@example.test, CCCD 234567890123', done_at: null }],
      advanced: { life_stage: 'Mã 345678901234; email memory@example.org' },
      field_meta: {
        finance: { at: '2026-10-01', by: 'sale note@example.test 456789012345', confirmed: true },
        life_stage: { at: '2026-10-01', by: 'sale source@example.vn 567890123456', confirmed: true },
      },
    } as unknown as Customer;
    const context = buildAiContext(withIdentifiers);
    const json = JSON.stringify(context);

    for (const identifier of [
      'note@example.test',
      '012345678901',
      'call@example.vn',
      '123456789012',
      'task@example.test',
      '234567890123',
      'memory@example.org',
      '345678901234',
      'note@example.test',
      '456789012345',
      'source@example.vn',
      '567890123456',
    ]) {
      expect(json).not.toContain(identifier);
    }
    expect(json).toContain('[đã ẩn email]');
    expect(json).toContain('[đã ẩn mã định danh]');
    expect(context.field_meta.finance?.by).toContain('sale');
    expect(context.memory_facts[0]?.source).toContain('sale');
    expect(context.full_name).toBe('Nguyễn An');
  });
});

describe('AI privacy numeric boundaries', () => {
  it.each(['1000000000', '1.000.000.000đ', '1 000 000 000 VND', '2800000000', '8400000000', '10000000000000'])(
    'preserves money/prose %s',
    (value) => {
      expect(redactAiText(`Vốn ${value}, không phải 3 tỷ`)).toBe(`Vốn ${value}, không phải 3 tỷ`);
      const context = buildAiContext({
        ...customer,
        notes_manual: [{ text: `Vốn ${value}` }],
        advanced: { capital: `Vốn ${value}` },
      } as Customer);
      expect(context.ghi_chu[0]?.text).toBe(`Vốn ${value}`);
      expect(context.memory_facts[0]?.fact).toBe(`Vốn ${value}`);
    },
  );
  it.each([
    '0901234567',
    '+84 901 234 567',
    '84901234567',
    '0084901234567',
    '02412345678',
    '+842412345678',
    '090.123.4567',
  ])('redacts phone %s', (value) => {
    expect(redactAiText(`Gọi ${value} nhé`)).not.toContain(value.replace('+', ''));
    expect(redactAiText(`Gọi ${value} nhé`)).toContain('[đã ẩn');
  });
});
