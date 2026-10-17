import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CampaignCostsSection } from '@/features/settings/campaign-costs';

describe('campaign cost settings', () => {
  it('shows account requirement without exposing or changing costs when signed out', () => {
    render(<CampaignCostsSection customers={[]} account={null} />);
    expect(screen.getByRole('heading', { name: 'Chi phí campaign' })).toBeTruthy();
    expect(screen.getByText('Đăng nhập để quản lý chi phí theo tài khoản.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lưu chi phí' })).toBeNull();
  });
});
