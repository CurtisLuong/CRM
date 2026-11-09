import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { ProfileAdvanced } from '@/features/profile/advanced';
import { CustomerClosure, CustomerInterests } from '@/features/profile/memory';
import { ProfileNeedsFields } from '@/features/profile/needs';
import { ToastProvider } from '@/ui';

const customer = {
  id: 'c',
  owner_id: 'u',
  full_name: 'Lan',
  phone: '0901234567',
  advanced: { capital: 1_250_000_000, unknown: { keep: true } },
} as Customer;

describe('MN-01 các màn hồ sơ', () => {
  it('Tài sản dùng ô tiền chung và chỉ phát khoá tiền được sửa', () => {
    const save = vi.fn();
    render(<ProfileAdvanced customer={customer} writable onSaveAdvanced={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nâng cao' }));
    const input = screen.getByLabelText('Vốn hiện có') as HTMLInputElement;
    expect(input.value).toBe('1,25');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(save).not.toHaveBeenCalled();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.blur(input);
    expect(save).toHaveBeenCalledExactlyOnceWith('capital', 500_000_000);
    expect(customer.advanced?.unknown).toEqual({ keep: true });
  });

  it('ngân sách đợt mới lưu đồng và giữ nguyên các đợt cũ', async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    const interests = [{ id: 'old', project: 'Dự án cũ', status: 'open', budget_max: 1_200_000_000, x_keep: 1 }];
    render(<CustomerInterests customer={{ ...customer, interests } as Customer} writable onSave={save} now={0} />);
    expect(screen.getByText('Ngân sách tối đa: 1,2 tỷ')).toBeTruthy();
    await user.type(screen.getByLabelText('Dự án quan tâm mới'), 'Đợt mới');
    await user.type(screen.getByLabelText('Ngân sách đợt mới'), '1250');
    await user.click(screen.getByRole('button', { name: 'Thêm đợt' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        interests: [interests[0], expect.objectContaining({ budget_max: 1_250_000_000 })],
      }),
      'Đã thêm đợt quan tâm',
    );
  });

  it('ngân sách không hợp lệ chặn thêm đợt, sửa lại thì mở nút', () => {
    render(<CustomerInterests customer={customer} writable onSave={vi.fn()} now={0} />);
    fireEvent.change(screen.getByLabelText('Dự án quan tâm mới'), { target: { value: 'Mới' } });
    const input = screen.getByLabelText('Ngân sách đợt mới');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    expect((screen.getByRole('button', { name: 'Thêm đợt' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '500' } });
    expect((screen.getByRole('button', { name: 'Thêm đợt' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('ngân sách liên hệ lại patch đúng trường, giữ các thuộc tính lạ', () => {
    const save = vi.fn();
    render(
      <CustomerClosure
        customer={{ ...customer, retarget_hint: { max_price: 1_200_000_000, note: 'Giữ', x: 1 } }}
        writable
        onSave={save}
        now={0}
      />,
    );
    const input = screen.getByLabelText('Ngân sách tối đa') as HTMLInputElement;
    expect(input.value).toBe('1,2');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(save).not.toHaveBeenCalled();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.blur(input);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ retarget_hint: { max_price: 1_500_000_000, note: 'Giữ', x: 1 } }),
    );
  });

  it('giá căn giữ ước tính điền sẵn; không tự lưu; sửa theo triệu và xoá về ước tính', async () => {
    const save = vi.fn();
    function Form() {
      const [row, setRow] = useState(customer);
      return (
        <ToastProvider>
          <ProfileNeedsFields
            customer={row}
            writable
            busy={false}
            showEmpty
            stayVisible={new Set()}
            onSaveField={(key, value) => {
              save(key, value);
              setRow((prev) => ({ ...prev, [key]: value }));
            }}
            onSaveProjects={async () => true}
            catalog={null}
            online={false}
            projectsOpen={false}
            onToggleProjects={() => {}}
            estimate={{ total: 2_058_000_000, area: 68.6, pricePerM2: 30_000_000 }}
          />
        </ToastProvider>
      );
    }
    const user = userEvent.setup();
    render(<Form />);
    const input = screen.getByLabelText('Giá căn') as HTMLInputElement;
    expect(input.value).toBe('2,202');
    await user.click(input);
    expect(input.value).toBe('2202,06');
    await user.tab();
    expect(save).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '2058');
    await user.tab();
    expect(save).toHaveBeenLastCalledWith('apt_price', 2_058_000_000);
    expect(input.value).toBe('2,058');
    await user.clear(input);
    await user.tab();
    expect(save).toHaveBeenLastCalledWith('apt_price', null);
    expect(input.value).toBe('2,202');
  });
});
