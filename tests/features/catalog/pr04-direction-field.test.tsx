import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DIRECTIONS } from '@/config/directions';
import { DirectionField } from '@/features/catalog/direction-field';

describe('PR-04 — ô Hướng dùng chung', () => {
  it('hiện hướng chuẩn mà không ghi khi mở, cho chọn hướng và xoá bằng —', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DirectionField value="đông nam" onChange={onChange} />);
    const select = screen.getByLabelText('Hướng') as HTMLSelectElement;
    expect(select.value).toBe('Đông Nam');
    expect(Array.from(select.options, (option) => option.text)).toEqual(['—', ...DIRECTIONS]);
    expect(onChange).not.toHaveBeenCalled();
    await user.selectOptions(select, 'Bắc');
    expect(onChange).toHaveBeenLastCalledWith('Bắc');
    await user.selectOptions(select, '');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('giữ lựa chọn lạ và khoá khi chỉ xem', async () => {
    const onChange = vi.fn();
    const view = render(<DirectionField value="ĐN view hồ" onChange={onChange} />);
    const select = screen.getByLabelText('Hướng') as HTMLSelectElement;
    expect(select.value).toBe('ĐN view hồ');
    expect(select.selectedOptions[0]?.text).toBe('ĐN view hồ');
    view.rerender(<DirectionField value="ĐN view hồ" onChange={onChange} disabled />);
    await userEvent.setup().selectOptions(select, 'Đông');
    expect(onChange).not.toHaveBeenCalled();
  });
});
