import { describe, expect, it } from 'vitest';
import { HEALTH_STALE_TEXT } from '@/config/integrations';
import type { IntegrationHealth, IntegrationHealthState } from '@/data/hooks';
import { metaLeadAdsAlert } from '@/features/leads/model';

const NOW = new Date('2026-10-19T10:31:00+07:00').getTime();

function row(overrides: Partial<IntegrationHealth> = {}): IntegrationHealth {
  return {
    id: 'meta_lead_ads',
    owner_id: 'owner-1',
    status: 'ok',
    message: null,
    token_expires_at: null,
    last_lead_at: null,
    last_webhook_at: null,
    pending_count: 0,
    stuck_count: 0,
    details: {},
    checked_at: '2026-10-19T10:05:00+07:00',
    ...overrides,
  };
}

const ready = (overrides: Partial<IntegrationHealth> = {}): IntegrationHealthState => ({
  state: 'ready',
  row: row(overrides),
});

describe('Khách mới Facebook Lead Ads warning', () => {
  it('stays silent when the row was not read (none/offline/error/loading)', () => {
    for (const state of ['none', 'offline', 'error', 'loading'] as const) {
      expect(metaLeadAdsAlert({ state, row: null }, NOW)).toBeNull();
    }
  });

  it('stays silent for a fresh ok connection', () => {
    expect(metaLeadAdsAlert(ready(), NOW)).toBeNull();
  });

  it('shows a warning with the worker message and the exact Settings link target', () => {
    expect(
      metaLeadAdsAlert(
        ready({
          status: 'error',
          message: 'Token Facebook đã hết hạn.',
          stuck_count: 2,
        }),
        NOW,
      ),
    ).toEqual({ text: 'Kết nối Facebook: Token Facebook đã hết hạn.', tone: 'danger' });
    expect(metaLeadAdsAlert(ready({ status: 'warning', message: null }), NOW)).toEqual({
      text: 'Kết nối Facebook: Cần chú ý',
      tone: 'warning',
    });
  });

  it('treats stale ok data as a warning (31 minutes vs 26 minutes)', () => {
    expect(metaLeadAdsAlert(ready({ checked_at: '2026-10-19T10:05:00+07:00' }), NOW)).toBeNull();
    expect(metaLeadAdsAlert(ready({ checked_at: '2026-10-19T10:00:00+07:00' }), NOW)).toEqual({
      text: `Kết nối Facebook: ${HEALTH_STALE_TEXT}`,
      tone: 'warning',
    });
  });

  it('keeps the warning message and appends the stale sentence', () => {
    expect(
      metaLeadAdsAlert(
        ready({
          status: 'warning',
          message: 'Webhook chưa bật.',
          checked_at: '2026-10-19T10:00:00+07:00',
        }),
        NOW,
      ),
    ).toEqual({
      text: `Kết nối Facebook: Webhook chưa bật. · ${HEALTH_STALE_TEXT}`,
      tone: 'warning',
    });
  });
});
