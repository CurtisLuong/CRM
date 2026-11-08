import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import {
  CustomerHousehold,
  CustomerInterests,
  CustomerNeedsAdvanced,
  FactFreshnessSection,
} from '@/features/profile/memory';

const customer = { id: 'ui03a', owner_id: 'u1', full_name: 'Khách mẫu', phone: '0901234567' } as Customer;
const now = new Date('2026-11-08T02:30:00Z').getTime();
const props = { customer, writable: true, onSave: vi.fn(), now };

describe('UI-03a — khu hồ sơ', () => {
  it('Nhu cầu theo đợt và Người cùng quyết định đứng riêng có thẻ, đặt trong Nâng cao dùng cùng thẻ cha', async () => {
    const standalone = render(
      <>
        <CustomerInterests {...props} />
        <CustomerHousehold {...props} />
      </>,
    );
    expect(screen.getByLabelText('Dự án quan tâm mới').closest('[data-form-card]')).not.toBeNull();
    expect(screen.getByLabelText('Tên người cùng quyết định').closest('[data-form-card]')).not.toBeNull();
    standalone.unmount();
    render(<CustomerNeedsAdvanced {...props} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nâng cao' }));
    const card = screen.getByRole('button', { name: 'Nâng cao' }).closest('[data-form-card]') as HTMLElement;
    expect(card.querySelectorAll('[data-form-card]')).toHaveLength(0);
    expect(within(card).getByRole('heading', { name: 'Nhu cầu theo đợt' })).toBeTruthy();
    expect(within(card).getByRole('heading', { name: 'Người cùng quyết định' })).toBeTruthy();
  });

  it('Nguồn và độ mới có thẻ khi được gọi, chỉ đọc và dùng nhãn tiếng Việt', () => {
    render(
      <FactFreshnessSection
        customer={{
          ...customer,
          field_meta: { income: { at: new Date(now).toISOString(), by: 'customer', confirmed: true } },
        }}
        now={now}
      />,
    );
    const heading = screen.getByRole('heading', { name: 'Nguồn và độ mới của dữ kiện' });
    const card = heading.parentElement?.querySelector('[data-form-card]') as HTMLElement;
    expect(within(card).getByText(/Thu nhập: Khách khai/)).toBeTruthy();
    expect(within(card).queryAllByRole('textbox')).toHaveLength(0);
  });
});
