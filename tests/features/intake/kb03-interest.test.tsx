import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { defaultIntakeValues, toCustomerPayload } from '@/features/intake/model';
import { route } from '@/features/intake/route';
import { IntakeSchema } from '@/features/intake/schema';

vi.mock('@/data/hooks', () => ({ useCustomers: () => [], useRepositoryAccount: () => null }));
const parsed = (stage = 'Đang chăm sóc', qualify = false) =>
  IntakeSchema.parse({
    ...defaultIntakeValues(),
    full_name: 'Khách thử',
    phone: '0901234567',
    care_stage: stage,
    qualify_now: qualify,
    interest_level: 85,
  });
const customer = (level: number, stage = 'Đang chăm sóc') =>
  ({
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Khách thử',
    phone: '0901234567',
    qualified_at: '2026-11-10T01:00:00Z',
    care_stage: stage,
    interest_level: level,
  }) as Customer;

describe('KB-03 — form bỏ mức quan tâm', () => {
  it.each([false, true])('khách mới luôn 20, kể cả Đạt khi nhập = %s', (qualify) => {
    expect(toCustomerPayload(parsed('Đang chăm sóc', qualify))).toHaveProperty('interest_level', 20);
  });
  it('không có ô mức quan tâm hay thanh trượt, kể cả khi tick Đạt', () => {
    render(
      <RouterProvider
        router={createMemoryRouter([{ path: '/intake', element: route.element }], { initialEntries: ['/intake'] })}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Đã nói chuyện/ }));
    expect(screen.queryByText(/Mức quan tâm|%/)).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });
  it.each([
    [70, 'Đang chăm sóc', 'Nuôi dài hạn', 20],
    [25, 'Đang chăm sóc', 'Nuôi dài hạn', undefined],
    [60, 'Đang chăm sóc', 'Loại', 0],
    [0, 'Loại', 'Đang chăm sóc', 20],
    [85, 'Đang chăm sóc', 'Xem dự án', undefined],
    [40, 'Đang chăm sóc', 'Đang chăm sóc', undefined],
  ] as const)('sửa khách %s, %s → %s: patch mức %s', (level, from, to, expected) => {
    const patch = toCustomerPayload(parsed(to), customer(level, from));
    if (expected === undefined) expect(patch).not.toHaveProperty('interest_level');
    else expect(patch).toHaveProperty('interest_level', expected);
  });
});
