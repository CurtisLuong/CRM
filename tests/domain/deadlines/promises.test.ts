import { describe, expect, it } from 'vitest';
import type { Task } from '@/domain/customer';
import { appendPromise, promiseTaskKey, snoozePromise, undoPromiseSnooze } from '@/domain/deadlines/promises';

describe('two-sided promises', () => {
  it('creates a stable content key and deduplicates a repeated capture', () => {
    const key = promiseTaskKey('c1', 'me', '  Gửi bảng giá  ', '2026-10-20T09:00:00.000Z');
    expect(promiseTaskKey('c1', 'me', 'gửi   bảng giá', '2026-10-20T09:00:00.000Z')).toBe(key);
    expect(promiseTaskKey('c1', 'customer', 'Gửi bảng giá', '2026-10-20T09:00:00.000Z')).not.toBe(key);
    const first = { at: 'first', text: 'Gửi bảng giá', side: 'me', key, x_legacy: 'keep' } as Task;
    const appended = appendPromise([first, null], { ...first, at: 'retry' });
    expect(appended.added).toBe(false);
    expect(appended.tasks).toEqual([first, null]);
  });

  it('keeps the original due date through repeated snoozes and undo preserves unknown fields', () => {
    const original = {
      at: 't1',
      text: 'Gửi bảng giá',
      due: '2026-10-17T09:00:00.000Z',
      side: 'me',
      x_v1: { keep: true },
    } as Task;
    const firstMove = snoozePromise(original, '2026-10-18T11:30:00.000Z', 'Em bận');
    const secondMove = snoozePromise(firstMove, '2026-10-19T14:30:00.000Z', 'Khách bận');
    expect(secondMove.due_original).toBe(original.due);
    expect(secondMove.due).toBe('2026-10-19T14:30:00.000Z');
    expect(undoPromiseSnooze(secondMove, original)).toEqual(original);
    expect(
      snoozePromise({ ...original, due_allday: true }, '2026-10-18T11:30:00.000Z', 'Em bận').due_allday,
    ).toBeUndefined();
  });
});
