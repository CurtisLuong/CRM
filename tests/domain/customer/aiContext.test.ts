import { describe, expect, it } from 'vitest';
import { buildAiContext } from '@/domain/customer/aiContext';
import type { Customer } from '@/domain/customer';

const customer = {
  id: 'customer-id', phone: '0912345678', full_name: 'Nguyễn An', owner_id: 'owner-id',
  dob: '1990-03-04', menh: 'Kim', cung: 'Cấn', household: [{ phone: '0987654321' }],
  apt_type: '2 phòng ngủ', finance: 500000000, field_meta: { finance: { at: '2026-10-01', by: 'sale', confirmed: true } },
  notes_manual: [{ at: '2026-10-14', text: 'Khách gọi 0912345678, vốn 500 triệu' }],
  call_attempts: [{ at: '2026-10-15', result: 'talked', note: 'Hẹn gọi lại 0987654321', device_id: 'private' }],
  next_call_at: '2026-10-17T09:00:00Z', next_call_reason: 'Hỏi hồ sơ',
  next_tasks: [{ at: '2026-10-15', text: 'Gửi bảng giá', kind: 'message', done_at: null, source: 'manual' }],
  interests: [{ project: 'Dự án A', status: 'open', phone: '0900000000' }],
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
    expect(context.nhu_cau.finance).toBe('500000000');
    expect(context.field_meta.finance).toEqual({ at: '2026-10-01', by: 'sale', confirmed: true });
    expect(context.cuoc_goi[0].result).toBe('talked');
    expect(context.viec_dang_mo[0].text).toBe('Gửi bảng giá');
  });

  it('caps histories and omits completed tasks', () => {
    const large = {
      ...customer,
      notes_manual: Array.from({ length: 14 }, (_, index) => ({ at: `2026-10-${String(index + 1).padStart(2, '0')}`, text: `note ${index}` })),
      call_attempts: Array.from({ length: 10 }, (_, index) => ({ at: `2026-10-${String(index + 1).padStart(2, '0')}`, result: 'talked' })),
      next_tasks: [...(customer.next_tasks || []), { at: 'old', text: 'Done', done_at: 'yesterday' }],
    } as unknown as Customer;
    const context = buildAiContext(large);
    expect(context.ghi_chu).toHaveLength(12);
    expect(context.cuoc_goi).toHaveLength(8);
    expect(context.viec_dang_mo).toHaveLength(1);
  });
});
