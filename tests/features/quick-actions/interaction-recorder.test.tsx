import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { InteractionRecorder } from '@/features/quick-actions/interactions';
import { actionStore, clearQuickAction } from '@/features/quick-actions/store';
import { ToastProvider } from '@/ui';

const customer = {
  id: 'quick-call-1',
  owner_id: 'owner-1',
  full_name: 'Khách thử',
  phone: '0901234567',
} as Customer;

const account = {
  customers: { update: async () => customer },
  sync: { local: { userId: 'owner-1', isClosed: false }, isOnline: () => false },
} as never;

afterEach(() => {
  cleanup();
  clearQuickAction();
});

describe('InteractionRecorder call action', () => {
  it('opens the outcome action for this customer from the interaction row', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <InteractionRecorder account={account} customer={customer} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Đã gọi' }));

    expect(actionStore.get()).toMatchObject({ customerId: customer.id, kind: 'outcome' });
  });

  it('can hide the call action when rendered inside the call outcome sheet', () => {
    render(
      <ToastProvider>
        <InteractionRecorder account={account} customer={customer} showCallAction={false} />
      </ToastProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Đã gọi' })).toBeNull();
  });

  it('opens the outcome action from the interaction sheet and is unavailable to other owners or archived customers', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ToastProvider>
        <InteractionRecorder account={account} customer={customer} trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Ghi tương tác' }));
    await user.click(await screen.findByRole('button', { name: 'Đã gọi' }));
    expect(actionStore.get()).toMatchObject({ customerId: customer.id, kind: 'outcome' });
    expect(screen.queryByRole('dialog', { name: /Ghi tương tác/ })).toBeNull();

    clearQuickAction();
    rerender(
      <ToastProvider>
        <InteractionRecorder account={account} customer={{ ...customer, owner_id: 'other' }} />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: 'Đã gọi' }).hasAttribute('disabled')).toBe(true);

    rerender(
      <ToastProvider>
        <InteractionRecorder account={account} customer={{ ...customer, archived_at: '2026-10-01' }} />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: 'Đã gọi' }).hasAttribute('disabled')).toBe(true);
  });
});
