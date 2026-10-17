import { describe, expect, it } from 'vitest';
import { assignmentFollowers, assignmentNote, canAssignCustomer, memberLabel } from '@/features/team/model';

const members = [
  { user_id: 'me', is_me: true, is_admin: true },
  { user_id: 'other', full_name: 'Lan' },
];

describe('team assignment rules (D-003)', () => {
  it('allows the owner or admin to assign, while ordinary members cannot reassign another owner', () => {
    expect(canAssignCustomer({ owner_id: 'me' }, 'me', members)).toBe(true);
    expect(canAssignCustomer({ owner_id: 'other' }, 'me', members)).toBe(true);
    expect(canAssignCustomer({ owner_id: 'other' }, 'me', [{ user_id: 'me', is_me: true }, { user_id: 'other' }])).toBe(
      false,
    );
    expect(canAssignCustomer({ owner_id: 'other' }, 'other', [{ user_id: 'other', is_me: true }])).toBe(true);
  });

  it('keeps only the current user as follower for handoff and deduplicates follow-along assignment', () => {
    expect(assignmentFollowers(['me', 'other', 'other'], 'me', 'new-owner', 'keep')).toEqual(['other', 'me']);
    expect(assignmentFollowers(['me', 'other'], 'me', 'new-owner', 'handoff')).toEqual(['other']);
    expect(assignmentFollowers(['me'], 'me', 'me', 'keep')).toEqual([]);
  });

  it('builds the handoff timeline note and readable member names', () => {
    expect(memberLabel({ user_id: 'x', email: 'user@example.test' })).toBe('user');
    expect(assignmentNote({ user_id: 'other', full_name: 'Lan' }, 'other', 'me', 'keep', '  Hẹn thứ 7 ')).toBe(
      'Giao cho Lan (người giao vẫn theo dõi). Hẹn thứ 7',
    );
    expect(assignmentNote(undefined, 'me', 'me', 'handoff', '')).toBe('Lấy lại về tôi');
  });
});
