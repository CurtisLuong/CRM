import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { ProfileInfoFields } from '@/features/profile/info';

function props(overrides: Partial<ComponentProps<typeof ProfileInfoFields>> = {}) {
  return {
    customer: {
      id: 'gn01',
      owner_id: 'u1',
      full_name: 'Phạm Thu Trang',
      phone: '0901234567',
      gender: null,
    } as Customer,
    writable: true,
    busy: false,
    now: Date.parse('2026-11-05T03:00:00Z'),
    showEmpty: false,
    onSaveField: vi.fn(),
    onSaveDob: vi.fn(),
    ...overrides,
  };
}

describe('GN-01 — gợi ý giới tính trong hồ sơ', () => {
  it('hiện mờ ngoài Bổ sung, không tự lưu; một chạm chỉ lưu gender', () => {
    const input = props();
    const { rerender } = render(<ProfileInfoFields {...input} />);
    expect(screen.getByText('Nữ · đoán từ tên').classList.contains('text-ink-muted')).toBe(true);
    expect(screen.getByLabelText('Giới tính')).toHaveProperty('value', '');
    expect(input.onSaveField).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu Nữ' }));
    expect(input.onSaveField).toHaveBeenCalledExactlyOnceWith('gender', 'nữ');
    expect(input.customer.gender).toBeNull();
    rerender(<ProfileInfoFields {...input} customer={{ ...input.customer, gender: 'nữ' }} />);
    expect(screen.queryByText(/đoán từ tên/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lưu Nữ' })).toBeNull();
    expect(screen.getByLabelText('Giới tính')).toHaveProperty('value', 'nữ');
  });

  it('vẫn chọn được giá trị khác qua danh sách cũ', () => {
    const input = props();
    render(<ProfileInfoFields {...input} />);
    fireEvent.change(screen.getByLabelText('Giới tính'), { target: { value: 'nam' } });
    expect(input.onSaveField).toHaveBeenCalledExactlyOnceWith('gender', 'nam');
  });

  it('khách không có quyền sửa chỉ hiện gợi ý, không có nút lưu', () => {
    const input = props({ writable: false });
    render(<ProfileInfoFields {...input} />);
    expect(screen.getByText('Nữ · đoán từ tên')).toBeTruthy();
    expect(screen.getByLabelText('Giới tính')).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Lưu Nữ' })).toBeNull();
    expect(input.onSaveField).not.toHaveBeenCalled();
  });

  it('khóa nút lưu và danh sách khi đang lưu', () => {
    const input = props({ busy: true });
    render(<ProfileInfoFields {...input} />);
    expect(screen.getByRole('button', { name: 'Lưu Nữ' })).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Giới tính')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu Nữ' }));
    expect(input.onSaveField).not.toHaveBeenCalled();
  });

  it.each(['nam', 'nữ', 'khác', 'Nữ'])('đã có %s thì không gợi ý hay tự sửa', (gender) => {
    const input = props();
    input.customer = { ...input.customer, gender };
    render(<ProfileInfoFields {...input} />);
    expect(screen.getByLabelText('Giới tính')).toHaveProperty('value', gender);
    expect(screen.queryByText(/đoán từ tên/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Lưu / })).toBeNull();
    expect(input.onSaveField).not.toHaveBeenCalled();
  });

  it('tên mơ hồ vẫn ẩn ô trống; mở Bổ sung chọn như trước', () => {
    const input = props();
    input.customer = { ...input.customer, full_name: 'Hoai Nguyen' };
    const { rerender } = render(<ProfileInfoFields {...input} />);
    expect(screen.queryByLabelText('Giới tính')).toBeNull();
    rerender(<ProfileInfoFields {...input} showEmpty />);
    expect(screen.getByLabelText('Giới tính')).toHaveProperty('value', '');
    expect(screen.queryByText(/đoán từ tên/)).toBeNull();
    expect(input.onSaveField).not.toHaveBeenCalled();
  });

  it('tính lại gợi ý khi đổi tên mà không ghi dữ liệu', () => {
    const input = props();
    const { rerender } = render(<ProfileInfoFields {...input} />);
    rerender(<ProfileInfoFields {...input} customer={{ ...input.customer, full_name: 'Trần Văn Hùng' }} />);
    expect(screen.getByText('Nam · đoán từ tên')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu Nam' }));
    expect(input.onSaveField).toHaveBeenCalledExactlyOnceWith('gender', 'nam');
  });
});
