import { render, screen, fireEvent as tl03FireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cloneElement, type ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { readPrefill } from '@/features/loan/model';
import { type PriceEstimate, profileLoan } from '@/features/profile/model';
import { route } from '@/features/profile/route';
import { ToastProvider } from '@/ui';

// Curtis 06/11: thẻ Giá & vay trên hàng tab (thay nút trong tab + tab Tính vay);
// "Nâng cao" là lớp thông tin dưới "Mở rộng" — ô cơ bản đủ thì Nâng cao hiện ngay.

const estimate: PriceEstimate = { total: 2_058_000_000, area: 68.6, pricePerM2: 30_000_000 };
// Curtis 06/11 (sau PR-02): Giá căn = Giá dự kiến = thuần 2.058.000.000 + VAT 5% 102.900.000 + KPBT 2% 41.160.000
// (+ phí 0) = 2.202.060.000. Số vay vẫn 70% × (thuần + VAT) = 1.512.630.000.

describe('profileLoan', () => {
  it('chưa nhập giá: dùng giá ước tính, vay 70% giá gồm VAT 5%, mang diện tích + đơn giá sang máy tính vay', () => {
    const info = profileLoan({ id: 'c1', projects: ['Marquee Homes'] } as Customer, estimate);
    expect(info).toMatchObject({ price: 2_202_060_000, manual: false, ltv: 70 });
    expect(info.loan).toBe(Math.round(2_058_000_000 * 1.05 * 0.7));
    expect(info.prefill).toEqual({
      customerId: 'c1',
      projectName: 'Marquee Homes',
      area: 68.6,
      pricePerM2: 30_000_000,
    });
  });

  // Giá căn anh nhập là giá dự kiến (gồm VAT 5% + KPBT 2% + phí): 2,2 tỷ → thuần 2.200.000.000 / 1,07 = 2.056.074.766;
  // vay 70% × (thuần + VAT 102.803.738) = 1.511.214.953; máy tính vay nhận giá thuần.
  it('đã nhập giá căn: giá nhập ghi đè ước tính, tách ra giá thuần gửi sang máy tính vay', () => {
    const info = profileLoan({ id: 'c1', apt_price: 2_200_000_000 } as Customer, estimate);
    expect(info).toMatchObject({ price: 2_200_000_000, manual: true });
    expect(info.loan).toBe(1_511_214_953);
    expect(info.prefill.netOverride).toBe(2_056_074_766);
  });

  it('có phí căn: giá dự kiến cộng phí, số vay không gồm phí', () => {
    const rates = { vatRate: 5, kpbtRate: 2, fee: 30_000_000 };
    const info = profileLoan({ id: 'c1' } as Customer, estimate, rates);
    expect(info.price).toBe(2_232_060_000);
    expect(info.loan).toBe(1_512_630_000);
    const typed = profileLoan({ id: 'c1', apt_price: 2_232_060_000 } as Customer, estimate, rates);
    expect(typed.prefill.netOverride).toBe(2_058_000_000);
  });

  it('thiếu dữ liệu: không có số', () => {
    expect(profileLoan({ id: 'c1' } as Customer, { missing: 'area' })).toMatchObject({ price: null, loan: null });
  });
});

let customer: Customer;
const account = {
  sync: { local: { userId: 'u1' }, isOnline: () => false },
  customers: { update: vi.fn() },
  remote: { listDocuments: async () => [] },
  catalog: {
    projects: () => [{ id: 'p1', name: 'Marquee Homes' }],
    load: vi.fn(async () => true),
    onChange: vi.fn(() => () => {}),
    projectByName: (name: unknown) =>
      name === 'Marquee Homes' ? { id: 'p1', typical_price_per_m2: 30_000_000 } : null,
    buildingByCode: () => null,
    unitByCode: () => null,
    unitPrice: () => null,
    buildingPrice: () => null,
    projectPrice: (p: { typical_price_per_m2?: number }) => p?.typical_price_per_m2 ?? null,
  },
};
vi.mock('@/data/hooks', () => ({
  useCustomer: () => customer,
  useRepositoryAccount: () => account,
}));

function LoanProbe() {
  const location = useLocation();
  return <output aria-label="Trang vay">{location.search}</output>;
}

// TL-03 (09/11): tab mở sẵn là Dòng thời gian → chuyển sang "Nhu cầu & căn" trước (Radix kích hoạt tab khi mousedown).
const wrap = () => {
  const view = render(
    <MemoryRouter initialEntries={['/ho-so/c1']}>
      <ToastProvider>
        <Routes>
          <Route path="/ho-so/:id" element={cloneElement(route.element as ReactElement)} />
          <Route path="/tinh-vay" element={<LoanProbe />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
  const tab = screen.getByRole('tab', { name: 'Nhu cầu & căn' });
  tl03FireEvent.mouseDown(tab);
  tl03FireEvent.click(tab);
  return view;
};

const base = (overrides: Partial<Customer> = {}) =>
  ({
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Nguyễn Lan',
    phone: '0901234567',
    contact_prefs: {},
    projects: ['Marquee Homes'],
    apt_area: 68.6,
    ...overrides,
  }) as Customer;

beforeEach(() => {
  customer = base();
});

describe('thẻ Giá & vay', () => {
  it('nằm ngay trước hàng tab; không còn tab Tính vay và nút trong tab Nhu cầu', () => {
    wrap();
    const card = screen.getByRole('region', { name: 'Giá và vay' });
    // MN-01 (09/11): định dạng tiền chung giữ tối đa 3 số lẻ (2,202 tỷ thay vì 2,2 tỷ).
    expect(card.textContent).toContain('≈ 2,202 tỷ');
    expect(card.textContent).toContain('Vay 70%');
    expect(card.textContent).toContain('≈ 1,513 tỷ');
    expect(card.textContent).toContain('Giá ước tính');
    const tabs = screen.getByRole('tablist', { name: 'Nội dung hồ sơ khách' });
    expect(card.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Tính vay' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tính vay cho khách này' })).toBeNull();
  });

  it('giá anh nhập ghi đè; bấm Tính vay mở máy tính vay với giá đó', async () => {
    customer = base({ apt_price: 2_200_000_000 });
    const user = userEvent.setup();
    wrap();
    const card = screen.getByRole('region', { name: 'Giá và vay' });
    expect(card.textContent).toContain('≈ 2,2 tỷ');
    expect(card.textContent).toContain('Giá anh nhập');
    await user.click(screen.getByRole('button', { name: 'Tính vay' }));
    const search = screen.getByRole('status', { hidden: true }).textContent ?? '';
    expect(readPrefill(new URLSearchParams(search))).toMatchObject({
      customerId: 'c1',
      area: 68.6,
      netOverride: 2_056_074_766,
    });
  });
});

describe('Nâng cao dưới Mở rộng', () => {
  it('ô cơ bản còn trống: Nâng cao ẩn tới khi bấm Mở rộng, hiện ở cuối', async () => {
    const user = userEvent.setup();
    wrap();
    expect(screen.queryByRole('button', { name: 'Nâng cao' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Mở rộng \(\d+\)$/ }));
    expect(screen.getByRole('button', { name: 'Nâng cao' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'Trí nhớ' }));
    expect(screen.queryByRole('button', { name: 'Nâng cao' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Mở rộng \(\d+\)$/ }));
    expect(screen.getByRole('button', { name: 'Nâng cao' })).toBeTruthy();
  });

  it('ô cơ bản Nhu cầu đã đủ: không có Mở rộng, Nâng cao hiện ngay', () => {
    customer = base({
      purpose: 'Ở',
      apt_type: '2N-2WC',
      building_code: 'A1',
      apt_code: '1201',
      apt_direction: 'Đông Nam',
      apt_floor: 12,
    });
    wrap();
    expect(screen.queryByRole('button', { name: /^Mở rộng \(\d+\)$/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Nâng cao' })).toBeTruthy();
  });
});
