import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { customerBrief } from '@/domain/customer/brief';
import { parseRegistrationDate, registrationSourcePatch, splitBrief } from '@/features/profile/model';
import { route } from '@/features/profile/route';
import { ToastProvider } from '@/ui';

let customer: Customer;
const update = vi.fn();
const account = {
  sync: { local: { userId: 'u1' }, isOnline: () => false },
  customers: { update },
  remote: { listDocuments: async () => [] },
};
vi.mock('@/data/hooks', () => ({ useCustomer: () => customer, useRepositoryAccount: () => account }));

async function mountRegistration() {
  render(
    <MemoryRouter>
      <ToastProvider>{route.element}</ToastProvider>
    </MemoryRouter>,
  );
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Trí nhớ' }));
  const more = screen.queryByRole('button', { name: /^Mở rộng \(\d+\)$/ });
  if (more) fireEvent.click(more);
  fireEvent.click(screen.getByRole('button', { name: 'Nâng cao' }));
  return within(screen.getByRole('group', { name: 'Đăng ký' }));
}

beforeEach(() => {
  update.mockReset().mockResolvedValue(undefined);
  customer = {
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Khách thử',
    phone: '0901234567',
    source: ['facebook_ads', 'zalo'],
    intake_method: 'manual',
    campaign: 'Đợt cũ',
    registered_at: new Date(2026, 10, 7, 8, 15).toISOString(),
    notes: { text: 'Ghi cũ', unknown: 'giữ lại' } as unknown as string,
  } as Customer;
});

describe('KB-04 — bỏ vướng mắc và sửa Đăng ký theo trường', () => {
  it.each([{}, { pain_points: 'Ngại khoản vay' }])('splitBrief bỏ objection khỏi cả hai phần: %j', (advanced) => {
    const brief = customerBrief({ ...customer, advanced });
    expect(brief.some((item) => item.key === 'objection')).toBe(true);
    const { known, missing } = splitBrief(brief);
    expect([...known, ...missing].some((item) => item.key === 'objection')).toBe(false);
  });

  it('chọn nguồn đã lưu lên đầu, giữ mã lạ và chỉ patch source', async () => {
    const fields = await mountRegistration();
    expect(fields.getByLabelText('Nguồn').textContent).not.toContain('facebook_ads');
    expect(fields.getByLabelText('Nguồn').textContent).not.toContain('zalo');
    fireEvent.change(fields.getByLabelText('Nguồn'), { target: { value: 'zalo' } });
    await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith('c1', { source: ['zalo', 'facebook_ads'] }));
    expect(registrationSourcePatch(['facebook_ads', 'zalo', 'legacy_unknown'], 'zalo')).toEqual({
      source: ['zalo', 'facebook_ads', 'legacy_unknown'],
    });
  });

  it('Chiến dịch lưu khi rời ô, patch chỉ campaign; không ghi object ghi chú cũ', async () => {
    const fields = await mountRegistration();
    fireEvent.blur(fields.getByLabelText('Ghi chú đăng ký'));
    fireEvent.blur(fields.getByLabelText('Ngày đăng ký'));
    expect(update).not.toHaveBeenCalled();
    const campaign = fields.getByLabelText('Chiến dịch');
    fireEvent.change(campaign, { target: { value: 'Đợt mới' } });
    expect(update).not.toHaveBeenCalled();
    fireEvent.blur(campaign);
    await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith('c1', { campaign: 'Đợt mới' }));
  });

  it('Cách nhập bị khoá, không có đường ghi dù phát sự kiện thay đổi', async () => {
    const fields = await mountRegistration();
    const intake = fields.getByLabelText('Cách nhập') as HTMLInputElement;
    expect(intake.disabled).toBe(true);
    expect(intake.value).toBe('Nhập tay');
    fireEvent.change(intake, { target: { value: 'api' } });
    fireEvent.blur(intake);
    expect(update).not.toHaveBeenCalled();
  });

  it('ô trống vẫn hiện; Cách nhập thiếu thì ẩn', async () => {
    customer = { ...customer, source: [], intake_method: null, campaign: null, notes: null, registered_at: null };
    const fields = await mountRegistration();
    for (const label of ['Nguồn', 'Chiến dịch', 'Ngày đăng ký', 'Ghi chú đăng ký'])
      expect(fields.getByLabelText(label)).toBeTruthy();
    expect(fields.queryByLabelText('Cách nhập')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('khách nhóm chỉ sửa Ghi chú đăng ký theo quyền hiện có', async () => {
    customer = { ...customer, owner_id: 'u2' };
    const fields = await mountRegistration();
    for (const label of ['Nguồn', 'Chiến dịch', 'Ngày đăng ký', 'Cách nhập'])
      expect((fields.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    const notes = fields.getByLabelText('Ghi chú đăng ký') as HTMLTextAreaElement;
    expect(notes.disabled).toBe(false);
    expect(notes.value).toBe('Ghi cũ');
    fireEvent.change(notes, { target: { value: 'Nội dung sửa' } });
    fireEvent.blur(notes);
    await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith('c1', { notes: 'Nội dung sửa' }));
  });

  it('hồ sơ lưu trữ khoá toàn bộ ô đăng ký', async () => {
    customer = { ...customer, archived_at: '2026-11-10T01:00:00Z' };
    const fields = await mountRegistration();
    for (const label of ['Nguồn', 'Chiến dịch', 'Ngày đăng ký', 'Ghi chú đăng ký'])
      expect((fields.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
  });

  it('ngày đăng ký hiển thị Việt Nam, chặn ngày sai, chỉ ghi registered_at', async () => {
    const fields = await mountRegistration();
    const date = fields.getByLabelText('Ngày đăng ký') as HTMLInputElement;
    expect(date.value).toBe('08:15 07/11/2026');
    fireEvent.change(date, { target: { value: '08:15 31/02/2026' } });
    fireEvent.blur(date);
    expect(fields.getByRole('alert').textContent).toContain('Nhập giờ và ngày hợp lệ');
    expect(update).not.toHaveBeenCalled();
    fireEvent.change(date, { target: { value: '14:30 10/11/2026' } });
    fireEvent.blur(date);
    await waitFor(() =>
      expect(update).toHaveBeenCalledExactlyOnceWith('c1', {
        registered_at: new Date(2026, 10, 10, 14, 30).toISOString(),
      }),
    );
  });

  it('xoá ngày được; sai giờ/ngày không ghi', async () => {
    expect(parseRegistrationDate('')).toBeNull();
    for (const invalid of ['24:00 10/11/2026', '09:60 10/11/2026', '09:00 29/02/2026', '2026-11-10'])
      expect(parseRegistrationDate(invalid)).toBeUndefined();
    expect(parseRegistrationDate('09:00 29/02/2028')).toBe(new Date(2028, 1, 29, 9).toISOString());
  });

  it('lưu lỗi báo như ô hồ sơ khác', async () => {
    update.mockRejectedValue(new Error('Lỗi lưu thử'));
    const fields = await mountRegistration();
    fireEvent.change(fields.getByLabelText('Chiến dịch'), { target: { value: 'Đợt mới' } });
    fireEvent.blur(fields.getByLabelText('Chiến dịch'));
    expect(await screen.findByText('Chưa lưu được')).toBeTruthy();
    expect(customer.campaign).toBe('Đợt cũ');
  });
});
