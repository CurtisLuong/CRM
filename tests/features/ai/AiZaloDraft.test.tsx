import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { AiZaloDraft } from '@/features/ai/AiZaloDraft';

const customer = {
  id: 'c1',
  owner_id: 'u1',
  full_name: 'Lan',
  phone: '0901234567',
  contact_prefs: { do_not_contact: true, dnc_reason: 'Khách yêu cầu dừng liên hệ' },
} as Customer;

describe('AiZaloDraft contact preference', () => {
  it('does not offer AI drafting for a do-not-contact customer', () => {
    render(<AiZaloDraft account={{} as RepositoryAccount} customer={customer} onDraft={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('Đã chặn tạo bản nháp Zalo');
    expect(screen.queryByRole('button', { name: 'Soạn bằng AI' })).toBeNull();
  });
});
