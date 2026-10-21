import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { canonicalAptType } from '@/domain/customer/aptType';
import { isSaleNote, LEAD_FORM_ORIGIN } from '@/domain/customer/interactions';
import { lastTouchMs } from '@/domain/signals/shared';

describe('câu trả lời form Meta (Curtis 2026-10-21)', () => {
  it('"1_ngủ" của form → 1N-1WC; giữ hành vi cũ cho chữ gõ tay', () => {
    expect(canonicalAptType('1_ngủ')).toBe('1N-1WC');
    expect(canonicalAptType('2_phòng_ngủ')).toBe('2N-2WC');
    expect(canonicalAptType('2 ngủ+')).toBe('2N+, 2WC');
    expect(canonicalAptType('chưa_xác_định')).toBe('chưa_xác_định');
  });

  it('ghi chú do form tạo không tính là sale chạm khách', () => {
    const formNote = { at: '2026-10-20T03:00:00.000Z', text: 'Dự kiến mua: trong tháng này', origin: LEAD_FORM_ORIGIN };
    expect(isSaleNote(formNote)).toBe(false);
    expect(isSaleNote({ at: 'x', text: 'gọi lại' })).toBe(true);
    const base = {
      id: 'c1',
      phone: '0912345678',
      full_name: 'A',
      owner_id: 'u1',
      created_at: '2026-10-01T02:00:00.000Z',
      call_attempts: [{ at: '2026-10-05T02:00:00.000Z', result: 'talked' }],
    } as Customer;
    expect(lastTouchMs({ ...base, notes_manual: [formNote] } as Customer)).toBe(lastTouchMs(base));
  });
});
