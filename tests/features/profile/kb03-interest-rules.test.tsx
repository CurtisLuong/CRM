import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { useArchiveActions } from '@/features/profile/archive';
import { knownStats } from '@/features/profile/model';
import { route } from '@/features/profile/route';
import { formatSignalEvidence } from '@/features/today/model';
import { ToastProvider } from '@/ui';

let customer: Customer;
const update = vi.fn(async (_id: string, patch: Record<string, unknown>) => {
  customer = { ...customer, ...patch };
  return customer;
});
const account = {
  sync: { local: { userId: 'u1' }, isOnline: () => false },
  customers: { update },
  remote: { listDocuments: async () => [] },
};
vi.mock('@/data/hooks', () => ({ useCustomer: () => customer, useRepositoryAccount: () => account }));
beforeEach(() => {
  update.mockClear();
  customer = {
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Khách thử',
    phone: '0901234567',
    interest_level: 70,
    care_stage: 'Đang chăm sóc',
    qualified_at: '2026-11-10T01:00:00Z',
  } as Customer;
});

describe('KB-03 — hồ sơ, lưu trữ và khôi phục', () => {
  it.each([
    [70, 'Đang chăm sóc', 20],
    [25, 'Đang chăm sóc', undefined],
    [0, 'Loại', 20],
  ] as const)('hồ sơ: mức %s, bậc %s → Nuôi dài hạn ghi mức %s', async (level, stage, expected) => {
    customer = { ...customer, interest_level: level, care_stage: stage };
    render(
      <MemoryRouter>
        <ToastProvider>{route.element}</ToastProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Đổi bậc · / }));
    const sheet = within(screen.getByRole('dialog', { name: 'Đổi bậc khách' }));
    fireEvent.click(sheet.getByRole('radio', { name: 'Nuôi dài hạn' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Tiếp tục' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Xác nhận đổi bậc' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    const patch = update.mock.calls[0]?.[1];
    expect(patch).toMatchObject({ care_stage: 'Nuôi dài hạn' });
    if (expected === undefined) expect(patch).not.toHaveProperty('interest_level');
    else expect(patch).toHaveProperty('interest_level', expected);
  });

  it.each([40, 70])('lưu trữ mức %s → 0; Hoàn tác trả đúng số cũ', async (level) => {
    customer = { ...customer, interest_level: level };
    const { result } = renderHook(() => useArchiveActions(customer));
    await act(async () => {
      await result.current.run(true, 'so_sai');
    });
    expect(update.mock.calls[0]?.[1]).toMatchObject({ archived_at: expect.any(String), interest_level: 0 });
    await act(async () => {
      result.current.notice?.onUndo?.();
    });
    expect(update.mock.calls[1]?.[1]).toMatchObject({ archived_at: null, interest_level: level });
    expect(customer.interactions?.map((item) => item?.kind)).toEqual(['restored', 'archived']);
  });

  it('khôi phục Nguội từ lưu trữ → 20 bằng bản ghi đầy đủ', async () => {
    customer = { ...customer, archived_at: '2026-11-09T01:00:00Z', interest_level: 0 };
    const { result } = renderHook(() => useArchiveActions(customer));
    await act(async () => {
      await result.current.run(false);
    });
    expect(update.mock.calls[0]?.[1]).toMatchObject({ archived_at: null, interest_level: 20 });
  });

  it.each([
    [{ interest_level: undefined }, 'Lạnh'],
    [{ interest_level: 85, archived_at: '2026-11-09T01:00:00Z' }, 'Nguội'],
    [{ interest_level: 85, disqualified_at: '2026-11-09T01:00:00Z' }, 'Nguội'],
    [{ interest_level: 85, care_stage: 'Loại' }, 'Nguội'],
  ])('Đã biết luôn có mức đúng với trạng thái %j', (patch, label) => {
    customer = { ...customer, ...patch };
    render(
      <MemoryRouter>
        <ToastProvider>{route.element}</ToastProvider>
      </MemoryRouter>,
    );
    const known = within(screen.getByRole('region', { name: 'Đã biết' }));
    expect(known.getByText('Mức quan tâm')).toBeTruthy();
    expect(known.getByText(label)).toBeTruthy();
    expect(knownStats(customer, Date.now())).toContainEqual({ label: 'Mức quan tâm', value: label });
    expect(formatSignalEvidence([{ field: 'interest_level', value: 85 }], customer)).toEqual([
      `Mức quan tâm: ${label}`,
    ]);
  });

  it('chọn Lạnh khi chưa có số không ghi giá trị mới', () => {
    customer = { ...customer, interest_level: undefined };
    render(
      <MemoryRouter>
        <ToastProvider>{route.element}</ToastProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mức quan tâm: Lạnh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lạnh' }));
    expect(update).not.toHaveBeenCalled();
  });
});
