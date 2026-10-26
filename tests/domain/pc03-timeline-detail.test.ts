import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerTimeline } from '@/domain/customer/timeline';

// Review PC-03: thêm dòng lưu trữ không được làm mất ghi chú của tương tác thường.
describe('PC-03 — chi tiết dòng nhật ký', () => {
  const customer = {
    id: 'c1',
    interactions: [
      { at: '2026-10-26T03:00:00.000Z', kind: 'archived', channel: 'other', reason: 'so_sai', note: 'Nhập nhầm số' },
      { at: '2026-10-25T03:00:00.000Z', kind: 'meeting', channel: 'meet', note: 'Gặp ở nhà mẫu' },
      { at: '2026-10-24T03:00:00.000Z', kind: 'sent', channel: 'zalo', template: 'chao' },
    ],
  } as unknown as Customer;
  const rows = customerTimeline(customer);
  const at = (iso: string) => rows.find((row) => row.at === iso);

  it('giữ ghi chú và mẫu Zalo của tương tác thường', () => {
    expect(at('2026-10-25T03:00:00.000Z')?.detail).toBe('Gặp ở nhà mẫu');
    expect(at('2026-10-24T03:00:00.000Z')?.detail).toBe('Mẫu: chao');
  });

  it('dòng lưu trữ có lý do + ghi chú', () => {
    const row = at('2026-10-26T03:00:00.000Z');
    expect(row?.kind).toBe('archive');
    expect(row?.title).toBe('Lưu trữ khách · Số sai');
    expect(row?.detail).toBe('Nhập nhầm số');
  });
});
