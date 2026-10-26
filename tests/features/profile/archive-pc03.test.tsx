import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/domain/customer';
import { isSaleTouch } from '@/domain/customer/interactions';
import { customerTimeline } from '@/domain/customer/timeline';
import { ArchiveCustomerSection } from '@/features/profile/archive';
import { timelineView } from '@/features/profile/model';
import { ToastProvider } from '@/ui';

const update = vi.fn();
const account = {
  sync: { local: { userId: 'u1' }, isOnline: () => false },
  customers: { update },
};
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => account }));

const base = (overrides: Partial<Customer> = {}) =>
  ({
    id: 'c1',
    owner_id: 'u1',
    full_name: 'Lan',
    phone: '0901234567',
    care_stage: 'Đang chăm sóc',
    care_stage_history: [{ at: '2026-10-26T02:00:00.000Z', stage: 'Đang chăm sóc' }],
    interactions: [{ kind: 'sent', at: '2026-10-25T02:00:00.000Z', channel: 'zalo', by: 'u1' }],
    ...overrides,
  }) as Customer;

const wrap = (customer: Customer) =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <ArchiveCustomerSection customer={customer} />
      </ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => update.mockReset().mockResolvedValue(undefined));

describe('PC-03 archive interactions', () => {
  it('requires a note for Khác, then archives with one patch preserving stage history', async () => {
    const user = userEvent.setup();
    const customer = base();
    wrap(customer);
    await user.click(screen.getByRole('button', { name: 'Lưu trữ khách…' }));
    const submit = screen.getByRole('button', { name: 'Lưu trữ khách' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lý do lưu trữ' }), 'khac');
    expect(submit).toHaveProperty('disabled', true);
    await user.type(screen.getByRole('textbox', { name: 'Ghi chú lý do lưu trữ' }), 'Nhập nhầm');
    expect(submit).toHaveProperty('disabled', false);
    await user.click(submit);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        archived_at: expect.any(String),
        interactions: [
          expect.objectContaining({ kind: 'archived', channel: 'other', reason: 'khac', note: 'Nhập nhầm', by: 'u1' }),
          ...(customer.interactions ?? []),
        ],
      }),
    );
    const archivePatch = update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(archivePatch).not.toHaveProperty('care_stage');
    expect(archivePatch).not.toHaveProperty('care_stage_history');
    expect(archivePatch).not.toHaveProperty('disqualify_reason');
  });

  it('undo restores with one patch and records a restored interaction', async () => {
    const user = userEvent.setup();
    wrap(base());
    await user.click(screen.getByRole('button', { name: 'Lưu trữ khách…' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lý do lưu trữ' }), 'so_sai');
    await user.click(screen.getByRole('button', { name: 'Lưu trữ khách' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tác' }));
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        archived_at: null,
        interactions: [
          expect.objectContaining({ kind: 'restored', channel: 'other', by: 'u1' }),
          expect.objectContaining({ kind: 'archived' }),
          expect.objectContaining({ kind: 'sent' }),
        ],
      }),
    );
  });

  it('archive events are not sale touches and stay top-level in chronological order', () => {
    expect(isSaleTouch({ kind: 'archived' } as never)).toBe(false);
    expect(isSaleTouch({ kind: 'restored' } as never)).toBe(false);
    const customer = base({
      interactions: [
        { at: '2026-10-26T04:00:00.000Z', kind: 'restored', channel: 'other', by: 'u1' },
        {
          at: '2026-10-26T03:00:00.000Z',
          kind: 'archived',
          channel: 'other',
          reason: 'so_sai',
          note: 'Nhập nhầm số',
          by: 'u1',
        },
      ],
    });
    const entries = customerTimeline(customer);
    const view = timelineView(entries, 'all');
    expect(view.ordered.map((item) => item.entry.title)).toEqual([
      'Khôi phục khách',
      'Lưu trữ khách · Số sai',
      'Bậc: Đang chăm sóc',
    ]);
    expect(view.ordered.slice(0, 2).every((item) => item.topLevel && !item.nested)).toBe(true);
    expect(entries.find((entry) => entry.title.startsWith('Lưu trữ khách'))?.detail).toBe('Nhập nhầm số');
  });
});
