import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IncomeField, MoneyField } from '@/components/crm/money-field';

describe('MN-01 ô tiền dùng chung', () => {
  it('giữ chọn toàn bộ khi focus đổi tỷ thành triệu để thao tác dán thay cả số', () => {
    render(<MoneyField label="Vốn" value={1_250_000_000} />);
    const input = screen.getByLabelText('Vốn') as HTMLInputElement;
    input.setSelectionRange(0, input.value.length);
    fireEvent.focus(input);
    expect(input.value).toBe('1250');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(4);
  });

  it('mở tiền cũ theo tỷ, focus về triệu, không sửa thì không ghi kể cả khi hiển thị làm tròn', async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    render(<MoneyField label="Vốn" value={1_234_567_890} onCommit={save} />);
    const input = screen.getByLabelText('Vốn');
    expect((input as HTMLInputElement).value).toBe('1,235');
    expect(screen.getByText('tỷ')).toBeTruthy();
    await user.click(input);
    expect((input as HTMLInputElement).value).toBe('1234,56789');
    expect(screen.getByText('triệu')).toBeTruthy();
    await user.tab();
    expect(save).not.toHaveBeenCalled();
  });

  it('nhập 500/1250 triệu, blur đổi đơn vị, focus trở lại và xoá về null', async () => {
    const save = vi.fn();
    function Form() {
      const [value, setValue] = useState<number | null>(null);
      return (
        <MoneyField
          label="Vốn"
          value={value}
          onCommit={(amount) => {
            setValue(amount);
            save(amount);
          }}
        />
      );
    }
    render(<Form />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Vốn') as HTMLInputElement;
    await user.type(input, '500');
    await user.tab();
    expect(save).toHaveBeenLastCalledWith(500_000_000);
    expect(input.value).toBe('500');
    expect(screen.getByText('triệu')).toBeTruthy();
    await user.clear(input);
    await user.type(input, '1250');
    await user.tab();
    expect(save).toHaveBeenLastCalledWith(1_250_000_000);
    expect(input.value).toBe('1,25');
    expect(screen.getByText('tỷ')).toBeTruthy();
    await user.click(input);
    expect(input.value).toBe('1250');
    await user.clear(input);
    await user.tab();
    expect(save).toHaveBeenLastCalledWith(null);
  });

  it('không nhận chữ, báo lỗi sau blur; sửa lại bằng dấu phẩy thì lưu được', () => {
    const save = vi.fn();
    const change = vi.fn();
    render(<MoneyField label="Vốn" value={null} onChange={change} onCommit={save} />);
    const input = screen.getByLabelText('Vốn');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Nhập số triệu');
    expect((input as HTMLInputElement).value).toBe('abc');
    expect(change).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '0,5' } });
    fireEvent.blur(input);
    expect(save).toHaveBeenLastCalledWith(500_000);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('không ghi khi chỉ đổi cách gõ thành dấu nghìn', () => {
    const save = vi.fn();
    render(<MoneyField label="Vốn" value={1_250_000_000} onCommit={save} />);
    const input = screen.getByLabelText('Vốn');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.250' } });
    fireEvent.blur(input);
    expect(save).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('1,25');
  });

  it('form cập nhật số đồng khi gõ, giữ nguyên bản gõ khi parent render lại', async () => {
    function Form() {
      const [value, setValue] = useState<number | null>(null);
      return <MoneyField label="Ngân sách" value={value} onChange={setValue} />;
    }
    const user = userEvent.setup();
    render(<Form />);
    const input = screen.getByLabelText('Ngân sách') as HTMLInputElement;
    await user.type(input, '1.250');
    expect(input.value).toBe('1.250');
    await user.tab();
    expect(input.value).toBe('1,25');
  });

  it('thu nhập 25tr không tự chuẩn hoá; 30 lưu đúng chuỗi', async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    render(<IncomeField label="Thu nhập" value="25tr" onCommit={save} />);
    const input = screen.getByLabelText('Thu nhập') as HTMLInputElement;
    expect(input.value).toBe('25');
    expect(screen.getByText('triệu/tháng')).toBeTruthy();
    await user.click(input);
    await user.tab();
    expect(save).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '30');
    await user.tab();
    expect(save).toHaveBeenLastCalledWith('30 triệu/tháng');
  });

  it('giữ nguyên chữ thu nhập không hiểu được tới khi người dùng nhập lại', async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<IncomeField label="Thu nhập" value="lương cứng + hoa hồng" onCommit={save} />);
    const input = screen.getByLabelText('Thu nhập') as HTMLInputElement;
    expect(input.value).toBe('lương cứng + hoa hồng');
    expect(screen.getByText('Chưa đọc được số — nhập lại theo triệu/tháng')).toBeTruthy();
    await user.click(input);
    await user.tab();
    expect(save).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '1250');
    await user.tab();
    expect(save).toHaveBeenLastCalledWith('1250 triệu/tháng');
    rerender(<IncomeField label="Thu nhập" value="1250 triệu/tháng" onCommit={save} />);
    expect(input.value).toBe('1,25');
    expect(screen.getByText('tỷ/tháng')).toBeTruthy();
  });
});
