import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { formatDobTyping, parseDobInput } from '@/features/profile/dob';
import { formatPriceTy, type PriceEstimate, parsePriceTy } from '@/features/profile/model';
import { ProfileNeedsFields } from '@/features/profile/needs';
import { ToastProvider } from '@/ui';

// Curtis 06/11: ngày sinh tự chèn "/" (bàn phím số không có "/"); Giá căn thành ô sửa được, trống thì điền sẵn ước tính.

describe('formatDobTyping', () => {
  it.each([
    ['03061998', '03/06/1998'],
    ['0306', '03/06'],
    ['030', '03/0'],
    ['03', '03'],
    ['03/', '03/'],
    ['3/6/1998', '03/06/1998'],
    ['15/08/1985', '15/08/1985'],
    ['0306199899', '03/06/1998'],
    ['', ''],
  ])('%s → %s', (raw, expected) => {
    expect(formatDobTyping(raw)).toBe(expected);
  });

  it('gõ từng số liền nhau ra đúng ngày lưu được', () => {
    let text = '';
    for (const digit of '03061998') text = formatDobTyping(text + digit);
    expect(text).toBe('03/06/1998');
    expect(parseDobInput(text, 2026).dob).toBe('1998-06-03');
  });
});

describe('giá theo tỷ', () => {
  it('đọc/ghi', () => {
    expect(formatPriceTy(2_058_000_000)).toBe('2,058');
    expect(parsePriceTy('2,06')).toBe(2_060_000_000);
    expect(parsePriceTy('2.06')).toBe(2_060_000_000);
    expect(parsePriceTy(' ')).toBeNull();
    expect(parsePriceTy('2 tỷ')).toBeUndefined();
    expect(parsePriceTy('0')).toBeUndefined();
  });
});

const estimate: PriceEstimate = { total: 2_058_000_000, area: 68.6, pricePerM2: 30_000_000 };

function Harness({
  start,
  onSave,
}: {
  start: Partial<Customer>;
  onSave: (key: keyof Customer, value: unknown) => void;
}) {
  const [row, setRow] = useState({ id: 'c1', owner_id: 'u', full_name: 'Lan', phone: '0900', ...start } as Customer);
  return (
    <ToastProvider>
      <ProfileNeedsFields
        customer={row}
        writable
        busy={false}
        showEmpty
        stayVisible={new Set()}
        onToggleSupplement={() => {}}
        onSaveField={(key, value) => {
          onSave(key, value);
          setRow((prev) => ({ ...prev, [key]: value }));
        }}
        onSaveProjects={async () => true}
        catalog={null}
        online={false}
        projectsOpen={false}
        onToggleProjects={() => {}}
        estimate={estimate}
      />
    </ToastProvider>
  );
}

describe('ô Giá căn (tỷ)', () => {
  it('chưa nhập: điền sẵn ước tính, mở/rời ô không ghi; sửa thì lưu VNĐ; xoá thì về ước tính', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness start={{ apt_area: 68.6 }} onSave={onSave} />);
    const input = screen.getByLabelText('Giá căn (tỷ)') as HTMLInputElement;
    expect(input.value).toBe('2,058');
    expect(screen.getByText('Ước tính · 68,6 m² × 30 triệu/m²')).toBeTruthy();
    await user.click(input);
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, '2,2');
    await user.tab();
    expect(onSave).toHaveBeenLastCalledWith('apt_price', 2_200_000_000);
    expect(input.value).toBe('2,2');
    expect(screen.getByText('Ước tính ≈ 2,06 tỷ')).toBeTruthy();

    await user.clear(input);
    await user.tab();
    expect(onSave).toHaveBeenLastCalledWith('apt_price', null);
    expect(input.value).toBe('2,058');
  });

  it('sai dạng: báo lỗi, không lưu', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness start={{ apt_area: 68.6 }} onSave={onSave} />);
    const input = screen.getByLabelText('Giá căn (tỷ)') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '2 tỷ');
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Nhập giá theo tỷ, ví dụ 2,06.')).toBeTruthy();
  });

  it('đã có giá căn từ form Thêm khách → hiện giá đó, không phải ước tính', () => {
    render(<Harness start={{ apt_area: 68.6, apt_price: 1_950_000_000 }} onSave={vi.fn()} />);
    expect((screen.getByLabelText('Giá căn (tỷ)') as HTMLInputElement).value).toBe('1,95');
  });
});
