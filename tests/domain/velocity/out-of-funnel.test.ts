import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import * as V from '@/domain/velocity';

const NOW = Date.parse('2026-11-11T09:00:00+07:00');
const DAY = 86400000;
// Khách chưa bấm Tiềm năng (không qualified_at), đã gọi 8 ngày trước → nếu tính phễu sẽ là "Đang tiếp cận" quá hạn 7 ngày.
const base = {
  id: 'c1',
  owner_id: 'u1',
  full_name: 'Khách thử',
  phone: '0900000000',
  created_at: new Date(NOW - 9 * DAY).toISOString(),
  call_attempts: [{ at: new Date(NOW - 8 * DAY).toISOString(), result: 'no_answer' }],
} as unknown as Customer;

describe('SLA: bậc ngoài phễu không tính giờ kể cả khi chưa bấm Tiềm năng', () => {
  it('chưa có bậc ngoài phễu → vẫn tính Đang tiếp cận (giữ hành vi cũ)', () => {
    expect(V.phaseOf(base)?.key).toBe('approach');
    expect(V.status(base, NOW)?.state).toBe('over');
  });

  for (const stage of ['Nuôi dài hạn', 'Kí HĐMB']) {
    it(`${stage} → không SLA, không tự chuyển`, () => {
      const c = { ...base, care_stage: stage } as Customer;
      expect(V.phaseOf(c)).toBeNull();
      expect(V.status(c, NOW)).toBeNull();
      expect(V.autoAction(c, NOW)).toBeNull();
    });
  }
});
