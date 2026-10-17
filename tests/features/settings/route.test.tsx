import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { route } from '@/features/settings/route';

const state = vi.hoisted(() => ({ account: null as unknown }));
vi.mock('@/data/hooks', () => ({ useCustomers: () => [], useRepositoryAccount: () => state.account }));
vi.mock('@/features/settings/campaign-costs', () => ({ CampaignCostsSection: () => null }));
vi.mock('@/app/session', () => ({ useAppSession: () => ({ session: null }) }));
vi.mock('@/app/theme', () => ({
  THEME_OPTIONS: [],
  useThemePref: () => ['system', vi.fn()],
}));
vi.mock('@/ui', async () => {
  const actual = await vi.importActual<typeof import('@/ui')>('@/ui');
  return { ...actual, useToast: () => vi.fn() };
});

describe('settings route', () => {
  beforeEach(() => {
    state.account = null;
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  });

  it('retries locally saved settings when connectivity returns', async () => {
    const saveZaloTemplatesRemote = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const saveAiSettingsRemote = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    state.account = {
      sync: { local: { userId: 'u1' } },
      remote: {
        getZaloTemplatesRemote: vi.fn().mockResolvedValue([]),
        getAiSettingsRemote: vi.fn().mockResolvedValue({}),
        saveZaloTemplatesRemote,
        saveAiSettingsRemote,
      },
    };
    render(route.element);
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu cài đặt' }));
    await screen.findByText('Đã lưu trên thiết bị; đồng bộ sẽ thử lại khi có mạng.');
    expect(saveZaloTemplatesRemote).toHaveBeenCalledTimes(1);

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    fireEvent(window, new Event('online'));
    await waitFor(() => expect(saveZaloTemplatesRemote).toHaveBeenCalledTimes(2));
    await screen.findByText('Đã đồng bộ cài đặt đã lưu trên thiết bị.');
    expect(saveAiSettingsRemote).toHaveBeenCalledTimes(2);
  });
});
