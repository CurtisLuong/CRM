import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AddTaskSheet } from '@/features/profile/add-task';

type SaveKind = 'message' | 'cafe' | 'visit' | 'docs';
type SaveFn = (kind: SaveKind, text: string, due: unknown) => Promise<void>;
const saveMock = () => vi.fn(async (_kind: SaveKind, _text: string, _due: unknown) => {});

// CP-03 — danh sách 5 loại luôn đứng trước form; chỉ lưu khi người dùng bấm Lưu việc.
function Harness({ onSave = saveMock(), onScheduleCall = vi.fn() }: { onSave?: SaveFn; onScheduleCall?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Thêm việc
      </button>
      <AddTaskSheet
        open={open}
        customerName="Khách CP-03"
        onOpenChange={setOpen}
        onScheduleCall={onScheduleCall}
        onSave={onSave}
      />
    </>
  );
}

async function openPicker() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Thêm việc' }));
  return { user, dialog: screen.getByRole('dialog', { name: /Thêm việc · Khách CP-03/ }) };
}

describe('CP-03 — picker Thêm việc', () => {
  it('liệt kê đúng 5 loại theo thứ tự, mỗi loại một icon, trước khi có form', async () => {
    const { dialog } = await openPicker();
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('[data-task-action]'));
    expect(buttons.map((button) => button.dataset.taskAction)).toEqual(['call', 'message', 'cafe', 'visit', 'docs']);
    expect(buttons.map((button) => button.querySelector('svg')?.getAttribute('data-icon'))).toEqual([
      'call',
      'message',
      'cafe',
      'visit',
      'docs',
    ]);
    expect(buttons.map((button) => button.querySelector('.text-body-strong')?.textContent)).toEqual([
      'Gọi điện',
      'Zalo',
      'Cafe và Gặp',
      'Tham quan',
      'Hồ sơ',
    ]);
    expect(dialog.querySelector('[data-task-form-kind]')).toBeNull();
  });

  it('Gọi điện chỉ mở lịch hẹn gọi, không tạo việc', async () => {
    const onSave = saveMock();
    const onScheduleCall = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} onScheduleCall={onScheduleCall} />);
    await user.click(screen.getByRole('button', { name: 'Thêm việc' }));
    const dialog = screen.getByRole('dialog', { name: /Thêm việc/ });
    await user.click(within(dialog).getByRole('button', { name: /Gọi điện/ }));
    expect(onScheduleCall).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([
    ['Zalo', 'message'],
    ['Cafe và Gặp', 'cafe'],
    ['Tham quan', 'visit'],
    ['Hồ sơ', 'docs'],
  ] as const)('%s lưu đúng mã %s, nội dung và không hạn', async (label, code) => {
    const onSave = saveMock();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Thêm việc' }));
    let dialog = screen.getByRole('dialog', { name: /Thêm việc/ });
    await user.click(within(dialog).getByRole('button', { name: new RegExp(label) }));
    dialog = screen.getByRole('dialog', { name: /Thêm việc/ });
    expect(dialog.querySelector(`[data-task-form-kind="${code}"]`)).not.toBeNull();
    await user.type(within(dialog).getByLabelText('Nội dung việc'), `Việc ${label}`);
    await user.click(within(dialog).getByRole('button', { name: 'Lưu việc' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(code, `Việc ${label}`, null));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('nội dung rỗng (khoảng trắng) báo lỗi và không ghi', async () => {
    const onSave = saveMock();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Thêm việc' }));
    await user.click(screen.getByRole('button', { name: /Zalo/ }));
    expect(onSave).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Nội dung việc'), '   ');
    await user.click(screen.getByRole('button', { name: 'Lưu việc' }));
    expect(screen.getByRole('alert').textContent).toContain('Nhập nội dung việc');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Huỷ không ghi việc', async () => {
    const onSave = saveMock();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Thêm việc' }));
    await user.click(screen.getByRole('button', { name: /Cafe và Gặp/ }));
    await user.type(screen.getByLabelText('Nội dung việc'), 'Cafe bàn vay');
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('chọn ngày + giờ gửi đúng hạn giờ; chọn Cả ngày gửi due_allday', async () => {
    const onSave = saveMock();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Thêm việc' }));
    await user.click(screen.getByRole('button', { name: /Hồ sơ/ }));
    await user.type(screen.getByLabelText('Nội dung việc'), 'Nộp sổ đỏ');
    fireEvent.change(screen.getByLabelText('Ngày hạn'), { target: { value: '2026-10-26' } });
    fireEvent.change(screen.getByLabelText('Giờ hạn'), { target: { value: '14:30' } });
    await user.click(screen.getByRole('button', { name: 'Lưu việc' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const call = onSave.mock.calls[0];
    expect(call?.[0]).toBe('docs');
    const due = call?.[2] as { due: string; due_allday?: boolean };
    expect(due.due_allday).toBeUndefined();
    const at = new Date(due.due);
    expect([at.getHours(), at.getMinutes()]).toEqual([14, 30]);
  });
});
