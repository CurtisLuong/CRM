import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { canLogHistory } from '@/domain/customer/teamEdit';
import { canAssignWithTeam } from '@/features/team/AssignSheet';

// D-032 (Curtis 06/11): khách ở mọi bậc (kể cả đang chăm, đã gọi nhiều cuộc) đều giao được;
// sau khi giao, người theo dõi vẫn ghi giùm lịch sử.
const team = [
  { user_id: 'me', is_me: true, is_admin: false },
  { user_id: 'lan', is_me: false, is_admin: false },
];
const caring = {
  id: 'c1',
  owner_id: 'me',
  full_name: 'Khách',
  phone: '0900000000',
  care_stage: 'Đang chăm sóc',
  call_attempts: [{ at: '2026-11-02T02:00:00.000Z', result: 'talked' }],
} as unknown as Customer;

describe('D-032 — giao khách mọi bậc + ghi giùm', () => {
  it('khách đang chăm đã gọi vẫn giao được; cần nhóm ≥ 2 người; khách lưu trữ / của người khác thì không', () => {
    expect(canAssignWithTeam(caring, 'me', team)).toBe(true);
    expect(canAssignWithTeam(caring, 'me', team.slice(0, 1))).toBe(false);
    expect(canAssignWithTeam({ ...caring, archived_at: '2026-11-05T00:00:00.000Z' }, 'me', team)).toBe(false);
    expect(canAssignWithTeam({ ...caring, owner_id: 'lan' }, 'me', team)).toBe(false);
  });

  it('ghi lịch sử: khách mình hoặc khách đã giao đang theo dõi; khách lưu trữ thì không', () => {
    expect(canLogHistory(caring, 'me')).toBe(true);
    expect(canLogHistory({ ...caring, owner_id: 'lan' }, 'me')).toBe(true);
    expect(canLogHistory({ ...caring, owner_id: 'lan', archived_at: '2026-11-05T00:00:00.000Z' }, 'me')).toBe(false);
    expect(canLogHistory(caring, '')).toBe(false);
  });
});
