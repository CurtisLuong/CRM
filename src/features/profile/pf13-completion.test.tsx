import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Customer, Task } from '@/domain/customer';
import { customerTimeline } from '@/domain/customer/timeline';
import { CompleteTaskDialog } from './complete-task';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/ui/Toast', () => ({ useToast: () => toast }));
const task: Task = { at: '2026-11-01T01:00:00Z', text: 'Gửi bảng giá', kind: 'message' };
const now = Date.parse('2026-11-09T13:13:00Z');

describe('PF-13 hộp hoàn thành dùng chung', () => {
  it('mở và đóng không ghi; ghi chú không bắt buộc', async () => {
    const onConfirm = vi.fn(async () => {});
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CompleteTaskDialog task={task} now={now} onConfirm={onConfirm} onClose={onClose} />);
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Xác nhận xong' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('đang lưu khoá nút và đóng hộp; không lưu trùng', async () => {
    let finish: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CompleteTaskDialog task={task} now={now} onConfirm={onConfirm} onClose={onClose} />);
    await user.type(screen.getByRole('textbox'), '  Khách thích căn góc  ');
    await user.click(screen.getByRole('button', { name: 'Xác nhận xong' }));
    const saving = screen.getByRole('button', { name: 'Đang lưu…' });
    expect(saving).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Huỷ' })).toHaveProperty('disabled', true);
    fireEvent.click(saving);
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('Khách thích căn góc');
    await act(async () => finish?.());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ title: 'Đã xong việc' });
  });

  it('lưu lỗi giữ hộp và ghi chú, cho thử lại', async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error('Chưa ghi được trên máy'))
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CompleteTaskDialog task={task} now={now} onConfirm={onConfirm} onClose={onClose} />);
    await user.type(screen.getByRole('textbox'), 'Giữ nội dung này');
    await user.click(screen.getByRole('button', { name: 'Xác nhận xong' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Chưa ghi được trên máy');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Giữ nội dung này');
    await user.click(screen.getByRole('button', { name: 'Xác nhận xong' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Dòng thời gian giữ ghi chú và hạn; việc không hạn vẫn có ghi chú', () => {
    const c = {
      next_tasks: [
        { ...task, done_at: '2026-11-09T13:13:00Z', done_note: 'Đã gửi ảnh', due: '2026-11-09T14:00:00Z' },
        { ...task, done_at: '2026-11-09T13:14:00Z', done_note: 'Không có hạn' },
        { ...task, done_at: '2026-11-09T13:15:00Z' },
      ],
    } as Customer;
    const entries = customerTimeline(c);
    expect(entries[0]?.detail).toBeUndefined();
    expect(entries[1]?.detail).toBe('Không có hạn');
    expect(entries[2]?.detail).toMatch(/^Đã gửi ảnh\nHạn /);
  });
});
